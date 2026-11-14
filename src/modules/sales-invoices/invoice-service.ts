import { assertMutationPermission, assertSavePermission } from "@/core/permissions/mutation-permissions";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb, runImmediateTransaction } from "@/core/db/business";
import {
  businessTaxSettings,
  customers,
  salesInvoiceLines,
  salesInvoices,
} from "@/core/db/business-schema";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { postSalesInvoice } from "@/modules/accounting/services/invoice-posting-service";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { replaceTaxEntries, reverseTaxEntries } from "@/modules/tax/tax-entry-service";
import { assertVatDateUnlocked, assertVatSourceUnlocked } from "@/modules/tax/tax-lock-service";
import { assertDateNotLocked } from "@/modules/accounting/services/financial-lock-service";
import { saveCustomFieldValuesInTransaction, saveLineCustomFieldValuesInTransaction, getCustomFieldValuesForEntities } from "@/modules/custom-fields/custom-field-service";
import { invoiceInputSchema, type InvoiceInput } from "./invoice-input";
import { convertDocumentLinesToBase, minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { getCurrency } from "@/modules/currency/currency";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";
import { getCustomerUnallocatedCredit, receiptConfig } from "@/modules/receipts/receipt-service";
import { applySettlementCredit } from "@/modules/settlement/settlement-service";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";
import { evaluateApprovalRequirement, recordPendingApprovalInTransaction } from "@/modules/approvals/approval-policy";

export type DocumentStatus = "draft" | "pending_approval" | "posted" | "void";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "overdue";
export type InvoiceSaveIntent = "draft" | "submit_approval" | "post";

function derivePaymentStatus(
  documentStatus: DocumentStatus,
  totalMinor: number,
  allocatedMinor: number,
  dueDate: string,
): PaymentStatus | null {
  if (documentStatus !== "posted") return null;
  const balanceMinor = Math.max(0, totalMinor - allocatedMinor);
  if (balanceMinor === 0) return "paid";
  if (dueDate < new Date().toISOString().slice(0, 10)) return "overdue";
  if (allocatedMinor > 0) return "partially_paid";
  return "unpaid";
}

function allocatedForInvoice(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string) {
  const row = sqlite
    .prepare(`
      SELECT
        COALESCE((SELECT SUM(ra.amount_minor) FROM receipt_allocations ra
          INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
          WHERE ra.sales_invoice_id = ?), 0)
        + COALESCE((SELECT SUM(scna.amount_minor) FROM sales_credit_note_allocations scna
          INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
          WHERE scna.sales_invoice_id = ?), 0) AS allocated_minor
    `)
    .get(invoiceId, invoiceId) as { allocated_minor: number };
  return row.allocated_minor;
}


import { drizzle } from "drizzle-orm/better-sqlite3";
import * as businessSchema from "@/core/db/business-schema";

function insertLines(
  dbOrSqlite: ReturnType<typeof getBusinessDb>["db"] | ReturnType<typeof getBusinessDb>["sqlite"],
  invoiceId: string,
  lines: StoredLine[],
) {
  if (lines.length === 0) return;
  const db = "insert" in dbOrSqlite ? dbOrSqlite : drizzle(dbOrSqlite, { schema: businessSchema });
  const linesArray = lines.map((line) => ({
    id: line.id,
    invoiceId,
    description: line.description,
    quantityMicros: line.quantityMicros,
    unitPriceMinor: line.unitPriceMinor,
    discountType: (line.discountType as "none" | "percentage" | "fixed") || "none",
    discountValue: line.discountValue || "0",
    salesAccountId: line.salesAccountId,
    taxCodeId: line.taxCodeId,
    projectId: line.projectId || null,
    itemId: line.itemId || null,
    netAmountMinor: line.netAmountMinor,
    taxAmountMinor: line.taxAmountMinor,
    grossAmountMinor: line.grossAmountMinor,
    position: line.lineIndex,
  }));
  db.insert(salesInvoiceLines).values(linesArray).run();
}


const ALLOCATED_MINOR_FRAGMENT = `
  COALESCE((SELECT SUM(ra.amount_minor) FROM receipt_allocations ra
    INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
    WHERE ra.sales_invoice_id = i.id), 0)
  + COALESCE((SELECT SUM(scna.amount_minor) FROM sales_credit_note_allocations scna
    INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
    WHERE scna.sales_invoice_id = i.id), 0)
`;

const ALLOCATED_BASE_MINOR_FRAGMENT = `
  COALESCE((SELECT SUM(ra.base_carrying_amount_released) FROM receipt_allocations ra
    INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
    WHERE ra.sales_invoice_id = i.id), 0)
  + COALESCE((SELECT SUM(scna.base_carrying_amount_released) FROM sales_credit_note_allocations scna
    INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
    WHERE scna.sales_invoice_id = i.id), 0)
`;

export type InvoiceListFilters = {
    status?: "draft" | "overdue" | "unpaid" | "paid" | "void";
  /** Inclusive lower bound on invoice_date (YYYY-MM-DD). Invalid values are ignored. */
  from?: string;
  /** Inclusive upper bound on invoice_date (YYYY-MM-DD). Invalid values are ignored. */
  to?: string;
  /** Maximum rows to return (server-side LIMIT). Used by the paginated list path. */
  take?: number;
  /** Number of rows to skip (server-side OFFSET). Used by the paginated list path. */
  skip?: number;
};

/**
 * Paginated invoice list result. The rows slice contains just the rows
 * for the requested page; `total` is the unfiltered-over-rows count for
 * the same `filters` (so the UI can show "Page X of Y"). When `filters`
 * is empty the total is the full invoice count for the business.
 */
export type PaginatedInvoices = {
  rows: Awaited<ReturnType<typeof listInvoiceRows>>;
  total: number;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

/**
 * Count invoices matching `filters` (without customer scoping) using the
 * same WHERE-clause builder as `listInvoiceRows`. Returns the row count
 * used by `listInvoicesPaginated` to compute total pages.
 */
function countInvoiceRows(businessId: string, userId: string, filters?: InvoiceListFilters): number {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  const dateFrom = validDate(filters?.from);
  const dateTo = validDate(filters?.to);

    if (filters?.status === "overdue") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor > (${ALLOCATED_MINOR_FRAGMENT})`);
      conditions.push("i.due_date < date('now', 'localtime')");
    } else if (filters?.status === "draft") {
      conditions.push("i.document_status = 'draft'");
    } else if (filters?.status === "void") {
      conditions.push("i.document_status = 'void'");
    } else if (filters?.status === "unpaid") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor > (${ALLOCATED_MINOR_FRAGMENT})`);
    } else if (filters?.status === "paid") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor <= (${ALLOCATED_MINOR_FRAGMENT})`);
    }

  if (dateFrom) {
    conditions.push("i.invoice_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("i.invoice_date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = sqlite.prepare(`SELECT COUNT(*) AS total FROM sales_invoices i ${where}`).get(...values) as { total: number };
  return row.total;
}

/**
 * Paginated list of invoices for the list page. Server-side LIMIT/OFFSET
 * keeps the query cheap as the invoice table grows past thousands of
 * rows. The returned `total` is the count for the same `filters`
 * excluding the page bounds — the UI uses it to render "Page X of Y"
 * and disable the Next button on the last page.
 *
 * @param page 1-indexed page number (clamped to >= 1).
 * @param pageSize rows per page (defaults to 50, capped at 200 to
 *   protect against accidental huge-page requests).
 */
export function listInvoicesPaginated(
  businessId: string,
  userId: string,
  filters: InvoiceListFilters & { page?: number; pageSize?: number } = {},
): PaginatedInvoices {
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const total = countInvoiceRows(businessId, userId, filters);
  // Clamp the page number to the last valid page so out-of-range URLs
  // (e.g. `?page=999`) still render the last page rather than 0 rows.
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;
  const rows = listInvoiceRows(businessId, userId, undefined, { ...filters, take: pageSize, skip: offset });
  return { rows, total, page: effectivePage, pageSize, totalPages: maxPage };
}

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function listInvoiceRows(
  businessId: string,
  userId: string,
  customerId?: string,
  filters?: InvoiceListFilters,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  if (customerId) {
    conditions.push("i.customer_id = ?");
    values.push(customerId);
  }
  const dateFrom = validDate(filters?.from);
  const dateTo = validDate(filters?.to);

    if (filters?.status === "overdue") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor > (${ALLOCATED_MINOR_FRAGMENT})`);
      conditions.push("i.due_date < date('now', 'localtime')");
    } else if (filters?.status === "draft") {
      conditions.push("i.document_status = 'draft'");
    } else if (filters?.status === "void") {
      conditions.push("i.document_status = 'void'");
    } else if (filters?.status === "unpaid") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor > (${ALLOCATED_MINOR_FRAGMENT})`);
    } else if (filters?.status === "paid") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor <= (${ALLOCATED_MINOR_FRAGMENT})`);
    }

  if (dateFrom) {
    conditions.push("i.invoice_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("i.invoice_date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  // Server-side LIMIT/OFFSET supports the paginated list path. When both
  // are undefined the query returns the full result set (used by the
  // overview page, customer statement view, etc.).
  const limitClause = filters?.take !== undefined && Number.isFinite(filters.take) && filters.take >= 0 ? `LIMIT ${Math.floor(filters.take)}` : "";
  const offsetClause = filters?.skip !== undefined && Number.isFinite(filters.skip) && filters.skip >= 0 ? `OFFSET ${Math.floor(filters.skip)}` : "";
  const pagination = `${limitClause} ${offsetClause}`.trim();
  const rows = sqlite
    .prepare(`
      SELECT i.id, i.invoice_number, i.customer_id, c.name AS customer_name, c.email AS customer_email,
             i.invoice_date, i.due_date, i.total_minor, i.base_total_minor, i.currency_code,
             cur.minor_unit AS currency_minor_unit,
             i.exchange_rate_to_base, i.exchange_rate_date, i.exchange_rate_source, i.document_status,
             i.updated_at,
             (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, i.project_id))
                FROM sales_invoice_lines l WHERE l.invoice_id = i.id) AS project_ids,
             (${ALLOCATED_MINOR_FRAGMENT}) AS allocated_minor,
             (${ALLOCATED_BASE_MINOR_FRAGMENT}) AS allocated_base_minor
      FROM sales_invoices i
      INNER JOIN customers c ON c.id = i.customer_id
      INNER JOIN currencies cur ON cur.code = i.currency_code
      ${where}
      ORDER BY i.invoice_date DESC, i.created_at DESC
      ${pagination}
    `)
    .all(...values) as {
      id: string;
      invoice_number: string;
      customer_id: string;
      customer_name: string;
      customer_email: string | null;
      invoice_date: string;
      due_date: string;
      total_minor: number;
      base_total_minor: number;
      currency_code: string;
      currency_minor_unit: number;
      exchange_rate_to_base: string;
      exchange_rate_date: string;
      exchange_rate_source: string;
      document_status: DocumentStatus;
      updated_at: string;
      allocated_minor: number;
      allocated_base_minor: number;
      project_ids: string | null;
    }[];
  const projects = sqlite.prepare("SELECT id, code, name FROM projects").all() as { id: string; code: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email ?? null,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    totalMinor: row.total_minor,
    baseTotalMinor: row.base_total_minor,
    currencyCode: row.currency_code,
    currencyMinorUnit: row.currency_minor_unit,
    exchangeRateToBase: row.exchange_rate_to_base,
    exchangeRateDate: row.exchange_rate_date,
    exchangeRateSource: row.exchange_rate_source,
    allocatedMinor: row.allocated_minor,
    balanceMinor: row.document_status === "posted" ? row.total_minor - row.allocated_minor : 0,
    baseBalanceMinor: row.document_status === "posted" ? row.base_total_minor - row.allocated_base_minor : 0,
    documentStatus: row.document_status,
    paymentStatus: derivePaymentStatus(
      row.document_status,
      row.total_minor,
      row.allocated_minor,
      row.due_date,
    ),
    projectIds: row.project_ids?.split(",").filter(Boolean) ?? [],
    projectNames: (row.project_ids?.split(",").filter(Boolean) ?? []).map((id) => projectById.get(id)?.name ?? id),
    updatedAt: row.updated_at,
  }));
}

