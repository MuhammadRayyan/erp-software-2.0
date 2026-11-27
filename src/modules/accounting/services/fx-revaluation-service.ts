import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { getBusinessDb } from "@/core/db/business";
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { convertToBase, validateExchangeRate } from "@/modules/currency/conversion";
import { getBaseCurrency } from "@/modules/currency/currency";
import { assertDateNotLocked } from "./financial-lock-service";
import { postTransaction, reverseTransaction, type JournalLineInput } from "./posting-service";

/**
 * Unrealized FX revaluation.
 *
 * At a period end every open foreign-currency monetary balance is restated at
 * the closing rate: open sales and purchase invoices, unapplied customer
 * receipts and supplier payments, and foreign-currency bank balances. One
 * journal posts the differences against Unrealized FX Gain/Loss on the
 * revaluation date, and an automatic reversal posts on the next day.
 *
 * Because the revaluation is reversed, document carrying amounts (the AR/AP
 * subledger) are never touched: realized FX at settlement is still measured
 * against the original booking rate, so revaluation + reversal + realized FX
 * add up to the total economic FX of each document.
 */

type Sqlite = Database.Database;

export type FxRevaluationKind = "receivable" | "customer_credit" | "payable" | "supplier_credit" | "bank";

export type FxRevaluationLine = {
  kind: FxRevaluationKind;
  sourceType: string;
  sourceId: string;
  sourceNumber: string;
  partyId: string | null;
  partyName: string | null;
  accountId: string;
  accountName: string;
  currencyCode: string;
  currencyMinorUnit: number;
  foreignOpenMinor: number;
  carryingBaseMinor: number;
  rateToBase: string;
  revaluedBaseMinor: number;
  /** Signed debit to the balance-sheet account (positive = gain, negative = loss). */
  adjustmentMinor: number;
};

export type FxRevaluationPreview = {
  date: string;
  reversalDate: string;
  baseCurrencyCode: string;
  rates: Record<string, string>;
  missingRates: string[];
  lines: FxRevaluationLine[];
  accounts: { accountId: string; accountName: string; adjustmentMinor: number }[];
  netAdjustmentMinor: number;
  unrealizedAccountName: string;
};

const UNREALIZED_FX_ACCOUNT_ID = "acct-unrealized-fx";
const UNREALIZED_FX_ACCOUNT_NAME = "Unrealized FX Gain/Loss";

const isoDate = z.iso.date("Enter a valid revaluation date");

export const fxRevaluationInputSchema = z.object({
  date: isoDate,
  rates: z.record(z.string().regex(/^[A-Z]{3}$/), z.string().trim()),
  notes: z.string().trim().max(300).optional().default(""),
});
export type FxRevaluationInput = z.input<typeof fxRevaluationInputSchema>;

