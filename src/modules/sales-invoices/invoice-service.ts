import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import {
  customers,
  salesInvoiceLines,
  salesInvoices,
} from "@/core/db/business-schema";
import {
  addMinor,
  calculateTax,
  multiplyMoneyByQuantity,
  parseQuantityToMicros,
  quantityMicrosToInput,
} from "@/modules/accounting/calculations/money";
import { postSalesInvoice } from "@/modules/accounting/services/invoice-posting-service";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { replaceTaxEntries, reverseTaxEntries } from "@/modules/tax/tax-entry-service";
import { assertVatDateUnlocked, assertVatSourceUnlocked } from "@/modules/tax/tax-lock-service";
import { assertEInvoiceSourceEditable, invalidatePreparedEInvoice } from "@/modules/einvoicing/einvoice-service";
import { parseTransactionFlags } from "@/modules/einvoicing/einvoice-types";
import { invoiceInputSchema, type InvoiceData, type InvoiceInput } from "./invoice-input";
import { convertDocumentLinesToBase, minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { getCurrency } from "@/modules/currency/currency";
import { resolveRateSnapshot } from "@/modules/currency/validation";

export type DocumentStatus = "draft" | "posted" | "void";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "overdue";
export type InvoiceSaveIntent = "draft" | "post";

type StoredLine = {
  id: string;
  itemId: string | null;
  description: string;
  quantityMicros: number;
  unitPriceMinor: number;
  salesAccountId: string;
  taxCodeId: string;
  projectId: string | null;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  position: number;
};

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

function calculateLines(
  sqlite: ReturnType<typeof getBusinessDb>["sqlite"],
  data: InvoiceData,
  minorUnit: number,
) {
  const incomeAccounts = sqlite
    .prepare("SELECT id FROM accounts WHERE type = 'income' AND is_active = 1")
    .all() as { id: string }[];
  const incomeIds = new Set(incomeAccounts.map((account) => account.id));
  const taxCodeRows = sqlite
    .prepare("SELECT id, rate_basis_points, direction, vat_category FROM tax_codes WHERE is_active = 1")
    .all() as { id: string; rate_basis_points: number; direction: string; vat_category: string | null }[];
  const taxCodeById = new Map(taxCodeRows.map((taxCode) => [taxCode.id, taxCode]));
  const itemRows = sqlite.prepare("SELECT id, sales_account_id FROM inventory_items WHERE is_active = 1").all() as { id: string; sales_account_id: string }[];
  const itemById = new Map(itemRows.map((item) => [item.id, item]));

  return data.lines.map((line, position): StoredLine => {
    const item = line.itemId ? itemById.get(line.itemId) : null;
    if (line.itemId && !item) throw new Error("Cannot save invoice because an inventory item is missing or inactive.");
    const salesAccountId = item?.sales_account_id ?? line.salesAccountId;
    if (!incomeIds.has(salesAccountId)) {
      throw new Error("Cannot save invoice because a line has no active sales account.");
    }
    const taxCode = taxCodeById.get(line.taxCodeId);
    if (!taxCode) throw new Error("Cannot save invoice because a line has no active tax code.");
    if (!["sales", "both"].includes(taxCode.direction)) throw new Error("The selected tax code cannot be used for Sales.");
    if (!taxCode.vat_category) throw new Error("The selected tax code needs a VAT category before posting.");
    const quantityMicros = parseQuantityToMicros(line.quantity);
    const unitPriceMinor = parseCurrencyAmountToMinor(line.unitPrice, minorUnit, "Unit price");
    const netAmountMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    const taxAmountMinor = calculateTax(netAmountMinor, taxCode.rate_basis_points);
    return {
      id: randomUUID(),
      itemId: line.itemId || null,
      description: line.description,
      quantityMicros,
      unitPriceMinor,
      salesAccountId,
      taxCodeId: line.taxCodeId,
      projectId: line.projectId || null,
      netAmountMinor,
      taxAmountMinor,
      grossAmountMinor: addMinor([netAmountMinor, taxAmountMinor]),
      position,
    };
  });
}

function totalsForLines(lines: StoredLine[]) {
  const subtotalMinor = addMinor(lines.map((line) => line.netAmountMinor));
  const taxMinor = addMinor(lines.map((line) => line.taxAmountMinor));
  return { subtotalMinor, taxMinor, totalMinor: addMinor([subtotalMinor, taxMinor]) };
}

function insertLines(
  sqlite: ReturnType<typeof getBusinessDb>["sqlite"],
  invoiceId: string,
  lines: StoredLine[],
) {
  const statement = sqlite.prepare(`
    INSERT INTO sales_invoice_lines (
      id, invoice_id, description, quantity_micros, unit_price_minor,
      sales_account_id, tax_code_id, net_amount_minor, tax_amount_minor,
      gross_amount_minor, project_id, item_id, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of lines) {
    statement.run(
      line.id,
      invoiceId,
      line.description,
      line.quantityMicros,
      line.unitPriceMinor,
      line.salesAccountId,
      line.taxCodeId,
      line.netAmountMinor,
      line.taxAmountMinor,
      line.grossAmountMinor,
      line.projectId,
      line.itemId,
      line.position,
    );
  }
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

function listInvoiceRows(
  businessId: string,
  userId: string,
  customerId?: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where = customerId ? "WHERE i.customer_id = ?" : "";
  const rows = sqlite
    .prepare(`
      SELECT i.id, i.invoice_number, i.customer_id, c.name AS customer_name,
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
    `)
    .all(...(customerId ? [customerId] : [])) as {
      id: string;
      invoice_number: string;
      customer_id: string;
      customer_name: string;
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

export function listInvoices(businessId: string, userId: string) {
  return listInvoiceRows(businessId, userId);
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
    ? context.sqlite.prepare(`SELECT id, code, name FROM accounts WHERE id IN (${lineAccountIds.map(() => '?').join(',')})`).all(...lineAccountIds) as { id: string; code: string; name: string }[]
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
    deliveryNotes: context.sqlite.prepare("SELECT id, delivery_number, date, document_status FROM delivery_notes WHERE sales_invoice_id = ? ORDER BY date DESC, created_at DESC").all(invoiceId) as { id: string; delivery_number: string; date: string; document_status: string }[],
  };
}

export function createInvoice(
  businessId: string,
  userId: string,
  input: InvoiceInput,
  intent: InvoiceSaveIntent,
) {
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
  const lines = calculateLines(context.sqlite, data, rate.currencyMinorUnit);
  const totals = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  const id = randomUUID();
  const now = new Date().toISOString();

  context.sqlite.transaction(() => {
    if (intent === "post") assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
    const invoiceNumber = allocateNumber(context.sqlite, "invoice");
    context.sqlite
      .prepare(`
        INSERT INTO sales_invoices (
          id, invoice_number, customer_id, invoice_date, tax_date, supply_emirate, due_date, reference,
          einvoice_transaction_flags_json, project_id, document_status, subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at, posted_at, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
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
        JSON.stringify(data.eInvoiceTransactionFlags),
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
        userId,
        now,
        now,
      );
    insertLines(context.sqlite, id, lines);
    if (intent === "post") {
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
    }
  }).immediate();
  return id;
}

