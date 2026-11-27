import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import { getBusinessTodayIso } from "@/core/format";
import { assertDateNotLocked } from "@/modules/accounting/services/financial-lock-service";
import { postTransaction, reverseTransaction, type JournalLineInput } from "@/modules/accounting/services/posting-service";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { convertToBase, parseCurrencyAmountToMinor, proportionalCarryingRelease } from "@/modules/currency/conversion";
import { getCurrency } from "@/modules/currency/currency";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { receiptConfig } from "@/modules/receipts/receipt-service";
import { supplierPaymentConfig } from "@/modules/supplier-payments/supplier-payment-service";
import { getOpenState, postCreditAllocationFx } from "./settlement-service";
import { applyNoteCreditInputSchema, partyRefundInputSchema, type ApplyNoteCreditInput, type PartyRefundInput } from "./party-credit-input";

/**
 * Party credit held on credit notes (customers) and debit notes (suppliers).
 *
 * A note first settles its source document; whatever exceeds that document's
 * open balance (e.g. crediting a fully paid invoice) stays on the note as
 * unallocated credit. That credit can be applied to another open document of
 * the same party and currency, or refunded through a bank/cash account.
 *
 * Base amounts: the note's `base_total_minor` is what it moved in the AR/AP
 * control account. Allocations record how much of that base they consumed
 * (`settlement_base_amount`) and how much document carrying value they released
 * (`base_carrying_amount_released`); the difference is realized FX and is
 * booked so the control account keeps tying out to the subledger.
 */

type PartySide = "customer" | "supplier";

type NoteCreditRow = {
  id: string;
  number: string;
  party_id: string;
  date: string;
  document_status: string;
  currency_code: string;
  total_minor: number;
  base_total_minor: number;
  allocated_minor: number;
  allocated_base_minor: number;
  refunded_minor: number;
  refunded_base_minor: number;
};

export type NoteCreditState = {
  noteId: string;
  number: string;
  partyId: string;
  date: string;
  currencyCode: string;
  documentStatus: string;
  totalMinor: number;
  baseTotalMinor: number;
  allocatedMinor: number;
  refundedMinor: number;
  unallocatedMinor: number;
  unallocatedBaseMinor: number;
};

const sideSql = {
  customer: {
    noteTable: "sales_credit_notes",
    numberColumn: "credit_note_number",
    partyColumn: "customer_id",
    dateColumn: "date",
    allocationTable: "sales_credit_note_allocations",
    allocationNoteColumn: "credit_note_id",
    allocationDocumentColumn: "sales_invoice_id",
    allocationBaseExpr: "COALESCE(a.settlement_base_amount, a.base_carrying_amount_released)",
    refundTable: "customer_refunds",
    refundNoteColumn: "credit_note_id",
    documentTable: "sales_invoices",
    documentNumberColumn: "invoice_number",
    module: "sales" as const,
  },
  supplier: {
    noteTable: "debit_notes",
    numberColumn: "debit_note_number",
    partyColumn: "supplier_id",
    dateColumn: "debit_note_date",
    allocationTable: "debit_note_allocations",
    allocationNoteColumn: "debit_note_id",
    allocationDocumentColumn: "purchase_invoice_id",
    allocationBaseExpr: "a.settlement_base_amount",
    refundTable: "supplier_refunds",
    refundNoteColumn: "debit_note_id",
    documentTable: "purchase_invoices",
    documentNumberColumn: "internal_number",
    module: "purchases" as const,
  },
};

