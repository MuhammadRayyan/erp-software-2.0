import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { salesOrderLines, salesOrders, customers } from "@/core/db/business-schema";
import { addMinor, calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { salesOrderInputSchema, type SalesOrderInput } from "./sales-order-input";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { convertDocumentLinesToBase, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";

export type SalesOrderStatus = "draft" | "active" | "completed" | "cancelled";
export type SalesOrderIntent = "draft" | "issue";


function insertLines(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], orderId: string, lines: StoredLine[]) {
  const statement = sqlite.prepare(`INSERT INTO sales_order_lines
    (id, order_id, item_id, description, quantity_micros, unit_price_minor, sales_account_id,
     tax_code_id, project_id, net_amount_minor, tax_amount_minor, gross_amount_minor, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const line of lines) statement.run(line.id, orderId, line.itemId, line.description, line.quantityMicros, line.unitPriceMinor, line.salesAccountId, line.taxCodeId, line.projectId, line.netAmountMinor, line.taxAmountMinor, line.grossAmountMinor, line.lineIndex);
}

export function listSalesOrders(businessId: string, userId: string, customerId?: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where = customerId ? "WHERE po.customer_id = ?" : "";
  const rows = sqlite.prepare(`SELECT po.*, s.name AS customer_name,
    (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, po.project_id)) FROM sales_order_lines l WHERE l.order_id = po.id) AS project_ids,
    (SELECT COUNT(*) FROM sales_invoices pi WHERE pi.order_id = po.id) AS invoice_count,
    cur.minor_unit AS currency_minor_unit
    FROM sales_orders po INNER JOIN customers s ON s.id = po.customer_id
    INNER JOIN currencies cur ON cur.code = po.currency_code ${where}
    ORDER BY po.date DESC, po.created_at DESC`).all(...(customerId ? [customerId] : [])) as {
      id: string; order_number: string; customer_id: string; customer_name: string; date: string;
      expected_date: string | null; reference: string | null; notes: string | null;
      documentStatus: SalesOrderStatus; subtotal_minor: number; tax_minor: number; total_minor: number; currency_code: string; currency_minor_unit: number;
      created_by: string; created_at: string; updated_at: string; issued_at: string | null;
      closed_at: string | null; cancelled_at: string | null; invoice_count: number; project_id: string | null; project_ids: string | null;
    }[];
  const projects = sqlite.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project.name]));
  return rows.map((row) => ({ ...row, projectIds: row.project_ids?.split(",").filter(Boolean) ?? [], projectNames: (row.project_ids?.split(",").filter(Boolean) ?? []).map((id) => projectById.get(id) ?? id) }));
}

export function getSalesOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ order: salesOrders, customer: customers }).from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId)).where(eq(salesOrders.id, orderId)).get();
  if (!header) return null;
  const lines = context.db.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId)).orderBy(asc(salesOrderLines.position)).all();
  const accounts = context.sqlite.prepare("SELECT id, code, name FROM accounts").all() as { id: string; code: string; name: string }[];
  const taxes = context.sqlite.prepare("SELECT id, name, rate_basis_points FROM tax_codes").all() as { id: string; name: string; rate_basis_points: number }[];
  const relatedInvoices = context.sqlite.prepare("SELECT id, invoice_number, document_status, total_minor FROM sales_invoices WHERE sales_order_id = ? ORDER BY created_at DESC").all(orderId) as { id: string; invoice_number: string; document_documentStatus: string; total_minor: number }[];
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const taxById = new Map(taxes.map((row) => [row.id, row]));
  const projects = context.sqlite.prepare("SELECT id, code, name FROM projects").all() as { id: string; code: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const itemRows = context.sqlite.prepare("SELECT id, sku, name, unit_name FROM inventory_items").all() as { id: string; sku: string | null; name: string; unit_name: string }[];
  const itemById = new Map(itemRows.map((item) => [item.id, item]));
  const receivedRows = [] as { line_id: string; received_micros: number }[];
  const receivedByLine = new Map(receivedRows.map((row) => [row.line_id, row.received_micros]));
  const goodsReceipts = [] as { id: string; receipt_number: string; date: string; document_documentStatus: string }[];
  return { ...header, project: header.order.projectId ? projectById.get(header.order.projectId) ?? null : null, lines: lines.map((line) => ({ ...line, item: line.itemId ? itemById.get(line.itemId) ?? null : null, receivedMicros: receivedByLine.get(line.id) ?? 0, remainingMicros: Math.max(0, line.quantityMicros - (receivedByLine.get(line.id) ?? 0)), salesAccount: line.salesAccountId ? accountById.get(line.salesAccountId) ?? null : null, taxCode: taxById.get(line.taxCodeId) ?? null, project: effectiveProjectId(line.projectId, header.order.projectId) ? projectById.get(effectiveProjectId(line.projectId, header.order.projectId)!) ?? null : null })),  };
}

export function saveSalesOrder(businessId: string, userId: string, input: SalesOrderInput, intent: SalesOrderIntent, orderId?: string) {
  const data = salesOrderInputSchema.parse(input);
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
  const id = orderId ?? randomUUID();
  context.sqlite.transaction(() => {
    if (orderId) {
      const current = context.db.select().from(salesOrders).where(eq(salesOrders.id, orderId)).get();
      if (!current) throw new Error("Purchase order not found.");
      if (current.documentStatus === "completed" || current.documentStatus === "cancelled") throw new Error("Closed or cancelled purchase orders cannot be edited.");
      
      const nextStatus = current.documentStatus === "active" || intent === "issue" ? "active" : "draft";
      context.sqlite.prepare(`UPDATE sales_orders SET customer_id = ?, project_id = ?, sales_quote_id = ?, order_date = ?, delivery_date = ?, reference = ?, document_status = ?, amounts_include_tax = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ? WHERE id = ?`)
        .run(data.customerId, data.projectId || null, data.salesQuoteId || null, data.date, data.expectedDate || "", data.reference || null, nextStatus, data.amountsIncludeTax ? 1 : 0, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, now, orderId);
      context.sqlite.prepare("DELETE FROM sales_order_lines WHERE order_id = ?").run(orderId);
    } else {
      const orderNumber = allocateNumber(context.sqlite, "salesOrder");
      const status = intent === "issue" ? "active" : "draft";
      context.sqlite.prepare(`INSERT INTO sales_orders (id, order_number, customer_id, project_id, sales_quote_id, order_date, delivery_date, reference, document_status, amounts_include_tax, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, orderNumber, data.customerId, data.projectId || null, data.salesQuoteId || null, data.date, data.expectedDate || "", data.reference || null, status, data.amountsIncludeTax ? 1 : 0, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, userId, now, now);
    }
    insertLines(context.sqlite, id, lines);
  }).immediate();
  return id;
}

export function closeSalesOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(salesOrders).where(eq(salesOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.documentStatus !== "active") throw new Error("Only an issued purchase order can be closed.");
  const now = new Date().toISOString();
  context.db.update(salesOrders).set({ documentStatus: "completed", updatedAt: now }).where(eq(salesOrders.id, orderId)).run();
}

export function cancelSalesOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(salesOrders).where(eq(salesOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.documentStatus === "cancelled") throw new Error("Purchase order has already been cancelled.");
  if (order.documentStatus === "completed") throw new Error("A closed purchase order cannot be cancelled.");
  const now = new Date().toISOString();
  context.db.update(salesOrders).set({ documentStatus: "cancelled", updatedAt: now }).where(eq(salesOrders.id, orderId)).run();
}

export function deleteSalesOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(salesOrders).where(eq(salesOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.documentStatus !== "draft") throw new Error("Only draft purchase orders can be deleted.");
  context.db.delete(salesOrders).where(eq(salesOrders.id, orderId)).run();
}