export function listInvoices(businessId: string, userId: string, filters?: InvoiceListFilters) {
  return listInvoiceRows(businessId, userId, undefined, filters);
}

export function listInvoicesForCustomer(businessId: string, userId: string, customerId: string) {
  return listInvoiceRows(businessId, userId, customerId);
}

export function getInvoice(businessId: string, userId: string, invoiceId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db
    .select({ invoice: salesInvoices, customer: customers })
    .from(salesInvoices)
    .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
    .where(eq(salesInvoices.id, invoiceId))
    .get();
  if (!header) return null;
  const lines = context.db
    .select()
    .from(salesInvoiceLines)
    .where(eq(salesInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(salesInvoiceLines.position))
    .all();
  const lineAccountIds = [...new Set(lines.map(l => l.salesAccountId))];
  const lineTaxCodeIds = [...new Set(lines.map(l => l.taxCodeId))];
  const lineItemIds = [...new Set(lines.map(l => l.itemId).filter(Boolean))] as string[];
  const projectIds = [...new Set([header.invoice.projectId, ...lines.map(l => l.projectId)].filter(Boolean))] as string[];

  const accountRows = lineAccountIds.length > 0
    ? context.sqlite.prepare(`SELECT id, name FROM accounts WHERE id IN (${lineAccountIds.map(() => '?').join(',')})`).all(...lineAccountIds) as { id: string; name: string }[]
    : [];
  const taxCodeRows = lineTaxCodeIds.length > 0
    ? context.sqlite.prepare(`SELECT id, name, rate_basis_points FROM tax_codes WHERE id IN (${lineTaxCodeIds.map(() => '?').join(',')})`).all(...lineTaxCodeIds) as { id: string; name: string; rate_basis_points: number }[]
    : [];
  const projectRows = projectIds.length > 0
    ? context.sqlite.prepare(`SELECT id, code, name FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')})`).all(...projectIds) as { id: string; code: string; name: string }[]
    : [];
  const itemRows = lineItemIds.length > 0
    ? context.sqlite.prepare(`SELECT id, sku, name, unit_name FROM inventory_items WHERE id IN (${lineItemIds.map(() => '?').join(',')})`).all(...lineItemIds) as { id: string; sku: string | null; name: string; unit_name: string }[]
    : [];

  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const taxCodeById = new Map(taxCodeRows.map((taxCode) => [taxCode.id, taxCode]));
  const projectById = new Map(projectRows.map((project) => [project.id, project]));
  const itemById = new Map(itemRows.map((item) => [item.id, item]));
  const deliveredRows = context.sqlite.prepare(`SELECT dnl.sales_invoice_line_id AS line_id, SUM(dnl.quantity_micros) AS delivered_micros FROM delivery_note_lines dnl INNER JOIN delivery_notes dn ON dn.id = dnl.delivery_note_id AND dn.document_status = 'posted' WHERE dn.sales_invoice_id = ? GROUP BY dnl.sales_invoice_line_id`).all(invoiceId) as { line_id: string; delivered_micros: number }[];
  const deliveredByLine = new Map(deliveredRows.map((row) => [row.line_id, row.delivered_micros]));
  const allocatedMinor = allocatedForInvoice(context.sqlite, invoiceId);
  const receipts = context.sqlite
    .prepare(`
      SELECT r.id, r.receipt_number, r.date, r.amount_minor, r.reference, ra.amount_minor AS allocated_minor
      FROM receipt_allocations ra
      INNER JOIN receipts r ON r.id = ra.receipt_id
      WHERE ra.sales_invoice_id = ? AND r.document_status = 'posted'
      ORDER BY r.date DESC, r.created_at DESC
    `)
    .all(invoiceId) as {
      id: string;
      receipt_number: string;
      date: string;
      amount_minor: number;
      reference: string | null;
      allocated_minor: number;
    }[];
  const journal = context.sqlite
    .prepare("SELECT id, entry_number FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?")
    .get(invoiceId) as { id: string; entry_number: string } | undefined;
  const reversalJournal = context.sqlite
    .prepare("SELECT id, entry_number FROM journal_entries WHERE source_type = 'sales_invoice_void' AND source_id = ?")
    .get(invoiceId) as { id: string; entry_number: string } | undefined;
  const creditNotes = context.sqlite
    .prepare(`
      SELECT scn.id, scn.credit_note_number, scn.date, scn.document_status,
             scna.amount_minor AS allocated_minor
      FROM sales_credit_note_allocations scna
      INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id
      WHERE scna.sales_invoice_id = ?
      ORDER BY scn.date DESC, scn.created_at DESC
    `)
    .all(invoiceId) as {
      id: string;
      credit_note_number: string;
      date: string;
      document_status: DocumentStatus;
      allocated_minor: number;
    }[];
  const lineCustomFieldsMap = getCustomFieldValuesForEntities(
    businessId,
    userId,
    "sales_invoice_line",
    lines.map((l) => l.id),
  );
  return {
    ...header,
    project: header.invoice.projectId ? projectById.get(header.invoice.projectId) ?? null : null,
    lines: lines.map((line) => ({
      ...line,
      item: line.itemId ? itemById.get(line.itemId) ?? null : null,
      deliveredMicros: deliveredByLine.get(line.id) ?? 0,
      remainingToDeliverMicros: Math.max(0, line.quantityMicros - (deliveredByLine.get(line.id) ?? 0)),
      salesAccount: accountById.get(line.salesAccountId) ?? null,
      taxCode: taxCodeById.get(line.taxCodeId) ?? null,
      project: effectiveProjectId(line.projectId, header.invoice.projectId) ? projectById.get(effectiveProjectId(line.projectId, header.invoice.projectId)!) ?? null : null,
      customFields: lineCustomFieldsMap.get(line.id) ?? {},
    })),
    allocatedMinor,
    balanceMinor:
      header.invoice.documentStatus === "posted"
        ? Math.max(0, header.invoice.totalMinor - allocatedMinor)
        : 0,
    paymentStatus: derivePaymentStatus(
      header.invoice.documentStatus,
      header.invoice.totalMinor,
      allocatedMinor,
      header.invoice.dueDate,
    ),
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      receiptNumber: receipt.receipt_number,
      date: receipt.date,
      amountMinor: receipt.amount_minor,
      allocatedMinor: receipt.allocated_minor,
      reference: receipt.reference,
    })),
    creditNotes: creditNotes.map((note) => ({
      id: note.id,
      creditNoteNumber: note.credit_note_number,
      date: note.date,
      documentStatus: note.document_status,
      allocatedMinor: note.allocated_minor,
    })),
    journal: journal ? { id: journal.id, entryNumber: journal.entry_number } : null,
    reversalJournal: reversalJournal ? { id: reversalJournal.id, entryNumber: reversalJournal.entry_number } : null,
    deliveryNotes: context.sqlite.prepare("SELECT id, delivery_number, date, document_status FROM delivery_notes WHERE sales_invoice_id = ? ORDER BY date DESC, created_at DESC").all(invoiceId) as { id: string; delivery_number: string; date: string; document_status: string }[],
    linkedOrder: header.invoice.salesOrderId
      ? (context.sqlite.prepare("SELECT id, order_number, document_status, sales_quote_id FROM sales_orders WHERE id = ?").get(header.invoice.salesOrderId) as { id: string; order_number: string; document_status: string; sales_quote_id: string | null } | undefined)
      : undefined,
    linkedQuote: header.invoice.quoteId
      ? (context.sqlite.prepare("SELECT id, quote_number, document_status FROM sales_quotes WHERE id = ?").get(header.invoice.quoteId) as { id: string; quote_number: string; document_status: string } | undefined)
      : header.invoice.salesOrderId
      ? (context.sqlite.prepare("SELECT sq.id, sq.quote_number, sq.document_status FROM sales_quotes sq INNER JOIN sales_orders so ON so.sales_quote_id = sq.id WHERE so.id = ?").get(header.invoice.salesOrderId) as { id: string; quote_number: string; document_status: string } | undefined)
      : undefined,
  };
}