function noteCreditRows(sqlite: Database.Database, side: PartySide, where: string, params: unknown[]) {
  const t = sideSql[side];
  return sqlite.prepare(`
    SELECT n.id, n.${t.numberColumn} AS number, n.${t.partyColumn} AS party_id, n.${t.dateColumn} AS date,
      n.document_status, n.currency_code, n.total_minor, n.base_total_minor,
      COALESCE((SELECT SUM(a.amount_minor) FROM ${t.allocationTable} a WHERE a.${t.allocationNoteColumn} = n.id), 0) AS allocated_minor,
      COALESCE((SELECT SUM(${t.allocationBaseExpr}) FROM ${t.allocationTable} a WHERE a.${t.allocationNoteColumn} = n.id), 0) AS allocated_base_minor,
      COALESCE((SELECT SUM(r.amount_minor) FROM ${t.refundTable} r WHERE r.${t.refundNoteColumn} = n.id AND r.document_status = 'posted'), 0) AS refunded_minor,
      COALESCE((SELECT SUM(r.released_carrying_amount_minor) FROM ${t.refundTable} r WHERE r.${t.refundNoteColumn} = n.id AND r.document_status = 'posted'), 0) AS refunded_base_minor
    FROM ${t.noteTable} n
    WHERE ${where}
    ORDER BY n.${t.dateColumn}, n.created_at
  `).all(...params) as NoteCreditRow[];
}

function toState(row: NoteCreditRow): NoteCreditState {
  return {
    noteId: row.id,
    number: row.number,
    partyId: row.party_id,
    date: row.date,
    currencyCode: row.currency_code,
    documentStatus: row.document_status,
    totalMinor: row.total_minor,
    baseTotalMinor: row.base_total_minor,
    allocatedMinor: row.allocated_minor,
    refundedMinor: row.refunded_minor,
    unallocatedMinor: Math.max(0, row.total_minor - row.allocated_minor - row.refunded_minor),
    unallocatedBaseMinor: Math.max(0, row.base_total_minor - row.allocated_base_minor - row.refunded_base_minor),
  };
}

export function getNoteCreditState(sqlite: Database.Database, side: PartySide, noteId: string): NoteCreditState | null {
  const row = noteCreditRows(sqlite, side, "n.id = ?", [noteId])[0];
  return row ? toState(row) : null;
}

/** Posted notes of a party that still carry unallocated credit. */
export function listPartyNoteCredits(businessId: string, userId: string, side: PartySide, partyId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const t = sideSql[side];
  return noteCreditRows(sqlite, side, `n.${t.partyColumn} = ? AND n.document_status = 'posted'`, [partyId])
    .map(toState)
    .filter((state) => state.unallocatedMinor > 0);
}

/**
 * Whether a posted note's credit has been used beyond its source document (applied
 * elsewhere or refunded). Such a note cannot be edited or voided until those are undone.
 */
export function noteCreditInUse(sqlite: Database.Database, side: PartySide, noteId: string, sourceDocumentId: string | null) {
  const t = sideSql[side];
  const applied = sqlite.prepare(`
    SELECT 1 FROM ${t.allocationTable} WHERE ${t.allocationNoteColumn} = ? AND (? IS NULL OR ${t.allocationDocumentColumn} <> ?) LIMIT 1
  `).get(noteId, sourceDocumentId, sourceDocumentId);
  const refunded = sqlite.prepare(`
    SELECT 1 FROM ${t.refundTable} WHERE ${t.refundNoteColumn} = ? AND document_status = 'posted' LIMIT 1
  `).get(noteId);
  return Boolean(applied || refunded);
}

function nextRefundNumber(sqlite: Database.Database, table: "customer_refunds" | "supplier_refunds", prefix: string) {
  const row = sqlite.prepare(`
    SELECT MAX(CAST(substr(refund_number, ?) AS INTEGER)) AS last FROM ${table} WHERE substr(refund_number, 1, ?) = ?
  `).get(prefix.length + 1, prefix.length, prefix) as { last: number | null };
  return `${prefix}${String((row.last ?? 0) + 1).padStart(4, "0")}`;
}

function accountingSettings(sqlite: Database.Database) {
  const settings = sqlite.prepare(`
    SELECT accounts_receivable_account_id, accounts_payable_account_id,
      realized_fx_gain_account_id, realized_fx_loss_account_id
    FROM business_accounting_settings WHERE id = 'default'
  `).get() as {
    accounts_receivable_account_id: string | null;
    accounts_payable_account_id: string | null;
    realized_fx_gain_account_id: string | null;
    realized_fx_loss_account_id: string | null;
  } | undefined;
  if (!settings) throw new Error("Accounting settings are not configured.");
  return settings;
}

