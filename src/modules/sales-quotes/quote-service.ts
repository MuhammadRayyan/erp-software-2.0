import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { salesQuoteLines, salesQuotes, customers } from "@/core/db/business-schema";
import { addMinor, calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { salesQuoteInputSchema, type SalesQuoteInput } from "./quote-input";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { convertDocumentLinesToBase, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";

export type SalesQuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "cancelled";
export type SalesQuoteIntent = "draft" | "issue";


function insertLines(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], quoteId: string, lines: StoredLine[]) {
  const statement = sqlite.prepare(`INSERT INTO sales_quote_lines
    (id, quote_id, item_id, description, quantity_micros, unit_price_minor, sales_account_id,
     tax_code_id, project_id, net_amount_minor, tax_amount_minor, gross_amount_minor, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const line of lines) statement.run(line.id, quoteId, line.itemId, line.description, line.quantityMicros, line.unitPriceMinor, line.salesAccountId, line.taxCodeId, line.projectId, line.netAmountMinor, line.taxAmountMinor, line.grossAmountMinor, line.lineIndex);
}

export function listSalesQuotes(businessId: string, userId: string, customerId?: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where = customerId ? "WHERE po.customer_id = ?" : "";
  const rows = sqlite.prepare(`SELECT po.*, s.name AS customer_name,
    (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, po.project_id)) FROM sales_quote_lines l WHERE l.quote_id = po.id) AS project_ids,
    (SELECT COUNT(*) FROM sales_invoices pi WHERE pi.quote_id = po.id) AS invoice_count,
    cur.minor_unit AS currency_minor_unit
    FROM sales_quotes po INNER JOIN customers s ON s.id = po.customer_id
    INNER JOIN currencies cur ON cur.code = po.currency_code ${where}
    ORDER BY po.date DESC, po.created_at DESC`).all(...(customerId ? [customerId] : [])) as {
      id: string; quote_number: string; customer_id: string; customer_name: string; date: string;
      expected_date: string | null; reference: string | null; notes: string | null;
      documentStatus: SalesQuoteStatus; subtotal_minor: number; tax_minor: number; total_minor: number; currency_code: string; currency_minor_unit: number;
      created_by: string; created_at: string; updated_at: string; issued_at: string | null;
      closed_at: string | null; cancelled_at: string | null; invoice_count: number; project_id: string | null; project_ids: string | null;
    }[];
  const projects = sqlite.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project.name]));
  return rows.map((row) => ({ ...row, projectIds: row.project_ids?.split(",").filter(Boolean) ?? [], projectNames: (row.project_ids?.split(",").filter(Boolean) ?? []).map((id) => projectById.get(id) ?? id) }));
}

export function getSalesQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ quote: salesQuotes, customer: customers }).from(salesQuotes)
    .innerJoin(customers, eq(customers.id, salesQuotes.customerId)).where(eq(salesQuotes.id, quoteId)).get();
  if (!header) return null;
  const lines = context.db.select().from(salesQuoteLines).where(eq(salesQuoteLines.quoteId, quoteId)).orderBy(asc(salesQuoteLines.position)).all();
  const accounts = context.sqlite.prepare("SELECT id, code, name FROM accounts").all() as { id: string; code: string; name: string }[];
  const taxes = context.sqlite.prepare("SELECT id, name, rate_basis_points FROM tax_codes").all() as { id: string; name: string; rate_basis_points: number }[];
  const relatedInvoices = [] as { id: string; internal_number: string; document_documentStatus: string; total_minor: number }[];
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const taxById = new Map(taxes.map((row) => [row.id, row]));
  const projects = context.sqlite.prepare("SELECT id, code, name FROM projects").all() as { id: string; code: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const itemRows = context.sqlite.prepare("SELECT id, sku, name, unit_name FROM inventory_items").all() as { id: string; sku: string | null; name: string; unit_name: string }[];
  const itemById = new Map(itemRows.map((item) => [item.id, item]));
  const receivedRows = [] as { line_id: string; received_micros: number }[];
  const receivedByLine = new Map(receivedRows.map((row) => [row.line_id, row.received_micros]));
  const goodsReceipts = [] as { id: string; receipt_number: string; date: string; document_documentStatus: string }[];
  return { ...header, project: header.quote.projectId ? projectById.get(header.quote.projectId) ?? null : null, lines: lines.map((line) => ({ ...line, item: line.itemId ? itemById.get(line.itemId) ?? null : null, receivedMicros: receivedByLine.get(line.id) ?? 0, remainingMicros: Math.max(0, line.quantityMicros - (receivedByLine.get(line.id) ?? 0)), salesAccount: line.salesAccountId ? accountById.get(line.salesAccountId) ?? null : null, taxCode: taxById.get(line.taxCodeId) ?? null, project: effectiveProjectId(line.projectId, header.quote.projectId) ? projectById.get(effectiveProjectId(line.projectId, header.quote.projectId)!) ?? null : null })),  };
}

export function saveSalesQuote(businessId: string, userId: string, input: SalesQuoteInput, intent: SalesQuoteIntent, quoteId?: string) {
  const data = salesQuoteInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const customer = context.db.select().from(customers).where(eq(customers.id, data.customerId)).get();
  if (!customer || !customer.isActive) throw new Error("Choose an active customer.");
  const rate = resolveRateSnapshot(context.sqlite, {
    currencyCode: input.currencyCode ?? customer.defaultCurrencyCode ?? data.currencyCode,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: data.date,
    enforceVatPolicy: false,
  });
  validateProjectReferences(context.sqlite, { headerProjectId: data.projectId, lineProjectIds: data.lines.map((line) => line.projectId) });
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, { accountTypeFilter: "income", taxDirection: "sales", supportItems: true, accountFieldOnLine: "salesAccountId", amountsIncludeTax: data.amountsIncludeTax });
  const amounts = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  const now = new Date().toISOString();
  const id = quoteId ?? randomUUID();
  context.sqlite.transaction(() => {
    if (quoteId) {
      const current = context.db.select().from(salesQuotes).where(eq(salesQuotes.id, quoteId)).get();
      if (!current) throw new Error("Purchase quote not found.");
      if (current.documentStatus === "accepted" || current.documentStatus === "cancelled") throw new Error("Closed or cancelled purchase quotes cannot be edited.");
      if (context.sqlite.prepare("SELECT 1 FROM delivery_notes WHERE quote_id = ? LIMIT 1").get(quoteId)) throw new Error("A Purchase Quote cannot be edited after a Goods Receipt has been created.");
      const nextStatus = current.documentStatus === "sent" || intent === "issue" ? "sent" : "draft";
      context.sqlite.prepare(`UPDATE sales_quotes SET customer_id = ?, project_id = ?, quote_date = ?, expiry_date = ?, reference = ?, document_status = ?, amounts_include_tax = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ? WHERE id = ?`)
        .run(data.customerId, data.projectId || null, data.date, data.expectedDate || "", data.reference || null, nextStatus, data.amountsIncludeTax ? 1 : 0, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, now, quoteId);
      context.sqlite.prepare("DELETE FROM sales_quote_lines WHERE quote_id = ?").run(quoteId);
    } else {
      const quoteNumber = allocateNumber(context.sqlite, "salesQuote");
      const status = intent === "issue" ? "sent" : "draft";
      context.sqlite.prepare(`INSERT INTO sales_quotes (id, quote_number, customer_id, project_id, quote_date, expiry_date, reference, document_status, amounts_include_tax, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, quoteNumber, data.customerId, data.projectId || null, data.date, data.expectedDate || "", data.reference || null, status, data.amountsIncludeTax ? 1 : 0, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, userId, now, now);
    }
    insertLines(context.sqlite, id, lines);
  }).immediate();
  return id;
}

