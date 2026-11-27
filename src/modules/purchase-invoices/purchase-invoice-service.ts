import { assertMutationPermission, assertSavePermission } from "@/core/permissions/mutation-permissions";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { getPurchaseSettlement } from "./purchase-balance";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb, runImmediateTransaction } from "@/core/db/business";
import { purchaseInvoiceLines, purchaseInvoices, suppliers } from "@/core/db/business-schema";
import {     quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { postPurchaseInvoice } from "@/modules/accounting/services/purchase-invoice-posting-service";
import {
  describeAmendment,
  formatMinorAmount,
  postingFingerprint,
  supersedePosting,
  type DocumentSnapshot,
} from "@/modules/accounting/services/posting-amendment-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { replaceTaxEntries, reverseTaxEntries } from "@/modules/tax/tax-entry-service";
import { assertVatDateUnlocked, assertVatSourceUnlocked } from "@/modules/tax/tax-lock-service";
import { assertDateNotLocked } from "@/modules/accounting/services/financial-lock-service";
import { purchaseInvoiceInputSchema, type PurchaseInvoiceInput } from "./purchase-invoice-input";
import type { ListSortDir } from "@/lib/list-query-params";
import {
  buildLikePattern,
  clampPositiveInt,
  DEFAULT_LIST_PAGE_SIZE,
  MAX_LIST_PAGE_SIZE,
  pushInvoiceStatusConditions,
  resolveSortSql,
  validIsoDate,
  type InvoiceListSummary,
} from "@/modules/shared/list-query-helpers";
import { convertDocumentLinesToBase, minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";
import { getSupplierUnallocatedPrepayments, supplierPaymentConfig, type SupplierUnallocatedPrepayment } from "@/modules/supplier-payments/supplier-payment-service";
import { applySettlementCredit } from "@/modules/settlement/settlement-service";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { getCustomFieldValuesForEntities, saveLineCustomFieldValuesInTransaction } from "@/modules/custom-fields/custom-field-service";
import { evaluateApprovalRequirement, recordPendingApprovalInTransaction } from "@/modules/approvals/approval-policy";

export type PurchaseInvoiceStatus = "draft" | "pending_approval" | "posted" | "void";
export type PurchasePaymentStatus = "unpaid" | "partially_paid" | "paid" | "overdue";
export type PurchaseInvoiceIntent = "draft" | "submit_approval" | "post";

function deriveStatus(documentStatus: PurchaseInvoiceStatus, totalMinor: number, paidMinor: number, dueDate: string): PurchasePaymentStatus | null {
  if (documentStatus !== "posted") return null;
  const balance = Math.max(0, totalMinor - paidMinor);
  if (balance === 0) return "paid";
  if (dueDate < getBusinessTodayIso()) return "overdue";
  return paidMinor > 0 ? "partially_paid" : "unpaid";
}

export function paidForPurchaseInvoice(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string) {
  return getPurchaseSettlement(sqlite, invoiceId)?.foreignMinor ?? 0;
}


function assertSupplierInvoiceNumberAvailable(
  sqlite: ReturnType<typeof getBusinessDb>["sqlite"],
  supplierId: string,
  supplierInvoiceNumber: string,
  excludeInvoiceId?: string,
) {
  const duplicate = sqlite.prepare(`
    SELECT id, internal_number FROM purchase_invoices
    WHERE supplier_id = ? AND upper(trim(supplier_invoice_number)) = upper(trim(?))
      AND document_status <> 'void' AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(supplierId, supplierInvoiceNumber, excludeInvoiceId ?? null, excludeInvoiceId ?? null) as {
    id: string;
    internal_number: string;
  } | undefined;
  if (duplicate) {
    throw new Error(`Supplier invoice number already exists on Purchase Invoice ${duplicate.internal_number}.`);
  }
}

import { drizzle } from "drizzle-orm/better-sqlite3";
import * as businessSchema from "@/core/db/business-schema";
import { getBusinessTodayIso } from "@/core/format";
import { addDaysIso } from "@/modules/tax/uae-vat-config";

function insertLines(
  dbOrSqlite: ReturnType<typeof getBusinessDb>["db"] | ReturnType<typeof getBusinessDb>["sqlite"],
  invoiceId: string,
  lines: StoredLine[],
) {
  if (lines.length === 0) return;
  const db = "insert" in dbOrSqlite ? dbOrSqlite : drizzle(dbOrSqlite, { schema: businessSchema });
  const linesArray = lines.map((line) => ({
    id: line.id,
    purchaseInvoiceId: invoiceId,
    description: line.description,
    quantityMicros: line.quantityMicros,
    unitPriceMinor: line.unitPriceMinor,
    discountType: (line.discountType as "none" | "percentage" | "fixed") || "none",
    discountValue: line.discountValue || "0",
    expenseAccountId: line.expenseAccountId,
    taxCodeId: line.taxCodeId,
    projectId: line.projectId || null,
    itemId: line.itemId || null,
    netAmountMinor: line.netAmountMinor,
    taxAmountMinor: line.taxAmountMinor,
    grossAmountMinor: line.grossAmountMinor,
    position: line.lineIndex,
  }));
  db.insert(purchaseInvoiceLines).values(linesArray).run();
}


const PURCHASE_SETTLEMENT_CTE = `
  payment_alloc AS (
    SELECT spa.purchase_invoice_id AS invoice_id,
      SUM(COALESCE(spa.foreign_amount_allocated, spa.amount_minor)) AS foreign_minor
    FROM supplier_payment_allocations spa
    INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
    GROUP BY spa.purchase_invoice_id
  ),
  debit_alloc AS (
    SELECT dn.purchase_invoice_id AS invoice_id,
      SUM(dn.total_minor) AS foreign_minor
    FROM debit_notes dn
    WHERE dn.purchase_invoice_id IS NOT NULL AND dn.document_status = 'posted'
    GROUP BY dn.purchase_invoice_id
  )
`;

const PURCHASE_PAID_FOREIGN_EXPR = "COALESCE(pa.foreign_minor, 0) + COALESCE(da.foreign_minor, 0)";

export type PurchaseInvoiceListFilters = {
  status?: string;
  q?: string;
  /** Filter to one supplier (matches the legacy `supplierId` positional arg). */
  supplierId?: string;
  projectId?: string;
  /** Inclusive lower bound on invoice_date (YYYY-MM-DD). Invalid values are ignored. */
  from?: string;
  /** Inclusive upper bound on invoice_date (YYYY-MM-DD). Invalid values are ignored. */
  to?: string;
  sort?: string;
  dir?: ListSortDir;
  /** Maximum rows to return (server-side LIMIT). Used by the paginated list path. */
  take?: number;
  /** Number of rows to skip (server-side OFFSET). Used by the paginated list path. */
  skip?: number;
};

/**
 * Paginated purchase-invoice list result. The rows slice contains just the
 * rows for the requested page; `total` is the filtered count across matching rows.
 */
export type PaginatedPurchaseInvoices = {
  rows: ReturnType<typeof listPurchaseInvoices>;
  total: number;
  summary: InvoiceListSummary;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

function buildPurchaseInvoiceWhere(
  supplierId: string | undefined,
  filters: PurchaseInvoiceListFilters | undefined,
  businessToday: string,
) {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  const scopedSupplierId = supplierId ?? (filters?.supplierId?.trim() || undefined);
  if (scopedSupplierId) {
    conditions.push("pi.supplier_id = ?");
    values.push(scopedSupplierId);
  }
  const projectId = filters?.projectId?.trim();
  if (projectId) {
    conditions.push(
      "(EXISTS (SELECT 1 FROM purchase_invoice_lines pil WHERE pil.purchase_invoice_id = pi.id AND COALESCE(pil.project_id, pi.project_id) = ?) OR (pi.project_id = ? AND NOT EXISTS (SELECT 1 FROM purchase_invoice_lines pil WHERE pil.purchase_invoice_id = pi.id)))",
    );
    values.push(projectId, projectId);
  }
  const { isVoidFilter } = pushInvoiceStatusConditions(filters?.status, {
    tableAlias: "pi",
    allocatedExpr: PURCHASE_PAID_FOREIGN_EXPR,
    businessToday,
    conditions,
    values,
  });
  const likePattern = buildLikePattern(filters?.q);
  if (likePattern) {
    conditions.push(
      "(lower(pi.internal_number) LIKE ? ESCAPE '\\' OR lower(s.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(pi.supplier_invoice_number, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(pi.reference, '')) LIKE ? ESCAPE '\\')",
    );
    values.push(likePattern, likePattern, likePattern, likePattern);
  }
  const dateFrom = validIsoDate(filters?.from);
  const dateTo = validIsoDate(filters?.to);
  if (dateFrom) {
    conditions.push("pi.invoice_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("pi.invoice_date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, values, isVoidFilter };
}

export function listPurchaseInvoiceFilterOptions(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const supplierRows = sqlite
    .prepare(
      `SELECT DISTINCT s.id, s.name
       FROM suppliers s
       INNER JOIN purchase_invoices pi ON pi.supplier_id = s.id
       ORDER BY s.name ASC`,
    )
    .all() as Array<{ id: string; name: string }>;
  const projectRows = sqlite
    .prepare(
      `SELECT p.id, p.name
       FROM projects p
       WHERE EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.project_id = p.id)
          OR EXISTS (SELECT 1 FROM purchase_invoice_lines l WHERE l.project_id = p.id)
       ORDER BY p.name ASC`,
    )
    .all() as Array<{ id: string; name: string }>;
  return {
    suppliers: supplierRows.map((s) => [s.id, s.name] as [string, string]),
    projects: projectRows.map((p) => [p.id, p.name] as [string, string]),
  };
}

/**
 * Paginated list of purchase invoices with SQL filtering, sorting, and
 * DB-wide multi-currency totals across all matching rows.
 */
export function listPurchaseInvoicesPaginated(
  businessId: string,
  userId: string,
  filters: PurchaseInvoiceListFilters & { page?: number; pageSize?: number } = {},
): PaginatedPurchaseInvoices {
  const { sqlite } = getBusinessDb(businessId, userId);
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE);
  const businessToday = getBusinessTodayIso();
  const { where, values, isVoidFilter } = buildPurchaseInvoiceWhere(undefined, filters, businessToday);

  const unfilteredRow = sqlite.prepare("SELECT COUNT(*) AS total FROM purchase_invoices").get() as { total: number };
  const summaryRows = sqlite
    .prepare(`
      WITH ${PURCHASE_SETTLEMENT_CTE}
      SELECT
        pi.currency_code,
        cur.minor_unit AS currency_minor_unit,
        COUNT(*) AS row_count,
        SUM(CASE WHEN pi.document_status = 'posted' THEN 1 ELSE 0 END) AS posted_count,
        SUM(CASE WHEN ? = 1 OR pi.document_status <> 'void' THEN pi.total_minor ELSE 0 END) AS total_minor,
        SUM(CASE WHEN pi.document_status = 'posted' THEN MAX(0, pi.total_minor - (${PURCHASE_PAID_FOREIGN_EXPR})) ELSE 0 END) AS balance_minor,
        SUM(CASE WHEN pi.document_status = 'posted' AND pi.total_minor > (${PURCHASE_PAID_FOREIGN_EXPR}) AND pi.due_date < ? THEN 1 ELSE 0 END) AS overdue_count
      FROM purchase_invoices pi
      INNER JOIN suppliers s ON s.id = pi.supplier_id
      INNER JOIN currencies cur ON cur.code = pi.currency_code
      LEFT JOIN payment_alloc pa ON pa.invoice_id = pi.id
      LEFT JOIN debit_alloc da ON da.invoice_id = pi.id
      ${where}
      GROUP BY pi.currency_code, cur.minor_unit
      ORDER BY pi.currency_code ASC
    `)
    .all(isVoidFilter ? 1 : 0, businessToday, ...values) as Array<{
    currency_code: string;
    currency_minor_unit: number;
    row_count: number;
    posted_count: number;
    total_minor: number;
    balance_minor: number;
    overdue_count: number;
  }>;

  const filteredTotal = summaryRows.reduce((sum, row) => sum + Number(row.row_count || 0), 0);
  const overdueCount = summaryRows.reduce((sum, row) => sum + Number(row.overdue_count || 0), 0);
  const summary: InvoiceListSummary = {
    unfilteredTotal: unfilteredRow.total,
    filteredTotal,
    overdueCount,
    currencyTotals: summaryRows.map((row) => ({
      currencyCode: row.currency_code,
      currencyMinorUnit: row.currency_minor_unit,
      totalMinor: Number(row.total_minor || 0),
      balanceMinor: Number(row.balance_minor || 0),
      hasPosted: Number(row.posted_count || 0) > 0,
    })),
  };

  const maxPage = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;
  const rows = listPurchaseInvoices(businessId, userId, undefined, { ...filters, take: pageSize, skip: offset });
  return { rows, total: filteredTotal, summary, page: effectivePage, pageSize, totalPages: maxPage };
}

/**
 * List purchase invoices. The legacy 3rd positional arg is `supplierId`
 * (used by the supplier detail page); a `filters` object is also accepted
 * for the paginated list path.
 */
export function listPurchaseInvoices(
  businessId: string,
  userId: string,
  supplierId?: string,
  filters?: PurchaseInvoiceListFilters,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const businessToday = getBusinessTodayIso();
  const { where, values } = buildPurchaseInvoiceWhere(supplierId, filters, businessToday);
  const sortColumns: Record<string, string> = {
    internal_number: "pi.internal_number",
    supplier_name: "s.name",
    supplierInvoice: "COALESCE(pi.supplier_invoice_number, '')",
    date: "pi.invoice_date",
    due: "pi.due_date",
    total: "pi.total_minor",
    balance: `CASE WHEN pi.document_status = 'posted' THEN MAX(0, pi.total_minor - (${PURCHASE_PAID_FOREIGN_EXPR})) ELSE 0 END`,
    document: "pi.document_status",
    payment: `CASE WHEN pi.document_status <> 'posted' THEN 5 WHEN pi.total_minor <= (${PURCHASE_PAID_FOREIGN_EXPR}) THEN 4 WHEN pi.due_date < '${businessToday}' THEN 1 WHEN (${PURCHASE_PAID_FOREIGN_EXPR}) > 0 THEN 2 ELSE 3 END`,
  };
  const orderByClause = resolveSortSql(
    filters?.sort,
    filters?.dir,
    sortColumns,
    "pi.invoice_date DESC, pi.created_at DESC, pi.id DESC",
  );
  const limitClause = filters?.take !== undefined && Number.isFinite(filters.take) && filters.take >= 0 ? `LIMIT ${Math.floor(filters.take)}` : "";
  const offsetClause = filters?.skip !== undefined && Number.isFinite(filters.skip) && filters.skip >= 0 ? `OFFSET ${Math.floor(filters.skip)}` : "";
  const pagination = `${limitClause} ${offsetClause}`.trim();
  const rows = sqlite.prepare(`
    WITH ${PURCHASE_SETTLEMENT_CTE},
    inv_projects AS (
      SELECT l.purchase_invoice_id AS invoice_id,
        GROUP_CONCAT(DISTINCT COALESCE(l.project_id, pi2.project_id)) AS project_ids
      FROM purchase_invoice_lines l
      INNER JOIN purchase_invoices pi2 ON pi2.id = l.purchase_invoice_id
      GROUP BY l.purchase_invoice_id
    )
    SELECT pi.*, s.name AS supplier_name, cur.minor_unit AS currency_minor_unit,
      COALESCE(ip.project_ids, pi.project_id) AS project_ids,
      (${PURCHASE_PAID_FOREIGN_EXPR}) AS paid_minor
    FROM purchase_invoices pi
    INNER JOIN suppliers s ON s.id = pi.supplier_id
    INNER JOIN currencies cur ON cur.code = pi.currency_code
    LEFT JOIN payment_alloc pa ON pa.invoice_id = pi.id
    LEFT JOIN debit_alloc da ON da.invoice_id = pi.id
    LEFT JOIN inv_projects ip ON ip.invoice_id = pi.id
    ${where}
    ORDER BY ${orderByClause}
    ${pagination}
  `).all(...values) as {
    id: string; internal_number: string; supplier_id: string; supplier_name: string;
    supplier_invoice_number: string; invoice_date: string; due_date: string;
    reference: string | null; purchase_order_id: string | null; project_id: string | null;
    project_ids: string | null; document_status: PurchaseInvoiceStatus; subtotal_minor: number;
    tax_minor: number; total_minor: number; base_total_minor: number; currency_code: string; currency_minor_unit: number;
    exchange_rate_to_base: string; exchange_rate_date: string; exchange_rate_source: string;
    created_at: string; updated_at: string; paid_minor: number;
  }[];
  const referencedProjectIds = Array.from(
    new Set(rows.flatMap((row) => row.project_ids?.split(",").filter(Boolean) ?? [])),
  );
  const projectById = new Map<string, string>();
  if (referencedProjectIds.length > 0) {
    const placeholders = referencedProjectIds.map(() => "?").join(", ");
    const projects = sqlite
      .prepare(`SELECT id, name FROM projects WHERE id IN (${placeholders})`)
      .all(...referencedProjectIds) as { id: string; name: string }[];
    for (const project of projects) projectById.set(project.id, project.name);
  }
  return rows.map((row) => {
    const projectIds = row.project_ids?.split(",").filter(Boolean) ?? [];
    return {
      ...row,
      projectIds,
      projectNames: projectIds.map((id) => projectById.get(id) ?? id),
      balanceMinor: row.document_status === "posted" ? Math.max(0, row.total_minor - row.paid_minor) : 0,
      paymentStatus: deriveStatus(row.document_status, row.total_minor, row.paid_minor, row.due_date),
    };
  });
}

export function getPurchaseInvoice(businessId: string, userId: string, invoiceId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ invoice: purchaseInvoices, supplier: suppliers }).from(purchaseInvoices).innerJoin(suppliers, eq(suppliers.id, purchaseInvoices.supplierId)).where(eq(purchaseInvoices.id, invoiceId)).get();
  if (!header) return null;
  const lines = context.db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.purchaseInvoiceId, invoiceId)).orderBy(asc(purchaseInvoiceLines.position)).all();
  const lineAccountIds = [...new Set(lines.map(l => l.expenseAccountId))];
  const lineTaxCodeIds = [...new Set(lines.map(l => l.taxCodeId))];
  const lineItemIds = [...new Set(lines.map(l => l.itemId).filter(Boolean))] as string[];
  const projectIds = [...new Set([header.invoice.projectId, ...lines.map(l => l.projectId)].filter(Boolean))] as string[];

  const accounts = lineAccountIds.length > 0
    ? context.sqlite.prepare(`SELECT id, name FROM accounts WHERE id IN (${lineAccountIds.map(() => '?').join(',')})`).all(...lineAccountIds) as { id: string; name: string }[]
    : [];
  const taxes = lineTaxCodeIds.length > 0
    ? context.sqlite.prepare(`SELECT id, name, rate_basis_points FROM tax_codes WHERE id IN (${lineTaxCodeIds.map(() => '?').join(',')})`).all(...lineTaxCodeIds) as { id: string; name: string; rate_basis_points: number }[]
    : [];
  const projects = projectIds.length > 0
    ? context.sqlite.prepare(`SELECT id, code, name FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')})`).all(...projectIds) as { id: string; code: string; name: string }[]
    : [];
  const itemRows = lineItemIds.length > 0
    ? context.sqlite.prepare(`SELECT id, sku, name, unit_name FROM inventory_items WHERE id IN (${lineItemIds.map(() => '?').join(',')})`).all(...lineItemIds) as { id: string; sku: string | null; name: string; unit_name: string }[]
    : [];

  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const taxById = new Map(taxes.map((row) => [row.id, row]));
  const projectById = new Map(projects.map((row) => [row.id, row]));
  const itemById = new Map(itemRows.map((item) => [item.id, item]));
  const paidMinor = paidForPurchaseInvoice(context.sqlite, invoiceId);
  const payments = context.sqlite.prepare(`SELECT sp.id, sp.payment_number, sp.date, sp.reference, spa.amount_minor AS allocated_minor FROM supplier_payment_allocations spa INNER JOIN supplier_payments sp ON sp.id = spa.payment_id WHERE spa.purchase_invoice_id = ? AND sp.document_status = 'posted' ORDER BY sp.date DESC, sp.created_at DESC`).all(invoiceId) as { id: string; payment_number: string; date: string; reference: string | null; allocated_minor: number }[];
  const journal = context.sqlite.prepare("SELECT id, entry_number FROM journal_entries WHERE source_type = 'purchase_invoice' AND source_id = ?").get(invoiceId) as { id: string; entry_number: string } | undefined;
  const reversalJournal = context.sqlite.prepare("SELECT id, entry_number FROM journal_entries WHERE source_type = 'purchase_invoice_void' AND source_id = ?").get(invoiceId) as { id: string; entry_number: string } | undefined;
  const order = header.invoice.purchaseOrderId ? context.sqlite.prepare("SELECT id, order_number FROM purchase_orders WHERE id = ?").get(header.invoice.purchaseOrderId) as { id: string; order_number: string } | undefined : undefined;
  const lineCustomFieldsMap = getCustomFieldValuesForEntities(
    businessId,
    userId,
    "purchase_invoice_line",
    lines.map((l) => l.id),
  );
  return {
    ...header,
    project: header.invoice.projectId ? projectById.get(header.invoice.projectId) ?? null : null,
    lines: lines.map((line) => {
      const projectId = effectiveProjectId(line.projectId, header.invoice.projectId);
      return { ...line, item: line.itemId ? itemById.get(line.itemId) ?? null : null, expenseAccount: accountById.get(line.expenseAccountId) ?? null, taxCode: taxById.get(line.taxCodeId) ?? null, project: projectId ? projectById.get(projectId) ?? null : null, customFields: lineCustomFieldsMap.get(line.id) ?? {} };
    }),
    paidMinor,
    balanceMinor: header.invoice.documentStatus === "posted" ? Math.max(0, header.invoice.totalMinor - paidMinor) : 0,
    paymentStatus: deriveStatus(header.invoice.documentStatus, header.invoice.totalMinor, paidMinor, header.invoice.dueDate),
    payments: payments.map((row) => ({ id: row.id, paymentNumber: row.payment_number, date: row.date, reference: row.reference, allocatedMinor: row.allocated_minor })),
    journal: journal ? { id: journal.id, entryNumber: journal.entry_number } : null,
    reversalJournal: reversalJournal ? { id: reversalJournal.id, entryNumber: reversalJournal.entry_number } : null,
    order: order ? { id: order.id, orderNumber: order.order_number } : null,
    linkedQuote: header.invoice.purchaseOrderId
      ? (context.sqlite.prepare("SELECT pq.id, pq.quote_number, pq.document_status FROM purchase_quotes pq INNER JOIN purchase_orders po ON po.purchase_quote_id = pq.id WHERE po.id = ?").get(header.invoice.purchaseOrderId) as { id: string; quote_number: string; document_status: string } | undefined)
      : undefined,
    goodsReceipts: context.sqlite.prepare("SELECT id, receipt_number, date, document_status FROM goods_receipts WHERE purchase_invoice_id = ? ORDER BY date DESC, created_at DESC").all(invoiceId) as { id: string; receipt_number: string; date: string; document_status: string }[],
  };
}

function resolvePurchaseOrderIdFromReference(sqlite: any, reference?: string | null, supplierId?: string | null): string | null {
  if (!reference) return null;
  const trimmed = reference.trim();
  const directMatch = sqlite.prepare("SELECT id FROM purchase_orders WHERE order_number = ? AND (? IS NULL OR supplier_id = ?) LIMIT 1").get(trimmed, supplierId ?? null, supplierId ?? null) as { id: string } | undefined;
  if (directMatch) return directMatch.id;
  const match = trimmed.match(/\b([A-Za-z]{1,5}-\d+)\b/);
  if (match) {
    const codeMatch = sqlite.prepare("SELECT id FROM purchase_orders WHERE order_number = ? AND (? IS NULL OR supplier_id = ?) LIMIT 1").get(match[1], supplierId ?? null, supplierId ?? null) as { id: string } | undefined;
    if (codeMatch) return codeMatch.id;
  }
  return null;
}

export function savePurchaseInvoice(
  businessId: string,
  userId: string,
  input: PurchaseInvoiceInput,
  intent: PurchaseInvoiceIntent,
  invoiceId?: string,
  options?: { bypassApprovalPolicy?: boolean },
) {
  if (options?.bypassApprovalPolicy) {
    assertMutationPermission(businessId, userId, "purchases", "post");
  } else {
    assertSavePermission(businessId, userId, "purchases", invoiceId, "draft");
  }
  const data = purchaseInvoiceInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const supplier = context.db.select().from(suppliers).where(eq(suppliers.id, data.supplierId)).get();
  if (!supplier || !supplier.isActive) throw new Error("Choose an active supplier.");
  const currentHeader = invoiceId
    ? context.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).get()
    : undefined;
  if (currentHeader?.documentStatus === "posted") {
    assertDateNotLocked(context.sqlite, currentHeader.invoiceDate, "Purchase invoice");
  }
  const taxDate = data.taxDate || data.invoiceDate;
  const resolvedRate = resolveRateSnapshot(context.sqlite, {
    currencyCode: input.currencyCode ?? supplier.defaultCurrencyCode ?? data.currencyCode,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: taxDate,
    taxCodeIds: data.lines.map((line) => line.taxCodeId),
    enforceVatPolicy: true,
  });
  // Base-currency documents carry their tax date as the (meaningless) rate
  // date. Keep the posted snapshot so a posted document's date can be amended.
  const rate = currentHeader?.documentStatus === "posted" && resolvedRate.exchangeRateSource === "Base"
    && currentHeader.currencyCode === resolvedRate.currencyCode && currentHeader.exchangeRateSource === "Base"
    ? { ...resolvedRate, exchangeRateDate: currentHeader.exchangeRateDate }
    : resolvedRate;
  if (currentHeader?.documentStatus === "posted" && (
    currentHeader.currencyCode !== rate.currencyCode
    || currentHeader.exchangeRateToBase !== rate.exchangeRateToBase
    || currentHeader.exchangeRateDate !== rate.exchangeRateDate
    || currentHeader.exchangeRateSource !== rate.exchangeRateSource
  )) throw new Error("Posted document currency and exchange rate are immutable.");
  validateProjectReferences(context.sqlite, { headerProjectId: data.projectId, lineProjectIds: data.lines.map((line) => line.projectId) });
  if (data.purchaseOrderId) {
    const order = context.sqlite.prepare("SELECT supplier_id, status FROM purchase_orders WHERE id = ?").get(data.purchaseOrderId) as { supplier_id: string; status: string } | undefined;
    if (!order || order.supplier_id !== data.supplierId) throw new Error("Choose a purchase order for the selected supplier.");
    if (order.status === "cancelled") throw new Error("A cancelled purchase order cannot be billed.");
  }
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, { accountTypeFilter: "expense", taxDirection: "purchases", supportItems: true, accountFieldOnLine: "expenseAccountId", amountsIncludeTax: data.amountsIncludeTax });
  const amounts = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  const now = new Date().toISOString();
  const id = invoiceId ?? randomUUID();
  let recordedNumber = "";
  // A posted bill is amended by reversing its journal/VAT rows and posting the
  // new version, unless nothing that drives the ledger has changed.
  const isPostedAmendment = currentHeader?.documentStatus === "posted";
  const previousLines = isPostedAmendment && invoiceId
    ? context.db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.purchaseInvoiceId, invoiceId)).orderBy(asc(purchaseInvoiceLines.position)).all()
    : [];
  const beforeSnapshot: DocumentSnapshot | null = isPostedAmendment && currentHeader
    ? {
        date: currentHeader.invoiceDate,
        taxDate: currentHeader.taxDate,
        partyId: currentHeader.supplierId,
        currencyCode: currentHeader.currencyCode,
        exchangeRateToBase: currentHeader.exchangeRateToBase,
        subtotalMinor: currentHeader.subtotalMinor,
        taxMinor: currentHeader.taxMinor,
        totalMinor: currentHeader.totalMinor,
        baseTotalMinor: currentHeader.baseTotalMinor,
        lines: previousLines.map((line) => ({
          description: line.description,
          quantityMicros: line.quantityMicros,
          unitPriceMinor: line.unitPriceMinor,
          accountId: line.expenseAccountId,
          taxCodeId: line.taxCodeId,
          netAmountMinor: line.netAmountMinor,
          taxAmountMinor: line.taxAmountMinor,
          grossAmountMinor: line.grossAmountMinor,
        })),
      }
    : null;
  const postingChanged = Boolean(isPostedAmendment && currentHeader) && postingFingerprint({
    partyId: currentHeader!.supplierId,
    date: currentHeader!.invoiceDate,
    taxDate: currentHeader!.taxDate,
    lines: previousLines.map((line) => ({
      accountId: line.expenseAccountId,
      taxCodeId: line.taxCodeId,
      projectId: effectiveProjectId(line.projectId, currentHeader!.projectId),
      itemId: line.itemId,
      netAmountMinor: line.netAmountMinor,
      taxAmountMinor: line.taxAmountMinor,
    })),
  }) !== postingFingerprint({
    partyId: data.supplierId,
    date: data.invoiceDate,
    taxDate,
    lines: lines.map((line) => ({
      accountId: line.expenseAccountId,
      taxCodeId: line.taxCodeId,
      projectId: effectiveProjectId(line.projectId, data.projectId),
      itemId: line.itemId,
      netAmountMinor: line.netAmountMinor,
      taxAmountMinor: line.taxAmountMinor,
    })),
  });
  let amendment: ReturnType<typeof supersedePosting> | null = null;
  let repostedEntryNumber: string | null = null;
  const approvalEval =
    currentHeader?.documentStatus === "posted" || intent === "draft" || options?.bypassApprovalPolicy
      ? { requiresApproval: false }
      : evaluateApprovalRequirement(businessId, userId, "purchase_invoice", base.baseTotalMinor, context.sqlite);
  let finalStatus = "draft" as PurchaseInvoiceStatus;
  runImmediateTransaction(context.sqlite, () => {
    let internalNumber: string;
    let shouldPost = intent === "post" && !approvalEval.requiresApproval;
    let shouldSubmitApproval = !shouldPost && (intent === "submit_approval" || (intent === "post" && approvalEval.requiresApproval));
    let replace = false;
    let effectiveOrderId: string | null = null;
    let oldLineIds: string[] = [];
    if (invoiceId) {
      oldLineIds = (
        context.sqlite.prepare("SELECT id FROM purchase_invoice_lines WHERE purchase_invoice_id = ?").all(invoiceId) as { id: string }[]
      ).map((r) => r.id);
      const current = currentHeader;
      if (!current) throw new Error("Purchase invoice not found.");
      if (current.documentStatus === "void") throw new Error("A void purchase invoice cannot be edited.");
      if (current.documentStatus === "pending_approval" && !options?.bypassApprovalPolicy) {
        throw new Error("This purchase invoice is pending approval. Withdraw or reject it to draft before editing.");
      }
      if (current.documentStatus === "posted") {
        assertDateNotLocked(context.sqlite, current.invoiceDate, "Purchase invoice");
        assertVatSourceUnlocked(context.sqlite, "purchase_invoice", invoiceId, current.taxDate);
      }
      if (context.sqlite.prepare("SELECT 1 FROM goods_receipts WHERE purchase_invoice_id = ? LIMIT 1").get(invoiceId)) throw new Error("A Purchase Invoice cannot be edited after a Goods Receipt has been created from it.");
      const paidMinor = paidForPurchaseInvoice(context.sqlite, invoiceId);
      if (paidMinor > 0 && current.supplierId !== data.supplierId) throw new Error("Cannot change the supplier after payments have been allocated.");
      if (amounts.totalMinor < paidMinor) {
        throw new Error(
          `Cannot reduce purchase invoice ${current.internalNumber} to ${rate.currencyCode} ${formatMinorAmount(amounts.totalMinor, rate.currencyMinorUnit)}: ${rate.currencyCode} ${formatMinorAmount(paidMinor, rate.currencyMinorUnit)} is already settled by payments or debit notes. Remove those allocations first or issue a debit note instead.`,
        );
      }
      internalNumber = current.internalNumber;
      recordedNumber = internalNumber;
      if (current.documentStatus === "posted") {
        shouldPost = true;
        shouldSubmitApproval = false;
      }
      replace = current.documentStatus === "posted";
      assertSupplierInvoiceNumberAvailable(context.sqlite, data.supplierId, data.supplierInvoiceNumber, invoiceId);
      const resolvedOrderId = data.purchaseOrderId || resolvePurchaseOrderIdFromReference(context.sqlite, data.reference, data.supplierId);
      const effectivePurchaseOrderId = resolvedOrderId || ("purchaseOrderId" in input ? null : current.purchaseOrderId) || null;
      effectiveOrderId = effectivePurchaseOrderId;
      context.sqlite.prepare(`
        UPDATE purchase_invoices SET supplier_id = ?, project_id = ?, supplier_invoice_number = ?,
          invoice_date = ?, tax_date = ?, due_date = ?, reference = ?, purchase_order_id = ?, subtotal_minor = ?,
          tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?,
          exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?,
          base_tax_minor = ?, base_total_minor = ?, updated_at = ?, notes = ?, terms = ? WHERE id = ?
      `).run(data.supplierId, data.projectId || null, data.supplierInvoiceNumber, data.invoiceDate, taxDate, data.dueDate, data.reference || null, effectivePurchaseOrderId, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, now, data.notes || null, data.terms || null, invoiceId);
      context.sqlite.prepare("DELETE FROM purchase_invoice_lines WHERE purchase_invoice_id = ?").run(invoiceId);
    } else {
      internalNumber = allocateNumber(context.sqlite, "purchaseInvoice");
      recordedNumber = internalNumber;
      assertSupplierInvoiceNumberAvailable(context.sqlite, data.supplierId, data.supplierInvoiceNumber);
      const resolvedOrderId = data.purchaseOrderId || resolvePurchaseOrderIdFromReference(context.sqlite, data.reference, data.supplierId);
      effectiveOrderId = resolvedOrderId || null;
      context.sqlite.prepare(`
        INSERT INTO purchase_invoices (
          id, internal_number, supplier_id, project_id, supplier_invoice_number, invoice_date, tax_date,
          due_date, reference, purchase_order_id, document_status, subtotal_minor, tax_minor,
          total_minor, created_by, created_at, updated_at, posted_at, voided_at,
          currency_code, exchange_rate_to_base, exchange_rate_date,
          exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, notes, terms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, internalNumber, data.supplierId, data.projectId || null, data.supplierInvoiceNumber, data.invoiceDate, taxDate, data.dueDate, data.reference || null, resolvedOrderId || null, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, userId, now, now, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, data.notes || null, data.terms || null);
    }
    insertLines(context.db, id, lines);
    saveLineCustomFieldValuesInTransaction(
      context.sqlite,
      "purchase_invoice_line",
      lines.map((l) => ({ lineId: l.id, customFields: l.customFields })),
      oldLineIds,
    );
    if (!invoiceId && effectiveOrderId) {
      const parentOrder = context.sqlite.prepare(
        "SELECT status FROM purchase_orders WHERE id = ?"
      ).get(effectiveOrderId) as { status: string } | undefined;
      if (parentOrder && (parentOrder.status === "closed" || parentOrder.status === "cancelled")) {
        throw new Error("Cannot create an invoice for a closed or cancelled purchase order.");
      }
    }
    if (shouldSubmitApproval) {
      context.sqlite.prepare("UPDATE purchase_invoices SET document_status = 'pending_approval' WHERE id = ?").run(id);
      recordPendingApprovalInTransaction(context.sqlite, {
        businessId,
        userId,
        entityType: "purchase_invoice",
        entityId: id,
        entityNumber: internalNumber,
        amountMinor: amounts.totalMinor,
        baseAmountMinor: base.baseTotalMinor,
        currencyCode: rate.currencyCode,
        targetIntent: "post",
      });
      finalStatus = "pending_approval";
    }
    if (shouldPost) assertMutationPermission(businessId, userId, "purchases", "post");
    if (shouldPost) {
      finalStatus = "posted";
      assertDateNotLocked(context.sqlite, data.invoiceDate, "Purchase invoice");
      assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
      const postingLines = lines.map((line) => ({ ...line, projectId: effectiveProjectId(line.projectId, data.projectId) }));
      if (replace && postingChanged) {
        amendment = supersedePosting(context.sqlite, {
          sourceType: "purchase_invoice",
          documentId: id,
          documentLabel: "Purchase Invoice",
          documentNumber: internalNumber,
          taxDate: currentHeader!.taxDate,
        });
      }
      if (!replace || postingChanged) {
        repostedEntryNumber = postPurchaseInvoice(context.sqlite, { id, internalNumber, supplierId: data.supplierId, invoiceDate: data.invoiceDate, totalMinor: amounts.totalMinor, rate }, postingLines).entryNumber;
      }
      replaceTaxEntries(context.sqlite, {
        sourceType: "purchase_invoice", sourceId: id, sourceNumber: internalNumber,
        partyName: supplier.name, taxDate, direction: "purchases", rate,
      }, postingLines);
      context.sqlite.prepare("UPDATE purchase_invoices SET document_status = 'posted', posted_at = COALESCE(posted_at, ?) WHERE id = ?").run(now, id);

      if (!invoiceId && data.applyAvailablePrepayment) {
        const availablePrepayments: SupplierUnallocatedPrepayment[] = getSupplierUnallocatedPrepayments(businessId, userId, data.supplierId)
          .filter((p: SupplierUnallocatedPrepayment) => p.currencyCode === rate.currencyCode && p.unallocatedAmountMinor > 0);

        if (availablePrepayments.length > 0) {
          let remainingBillMinor = amounts.totalMinor;

          if (data.applyPrepaymentPaymentId) {
            const target = availablePrepayments.find((p) => p.paymentId === data.applyPrepaymentPaymentId);
            if (target) {
              const maxApplicable = Math.min(remainingBillMinor, target.unallocatedAmountMinor);
              const customAmountMinor = data.applyPrepaymentAmount
                ? parseCurrencyAmountToMinor(data.applyPrepaymentAmount, rate.currencyMinorUnit)
                : maxApplicable;
              const allocMinor = Math.min(customAmountMinor, maxApplicable);
              if (allocMinor > 0) {
                applySettlementCredit(context.sqlite, supplierPaymentConfig, {
                  paymentId: target.paymentId,
                  documentId: id,
                  amount: allocMinor,
                });
              }
            }
          } else {
            // Auto-allocate FIFO
            for (const prepay of availablePrepayments) {
              if (remainingBillMinor <= 0) break;
              const allocMinor = Math.min(remainingBillMinor, prepay.unallocatedAmountMinor);
              if (allocMinor > 0) {
                applySettlementCredit(context.sqlite, supplierPaymentConfig, {
                  paymentId: prepay.paymentId,
                  documentId: id,
                  amount: allocMinor,
                });
                remainingBillMinor -= allocMinor;
              }
            }
          }
        }
      }
    }
  });

  const formattedTotal = (amounts.totalMinor / (10 ** rate.currencyMinorUnit)).toFixed(2);
  if (beforeSnapshot) {
    const change = describeAmendment(beforeSnapshot, {
      date: data.invoiceDate,
      taxDate,
      partyId: data.supplierId,
      currencyCode: rate.currencyCode,
      exchangeRateToBase: rate.exchangeRateToBase,
      subtotalMinor: amounts.subtotalMinor,
      taxMinor: amounts.taxMinor,
      totalMinor: amounts.totalMinor,
      baseTotalMinor: base.baseTotalMinor,
      lines: lines.map((line) => ({
        description: line.description,
        quantityMicros: line.quantityMicros,
        unitPriceMinor: line.unitPriceMinor,
        accountId: line.expenseAccountId,
        taxCodeId: line.taxCodeId,
        netAmountMinor: line.netAmountMinor,
        taxAmountMinor: line.taxAmountMinor,
        grossAmountMinor: line.grossAmountMinor,
      })),
    });
    const minorUnit = rate.currencyMinorUnit;
    // Assigned inside the transaction callback; TypeScript cannot see that.
    const amendmentResult = amendment as ReturnType<typeof supersedePosting> | null;
    const journalNote = amendmentResult
      ? `; journal ${amendmentResult.supersededEntryNumber} reversed by ${amendmentResult.reversalEntryNumber} and reposted as ${repostedEntryNumber}`
      : "; ledger unchanged";
    recordActivity(businessId, {
      userId,
      action: "updated",
      entityType: "purchase_invoice",
      entityId: id,
      entityNumber: recordedNumber || data.supplierInvoiceNumber,
      summary: `Amended posted purchase invoice ${recordedNumber}: total ${beforeSnapshot.currencyCode} ${formatMinorAmount(beforeSnapshot.totalMinor, minorUnit)} → ${rate.currencyCode} ${formatMinorAmount(amounts.totalMinor, minorUnit)} (${change.lineChangeSummary})${journalNote}`,
      details: {
        supplierId: data.supplierId,
        totalMinor: amounts.totalMinor,
        currency: rate.currencyCode,
        supplierInvoiceNumber: data.supplierInvoiceNumber,
        status: "posted",
        amendment: amendmentResult
          ? { revision: amendmentResult.revision, supersededEntry: amendmentResult.supersededEntryNumber, reversalEntry: amendmentResult.reversalEntryNumber, newEntry: repostedEntryNumber }
          : null,
        ...change,
      },
    });
    return id;
  }
  const action = finalStatus === "posted" ? "posted" : !invoiceId ? "created" : "updated";
  recordActivity(businessId, {
    userId,
    action,
    entityType: "purchase_invoice",
    entityId: id,
    entityNumber: recordedNumber || data.supplierInvoiceNumber,
    summary: `${action === "posted" ? "Posted" : finalStatus === "pending_approval" ? "Submitted for approval" : action === "created" ? "Created draft" : "Updated"} purchase invoice ${recordedNumber || data.supplierInvoiceNumber} for ${rate.currencyCode} ${formattedTotal}`,
    details: { supplierId: data.supplierId, totalMinor: amounts.totalMinor, currency: rate.currencyCode, supplierInvoiceNumber: data.supplierInvoiceNumber, status: finalStatus },
  });

  return id;
}

export function duplicatePurchaseInvoice(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "purchases", "create");
  const record = getPurchaseInvoice(businessId, userId, invoiceId);
  if (!record) throw new Error("Purchase invoice not found.");
  // Reuse the already-fetched DB context rather than calling getBusinessDb a second time.
  const context = getBusinessDb(businessId, userId);
  const baseCurrency = getBaseCurrency(context.sqlite);
  const minorUnit = getCurrency(context.sqlite, record.invoice.currencyCode).minor_unit;
  const today = getBusinessTodayIso();
  const rawTerms = (record.supplier as any)?.paymentTermsDays;
  const dueDays = (rawTerms !== null && rawTerms !== undefined) ? Number(rawTerms) : 30;
  const dueDate = addDaysIso(getBusinessTodayIso(), dueDays);

  return savePurchaseInvoice(businessId, userId, {
    supplierId: record.invoice.supplierId,
    projectId: record.invoice.projectId ?? "",
    currencyCode: record.invoice.currencyCode,
    exchangeRateToBase: record.invoice.exchangeRateToBase,
    exchangeRateDate: record.invoice.currencyCode === baseCurrency.code ? today : record.invoice.exchangeRateDate,
    exchangeRateSource: record.invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
    supplierInvoiceNumber: `${record.invoice.supplierInvoiceNumber}-COPY`,
    invoiceDate: today,
    taxDate: today,
    dueDate,
    reference: record.invoice.reference ?? "",
    purchaseOrderId: "",
    notes: record.invoice.notes ?? "",
    terms: record.invoice.terms ?? "",
    amountsIncludeTax: Boolean(record.invoice.amountsIncludeTax),
    lines: record.lines.map((line) => ({
      itemId: line.itemId ?? "",
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit),
      discountType: ((line as any).discountType as any) || "none",
      discountValue: ((line as any).discountValue as any) || "0",
      expenseAccountId: line.expenseAccountId,
      taxCodeId: line.taxCodeId,
      projectId: line.projectId ?? "",
    })),
  }, "draft");
}

export function deletePurchaseInvoice(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "purchases", "delete");
  const context = getBusinessDb(businessId, userId);
  const invoice = context.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).get();
  if (!invoice) throw new Error("Purchase invoice not found.");
  if (invoice.documentStatus !== "draft") throw new Error("Only draft purchase invoices can be deleted.");
  context.sqlite.transaction(() => {
    context.db.delete(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).run();
    if (invoice.purchaseOrderId) {
      const remainingCount = context.sqlite.prepare(
        "SELECT COUNT(*) as c FROM purchase_invoices WHERE purchase_order_id = ? AND id != ? AND document_status != 'void'"
      ).get(invoice.purchaseOrderId, invoiceId) as { c: number };
      if (remainingCount.c === 0) {
        context.sqlite.prepare(
          "UPDATE purchase_orders SET status = 'issued' WHERE id = ? AND status = 'closed'"
        ).run(invoice.purchaseOrderId);
      }
    }
  }).immediate();

  recordActivity(businessId, {
    userId,
    action: "deleted",
    entityType: "purchase_invoice",
    entityId: invoiceId,
    entityNumber: invoice.internalNumber,
    summary: `Deleted draft purchase invoice ${invoice.internalNumber}`,
  });
}

export function voidPurchaseInvoice(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "purchases", "delete");
  const context = getBusinessDb(businessId, userId);
  const invoice = context.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).get();
  if (!invoice) throw new Error("Purchase invoice not found.");
  if (invoice.documentStatus !== "posted") throw new Error("Only posted purchase invoices can be voided.");
  if (paidForPurchaseInvoice(context.sqlite, invoiceId) > 0) throw new Error("Cannot void a purchase invoice that has payment allocations.");
  if (context.sqlite.prepare("SELECT 1 FROM goods_receipts WHERE purchase_invoice_id = ? AND document_status != 'void' LIMIT 1").get(invoiceId)) {
    throw new Error("Cannot void a purchase invoice that has active goods receipts. Void the goods receipts first.");
  }
  if (context.sqlite.prepare("SELECT 1 FROM debit_notes WHERE purchase_invoice_id = ? AND document_status != 'void' LIMIT 1").get(invoiceId)) {
    throw new Error("Cannot void a purchase invoice that has active debit notes. Void the debit notes first.");
  }
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    assertDateNotLocked(context.sqlite, invoice.invoiceDate, "Purchase invoice void");
    assertDateNotLocked(context.sqlite, getBusinessTodayIso(), "Purchase invoice void");
    assertVatSourceUnlocked(context.sqlite, "purchase_invoice", invoiceId, invoice.taxDate);
    reverseTransaction(context.sqlite, { originalSourceType: "purchase_invoice", originalSourceId: invoiceId, reversalSourceType: "purchase_invoice_void", reversalSourceId: invoiceId, date: getBusinessTodayIso(), description: `Void Purchase Invoice ${invoice.internalNumber}` });
    reverseTaxEntries(context.sqlite, { originalSourceType: "purchase_invoice", sourceId: invoiceId, reversalSourceType: "purchase_invoice_void", taxDate: getBusinessTodayIso() });
    context.sqlite.prepare("UPDATE purchase_invoices SET document_status = 'void', voided_at = ?, updated_at = ? WHERE id = ?").run(now, now, invoiceId);
    if (invoice.purchaseOrderId) {
      const remainingCount = context.sqlite.prepare(
        "SELECT COUNT(*) as c FROM purchase_invoices WHERE purchase_order_id = ? AND id != ? AND document_status != 'void'"
      ).get(invoice.purchaseOrderId, invoiceId) as { c: number };
      if (remainingCount.c === 0) {
        context.sqlite.prepare(
          "UPDATE purchase_orders SET status = 'issued' WHERE id = ? AND status = 'closed'"
        ).run(invoice.purchaseOrderId);
      }
    }
  }).immediate();

  recordActivity(businessId, {
    userId,
    action: "voided",
    entityType: "purchase_invoice",
    entityId: invoiceId,
    entityNumber: invoice.internalNumber,
    summary: `Voided purchase invoice ${invoice.internalNumber}`,
    details: { supplierId: invoice.supplierId, supplierInvoiceNumber: invoice.supplierInvoiceNumber },
  });
}

function buildPurchaseInvoiceInputFromRecord(
  context: ReturnType<typeof getBusinessDb>,
  record: NonNullable<ReturnType<typeof getPurchaseInvoice>>,
): PurchaseInvoiceInput {
  const minorUnit = getCurrency(context.sqlite, record.invoice.currencyCode).minor_unit;
  return {
    supplierId: record.invoice.supplierId,
    projectId: record.invoice.projectId ?? "",
    currencyCode: record.invoice.currencyCode,
    exchangeRateToBase: record.invoice.exchangeRateToBase,
    exchangeRateDate: record.invoice.exchangeRateDate,
    exchangeRateSource: record.invoice.exchangeRateSource as any,
    supplierInvoiceNumber: record.invoice.supplierInvoiceNumber,
    invoiceDate: record.invoice.invoiceDate,
    taxDate: record.invoice.taxDate,
    dueDate: record.invoice.dueDate,
    reference: record.invoice.reference ?? "",
    notes: record.invoice.notes ?? "",
    terms: record.invoice.terms ?? "",
    purchaseOrderId: record.invoice.purchaseOrderId ?? "",
    amountsIncludeTax: Boolean(record.invoice.amountsIncludeTax),
    lines: record.lines.map((line) => ({
      itemId: line.itemId ?? "",
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit),
      discountType: (line.discountType ?? "none") as any,
      discountValue: line.discountValue ?? "0",
      expenseAccountId: line.expenseAccountId,
      taxCodeId: line.taxCodeId,
      projectId: line.projectId ?? "",
      customFields: line.customFields ?? {},
    })),
  };
}

export function postPurchaseInvoiceDoc(
  businessId: string,
  userId: string,
  invoiceId: string,
  intent: "post" | "submit_approval" = "post",
): PurchaseInvoiceStatus {
  assertMutationPermission(businessId, userId, "purchases", "edit");
  const record = getPurchaseInvoice(businessId, userId, invoiceId);
  if (!record) throw new Error("Purchase invoice not found.");
  if (record.invoice.documentStatus === "posted") return "posted";
  if (record.invoice.documentStatus === "void") throw new Error("A void purchase invoice cannot be posted.");
  if (record.invoice.documentStatus === "pending_approval") {
    throw new Error("This purchase invoice is pending approval and must be finalized through the approval queue.");
  }

  const context = getBusinessDb(businessId, userId);
  const evalResult =
    intent === "submit_approval"
      ? { requiresApproval: true }
      : evaluateApprovalRequirement(
          businessId,
          userId,
          "purchase_invoice",
          record.invoice.baseTotalMinor,
          context.sqlite,
        );
  if (!evalResult.requiresApproval) {
    assertMutationPermission(businessId, userId, "purchases", "post");
  }
  savePurchaseInvoice(
    businessId,
    userId,
    buildPurchaseInvoiceInputFromRecord(context, record),
    evalResult.requiresApproval ? "submit_approval" : "post",
    invoiceId,
  );
  return evalResult.requiresApproval ? "pending_approval" : "posted";
}

export function postPendingPurchaseInvoice(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "purchases", "post");
  const record = getPurchaseInvoice(businessId, userId, invoiceId);
  if (!record) throw new Error("Purchase invoice not found.");
  if (record.invoice.documentStatus === "posted") return;
  if (record.invoice.documentStatus === "void") throw new Error("A void purchase invoice cannot be posted.");
  const context = getBusinessDb(businessId, userId);
  savePurchaseInvoice(
    businessId,
    userId,
    buildPurchaseInvoiceInputFromRecord(context, record),
    "post",
    invoiceId,
    { bypassApprovalPolicy: true },
  );
}

export function revertPurchaseInvoiceToDraft(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "purchases", "post");
  const context = getBusinessDb(businessId, userId);
  const row = context.sqlite
    .prepare("SELECT id, document_status FROM purchase_invoices WHERE id = ?")
    .get(invoiceId) as { id: string; document_status: string } | undefined;
  if (!row) throw new Error("Purchase invoice not found.");
  if (row.document_status !== "pending_approval") {
    throw new Error(`Cannot return purchase invoice in "${row.document_status}" status to draft.`);
  }
  context.sqlite
    .prepare("UPDATE purchase_invoices SET document_status = 'draft', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), invoiceId);
}

export type BatchPurchaseActionResult = {
  successCount: number;
  postedCount?: number;
  pendingApprovalCount?: number;
  failedCount: number;
  errors: { id: string; number?: string; error: string }[];
};

export function batchPostPurchaseInvoices(
  businessId: string,
  userId: string,
  invoiceIds: string[],
  intent: "post" | "submit_approval" = "post",
): BatchPurchaseActionResult {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  assertMutationPermission(businessId, userId, "purchases", "edit");
  if (intent !== "submit_approval" && !access.requiresApproval) {
    assertMutationPermission(businessId, userId, "purchases", "post");
  }
  const result: BatchPurchaseActionResult = {
    successCount: 0,
    postedCount: 0,
    pendingApprovalCount: 0,
    failedCount: 0,
    errors: [],
  };
  for (const id of invoiceIds) {
    let billNumber: string | undefined;
    try {
      const record = getPurchaseInvoice(businessId, userId, id);
      if (!record) {
        result.failedCount++;
        result.errors.push({ id, error: "Bill not found" });
        continue;
      }
      billNumber = record.invoice.internalNumber;
      if (record.invoice.documentStatus === "posted") {
        result.successCount++;
        result.postedCount = (result.postedCount ?? 0) + 1;
        continue;
      }
      if (record.invoice.documentStatus === "void") {
        result.failedCount++;
        result.errors.push({ id, number: billNumber, error: "Cannot post a void bill" });
        continue;
      }
      const nextStatus = postPurchaseInvoiceDoc(businessId, userId, id, intent);
      result.successCount++;
      if (nextStatus === "pending_approval") {
        result.pendingApprovalCount = (result.pendingApprovalCount ?? 0) + 1;
      } else {
        result.postedCount = (result.postedCount ?? 0) + 1;
      }
    } catch (err) {
      result.failedCount++;
      result.errors.push({ id, number: billNumber, error: err instanceof Error ? err.message : "Posting failed" });
    }
  }
  return result;
}

export function batchVoidPurchaseInvoices(businessId: string, userId: string, invoiceIds: string[]): BatchPurchaseActionResult {
  assertMutationPermission(businessId, userId, "purchases", "delete");
  const result: BatchPurchaseActionResult = { successCount: 0, failedCount: 0, errors: [] };
  for (const id of invoiceIds) {
    try {
      const record = getPurchaseInvoice(businessId, userId, id);
      if (!record) {
        result.failedCount++;
        result.errors.push({ id, error: "Bill not found" });
        continue;
      }
      if (record.invoice.documentStatus === "void") {
        result.successCount++;
        continue;
      }
      if (record.invoice.documentStatus === "draft") {
        deletePurchaseInvoice(businessId, userId, id);
        result.successCount++;
        continue;
      }
      voidPurchaseInvoice(businessId, userId, id);
      result.successCount++;
    } catch (err) {
      result.failedCount++;
      result.errors.push({ id, number: (getPurchaseInvoice(businessId, userId, id)?.invoice.internalNumber) || id, error: err instanceof Error ? err.message : "Void failed" });
    }
  }
  return result;
}

export function batchDeletePurchaseInvoices(businessId: string, userId: string, invoiceIds: string[]): BatchPurchaseActionResult {
  assertMutationPermission(businessId, userId, "purchases", "delete");
  const result: BatchPurchaseActionResult = { successCount: 0, failedCount: 0, errors: [] };
  for (const id of invoiceIds) {
    try {
      deletePurchaseInvoice(businessId, userId, id);
      result.successCount++;
    } catch (err) {
      result.failedCount++;
      result.errors.push({ id, error: err instanceof Error ? err.message : "Delete failed" });
    }
  }
  return result;
}

export type PayablesDueSummary = {
  dueCount: number;
  dueBaseMinor: number;
  overdueCount: number;
  overdueBaseMinor: number;
};

/**
 * Open posted bills due on or before `today + horizonDays` (overdue included),
 * in base currency. Foreign bills are converted pro rata from their base total.
 */
export function getPayablesDueSummary(businessId: string, userId: string, today: string, horizonDays = 7): PayablesDueSummary {
  const { sqlite } = getBusinessDb(businessId, userId);
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + horizonDays * 86_400_000).toISOString().slice(0, 10);
  return sqlite.prepare(`
    WITH ${PURCHASE_SETTLEMENT_CTE},
    open_bills AS (
      SELECT pi.due_date,
        pi.total_minor - (${PURCHASE_PAID_FOREIGN_EXPR}) AS foreign_open,
        CASE WHEN pi.total_minor > 0
          THEN CAST(ROUND(pi.base_total_minor * (pi.total_minor - (${PURCHASE_PAID_FOREIGN_EXPR})) * 1.0 / pi.total_minor) AS INTEGER)
          ELSE 0 END AS base_open
      FROM purchase_invoices pi
      LEFT JOIN payment_alloc pa ON pa.invoice_id = pi.id
      LEFT JOIN debit_alloc da ON da.invoice_id = pi.id
      WHERE pi.document_status = 'posted'
    )
    SELECT
      COALESCE(SUM(CASE WHEN due_date <= @horizon THEN 1 ELSE 0 END), 0) AS dueCount,
      COALESCE(SUM(CASE WHEN due_date <= @horizon THEN base_open ELSE 0 END), 0) AS dueBaseMinor,
      COALESCE(SUM(CASE WHEN due_date < @today THEN 1 ELSE 0 END), 0) AS overdueCount,
      COALESCE(SUM(CASE WHEN due_date < @today THEN base_open ELSE 0 END), 0) AS overdueBaseMinor
    FROM open_bills WHERE foreign_open > 0
  `).get({ today, horizon }) as PayablesDueSummary;
}