function formatMinor(sqlite: Database.Database, amountMinor: number, currencyCode: string) {
  const minorUnit = getCurrency(sqlite, currencyCode).minor_unit;
  return `${currencyCode} ${(amountMinor / 10 ** minorUnit).toFixed(minorUnit)}`;
}

/** Applies a note's unallocated credit to another open document of the same party. */
function applyNoteCredit(businessId: string, userId: string, side: PartySide, input: ApplyNoteCreditInput) {
  const t = sideSql[side];
  assertMutationPermission(businessId, userId, t.module, "post");
  const data = applyNoteCreditInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const config = side === "customer" ? receiptConfig : supplierPaymentConfig;
  const applied = sqlite.transaction(() => {
    const state = getNoteCreditState(sqlite, side, data.noteId);
    if (!state || state.documentStatus !== "posted") throw new Error("Only a posted note's credit can be applied.");
    const currency = getCurrency(sqlite, state.currencyCode);
    const amountMinor = parseCurrencyAmountToMinor(data.amount, currency.minor_unit);
    if (amountMinor <= 0) throw new Error("Amount must be greater than zero.");
    if (amountMinor > state.unallocatedMinor) {
      throw new Error(`Only ${formatMinor(sqlite, state.unallocatedMinor, state.currencyCode)} of ${state.number} is still unallocated.`);
    }
    const document = sqlite.prepare(`
      SELECT id, ${t.documentNumberColumn} AS number, ${t.partyColumn} AS party_id, currency_code, invoice_date, document_status
      FROM ${t.documentTable} WHERE id = ?
    `).get(data.documentId) as { id: string; number: string; party_id: string; currency_code: string; invoice_date: string; document_status: string } | undefined;
    if (!document || document.document_status !== "posted" || document.party_id !== state.partyId) {
      throw new Error(`Choose a posted ${side === "customer" ? "invoice of this customer" : "purchase invoice of this supplier"}.`);
    }
    if (document.currency_code !== state.currencyCode) {
      throw new Error(`Cannot apply ${state.currencyCode} credit to a ${document.currency_code} document.`);
    }
    if (sqlite.prepare(`SELECT 1 FROM ${t.allocationTable} WHERE ${t.allocationNoteColumn} = ? AND ${t.allocationDocumentColumn} = ?`).get(state.noteId, document.id)) {
      throw new Error(`${state.number} is already applied to ${document.number}.`);
    }
    const open = getOpenState(sqlite, config, document.id);
    if (!open || open.foreign_open_minor <= 0) throw new Error(`${document.number} is already fully settled.`);
    if (amountMinor > open.foreign_open_minor) {
      throw new Error(`Amount exceeds the ${formatMinor(sqlite, open.foreign_open_minor, document.currency_code)} still open on ${document.number}.`);
    }
    const documentCarrying = proportionalCarryingRelease(amountMinor, open.foreign_open_minor, open.base_carrying_minor);
    const noteBaseConsumed = proportionalCarryingRelease(amountMinor, state.unallocatedMinor, state.unallocatedBaseMinor);
    const realizedFx = noteBaseConsumed - documentCarrying;
    const date = [state.date, document.invoice_date].sort().at(-1)!;
    assertDateNotLocked(sqlite, date, "Credit allocation");

    const allocationId = randomUUID();
    if (side === "customer") {
      sqlite.prepare(`
        INSERT INTO sales_credit_note_allocations (
          id, credit_note_id, sales_invoice_id, amount_minor, foreign_amount_allocated,
          base_carrying_amount_released, settlement_base_amount, realized_fx_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(allocationId, state.noteId, document.id, amountMinor, amountMinor, documentCarrying, noteBaseConsumed, realizedFx);
    } else {
      sqlite.prepare(`
        INSERT INTO debit_note_allocations (
          id, debit_note_id, purchase_invoice_id, amount_minor,
          base_carrying_amount_released, settlement_base_amount, realized_fx_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(allocationId, state.noteId, document.id, amountMinor, documentCarrying, noteBaseConsumed, realizedFx);
    }
    postCreditAllocationFx(sqlite, config, {
      allocationId,
      paymentNumber: state.number,
      partyId: state.partyId,
      documentNumber: document.number,
      date,
      realizedFxMinor: realizedFx,
    }, side === "customer" ? "sales_credit_note_allocation" : "debit_note_allocation");
    return { allocationId, noteNumber: state.number, documentNumber: document.number, amountMinor, currencyCode: state.currencyCode, partyId: state.partyId };
  }).immediate();

  recordActivity(businessId, {
    userId,
    action: "updated",
    entityType: side === "customer" ? "sales_credit_note" : "debit_note",
    entityId: data.noteId,
    entityNumber: applied.noteNumber,
    summary: `Applied ${formatMinor(sqlite, applied.amountMinor, applied.currencyCode)} of ${applied.noteNumber} credit to ${applied.documentNumber}`,
    details: { documentId: data.documentId, amountMinor: applied.amountMinor, currency: applied.currencyCode, allocationId: applied.allocationId },
  });
  return applied;
}

export function applyCreditNoteToInvoice(businessId: string, userId: string, input: ApplyNoteCreditInput) {
  assertMutationPermission(businessId, userId, "sales", "post");
  return applyNoteCredit(businessId, userId, "customer", input);
}

export function applyDebitNoteToPurchaseInvoice(businessId: string, userId: string, input: ApplyNoteCreditInput) {
  assertMutationPermission(businessId, userId, "purchases", "post");
  return applyNoteCredit(businessId, userId, "supplier", input);
}

/**
 * Customer refund: pays unallocated credit-note credit back out of the bank.
 *   Dr Accounts Receivable (credit's carrying value) / Cr Bank (amount at the refund rate)
 * Supplier refund: receives unallocated debit-note credit back into the bank.
 *   Dr Bank (amount at the refund rate) / Cr Accounts Payable (credit's carrying value)
 * Any difference between the two base amounts is realized FX.
 */
function createRefund(businessId: string, userId: string, side: PartySide, input: PartyRefundInput) {
  const t = sideSql[side];
  assertMutationPermission(businessId, userId, t.module, "post");
  const data = partyRefundInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const refundTable = side === "customer" ? "customer_refunds" : "supplier_refunds";
  const refund = sqlite.transaction(() => {
    const state = getNoteCreditState(sqlite, side, data.noteId);
    if (!state || state.documentStatus !== "posted") throw new Error("Only a posted note's credit can be refunded.");
    if (data.date < state.date) throw new Error(`The refund cannot be dated before ${state.number}.`);
    assertDateNotLocked(sqlite, data.date, side === "customer" ? "Customer refund" : "Supplier refund");
    const rate = resolveRateSnapshot(sqlite, {
      currencyCode: state.currencyCode,
      exchangeRateToBase: data.exchangeRateToBase,
      exchangeRateDate: data.exchangeRateDate,
      exchangeRateSource: data.exchangeRateSource,
      relevantDate: data.date,
      enforceVatPolicy: false,
    });
    const amountMinor = parseCurrencyAmountToMinor(data.amount, rate.currencyMinorUnit);
    if (amountMinor <= 0) throw new Error("Refund amount must be greater than zero.");
    if (amountMinor > state.unallocatedMinor) {
      throw new Error(`Only ${formatMinor(sqlite, state.unallocatedMinor, state.currencyCode)} of ${state.number} is available to refund.`);
    }
    const bank = sqlite.prepare("SELECT id FROM accounts WHERE id = ? AND is_active = 1 AND subtype IN ('bank', 'cash')").get(data.bankAccountId);
    if (!bank) throw new Error("Choose an active Bank or Cash account.");
    const settings = accountingSettings(sqlite);
    const controlAccountId = side === "customer" ? settings.accounts_receivable_account_id : settings.accounts_payable_account_id;
    if (!controlAccountId) throw new Error(`${side === "customer" ? "Accounts Receivable" : "Accounts Payable"} account is not configured.`);

    const bankBase = convertToBase(amountMinor, rate.currencyMinorUnit, rate.baseMinorUnit, rate.exchangeRateToBase);
    const carrying = proportionalCarryingRelease(amountMinor, state.unallocatedMinor, state.unallocatedBaseMinor);
    // Customer: AR is debited `carrying` while bank is credited `bankBase`; a
    // positive difference is a gain. Supplier: the mirror image.
    const realizedFx = side === "customer" ? carrying - bankBase : bankBase - carrying;
    if (realizedFx !== 0 && (!settings.realized_fx_gain_account_id || !settings.realized_fx_loss_account_id)) {
      throw new Error("Realized FX Gain/Loss accounts are not configured.");
    }
    const id = randomUUID();
    const number = nextRefundNumber(sqlite, refundTable, side === "customer" ? "CRF-" : "SRF-");
    const now = new Date().toISOString();
    const party = side === "customer" ? { customerId: state.partyId } : { supplierId: state.partyId };
    const label = side === "customer" ? `Customer refund ${number} for ${state.number}` : `Supplier refund ${number} for ${state.number}`;
    const lines: JournalLineInput[] = side === "customer"
      ? [
          { accountId: controlAccountId, description: label, debitMinor: carrying, ...party, reference: number },
          { accountId: data.bankAccountId, description: label, creditMinor: bankBase, reference: number },
        ]
      : [
          { accountId: data.bankAccountId, description: label, debitMinor: bankBase, reference: number },
          { accountId: controlAccountId, description: label, creditMinor: carrying, ...party, reference: number },
        ];
    if (realizedFx > 0) {
      lines.push({ accountId: settings.realized_fx_gain_account_id!, description: `Realized FX gain on ${number}`, creditMinor: realizedFx, reference: number });
    } else if (realizedFx < 0) {
      lines.push({ accountId: settings.realized_fx_loss_account_id!, description: `Realized FX loss on ${number}`, debitMinor: -realizedFx, reference: number });
    }

    sqlite.prepare(`
      INSERT INTO ${refundTable} (
        id, refund_number, ${t.partyColumn}, ${t.refundNoteColumn}, date, bank_account_id, amount_minor,
        currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
        base_amount_minor, released_carrying_amount_minor, realized_fx_amount_minor,
        reference, description, document_status, created_by, created_at, posted_at, voided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, NULL)
    `).run(
      id, number, state.partyId, state.noteId, data.date, data.bankAccountId, amountMinor,
      rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource,
      bankBase, carrying, realizedFx, data.reference || null, data.description || null, userId, now, now,
    );
    postTransaction(sqlite, {
      sourceType: side === "customer" ? "customer_refund" : "supplier_refund",
      sourceId: id,
      date: data.date,
      description: label,
      lines,
    });
    return { id, number, noteNumber: state.number, amountMinor, currencyCode: state.currencyCode, partyId: state.partyId };
  }).immediate();

  recordActivity(businessId, {
    userId,
    action: "posted",
    // Logged against the note: refunds are listed (and voided) on its page.
    entityType: side === "customer" ? "sales_credit_note" : "debit_note",
    entityId: data.noteId,
    entityNumber: refund.noteNumber,
    summary: `${side === "customer" ? "Refunded" : "Received refund of"} ${formatMinor(sqlite, refund.amountMinor, refund.currencyCode)} ${side === "customer" ? "to customer" : "from supplier"} from ${refund.noteNumber} (${refund.number})`,
    details: { refundId: refund.id, refundNumber: refund.number, partyId: refund.partyId, amountMinor: refund.amountMinor, currency: refund.currencyCode, bankAccountId: data.bankAccountId, date: data.date },
  });
  return { id: refund.id, refundNumber: refund.number };
}

export function createCustomerRefund(businessId: string, userId: string, input: PartyRefundInput) {
  assertMutationPermission(businessId, userId, "sales", "post");
  return createRefund(businessId, userId, "customer", input);
}

export function createSupplierRefund(businessId: string, userId: string, input: PartyRefundInput) {
  assertMutationPermission(businessId, userId, "purchases", "post");
  return createRefund(businessId, userId, "supplier", input);
}

function voidRefund(businessId: string, userId: string, side: PartySide, refundId: string) {
  const t = sideSql[side];
  assertMutationPermission(businessId, userId, t.module, "delete");
  const { sqlite } = getBusinessDb(businessId, userId);
  const refundTable = side === "customer" ? "customer_refunds" : "supplier_refunds";
  const sourceType = side === "customer" ? "customer_refund" : "supplier_refund";
  const refund = sqlite.prepare(`
    SELECT r.id, r.refund_number, r.date, r.document_status, r.amount_minor, r.currency_code,
      r.${t.refundNoteColumn} AS note_id, n.${t.numberColumn} AS note_number
    FROM ${refundTable} r INNER JOIN ${t.noteTable} n ON n.id = r.${t.refundNoteColumn}
    WHERE r.id = ?
  `).get(refundId) as { id: string; refund_number: string; date: string; document_status: string; amount_minor: number; currency_code: string; note_id: string; note_number: string } | undefined;
  if (!refund) throw new Error("Refund not found.");
  if (refund.document_status !== "posted") throw new Error("Only a posted refund can be voided.");
  const today = getBusinessTodayIso();
  sqlite.transaction(() => {
    assertDateNotLocked(sqlite, refund.date, "Refund void");
    assertDateNotLocked(sqlite, today, "Refund void");
    const journal = sqlite.prepare("SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ?").get(sourceType, refundId) as { id: string } | undefined;
    if (journal && sqlite.prepare("SELECT 1 FROM bank_reconciliation_items WHERE journal_entry_id = ? LIMIT 1").get(journal.id)) {
      throw new Error("Cannot void a refund included in a bank reconciliation.");
    }
    reverseTransaction(sqlite, {
      originalSourceType: sourceType,
      originalSourceId: refundId,
      reversalSourceType: `${sourceType}_void`,
      reversalSourceId: refundId,
      date: today,
      description: `Void refund ${refund.refund_number}`,
    });
    const now = new Date().toISOString();
    sqlite.prepare(`UPDATE ${refundTable} SET document_status = 'void', voided_at = ? WHERE id = ?`).run(now, refundId);
  }).immediate();
  recordActivity(businessId, {
    userId,
    action: "voided",
    entityType: side === "customer" ? "sales_credit_note" : "debit_note",
    entityId: refund.note_id,
    entityNumber: refund.note_number,
    summary: `Voided refund ${refund.refund_number} (${formatMinor(sqlite, refund.amount_minor, refund.currency_code)}) on ${refund.note_number}`,
    details: { refundId, refundNumber: refund.refund_number },
  });
}

export function voidCustomerRefund(businessId: string, userId: string, refundId: string) {
  assertMutationPermission(businessId, userId, "sales", "delete");
  voidRefund(businessId, userId, "customer", refundId);
}

export function voidSupplierRefund(businessId: string, userId: string, refundId: string) {
  assertMutationPermission(businessId, userId, "purchases", "delete");
  voidRefund(businessId, userId, "supplier", refundId);
}

export type NoteCreditActivity = {
  refunds: Array<{ id: string; refundNumber: string; date: string; amountMinor: number; documentStatus: string; reference: string | null; bankAccountName: string }>;
  applications: Array<{ documentId: string; documentNumber: string; amountMinor: number; isSource: boolean }>;
};

/** Refunds and allocations of one note, for its detail page. */
export function getNoteCreditActivity(businessId: string, userId: string, side: PartySide, noteId: string): NoteCreditActivity {
  const { sqlite } = getBusinessDb(businessId, userId);
  const t = sideSql[side];
  const sourceColumn = side === "customer" ? "source_invoice_id" : "purchase_invoice_id";
  const refunds = sqlite.prepare(`
    SELECT r.id, r.refund_number, r.date, r.amount_minor, r.document_status, r.reference, a.name AS bank_account_name
    FROM ${t.refundTable} r INNER JOIN accounts a ON a.id = r.bank_account_id
    WHERE r.${t.refundNoteColumn} = ? ORDER BY r.date, r.created_at
  `).all(noteId) as { id: string; refund_number: string; date: string; amount_minor: number; document_status: string; reference: string | null; bank_account_name: string }[];
  const applications = sqlite.prepare(`
    SELECT d.id AS document_id, d.${t.documentNumberColumn} AS document_number, a.amount_minor,
      CASE WHEN n.${sourceColumn} = d.id THEN 1 ELSE 0 END AS is_source
    FROM ${t.allocationTable} a
    INNER JOIN ${t.documentTable} d ON d.id = a.${t.allocationDocumentColumn}
    INNER JOIN ${t.noteTable} n ON n.id = a.${t.allocationNoteColumn}
    WHERE a.${t.allocationNoteColumn} = ?
    ORDER BY is_source DESC, d.${t.documentNumberColumn}
  `).all(noteId) as { document_id: string; document_number: string; amount_minor: number; is_source: number }[];
  return {
    refunds: refunds.map((row) => ({
      id: row.id, refundNumber: row.refund_number, date: row.date, amountMinor: row.amount_minor,
      documentStatus: row.document_status, reference: row.reference, bankAccountName: row.bank_account_name,
    })),
    applications: applications.map((row) => ({
      documentId: row.document_id, documentNumber: row.document_number, amountMinor: row.amount_minor, isSource: row.is_source === 1,
    })),
  };
}

/** Everything the note detail page needs to show and act on the note's credit. */
export function getNoteCreditPanelData(businessId: string, userId: string, side: PartySide, noteId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const state = getNoteCreditState(sqlite, side, noteId);
  if (!state || state.documentStatus !== "posted") return null;
  const bankAccounts = sqlite.prepare(`
    SELECT id, name FROM accounts WHERE is_active = 1 AND subtype IN ('bank', 'cash') ORDER BY name
  `).all() as { id: string; name: string }[];
  return {
    noteNumber: state.number,
    noteDate: state.date,
    currencyCode: state.currencyCode,
    minorUnit: getCurrency(sqlite, state.currencyCode).minor_unit,
    unallocatedMinor: state.unallocatedMinor,
    openDocuments: state.unallocatedMinor > 0
      ? listOpenDocumentsForCredit(businessId, userId, side, state.partyId, state.currencyCode)
      : [],
    bankAccounts,
    ...getNoteCreditActivity(businessId, userId, side, noteId),
  };
}

/** Open posted documents of a party in one currency, for the apply-credit picker. */
export function listOpenDocumentsForCredit(businessId: string, userId: string, side: PartySide, partyId: string, currencyCode: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const t = sideSql[side];
  const config = side === "customer" ? receiptConfig : supplierPaymentConfig;
  const rows = sqlite.prepare(`
    SELECT id, ${t.documentNumberColumn} AS number, invoice_date AS date FROM ${t.documentTable}
    WHERE ${t.partyColumn} = ? AND currency_code = ? AND document_status = 'posted'
    ORDER BY invoice_date, ${t.documentNumberColumn}
  `).all(partyId, currencyCode) as { id: string; number: string; date: string }[];
  return rows
    .map((row) => ({ ...row, openMinor: getOpenState(sqlite, config, row.id)?.foreign_open_minor ?? 0 }))
    .filter((row) => row.openMinor > 0);
}
