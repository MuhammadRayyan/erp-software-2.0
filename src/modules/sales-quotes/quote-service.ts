import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { salesQuoteLines, salesQuotes, customers } from "@/core/db/business-schema";
import { salesQuoteInputSchema, type SalesQuoteInput } from "./quote-input";
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

export type SalesQuoteStatus = "draft" | "pending_approval" | "sent" | "accepted" | "rejected" | "superseded" | "cancelled";
export type SalesQuoteIntent = "draft" | "issue";

export const salesQuoteDocument: TradeDocumentConfig = {
  entityType: "sales_quote",
  label: "sales quote",
  module: "sales",
  numbering: "salesQuote",
  schema: salesQuoteInputSchema,
  table: "sales_quotes",
  numberColumn: "quote_number",
  statusColumn: "document_status",
  dateColumn: "quote_date",
  expected: { column: "expiry_date", field: "expectedDate", empty: "" },
  numberDetailKey: "quoteNumber",
  party: { table: "customers", column: "customer_id", field: "customerId", inactiveMessage: "Choose an active customer." },
  lines: {
    table: "sales_quote_lines",
    parentColumn: "quote_id",
    accountColumn: "sales_account_id",
    accountField: "salesAccountId",
    calculation: { accountTypeFilter: "income", taxDirection: "sales" },
    customFieldEntity: "sales_quote_line",
  },
  statuses: { open: "sent", closed: "accepted" },
  messages: {
    lockedStatuses: ["accepted", "cancelled", "superseded"],
    notEditable: "Closed, superseded, or cancelled sales quotes cannot be edited.",
    issueOnlyDraft: "Only a draft sales quote can be issued.",
    closeOnlyOpen: "Only an issued sales quote can be closed.",
    cancelClosed: "An accepted sales quote cannot be cancelled.",
  },
  activity: { saveIssueVerb: "Issued", issueVerb: "Issued", closeVerb: "Accepted / closed", revisionSource: "quote", revisionSourceIdKey: "sourceQuoteId" },
  revision: { headerTable: "sales_quotes", lineTable: "sales_quote_lines", headerIdColumn: "id", lineHeaderIdColumn: "quote_id", documentNumberColumn: "quote_number" },
  newRevisionFamily: true,
};

export function listSalesQuotes(
  businessId: string,
  userId: string,
  filters?: { customerId?: string; from?: string; to?: string; onlyLatest?: boolean },
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const { whereClause, params } = buildDocumentListWhere("po", { ...filters, partyId: filters?.customerId }, { party: "customer_id", date: "quote_date" });
  const rows = sqlite.prepare(`SELECT po.*, s.name AS customer_name,
    po.quote_date AS date, po.expiry_date AS expected_date, po.document_status AS documentStatus,
    COALESCE(po.revision_number, 0) AS revision_number,
    COALESCE(po.is_latest_revision, 1) AS is_latest_revision,
    (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, po.project_id)) FROM sales_quote_lines l WHERE l.quote_id = po.id) AS project_ids,
    (SELECT COUNT(*) FROM sales_invoices pi
     INNER JOIN sales_orders so ON so.id = pi.sales_order_id
     WHERE so.sales_quote_id = po.id) AS invoice_count,
    cur.minor_unit AS currency_minor_unit
    FROM sales_quotes po INNER JOIN customers s ON s.id = po.customer_id
    INNER JOIN currencies cur ON cur.code = po.currency_code ${whereClause}
    ORDER BY po.quote_date DESC, po.created_at DESC`).all(...params) as {
      id: string; quote_number: string; base_quote_number: string | null; root_quote_id: string | null;
      revision_number: number; is_latest_revision: number;
      customer_id: string; customer_name: string; date: string;
      expected_date: string | null; reference: string | null;
      documentStatus: SalesQuoteStatus; subtotal_minor: number; tax_minor: number; total_minor: number; currency_code: string; currency_minor_unit: number;
      created_by: string; created_at: string; updated_at: string;
      invoice_count: number; project_id: string | null; project_ids: string | null;
    }[];
  return withProjectNames(sqlite, rows);
}

export function getSalesQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ quote: salesQuotes, customer: customers }).from(salesQuotes)
    .innerJoin(customers, eq(customers.id, salesQuotes.customerId)).where(eq(salesQuotes.id, quoteId)).get();
  if (!header) return null;
  const lines = context.db.select().from(salesQuoteLines).where(eq(salesQuoteLines.quoteId, quoteId)).orderBy(asc(salesQuoteLines.position)).all();
  const lookups = loadLineLookups(context.sqlite);
  const linkedOrders = context.sqlite
    .prepare("SELECT id, order_number, document_status FROM sales_orders WHERE sales_quote_id = ? ORDER BY created_at DESC")
    .all(quoteId) as { id: string; order_number: string; document_status: string }[];
  const customFields = getCustomFieldValuesForEntities(businessId, userId, "sales_quote_line", lines.map((l) => l.id));
  return {
    ...header,
    project: header.quote.projectId ? lookups.projectById.get(header.quote.projectId) ?? null : null,
    lines: lines.map((line) => decoratePricedLine(line, lookups, { headerProjectId: header.quote.projectId, customFields, accountKey: "salesAccount", accountId: line.salesAccountId })),
    linkedOrders,
  };
}

export function saveSalesQuote(businessId: string, userId: string, input: SalesQuoteInput, intent: SalesQuoteIntent, quoteId?: string) {
  return saveTradeDocument(salesQuoteDocument, businessId, userId, input, intent, quoteId);
}

export function issueSalesQuote(businessId: string, userId: string, quoteId: string) {
  issueTradeDocument(salesQuoteDocument, businessId, userId, quoteId);
}

export function closeSalesQuote(businessId: string, userId: string, quoteId: string) {
  closeTradeDocument(salesQuoteDocument, businessId, userId, quoteId);
}

export function cancelSalesQuote(businessId: string, userId: string, quoteId: string) {
  cancelTradeDocument(salesQuoteDocument, businessId, userId, quoteId);
}

export function deleteSalesQuote(businessId: string, userId: string, quoteId: string) {
  deleteTradeDocument(salesQuoteDocument, businessId, userId, quoteId);
}

export function createSalesQuoteRevision(businessId: string, userId: string, sourceQuoteId: string): string {
  return createTradeDocumentRevision(salesQuoteDocument, businessId, userId, sourceQuoteId);
}

export function listSalesQuoteRevisions(businessId: string, userId: string, quoteId: string) {
  return listTradeDocumentRevisions(salesQuoteDocument, businessId, userId, quoteId, "quote_date") as {
    id: string;
    quote_number: string;
    revision_number: number;
    is_latest_revision: number;
    document_status: SalesQuoteStatus;
    total_minor: number;
    currency_code: string;
    quote_date: string;
    created_at: string;
  }[];
}
