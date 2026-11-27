import type Database from "better-sqlite3";
import { getBusinessDb } from "@/core/db/business";
import { getBusinessTodayIso } from "@/core/format";

/**
 * AR / AP aging as of a date, with a tie-out to the GL control account.
 *
 * A document counts at the as-of date when it is dated on/before it and was
 * live then: still posted, or voided by a reversal dated after the as-of date
 * (voids post their reversal on the void date, so the GL still carries the
 * document before that). An allocation reduces a document once both sides
 * exist, i.e. on the later of the two document dates — the same date
 * settlement uses for any realized FX it books on a later credit application.
 * Unapplied receipts / payments / debit notes are listed as credit rows so the
 * report total is the subledger balance that should equal the control account.
 */

export type AgingBucket = "Current" | "1–30" | "31–60" | "61–90" | "90+" | "Credit";
export const agingBucketOrder: AgingBucket[] = ["Current", "1–30", "31–60", "61–90", "90+", "Credit"];

export type AgingRow = {
  /** "invoice" for open documents; the other kinds are unapplied credits. */
  document_kind: "invoice" | "receipt" | "credit_note" | "payment" | "debit_note";
  party_id: string;
  party_name: string;
  document_id: string;
  document_number: string;
  document_date: string;
  due_date: string;
  currency_code: string;
  /** Open amount in document currency (negative for unapplied credits). */
  foreign_open_minor: number;
  /** Open carrying amount in base currency (negative for unapplied credits). */
  base_carrying_minor: number;
  age_days: number;
  age_bucket: AgingBucket;
  unpaid_minor: number;
  overdue_minor: number;
  total_minor: number;
};

export type AgingTieOut = {
  controlAccountId: string | null;
  controlAccountName: string | null;
  subledgerMinor: number;
  glMinor: number;
  differenceMinor: number;
};

export type AgingReport = {
  asOfDate: string;
  rows: AgingRow[];
  bucketTotals: Record<AgingBucket, number>;
  tieOut: AgingTieOut;
};

