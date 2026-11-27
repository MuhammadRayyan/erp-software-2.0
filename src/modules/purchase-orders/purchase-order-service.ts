import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { purchaseOrderLines, purchaseOrders, suppliers } from "@/core/db/business-schema";
import { purchaseOrderInputSchema, type PurchaseOrderInput } from "./purchase-order-input";
import { getCustomFieldValuesForEntities } from "@/modules/custom-fields/custom-field-service";
import { buildDocumentListWhere, decoratePricedLine, loadLineLookups, withProjectNames } from "@/modules/documents/engine/document-sql";
import {
  cancelTradeDocument,
  closeTradeDocument,
  createTradeDocumentRevision,
  deleteTradeDocument,
  issueTradeDocument,
  listTradeDocumentRevisions,
  saveTradeDocument,
  type TradeDocumentConfig,
} from "@/modules/documents/engine/trade-document-engine";

export type PurchaseOrderStatus = "draft" | "pending_approval" | "issued" | "closed" | "cancelled" | "superseded";
export type PurchaseOrderIntent = "draft" | "submit_approval" | "issue";

export const purchaseOrderDocument: TradeDocumentConfig = {
  entityType: "purchase_order",
  label: "purchase order",
  module: "purchases",
  numbering: "purchaseOrder",
  schema: purchaseOrderInputSchema,
  table: "purchase_orders",
  numberColumn: "order_number",
  statusColumn: "status",
  dateColumn: "date",
  expected: { column: "expected_date", field: "expectedDate", empty: null },
  numberDetailKey: "orderNumber",
  party: { table: "suppliers", column: "supplier_id", field: "supplierId", inactiveMessage: "Choose an active supplier." },
  lines: {
    table: "purchase_order_lines",
    parentColumn: "purchase_order_id",
    accountColumn: "expense_account_id",
    accountField: "expenseAccountId",
    calculation: { accountTypeFilter: "expense", taxDirection: "purchases" },
    customFieldEntity: "purchase_order_line",
  },
  statuses: { open: "issued", closed: "closed" },
  messages: {
    lockedStatuses: ["closed", "cancelled"],
    notEditable: "Closed or cancelled purchase orders cannot be edited.",
    issueOnlyDraft: "Only a draft purchase order can be issued.",
    closeOnlyOpen: "Only an issued purchase order can be closed.",
    cancelClosed: "A closed purchase order cannot be cancelled.",
  },
  activity: { saveIssueVerb: "Issued", issueVerb: "Issued", closeVerb: "Closed", revisionSource: "purchase order", revisionSourceIdKey: "sourceOrderId" },
  revision: {
    headerTable: "purchase_orders",
    lineTable: "purchase_order_lines",
    headerIdColumn: "id",
    lineHeaderIdColumn: "purchase_order_id",
    documentNumberColumn: "order_number",
    statusColumn: "status",
  },
  timestamps: { issued: "issued_at", closed: "closed_at", cancelled: "cancelled_at" },
  approval: { entityType: "purchase_order", pendingStatus: "pending_approval" },
  source: {
    table: "purchase_quotes",
    column: "purchase_quote_id",
    field: "purchaseQuoteId",
    invalidParentMessage: "Cannot create a purchase order for an accepted or cancelled purchase quote.",
  },
  assertEditable(sqlite, current, orderId, options) {
    if (current.status === "pending_approval" && !options?.bypassApprovalPolicy) {
      throw new Error("This purchase order is pending approval. Withdraw or reject it to draft before editing.");
    }
    if (sqlite.prepare("SELECT 1 FROM goods_receipts WHERE purchase_order_id = ? LIMIT 1").get(orderId)) {
      throw new Error("A Purchase Order cannot be edited after a Goods Receipt has been created.");
    }
  },
  assertRevisable(sqlite, orderId) {
    const source = sqlite.prepare("SELECT status FROM purchase_orders WHERE id = ?").get(orderId) as { status: string } | undefined;
    if (source?.status === "pending_approval") {
      throw new Error("This purchase order is pending approval. Withdraw or reject it to draft before creating a revision.");
    }
  },
};

export function listPurchaseOrders(
  businessId: string,
  userId: string,
  filters?: { supplierId?: string; from?: string; to?: string }
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const { whereClause, params } = buildDocumentListWhere("po", { ...filters, partyId: filters?.supplierId }, { party: "supplier_id", date: "date" });
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
  return withProjectNames(sqlite, rows);
}

