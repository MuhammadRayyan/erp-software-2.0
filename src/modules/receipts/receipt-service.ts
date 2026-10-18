import { createSettlement, voidSettlement, applySettlementCredit, type SettlementConfig } from "@/modules/settlement/settlement-service";
import { getBusinessDb } from "@/core/db/business";
import { postReceipt } from "@/modules/accounting/services/receipt-posting-service";
import {
  receiptInputSchema,
  applyReceiptCreditInputSchema,
  type ReceiptInput,
  type ApplyReceiptCreditInput,
} from "./receipt-input";
import { recordActivity } from "@/modules/activity-log/activity-log-service";

export const receiptConfig: SettlementConfig = {
  partyType: "customer",
  partyTable: "customers",
  partyIdColumn: "customer_id",
  documentTable: "sales_invoices",
  documentIdColumn: "sales_invoice_id",
  documentNumberColumn: "invoice_number",
  openAmountExpr: `
    SELECT i.total_minor - COALESCE(SUM(
      CASE WHEN r.document_status = 'posted' THEN ra.foreign_amount_allocated ELSE 0 END
    ), 0) - COALESCE((
      SELECT SUM(scna.foreign_amount_allocated)
      FROM sales_credit_note_allocations scna
      INNER JOIN sales_credit_notes scn
        ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
      WHERE scna.sales_invoice_id = i.id
    ), 0) AS foreign_open_minor,
    i.base_total_minor - COALESCE(SUM(
      CASE WHEN r.document_status = 'posted' THEN ra.base_carrying_amount_released ELSE 0 END
    ), 0) - COALESCE((
      SELECT SUM(scna.base_carrying_amount_released)
      FROM sales_credit_note_allocations scna
      INNER JOIN sales_credit_notes scn
        ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
      WHERE scna.sales_invoice_id = i.id
    ), 0) AS base_carrying_minor
    FROM sales_invoices i
    LEFT JOIN receipt_allocations ra ON ra.sales_invoice_id = i.id
    LEFT JOIN receipts r ON r.id = ra.receipt_id
    WHERE i.id = ? GROUP BY i.id
  `,
  paymentTable: "receipts",
  paymentNumberColumn: "receipt_number",
  allocationTable: "receipt_allocations",
  allocationPaymentIdColumn: "receipt_id",
  postSettlement: postReceipt,
};


export function createReceipt(businessId: string, userId: string, input: ReceiptInput) {
  const data = receiptInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  let result!: ReturnType<typeof createSettlement>;
  context.sqlite.transaction(() => {
    result = createSettlement(context.sqlite, receiptConfig, data, userId);
  }).immediate();

  const receiptRow = context.sqlite
    .prepare("SELECT receipt_number FROM receipts WHERE id = ?")
    .get(result.id) as { receipt_number: string } | undefined;
  const receiptNumber = receiptRow?.receipt_number || "Receipt";

  recordActivity(businessId, {
    userId,
    action: "posted",
    entityType: "receipt",
    entityId: result.id,
    entityNumber: receiptNumber,
    summary: `Recorded payment receipt ${receiptNumber} for ${data.currencyCode} ${data.amount}`,
    details: { customerId: data.customerId, amount: data.amount, currency: data.currencyCode },
  });

  return result;
}

export type ReceiptListFilters = {
  /** Inclusive lower bound on receipt date (YYYY-MM-DD). Invalid values are ignored. */
  from?: string;
  /** Inclusive upper bound on receipt date (YYYY-MM-DD). Invalid values are ignored. */
  to?: string;
  /** Maximum rows to return (server-side LIMIT). Used by the paginated list path. */
  take?: number;
  /** Number of rows to skip (server-side OFFSET). Used by the paginated list path. */
  skip?: number;
};

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

type ReceiptListRow = {
  id: string;
  receipt_number: string;
  date: string;
  amount_minor: number;
  base_amount_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  reference: string | null;
  document_status: "posted" | "void";
  created_at: string;
  customer_id: string;
  customer_name: string;
  bank_account_id: string;
  bank_account_name: string;
};

