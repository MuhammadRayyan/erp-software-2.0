import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { purchaseInvoiceLines, purchaseInvoices, suppliers } from "@/core/db/business-schema";
import { addMinor, calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros, quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { postPurchaseInvoice } from "@/modules/accounting/services/purchase-invoice-posting-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { replaceTaxEntries, reverseTaxEntries } from "@/modules/tax/tax-entry-service";
import { assertVatDateUnlocked, assertVatSourceUnlocked } from "@/modules/tax/tax-lock-service";
import { purchaseInvoiceInputSchema, type PurchaseInvoiceInput } from "./purchase-invoice-input";
import { convertDocumentLinesToBase, minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";

export type PurchaseInvoiceStatus = "draft" | "posted" | "void";
export type PurchasePaymentStatus = "unpaid" | "partially_paid" | "paid" | "overdue";
export type PurchaseInvoiceIntent = "draft" | "post";
export type PurchaseInvoiceSourceOptions = { inboundDocumentId?: string };

function deriveStatus(documentStatus: PurchaseInvoiceStatus, totalMinor: number, paidMinor: number, dueDate: string): PurchasePaymentStatus | null {
  if (documentStatus !== "posted") return null;
  const balance = Math.max(0, totalMinor - paidMinor);
  if (balance === 0) return "paid";
  if (dueDate < new Date().toISOString().slice(0, 10)) return "overdue";
  return paidMinor > 0 ? "partially_paid" : "unpaid";
}

export function paidForPurchaseInvoice(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string) {
  const row = sqlite.prepare(`
    SELECT COALESCE(SUM(spa.amount_minor), 0) AS paid_minor
    FROM supplier_payment_allocations spa
    INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
    WHERE spa.purchase_invoice_id = ?
  `).get(invoiceId) as { paid_minor: number };
  return row.paid_minor;
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

function assertInboundSource(
  sqlite: ReturnType<typeof getBusinessDb>["sqlite"],
  inboundDocumentId: string,
  invoiceId: string,
  data: ReturnType<typeof purchaseInvoiceInputSchema.parse>,
  lines: StoredLine[],
  amounts: ReturnType<typeof totalsForLines>,
  requireExactMonetaryFacts: boolean,
  creating: boolean,
) {
  const source = sqlite.prepare(`
    SELECT * FROM inbound_einvoice_documents WHERE id = ?
  `).get(inboundDocumentId) as {
    id: string;
    document_type: string;
    document_number: string;
    issue_date: string;
    tax_date: string | null;
    due_date: string | null;
    currency_code: string;
    status: string;
    buyer_identity_verified: number;
    supplier_id: string | null;
    purchase_order_id: string | null;
    purchase_invoice_id: string | null;
    duplicate_kind: string | null;
    subtotal_minor: number;
    tax_minor: number;
    total_minor: number;
    amount_due_minor: number;
    allowance_total_minor: number;
    charge_total_minor: number;
    validation_result_json: string | null;
  } | undefined;
  if (!source) throw new Error("The inbound electronic source was not found.");
  if (source.document_type !== "invoice") throw new Error("Inbound Credit Notes cannot be converted into Purchase Invoices.");
  if (creating && source.status !== "ReadyForDraft") throw new Error("The inbound eInvoice is not ready to create a draft.");
  if (!creating && !["DraftCreated", "Processed"].includes(source.status)) {
    throw new Error("The inbound eInvoice is no longer linked to an editable Purchase Invoice workflow.");
  }
  if (source.purchase_invoice_id && source.purchase_invoice_id !== invoiceId) {
    throw new Error("The inbound eInvoice is already linked to another Purchase Invoice.");
  }
  if (!source.buyer_identity_verified) throw new Error("The inbound buyer identity has not been verified.");
  if (source.duplicate_kind) throw new Error("Resolve the possible inbound duplicate before continuing.");
  const baseCurrency = getBaseCurrency(sqlite);
  if (source.currency_code !== baseCurrency.code || data.currencyCode !== source.currency_code) {
    throw new Error("Unsupported Currency Scenario: this inbound foreign-currency eInvoice cannot be converted safely.");
  }
  if (!source.supplier_id || source.supplier_id !== data.supplierId) {
    throw new Error("The Purchase Invoice Supplier must match the confirmed electronic source Supplier.");
  }
  if (source.document_number !== data.supplierInvoiceNumber) {
    throw new Error("The supplier invoice number must match the immutable electronic source.");
  }
  if (source.issue_date !== data.invoiceDate || (source.tax_date ?? source.issue_date) !== (data.taxDate || data.invoiceDate)) {
    throw new Error("Invoice and VAT dates must match the electronic source.");
  }
  if (source.due_date !== data.dueDate) throw new Error("Due date must match the electronic source.");
  if ((source.purchase_order_id ?? "") !== (data.purchaseOrderId || "")) {
    throw new Error("Purchase Order provenance must match the reviewed electronic source.");
  }
  if (!requireExactMonetaryFacts) return;
  type InboundReport = {
    layers?: {
      parsing?: { valid: boolean };
      pintUbl?: { valid: boolean };
      pintAe?: { valid: boolean };
    };
  };
  let report: InboundReport | null = null;
  try {
    report = source.validation_result_json ? JSON.parse(source.validation_result_json) as InboundReport : null;
  } catch {
    report = null;
  }
  if (!report?.layers?.parsing?.valid || !report.layers.pintUbl?.valid || !report.layers.pintAe?.valid) {
    throw new Error("The inbound PINT-AE validation evidence is not acceptable for posting.");
  }
  if (source.allowance_total_minor !== 0 || source.charge_total_minor !== 0) {
    throw new Error("Inbound allowances or charges are not supported by the Purchase Invoice model.");
  }
  if (source.amount_due_minor !== source.total_minor) {
    throw new Error("Inbound amount due must equal the invoice total before posting.");
  }
  if (
    amounts.subtotalMinor !== source.subtotal_minor
    || amounts.taxMinor !== source.tax_minor
    || amounts.totalMinor !== source.total_minor
  ) {
    throw new Error("Purchase Invoice monetary and VAT totals must equal the inbound electronic invoice.");
  }
  const sourceLines = sqlite.prepare(`
    SELECT position, quantity_micros, unit_price_minor, net_amount_minor, tax_amount_minor,
      gross_amount_minor, tax_category, tax_rate_basis_points
    FROM inbound_einvoice_lines WHERE inbound_document_id = ? ORDER BY position
  `).all(inboundDocumentId) as Array<{
    position: number;
    quantity_micros: number;
    unit_price_minor: number;
    net_amount_minor: number;
    tax_amount_minor: number;
    gross_amount_minor: number;
    tax_category: string;
    tax_rate_basis_points: number;
  }>;
  if (sourceLines.length !== lines.length) throw new Error("Purchase Invoice lines must correspond one-to-one with the electronic source.");
  const taxCodes = sqlite.prepare("SELECT id, vat_category, rate_basis_points FROM tax_codes")
    .all() as Array<{ id: string; vat_category: string | null; rate_basis_points: number }>;
  const taxById = new Map(taxCodes.map((tax) => [tax.id, tax]));
  for (const [position, line] of lines.entries()) {
    const original = sourceLines[position];
    const tax = taxById.get(line.taxCodeId);
    const expectedCategory = original?.tax_category === "S"
      ? "standard"
      : original?.tax_category === "Z"
        ? "zero_rated"
        : null;
    if (
      !original
      || line.quantityMicros !== original.quantity_micros
      || line.unitPriceMinor !== original.unit_price_minor
      || line.netAmountMinor !== original.net_amount_minor
      || line.taxAmountMinor !== original.tax_amount_minor
      || line.grossAmountMinor !== original.gross_amount_minor
      || !tax
      || tax.vat_category !== expectedCategory
      || tax.rate_basis_points !== original.tax_rate_basis_points
    ) {
      throw new Error(`Purchase Invoice line ${position + 1} monetary or VAT facts differ from the electronic source.`);
    }
  }
}

function appendInboundPurchaseEvent(
  sqlite: ReturnType<typeof getBusinessDb>["sqlite"],
  inboundDocumentId: string,
  eventType: string,
  status: string,
  userId: string,
  invoiceId: string,
) {
  const provider = sqlite.prepare("SELECT provider_key FROM inbound_einvoice_documents WHERE id = ?")
    .get(inboundDocumentId) as { provider_key: string };
  sqlite.prepare(`
    INSERT INTO inbound_einvoice_events (
      id, inbound_document_id, provider_key, event_type, status, raw_response,
      created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), inboundDocumentId, provider.provider_key, eventType, status,
    JSON.stringify({ mock: provider.provider_key === "mock", purchaseInvoiceId: invoiceId }),
    userId, new Date().toISOString(),
  );
}

function insertLines(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string, lines: StoredLine[]) {
  const statement = sqlite.prepare(`
    INSERT INTO purchase_invoice_lines (
      id, purchase_invoice_id, item_id, description, quantity_micros, unit_price_minor,
      expense_account_id, tax_code_id, project_id, net_amount_minor, tax_amount_minor,
      gross_amount_minor, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of lines) statement.run(line.id, invoiceId, line.itemId, line.description, line.quantityMicros, line.unitPriceMinor, line.expenseAccountId, line.taxCodeId, line.projectId, line.netAmountMinor, line.taxAmountMinor, line.grossAmountMinor, line.lineIndex);
}

const PAID_MINOR_FRAGMENT = `
  COALESCE((SELECT SUM(spa.amount_minor) FROM supplier_payment_allocations spa
    INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
    WHERE spa.purchase_invoice_id = pi.id), 0)
`;

export type PurchaseInvoiceListFilters = {
  /** Filter to one supplier (matches the legacy `supplierId` positional arg). */
  supplierId?: string;
  /** Inclusive lower bound on invoice_date (YYYY-MM-DD). Invalid values are ignored. */
  from?: string;
  /** Inclusive upper bound on invoice_date (YYYY-MM-DD). Invalid values are ignored. */
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

/**
 * Paginated purchase-invoice list result. The rows slice contains just the
 * rows for the requested page; `total` is the unfiltered-over-rows count for
 * the same `filters` so the UI can show "Page X of Y".
 */
export type PaginatedPurchaseInvoices = {
  rows: ReturnType<typeof listPurchaseInvoices>;
  total: number;
  /** 1-indexed page number actually returned (clamped to the last valid page). */
  page: number;
  /** Rows per page that were requested. */
  pageSize: number;
  /** Total number of pages computed from `total` / `pageSize`. */
  totalPages: number;
};

/**
 * Count purchase invoices matching `filters` using the same WHERE-clause
 * builder as `listPurchaseInvoiceRows`. Returns the row count used by
 * `listPurchaseInvoicesPaginated` to compute total pages.
 */
function countPurchaseInvoiceRows(businessId: string, userId: string, filters?: PurchaseInvoiceListFilters): number {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  if (filters?.supplierId) {
    conditions.push("pi.supplier_id = ?");
    values.push(filters.supplierId);
  }
  const dateFrom = validDate(filters?.from);
  const dateTo = validDate(filters?.to);
  if (dateFrom) {
    conditions.push("pi.invoice_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("pi.invoice_date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = sqlite.prepare(`SELECT COUNT(*) AS total FROM purchase_invoices pi ${where}`).get(...values) as { total: number };
  return row.total;
}

/**
 * Paginated list of purchase invoices for the list page. Server-side
 * LIMIT/OFFSET keeps the query cheap as the table grows. The returned
 * `total` is the count for the same `filters` excluding the page bounds.
 *
 * @param page 1-indexed page number (clamped to >= 1).
 * @param pageSize rows per page (defaults to 50, capped at 200).
 */
export function listPurchaseInvoicesPaginated(
  businessId: string,
  userId: string,
  filters: PurchaseInvoiceListFilters & { page?: number; pageSize?: number } = {},
): PaginatedPurchaseInvoices {
  const page = clampPositiveInt(filters.page, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampPositiveInt(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const total = countPurchaseInvoiceRows(businessId, userId, filters);
  // Clamp the page number to the last valid page so out-of-range URLs
  // (e.g. `?page=999`) still render the last page rather than 0 rows.
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, maxPage);
  const offset = (effectivePage - 1) * pageSize;
  const rows = listPurchaseInvoices(businessId, userId, undefined, { ...filters, take: pageSize, skip: offset });
  return { rows, total, page: effectivePage, pageSize, totalPages: maxPage };
}

/**
 * List purchase invoices. The legacy 3rd positional arg is `supplierId`
 * (used by the supplier detail page); a `filters` object is also accepted
 * for the paginated list path. Both are merged so existing call sites keep
 * working while new ones can pass `take`/`skip`/`from`/`to`.
 */
export function listPurchaseInvoices(
  businessId: string,
  userId: string,
  supplierId?: string,
  filters?: PurchaseInvoiceListFilters,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  const scopedSupplierId = supplierId ?? filters?.supplierId;
  if (scopedSupplierId) {
    conditions.push("pi.supplier_id = ?");
    values.push(scopedSupplierId);
  }
  const dateFrom = validDate(filters?.from);
  const dateTo = validDate(filters?.to);
  if (dateFrom) {
    conditions.push("pi.invoice_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("pi.invoice_date <= ?");
    values.push(dateTo);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  // Server-side LIMIT/OFFSET supports the paginated list path. When both
  // are undefined the query returns the full result set (used by the
  // goods-receipt picker, supplier detail page, etc.).
  const limitClause = filters?.take !== undefined && Number.isFinite(filters.take) && filters.take >= 0 ? `LIMIT ${Math.floor(filters.take)}` : "";
  const offsetClause = filters?.skip !== undefined && Number.isFinite(filters.skip) && filters.skip >= 0 ? `OFFSET ${Math.floor(filters.skip)}` : "";
  const pagination = `${limitClause} ${offsetClause}`.trim();
  const rows = sqlite.prepare(`
    SELECT pi.*, s.name AS supplier_name, cur.minor_unit AS currency_minor_unit,
      (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, pi.project_id)) FROM purchase_invoice_lines l WHERE l.purchase_invoice_id = pi.id) AS project_ids,
      (${PAID_MINOR_FRAGMENT}) AS paid_minor
    FROM purchase_invoices pi
    INNER JOIN suppliers s ON s.id = pi.supplier_id
    INNER JOIN currencies cur ON cur.code = pi.currency_code
    ${where}
    ORDER BY pi.invoice_date DESC, pi.created_at DESC
    ${pagination}
  `).all(...values) as {
    id: string; internal_number: string; supplier_id: string; supplier_name: string;
    supplier_invoice_number: string; invoice_date: string; due_date: string;
    reference: string | null; purchase_order_id: string | null; project_id: string | null;
    project_ids: string | null; document_status: PurchaseInvoiceStatus; subtotal_minor: number;
    tax_minor: number; total_minor: number; base_total_minor: number; currency_code: string; currency_minor_unit: number; created_at: string; updated_at: string; paid_minor: number;
  }[];
  const projects = sqlite.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project.name]));
  return rows.map((row) => {
    const projectIds = row.project_ids?.split(",").filter(Boolean) ?? [];
    return { ...row, projectIds, projectNames: projectIds.map((id) => projectById.get(id) ?? id), balanceMinor: row.document_status === "posted" ? Math.max(0, row.total_minor - row.paid_minor) : 0, paymentStatus: deriveStatus(row.document_status, row.total_minor, row.paid_minor, row.due_date) };
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
    ? context.sqlite.prepare(`SELECT id, code, name FROM accounts WHERE id IN (${lineAccountIds.map(() => '?').join(',')})`).all(...lineAccountIds) as { id: string; code: string; name: string }[]
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
  const order = header.invoice.purchaseOrderId ? context.sqlite.prepare("SELECT id, order_number FROM purchase_orders WHERE id = ?").get(header.invoice.purchaseOrderId) as { id: string; order_number: string } | undefined : undefined;
  const inboundSource = header.invoice.inboundEInvoiceDocumentId
    ? context.sqlite.prepare(`
        SELECT id, document_uuid, document_number, specification_version, received_at,
          status, validation_result_json, subtotal_minor, tax_minor, total_minor
        FROM inbound_einvoice_documents WHERE id = ?
      `).get(header.invoice.inboundEInvoiceDocumentId) as {
        id: string; document_uuid: string; document_number: string; specification_version: string;
        received_at: string; status: string; validation_result_json: string | null;
        subtotal_minor: number; tax_minor: number; total_minor: number;
      } | undefined
    : undefined;
  return {
    ...header,
    project: header.invoice.projectId ? projectById.get(header.invoice.projectId) ?? null : null,
    lines: lines.map((line) => {
      const projectId = effectiveProjectId(line.projectId, header.invoice.projectId);
      return { ...line, item: line.itemId ? itemById.get(line.itemId) ?? null : null, expenseAccount: accountById.get(line.expenseAccountId) ?? null, taxCode: taxById.get(line.taxCodeId) ?? null, project: projectId ? projectById.get(projectId) ?? null : null };
    }),
    paidMinor,
    balanceMinor: header.invoice.documentStatus === "posted" ? Math.max(0, header.invoice.totalMinor - paidMinor) : 0,
    paymentStatus: deriveStatus(header.invoice.documentStatus, header.invoice.totalMinor, paidMinor, header.invoice.dueDate),
    payments: payments.map((row) => ({ id: row.id, paymentNumber: row.payment_number, date: row.date, reference: row.reference, allocatedMinor: row.allocated_minor })),
    journal: journal ? { id: journal.id, entryNumber: journal.entry_number } : null,
    order: order ? { id: order.id, orderNumber: order.order_number } : null,
    inboundSource: inboundSource ? {
      id: inboundSource.id,
      documentUuid: inboundSource.document_uuid,
      documentNumber: inboundSource.document_number,
      specificationVersion: inboundSource.specification_version,
      receivedAt: inboundSource.received_at,
      status: inboundSource.status,
      validation: inboundSource.validation_result_json ? JSON.parse(inboundSource.validation_result_json) as unknown : null,
      totalsMatch: inboundSource.subtotal_minor === header.invoice.subtotalMinor
        && inboundSource.tax_minor === header.invoice.taxMinor
        && inboundSource.total_minor === header.invoice.totalMinor,
    } : null,
    goodsReceipts: context.sqlite.prepare("SELECT id, receipt_number, date, document_status FROM goods_receipts WHERE purchase_invoice_id = ? ORDER BY date DESC, created_at DESC").all(invoiceId) as { id: string; receipt_number: string; date: string; document_status: string }[],
  };
}

export function savePurchaseInvoice(
  businessId: string,
  userId: string,
  input: PurchaseInvoiceInput,
  intent: PurchaseInvoiceIntent,
  invoiceId?: string,
  sourceOptions: PurchaseInvoiceSourceOptions = {},
) {
  const data = purchaseInvoiceInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const supplier = context.db.select().from(suppliers).where(eq(suppliers.id, data.supplierId)).get();
  if (!supplier || !supplier.isActive) throw new Error("Choose an active supplier.");
  const currentHeader = invoiceId
    ? context.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).get()
    : undefined;
  const taxDate = data.taxDate || data.invoiceDate;
  const rate = resolveRateSnapshot(context.sqlite, {
    currencyCode: input.currencyCode ?? supplier.defaultCurrencyCode ?? data.currencyCode,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: taxDate,
    taxCodeIds: data.lines.map((line) => line.taxCodeId),
    enforceVatPolicy: true,
  });
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
  context.sqlite.transaction(() => {
    let internalNumber: string;
    let shouldPost = intent === "post";
    let replace = false;
    if (invoiceId) {
      const current = currentHeader;
      if (!current) throw new Error("Purchase invoice not found.");
      if (current.documentStatus === "void") throw new Error("A void purchase invoice cannot be edited.");
      if (current.documentStatus === "posted") assertVatSourceUnlocked(context.sqlite, "purchase_invoice", invoiceId, current.taxDate);
      if (context.sqlite.prepare("SELECT 1 FROM goods_receipts WHERE purchase_invoice_id = ? LIMIT 1").get(invoiceId)) throw new Error("A Purchase Invoice cannot be edited after a Goods Receipt has been created from it.");
      const paidMinor = paidForPurchaseInvoice(context.sqlite, invoiceId);
      if (paidMinor > 0 && current.supplierId !== data.supplierId) throw new Error("Cannot change the supplier after payments have been allocated.");
      if (amounts.totalMinor < paidMinor) throw new Error("Purchase invoice total cannot be lower than amount already paid.");
      internalNumber = current.internalNumber;
      shouldPost = current.documentStatus === "posted" || intent === "post";
      replace = current.documentStatus === "posted";
      if (sourceOptions.inboundDocumentId && sourceOptions.inboundDocumentId !== current.inboundEInvoiceDocumentId) {
        throw new Error("Electronic source provenance cannot be replaced.");
      }
      assertSupplierInvoiceNumberAvailable(context.sqlite, data.supplierId, data.supplierInvoiceNumber, invoiceId);
      if (current.inboundEInvoiceDocumentId) {
        assertInboundSource(
          context.sqlite,
          current.inboundEInvoiceDocumentId,
          id,
          data,
          lines,
          amounts,
          shouldPost,
          false,
        );
      }
      context.sqlite.prepare(`
        UPDATE purchase_invoices SET supplier_id = ?, project_id = ?, supplier_invoice_number = ?,
          invoice_date = ?, tax_date = ?, due_date = ?, reference = ?, purchase_order_id = ?, subtotal_minor = ?,
          tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?,
          exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?,
          base_tax_minor = ?, base_total_minor = ?, updated_at = ? WHERE id = ?
      `).run(data.supplierId, data.projectId || null, data.supplierInvoiceNumber, data.invoiceDate, taxDate, data.dueDate, data.reference || null, data.purchaseOrderId || null, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, now, invoiceId);
      context.sqlite.prepare("DELETE FROM purchase_invoice_lines WHERE purchase_invoice_id = ?").run(invoiceId);
    } else {
      internalNumber = allocateNumber(context.sqlite, "purchaseInvoice");
      assertSupplierInvoiceNumberAvailable(context.sqlite, data.supplierId, data.supplierInvoiceNumber);
      if (sourceOptions.inboundDocumentId) {
        if (intent === "post") {
          throw new Error("Create and review the inbound Purchase Invoice Draft before posting it.");
        }
        assertInboundSource(
          context.sqlite,
          sourceOptions.inboundDocumentId,
          id,
          data,
          lines,
          amounts,
          true,
          true,
        );
      }
      context.sqlite.prepare(`
        INSERT INTO purchase_invoices (
          id, internal_number, supplier_id, project_id, supplier_invoice_number, invoice_date, tax_date,
          due_date, reference, purchase_order_id, document_status, subtotal_minor, tax_minor,
          total_minor, created_by, created_at, updated_at, posted_at, voided_at,
          inbound_einvoice_document_id, currency_code, exchange_rate_to_base, exchange_rate_date,
          exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, internalNumber, data.supplierId, data.projectId || null, data.supplierInvoiceNumber, data.invoiceDate, taxDate, data.dueDate, data.reference || null, data.purchaseOrderId || null, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, userId, now, now, sourceOptions.inboundDocumentId ?? null, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor);
    }
    insertLines(context.sqlite, id, lines);
    const inboundDocumentId = invoiceId
      ? (context.sqlite.prepare("SELECT inbound_einvoice_document_id AS id FROM purchase_invoices WHERE id = ?").get(id) as { id: string | null }).id
      : sourceOptions.inboundDocumentId ?? null;
    if (inboundDocumentId && !invoiceId) {
      context.sqlite.prepare(`
        UPDATE inbound_einvoice_documents
        SET status = 'DraftCreated', purchase_invoice_id = ?, reviewed_by = ?, reviewed_at = ?,
          last_error = NULL WHERE id = ?
      `).run(id, userId, now, inboundDocumentId);
      appendInboundPurchaseEvent(context.sqlite, inboundDocumentId, "PurchaseInvoiceDraftCreated", "DraftCreated", userId, id);
    }
    if (shouldPost) {
      assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
      const postingLines = lines.map((line) => ({ ...line, projectId: effectiveProjectId(line.projectId, data.projectId) }));
      postPurchaseInvoice(context.sqlite, { id, internalNumber, supplierId: data.supplierId, invoiceDate: data.invoiceDate, totalMinor: amounts.totalMinor, rate }, postingLines, replace);
      replaceTaxEntries(context.sqlite, {
        sourceType: "purchase_invoice", sourceId: id, sourceNumber: internalNumber,
        partyName: supplier.name, taxDate, direction: "purchases", rate,
      }, postingLines);
      context.sqlite.prepare("UPDATE purchase_invoices SET document_status = 'posted', posted_at = COALESCE(posted_at, ?) WHERE id = ?").run(now, id);
      if (inboundDocumentId) {
        context.sqlite.prepare(`
          UPDATE inbound_einvoice_documents
          SET status = 'Processed', purchase_invoice_id = ?, reviewed_by = ?, reviewed_at = ?,
            last_error = NULL WHERE id = ?
        `).run(id, userId, now, inboundDocumentId);
        appendInboundPurchaseEvent(context.sqlite, inboundDocumentId, "PurchaseInvoicePosted", "Processed", userId, id);
      }
    }
  }).immediate();
  return id;
}

export function duplicatePurchaseInvoice(businessId: string, userId: string, invoiceId: string) {
  const record = getPurchaseInvoice(businessId, userId, invoiceId);
  if (!record) throw new Error("Purchase invoice not found.");
  // Reuse the already-fetched DB context rather than calling getBusinessDb a second time.
  const context = getBusinessDb(businessId, userId);
  const minorUnit = getCurrency(context.sqlite, record.invoice.currencyCode).minor_unit;
  return savePurchaseInvoice(businessId, userId, {
    supplierId: record.invoice.supplierId, projectId: record.invoice.projectId ?? "",
    currencyCode: record.invoice.currencyCode, exchangeRateToBase: record.invoice.exchangeRateToBase,
    exchangeRateDate: record.invoice.exchangeRateDate,
    exchangeRateSource: record.invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE",
    supplierInvoiceNumber: `${record.invoice.supplierInvoiceNumber}-COPY`, invoiceDate: record.invoice.invoiceDate, taxDate: record.invoice.taxDate,
    dueDate: record.invoice.dueDate, reference: record.invoice.reference ?? "", purchaseOrderId: "",
    lines: record.lines.map((line) => ({ itemId: line.itemId ?? "", description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit), expenseAccountId: line.expenseAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })),
  }, "draft");
}

export function deletePurchaseInvoice(businessId: string, userId: string, invoiceId: string) {
  const context = getBusinessDb(businessId, userId);
  const invoice = context.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).get();
  if (!invoice) throw new Error("Purchase invoice not found.");
  if (invoice.documentStatus !== "draft") throw new Error("Only draft purchase invoices can be deleted.");
  context.sqlite.transaction(() => {
    const inboundDocumentId = invoice.inboundEInvoiceDocumentId;
    context.db.delete(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).run();
    if (inboundDocumentId) {
      context.sqlite.prepare(`
        UPDATE inbound_einvoice_documents
        SET status = 'ReadyForDraft', purchase_invoice_id = NULL, reviewed_by = ?, reviewed_at = ?
        WHERE id = ? AND status = 'DraftCreated'
      `).run(userId, new Date().toISOString(), inboundDocumentId);
      appendInboundPurchaseEvent(context.sqlite, inboundDocumentId, "PurchaseInvoiceDraftDeleted", "ReadyForDraft", userId, invoiceId);
    }
  }).immediate();
}

export function voidPurchaseInvoice(businessId: string, userId: string, invoiceId: string) {
  const context = getBusinessDb(businessId, userId);
  const invoice = context.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).get();
  if (!invoice) throw new Error("Purchase invoice not found.");
  if (invoice.documentStatus !== "posted") throw new Error("Only posted purchase invoices can be voided.");
  if (paidForPurchaseInvoice(context.sqlite, invoiceId) > 0) throw new Error("Cannot void a purchase invoice that has payment allocations.");
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    assertVatSourceUnlocked(context.sqlite, "purchase_invoice", invoiceId, invoice.taxDate);
    reverseTransaction(context.sqlite, { originalSourceType: "purchase_invoice", originalSourceId: invoiceId, reversalSourceType: "purchase_invoice_void", reversalSourceId: invoiceId, date: now.slice(0, 10), description: `Void Purchase Invoice ${invoice.internalNumber}` });
    reverseTaxEntries(context.sqlite, { originalSourceType: "purchase_invoice", sourceId: invoiceId, reversalSourceType: "purchase_invoice_void", taxDate: invoice.taxDate });
    context.sqlite.prepare("UPDATE purchase_invoices SET document_status = 'void', voided_at = ?, updated_at = ? WHERE id = ?").run(now, now, invoiceId);
  }).immediate();
}
