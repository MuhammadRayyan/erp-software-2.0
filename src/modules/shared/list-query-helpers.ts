import type Database from "better-sqlite3";
import { normalizeInvoiceStatusToken, type ListSortDir } from "@/lib/list-query-params";

export type CurrencyBucketTotal = {
  currencyCode: string;
  currencyMinorUnit: number;
  totalMinor: number;
  balanceMinor: number;
  hasPosted?: boolean;
};

export type InvoiceListSummary = {
  unfilteredTotal: number;
  filteredTotal: number;
  overdueCount: number;
  currencyTotals: CurrencyBucketTotal[];
};

export type CashDocumentListSummary = {
  unfilteredTotal: number;
  filteredTotal: number;
  postedCount: number;
  totalBaseAmountMinor: number;
  currencyTotals: Array<{
    currencyCode: string;
    currencyMinorUnit: number;
    amountMinor: number;
  }>;
};

export const DEFAULT_LIST_PAGE_SIZE = 50;
export const MAX_LIST_PAGE_SIZE = 200;

export function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

export function validIsoDate(value?: string): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/**
 * Escape `%`, `_`, and `\` so SQLite `LIKE ... ESCAPE '\'` searches treat user
 * input as a literal substring match.
 */
export function escapeSqlLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

export function buildLikePattern(rawQuery?: string): string | undefined {
  const trimmed = rawQuery?.trim();
  if (!trimmed) return undefined;
  return `%${escapeSqlLike(trimmed.toLowerCase())}%`;
}

/**
 * Build SQL WHERE clauses and parameter bindings for unified document & payment
 * status filters across both Sales Invoices and Purchase Invoices.
 */
export function pushInvoiceStatusConditions(
  rawStatus: string | undefined,
  options: {
    tableAlias: string;
    allocatedExpr: string;
    businessToday: string;
    conditions: string[];
    values: Array<string | number>;
  },
): { normalizedStatus: string; isVoidFilter: boolean } {
  const normalizedStatus = normalizeInvoiceStatusToken(rawStatus);
  if (!normalizedStatus) {
    return { normalizedStatus: "", isVoidFilter: false };
  }

  const { tableAlias, allocatedExpr, businessToday, conditions, values } = options;
  switch (normalizedStatus) {
    case "document:draft":
      conditions.push(`${tableAlias}.document_status = 'draft'`);
      return { normalizedStatus, isVoidFilter: false };
    case "document:pending_approval":
      conditions.push(`${tableAlias}.document_status = 'pending_approval'`);
      return { normalizedStatus, isVoidFilter: false };
    case "document:posted":
      conditions.push(`${tableAlias}.document_status = 'posted'`);
      return { normalizedStatus, isVoidFilter: false };
    case "document:void":
      conditions.push(`${tableAlias}.document_status = 'void'`);
      return { normalizedStatus, isVoidFilter: true };
    case "payment:paid":
      conditions.push(`${tableAlias}.document_status = 'posted'`);
      conditions.push(`${tableAlias}.total_minor <= (${allocatedExpr})`);
      return { normalizedStatus, isVoidFilter: false };
    case "payment:open":
      conditions.push(`${tableAlias}.document_status = 'posted'`);
      conditions.push(`${tableAlias}.total_minor > (${allocatedExpr})`);
      return { normalizedStatus, isVoidFilter: false };
    case "payment:unpaid":
      conditions.push(`${tableAlias}.document_status = 'posted'`);
      conditions.push(`${tableAlias}.total_minor > (${allocatedExpr})`);
      conditions.push(`(${allocatedExpr}) = 0`);
      conditions.push(`${tableAlias}.due_date >= ?`);
      values.push(businessToday);
      return { normalizedStatus, isVoidFilter: false };
    case "payment:partially_paid":
      conditions.push(`${tableAlias}.document_status = 'posted'`);
      conditions.push(`(${allocatedExpr}) > 0`);
      conditions.push(`${tableAlias}.total_minor > (${allocatedExpr})`);
      conditions.push(`${tableAlias}.due_date >= ?`);
      values.push(businessToday);
      return { normalizedStatus, isVoidFilter: false };
    case "payment:overdue":
      conditions.push(`${tableAlias}.document_status = 'posted'`);
      conditions.push(`${tableAlias}.total_minor > (${allocatedExpr})`);
      conditions.push(`${tableAlias}.due_date < ?`);
      values.push(businessToday);
      return { normalizedStatus, isVoidFilter: false };
    default:
      return { normalizedStatus: "", isVoidFilter: false };
  }
}

/**
 * Resolve a client sort key through an explicit column whitelist so user query
 * parameters can never inject raw SQL identifiers.
 */
export function resolveSortSql(
  sortKey: string | undefined,
  dir: ListSortDir | undefined,
  columnMap: Record<string, string>,
  defaultOrderBy: string,
): string {
  const direction = dir === "asc" ? "ASC" : "DESC";
  if (sortKey && Object.hasOwn(columnMap, sortKey)) {
    const expr = columnMap[sortKey];
    return `${expr} ${direction}, ${defaultOrderBy}`;
  }
  return defaultOrderBy;
}

export type CashDocumentFilters = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: ListSortDir;
  take?: number;
  skip?: number;
  page?: number;
  pageSize?: number;
};

const VALID_CASH_DOC_STATUSES = new Set(["draft", "pending_approval", "posted", "void"]);

