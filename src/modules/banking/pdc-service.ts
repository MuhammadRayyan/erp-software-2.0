import { randomUUID } from "node:crypto";
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { postTransaction, reverseTransaction } from "@/modules/accounting/services/posting-service";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { pdcInputSchema, type PdcDirection, type PdcInput, type PdcStatus } from "./pdc-input";

export interface PdcRecord {
  id: string;
  pdcNumber: string;
  direction: PdcDirection;
  chequeNumber: string;
  chequeBankName: string | null;
  issueDate: string;
  maturityDate: string;
  customerId: string | null;
  customerName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  salesInvoiceId: string | null;
  purchaseInvoiceId: string | null;
  bankAccountId: string;
  bankAccountName: string;
  currencyCode: string;
  amountMinor: number;
  status: PdcStatus;
  reference: string | null;
  notes: string | null;
  depositedAt: string | null;
  clearedAt: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  cancelledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PdcMaturitySummary {
  today: string;
  horizonDays: number;
  overdueCount: number;
  overdueReceivableMinor: number;
  overduePayableMinor: number;
  dueSoonCount: number;
  dueSoonReceivableMinor: number;
  dueSoonPayableMinor: number;
  heldReceivableMinor: number;
  heldPayableMinor: number;
  bouncedCount: number;
  upcomingCheques: PdcRecord[];
}

function resolvePdcAccounts(sqlite: ReturnType<typeof getBusinessDb>["sqlite"]) {
  const settings = sqlite
    .prepare(`
      SELECT
        accounts_receivable_account_id,
        accounts_payable_account_id,
        pdc_receivable_account_id,
        pdc_payable_account_id
      FROM business_accounting_settings
      WHERE id = 'default'
    `)
    .get() as
    | {
        accounts_receivable_account_id: string;
        accounts_payable_account_id: string;
        pdc_receivable_account_id: string | null;
        pdc_payable_account_id: string | null;
      }
    | undefined;

  if (!settings) throw new Error("Accounting settings could not be found.");

  const pdcReceivableId = settings.pdc_receivable_account_id || "acct-pdc-receivable-1120";
  const pdcPayableId = settings.pdc_payable_account_id || "acct-pdc-payable-2020";

  const hasRec = sqlite
    .prepare("SELECT id FROM accounts WHERE id = ? AND is_active = 1")
    .get(pdcReceivableId);
  const hasPay = sqlite
    .prepare("SELECT id FROM accounts WHERE id = ? AND is_active = 1")
    .get(pdcPayableId);

  if (!hasRec || !hasPay) {
    throw new Error("PDC clearing accounts (1120 / 2020) are missing or inactive in Chart of Accounts.");
  }

  return {
    arAccountId: settings.accounts_receivable_account_id,
    apAccountId: settings.accounts_payable_account_id,
    pdcReceivableId,
    pdcPayableId,
  };
}

function mapPdcRow(row: Record<string, unknown>): PdcRecord {
  return {
    id: String(row.id),
    pdcNumber: String(row.pdc_number),
    direction: String(row.direction) as PdcDirection,
    chequeNumber: String(row.cheque_number),
    chequeBankName: row.cheque_bank_name ? String(row.cheque_bank_name) : null,
    issueDate: String(row.issue_date),
    maturityDate: String(row.maturity_date),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: row.customer_name ? String(row.customer_name) : null,
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    supplierName: row.supplier_name ? String(row.supplier_name) : null,
    salesInvoiceId: row.sales_invoice_id ? String(row.sales_invoice_id) : null,
    purchaseInvoiceId: row.purchase_invoice_id ? String(row.purchase_invoice_id) : null,
    bankAccountId: String(row.bank_account_id),
    bankAccountName: String(row.bank_account_name),
    currencyCode: String(row.currency_code),
    amountMinor: Number(row.amount_minor),
    status: String(row.status) as PdcStatus,
    reference: row.reference ? String(row.reference) : null,
    notes: row.notes ? String(row.notes) : null,
    depositedAt: row.deposited_at ? String(row.deposited_at) : null,
    clearedAt: row.cleared_at ? String(row.cleared_at) : null,
    bouncedAt: row.bounced_at ? String(row.bounced_at) : null,
    bounceReason: row.bounce_reason ? String(row.bounce_reason) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listPdcs(
  businessId: string,
  userId: string,
  filters?: { direction?: PdcDirection | "all"; status?: PdcStatus | "all" },
): PdcRecord[] {
  assertMutationPermission(businessId, userId, "banking", "view");
  const { sqlite } = getBusinessDb(businessId, userId);

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.direction && filters.direction !== "all") {
    clauses.push("p.direction = ?");
    params.push(filters.direction);
  }
  if (filters?.status && filters.status !== "all") {
    clauses.push("p.status = ?");
    params.push(filters.status);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = sqlite
    .prepare(`
      SELECT
        p.*,
        c.name AS customer_name,
        s.name AS supplier_name,
        ba.name AS bank_account_name
      FROM post_dated_cheques p
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      INNER JOIN bank_accounts ba ON ba.id = p.bank_account_id
      ${where}
      ORDER BY
        CASE WHEN p.status IN ('held', 'deposited') THEN 0 ELSE 1 END ASC,
        p.maturity_date ASC,
        p.created_at DESC
    `)
    .all(...params) as Record<string, unknown>[];

  return rows.map(mapPdcRow);
}

export function getPdc(businessId: string, userId: string, pdcId: string): PdcRecord | null {
  assertMutationPermission(businessId, userId, "banking", "view");
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare(`
      SELECT
        p.*,
        c.name AS customer_name,
        s.name AS supplier_name,
        ba.name AS bank_account_name
      FROM post_dated_cheques p
      LEFT JOIN customers c ON c.id = p.customer_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      INNER JOIN bank_accounts ba ON ba.id = p.bank_account_id
      WHERE p.id = ?
    `)
    .get(pdcId) as Record<string, unknown> | undefined;

  return row ? mapPdcRow(row) : null;
}

export function getPdcMaturitySummary(
  businessId: string,
  userId: string,
  horizonDays = 30,
): PdcMaturitySummary {
  assertMutationPermission(businessId, userId, "banking", "view");
  const all = listPdcs(businessId, userId);
  const today = new Date().toISOString().slice(0, 10);
  const horizonDate = new Date(Date.now() + horizonDays * 86_400_000).toISOString().slice(0, 10);

  let overdueCount = 0;
  let overdueReceivableMinor = 0;
  let overduePayableMinor = 0;
  let dueSoonCount = 0;
  let dueSoonReceivableMinor = 0;
  let dueSoonPayableMinor = 0;
  let heldReceivableMinor = 0;
  let heldPayableMinor = 0;
  let bouncedCount = 0;
  const upcomingCheques: PdcRecord[] = [];

  for (const pdc of all) {
    if (pdc.status === "bounced") {
      bouncedCount += 1;
      continue;
    }
    if (pdc.status !== "held" && pdc.status !== "deposited") continue;

    if (pdc.direction === "receivable") {
      heldReceivableMinor += pdc.amountMinor;
    } else {
      heldPayableMinor += pdc.amountMinor;
    }

    if (pdc.maturityDate < today) {
      overdueCount += 1;
      if (pdc.direction === "receivable") overdueReceivableMinor += pdc.amountMinor;
      else overduePayableMinor += pdc.amountMinor;
    } else if (pdc.maturityDate <= horizonDate) {
      dueSoonCount += 1;
      if (pdc.direction === "receivable") dueSoonReceivableMinor += pdc.amountMinor;
      else dueSoonPayableMinor += pdc.amountMinor;
    }

    if (upcomingCheques.length < 6) {
      upcomingCheques.push(pdc);
    }
  }

  return {
    today,
    horizonDays,
    overdueCount,
    overdueReceivableMinor,
    overduePayableMinor,
    dueSoonCount,
    dueSoonReceivableMinor,
    dueSoonPayableMinor,
    heldReceivableMinor,
    heldPayableMinor,
    bouncedCount,
    upcomingCheques,
  };
}

export function createPdc(businessId: string, userId: string, rawInput: PdcInput): string {
  assertMutationPermission(businessId, userId, "banking", "create");
  const input = pdcInputSchema.parse(rawInput);
  const { sqlite } = getBusinessDb(businessId, userId);

  const bankAccount = sqlite
    .prepare("SELECT id, name, ledger_account_id, currency_code, is_active FROM bank_accounts WHERE id = ?")
    .get(input.bankAccountId) as
    | { id: string; name: string; ledger_account_id: string; currency_code: string; is_active: number }
    | undefined;
  if (!bankAccount || !bankAccount.is_active) {
    throw new Error("Selected bank account is missing or inactive.");
  }

  const currencyRow = sqlite
    .prepare("SELECT minor_unit FROM currencies WHERE code = ?")
    .get(bankAccount.currency_code) as { minor_unit: number } | undefined;
  const minorUnit = currencyRow?.minor_unit ?? 2;
  const amountMinor = parseCurrencyAmountToMinor(input.amount, minorUnit);
  if (amountMinor <= 0) throw new Error("Cheque amount must be greater than zero.");

  const pdcId = randomUUID();
  const now = new Date().toISOString();

  sqlite.transaction(() => {
    const accounts = resolvePdcAccounts(sqlite);
    const pdcNumber = allocateNumber(sqlite, "pdc");

    if (input.direction === "receivable" && input.customerId) {
      const cust = sqlite.prepare("SELECT id FROM customers WHERE id = ?").get(input.customerId);
      if (!cust) throw new Error("Selected customer does not exist.");
    }
    if (input.direction === "payable" && input.supplierId) {
      const sup = sqlite.prepare("SELECT id FROM suppliers WHERE id = ?").get(input.supplierId);
      if (!sup) throw new Error("Selected supplier does not exist.");
    }

    sqlite
      .prepare(`
        INSERT INTO post_dated_cheques (
          id, pdc_number, direction, cheque_number, cheque_bank_name,
          issue_date, maturity_date, customer_id, supplier_id,
          sales_invoice_id, purchase_invoice_id, bank_account_id,
          currency_code, amount_minor, status, reference, notes,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'held', ?, ?, ?, ?, ?)
      `)
      .run(
        pdcId,
        pdcNumber,
        input.direction,
        input.chequeNumber,
        input.chequeBankName || null,
        input.issueDate,
        input.maturityDate,
        input.direction === "receivable" ? input.customerId || null : null,
        input.direction === "payable" ? input.supplierId || null : null,
        input.salesInvoiceId || null,
        input.purchaseInvoiceId || null,
        bankAccount.id,
        bankAccount.currency_code,
        amountMinor,
        input.reference || null,
        input.notes || null,
        userId,
        now,
        now,
      );

    if (input.direction === "receivable") {
      postTransaction(sqlite, {
        sourceType: "pdc_receive",
        sourceId: pdcId,
        date: input.issueDate,
        description: `PDC Receivable ${pdcNumber} (Cheque #${input.chequeNumber})`,
        lines: [
          {
            accountId: accounts.pdcReceivableId,
            description: `Post-dated cheque held (${input.chequeNumber})`,
            debitMinor: amountMinor,
            customerId: input.customerId || null,
            reference: input.chequeNumber,
          },
          {
            accountId: accounts.arAccountId,
            description: `Customer AR cleared to PDC (${pdcNumber})`,
            creditMinor: amountMinor,
            customerId: input.customerId || null,
            reference: input.chequeNumber,
          },
        ],
      });
    } else {
      postTransaction(sqlite, {
        sourceType: "pdc_receive",
        sourceId: pdcId,
        date: input.issueDate,
        description: `PDC Payable ${pdcNumber} (Cheque #${input.chequeNumber})`,
        lines: [
          {
            accountId: accounts.apAccountId,
            description: `Supplier AP settled to PDC (${pdcNumber})`,
            debitMinor: amountMinor,
            supplierId: input.supplierId || null,
            reference: input.chequeNumber,
          },
          {
            accountId: accounts.pdcPayableId,
            description: `Post-dated cheque issued (${input.chequeNumber})`,
            creditMinor: amountMinor,
            supplierId: input.supplierId || null,
            reference: input.chequeNumber,
          },
        ],
      });
    }

    recordActivity(businessId, {
      entityType: "post_dated_cheque",
      entityId: pdcId,
      entityNumber: pdcNumber,
      action: "created",
      summary: `Registered ${input.direction} PDC ${pdcNumber} (Cheque #${input.chequeNumber}) maturing ${input.maturityDate}`,
      userId,
      sqlite,
    });
  })();

  return pdcId;
}

export function depositPdc(
  businessId: string,
  userId: string,
  pdcId: string,
  depositDate?: string,
): void {
  assertMutationPermission(businessId, userId, "banking", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);

  const pdc = sqlite
    .prepare("SELECT id, pdc_number, status FROM post_dated_cheques WHERE id = ?")
    .get(pdcId) as { id: string; pdc_number: string; status: PdcStatus } | undefined;
  if (!pdc) throw new Error("Post-dated cheque not found.");
  if (pdc.status !== "held") {
    throw new Error(`Only held cheques can be marked as deposited (current status: ${pdc.status}).`);
  }

  const now = new Date().toISOString();
  const effectiveDepositDate = depositDate || now.slice(0, 10);

  sqlite
    .prepare(`
      UPDATE post_dated_cheques
      SET status = 'deposited', deposited_at = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(effectiveDepositDate, now, pdcId);

  recordActivity(businessId, {
    entityType: "post_dated_cheque",
    entityId: pdcId,
    entityNumber: pdc.pdc_number,
    action: "updated",
    summary: `Deposited PDC ${pdc.pdc_number} at bank on ${effectiveDepositDate}`,
    userId,
    sqlite,
  });
}

export function clearPdc(
  businessId: string,
  userId: string,
  pdcId: string,
  clearingDate?: string,
): void {
  assertMutationPermission(businessId, userId, "banking", "approve");
  const { sqlite } = getBusinessDb(businessId, userId);

  const pdc = sqlite
    .prepare(`
      SELECT p.*, ba.ledger_account_id
      FROM post_dated_cheques p
      INNER JOIN bank_accounts ba ON ba.id = p.bank_account_id
      WHERE p.id = ?
    `)
    .get(pdcId) as
    | {
        id: string;
        pdc_number: string;
        direction: PdcDirection;
        cheque_number: string;
        maturity_date: string;
        customer_id: string | null;
        supplier_id: string | null;
        amount_minor: number;
        status: PdcStatus;
        ledger_account_id: string;
      }
    | undefined;

  if (!pdc) throw new Error("Post-dated cheque not found.");
  if (pdc.status !== "held" && pdc.status !== "deposited") {
    throw new Error(`Cannot clear a cheque in "${pdc.status}" status.`);
  }

  const now = new Date().toISOString();
  const clearDate = clearingDate || pdc.maturity_date || now.slice(0, 10);

  sqlite.transaction(() => {
    const accounts = resolvePdcAccounts(sqlite);

    if (pdc.direction === "receivable") {
      postTransaction(sqlite, {
        sourceType: "pdc_clear",
        sourceId: pdcId,
        date: clearDate,
        description: `Cleared PDC Receivable ${pdc.pdc_number} (Cheque #${pdc.cheque_number})`,
        lines: [
          {
            accountId: pdc.ledger_account_id,
            description: `Bank deposit from cleared PDC ${pdc.pdc_number}`,
            debitMinor: pdc.amount_minor,
            customerId: pdc.customer_id,
            reference: pdc.cheque_number,
          },
          {
            accountId: accounts.pdcReceivableId,
            description: `PDC Receivable cleared (${pdc.pdc_number})`,
            creditMinor: pdc.amount_minor,
            customerId: pdc.customer_id,
            reference: pdc.cheque_number,
          },
        ],
      });
    } else {
      postTransaction(sqlite, {
        sourceType: "pdc_clear",
        sourceId: pdcId,
        date: clearDate,
        description: `Cleared PDC Payable ${pdc.pdc_number} (Cheque #${pdc.cheque_number})`,
        lines: [
          {
            accountId: accounts.pdcPayableId,
            description: `PDC Payable cleared (${pdc.pdc_number})`,
            debitMinor: pdc.amount_minor,
            supplierId: pdc.supplier_id,
            reference: pdc.cheque_number,
          },
          {
            accountId: pdc.ledger_account_id,
            description: `Bank withdrawal for cleared PDC ${pdc.pdc_number}`,
            creditMinor: pdc.amount_minor,
            supplierId: pdc.supplier_id,
            reference: pdc.cheque_number,
          },
        ],
      });
    }

    sqlite
      .prepare(`
        UPDATE post_dated_cheques
        SET status = 'cleared',
            deposited_at = COALESCE(deposited_at, ?),
            cleared_at = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .run(clearDate, clearDate, now, pdcId);

    recordActivity(businessId, {
      entityType: "post_dated_cheque",
      entityId: pdcId,
      entityNumber: pdc.pdc_number,
      action: "posted",
      summary: `Cleared PDC ${pdc.pdc_number} on ${clearDate}`,
      userId,
      sqlite,
    });
  })();
}

export function bouncePdc(
  businessId: string,
  userId: string,
  pdcId: string,
  bounceReason: string,
  bounceDate?: string,
): void {
  assertMutationPermission(businessId, userId, "banking", "approve");
  const cleanReason = bounceReason.trim();
  if (!cleanReason) throw new Error("Enter the reason the cheque bounced.");

  const { sqlite } = getBusinessDb(businessId, userId);
  const pdc = sqlite
    .prepare("SELECT id, pdc_number, cheque_number, status FROM post_dated_cheques WHERE id = ?")
    .get(pdcId) as
    | { id: string; pdc_number: string; cheque_number: string; status: PdcStatus }
    | undefined;

  if (!pdc) throw new Error("Post-dated cheque not found.");
  if (pdc.status !== "held" && pdc.status !== "deposited") {
    throw new Error(`Cannot mark a "${pdc.status}" cheque as bounced.`);
  }

  const now = new Date().toISOString();
  const effectiveDate = bounceDate || now.slice(0, 10);

  sqlite.transaction(() => {
    reverseTransaction(sqlite, {
      originalSourceType: "pdc_receive",
      originalSourceId: pdcId,
      reversalSourceType: "pdc_bounce",
      reversalSourceId: pdcId,
      date: effectiveDate,
      description: `Bounced PDC ${pdc.pdc_number} (${pdc.cheque_number}): ${cleanReason}`,
    });

    sqlite
      .prepare(`
        UPDATE post_dated_cheques
        SET status = 'bounced', bounced_at = ?, bounce_reason = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(effectiveDate, cleanReason, now, pdcId);

    recordActivity(businessId, {
      entityType: "post_dated_cheque",
      entityId: pdcId,
      entityNumber: pdc.pdc_number,
      action: "voided",
      summary: `Marked PDC ${pdc.pdc_number} as bounced: ${cleanReason}`,
      userId,
      sqlite,
    });
  })();
}

export function cancelPdc(businessId: string, userId: string, pdcId: string): void {
  assertMutationPermission(businessId, userId, "banking", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);

  const pdc = sqlite
    .prepare("SELECT id, pdc_number, status, issue_date FROM post_dated_cheques WHERE id = ?")
    .get(pdcId) as { id: string; pdc_number: string; status: PdcStatus; issue_date: string } | undefined;

  if (!pdc) throw new Error("Post-dated cheque not found.");
  if (pdc.status !== "held") {
    throw new Error(`Only held cheques can be cancelled (current status: ${pdc.status}).`);
  }

  const now = new Date().toISOString();
  const cancelDate = now.slice(0, 10) >= pdc.issue_date ? now.slice(0, 10) : pdc.issue_date;

  sqlite.transaction(() => {
    reverseTransaction(sqlite, {
      originalSourceType: "pdc_receive",
      originalSourceId: pdcId,
      reversalSourceType: "pdc_cancel",
      reversalSourceId: pdcId,
      date: cancelDate,
      description: `Cancelled PDC ${pdc.pdc_number}`,
    });

    sqlite
      .prepare(`
        UPDATE post_dated_cheques
        SET status = 'cancelled', cancelled_at = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(now, now, pdcId);

    recordActivity(businessId, {
      entityType: "post_dated_cheque",
      entityId: pdcId,
      entityNumber: pdc.pdc_number,
      action: "cancelled",
      summary: `Cancelled PDC ${pdc.pdc_number}`,
      userId,
      sqlite,
    });
  })();
}