function resolveOrderAndQuoteFromReference(sqlite: any, reference?: string | null, customerId?: string | null): { orderId: string | null; quoteId: string | null } {
  if (!reference) return { orderId: null, quoteId: null };
  const trimmed = reference.trim();
  let orderId: string | null = null;
  let quoteId: string | null = null;

  const directOrder = sqlite.prepare("SELECT id FROM sales_orders WHERE order_number = ? AND (? IS NULL OR customer_id = ?) LIMIT 1").get(trimmed, customerId ?? null, customerId ?? null) as { id: string } | undefined;
  if (directOrder) orderId = directOrder.id;

  const directQuote = sqlite.prepare("SELECT id FROM sales_quotes WHERE quote_number = ? AND (? IS NULL OR customer_id = ?) LIMIT 1").get(trimmed, customerId ?? null, customerId ?? null) as { id: string } | undefined;
  if (directQuote) quoteId = directQuote.id;

  const matches = trimmed.match(/\b([A-Za-z]{1,5}-\d+)\b/g);
  if (matches) {
    for (const code of matches) {
      if (!orderId) {
        const foundOrder = sqlite.prepare("SELECT id FROM sales_orders WHERE order_number = ? AND (? IS NULL OR customer_id = ?) LIMIT 1").get(code, customerId ?? null, customerId ?? null) as { id: string } | undefined;
        if (foundOrder) orderId = foundOrder.id;
      }
      if (!quoteId) {
        const foundQuote = sqlite.prepare("SELECT id FROM sales_quotes WHERE quote_number = ? AND (? IS NULL OR customer_id = ?) LIMIT 1").get(code, customerId ?? null, customerId ?? null) as { id: string } | undefined;
        if (foundQuote) quoteId = foundQuote.id;
      }
    }
  }
  return { orderId, quoteId };
}