export function updateInvoice(
  businessId: string,
  userId: string,
  invoiceId: string,
  input: InvoiceInput,
  intent: InvoiceSaveIntent,
) {
  const data = invoiceInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId)).get();
  if (!current) throw new Error("Invoice not found.");
  if (current.documentStatus === "void") throw new Error("A void invoice cannot be edited.");
  assertEInvoiceSourceEditable(context.sqlite, "sales_invoice", invoiceId);
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
  const lines = calculateLines(context.sqlite, data, rate.currencyMinorUnit);
  const totals = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  if (totals.totalMinor < allocatedMinor) {
    throw new Error("Cannot reduce invoice total below amount already received.");
  }
  const now = new Date().toISOString();
  const shouldPost = current.documentStatus === "posted" || intent === "post";

  context.sqlite.transaction(() => {
    invalidatePreparedEInvoice(context.sqlite, "sales_invoice", invoiceId);
    if (current.documentStatus === "posted") {
      assertVatSourceUnlocked(context.sqlite, "sales_invoice", invoiceId, current.taxDate);
    }
    if (shouldPost) assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
    context.sqlite
      .prepare(`
        UPDATE sales_invoices
        SET customer_id = ?, project_id = ?, invoice_date = ?, tax_date = ?, supply_emirate = ?, due_date = ?, reference = ?,
            einvoice_transaction_flags_json = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?,
            currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?,
            base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ?
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
        JSON.stringify(data.eInvoiceTransactionFlags),
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
        now,
        invoiceId,
      );
    context.sqlite.prepare("DELETE FROM sales_invoice_lines WHERE invoice_id = ?").run(invoiceId);
    insertLines(context.sqlite, invoiceId, lines);
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
  }).immediate();
}

export function deleteInvoice(businessId: string, userId: string, invoiceId: string) {
  const context = getBusinessDb(businessId, userId);
  const invoice = context.db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId)).get();
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.documentStatus !== "draft") throw new Error("Only draft invoices can be deleted.");
  context.db.delete(salesInvoices).where(eq(salesInvoices.id, invoiceId)).run();
}

export function duplicateInvoice(businessId: string, userId: string, invoiceId: string) {
  const record = getInvoice(businessId, userId, invoiceId);
  if (!record) throw new Error("Invoice not found.");
  // Reuse the already-fetched DB context (via the LRU pool) rather than calling getBusinessDb a second time.
  const context = getBusinessDb(businessId, userId);
  const minorUnit = getCurrency(context.sqlite, record.invoice.currencyCode).minor_unit;
  return createInvoice(
    businessId,
    userId,
    {
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
      eInvoiceTransactionFlags: parseTransactionFlags(record.invoice.eInvoiceTransactionFlagsJson),
      lines: record.lines.map((line) => ({
        itemId: line.itemId ?? "",
        description: line.description,
        quantity: quantityMicrosToInput(line.quantityMicros),
        unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit),
        salesAccountId: line.salesAccountId,
        taxCodeId: line.taxCodeId,
        projectId: line.projectId ?? "",
      })),
    },
    "draft",
  );
}

export function voidInvoice(businessId: string, userId: string, invoiceId: string) {
  const context = getBusinessDb(businessId, userId);
  const invoice = context.db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId)).get();
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.documentStatus !== "posted") throw new Error("Only posted invoices can be voided.");
  assertEInvoiceSourceEditable(context.sqlite, "sales_invoice", invoiceId);
  if (allocatedForInvoice(context.sqlite, invoiceId) > 0) {
    throw new Error("Cannot void an invoice that has receipt allocations.");
  }
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    invalidatePreparedEInvoice(context.sqlite, "sales_invoice", invoiceId);
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
  }).immediate();
}
