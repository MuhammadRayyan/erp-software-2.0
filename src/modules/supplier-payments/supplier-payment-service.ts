import { createSettlement, voidSettlement, applySettlementCredit, type SettlementConfig } from "@/modules/settlement/settlement-service";
import { getBusinessDb } from "@/core/db/business";
import { postSupplierPayment } from "@/modules/accounting/services/supplier-payment-posting-service";
import { supplierPaymentInputSchema, type SupplierPaymentInput, type ApplySupplierPaymentCreditInput } from "./supplier-payment-input";


export const supplierPaymentConfig: SettlementConfig = {
  partyType: "supplier",
  partyTable: "suppliers",
  partyIdColumn: "supplier_id",
  documentTable: "purchase_invoices",
  documentIdColumn: "purchase_invoice_id",
  documentNumberColumn: "internal_number",
  openAmountExpr: `
    SELECT pi.total_minor - COALESCE(SUM(
      CASE WHEN sp.document_status = 'posted' THEN spa.foreign_amount_allocated ELSE 0 END
    ), 0) AS foreign_open_minor,
    pi.base_total_minor - COALESCE(SUM(
      CASE WHEN sp.document_status = 'posted' THEN spa.base_carrying_amount_released ELSE 0 END
    ), 0) AS base_carrying_minor
    FROM purchase_invoices pi
    LEFT JOIN supplier_payment_allocations spa ON spa.purchase_invoice_id = pi.id
    LEFT JOIN supplier_payments sp ON sp.id = spa.payment_id
    WHERE pi.id = ? GROUP BY pi.id
  `,
  paymentTable: "supplier_payments",
  paymentNumberColumn: "payment_number",
  allocationTable: "supplier_payment_allocations",
  allocationPaymentIdColumn: "payment_id",
  postSettlement: postSupplierPayment,
};

const paymentConfig = supplierPaymentConfig;

export function createSupplierPayment(businessId: string, userId: string, input: SupplierPaymentInput) {
  const data = supplierPaymentInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);

  const effectiveInvoiceId = data.purchaseInvoiceId || data.invoiceId;
  const allocations = data.allocations && data.allocations.length > 0
    ? data.allocations
    : effectiveInvoiceId
    ? [{ invoiceId: effectiveInvoiceId, amount: data.amount }]
    : [];

  const settlementInput = {
    ...data,
    allocations,
  };

  let result!: ReturnType<typeof createSettlement>;
  context.sqlite.transaction(() => {
    result = createSettlement(context.sqlite, paymentConfig, settlementInput, userId);
  }).immediate();
  return result;
}

