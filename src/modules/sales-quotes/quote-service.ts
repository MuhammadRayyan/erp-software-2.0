import { createDocumentRevision, deleteDraftRevision } from "@/core/versioning/revision-engine";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { salesQuoteLines, salesQuotes, customers } from "@/core/db/business-schema";
;
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { salesQuoteInputSchema, type SalesQuoteInput } from "./quote-input";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { convertDocumentLinesToBase} from "@/modules/currency/conversion";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";
import { recordActivity } from "@/modules/activity-log/activity-log-service";

export type SalesQuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "superseded" | "cancelled";
export type SalesQuoteIntent = "draft" | "issue";


import { drizzle } from "drizzle-orm/better-sqlite3";
import * as businessSchema from "@/core/db/business-schema";

function insertLines(
  dbOrSqlite: ReturnType<typeof getBusinessDb>["db"] | ReturnType<typeof getBusinessDb>["sqlite"],
  quoteId: string,
  lines: StoredLine[],
) {
  if (lines.length === 0) return;
  const db = "insert" in dbOrSqlite ? dbOrSqlite : drizzle(dbOrSqlite, { schema: businessSchema });
  const linesArray = lines.map((line) => ({
    id: line.id,
    quoteId,
    description: line.description,
    quantityMicros: line.quantityMicros,
    unitPriceMinor: line.unitPriceMinor,
    discountType: (line.discountType as "none" | "percentage" | "fixed") || "none",
    discountValue: line.discountValue || "0",
    salesAccountId: line.salesAccountId,
    taxCodeId: line.taxCodeId,
    projectId: line.projectId || null,
    itemId: line.itemId || null,
    netAmountMinor: line.netAmountMinor,
    taxAmountMinor: line.taxAmountMinor,
    grossAmountMinor: line.grossAmountMinor,
    position: line.lineIndex,
  }));
  db.insert(salesQuoteLines).values(linesArray).run();
}


