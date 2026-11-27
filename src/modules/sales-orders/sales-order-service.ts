import { assertSavePermission, assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { salesOrderLines, salesOrders, customers } from "@/core/db/business-schema";
import { salesOrderInputSchema, type SalesOrderInput } from "./sales-order-input";
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

export type SalesOrderStatus = "draft" | "active" | "completed" | "cancelled" | "superseded";
export type SalesOrderIntent = "draft" | "issue";

export const salesOrderDocument: TradeDocumentConfig = {
  entityType: "sales_order",
  label: "sales order",
  module: "sales",
  numbering: "salesOrder",
  schema: salesOrderInputSchema,
  table: "sales_orders",
  numberColumn: "order_number",
  statusColumn: "document_status",
  dateColumn: "order_date",
  expected: { column: "delivery_date", field: "expectedDate", empty: "" },
  numberDetailKey: "orderNumber",
  party: { table: "customers", column: "customer_id", field: "customerId", inactiveMessage: "Choose an active customer." },
  lines: {
    table: "sales_order_lines",
    parentColumn: "order_id",
    accountColumn: "sales_account_id",
    accountField: "salesAccountId",
    calculation: { accountTypeFilter: "income", taxDirection: "sales" },
    customFieldEntity: "sales_order_line",
  },
  statuses: { open: "active", closed: "completed" },
  messages: {
    lockedStatuses: ["completed", "cancelled"],
    notEditable: "Closed or cancelled sales orders cannot be edited.",
    issueOnlyDraft: "Only a draft sales order can be activated.",
    closeOnlyOpen: "Only an active sales order can be closed.",
    cancelClosed: "A completed sales order cannot be cancelled.",
  },
  activity: { saveIssueVerb: "Confirmed", issueVerb: "Activated", closeVerb: "Completed", revisionSource: "sales order", revisionSourceIdKey: "sourceOrderId" },
  revision: { headerTable: "sales_orders", lineTable: "sales_order_lines", headerIdColumn: "id", lineHeaderIdColumn: "order_id", documentNumberColumn: "order_number" },
  source: {
    table: "sales_quotes",
    column: "sales_quote_id",
    field: "salesQuoteId",
    invalidParentMessage: "Cannot create a sales order for an accepted or cancelled sales quote.",
  },
};

export function listSalesOrders(
  businessId: string,
  userId: string,
  filters?: { customerId?: string; from?: string; to?: string; onlyLatest?: boolean },
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const { whereClause, params } = buildDocumentListWhere("po", { ...filters, partyId: filters?.customerId }, { party: "customer_id", date: "order_date" });
  const rows = sqlite.prepare(`SELECT po.*,
    po.order_date AS date, po.delivery_date AS expected_date, po.document_status AS documentStatus,
    s.name AS customer_name,
    (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, po.project_id)) FROM sales_order_lines l WHERE l.order_id = po.id) AS project_ids,
    (SELECT COUNT(*) FROM sales_invoices pi WHERE pi.sales_order_id = po.id) AS invoice_count,
    cur.minor_unit AS currency_minor_unit
    FROM sales_orders po INNER JOIN customers s ON s.id = po.customer_id
    INNER JOIN currencies cur ON cur.code = po.currency_code ${whereClause}
    ORDER BY po.order_date DESC, po.created_at DESC`).all(...params) as {
      id: string; order_number: string; customer_id: string; customer_name: string; date: string;
      expected_date: string | null; reference: string | null; notes: string | null;
      documentStatus: SalesOrderStatus; subtotal_minor: number; tax_minor: number; total_minor: number; currency_code: string; currency_minor_unit: number;
      created_by: string; created_at: string; updated_at: string;
      invoice_count: number; project_id: string | null; project_ids: string | null;
    }[];
  return withProjectNames(sqlite, rows);
}

export function getSalesOrder(businessId: string, userId: string, orderId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ order: salesOrders, customer: customers }).from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId)).where(eq(salesOrders.id, orderId)).get();
  if (!header) return null;
  const lines = context.db.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId)).orderBy(asc(salesOrderLines.position)).all();
  const lookups = loadLineLookups(context.sqlite);
  const relatedInvoices = context.sqlite.prepare("SELECT id, invoice_number, document_status, total_minor FROM sales_invoices WHERE sales_order_id = ? ORDER BY created_at DESC").all(orderId) as { id: string; invoice_number: string; document_status: string; total_minor: number }[];
  const goodsReceipts = [] as { id: string; receipt_number: string; date: string; document_status: string }[];
  const linkedQuote = header.order.salesQuoteId
    ? (context.sqlite.prepare("SELECT id, quote_number, document_status FROM sales_quotes WHERE id = ?").get(header.order.salesQuoteId) as { id: string; quote_number: string; document_status: string } | undefined)
    : undefined;
  const customFields = getCustomFieldValuesForEntities(businessId, userId, "sales_order_line", lines.map((l) => l.id));
  return {
    ...header,
    project: header.order.projectId ? lookups.projectById.get(header.order.projectId) ?? null : null,
    // Sales orders are not received; the fields keep the order-line shape shared with purchase orders.
    lines: lines.map((line) => decoratePricedLine(line, lookups, {
      headerProjectId: header.order.projectId,
      customFields,
      accountKey: "salesAccount",
      accountId: line.salesAccountId,
      extra: { receivedMicros: 0, remainingMicros: Math.max(0, line.quantityMicros) },
    })),
    relatedInvoices,
    goodsReceipts,
    linkedQuote,
  };
}

export function saveSalesOrder(businessId: string, userId: string, input: SalesOrderInput, intent: SalesOrderIntent, orderId?: string) {
  assertSavePermission(businessId, userId, "sales", orderId, intent);
  return saveTradeDocument(salesOrderDocument, businessId, userId, input, intent, orderId);
}

export function issueSalesOrder(businessId: string, userId: string, orderId: string) {
  assertMutationPermission(businessId, userId, "sales", "approve");
  issueTradeDocument(salesOrderDocument, businessId, userId, orderId);
}

export function closeSalesOrder(businessId: string, userId: string, orderId: string) {
  assertMutationPermission(businessId, userId, "sales", "edit");
  closeTradeDocument(salesOrderDocument, businessId, userId, orderId);
}

export function cancelSalesOrder(businessId: string, userId: string, orderId: string) {
  assertMutationPermission(businessId, userId, "sales", "delete");
  cancelTradeDocument(salesOrderDocument, businessId, userId, orderId);
}

export function deleteSalesOrder(businessId: string, userId: string, orderId: string) {
  assertMutationPermission(businessId, userId, "sales", "delete");
  deleteTradeDocument(salesOrderDocument, businessId, userId, orderId);
}

export function createSalesOrderRevision(businessId: string, userId: string, sourceOrderId: string): string {
  assertMutationPermission(businessId, userId, "sales", "create");
  return createTradeDocumentRevision(salesOrderDocument, businessId, userId, sourceOrderId);
}

export function listSalesOrderRevisions(businessId: string, userId: string, orderId: string) {
  return listTradeDocumentRevisions(salesOrderDocument, businessId, userId, orderId, "order_date") as {
    id: string;
    order_number: string;
    revision_number: number;
    is_latest_revision: number;
    document_status: SalesOrderStatus;
    total_minor: number;
    currency_code: string;
    order_date: string;
    created_at: string;
  }[];
}