export function createInvoice(
  businessId: string,
  userId: string,
  input: InvoiceInput,
  intent: InvoiceSaveIntent,
  customFieldValues?: Record<string, string>,
) {
  assertSavePermission(businessId, userId, "sales", undefined, "draft");
  const data = invoiceInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const customer = context.db.select().from(customers).where(eq(customers.id, data.customerId)).get();
  if (!customer) throw new Error("Customer not found.");
  const taxDate = data.taxDate || data.invoiceDate;
  const rate = resolveRateSnapshot(context.sqlite, {
    currencyCode: input.currencyCode ?? customer.defaultCurrencyCode ?? data.currencyCode,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: taxDate,
    taxCodeIds: data.lines.map((line) => line.taxCodeId),
    enforceVatPolicy: true,
  });
  validateProjectReferences(context.sqlite, { headerProjectId: data.projectId, lineProjectIds: data.lines.map((line) => line.projectId), customerId: data.customerId, customerFacing: true });
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, { accountTypeFilter: "income", taxDirection: "sales", supportItems: true, accountFieldOnLine: "salesAccountId", amountsIncludeTax: data.amountsIncludeTax });
  const totals = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);

  const approvalEval =
    intent === "draft"
      ? { requiresApproval: false, requireCheckerSeparation: true }
      : evaluateApprovalRequirement(businessId, userId, "sales_invoice", base.baseTotalMinor, context.sqlite);
  const effectiveIntent: InvoiceSaveIntent =
    intent === "draft"
      ? "draft"
      : intent === "submit_approval" || approvalEval.requiresApproval
        ? "submit_approval"
        : "post";
  if (effectiveIntent === "post") {
    assertMutationPermission(businessId, userId, "sales", "post");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  let recordedInvoiceNumber = "";
  const autoRefs = (!data.salesOrderId || !data.quoteId) ? resolveOrderAndQuoteFromReference(context.sqlite, data.reference, data.customerId) : { orderId: null, quoteId: null };
  const effectiveSalesOrderId = data.salesOrderId || autoRefs.orderId || null;
  const effectiveQuoteId = data.quoteId || autoRefs.quoteId || null;

  const profileRow = context.sqlite.prepare("SELECT * FROM business_profile WHERE id = 'default'").get() as any;
  const profile = getBusinessProfile(businessId, userId);
  const taxSettings = context.db.select().from(businessTaxSettings).where(eq(businessTaxSettings.id, "default")).get();
  const sellerLegalName = profileRow?.legal_name || profileRow?.trading_name || profile.legalName || profile.tradingName || "";
  const sellerTrn = taxSettings?.trn || profileRow?.tax_id || profile.taxId || "";
  const sellerAddress = [
    profileRow?.address_line_1 ?? profile.addressLine1,
    profileRow?.address_line_2 ?? profile.addressLine2,
    profileRow?.city ?? profile.city,
    profileRow?.state_or_emirate ?? profile.stateOrEmirate,
    profileRow?.country ?? profile.country,
  ].filter(Boolean).join(", ");

  const customerLegalName = customer.legalName || customer.name || "";
  const customerTrn = customer.trn || customer.taxReference || "";
  const customerAddress = customer.billingAddress || [customer.addressLine1, customer.city, customer.countrySubdivision, customer.countryCode].filter(Boolean).join(", ");

  context.sqlite.transaction(() => {
    if (effectiveIntent === "post") assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
    const invoiceNumber = allocateNumber(context.sqlite, "invoice");
    recordedInvoiceNumber = invoiceNumber;
    context.sqlite
      .prepare(`
        INSERT INTO sales_invoices (
          id, invoice_number, customer_id, invoice_date, tax_date, supply_emirate, due_date, reference,
          project_id, document_status, subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor, notes, terms,
          sales_order_id, quote_id, amounts_include_tax,
          seller_legal_name, seller_trn, seller_address,
          customer_legal_name, customer_trn, customer_address,
          created_by, created_at, updated_at, posted_at, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `)
      .run(
        id,
        invoiceNumber,
        data.customerId,
        data.invoiceDate,
        taxDate,
        data.supplyEmirate || null,
        data.dueDate,
        data.reference || null,
        data.projectId || null,
        totals.subtotalMinor,
        totals.taxMinor,
        totals.totalMinor,
        rate.currencyCode,
        rate.exchangeRateToBase,
        rate.exchangeRateDate,
        rate.exchangeRateSource,
        base.baseSubtotalMinor,
        base.baseTaxMinor,
        base.baseTotalMinor,
        data.notes || null,
        data.terms || null,
        effectiveSalesOrderId,
        effectiveQuoteId,
        data.amountsIncludeTax ? 1 : 0,
        sellerLegalName || null,
        sellerTrn || null,
        sellerAddress || null,
        customerLegalName || null,
        customerTrn || null,
        customerAddress || null,
        userId,
        now,
        now,
      );
    insertLines(context.db, id, lines);
    saveLineCustomFieldValuesInTransaction(
      context.sqlite,
      "sales_invoice_line",
      lines.map((l) => ({ lineId: l.id, customFields: l.customFields })),
    );

    if (effectiveSalesOrderId) {
      const parentOrder = context.sqlite.prepare(
        "SELECT document_status FROM sales_orders WHERE id = ?"
      ).get(effectiveSalesOrderId) as { document_status: string } | undefined;
      if (parentOrder && (parentOrder.document_status === "completed" || parentOrder.document_status === "cancelled")) {
        throw new Error("Cannot create an invoice for a completed or cancelled sales order.");
      }
      context.sqlite.prepare(
        "UPDATE sales_orders SET document_status = 'completed' WHERE id = ? AND document_status = 'active'"
      ).run(effectiveSalesOrderId);
    }
    if (effectiveQuoteId) {
      context.sqlite.prepare(
        "UPDATE sales_quotes SET document_status = 'accepted' WHERE id = ? AND document_status = 'sent'"
      ).run(effectiveQuoteId);
    }
    if (customFieldValues) {

      saveCustomFieldValuesInTransaction(context.sqlite, "sales_invoice", id, customFieldValues);
    }
    if (effectiveIntent === "submit_approval") {
      context.sqlite
        .prepare("UPDATE sales_invoices SET document_status = 'pending_approval' WHERE id = ?")
        .run(id);
      recordPendingApprovalInTransaction(context.sqlite, {
        businessId,
        userId,
        entityType: "sales_invoice",
        entityId: id,
        entityNumber: invoiceNumber,
        amountMinor: totals.totalMinor,
        baseAmountMinor: base.baseTotalMinor,
        currencyCode: rate.currencyCode,
        targetIntent: "post",
      });
    }
    if (effectiveIntent === "post") {
      assertDateNotLocked(context.sqlite, data.invoiceDate, "Sales invoice");
      postSalesInvoice(
        context.sqlite,
        {
          id,
          invoiceNumber,
          customerId: data.customerId,
          invoiceDate: data.invoiceDate,
          totalMinor: totals.totalMinor,
          rate,
        },
        lines.map((line) => ({ ...line, projectId: effectiveProjectId(line.projectId, data.projectId) })),
      );
      replaceTaxEntries(context.sqlite, {
        sourceType: "sales_invoice", sourceId: id, sourceNumber: invoiceNumber,
        partyName: customer.name, taxDate, direction: "sales",
        supplyEmirate: data.supplyEmirate || null,
        rate,
      }, lines.map((line) => ({ ...line, projectId: effectiveProjectId(line.projectId, data.projectId) })));
      context.sqlite
        .prepare("UPDATE sales_invoices SET document_status = 'posted', posted_at = ? WHERE id = ?")
        .run(now, id);

      if (data.applyAvailableCredit) {
        const availableCredits = getCustomerUnallocatedCredit(businessId, userId, data.customerId)
          .filter((c) => c.currencyCode === rate.currencyCode && c.unallocatedAmountMinor > 0);

        if (availableCredits.length > 0) {
          let remainingInvoiceMinor = totals.totalMinor;

          if (data.applyCreditReceiptId) {
            const target = availableCredits.find((c) => c.receiptId === data.applyCreditReceiptId);
            if (target) {
              const maxApplicable = Math.min(remainingInvoiceMinor, target.unallocatedAmountMinor);
              const customAmountMinor = data.applyCreditAmount
                ? parseCurrencyAmountToMinor(data.applyCreditAmount, rate.currencyMinorUnit)
                : maxApplicable;
              const allocMinor = Math.min(customAmountMinor, maxApplicable);
              if (allocMinor > 0) {
                applySettlementCredit(context.sqlite, receiptConfig, {
                  paymentId: target.receiptId,
                  documentId: id,
                  amount: allocMinor,
                });
              }
            }
          } else {
            // Auto-allocate FIFO across candidate credits
            for (const credit of availableCredits) {
              if (remainingInvoiceMinor <= 0) break;
              const allocMinor = Math.min(remainingInvoiceMinor, credit.unallocatedAmountMinor);
              if (allocMinor > 0) {
                applySettlementCredit(context.sqlite, receiptConfig, {
                  paymentId: credit.receiptId,
                  documentId: id,
                  amount: allocMinor,
                });
                remainingInvoiceMinor -= allocMinor;
              }
            }
          }
        }
      }
    }
  }).immediate();

  const formattedTotal = (totals.totalMinor / (10 ** rate.currencyMinorUnit)).toFixed(2);
  recordActivity(businessId, {
    userId,
    action: effectiveIntent === "post" ? "posted" : "created",
    entityType: "sales_invoice",
    entityId: id,
    entityNumber: recordedInvoiceNumber,
    summary: `${effectiveIntent === "post" ? "Posted" : effectiveIntent === "submit_approval" ? "Submitted for approval" : "Created draft"} sales invoice ${recordedInvoiceNumber} for ${rate.currencyCode} ${formattedTotal}`,
    details: { customerId: data.customerId, totalMinor: totals.totalMinor, currency: rate.currencyCode, status: effectiveIntent === "post" ? "posted" : effectiveIntent === "submit_approval" ? "pending_approval" : "draft" },
  });

  return id;
}

