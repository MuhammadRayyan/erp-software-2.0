import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { purchaseOrderLines, purchaseOrders, suppliers } from "@/core/db/business-schema";
import { addMinor, calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { purchaseOrderInputSchema, type PurchaseOrderInput } from "./purchase-order-input";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { convertDocumentLinesToBase, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";

export type PurchaseOrderStatus = "draft" | "issued" | "closed" | "cancelled";
export type PurchaseOrderIntent = "draft" | "issue";


function insertLines(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], orderId: string, lines: StoredLine[]) {
  const statement = sqlite.prepare(`INSERT INTO purchase_order_lines
    (id, purchase_order_id, item_id, description, quantity_micros, unit_price_minor, expense_account_id,
     tax_code_id, project_id, net_amount_minor, tax_amount_minor, gross_amount_minor, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const line of lines) statement.run(line.id, orderId, line.itemId, line.description, line.quantityMicros, line.unitPriceMinor, line.expenseAccountId, line.taxCodeId, line.projectId, line.netAmountMinor, line.taxAmountMinor, line.grossAmountMinor, line.position);
}

export function listPurchaseOrders(businessId: string, userId: string, supplierId?: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where = supplierId ? "WHERE po.supplier_id = ?" : "";
  const rows = sqlite.prepare(`SELECT po.*, s.name AS supplier_name,
    (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, po.project_id)) FROM purchase_order_lines l WHERE l.purchase_order_id = po.id) AS project_ids,
    (SELECT COUNT(*) FROM purchase_invoices pi WHERE pi.purchase_order_id = po.id) AS invoice_count,
    cur.minor_unit AS currency_minor_unit
    FROM purchase_orders po INNER JOIN suppliers s ON s.id = po.supplier_id
    INNER JOIN currencies cur ON cur.code = po.currency_code ${where}
    ORDER BY po.date DESC, po.created_at DESC`).all(...(supplierId ? [supplierId] : [])) as {
      id: string; order_number: string; supplier_id: string; supplier_name: string; date: string;
      expected_date: string | null; reference: string | null; notes: string | null;
      status: PurchaseOrderStatus; subtotal_minor: number; tax_minor: number; total_minor: number; currency_code: string; currency_minor_unit: number;
      created_by: string; created_at: string; updated_at: string; issued_at: string | null;
      closed_at: string | null; cancelled_at: string | null; invoice_count: number; project_id: string | null; project_ids: string | null;
    }[];
  const projects = sqlite.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project.name]));
  return rows.map((row) => ({ ...row, projectIds: row.project_ids?.split(",").filter(Boolean) ?? [], projectNames: (row.project_ids?.split(",").filter(Boolean) ?? []).map((id) => projectById.get(id) ?? id) }));
}

export function getPurchaseOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ order: purchaseOrders, supplier: suppliers }).from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).where(eq(purchaseOrders.id, orderId)).get();
  if (!header) return null;
  const lines = context.db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, orderId)).orderBy(asc(purchaseOrderLines.position)).all();
  const accounts = context.sqlite.prepare("SELECT id, code, name FROM accounts").all() as { id: string; code: string; name: string }[];
  const taxes = context.sqlite.prepare("SELECT id, name, rate_basis_points FROM tax_codes").all() as { id: string; name: string; rate_basis_points: number }[];
  const relatedInvoices = context.sqlite.prepare("SELECT id, internal_number, document_status, total_minor FROM purchase_invoices WHERE purchase_order_id = ? ORDER BY created_at DESC").all(orderId) as { id: string; internal_number: string; document_status: string; total_minor: number }[];
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const taxById = new Map(taxes.map((row) => [row.id, row]));
  const projects = context.sqlite.prepare("SELECT id, code, name FROM projects").all() as { id: string; code: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const itemRows = context.sqlite.prepare("SELECT id, sku, name, unit_name FROM inventory_items").all() as { id: string; sku: string | null; name: string; unit_name: string }[];
  const itemById = new Map(itemRows.map((item) => [item.id, item]));
  const receivedRows = context.sqlite.prepare(`SELECT grl.purchase_order_line_id AS line_id, SUM(grl.quantity_micros) AS received_micros FROM goods_receipt_lines grl INNER JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id AND gr.document_status = 'posted' WHERE gr.purchase_order_id = ? GROUP BY grl.purchase_order_line_id`).all(orderId) as { line_id: string; received_micros: number }[];
  const receivedByLine = new Map(receivedRows.map((row) => [row.line_id, row.received_micros]));
  const goodsReceipts = context.sqlite.prepare("SELECT id, receipt_number, date, document_status FROM goods_receipts WHERE purchase_order_id = ? ORDER BY date DESC, created_at DESC").all(orderId) as { id: string; receipt_number: string; date: string; document_status: string }[];
  return { ...header, project: header.order.projectId ? projectById.get(header.order.projectId) ?? null : null, lines: lines.map((line) => ({ ...line, item: line.itemId ? itemById.get(line.itemId) ?? null : null, receivedMicros: receivedByLine.get(line.id) ?? 0, remainingMicros: Math.max(0, line.quantityMicros - (receivedByLine.get(line.id) ?? 0)), expenseAccount: line.expenseAccountId ? accountById.get(line.expenseAccountId) ?? null : null, taxCode: taxById.get(line.taxCodeId) ?? null, project: effectiveProjectId(line.projectId, header.order.projectId) ? projectById.get(effectiveProjectId(line.projectId, header.order.projectId)!) ?? null : null })), relatedInvoices, goodsReceipts };
}

export function savePurchaseOrder(businessId: string, userId: string, input: PurchaseOrderInput, intent: PurchaseOrderIntent, orderId?: string) {
  const data = purchaseOrderInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const supplier = context.db.select().from(suppliers).where(eq(suppliers.id, data.supplierId)).get();
  if (!supplier || !supplier.isActive) throw new Error("Choose an active supplier.");
  const rate = resolveRateSnapshot(context.sqlite, {
    currencyCode: input.currencyCode ?? supplier.defaultCurrencyCode ?? data.currencyCode,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: data.date,
    enforceVatPolicy: false,
  });
  validateProjectReferences(context.sqlite, { headerProjectId: data.projectId, lineProjectIds: data.lines.map((line) => line.projectId) });
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, { accountTypeFilter: "expense", taxDirection: "purchases", supportItems: true, accountFieldOnLine: "expenseAccountId" });
  const amounts = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  const now = new Date().toISOString();
  const id = orderId ?? randomUUID();
  context.sqlite.transaction(() => {
    if (orderId) {
      const current = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
      if (!current) throw new Error("Purchase order not found.");
      if (current.status === "closed" || current.status === "cancelled") throw new Error("Closed or cancelled purchase orders cannot be edited.");
      if (context.sqlite.prepare("SELECT 1 FROM goods_receipts WHERE purchase_order_id = ? LIMIT 1").get(orderId)) throw new Error("A Purchase Order cannot be edited after a Goods Receipt has been created.");
      const nextStatus = current.status === "issued" || intent === "issue" ? "issued" : "draft";
      context.sqlite.prepare(`UPDATE purchase_orders SET supplier_id = ?, project_id = ?, date = ?, expected_date = ?, reference = ?, notes = ?, status = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ?, issued_at = CASE WHEN ? = 'issued' THEN COALESCE(issued_at, ?) ELSE issued_at END WHERE id = ?`)
        .run(data.supplierId, data.projectId || null, data.date, data.expectedDate || null, data.reference || null, data.notes || null, nextStatus, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, now, nextStatus, now, orderId);
      context.sqlite.prepare("DELETE FROM purchase_order_lines WHERE purchase_order_id = ?").run(orderId);
    } else {
      const orderNumber = allocateNumber(context.sqlite, "purchaseOrder");
      const status = intent === "issue" ? "issued" : "draft";
      context.sqlite.prepare(`INSERT INTO purchase_orders (id, order_number, supplier_id, project_id, date, expected_date, reference, notes, status, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, created_by, created_at, updated_at, issued_at, closed_at, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
        .run(id, orderNumber, data.supplierId, data.projectId || null, data.date, data.expectedDate || null, data.reference || null, data.notes || null, status, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, userId, now, now, status === "issued" ? now : null);
    }
    insertLines(context.sqlite, id, lines);
  }).immediate();
  return id;
}

export function closePurchaseOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.status !== "issued") throw new Error("Only an issued purchase order can be closed.");
  const now = new Date().toISOString();
  context.db.update(purchaseOrders).set({ status: "closed", closedAt: now, updatedAt: now }).where(eq(purchaseOrders.id, orderId)).run();
}

export function cancelPurchaseOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.status === "cancelled") throw new Error("Purchase order has already been cancelled.");
  if (order.status === "closed") throw new Error("A closed purchase order cannot be cancelled.");
  const now = new Date().toISOString();
  context.db.update(purchaseOrders).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(eq(purchaseOrders.id, orderId)).run();
}

export function deletePurchaseOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.status !== "draft") throw new Error("Only draft purchase orders can be deleted.");
  context.db.delete(purchaseOrders).where(eq(purchaseOrders.id, orderId)).run();
}