export function nextDayIso(date: string) {
  const value = new Date(`${isoDate.parse(date)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function controlAccounts(sqlite: Sqlite) {
  const settings = sqlite.prepare(`
    SELECT accounts_receivable_account_id AS ar, accounts_payable_account_id AS ap
    FROM business_accounting_settings WHERE id = 'default'
  `).get() as { ar: string | null; ap: string | null } | undefined;
  if (!settings?.ar || !settings.ap) throw new Error("Accounts Receivable and Payable must be configured.");
  return { ar: settings.ar, ap: settings.ap };
}

/** The configured Unrealized FX account, or the standard one (created when missing). */
function unrealizedFxAccount(sqlite: Sqlite, create: boolean) {
  const configured = sqlite.prepare(`
    SELECT a.id, a.name FROM business_accounting_settings s
    INNER JOIN accounts a ON a.id = s.unrealized_fx_account_id AND a.is_active = 1
    WHERE s.id = 'default'
  `).get() as { id: string; name: string } | undefined;
  if (configured) return configured;
  const existing = sqlite.prepare("SELECT id, name, is_active FROM accounts WHERE id = ?")
    .get(UNREALIZED_FX_ACCOUNT_ID) as { id: string; name: string; is_active: number } | undefined;
  if (!create) return { id: existing?.id ?? UNREALIZED_FX_ACCOUNT_ID, name: existing?.name ?? UNREALIZED_FX_ACCOUNT_NAME };
  const now = new Date().toISOString();
  if (!existing) {
    sqlite.prepare(`
      INSERT INTO accounts (id, name, type, subtype, is_system, is_active, created_at, updated_at)
      VALUES (?, ?, 'income', 'other_income', 1, 1, ?, ?)
    `).run(UNREALIZED_FX_ACCOUNT_ID, UNREALIZED_FX_ACCOUNT_NAME, now, now);
  } else if (!existing.is_active) {
    sqlite.prepare("UPDATE accounts SET is_active = 1, updated_at = ? WHERE id = ?").run(now, UNREALIZED_FX_ACCOUNT_ID);
  }
  sqlite.prepare("UPDATE business_accounting_settings SET unrealized_fx_account_id = ?, updated_at = ? WHERE id = 'default'")
    .run(UNREALIZED_FX_ACCOUNT_ID, now);
  return { id: UNREALIZED_FX_ACCOUNT_ID, name: existing?.name ?? UNREALIZED_FX_ACCOUNT_NAME };
}

type Exposure = Omit<FxRevaluationLine, "rateToBase" | "revaluedBaseMinor" | "adjustmentMinor" | "currencyMinorUnit" | "accountName">;

/**
 * Open foreign-currency balances as of `date`. A settlement counts once both
 * documents exist (the later of the payment and invoice dates), matching the
 * date the ledger books an applied credit.
 */
function openExposures(sqlite: Sqlite, date: string): Exposure[] {
  const base = getBaseCurrency(sqlite).code;
  const { ar, ap } = controlAccounts(sqlite);
  const params = { date, base };
  const receivables = sqlite.prepare(`
    SELECT * FROM (
      SELECT i.id AS source_id, i.invoice_number AS source_number, i.customer_id AS party_id,
        c.name AS party_name, i.currency_code,
        i.total_minor
          - COALESCE((SELECT SUM(ra.foreign_amount_allocated) FROM receipt_allocations ra
              INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
              WHERE ra.sales_invoice_id = i.id AND MAX(r.date, i.invoice_date) <= @date), 0)
          - COALESCE((SELECT SUM(scna.foreign_amount_allocated) FROM sales_credit_note_allocations scna
              INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
              WHERE scna.sales_invoice_id = i.id AND MAX(scn.date, i.invoice_date) <= @date), 0) AS foreign_open,
        i.base_total_minor
          - COALESCE((SELECT SUM(ra.base_carrying_amount_released) FROM receipt_allocations ra
              INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
              WHERE ra.sales_invoice_id = i.id AND MAX(r.date, i.invoice_date) <= @date), 0)
          - COALESCE((SELECT SUM(scna.base_carrying_amount_released) FROM sales_credit_note_allocations scna
              INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
              WHERE scna.sales_invoice_id = i.id AND MAX(scn.date, i.invoice_date) <= @date), 0) AS carrying
      FROM sales_invoices i INNER JOIN customers c ON c.id = i.customer_id
      WHERE i.document_status = 'posted' AND i.currency_code <> @base AND i.invoice_date <= @date
    ) WHERE foreign_open > 0 ORDER BY currency_code, source_number
  `).all(params) as RawExposure[];
  const customerCredits = sqlite.prepare(`
    SELECT * FROM (
      SELECT r.id AS source_id, r.receipt_number AS source_number, r.customer_id AS party_id,
        c.name AS party_name, r.currency_code,
        r.amount_minor - COALESCE((SELECT SUM(ra.foreign_amount_allocated) FROM receipt_allocations ra
          INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
          WHERE ra.receipt_id = r.id AND MAX(r.date, i.invoice_date) <= @date), 0) AS foreign_open,
        r.base_amount_minor - COALESCE((SELECT SUM(ra.settlement_base_amount) FROM receipt_allocations ra
          INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
          WHERE ra.receipt_id = r.id AND MAX(r.date, i.invoice_date) <= @date), 0) AS carrying
      FROM receipts r INNER JOIN customers c ON c.id = r.customer_id
      WHERE r.document_status = 'posted' AND r.currency_code <> @base AND r.date <= @date
    ) WHERE foreign_open > 0 ORDER BY currency_code, source_number
  `).all(params) as RawExposure[];
  const payables = sqlite.prepare(`
    SELECT * FROM (
      SELECT pi.id AS source_id, pi.internal_number AS source_number, pi.supplier_id AS party_id,
        s.name AS party_name, pi.currency_code,
        pi.total_minor - COALESCE((SELECT SUM(spa.foreign_amount_allocated) FROM supplier_payment_allocations spa
          INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
          WHERE spa.purchase_invoice_id = pi.id AND MAX(sp.date, pi.invoice_date) <= @date), 0) AS foreign_open,
        pi.base_total_minor - COALESCE((SELECT SUM(spa.base_carrying_amount_released) FROM supplier_payment_allocations spa
          INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
          WHERE spa.purchase_invoice_id = pi.id AND MAX(sp.date, pi.invoice_date) <= @date), 0) AS carrying
      FROM purchase_invoices pi INNER JOIN suppliers s ON s.id = pi.supplier_id
      WHERE pi.document_status = 'posted' AND pi.currency_code <> @base AND pi.invoice_date <= @date
    ) WHERE foreign_open > 0 ORDER BY currency_code, source_number
  `).all(params) as RawExposure[];
  const supplierCredits = sqlite.prepare(`
    SELECT * FROM (
      SELECT sp.id AS source_id, sp.payment_number AS source_number, sp.supplier_id AS party_id,
        s.name AS party_name, sp.currency_code,
        sp.amount_minor - COALESCE((SELECT SUM(spa.foreign_amount_allocated) FROM supplier_payment_allocations spa
          INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
          WHERE spa.payment_id = sp.id AND MAX(sp.date, pi.invoice_date) <= @date), 0) AS foreign_open,
        sp.base_amount_minor - COALESCE((SELECT SUM(spa.settlement_base_amount) FROM supplier_payment_allocations spa
          INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
          WHERE spa.payment_id = sp.id AND MAX(sp.date, pi.invoice_date) <= @date), 0) AS carrying
      FROM supplier_payments sp INNER JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.document_status = 'posted' AND sp.currency_code <> @base AND sp.date <= @date
    ) WHERE foreign_open > 0 ORDER BY currency_code, source_number
  `).all(params) as RawExposure[];
  // Bank balances come straight from the ledger: the bank-currency amount and
  // the base carrying value (which already includes earlier revaluation pairs).
  const banks = sqlite.prepare(`
    SELECT * FROM (
      SELECT ba.id AS source_id, ba.name AS source_number, NULL AS party_id, NULL AS party_name,
        ba.currency_code, ba.ledger_account_id,
        COALESCE((SELECT SUM(COALESCE(jl.currency_amount_minor, 0)) FROM journal_lines jl
          INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
          WHERE jl.account_id = ba.ledger_account_id AND je.date <= @date), 0) AS foreign_open,
        COALESCE((SELECT SUM(jl.debit_minor - jl.credit_minor) FROM journal_lines jl
          INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
          WHERE jl.account_id = ba.ledger_account_id AND je.date <= @date), 0) AS carrying
      FROM bank_accounts ba WHERE ba.currency_code <> @base
    ) WHERE foreign_open <> 0 OR carrying <> 0 ORDER BY currency_code, source_number
  `).all(params) as (RawExposure & { ledger_account_id: string })[];

  const map = (rows: RawExposure[], kind: FxRevaluationKind, sourceType: string, accountId: (row: RawExposure) => string): Exposure[] =>
    rows.map((row) => ({
      kind, sourceType, sourceId: row.source_id, sourceNumber: row.source_number,
      partyId: row.party_id, partyName: row.party_name, accountId: accountId(row),
      currencyCode: row.currency_code, foreignOpenMinor: row.foreign_open, carryingBaseMinor: row.carrying,
    }));
  return [
    ...map(receivables, "receivable", "sales_invoice", () => ar),
    ...map(customerCredits, "customer_credit", "receipt", () => ar),
    ...map(payables, "payable", "purchase_invoice", () => ap),
    ...map(supplierCredits, "supplier_credit", "supplier_payment", () => ap),
    ...map(banks, "bank", "bank_account", (row) => (row as RawExposure & { ledger_account_id: string }).ledger_account_id),
  ];
}

type RawExposure = {
  source_id: string; source_number: string; party_id: string | null; party_name: string | null;
  currency_code: string; foreign_open: number; carrying: number;
};

/**
 * The adjustment is the signed debit to the balance-sheet account: an asset
 * (receivable, supplier advance, bank) is debited when it is worth more in
 * base; a liability (payable, customer advance) is debited when it is worth
 * less. Either way a positive adjustment is an unrealized gain.
 */
function adjustmentFor(kind: FxRevaluationKind, carrying: number, revalued: number) {
  return kind === "payable" || kind === "customer_credit" ? carrying - revalued : revalued - carrying;
}

function normalizeRates(rates: Record<string, string>) {
  const normalized: Record<string, string> = {};
  for (const [code, value] of Object.entries(rates)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    try {
      normalized[code.toUpperCase()] = validateExchangeRate(trimmed);
    } catch {
      throw new Error(`Enter a valid ${code.toUpperCase()} rate (base units per 1 ${code.toUpperCase()}).`);
    }
  }
  return normalized;
}

export function computeFxRevaluation(sqlite: Sqlite, date: string, inputRates: Record<string, string>): FxRevaluationPreview {
  const revaluationDate = isoDate.parse(date);
  const rates = normalizeRates(inputRates);
  const base = getBaseCurrency(sqlite);
  const currencies = new Map((sqlite.prepare("SELECT code, minor_unit FROM currencies").all() as { code: string; minor_unit: number }[])
    .map((row) => [row.code, row.minor_unit]));
  const accountNames = new Map((sqlite.prepare("SELECT id, name FROM accounts").all() as { id: string; name: string }[])
    .map((row) => [row.id, row.name]));
  const missing = new Set<string>();
  const lines: FxRevaluationLine[] = [];
  for (const exposure of openExposures(sqlite, revaluationDate)) {
    const minorUnit = currencies.get(exposure.currencyCode) ?? 2;
    const rate = rates[exposure.currencyCode];
    if (!rate) {
      missing.add(exposure.currencyCode);
      continue;
    }
    const revalued = convertToBase(exposure.foreignOpenMinor, minorUnit, base.minor_unit, rate);
    lines.push({
      ...exposure,
      accountName: accountNames.get(exposure.accountId) ?? exposure.accountId,
      currencyMinorUnit: minorUnit,
      rateToBase: rate,
      revaluedBaseMinor: revalued,
      adjustmentMinor: adjustmentFor(exposure.kind, exposure.carryingBaseMinor, revalued),
    });
  }
  const byAccount = new Map<string, { accountId: string; accountName: string; adjustmentMinor: number }>();
  for (const line of lines) {
    const entry = byAccount.get(line.accountId) ?? { accountId: line.accountId, accountName: line.accountName, adjustmentMinor: 0 };
    entry.adjustmentMinor += line.adjustmentMinor;
    byAccount.set(line.accountId, entry);
  }
  return {
    date: revaluationDate,
    reversalDate: nextDayIso(revaluationDate),
    baseCurrencyCode: base.code,
    rates,
    missingRates: [...missing].sort(),
    lines,
    accounts: [...byAccount.values()],
    netAdjustmentMinor: lines.reduce((sum, line) => sum + line.adjustmentMinor, 0),
    unrealizedAccountName: unrealizedFxAccount(sqlite, false).name,
  };
}

/** Foreign currencies with open balances, each prefilled with the latest stored rate on or before the date. */
export function getFxRevaluationRateDefaults(businessId: string, userId: string, date: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const revaluationDate = isoDate.parse(date);
  const base = getBaseCurrency(sqlite);
  const exposed = new Set(openExposures(sqlite, revaluationDate).map((row) => row.currencyCode));
  const currencies = sqlite.prepare(`
    SELECT code, name, minor_unit FROM currencies WHERE code <> ? AND (is_active = 1) ORDER BY code
  `).all(base.code) as { code: string; name: string; minor_unit: number }[];
  return currencies
    .filter((currency) => exposed.has(currency.code))
    .map((currency) => {
      const latest = sqlite.prepare(`
        SELECT rate_to_base, rate_date, source FROM exchange_rates
        WHERE currency_code = ? AND rate_date <= ?
        ORDER BY rate_date DESC, CASE source WHEN 'CBUAE' THEN 0 ELSE 1 END, created_at DESC LIMIT 1
      `).get(currency.code, revaluationDate) as { rate_to_base: string; rate_date: string; source: string } | undefined;
      return {
        code: currency.code, name: currency.name, minorUnit: currency.minor_unit,
        rateToBase: latest?.rate_to_base ?? "", rateDate: latest?.rate_date ?? null, source: latest?.source ?? null,
      };
    });
}

export function previewFxRevaluation(businessId: string, userId: string, input: FxRevaluationInput) {
  const data = fxRevaluationInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  return computeFxRevaluation(sqlite, data.date, data.rates);
}

export function postFxRevaluation(businessId: string, userId: string, input: FxRevaluationInput) {
  assertMutationPermission(businessId, userId, "accounting", "create", "post");
  const data = fxRevaluationInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const sqlite = context.sqlite;
  const id = randomUUID();
  let preview!: FxRevaluationPreview;
  let revaluationNumber = "";
  sqlite.transaction(() => {
    preview = computeFxRevaluation(sqlite, data.date, data.rates);
    assertDateNotLocked(sqlite, preview.date, "FX revaluation");
    assertDateNotLocked(sqlite, preview.reversalDate, "FX revaluation reversal");
    if (preview.missingRates.length) {
      throw new Error(`Enter a closing rate for ${preview.missingRates.join(", ")}.`);
    }
    const active = sqlite.prepare("SELECT revaluation_number FROM fx_revaluations WHERE date = ? AND status = 'posted'")
      .get(preview.date) as { revaluation_number: string } | undefined;
    if (active) throw new Error(`${active.revaluation_number} already revalues ${preview.date}. Void it before posting a new run.`);
    const adjusted = preview.lines.filter((line) => line.adjustmentMinor !== 0);
    if (adjusted.length === 0) throw new Error("Nothing to revalue: every open balance is already at these rates.");

    const unrealized = unrealizedFxAccount(sqlite, true);
    const count = (sqlite.prepare("SELECT COUNT(*) AS count FROM fx_revaluations").get() as { count: number }).count;
    revaluationNumber = `FXR-${String(count + 1).padStart(4, "0")}`;
    const description = `Unrealized FX revaluation ${revaluationNumber} at ${preview.date}`;
    const journalLines: JournalLineInput[] = adjusted.map((line) => {
      const amount = Math.abs(line.adjustmentMinor);
      return {
        accountId: line.accountId,
        description: `FX revaluation ${line.sourceNumber} (${line.currencyCode} @ ${line.rateToBase})`,
        ...(line.adjustmentMinor > 0 ? { debitMinor: amount } : { creditMinor: amount }),
        customerId: line.kind === "receivable" || line.kind === "customer_credit" ? line.partyId : null,
        supplierId: line.kind === "payable" || line.kind === "supplier_credit" ? line.partyId : null,
        reference: revaluationNumber,
        // Revaluation changes a bank's base value only, never its balance in its own currency.
        currencyAmountMinor: line.kind === "bank" ? 0 : null,
      };
    });
    if (preview.netAdjustmentMinor !== 0) {
      const amount = Math.abs(preview.netAdjustmentMinor);
      journalLines.push({
        accountId: unrealized.id,
        description: `${preview.netAdjustmentMinor > 0 ? "Unrealized FX gain" : "Unrealized FX loss"} ${revaluationNumber}`,
        ...(preview.netAdjustmentMinor > 0 ? { creditMinor: amount } : { debitMinor: amount }),
        reference: revaluationNumber,
      });
    }
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO fx_revaluations (
        id, revaluation_number, date, reversal_date, rates_json, net_adjustment_minor,
        status, notes, created_by, created_at, voided_by, voided_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, NULL, NULL)
    `).run(id, revaluationNumber, preview.date, preview.reversalDate, JSON.stringify(preview.rates),
      preview.netAdjustmentMinor, data.notes || null, userId, now);
    const insertLine = sqlite.prepare(`
      INSERT INTO fx_revaluation_lines (
        id, revaluation_id, kind, source_type, source_id, source_number, party_id, party_name,
        account_id, currency_code, foreign_open_minor, carrying_base_minor, rate_to_base,
        revalued_base_minor, adjustment_minor, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    preview.lines.forEach((line, position) => insertLine.run(
      randomUUID(), id, line.kind, line.sourceType, line.sourceId, line.sourceNumber, line.partyId, line.partyName,
      line.accountId, line.currencyCode, line.foreignOpenMinor, line.carryingBaseMinor, line.rateToBase,
      line.revaluedBaseMinor, line.adjustmentMinor, position,
    ));
    postTransaction(sqlite, { sourceType: "fx_revaluation", sourceId: id, date: preview.date, description, lines: journalLines });
    reverseTransaction(sqlite, {
      originalSourceType: "fx_revaluation", originalSourceId: id,
      reversalSourceType: "fx_revaluation_reversal", reversalSourceId: id,
      date: preview.reversalDate, description: `Reverse ${description}`,
    });
  }).immediate();

  recordActivity(businessId, {
    userId,
    action: "posted",
    entityType: "fx_revaluation",
    entityId: id,
    entityNumber: revaluationNumber,
    summary: `Posted FX revaluation ${revaluationNumber} at ${preview.date} (net ${preview.netAdjustmentMinor >= 0 ? "gain" : "loss"} ${Math.abs(preview.netAdjustmentMinor)} minor ${preview.baseCurrencyCode}), reversing ${preview.reversalDate}`,
    details: { date: preview.date, reversalDate: preview.reversalDate, rates: preview.rates, netAdjustmentMinor: preview.netAdjustmentMinor, lines: preview.lines.length },
  });
  return { id, revaluationNumber, netAdjustmentMinor: preview.netAdjustmentMinor };
}

/**
 * Voiding cancels both the revaluation and its reversal on their own dates, so
 * every period is restored exactly; both dates must still be open.
 */
export function voidFxRevaluation(businessId: string, userId: string, revaluationId: string) {
  assertMutationPermission(businessId, userId, "accounting", "delete");
  const { sqlite } = getBusinessDb(businessId, userId);
  const run = sqlite.prepare("SELECT id, revaluation_number, date, reversal_date, status FROM fx_revaluations WHERE id = ?")
    .get(revaluationId) as { id: string; revaluation_number: string; date: string; reversal_date: string; status: string } | undefined;
  if (!run) throw new Error("FX revaluation not found.");
  if (run.status !== "posted") throw new Error("Only a posted FX revaluation can be voided.");
  sqlite.transaction(() => {
    assertDateNotLocked(sqlite, run.date, "FX revaluation void");
    assertDateNotLocked(sqlite, run.reversal_date, "FX revaluation void");
    reverseTransaction(sqlite, {
      originalSourceType: "fx_revaluation", originalSourceId: run.id,
      reversalSourceType: "fx_revaluation_void", reversalSourceId: run.id,
      date: run.date, description: `Void FX revaluation ${run.revaluation_number}`,
    });
    reverseTransaction(sqlite, {
      originalSourceType: "fx_revaluation_reversal", originalSourceId: run.id,
      reversalSourceType: "fx_revaluation_reversal_void", reversalSourceId: run.id,
      date: run.reversal_date, description: `Void reversal of FX revaluation ${run.revaluation_number}`,
    });
    const now = new Date().toISOString();
    sqlite.prepare("UPDATE fx_revaluations SET status = 'void', voided_by = ?, voided_at = ? WHERE id = ?")
      .run(userId, now, run.id);
  }).immediate();
  recordActivity(businessId, {
    userId,
    action: "voided",
    entityType: "fx_revaluation",
    entityId: run.id,
    entityNumber: run.revaluation_number,
    summary: `Voided FX revaluation ${run.revaluation_number} at ${run.date}`,
  });
}

export type FxRevaluationRun = {
  id: string; revaluation_number: string; date: string; reversal_date: string; rates_json: string;
  net_adjustment_minor: number; status: "posted" | "void"; notes: string | null;
  created_at: string; voided_at: string | null; line_count: number;
  journal_entry_id: string | null; reversal_journal_entry_id: string | null;
};

export function listFxRevaluations(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT fr.*, (SELECT COUNT(*) FROM fx_revaluation_lines frl WHERE frl.revaluation_id = fr.id AND frl.adjustment_minor <> 0) AS line_count,
      (SELECT je.id FROM journal_entries je WHERE je.source_type = 'fx_revaluation' AND je.source_id = fr.id) AS journal_entry_id,
      (SELECT je.id FROM journal_entries je WHERE je.source_type = 'fx_revaluation_reversal' AND je.source_id = fr.id) AS reversal_journal_entry_id
    FROM fx_revaluations fr ORDER BY fr.date DESC, fr.created_at DESC
  `).all() as FxRevaluationRun[];
}

export function getFxRevaluationLines(businessId: string, userId: string, revaluationId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT frl.*, a.name AS account_name, c.minor_unit AS currency_minor_unit
    FROM fx_revaluation_lines frl
    INNER JOIN accounts a ON a.id = frl.account_id
    LEFT JOIN currencies c ON c.code = frl.currency_code
    WHERE frl.revaluation_id = ? ORDER BY frl.position
  `).all(revaluationId) as {
    id: string; kind: FxRevaluationKind; source_type: string; source_id: string; source_number: string;
    party_name: string | null; account_name: string; currency_code: string; currency_minor_unit: number | null;
    foreign_open_minor: number; carrying_base_minor: number; rate_to_base: string;
    revalued_base_minor: number; adjustment_minor: number;
  }[];
}