export function updateInvoice(
  businessId: string,
  userId: string,
  invoiceId: string,
  input: InvoiceInput,
  intent: InvoiceSaveIntent,
  customFieldValues?: Record<string, string>,
  options?: { bypassApprovalPolicy?: boolean },
) {
  if (options?.bypassApprovalPolicy) {
    assertMutationPermission(businessId, userId, "sales", "post");
  } else {
    assertSavePermission(businessId, userId, "sales", invoiceId, "draft");
  }
  const data = invoiceInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId)).get();
  if (!current) throw new Error("Invoice not found.");
  if (current.documentStatus === "void") throw new Error("A void invoice cannot be edited.");
  if (current.documentStatus === "pending_approval" && !options?.bypassApprovalPolicy) {
    throw new Error("This invoice is pending approval. Withdraw or reject it to draft before editing.");
  }
  if (current.documentStatus === "posted") {
    assertDateNotLocked(context.sqlite, current.invoiceDate, "Sales invoice");
  }
  if (context.sqlite.prepare("SELECT 1 FROM delivery_notes WHERE sales_invoice_id = ? LIMIT 1").get(invoiceId)) throw new Error("A Sales Invoice cannot be edited after a Delivery Note has been created from it.");
  const customer = context.db.select().from(customers).where(eq(customers.id, data.customerId)).get();
  if (!customer) throw new Error("Customer not found.");
  const taxDate = data.taxDate || data.invoiceDate;
  const rate = resolveRateSnapshot(context.sqlite, {
    currencyCode: data.currencyCode,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: taxDate,
    taxCodeIds: data.lines.map((line) => line.taxCodeId),
    enforceVatPolicy: true,
  });
  if (current.documentStatus === "posted" && (
    current.currencyCode !== rate.currencyCode
    || current.exchangeRateToBase !== rate.exchangeRateToBase
    || current.exchangeRateDate !== rate.exchangeRateDate
    || current.exchangeRateSource !== rate.exchangeRateSource
  )) throw new Error("Posted document currency and exchange rate are immutable.");
  validateProjectReferences(context.sqlite, { headerProjectId: data.projectId, lineProjectIds: data.lines.map((line) => line.projectId), customerId: data.customerId, customerFacing: true });
  const allocatedMinor = allocatedForInvoice(context.sqlite, invoiceId);
  if (allocatedMinor > 0 && current.customerId !== data.customerId) {
    throw new Error("Cannot change the customer after receipts have been allocated.");
  }
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, { accountTypeFilter: "income", taxDirection: "sales", supportItems: true, accountFieldOnLine: "salesAccountId", amountsIncludeTax: data.amountsIncludeTax });
  const totals = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  if (totals.totalMinor < allocatedMinor) {
    throw new Error("Cannot reduce invoice total below amount already received.");
  }
  const now = new Date().toISOString();
  const approvalEval =
    current.documentStatus === "posted" || intent === "draft" || options?.bypassApprovalPolicy
      ? { requiresApproval: false }
      : evaluateApprovalRequirement(businessId, userId, "sales_invoice", base.baseTotalMinor, context.sqlite);
  const shouldPost =
    current.documentStatus === "posted" || (intent === "post" && !approvalEval.requiresApproval);
  const shouldSubmitApproval =
    !shouldPost &&
    (intent === "submit_approval" || (intent === "post" && approvalEval.requiresApproval));

  runImmediateTransaction(context.sqlite, () => {
    if (current.documentStatus === "posted") {
      assertDateNotLocked(context.sqlite, current.invoiceDate, "Sales invoice");
      assertVatSourceUnlocked(context.sqlite, "sales_invoice", invoiceId, current.taxDate);
    }
    if (shouldPost) assertMutationPermission(businessId, userId, "sales", "post");
    if (shouldPost) {
      assertDateNotLocked(context.sqlite, data.invoiceDate, "Sales invoice");
      assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
    }
    const autoRefs = (!data.salesOrderId || !data.quoteId) ? resolveOrderAndQuoteFromReference(context.sqlite, data.reference, data.customerId) : { orderId: null, quoteId: null };
    const effectiveSalesOrderId = data.salesOrderId || autoRefs.orderId || ("salesOrderId" in input ? null : current.salesOrderId) || null;
    const effectiveQuoteId = data.quoteId || autoRefs.quoteId || ("quoteId" in input ? null : current.quoteId) || null;

    const profileRow = context.sqlite.prepare("SELECT * FROM business_profile WHERE id = 'default'").get() as any;
    const profile = getBusinessProfile(businessId, userId);
    const taxSettings = context.db.select().from(businessTaxSettings).where(eq(businessTaxSettings.id, "default")).get();
    const sellerLegalName = profileRow?.legal_name || profileRow?.trading_name || profile.legalName || profile.tradingName || "";
    const sellerTrn = taxSettings?.trn || profileRow?.tax_id || profile.taxId || "";
    const sellerAddress = [
      profileRow?.address_line_1 ?? profile.addressLine1,
      profileRow?.address_line_2 ?? profile.addressLine2,
      profileRow?.city ?? profile.city,
      profileRow?.state_or_emirate ?? profile.stateOrEmirate,
      profileRow?.country ?? profile.country,
    ].filter(Boolean).join(", ");

    const customerLegalName = customer.legalName || customer.name || "";
    const customerTrn = customer.trn || customer.taxReference || "";
    const customerAddress = customer.billingAddress || [customer.addressLine1, customer.city, customer.countrySubdivision, customer.countryCode].filter(Boolean).join(", ");

    context.sqlite
      .prepare(`
        UPDATE sales_invoices
        SET customer_id = ?, project_id = ?, invoice_date = ?, tax_date = ?, supply_emirate = ?, due_date = ?, reference = ?,
            subtotal_minor = ?, tax_minor = ?, total_minor = ?,
            currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?,
            base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?,
            notes = ?, terms = ?, sales_order_id = ?, quote_id = ?, amounts_include_tax = ?,
            seller_legal_name = CASE WHEN document_status = 'posted' AND seller_legal_name IS NOT NULL THEN seller_legal_name ELSE ? END,
            seller_trn = CASE WHEN document_status = 'posted' AND seller_trn IS NOT NULL THEN seller_trn ELSE ? END,
            seller_address = CASE WHEN document_status = 'posted' AND seller_address IS NOT NULL THEN seller_address ELSE ? END,
            customer_legal_name = CASE WHEN document_status = 'posted' AND customer_legal_name IS NOT NULL THEN customer_legal_name ELSE ? END,
            customer_trn = CASE WHEN document_status = 'posted' AND customer_trn IS NOT NULL THEN customer_trn ELSE ? END,
            customer_address = CASE WHEN document_status = 'posted' AND customer_address IS NOT NULL THEN customer_address ELSE ? END,
            updated_at = ?
        WHERE id = ?
      `)
      .run(
        data.customerId,
        data.projectId || null,
        data.invoiceDate,
        taxDate,
        data.supplyEmirate || null,
        data.dueDate,
        data.reference || null,
        totals.subtotalMinor,
        totals.taxMinor,
        totals.totalMinor,
        rate.currencyCode,
        rate.exchangeRateToBase,
        rate.exchangeRateDate,
        rate.exchangeRateSource,
        base.baseSubtotalMinor,
        base.baseTaxMinor,
        base.baseTotalMinor,
        data.notes || null,
        data.terms || null,
        effectiveSalesOrderId,
        effectiveQuoteId,
        data.amountsIncludeTax ? 1 : 0,
        sellerLegalName || null,
        sellerTrn || null,
        sellerAddress || null,
        customerLegalName || null,
        customerTrn || null,
        customerAddress || null,
        now,
        invoiceId,
      );
    const oldLineIds = (
      context.sqlite.prepare("SELECT id FROM sales_invoice_lines WHERE invoice_id = ?").all(invoiceId) as { id: string }[]
    ).map((r) => r.id);
    context.sqlite.prepare("DELETE FROM sales_invoice_lines WHERE invoice_id = ?").run(invoiceId);
    insertLines(context.db, invoiceId, lines);
    saveLineCustomFieldValuesInTransaction(
      context.sqlite,
      "sales_invoice_line",
      lines.map((l) => ({ lineId: l.id, customFields: l.customFields })),
      oldLineIds,
    );

    if (effectiveSalesOrderId) {
      context.sqlite.prepare(
        "UPDATE sales_orders SET document_status = 'completed' WHERE id = ? AND document_status = 'active'"
      ).run(effectiveSalesOrderId);
    }
    if (effectiveQuoteId) {
      context.sqlite.prepare(
        "UPDATE sales_quotes SET document_status = 'accepted' WHERE id = ? AND document_status = 'sent'"
      ).run(effectiveQuoteId);
    }
    if (customFieldValues) {

      saveCustomFieldValuesInTransaction(context.sqlite, "sales_invoice", invoiceId, customFieldValues);
    }
    if (shouldSubmitApproval) {
      context.sqlite
        .prepare("UPDATE sales_invoices SET document_status = 'pending_approval' WHERE id = ?")
        .run(invoiceId);
      recordPendingApprovalInTransaction(context.sqlite, {
        businessId,
        userId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        entityNumber: current.invoiceNumber,
        amountMinor: totals.totalMinor,
        baseAmountMinor: base.baseTotalMinor,
        currencyCode: rate.currencyCode,
        targetIntent: "post",
      });
    }
    if (shouldPost) {
      postSalesInvoice(
        context.sqlite,
        {
          id: invoiceId,
          invoiceNumber: current.invoiceNumber,
          customerId: data.customerId,
          invoiceDate: data.invoiceDate,
          totalMinor: totals.totalMinor,
          rate,
        },
        lines.map((line) => ({ ...line, projectId: effectiveProjectId(line.projectId, data.projectId) })),
        current.documentStatus === "posted",
      );
      replaceTaxEntries(context.sqlite, {
        sourceType: "sales_invoice", sourceId: invoiceId, sourceNumber: current.invoiceNumber,
        partyName: customer.name, taxDate, direction: "sales",
        supplyEmirate: data.supplyEmirate || null,
        rate,
      }, lines.map((line) => ({ ...line, projectId: effectiveProjectId(line.projectId, data.projectId) })));
      context.sqlite
        .prepare(`
          UPDATE sales_invoices
          SET document_status = 'posted', posted_at = COALESCE(posted_at, ?)
          WHERE id = ?
        `)
        .run(now, invoiceId);
    }
  });

  const formattedTotal = (totals.totalMinor / (10 ** rate.currencyMinorUnit)).toFixed(2);
  const action = shouldPost && current.documentStatus !== "posted" ? "posted" : "updated";
  const finalStatus = shouldPost ? "posted" : shouldSubmitApproval ? "pending_approval" : current.documentStatus;
  recordActivity(businessId, {
    userId,
    action,
    entityType: "sales_invoice",
    entityId: invoiceId,
    entityNumber: current.invoiceNumber,
    summary: `${action === "posted" ? "Posted" : shouldSubmitApproval ? "Submitted for approval" : "Updated"} sales invoice ${current.invoiceNumber} for ${rate.currencyCode} ${formattedTotal}`,
    details: { customerId: data.customerId, totalMinor: totals.totalMinor, currency: rate.currencyCode, status: finalStatus },
  });
}