/**
 * Shared SQLite query helper for Receipts and Supplier Payments (`rows` +
 * paginated DB-wide `summary`) so both modules share identical filtering,
 * sorting, and multi-currency aggregation semantics.
 */
export function buildCashDocumentWhere(
  filters: CashDocumentFilters | undefined,
  cfg: { docAlias: string; numberCol: string; partyAlias: string },
) {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  const normalizedStatus = filters?.status && VALID_CASH_DOC_STATUSES.has(filters.status) ? filters.status : "";
  if (normalizedStatus) {
    conditions.push(`${cfg.docAlias}.document_status = ?`);
    values.push(normalizedStatus);
  }
  const likePattern = buildLikePattern(filters?.q);
  if (likePattern) {
    conditions.push(
      `(lower(${cfg.docAlias}.${cfg.numberCol}) LIKE ? ESCAPE '\\' OR lower(${cfg.partyAlias}.name) LIKE ? ESCAPE '\\' OR lower(a.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(${cfg.docAlias}.reference, '')) LIKE ? ESCAPE '\\')`,
    );
    values.push(likePattern, likePattern, likePattern, likePattern);
  }
  const dateFrom = validIsoDate(filters?.from);
  const dateTo = validIsoDate(filters?.to);
  if (dateFrom) {
    conditions.push(`${cfg.docAlias}.date >= ?`);
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`${cfg.docAlias}.date <= ?`);
    values.push(dateTo);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
    isVoidFilter: normalizedStatus === "void",
  };
}

export function queryCashDocumentSummary(
  sqlite: Database.Database,
  filters: CashDocumentFilters | undefined,
  cfg: { tableName: string; docAlias: string; numberCol: string; partyTable: string; partyAlias: string; partyFk: string },
): CashDocumentListSummary {
  const { where, values, isVoidFilter } = buildCashDocumentWhere(filters, cfg);
  const unfilteredRow = sqlite.prepare(`SELECT COUNT(*) AS total FROM ${cfg.tableName}`).get() as { total: number };
  const summaryRows = sqlite
    .prepare(`
      SELECT
        ${cfg.docAlias}.currency_code,
        cur.minor_unit AS currency_minor_unit,
        COUNT(*) AS row_count,
        SUM(CASE WHEN ${cfg.docAlias}.document_status = 'posted' THEN 1 ELSE 0 END) AS posted_count,
        SUM(CASE WHEN ? = 1 OR ${cfg.docAlias}.document_status <> 'void' THEN ${cfg.docAlias}.amount_minor ELSE 0 END) AS amount_minor,
        SUM(CASE WHEN ? = 1 OR ${cfg.docAlias}.document_status <> 'void' THEN ${cfg.docAlias}.base_amount_minor ELSE 0 END) AS base_amount_minor
      FROM ${cfg.tableName} ${cfg.docAlias}
      INNER JOIN ${cfg.partyTable} ${cfg.partyAlias} ON ${cfg.partyAlias}.id = ${cfg.docAlias}.${cfg.partyFk}
      INNER JOIN accounts a ON a.id = ${cfg.docAlias}.bank_account_id
      INNER JOIN currencies cur ON cur.code = ${cfg.docAlias}.currency_code
      ${where}
      GROUP BY ${cfg.docAlias}.currency_code, cur.minor_unit
      ORDER BY ${cfg.docAlias}.currency_code ASC
    `)
    .all(isVoidFilter ? 1 : 0, isVoidFilter ? 1 : 0, ...values) as Array<{
    currency_code: string;
    currency_minor_unit: number;
    row_count: number;
    posted_count: number;
    amount_minor: number;
    base_amount_minor: number;
  }>;

  return {
    unfilteredTotal: unfilteredRow.total,
    filteredTotal: summaryRows.reduce((s, r) => s + Number(r.row_count || 0), 0),
    postedCount: summaryRows.reduce((s, r) => s + Number(r.posted_count || 0), 0),
    totalBaseAmountMinor: summaryRows.reduce((s, r) => s + Number(r.base_amount_minor || 0), 0),
    currencyTotals: summaryRows.map((row) => ({
      currencyCode: row.currency_code,
      currencyMinorUnit: row.currency_minor_unit,
      amountMinor: Number(row.amount_minor || 0),
    })),
  };
}

/**
 * Shared SQLite CTE aggregating posted receipt and credit-note settlements
 * per sales invoice in both document currency and base carrying amount.
 */
export const SALES_ALLOCATED_CTE = `
  receipt_alloc AS (
    SELECT ra.sales_invoice_id AS invoice_id,
      SUM(ra.amount_minor) AS foreign_minor,
      SUM(ra.base_carrying_amount_released) AS base_minor
    FROM receipt_allocations ra
    INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
    GROUP BY ra.sales_invoice_id
  ),
  credit_alloc AS (
    SELECT scna.sales_invoice_id AS invoice_id,
      SUM(scna.amount_minor) AS foreign_minor,
      SUM(scna.base_carrying_amount_released) AS base_minor
    FROM sales_credit_note_allocations scna
    INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
    GROUP BY scna.sales_invoice_id
  )
`;

export const SALES_ALLOCATED_FOREIGN_EXPR = "COALESCE(ra.foreign_minor, 0) + COALESCE(ca.foreign_minor, 0)";
export const SALES_ALLOCATED_BASE_EXPR = "COALESCE(ra.base_minor, 0) + COALESCE(ca.base_minor, 0)";