export type AgingOptions = {
  /**
   * Keep documents dated after the as-of date (legacy "everything open" view);
   * ages are still measured from the as-of date. The tie-out is then not
   * meaningful and should not be shown.
   */
  includeFutureDated?: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveAsOfDate(value?: string | null) {
  if (value && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return value;
  return getBusinessTodayIso();
}

/** SQL predicate: `alias` was live (posted, or not yet voided) at @asOf. Constant inputs only. */
function liveAtSql(alias: string, voidSourceType: string) {
  return `(${alias}.document_status = 'posted' OR (${alias}.document_status = 'void' AND COALESCE(
    (SELECT MIN(vje.date) FROM journal_entries vje WHERE vje.source_type = '${voidSourceType}' AND vje.source_id = ${alias}.id),
    '0000-00-00') > @asOf))`;
}

function laterDateSql(a: string, b: string) {
  return `CASE WHEN ${a} > ${b} THEN ${a} ELSE ${b} END`;
}

function ageOf(asOf: string, dueDate: string) {
  return Math.max(0, Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000));
}

function bucketFor(asOf: string, dueDate: string): AgingBucket {
  if (!dueDate || dueDate >= asOf) return "Current";
  const days = ageOf(asOf, dueDate);
  return days <= 30 ? "1–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : "90+";
}

type RawRow = Omit<AgingRow, "age_days" | "age_bucket" | "unpaid_minor" | "overdue_minor" | "total_minor">;

function finish(asOf: string, rows: RawRow[]): Pick<AgingReport, "rows" | "bucketTotals"> {
  const bucketTotals = Object.fromEntries(agingBucketOrder.map((bucket) => [bucket, 0])) as Record<AgingBucket, number>;
  const result = rows.map((row): AgingRow => {
    const isCredit = row.document_kind !== "invoice";
    const dueDate = row.due_date || row.document_date;
    const age_bucket: AgingBucket = isCredit ? "Credit" : bucketFor(asOf, dueDate);
    bucketTotals[age_bucket] += row.base_carrying_minor;
    const overdue = !isCredit && dueDate < asOf;
    return {
      ...row,
      age_days: isCredit ? 0 : dueDate < asOf ? ageOf(asOf, dueDate) : 0,
      age_bucket,
      unpaid_minor: overdue ? 0 : row.base_carrying_minor,
      overdue_minor: overdue ? row.base_carrying_minor : 0,
      total_minor: row.base_carrying_minor,
    };
  });
  return { rows: result, bucketTotals };
}

function controlBalance(
  sqlite: Database.Database,
  accountColumn: "accounts_receivable_account_id" | "accounts_payable_account_id",
  asOf: string,
  normal: "debit" | "credit",
) {
  const account = sqlite.prepare(`
    SELECT a.id, a.name FROM business_accounting_settings s
    INNER JOIN accounts a ON a.id = s.${accountColumn}
    WHERE s.id = 'default'
  `).get() as { id: string; name: string } | undefined;
  if (!account) return { id: null, name: null, balance: 0 };
  const row = sqlite.prepare(`
    SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = ? AND je.status = 'posted' AND je.date <= ?
  `).get(account.id, asOf) as { balance: number };
  return { id: account.id, name: account.name, balance: normal === "debit" ? row.balance : -row.balance };
}

function tieOut(subledgerMinor: number, control: ReturnType<typeof controlBalance>): AgingTieOut {
  return {
    controlAccountId: control.id,
    controlAccountName: control.name,
    subledgerMinor,
    glMinor: control.balance,
    differenceMinor: subledgerMinor - control.balance,
  };
}

export function getReceivablesAging(
  businessId: string,
  userId: string,
  asOfDate?: string | null,
  options: AgingOptions = {},
): AgingReport {
  const { sqlite } = getBusinessDb(businessId, userId);
  const asOf = resolveAsOfDate(asOfDate);
  const cutoff = options.includeFutureDated ? "9999-12-31" : asOf;
  const liveInvoice = liveAtSql("i", "sales_invoice_void");
  const liveReceipt = liveAtSql("r", "receipt_void");
  const liveCredit = liveAtSql("cn", "sales_credit_note_void");
  const rows = sqlite.prepare(`
    WITH receipt_alloc AS (
      SELECT ra.receipt_id, ra.sales_invoice_id,
        COALESCE(ra.foreign_amount_allocated, ra.amount_minor) AS foreign_minor,
        COALESCE(ra.base_carrying_amount_released, ra.amount_minor) AS released_minor,
        COALESCE(ra.settlement_base_amount, ra.base_carrying_amount_released, ra.amount_minor) AS settlement_minor
      FROM receipt_allocations ra
      INNER JOIN receipts r ON r.id = ra.receipt_id
      INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
      WHERE r.date <= @asOf AND ${liveReceipt}
        AND ${laterDateSql("i.invoice_date", "r.date")} <= @asOf
    ),
    credit_alloc AS (
      SELECT scna.credit_note_id, scna.sales_invoice_id,
        COALESCE(scna.foreign_amount_allocated, scna.amount_minor) AS foreign_minor,
        COALESCE(scna.base_carrying_amount_released, scna.amount_minor) AS released_minor
      FROM sales_credit_note_allocations scna
      INNER JOIN sales_credit_notes cn ON cn.id = scna.credit_note_id
      INNER JOIN sales_invoices i ON i.id = scna.sales_invoice_id
      WHERE cn.date <= @asOf AND ${liveCredit}
        AND ${laterDateSql("i.invoice_date", "cn.date")} <= @asOf
    )
    SELECT 'invoice' AS document_kind, c.id AS party_id, c.name AS party_name, i.id AS document_id,
      i.invoice_number AS document_number, i.invoice_date AS document_date, COALESCE(NULLIF(i.due_date, ''), i.invoice_date) AS due_date,
      i.currency_code,
      i.total_minor
        - COALESCE((SELECT SUM(foreign_minor) FROM receipt_alloc WHERE sales_invoice_id = i.id), 0)
        - COALESCE((SELECT SUM(foreign_minor) FROM credit_alloc WHERE sales_invoice_id = i.id), 0) AS foreign_open_minor,
      i.base_total_minor
        - COALESCE((SELECT SUM(released_minor) FROM receipt_alloc WHERE sales_invoice_id = i.id), 0)
        - COALESCE((SELECT SUM(released_minor) FROM credit_alloc WHERE sales_invoice_id = i.id), 0) AS base_carrying_minor
    FROM sales_invoices i INNER JOIN customers c ON c.id = i.customer_id
    WHERE i.invoice_date <= @asOf AND ${liveInvoice}
    UNION ALL
    SELECT 'receipt', c.id, c.name, r.id, r.receipt_number, r.date, r.date, r.currency_code,
      -(r.amount_minor - COALESCE((SELECT SUM(foreign_minor) FROM receipt_alloc WHERE receipt_id = r.id), 0)),
      -(r.base_amount_minor - COALESCE((SELECT SUM(settlement_minor) FROM receipt_alloc WHERE receipt_id = r.id), 0))
    FROM receipts r INNER JOIN customers c ON c.id = r.customer_id
    WHERE r.date <= @asOf AND ${liveReceipt}
    UNION ALL
    SELECT 'credit_note', c.id, c.name, cn.id, cn.credit_note_number, cn.date, cn.date, cn.currency_code,
      -(cn.total_minor - COALESCE((SELECT SUM(foreign_minor) FROM credit_alloc WHERE credit_note_id = cn.id), 0)),
      -(cn.base_total_minor - COALESCE((SELECT SUM(released_minor) FROM credit_alloc WHERE credit_note_id = cn.id), 0))
    FROM sales_credit_notes cn INNER JOIN customers c ON c.id = cn.customer_id
    WHERE cn.date <= @asOf AND ${liveCredit}
  `).all({ asOf: cutoff }) as RawRow[];

  const open = rows
    .filter((row) => row.document_kind === "invoice" ? row.foreign_open_minor > 0 : row.foreign_open_minor < 0 || row.base_carrying_minor !== 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.document_number.localeCompare(b.document_number));
  const finished = finish(asOf, open);
  const subledger = finished.rows.reduce((sum, row) => sum + row.base_carrying_minor, 0);
  return { asOfDate: asOf, ...finished, tieOut: tieOut(subledger, controlBalance(sqlite, "accounts_receivable_account_id", asOf, "debit")) };
}

export function getPayablesAging(
  businessId: string,
  userId: string,
  asOfDate?: string | null,
  options: AgingOptions = {},
): AgingReport {
  const { sqlite } = getBusinessDb(businessId, userId);
  const asOf = resolveAsOfDate(asOfDate);
  const cutoff = options.includeFutureDated ? "9999-12-31" : asOf;
  const liveInvoice = liveAtSql("pi", "purchase_invoice_void");
  const livePayment = liveAtSql("sp", "supplier_payment_void");
  const liveDebit = liveAtSql("dn", "debit_note_void");
  const rows = sqlite.prepare(`
    WITH payment_alloc AS (
      SELECT spa.payment_id, spa.purchase_invoice_id,
        COALESCE(spa.foreign_amount_allocated, spa.amount_minor) AS foreign_minor,
        COALESCE(spa.base_carrying_amount_released, spa.amount_minor) AS released_minor,
        COALESCE(spa.settlement_base_amount, spa.base_carrying_amount_released, spa.amount_minor) AS settlement_minor
      FROM supplier_payment_allocations spa
      INNER JOIN supplier_payments sp ON sp.id = spa.payment_id
      INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
      WHERE sp.date <= @asOf AND ${livePayment}
        AND ${laterDateSql("pi.invoice_date", "sp.date")} <= @asOf
    ),
    debit_alloc AS (
      SELECT dn.id AS debit_note_id, dn.purchase_invoice_id, dn.total_minor AS foreign_minor, dn.base_total_minor AS released_minor
      FROM debit_notes dn
      INNER JOIN purchase_invoices pi ON pi.id = dn.purchase_invoice_id
      WHERE dn.debit_note_date <= @asOf AND ${liveDebit}
        AND ${laterDateSql("pi.invoice_date", "dn.debit_note_date")} <= @asOf
    )
    SELECT 'invoice' AS document_kind, s.id AS party_id, s.name AS party_name, pi.id AS document_id,
      pi.internal_number AS document_number, pi.invoice_date AS document_date, COALESCE(NULLIF(pi.due_date, ''), pi.invoice_date) AS due_date,
      pi.currency_code,
      pi.total_minor
        - COALESCE((SELECT SUM(foreign_minor) FROM payment_alloc WHERE purchase_invoice_id = pi.id), 0)
        - COALESCE((SELECT SUM(foreign_minor) FROM debit_alloc WHERE purchase_invoice_id = pi.id), 0) AS foreign_open_minor,
      pi.base_total_minor
        - COALESCE((SELECT SUM(released_minor) FROM payment_alloc WHERE purchase_invoice_id = pi.id), 0)
        - COALESCE((SELECT SUM(released_minor) FROM debit_alloc WHERE purchase_invoice_id = pi.id), 0) AS base_carrying_minor
    FROM purchase_invoices pi INNER JOIN suppliers s ON s.id = pi.supplier_id
    WHERE pi.invoice_date <= @asOf AND ${liveInvoice}
    UNION ALL
    SELECT 'payment', s.id, s.name, sp.id, sp.payment_number, sp.date, sp.date, sp.currency_code,
      -(sp.amount_minor - COALESCE((SELECT SUM(foreign_minor) FROM payment_alloc WHERE payment_id = sp.id), 0)),
      -(sp.base_amount_minor - COALESCE((SELECT SUM(settlement_minor) FROM payment_alloc WHERE payment_id = sp.id), 0))
    FROM supplier_payments sp INNER JOIN suppliers s ON s.id = sp.supplier_id
    WHERE sp.date <= @asOf AND ${livePayment}
    UNION ALL
    SELECT 'debit_note', s.id, s.name, dn.id, dn.debit_note_number, dn.debit_note_date, dn.debit_note_date, dn.currency_code,
      -dn.total_minor, -dn.base_total_minor
    FROM debit_notes dn INNER JOIN suppliers s ON s.id = dn.supplier_id
    WHERE dn.debit_note_date <= @asOf AND ${liveDebit}
      AND NOT EXISTS (SELECT 1 FROM debit_alloc da WHERE da.debit_note_id = dn.id)
  `).all({ asOf: cutoff }) as RawRow[];

  const open = rows
    .filter((row) => row.document_kind === "invoice" ? row.foreign_open_minor > 0 : row.foreign_open_minor < 0 || row.base_carrying_minor !== 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.document_number.localeCompare(b.document_number));
  const finished = finish(asOf, open);
  const subledger = finished.rows.reduce((sum, row) => sum + row.base_carrying_minor, 0);
  return { asOfDate: asOf, ...finished, tieOut: tieOut(subledger, controlBalance(sqlite, "accounts_payable_account_id", asOf, "credit")) };
}