export function deleteInvoice(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "sales", "delete");
  const context = getBusinessDb(businessId, userId);
  const invoice = context.db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId)).get();
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.documentStatus !== "draft") throw new Error("Only draft invoices can be deleted.");

  context.sqlite.transaction(() => {
    context.db.delete(salesInvoices).where(eq(salesInvoices.id, invoiceId)).run();

    if (invoice.salesOrderId) {
      const remainingCount = context.sqlite.prepare(
        "SELECT COUNT(*) as c FROM sales_invoices WHERE sales_order_id = ? AND id != ? AND document_status != 'void'"
      ).get(invoice.salesOrderId, invoiceId) as { c: number };
      if (remainingCount.c === 0) {
        context.sqlite.prepare(
          "UPDATE sales_orders SET document_status = 'active' WHERE id = ? AND document_status = 'completed'"
        ).run(invoice.salesOrderId);
      }
    }
    if (invoice.quoteId) {
      const remainingCount = context.sqlite.prepare(
        "SELECT COUNT(*) as c FROM sales_invoices WHERE quote_id = ? AND id != ? AND document_status != 'void'"
      ).get(invoice.quoteId, invoiceId) as { c: number };
      const remainingOrders = context.sqlite.prepare(
        "SELECT COUNT(*) as c FROM sales_orders WHERE sales_quote_id = ? AND document_status NOT IN ('cancelled', 'superseded')"
      ).get(invoice.quoteId) as { c: number };
      if (remainingCount.c === 0 && remainingOrders.c === 0) {
        context.sqlite.prepare(
          "UPDATE sales_quotes SET document_status = 'sent' WHERE id = ? AND document_status = 'accepted'"
        ).run(invoice.quoteId);
      }
    }
  })();

  recordActivity(businessId, {
    userId,
    action: "deleted",
    entityType: "sales_invoice",
    entityId: invoiceId,
    entityNumber: invoice.invoiceNumber,
    summary: `Deleted draft sales invoice ${invoice.invoiceNumber}`,
  });
}

