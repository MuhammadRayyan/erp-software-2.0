import { createDocumentRevision, deleteDraftRevision } from "@/core/versioning/revision-engine";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { purchaseOrderLines, purchaseOrders, suppliers } from "@/core/db/business-schema";
;
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { purchaseOrderInputSchema, type PurchaseOrderInput } from "./purchase-order-input";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { convertDocumentLinesToBase} from "@/modules/currency/conversion";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";
import { recordActivity } from "@/modules/activity-log/activity-log-service";

export type PurchaseOrderStatus = "draft" | "issued" | "closed" | "cancelled" | "superseded";
export type PurchaseOrderIntent = "draft" | "issue";


import { drizzle } from "drizzle-orm/better-sqlite3";
import * as businessSchema from "@/core/db/business-schema";

function insertLines(
  dbOrSqlite: ReturnType<typeof getBusinessDb>["db"] | ReturnType<typeof getBusinessDb>["sqlite"],
  orderId: string,
  lines: StoredLine[],
) {
  if (lines.length === 0) return;
  const db = "insert" in dbOrSqlite ? dbOrSqlite : drizzle(dbOrSqlite, { schema: businessSchema });
  const linesArray = lines.map((line) => ({
    id: line.id,
    purchaseOrderId: orderId,
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
  db.insert(purchaseOrderLines).values(linesArray).run();
}


export function listPurchaseOrders(
  businessId: string, 
  userId: string, 
  filters?: { supplierId?: string; from?: string; to?: string }
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where: string[] = [];
  const params: string[] = [];
  if (filters?.supplierId) {
    where.push("po.supplier_id = ?");
    params.push(filters.supplierId);
  }
  if (filters?.from) {
    where.push("po.date >= ?");
    params.push(filters.from);
  }
  if (filters?.to) {
    where.push("po.date <= ?");
    params.push(filters.to);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = sqlite.prepare(`
    SELECT po.*, s.name AS supplier_name,
      (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, po.project_id)) FROM purchase_order_lines l WHERE l.purchase_order_id = po.id) AS project_ids,
      (SELECT COUNT(*) FROM purchase_invoices pi WHERE pi.purchase_order_id = po.id) AS invoice_count,
      cur.minor_unit AS currency_minor_unit
    FROM purchase_orders po INNER JOIN suppliers s ON s.id = po.supplier_id
    INNER JOIN currencies cur ON cur.code = po.currency_code
    ${whereClause}
    ORDER BY po.date DESC, po.created_at DESC
  `).all(...params) as {
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
  const accounts = context.sqlite.prepare("SELECT id, name FROM accounts").all() as { id: string; name: string }[];
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
  const linkedQuote = header.order.purchaseQuoteId
    ? (context.sqlite.prepare("SELECT id, quote_number, document_status FROM purchase_quotes WHERE id = ?").get(header.order.purchaseQuoteId) as { id: string; quote_number: string; document_status: string } | undefined)
    : undefined;
  return { ...header, project: header.order.projectId ? projectById.get(header.order.projectId) ?? null : null, lines: lines.map((line) => ({ ...line, item: line.itemId ? itemById.get(line.itemId) ?? null : null, receivedMicros: receivedByLine.get(line.id) ?? 0, remainingMicros: Math.max(0, line.quantityMicros - (receivedByLine.get(line.id) ?? 0)), expenseAccount: line.expenseAccountId ? accountById.get(line.expenseAccountId) ?? null : null, taxCode: taxById.get(line.taxCodeId) ?? null, project: effectiveProjectId(line.projectId, header.order.projectId) ? projectById.get(effectiveProjectId(line.projectId, header.order.projectId)!) ?? null : null })), relatedInvoices, goodsReceipts, linkedQuote };
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
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, { accountTypeFilter: "expense", taxDirection: "purchases", supportItems: true, accountFieldOnLine: "expenseAccountId", amountsIncludeTax: data.amountsIncludeTax });
  const amounts = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  const now = new Date().toISOString();
  const id = orderId ?? randomUUID();
  let recordedOrderNumber = "";
  context.sqlite.transaction(() => {
    if (orderId) {
      const current = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
      if (!current) throw new Error("Purchase order not found.");
      if (current.status === "closed" || current.status === "cancelled") throw new Error("Closed or cancelled purchase orders cannot be edited.");
      if (context.sqlite.prepare("SELECT 1 FROM goods_receipts WHERE purchase_order_id = ? LIMIT 1").get(orderId)) throw new Error("A Purchase Order cannot be edited after a Goods Receipt has been created.");
      recordedOrderNumber = current.orderNumber;
      const nextStatus = current.status === "issued" || intent === "issue" ? "issued" : "draft";
      const effectivePurchaseQuoteId = data.purchaseQuoteId || current.purchaseQuoteId || null;
      context.sqlite.prepare(`UPDATE purchase_orders SET supplier_id = ?, project_id = ?, purchase_quote_id = ?, date = ?, expected_date = ?, reference = ?, notes = ?, terms = ?, status = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ?, issued_at = CASE WHEN ? = 'issued' THEN COALESCE(issued_at, ?) ELSE issued_at END WHERE id = ?`)
        .run(data.supplierId, data.projectId || null, effectivePurchaseQuoteId, data.date, data.expectedDate || null, data.reference || null, data.notes || null, data.terms || null, nextStatus, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, now, nextStatus, now, orderId);
      context.sqlite.prepare("DELETE FROM purchase_order_lines WHERE purchase_order_id = ?").run(orderId);
    } else {
      const orderNumber = allocateNumber(context.sqlite, "purchaseOrder");
      recordedOrderNumber = orderNumber;
      const status = intent === "issue" ? "issued" : "draft";
      context.sqlite.prepare(`INSERT INTO purchase_orders (id, order_number, supplier_id, project_id, purchase_quote_id, date, expected_date, reference, notes, terms, status, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, created_by, created_at, updated_at, issued_at, closed_at, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
        .run(id, orderNumber, data.supplierId, data.projectId || null, data.purchaseQuoteId || null, data.date, data.expectedDate || null, data.reference || null, data.notes || null, data.terms || null, status, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, userId, now, now, status === "issued" ? now : null);
    }
    insertLines(context.db, id, lines);
  }).immediate();

  try {
    recordActivity(businessId, {
      userId,
      action: orderId ? (intent === "issue" ? "posted" : "updated") : (intent === "issue" ? "posted" : "created"),
      entityType: "purchase_order",
      entityId: id,
      entityNumber: recordedOrderNumber,
      summary: `${orderId ? (intent === "issue" ? "Issued" : "Updated") : (intent === "issue" ? "Issued" : "Created")} purchase order ${recordedOrderNumber}`,
      details: { orderNumber: recordedOrderNumber, totalMinor: amounts.totalMinor, currency: rate.currencyCode, supplierId: data.supplierId },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] purchase_order save failed:", e);
  }

  return id;
}

export function closePurchaseOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.status !== "issued") throw new Error("Only an issued purchase order can be closed.");
  const now = new Date().toISOString();
  context.db.update(purchaseOrders).set({ status: "closed", closedAt: now, updatedAt: now }).where(eq(purchaseOrders.id, orderId)).run();

  try {
    recordActivity(businessId, {
      userId,
      action: "posted",
      entityType: "purchase_order",
      entityId: orderId,
      entityNumber: order.orderNumber,
      summary: `Closed purchase order ${order.orderNumber}`,
      details: { orderNumber: order.orderNumber, previousStatus: order.status, newStatus: "closed" },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] purchase_order close failed:", e);
  }
}

export function cancelPurchaseOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.status === "cancelled") throw new Error("Purchase order has already been cancelled.");
  if (order.status === "closed") throw new Error("A closed purchase order cannot be cancelled.");
  const now = new Date().toISOString();
  context.db.update(purchaseOrders).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(eq(purchaseOrders.id, orderId)).run();

  try {
    recordActivity(businessId, {
      userId,
      action: "voided",
      entityType: "purchase_order",
      entityId: orderId,
      entityNumber: order.orderNumber,
      summary: `Cancelled purchase order ${order.orderNumber}`,
      details: { orderNumber: order.orderNumber, previousStatus: order.status, newStatus: "cancelled" },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] purchase_order cancel failed:", e);
  }
}

const revisionConfig = {
  headerTable: "purchase_orders",
  lineTable: "purchase_order_lines",
  headerIdColumn: "id",
  lineHeaderIdColumn: "purchase_order_id",
  documentNumberColumn: "order_number",
  statusColumn: "status",
};

export function deletePurchaseOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const order = context.sqlite.prepare("SELECT order_number FROM purchase_orders WHERE id = ?").get(orderId) as { order_number: string } | undefined;
  deleteDraftRevision(context.sqlite, revisionConfig, orderId);

  if (order) {
    try {
      recordActivity(businessId, {
        userId,
        action: "deleted",
        entityType: "purchase_order",
        entityId: orderId,
        entityNumber: order.order_number,
        summary: `Deleted draft purchase order ${order.order_number}`,
        sqlite: context.sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] purchase_order delete failed:", e);
    }
  }
}

export function createPurchaseOrderRevision(businessId: string, userId: string, sourceOrderId: string): string {
  const context = getBusinessDb(businessId, userId);
  const newId = createDocumentRevision(context.sqlite, revisionConfig, userId, sourceOrderId);
  const rev = context.sqlite.prepare("SELECT order_number, revision_number FROM purchase_orders WHERE id = ?").get(newId) as { order_number: string; revision_number: number } | undefined;
  if (rev) {
    try {
      recordActivity(businessId, {
        userId,
        action: "created",
        entityType: "purchase_order",
        entityId: newId,
        entityNumber: rev.order_number,
        summary: `Created revision ${rev.revision_number} (${rev.order_number}) from purchase order`,
        details: { orderNumber: rev.order_number, revisionNumber: rev.revision_number, sourceOrderId },
        sqlite: context.sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] purchase_order revision failed:", e);
    }
  }
  return newId;
}

export function listPurchaseOrderRevisions(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!current) return [];
  const rootId = current.rootOrderId || current.id;
  const revisions = context.sqlite.prepare(`
    SELECT id, order_number, revision_number, is_latest_revision, status as document_status, total_minor, currency_code, date as order_date, created_at
    FROM purchase_orders
    WHERE root_order_id = ? OR id = ?
    ORDER BY revision_number DESC
  `).all(rootId, rootId) as {
    id: string;
    order_number: string;
    revision_number: number;
    is_latest_revision: number;
    document_status: PurchaseOrderStatus;
    total_minor: number;
    currency_code: string;
    order_date: string;
    created_at: string;
  }[];
  return revisions;
}