export function closeSalesQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const quote = context.db.select().from(salesQuotes).where(eq(salesQuotes.id, quoteId)).get();
  if (!quote) throw new Error("Purchase quote not found.");
  if (quote.documentStatus !== "sent") throw new Error("Only an issued purchase quote can be closed.");
  const now = new Date().toISOString();
  context.db.update(salesQuotes).set({ documentStatus: "accepted", updatedAt: now }).where(eq(salesQuotes.id, quoteId)).run();
}

export function cancelSalesQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const quote = context.db.select().from(salesQuotes).where(eq(salesQuotes.id, quoteId)).get();
  if (!quote) throw new Error("Purchase quote not found.");
  if (quote.documentStatus === "cancelled") throw new Error("Purchase quote has already been cancelled.");
  if (quote.documentStatus === "accepted") throw new Error("A closed purchase quote cannot be cancelled.");
  const now = new Date().toISOString();
  context.db.update(salesQuotes).set({ documentStatus: "cancelled", updatedAt: now }).where(eq(salesQuotes.id, quoteId)).run();
}

export function deleteSalesQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const quote = context.db.select().from(salesQuotes).where(eq(salesQuotes.id, quoteId)).get();
  if (!quote) throw new Error("Purchase quote not found.");
  if (quote.documentStatus !== "draft") throw new Error("Only draft purchase quotes can be deleted.");
  context.db.delete(salesQuotes).where(eq(salesQuotes.id, quoteId)).run();
}