/**
 * Paginated receipt list result. The rows slice contains just the rows for
 * the requested page; `total` is the unfiltered-over-rows count for the same
 * `filters` so the UI can show "Page X of Y".
 */
export type PaginatedReceipts = {
  rows: ReceiptListRow[];
  total: number;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

/**
 * Count receipts matching `filters` using the same WHERE-clause builder as
 * `listReceipts`. Returns the row count used by `listReceiptsPaginated` to
 * compute total pages.
 */
function countReceiptRows(businessId: string, userId: string, filters?: ReceiptListFilters): number {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  const dateFrom = validDate(filters?.from);
  const dateTo = validDate(filters?.to);
  if (dateFrom) {
    conditions.push("r.date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("r.date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = sqlite.prepare(`SELECT COUNT(*) AS total FROM receipts r ${where}`).get(...values) as { total: number };
  return row.total;
}

/**
 * Paginated list of receipts for the list page. Server-side LIMIT/OFFSET
 * keeps the query cheap as the receipts table grows. The returned `total`
 * is the count for the same `filters` excluding the page bounds.
 *
 * @param page 1-indexed page number (clamped to >= 1).
 * @param pageSize rows per page (defaults to 50, capped at 200).
 */
export function listReceiptsPaginated(
  businessId: string,
  userId: string,
  filters: ReceiptListFilters & { page?: number; pageSize?: number } = {},
): PaginatedReceipts {
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const total = countReceiptRows(businessId, userId, filters);
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;
  const rows = listReceipts(businessId, userId, { ...filters, take: pageSize, skip: offset });
  return { rows, total, page: effectivePage, pageSize, totalPages: maxPage };
}

export function listReceipts(businessId: string, userId: string, filters?: ReceiptListFilters): ReceiptListRow[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  const dateFrom = validDate(filters?.from);
  const dateTo = validDate(filters?.to);
  if (dateFrom) {
    conditions.push("r.date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("r.date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  // Server-side LIMIT/OFFSET supports the paginated list path. When both
  // are undefined the query returns the full result set (used by per-customer
  // drill-downs, reports, etc.).
  const limitClause = filters?.take !== undefined && Number.isFinite(filters.take) && filters.take >= 0 ? `LIMIT ${Math.floor(filters.take)}` : "";
  const offsetClause = filters?.skip !== undefined && Number.isFinite(filters.skip) && filters.skip >= 0 ? `OFFSET ${Math.floor(filters.skip)}` : "";
  const pagination = `${limitClause} ${offsetClause}`.trim();
  return sqlite.prepare(`
    SELECT r.id, r.receipt_number, r.date, r.amount_minor, r.base_amount_minor, r.currency_code,
      cur.minor_unit AS currency_minor_unit, r.reference,
      r.document_status, r.created_at, c.id AS customer_id, c.name AS customer_name,
      a.id AS bank_account_id, a.name AS bank_account_name
    FROM receipts r
    INNER JOIN customers c ON c.id = r.customer_id
    INNER JOIN accounts a ON a.id = r.bank_account_id
    INNER JOIN currencies cur ON cur.code = r.currency_code
    ${where}
    ORDER BY r.date DESC, r.created_at DESC
    ${pagination}
  `).all(...values) as ReceiptListRow[];
}

export type ReceiptDetailRecord = {
  id: string;
  receipt_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  date: string;
  bank_account_id: string;
  bank_account_code: string | null;
  bank_account_name: string;
  amount_minor: number;
  currency_code: string;
  exchange_rate_to_base: string;
  exchange_rate_date: string;
  exchange_rate_source: string;
  base_amount_minor: number;
  released_carrying_amount_minor: number;
  realized_fx_amount_minor: number;
  reference: string | null;
  description: string | null;
  document_status: "posted" | "void";
  created_by: string;
  created_at: string;
  posted_at: string;
  voided_at: string | null;
  total_allocated_minor: number;
  unallocated_amount_minor: number;
};

export function getReceipt(businessId: string, userId: string, receiptId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rawReceipt = sqlite.prepare(`
    SELECT r.*, c.name AS customer_name, c.email AS customer_email,
      a.name AS bank_account_name
    FROM receipts r
    INNER JOIN customers c ON c.id = r.customer_id
    INNER JOIN accounts a ON a.id = r.bank_account_id
    WHERE r.id = ?
  `).get(receiptId) as any;
  if (!rawReceipt) return null;
  const allocations = sqlite.prepare(`
    SELECT ra.id, ra.amount_minor, ra.base_carrying_amount_released,
      i.id AS invoice_id, i.invoice_number
    FROM receipt_allocations ra
    INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
    WHERE ra.receipt_id = ?
    ORDER BY i.invoice_number
  `).all(receiptId) as {
    id: string;
    amount_minor: number;
    base_carrying_amount_released: number;
    invoice_id: string;
    invoice_number: string;
  }[];
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date
    FROM journal_entries
    WHERE source_id = ? AND source_type IN ('receipt', 'receipt_void')
    ORDER BY CASE source_type WHEN 'receipt' THEN 0 ELSE 1 END
  `).all(receiptId) as {
    id: string;
    entry_number: string;
    source_type: "receipt" | "receipt_void";
    date: string;
  }[];

  const totalAllocatedMinor = allocations.reduce((sum, a) => sum + a.amount_minor, 0);
  const unallocatedAmountMinor = Math.max(0, Number(rawReceipt.amount_minor) - totalAllocatedMinor);

  const receipt: ReceiptDetailRecord = {
    ...rawReceipt,
    bank_account_code: rawReceipt.bank_account_code ?? null,
    total_allocated_minor: totalAllocatedMinor,
    unallocated_amount_minor: unallocatedAmountMinor,
  };

  return { receipt, allocations, journals };
}

export function voidReceipt(businessId: string, userId: string, receiptId: string) {
  const context = getBusinessDb(businessId, userId);
  const receipt = context.sqlite
    .prepare("SELECT receipt_number, customer_id FROM receipts WHERE id = ?")
    .get(receiptId) as { receipt_number: string; customer_id: string } | undefined;

  context.sqlite.transaction(() => {
    voidSettlement(context.sqlite, receiptConfig, receiptId);
  }).immediate();

  recordActivity(businessId, {
    userId,
    action: "voided",
    entityType: "receipt",
    entityId: receiptId,
    entityNumber: receipt?.receipt_number ?? null,
    summary: `Voided payment receipt ${receipt?.receipt_number || receiptId}`,
    details: { customerId: receipt?.customer_id },
  });
}

export type CustomerUnallocatedCredit = {
  receiptId: string;
  receiptNumber: string;
  date: string;
  currencyCode: string;
  currencyMinorUnit: number;
  totalAmountMinor: number;
  allocatedAmountMinor: number;
  unallocatedAmountMinor: number;
  reference: string | null;
  description: string | null;
};

export function getCustomerUnallocatedCredit(
  businessId: string,
  userId: string,
  customerId: string,
): CustomerUnallocatedCredit[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT r.id, r.receipt_number, r.date, r.amount_minor, r.currency_code,
      c.minor_unit AS currency_minor_unit, r.reference, r.description,
      COALESCE((
        SELECT SUM(ra.foreign_amount_allocated)
        FROM receipt_allocations ra
        WHERE ra.receipt_id = r.id
      ), 0) AS allocated_minor
    FROM receipts r
    INNER JOIN currencies c ON c.code = r.currency_code
    WHERE r.customer_id = ? AND r.document_status = 'posted'
    ORDER BY r.date ASC, r.created_at ASC
  `).all(customerId) as Array<{
    id: string;
    receipt_number: string;
    date: string;
    amount_minor: number;
    currency_code: string;
    currency_minor_unit: number;
    reference: string | null;
    description: string | null;
    allocated_minor: number;
  }>;

  return rows
    .filter((r) => r.amount_minor > r.allocated_minor)
    .map((r) => ({
      receiptId: r.id,
      receiptNumber: r.receipt_number,
      date: r.date,
      currencyCode: r.currency_code,
      currencyMinorUnit: r.currency_minor_unit,
      totalAmountMinor: r.amount_minor,
      allocatedAmountMinor: r.allocated_minor,
      unallocatedAmountMinor: r.amount_minor - r.allocated_minor,
      reference: r.reference,
      description: r.description,
    }));
}

export function getAllCustomersUnallocatedCredit(
  businessId: string,
  userId: string,
): Record<string, CustomerUnallocatedCredit[]> {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT r.id, r.customer_id, r.receipt_number, r.date, r.amount_minor, r.currency_code,
      c.minor_unit AS currency_minor_unit, r.reference, r.description,
      COALESCE((
        SELECT SUM(ra.foreign_amount_allocated)
        FROM receipt_allocations ra
        WHERE ra.receipt_id = r.id
      ), 0) AS allocated_minor
    FROM receipts r
    INNER JOIN currencies c ON c.code = r.currency_code
    WHERE r.document_status = 'posted'
    ORDER BY r.date ASC, r.created_at ASC
  `).all() as Array<{
    id: string;
    customer_id: string;
    receipt_number: string;
    date: string;
    amount_minor: number;
    currency_code: string;
    currency_minor_unit: number;
    reference: string | null;
    description: string | null;
    allocated_minor: number;
  }>;

  const result: Record<string, CustomerUnallocatedCredit[]> = {};
  for (const r of rows) {
    if (r.amount_minor > r.allocated_minor) {
      if (!result[r.customer_id]) {
        result[r.customer_id] = [];
      }
      result[r.customer_id].push({
        receiptId: r.id,
        receiptNumber: r.receipt_number,
        date: r.date,
        currencyCode: r.currency_code,
        currencyMinorUnit: r.currency_minor_unit,
        totalAmountMinor: r.amount_minor,
        allocatedAmountMinor: r.allocated_minor,
        unallocatedAmountMinor: r.amount_minor - r.allocated_minor,
        reference: r.reference,
        description: r.description,
      });
    }
  }
  return result;
}

export function applyReceiptCredit(
  businessId: string,
  userId: string,
  input: ApplyReceiptCreditInput,
) {
  const data = applyReceiptCreditInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  let result!: ReturnType<typeof applySettlementCredit>;
  context.sqlite.transaction(() => {
    result = applySettlementCredit(
      context.sqlite,
      receiptConfig,
      {
        paymentId: data.receiptId,
        documentId: data.invoiceId,
        amount: data.amount,
      },
    );
  }).immediate();
  return result;
}

export function listReceiptsForCustomer(
  businessId: string,
  userId: string,
  customerId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT r.id, r.receipt_number, r.date, r.amount_minor, r.currency_code,
      cur.minor_unit AS currency_minor_unit, r.reference,
      COALESCE((
        SELECT GROUP_CONCAT(i.invoice_number, ', ')
        FROM receipt_allocations ra
        INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
        WHERE ra.receipt_id = r.id
      ), 'Unallocated Advance') AS invoice_number,
      (
        SELECT ra.sales_invoice_id
        FROM receipt_allocations ra
        WHERE ra.receipt_id = r.id
        LIMIT 1
      ) AS invoice_id,
      COALESCE((
        SELECT SUM(ra.foreign_amount_allocated)
        FROM receipt_allocations ra
        WHERE ra.receipt_id = r.id
      ), 0) AS allocated_amount_minor
    FROM receipts r
    INNER JOIN currencies cur ON cur.code = r.currency_code
    WHERE r.customer_id = ? AND r.document_status = 'posted'
    ORDER BY r.date DESC, r.created_at DESC
  `).all(customerId) as Array<{
    id: string;
    receipt_number: string;
    date: string;
    amount_minor: number;
    currency_code: string;
    currency_minor_unit: number;
    reference: string | null;
    invoice_id: string | null;
    invoice_number: string;
    allocated_amount_minor: number;
  }>;
}