export function getPurchaseOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ order: purchaseOrders, supplier: suppliers }).from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).where(eq(purchaseOrders.id, orderId)).get();
  if (!header) return null;
  const lines = context.db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, orderId)).orderBy(asc(purchaseOrderLines.position)).all();
  const lookups = loadLineLookups(context.sqlite);
  const relatedInvoices = context.sqlite.prepare("SELECT id, internal_number, document_status, total_minor FROM purchase_invoices WHERE purchase_order_id = ? ORDER BY created_at DESC").all(orderId) as { id: string; internal_number: string; document_status: string; total_minor: number }[];
  const receivedRows = context.sqlite.prepare(`SELECT grl.purchase_order_line_id AS line_id, SUM(grl.quantity_micros) AS received_micros FROM goods_receipt_lines grl INNER JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id AND gr.document_status = 'posted' WHERE gr.purchase_order_id = ? GROUP BY grl.purchase_order_line_id`).all(orderId) as { line_id: string; received_micros: number }[];
  const receivedByLine = new Map(receivedRows.map((row) => [row.line_id, row.received_micros]));
  const goodsReceipts = context.sqlite.prepare("SELECT id, receipt_number, date, document_status FROM goods_receipts WHERE purchase_order_id = ? ORDER BY date DESC, created_at DESC").all(orderId) as { id: string; receipt_number: string; date: string; document_status: string }[];
  const linkedQuote = header.order.purchaseQuoteId
    ? (context.sqlite.prepare("SELECT id, quote_number, document_status FROM purchase_quotes WHERE id = ?").get(header.order.purchaseQuoteId) as { id: string; quote_number: string; document_status: string } | undefined)
    : undefined;
  const customFields = getCustomFieldValuesForEntities(businessId, userId, "purchase_order_line", lines.map((l) => l.id));
  return {
    ...header,
    project: header.order.projectId ? lookups.projectById.get(header.order.projectId) ?? null : null,
    lines: lines.map((line) => {
      const receivedMicros = receivedByLine.get(line.id) ?? 0;
      return decoratePricedLine(line, lookups, {
        headerProjectId: header.order.projectId,
        customFields,
        accountKey: "expenseAccount",
        accountId: line.expenseAccountId,
        extra: { receivedMicros, remainingMicros: Math.max(0, line.quantityMicros - receivedMicros) },
      });
    }),
    relatedInvoices,
    goodsReceipts,
    linkedQuote,
  };
}

export function savePurchaseOrder(
  businessId: string,
  userId: string,
  input: PurchaseOrderInput,
  intent: PurchaseOrderIntent,
  orderId?: string,
  options?: { bypassApprovalPolicy?: boolean },
) {
  return saveTradeDocument(purchaseOrderDocument, businessId, userId, input, intent, orderId, options);
}

export function issuePurchaseOrder(
  businessId: string,
  userId: string,
  orderId: string,
  intent: "issue" | "submit_approval" = "issue",
): PurchaseOrderStatus {
  return issueTradeDocument(purchaseOrderDocument, businessId, userId, orderId, intent) as PurchaseOrderStatus;
}

export function issuePendingPurchaseOrder(businessId: string, userId: string, orderId: string) {
  assertMutationPermission(businessId, userId, "purchases", "approve");
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.status === "issued") return;
  if (order.status !== "pending_approval" && order.status !== "draft") {
    throw new Error(`Cannot issue purchase order in "${order.status}" status.`);
  }
  const now = new Date().toISOString();
  context.db
    .update(purchaseOrders)
    .set({ status: "issued", issuedAt: now, updatedAt: now })
    .where(eq(purchaseOrders.id, orderId))
    .run();
}

export function revertPurchaseOrderToDraft(businessId: string, userId: string, orderId: string) {
  assertMutationPermission(businessId, userId, "purchases", "approve");
  const context = getBusinessDb(businessId, userId);
  const order = context.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!order) throw new Error("Purchase order not found.");
  if (order.status !== "pending_approval") {
    throw new Error(`Cannot return purchase order in "${order.status}" status to draft.`);
  }
  context.db
    .update(purchaseOrders)
    .set({ status: "draft", updatedAt: new Date().toISOString() })
    .where(eq(purchaseOrders.id, orderId))
    .run();
}

export function closePurchaseOrder(businessId: string, userId: string, orderId: string) {
  closeTradeDocument(purchaseOrderDocument, businessId, userId, orderId);
}

export function cancelPurchaseOrder(businessId: string, userId: string, orderId: string) {
  cancelTradeDocument(purchaseOrderDocument, businessId, userId, orderId);
}

export function deletePurchaseOrder(businessId: string, userId: string, orderId: string) {
  deleteTradeDocument(purchaseOrderDocument, businessId, userId, orderId);
}

export function createPurchaseOrderRevision(businessId: string, userId: string, sourceOrderId: string): string {
  return createTradeDocumentRevision(purchaseOrderDocument, businessId, userId, sourceOrderId);
}

export function listPurchaseOrderRevisions(businessId: string, userId: string, orderId: string) {
  return listTradeDocumentRevisions(purchaseOrderDocument, businessId, userId, orderId, "order_date") as {
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
}