export type SupplierPaymentListFilters = {
  /** Inclusive lower bound on payment date (YYYY-MM-DD). Invalid values are ignored. */
  from?: string;
  /** Inclusive upper bound on payment date (YYYY-MM-DD). Invalid values are ignored. */
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

type SupplierPaymentListRow = {
  id: string;
  payment_number: string;
  date: string;
  amount_minor: number;
  base_amount_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  reference: string | null;
  document_status: "posted" | "void";
  created_at: string;
  supplier_id: string;
  supplier_name: string;
  bank_account_id: string;
  bank_account_name: string;
};

/**
 * Paginated supplier-payment list result. The rows slice contains just the
 * rows for the requested page; `total` is the unfiltered-over-rows count
 * for the same `filters` so the UI can show "Page X of Y".
 */
export type PaginatedSupplierPayments = {
  rows: SupplierPaymentListRow[];
  total: number;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

/**
 * Count supplier payments matching `filters` using the same WHERE-clause
 * builder as `listAllSupplierPayments`. Returns the row count used by
 * `listSupplierPaymentsPaginated` to compute total pages.
 */
function countSupplierPaymentRows(businessId: string, userId: string, filters?: SupplierPaymentListFilters): number {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  const dateFrom = validDate(filters?.from);
  const dateTo = validDate(filters?.to);
  if (dateFrom) {
    conditions.push("sp.date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("sp.date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = sqlite.prepare(`SELECT COUNT(*) AS total FROM supplier_payments sp ${where}`).get(...values) as { total: number };
  return row.total;
}

/**
 * Paginated list of supplier payments for the list page. Server-side
 * LIMIT/OFFSET keeps the query cheap as the payments table grows. The
 * returned `total` is the count for the same `filters` excluding the page
 * bounds.
 *
 * @param page 1-indexed page number (clamped to >= 1).
 * @param pageSize rows per page (defaults to 50, capped at 200).
 */
export function listSupplierPaymentsPaginated(
  businessId: string,
  userId: string,
  filters: SupplierPaymentListFilters & { page?: number; pageSize?: number } = {},
): PaginatedSupplierPayments {
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const total = countSupplierPaymentRows(businessId, userId, filters);
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;
  const rows = listAllSupplierPayments(businessId, userId, { ...filters, take: pageSize, skip: offset });
  return { rows, total, page: effectivePage, pageSize, totalPages: maxPage };
}

export function listAllSupplierPayments(businessId: string, userId: string, filters?: SupplierPaymentListFilters): SupplierPaymentListRow[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  const dateFrom = validDate(filters?.from);
  const dateTo = validDate(filters?.to);
  if (dateFrom) {
    conditions.push("sp.date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("sp.date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  // Server-side LIMIT/OFFSET supports the paginated list path. When both
  // are undefined the query returns the full result set.
  const limitClause = filters?.take !== undefined && Number.isFinite(filters.take) && filters.take >= 0 ? `LIMIT ${Math.floor(filters.take)}` : "";
  const offsetClause = filters?.skip !== undefined && Number.isFinite(filters.skip) && filters.skip >= 0 ? `OFFSET ${Math.floor(filters.skip)}` : "";
  const pagination = `${limitClause} ${offsetClause}`.trim();
  return sqlite.prepare(`
    SELECT sp.id, sp.payment_number, sp.date, sp.amount_minor, sp.base_amount_minor,
      sp.currency_code, cur.minor_unit AS currency_minor_unit, sp.reference,
      sp.document_status, sp.created_at, s.id AS supplier_id, s.name AS supplier_name,
      a.id AS bank_account_id, a.name AS bank_account_name
    FROM supplier_payments sp
    INNER JOIN suppliers s ON s.id = sp.supplier_id
    INNER JOIN accounts a ON a.id = sp.bank_account_id
    INNER JOIN currencies cur ON cur.code = sp.currency_code
    ${where}
    ORDER BY sp.date DESC, sp.created_at DESC
    ${pagination}
  `).all(...values) as SupplierPaymentListRow[];
}

export type SupplierPaymentDetailRecord = {
  id: string;
  payment_number: string;
  supplier_id: string;
  supplier_name: string;
  supplier_email: string | null;
  date: string;
  bank_account_id: string;
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

export function getSupplierPayment(
  businessId: string,
  userId: string,
  paymentId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const payment = sqlite.prepare(`
    SELECT sp.*, s.name AS supplier_name, s.email AS supplier_email,
      a.name AS bank_account_name
    FROM supplier_payments sp
    INNER JOIN suppliers s ON s.id = sp.supplier_id
    INNER JOIN accounts a ON a.id = sp.bank_account_id
    WHERE sp.id = ?
  `).get(paymentId) as any;
  if (!payment) return null;
  const allocations = sqlite.prepare(`
    SELECT spa.id, spa.amount_minor, spa.base_carrying_amount_released,
      pi.id AS invoice_id, pi.internal_number
    FROM supplier_payment_allocations spa
    INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
    WHERE spa.payment_id = ?
    ORDER BY pi.internal_number
  `).all(paymentId) as {
    id: string;
    amount_minor: number;
    base_carrying_amount_released: number;
    invoice_id: string;
    internal_number: string;
  }[];
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date
    FROM journal_entries
    WHERE source_id = ? AND source_type IN ('supplier_payment', 'supplier_payment_void')
    ORDER BY CASE source_type WHEN 'supplier_payment' THEN 0 ELSE 1 END
  `).all(paymentId) as {
    id: string;
    entry_number: string;
    source_type: "supplier_payment" | "supplier_payment_void";
    date: string;
  }[];

  const totalAllocatedMinor = allocations.reduce((sum, a) => sum + a.amount_minor, 0);
  const unallocatedAmountMinor = Math.max(0, Number(payment.amount_minor) - totalAllocatedMinor);

  const detailRecord: SupplierPaymentDetailRecord = {
    ...payment,
    total_allocated_minor: totalAllocatedMinor,
    unallocated_amount_minor: unallocatedAmountMinor,
  };

  return { payment: detailRecord, allocations, journals };
}

export function voidSupplierPayment(businessId: string, userId: string, paymentId: string) {
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    voidSettlement(context.sqlite, paymentConfig, paymentId);
  }).immediate();
}

export type SupplierUnallocatedPrepayment = {
  paymentId: string;
  paymentNumber: string;
  date: string;
  currencyCode: string;
  unallocatedAmountMinor: number;
};

export function getSupplierUnallocatedCredit(
  businessId: string,
  userId: string,
  supplierId: string,
): SupplierUnallocatedPrepayment[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT
      sp.id AS payment_id,
      sp.payment_number,
      sp.date,
      sp.currency_code,
      sp.amount_minor,
      COALESCE((
        SELECT SUM(spa.foreign_amount_allocated)
        FROM supplier_payment_allocations spa
        WHERE spa.payment_id = sp.id
      ), 0) AS total_allocated_minor
    FROM supplier_payments sp
    WHERE sp.supplier_id = ? AND sp.document_status = 'posted'
    ORDER BY sp.date ASC, sp.created_at ASC
  `).all(supplierId) as Array<{
    payment_id: string;
    payment_number: string;
    date: string;
    currency_code: string;
    amount_minor: number;
    total_allocated_minor: number;
  }>;

  return rows
    .map((r) => ({
      paymentId: r.payment_id,
      paymentNumber: r.payment_number,
      date: r.date,
      currencyCode: r.currency_code,
      unallocatedAmountMinor: Math.max(0, r.amount_minor - r.total_allocated_minor),
    }))
    .filter((r) => r.unallocatedAmountMinor > 0);
}

export const getSupplierUnallocatedPrepayments = getSupplierUnallocatedCredit;

export function getAllSuppliersUnallocatedPrepayments(
  businessId: string,
  userId: string,
): Record<string, SupplierUnallocatedPrepayment[]> {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT
      sp.id AS payment_id,
      sp.supplier_id,
      sp.payment_number,
      sp.date,
      sp.currency_code,
      sp.amount_minor,
      COALESCE((
        SELECT SUM(spa.foreign_amount_allocated)
        FROM supplier_payment_allocations spa
        WHERE spa.payment_id = sp.id
      ), 0) AS total_allocated_minor
    FROM supplier_payments sp
    WHERE sp.document_status = 'posted'
    ORDER BY sp.date ASC, sp.created_at ASC
  `).all() as Array<{
    payment_id: string;
    supplier_id: string;
    payment_number: string;
    date: string;
    currency_code: string;
    amount_minor: number;
    total_allocated_minor: number;
  }>;

  const result: Record<string, SupplierUnallocatedPrepayment[]> = {};
  for (const r of rows) {
    const unallocated = Math.max(0, r.amount_minor - r.total_allocated_minor);
    if (unallocated > 0) {
      if (!result[r.supplier_id]) {
        result[r.supplier_id] = [];
      }
      result[r.supplier_id].push({
        paymentId: r.payment_id,
        paymentNumber: r.payment_number,
        date: r.date,
        currencyCode: r.currency_code,
        unallocatedAmountMinor: unallocated,
      });
    }
  }
  return result;
}

export function applySupplierPaymentCredit(
  businessId: string,
  userId: string,
  data: ApplySupplierPaymentCreditInput,
) {
  const context = getBusinessDb(businessId, userId);
  let result!: ReturnType<typeof applySettlementCredit>;
  context.sqlite.transaction(() => {
    result = applySettlementCredit(
      context.sqlite,
      paymentConfig,
      {
        paymentId: data.paymentId,
        documentId: data.invoiceId,
        amount: data.amount,
      },
    );
  }).immediate();
  return result;
}

export function listSupplierPayments(
  businessId: string,
  userId: string,
  supplierId: string,
) {
  return getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT sp.id, sp.payment_number, sp.date, sp.amount_minor, sp.currency_code,
      cur.minor_unit AS currency_minor_unit, sp.reference,
      COALESCE((
        SELECT group_concat(pi.internal_number, ', ')
        FROM supplier_payment_allocations spa
        INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
        WHERE spa.payment_id = sp.id
      ), 'Unallocated Prepayment') AS internal_number,
      (
        SELECT spa.purchase_invoice_id
        FROM supplier_payment_allocations spa
        WHERE spa.payment_id = sp.id
        LIMIT 1
      ) AS invoice_id,
      COALESCE((
        SELECT SUM(spa.foreign_amount_allocated)
        FROM supplier_payment_allocations spa
        WHERE spa.payment_id = sp.id
      ), 0) AS allocated_amount_minor
    FROM supplier_payments sp
    INNER JOIN currencies cur ON cur.code = sp.currency_code
    WHERE sp.supplier_id = ? AND sp.document_status = 'posted'
    ORDER BY sp.date DESC, sp.created_at DESC
  `).all(supplierId) as Array<{
    id: string;
    payment_number: string;
    date: string;
    amount_minor: number;
    currency_code: string;
    currency_minor_unit: number;
    reference: string | null;
    invoice_id: string | null;
    internal_number: string;
    allocated_amount_minor: number;
  }>;
}