export function duplicateInvoice(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "sales", "create");
  const record = getInvoice(businessId, userId, invoiceId);
  if (!record) throw new Error("Invoice not found.");
  const context = getBusinessDb(businessId, userId);
  const minorUnit = getCurrency(context.sqlite, record.invoice.currencyCode).minor_unit;

  const today = new Date().toISOString().split("T")[0];
  const rawTerms = (record.customer as any)?.paymentTermsDays;
  const dueDays = (rawTerms !== null && rawTerms !== undefined) ? Number(rawTerms) : 30;
  const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().split("T")[0];

  return createInvoice(
    businessId,
    userId,
    {
      customerId: record.invoice.customerId,
      currencyCode: record.invoice.currencyCode,
      exchangeRateToBase: record.invoice.exchangeRateToBase,
      exchangeRateDate: today,
      exchangeRateSource: record.invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
      projectId: record.invoice.projectId ?? "",
      invoiceDate: today,
      taxDate: today,
      supplyEmirate: record.invoice.supplyEmirate ?? "",
      dueDate,
      reference: record.invoice.reference ?? "",
      notes: record.invoice.notes ?? "",
      terms: record.invoice.terms ?? "",
      amountsIncludeTax: Boolean(record.invoice.amountsIncludeTax),
      lines: record.lines.map((line) => ({
        itemId: line.itemId ?? "",
        description: line.description,
        quantity: quantityMicrosToInput(line.quantityMicros),
        unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit),
        discountType: ((line as any).discountType as any) || "none",
        discountValue: String((line as any).discountValue ?? "0"),
        salesAccountId: line.salesAccountId,
        taxCodeId: line.taxCodeId,
        projectId: line.projectId ?? "",
      })),
    },
    "draft",
  );
}

export function voidInvoice(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "sales", "delete");
  const context = getBusinessDb(businessId, userId);
  const invoice = context.db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId)).get();
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.documentStatus !== "posted") throw new Error("Only posted invoices can be voided.");
  if (allocatedForInvoice(context.sqlite, invoiceId) > 0) {
    throw new Error("Cannot void an invoice that has receipt allocations.");
  }
  if (context.sqlite.prepare("SELECT 1 FROM delivery_notes WHERE sales_invoice_id = ? AND document_status != 'void' LIMIT 1").get(invoiceId)) {
    throw new Error("Cannot void an invoice that has active delivery notes. Void the delivery notes first.");
  }
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    assertDateNotLocked(context.sqlite, invoice.invoiceDate, "Sales invoice void");
    assertDateNotLocked(context.sqlite, now.slice(0, 10), "Sales invoice void");
    assertVatSourceUnlocked(context.sqlite, "sales_invoice", invoiceId, invoice.taxDate);
    reverseTransaction(context.sqlite, {
      originalSourceType: "sales_invoice",
      originalSourceId: invoiceId,
      reversalSourceType: "sales_invoice_void",
      reversalSourceId: invoiceId,
      date: now.slice(0, 10),
      description: `Void Sales Invoice ${invoice.invoiceNumber}`,
    });
    reverseTaxEntries(context.sqlite, {
      originalSourceType: "sales_invoice", sourceId: invoiceId,
      reversalSourceType: "sales_invoice_void", taxDate: invoice.taxDate,
    });
    context.sqlite
      .prepare("UPDATE sales_invoices SET document_status = 'void', voided_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, invoiceId);

    if (invoice.salesOrderId) {
      const remainingCount = context.sqlite.prepare(
        "SELECT COUNT(*) as c FROM sales_invoices WHERE sales_order_id = ? AND id != ? AND document_status != 'void'"
      ).get(invoice.salesOrderId, invoiceId) as { c: number };
      if (remainingCount.c === 0) {
        context.sqlite.prepare(
          "UPDATE sales_orders SET document_status = 'active' WHERE id = ? AND document_status = 'completed'"
        ).run(invoice.salesOrderId);
      }
    }
    if (invoice.quoteId) {
      const remainingCount = context.sqlite.prepare(
        "SELECT COUNT(*) as c FROM sales_invoices WHERE quote_id = ? AND id != ? AND document_status != 'void'"
      ).get(invoice.quoteId, invoiceId) as { c: number };
      const remainingOrders = context.sqlite.prepare(
        "SELECT COUNT(*) as c FROM sales_orders WHERE sales_quote_id = ? AND document_status NOT IN ('cancelled', 'superseded')"
      ).get(invoice.quoteId) as { c: number };
      if (remainingCount.c === 0 && remainingOrders.c === 0) {
        context.sqlite.prepare(
          "UPDATE sales_quotes SET document_status = 'sent' WHERE id = ? AND document_status = 'accepted'"
        ).run(invoice.quoteId);
      }
    }
  }).immediate();

  recordActivity(businessId, {
    userId,
    action: "voided",
    entityType: "sales_invoice",
    entityId: invoiceId,
    entityNumber: invoice.invoiceNumber,
    summary: `Voided sales invoice ${invoice.invoiceNumber}`,
    details: { customerId: invoice.customerId },
  });
}