export function listSalesQuotes(
  businessId: string,
  userId: string,
  filters?: { customerId?: string; from?: string; to?: string; onlyLatest?: boolean },
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where: string[] = [];
  const params: string[] = [];
  if (filters?.onlyLatest) {
    where.push("po.is_latest_revision = 1");
  }
  if (filters?.customerId) {
    where.push("po.customer_id = ?");
    params.push(filters.customerId);
  }
  if (filters?.from) {
    where.push("po.quote_date >= ?");
    params.push(filters.from);
  }
  if (filters?.to) {
    where.push("po.quote_date <= ?");
    params.push(filters.to);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
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
  const accounts = context.sqlite.prepare("SELECT id, name FROM accounts").all() as { id: string; name: string }[];
  const taxes = context.sqlite.prepare("SELECT id, name, rate_basis_points FROM tax_codes").all() as { id: string; name: string; rate_basis_points: number }[];
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const taxById = new Map(taxes.map((row) => [row.id, row]));
  const projects = context.sqlite.prepare("SELECT id, code, name FROM projects").all() as { id: string; code: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const itemRows = context.sqlite.prepare("SELECT id, sku, name, unit_name FROM inventory_items").all() as { id: string; sku: string | null; name: string; unit_name: string }[];
  const itemById = new Map(itemRows.map((item) => [item.id, item]));
  const linkedOrders = context.sqlite
    .prepare("SELECT id, order_number, document_status FROM sales_orders WHERE sales_quote_id = ? ORDER BY created_at DESC")
    .all(quoteId) as { id: string; order_number: string; document_status: string }[];
  return { ...header, project: header.quote.projectId ? projectById.get(header.quote.projectId) ?? null : null, lines: lines.map((line) => ({ ...line, item: line.itemId ? itemById.get(line.itemId) ?? null : null, salesAccount: line.salesAccountId ? accountById.get(line.salesAccountId) ?? null : null, taxCode: taxById.get(line.taxCodeId) ?? null, project: effectiveProjectId(line.projectId, header.quote.projectId) ? projectById.get(effectiveProjectId(line.projectId, header.quote.projectId)!) ?? null : null })), linkedOrders };
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
  let recordedNumber = "";
  context.sqlite.transaction(() => {
    if (quoteId) {
      const current = context.db.select().from(salesQuotes).where(eq(salesQuotes.id, quoteId)).get();
      if (!current) throw new Error("Sales quote not found.");
      if (current.documentStatus === "accepted" || current.documentStatus === "cancelled" || current.documentStatus === "superseded") {
        throw new Error("Closed, superseded, or cancelled sales quotes cannot be edited.");
      }
      recordedNumber = current.quoteNumber;
      const nextStatus = current.documentStatus === "sent" || intent === "issue" ? "sent" : "draft";
      context.sqlite.prepare(`UPDATE sales_quotes SET customer_id = ?, project_id = ?, quote_date = ?, expiry_date = ?, reference = ?, document_status = ?, amounts_include_tax = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, notes = ?, terms = ?, updated_at = ? WHERE id = ?`)
        .run(data.customerId, data.projectId || null, data.date, data.expectedDate || "", data.reference || null, nextStatus, data.amountsIncludeTax ? 1 : 0, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, data.notes || null, data.terms || null, now, quoteId);
      context.sqlite.prepare("DELETE FROM sales_quote_lines WHERE quote_id = ?").run(quoteId);
    } else {
      const quoteNumber = allocateNumber(context.sqlite, "salesQuote");
      recordedNumber = quoteNumber;
      const status = intent === "issue" ? "sent" : "draft";
      context.sqlite.prepare(`INSERT INTO sales_quotes (id, quote_number, base_quote_number, root_quote_id, revision_number, is_latest_revision, customer_id, project_id, quote_date, expiry_date, reference, document_status, amounts_include_tax, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, notes, terms, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, quoteNumber, quoteNumber, id, data.customerId, data.projectId || null, data.date, data.expectedDate || "", data.reference || null, status, data.amountsIncludeTax ? 1 : 0, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, data.notes || null, data.terms || null, userId, now, now);
    }
    insertLines(context.db, id, lines);
  }).immediate();

  try {
    recordActivity(businessId, {
      userId,
      action: quoteId ? (intent === "issue" ? "posted" : "updated") : (intent === "issue" ? "posted" : "created"),
      entityType: "sales_quote",
      entityId: id,
      entityNumber: recordedNumber,
      summary: `${quoteId ? (intent === "issue" ? "Issued" : "Updated") : (intent === "issue" ? "Issued" : "Created")} sales quote ${recordedNumber}`,
      details: { quoteNumber: recordedNumber, totalMinor: amounts.totalMinor, currency: rate.currencyCode, customerId: data.customerId },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] sales_quote save failed:", e);
  }

  return id;
}

export function closeSalesQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const quote = context.db.select().from(salesQuotes).where(eq(salesQuotes.id, quoteId)).get();
  if (!quote) throw new Error("Sales quote not found.");
  if (quote.documentStatus !== "sent") throw new Error("Only an issued sales quote can be closed.");
  const now = new Date().toISOString();
  context.db.update(salesQuotes).set({ documentStatus: "accepted", updatedAt: now }).where(eq(salesQuotes.id, quoteId)).run();

  try {
    recordActivity(businessId, {
      userId,
      action: "posted",
      entityType: "sales_quote",
      entityId: quoteId,
      entityNumber: quote.quoteNumber,
      summary: `Accepted / closed sales quote ${quote.quoteNumber}`,
      details: { quoteNumber: quote.quoteNumber, previousStatus: quote.documentStatus, newStatus: "accepted" },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] sales_quote close failed:", e);
  }
}

export function cancelSalesQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const quote = context.db.select().from(salesQuotes).where(eq(salesQuotes.id, quoteId)).get();
  if (!quote) throw new Error("Sales quote not found.");
  if (quote.documentStatus === "cancelled") throw new Error("Sales quote has already been cancelled.");
  if (quote.documentStatus === "accepted") throw new Error("An accepted sales quote cannot be cancelled.");
  const now = new Date().toISOString();
  context.db.update(salesQuotes).set({ documentStatus: "cancelled", updatedAt: now }).where(eq(salesQuotes.id, quoteId)).run();

  try {
    recordActivity(businessId, {
      userId,
      action: "voided",
      entityType: "sales_quote",
      entityId: quoteId,
      entityNumber: quote.quoteNumber,
      summary: `Cancelled sales quote ${quote.quoteNumber}`,
      details: { quoteNumber: quote.quoteNumber, previousStatus: quote.documentStatus, newStatus: "cancelled" },
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] sales_quote cancel failed:", e);
  }
}

const revisionConfig = {
  headerTable: "sales_quotes",
  lineTable: "sales_quote_lines",
  headerIdColumn: "id",
  lineHeaderIdColumn: "quote_id",
  documentNumberColumn: "quote_number",
};

export function deleteSalesQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const quote = context.sqlite.prepare("SELECT quote_number FROM sales_quotes WHERE id = ?").get(quoteId) as { quote_number: string } | undefined;
  deleteDraftRevision(context.sqlite, revisionConfig, quoteId);

  if (quote) {
    try {
      recordActivity(businessId, {
        userId,
        action: "deleted",
        entityType: "sales_quote",
        entityId: quoteId,
        entityNumber: quote.quote_number,
        summary: `Deleted draft sales quote ${quote.quote_number}`,
        sqlite: context.sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] sales_quote delete failed:", e);
    }
  }
}

export function createSalesQuoteRevision(businessId: string, userId: string, sourceQuoteId: string): string {
  const context = getBusinessDb(businessId, userId);
  const newId = createDocumentRevision(context.sqlite, revisionConfig, userId, sourceQuoteId);
  const rev = context.sqlite.prepare("SELECT quote_number, revision_number FROM sales_quotes WHERE id = ?").get(newId) as { quote_number: string; revision_number: number } | undefined;
  if (rev) {
    try {
      recordActivity(businessId, {
        userId,
        action: "created",
        entityType: "sales_quote",
        entityId: newId,
        entityNumber: rev.quote_number,
        summary: `Created revision ${rev.revision_number} (${rev.quote_number}) from quote`,
        details: { quoteNumber: rev.quote_number, revisionNumber: rev.revision_number, sourceQuoteId },
        sqlite: context.sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] sales_quote revision failed:", e);
    }
  }
  return newId;
}

export function listSalesQuoteRevisions(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(salesQuotes).where(eq(salesQuotes.id, quoteId)).get();
  if (!current) return [];
  const rootId = current.rootQuoteId || current.id;
  const revisions = context.sqlite.prepare(`
    SELECT id, quote_number, revision_number, is_latest_revision, document_status, total_minor, currency_code, quote_date, created_at
    FROM sales_quotes
    WHERE root_quote_id = ? OR id = ?
    ORDER BY revision_number DESC
  `).all(rootId, rootId) as {
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
  return revisions;
}
