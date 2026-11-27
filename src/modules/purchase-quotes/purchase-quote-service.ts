import { assertSavePermission, assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { purchaseQuoteLines, purchaseQuotes, suppliers } from "@/core/db/business-schema";
import { purchaseQuoteInputSchema, type PurchaseQuoteInput } from "./purchase-quote-input";
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

export type PurchaseQuoteStatus = "draft" | "pending_approval" | "sent" | "accepted" | "rejected" | "superseded" | "cancelled";
export type PurchaseQuoteIntent = "draft" | "issue";

export const purchaseQuoteDocument: TradeDocumentConfig = {
  entityType: "purchase_quote",
  label: "purchase quote",
  module: "purchases",
  numbering: "purchaseQuote",
  schema: purchaseQuoteInputSchema,
  table: "purchase_quotes",
  numberColumn: "quote_number",
  statusColumn: "document_status",
  dateColumn: "quote_date",
  expected: { column: "expiry_date", field: "expiryDate", empty: "" },
  numberDetailKey: "quoteNumber",
  party: { table: "suppliers", column: "supplier_id", field: "supplierId", inactiveMessage: "Choose an active supplier." },
  lines: {
    table: "purchase_quote_lines",
    parentColumn: "quote_id",
    accountColumn: "expense_account_id",
    accountField: "expenseAccountId",
    calculation: { accountTypeFilter: "expense", taxDirection: "purchases" },
    customFieldEntity: "purchase_quote_line",
  },
  statuses: { open: "sent", closed: "accepted" },
  messages: {
    lockedStatuses: ["accepted", "cancelled", "superseded"],
    notEditable: "Closed, superseded, or cancelled purchase quotes cannot be edited.",
    issueOnlyDraft: "Only a draft purchase quote can be issued.",
    closeOnlyOpen: "Only an issued purchase quote can be accepted.",
    cancelClosed: "An accepted purchase quote cannot be cancelled.",
  },
  activity: { saveIssueVerb: "Issued", issueVerb: "Issued", closeVerb: "Accepted / closed", revisionSource: "purchase quote", revisionSourceIdKey: "sourceQuoteId" },
  revision: { headerTable: "purchase_quotes", lineTable: "purchase_quote_lines", headerIdColumn: "id", lineHeaderIdColumn: "quote_id", documentNumberColumn: "quote_number" },
  newRevisionFamily: true,
};

export function listPurchaseQuotes(
  businessId: string,
  userId: string,
  filters?: { supplierId?: string; from?: string; to?: string; onlyLatest?: boolean },
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const { whereClause, params } = buildDocumentListWhere("pq", { ...filters, partyId: filters?.supplierId }, { party: "supplier_id", date: "quote_date" });
  const rows = sqlite.prepare(`SELECT pq.*, s.name AS supplier_name,
    pq.quote_date AS date, pq.expiry_date AS expected_date, pq.document_status AS documentStatus,
    COALESCE(pq.revision_number, 0) AS revision_number,
    COALESCE(pq.is_latest_revision, 1) AS is_latest_revision,
    (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, pq.project_id)) FROM purchase_quote_lines l WHERE l.quote_id = pq.id) AS project_ids,
    (SELECT COUNT(*) FROM purchase_orders po WHERE po.purchase_quote_id = pq.id) AS order_count,
    cur.minor_unit AS currency_minor_unit
    FROM purchase_quotes pq INNER JOIN suppliers s ON s.id = pq.supplier_id
    INNER JOIN currencies cur ON cur.code = pq.currency_code ${whereClause}
    ORDER BY pq.quote_date DESC, pq.created_at DESC`).all(...params) as {
      id: string; quote_number: string; base_quote_number: string | null; root_quote_id: string | null;
      revision_number: number; is_latest_revision: number;
      supplier_id: string; supplier_name: string; date: string;
      expected_date: string | null; reference: string | null;
      documentStatus: PurchaseQuoteStatus; subtotal_minor: number; tax_minor: number; total_minor: number; currency_code: string; currency_minor_unit: number;
      created_by: string; created_at: string; updated_at: string;
      order_count: number; project_id: string | null; project_ids: string | null;
    }[];
  return withProjectNames(sqlite, rows);
}

export function getPurchaseQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ quote: purchaseQuotes, supplier: suppliers }).from(purchaseQuotes)
    .innerJoin(suppliers, eq(suppliers.id, purchaseQuotes.supplierId)).where(eq(purchaseQuotes.id, quoteId)).get();
  if (!header) return null;
  const lines = context.db.select().from(purchaseQuoteLines).where(eq(purchaseQuoteLines.quoteId, quoteId)).orderBy(asc(purchaseQuoteLines.position)).all();
  const lookups = loadLineLookups(context.sqlite);
  const linkedOrders = context.sqlite
    .prepare("SELECT id, order_number, status FROM purchase_orders WHERE purchase_quote_id = ? ORDER BY created_at DESC")
    .all(quoteId) as { id: string; order_number: string; status: string }[];
  const customFields = getCustomFieldValuesForEntities(businessId, userId, "purchase_quote_line", lines.map((l) => l.id));
  return {
    ...header,
    project: header.quote.projectId ? lookups.projectById.get(header.quote.projectId) ?? null : null,
    lines: lines.map((line) => decoratePricedLine(line, lookups, { headerProjectId: header.quote.projectId, customFields, accountKey: "expenseAccount", accountId: line.expenseAccountId })),
    linkedOrders,
  };
}

export function savePurchaseQuote(businessId: string, userId: string, input: PurchaseQuoteInput, intent: PurchaseQuoteIntent, quoteId?: string) {
  assertSavePermission(businessId, userId, "purchases", quoteId, intent);
  return saveTradeDocument(purchaseQuoteDocument, businessId, userId, input, intent, quoteId);
}

export function issuePurchaseQuote(businessId: string, userId: string, quoteId: string) {
  assertMutationPermission(businessId, userId, "purchases", "approve");
  issueTradeDocument(purchaseQuoteDocument, businessId, userId, quoteId);
}

export function closePurchaseQuote(businessId: string, userId: string, quoteId: string) {
  assertMutationPermission(businessId, userId, "purchases", "edit");
  closeTradeDocument(purchaseQuoteDocument, businessId, userId, quoteId);
}

export function cancelPurchaseQuote(businessId: string, userId: string, quoteId: string) {
  assertMutationPermission(businessId, userId, "purchases", "delete");
  cancelTradeDocument(purchaseQuoteDocument, businessId, userId, quoteId);
}

export function deletePurchaseQuote(businessId: string, userId: string, quoteId: string) {
  assertMutationPermission(businessId, userId, "purchases", "delete");
  deleteTradeDocument(purchaseQuoteDocument, businessId, userId, quoteId);
}

export function createPurchaseQuoteRevision(businessId: string, userId: string, sourceQuoteId: string): string {
  assertMutationPermission(businessId, userId, "purchases", "create");
  return createTradeDocumentRevision(purchaseQuoteDocument, businessId, userId, sourceQuoteId);
}

export function listPurchaseQuoteRevisions(businessId: string, userId: string, quoteId: string) {
  return listTradeDocumentRevisions(purchaseQuoteDocument, businessId, userId, quoteId, "quote_date") as {
    id: string;
    quote_number: string;
    revision_number: number;
    is_latest_revision: number;
    document_status: PurchaseQuoteStatus;
    total_minor: number;
    currency_code: string;
    quote_date: string;
    created_at: string;
  }[];
}