function buildInvoiceInputFromRecord(
  context: ReturnType<typeof getBusinessDb>,
  record: NonNullable<ReturnType<typeof getInvoice>>,
): InvoiceInput {
  const minorUnit = getCurrency(context.sqlite, record.invoice.currencyCode).minor_unit;
  return {
    customerId: record.invoice.customerId,
    currencyCode: record.invoice.currencyCode,
    exchangeRateToBase: record.invoice.exchangeRateToBase,
    exchangeRateDate: record.invoice.exchangeRateDate,
    exchangeRateSource: record.invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
    projectId: record.invoice.projectId ?? "",
    invoiceDate: record.invoice.invoiceDate,
    taxDate: record.invoice.taxDate,
    supplyEmirate: record.invoice.supplyEmirate ?? "",
    dueDate: record.invoice.dueDate,
    reference: record.invoice.reference ?? "",
    notes: record.invoice.notes ?? "",
    terms: record.invoice.terms ?? "",
    salesOrderId: record.invoice.salesOrderId ?? "",
    quoteId: record.invoice.quoteId ?? "",
    amountsIncludeTax: Boolean(record.invoice.amountsIncludeTax),
    lines: record.lines.map((line) => ({
      itemId: line.itemId ?? "",
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit),
      discountType: (line.discountType ?? "none") as any,
      discountValue: line.discountValue ?? "0",
      salesAccountId: line.salesAccountId,
      taxCodeId: line.taxCodeId,
      projectId: line.projectId ?? "",
      customFields: line.customFields ?? {},
    })),
  };
}

export function postInvoice(
  businessId: string,
  userId: string,
  invoiceId: string,
  intent: "post" | "submit_approval" = "post",
): DocumentStatus {
  assertMutationPermission(businessId, userId, "sales", "edit");
  const record = getInvoice(businessId, userId, invoiceId);
  if (!record) throw new Error("Invoice not found.");
  if (record.invoice.documentStatus === "posted") return "posted";
  if (record.invoice.documentStatus === "void") throw new Error("A void invoice cannot be posted.");
  if (record.invoice.documentStatus === "pending_approval") {
    throw new Error("This invoice is pending approval and must be finalized through the approval queue.");
  }

  const context = getBusinessDb(businessId, userId);
  const evalResult =
    intent === "submit_approval"
      ? { requiresApproval: true }
      : evaluateApprovalRequirement(
          businessId,
          userId,
          "sales_invoice",
          record.invoice.baseTotalMinor,
          context.sqlite,
        );
  if (!evalResult.requiresApproval) {
    assertMutationPermission(businessId, userId, "sales", "post");
  }
  updateInvoice(
    businessId,
    userId,
    invoiceId,
    buildInvoiceInputFromRecord(context, record),
    evalResult.requiresApproval ? "submit_approval" : "post",
  );
  return evalResult.requiresApproval ? "pending_approval" : "posted";
}

export function postPendingSalesInvoice(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "sales", "post");
  const record = getInvoice(businessId, userId, invoiceId);
  if (!record) throw new Error("Invoice not found.");
  if (record.invoice.documentStatus === "posted") return;
  if (record.invoice.documentStatus === "void") throw new Error("A void invoice cannot be posted.");
  const context = getBusinessDb(businessId, userId);
  updateInvoice(
    businessId,
    userId,
    invoiceId,
    buildInvoiceInputFromRecord(context, record),
    "post",
    undefined,
    { bypassApprovalPolicy: true },
  );
}

export function revertSalesInvoiceToDraft(businessId: string, userId: string, invoiceId: string) {
  assertMutationPermission(businessId, userId, "sales", "post");
  const context = getBusinessDb(businessId, userId);
  const row = context.sqlite
    .prepare("SELECT id, document_status FROM sales_invoices WHERE id = ?")
    .get(invoiceId) as { id: string; document_status: string } | undefined;
  if (!row) throw new Error("Invoice not found.");
  if (row.document_status !== "pending_approval") {
    throw new Error(`Cannot return invoice in "${row.document_status}" status to draft.`);
  }
  context.sqlite
    .prepare("UPDATE sales_invoices SET document_status = 'draft', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), invoiceId);
}

export type BatchActionResult = {
  successCount: number;
  postedCount?: number;
  pendingApprovalCount?: number;
  failedCount: number;
  errors: { id: string; number?: string; error: string }[];
};

export function batchPostInvoices(
  businessId: string,
  userId: string,
  invoiceIds: string[],
  intent: "post" | "submit_approval" = "post",
): BatchActionResult {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  assertMutationPermission(businessId, userId, "sales", "edit");
  if (intent !== "submit_approval" && !access.requiresApproval) {
    assertMutationPermission(businessId, userId, "sales", "post");
  }
  const result: BatchActionResult = {
    successCount: 0,
    postedCount: 0,
    pendingApprovalCount: 0,
    failedCount: 0,
    errors: [],
  };
  for (const id of invoiceIds) {
    let invoiceNumber: string | undefined;
    try {
      const record = getInvoice(businessId, userId, id);
      if (!record) {
        result.failedCount++;
        result.errors.push({ id, error: "Invoice not found" });
        continue;
      }
      invoiceNumber = record.invoice.invoiceNumber;
      if (record.invoice.documentStatus === "posted") {
        result.successCount++;
        result.postedCount = (result.postedCount ?? 0) + 1;
        continue;
      }
      if (record.invoice.documentStatus === "void") {
        result.failedCount++;
        result.errors.push({ id, number: invoiceNumber, error: "Cannot post a void invoice" });
        continue;
      }
      const nextStatus = postInvoice(businessId, userId, id, intent);
      result.successCount++;
      if (nextStatus === "pending_approval") {
        result.pendingApprovalCount = (result.pendingApprovalCount ?? 0) + 1;
      } else {
        result.postedCount = (result.postedCount ?? 0) + 1;
      }
    } catch (err) {
      result.failedCount++;
      result.errors.push({ id, number: invoiceNumber, error: err instanceof Error ? err.message : "Posting failed" });
    }
  }
  return result;
}

export function batchVoidInvoices(businessId: string, userId: string, invoiceIds: string[]): BatchActionResult {
  assertMutationPermission(businessId, userId, "sales", "delete");
  const result: BatchActionResult = { successCount: 0, failedCount: 0, errors: [] };
  for (const id of invoiceIds) {
    try {
      const record = getInvoice(businessId, userId, id);
      if (!record) {
        result.failedCount++;
        result.errors.push({ id, error: "Invoice not found" });
        continue;
      }
      if (record.invoice.documentStatus === "void") {
        result.successCount++;
        continue;
      }
      if (record.invoice.documentStatus === "draft") {
        deleteInvoice(businessId, userId, id);
        result.successCount++;
        continue;
      }
      voidInvoice(businessId, userId, id);
      result.successCount++;
    } catch (err) {
      result.failedCount++;
      result.errors.push({ id, number: (getInvoice(businessId, userId, id)?.invoice.invoiceNumber) || id, error: err instanceof Error ? err.message : "Void failed" });
    }
  }
  return result;
}

export function batchDeleteInvoices(businessId: string, userId: string, invoiceIds: string[]): BatchActionResult {
  assertMutationPermission(businessId, userId, "sales", "delete");
  const result: BatchActionResult = { successCount: 0, failedCount: 0, errors: [] };
  for (const id of invoiceIds) {
    try {
      deleteInvoice(businessId, userId, id);
      result.successCount++;
    } catch (err) {
      result.failedCount++;
      result.errors.push({ id, error: err instanceof Error ? err.message : "Delete failed" });
    }
  }
  return result;
}
