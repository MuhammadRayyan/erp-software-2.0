import { createDocumentRevision, deleteDraftRevision } from "@/core/versioning/revision-engine";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { purchaseQuoteLines, purchaseQuotes, suppliers } from "@/core/db/business-schema";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { purchaseQuoteInputSchema, type PurchaseQuoteInput } from "./purchase-quote-input";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { convertDocumentLinesToBase } from "@/modules/currency/conversion";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";

export type PurchaseQuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "superseded" | "cancelled";
export type PurchaseQuoteIntent = "draft" | "issue";

function insertLines(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], quoteId: string, lines: StoredLine[]) {
  const statement = sqlite.prepare(`INSERT INTO purchase_quote_lines
    (id, quote_id, item_id, description, quantity_micros, unit_price_minor, discount_type, discount_value, expense_account_id,
     tax_code_id, project_id, net_amount_minor, tax_amount_minor, gross_amount_minor, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const line of lines) {
    statement.run(
      line.id,
      quoteId,
      line.itemId,
      line.description,
      line.quantityMicros,
      line.unitPriceMinor,
      line.discountType || "none",
      line.discountValue || "0",
      line.expenseAccountId,
      line.taxCodeId,
      line.projectId,
      line.netAmountMinor,
      line.taxAmountMinor,
      line.grossAmountMinor,
      line.lineIndex,
    );
  }
}

export function listPurchaseQuotes(
  businessId: string,
  userId: string,
  filters?: { supplierId?: string; from?: string; to?: string; onlyLatest?: boolean },
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where: string[] = [];
  const params: string[] = [];
  if (filters?.onlyLatest) {
    where.push("pq.is_latest_revision = 1");
  }
  if (filters?.supplierId) {
    where.push("pq.supplier_id = ?");
    params.push(filters.supplierId);
  }
  if (filters?.from) {
    where.push("pq.quote_date >= ?");
    params.push(filters.from);
  }
  if (filters?.to) {
    where.push("pq.quote_date <= ?");
    params.push(filters.to);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
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
  const projects = sqlite.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project.name]));
  return rows.map((row) => ({
    ...row,
    projectIds: row.project_ids?.split(",").filter(Boolean) ?? [],
    projectNames: (row.project_ids?.split(",").filter(Boolean) ?? []).map((id) => projectById.get(id) ?? id),
  }));
}

export function getPurchaseQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ quote: purchaseQuotes, supplier: suppliers }).from(purchaseQuotes)
    .innerJoin(suppliers, eq(suppliers.id, purchaseQuotes.supplierId)).where(eq(purchaseQuotes.id, quoteId)).get();
  if (!header) return null;
  const lines = context.db.select().from(purchaseQuoteLines).where(eq(purchaseQuoteLines.quoteId, quoteId)).orderBy(asc(purchaseQuoteLines.position)).all();
  const accounts = context.sqlite.prepare("SELECT id, code, name FROM accounts").all() as { id: string; code: string; name: string }[];
  const taxes = context.sqlite.prepare("SELECT id, name, rate_basis_points FROM tax_codes").all() as { id: string; name: string; rate_basis_points: number }[];
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const taxById = new Map(taxes.map((row) => [row.id, row]));
  const projects = context.sqlite.prepare("SELECT id, code, name FROM projects").all() as { id: string; code: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const itemRows = context.sqlite.prepare("SELECT id, sku, name, unit_name FROM inventory_items").all() as { id: string; sku: string | null; name: string; unit_name: string }[];
  const itemById = new Map(itemRows.map((item) => [item.id, item]));

  return {
    ...header,
    project: header.quote.projectId ? projectById.get(header.quote.projectId) ?? null : null,
    lines: lines.map((line) => ({
      ...line,
      item: line.itemId ? itemById.get(line.itemId) ?? null : null,
      expenseAccount: line.expenseAccountId ? accountById.get(line.expenseAccountId) ?? null : null,
      taxCode: taxById.get(line.taxCodeId) ?? null,
      project: effectiveProjectId(line.projectId, header.quote.projectId) ? projectById.get(effectiveProjectId(line.projectId, header.quote.projectId)!) ?? null : null,
    })),
  };
}

export function savePurchaseQuote(businessId: string, userId: string, input: PurchaseQuoteInput, intent: PurchaseQuoteIntent, quoteId?: string) {
  const data = purchaseQuoteInputSchema.parse(input);
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
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, {
    accountTypeFilter: "expense",
    taxDirection: "purchases",
    supportItems: true,
    accountFieldOnLine: "expenseAccountId",
    amountsIncludeTax: data.amountsIncludeTax,
  });
  const amounts = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  const now = new Date().toISOString();
  const id = quoteId ?? randomUUID();

  context.sqlite.transaction(() => {
    if (quoteId) {
      const current = context.db.select().from(purchaseQuotes).where(eq(purchaseQuotes.id, quoteId)).get();
      if (!current) throw new Error("Purchase quote not found.");
      if (current.documentStatus === "accepted" || current.documentStatus === "cancelled" || current.documentStatus === "superseded") {
        throw new Error("Closed, superseded, or cancelled purchase quotes cannot be edited.");
      }
      const nextStatus = current.documentStatus === "sent" || intent === "issue" ? "sent" : "draft";
      context.sqlite.prepare(`
        UPDATE purchase_quotes SET
          supplier_id = ?, project_id = ?, quote_date = ?, expiry_date = ?, reference = ?,
          document_status = ?, amounts_include_tax = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?,
          currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?,
          base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, notes = ?, terms = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.supplierId,
        data.projectId || null,
        data.date,
        data.expiryDate || "",
        data.reference || null,
        nextStatus,
        data.amountsIncludeTax ? 1 : 0,
        amounts.subtotalMinor,
        amounts.taxMinor,
        amounts.totalMinor,
        rate.currencyCode,
        rate.exchangeRateToBase,
        rate.exchangeRateDate,
        rate.exchangeRateSource,
        base.baseSubtotalMinor,
        base.baseTaxMinor,
        base.baseTotalMinor,
        data.notes || null,
        data.terms || null,
        now,
        quoteId,
      );
      context.sqlite.prepare("DELETE FROM purchase_quote_lines WHERE quote_id = ?").run(quoteId);
    } else {
      const quoteNumber = allocateNumber(context.sqlite, "purchaseQuote");
      const status = intent === "issue" ? "sent" : "draft";
      context.sqlite.prepare(`
        INSERT INTO purchase_quotes (
          id, quote_number, base_quote_number, root_quote_id, revision_number, is_latest_revision,
          supplier_id, project_id, quote_date, expiry_date, reference, document_status,
          amounts_include_tax, subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor, notes, terms,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        quoteNumber,
        quoteNumber,
        id,
        data.supplierId,
        data.projectId || null,
        data.date,
        data.expiryDate || "",
        data.reference || null,
        status,
        data.amountsIncludeTax ? 1 : 0,
        amounts.subtotalMinor,
        amounts.taxMinor,
        amounts.totalMinor,
        rate.currencyCode,
        rate.exchangeRateToBase,
        rate.exchangeRateDate,
        rate.exchangeRateSource,
        base.baseSubtotalMinor,
        base.baseTaxMinor,
        base.baseTotalMinor,
        data.notes || null,
        data.terms || null,
        userId,
        now,
        now,
      );
    }
    insertLines(context.sqlite, id, lines);
  }).immediate();
  return id;
}

export function closePurchaseQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const quote = context.db.select().from(purchaseQuotes).where(eq(purchaseQuotes.id, quoteId)).get();
  if (!quote) throw new Error("Purchase quote not found.");
  if (quote.documentStatus !== "sent") throw new Error("Only an issued purchase quote can be accepted.");
  const now = new Date().toISOString();
  context.db.update(purchaseQuotes).set({ documentStatus: "accepted", updatedAt: now }).where(eq(purchaseQuotes.id, quoteId)).run();
}

export function cancelPurchaseQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const quote = context.db.select().from(purchaseQuotes).where(eq(purchaseQuotes.id, quoteId)).get();
  if (!quote) throw new Error("Purchase quote not found.");
  if (quote.documentStatus === "cancelled") throw new Error("Purchase quote has already been cancelled.");
  if (quote.documentStatus === "accepted") throw new Error("An accepted purchase quote cannot be cancelled.");
  const now = new Date().toISOString();
  context.db.update(purchaseQuotes).set({ documentStatus: "cancelled", updatedAt: now }).where(eq(purchaseQuotes.id, quoteId)).run();
}

const revisionConfig = {
  headerTable: "purchase_quotes",
  lineTable: "purchase_quote_lines",
  headerIdColumn: "id",
  lineHeaderIdColumn: "quote_id",
  documentNumberColumn: "quote_number",
};

export function deletePurchaseQuote(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  deleteDraftRevision(context.sqlite, revisionConfig, quoteId);
}

export function createPurchaseQuoteRevision(businessId: string, userId: string, sourceQuoteId: string): string {
  const context = getBusinessDb(businessId, userId);
  return createDocumentRevision(context.sqlite, revisionConfig, userId, sourceQuoteId);
}

export function listPurchaseQuoteRevisions(businessId: string, userId: string, quoteId: string) {
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(purchaseQuotes).where(eq(purchaseQuotes.id, quoteId)).get();
  if (!current) return [];
  const rootId = current.rootQuoteId || current.id;
  const revisions = context.sqlite.prepare(`
    SELECT id, quote_number, revision_number, is_latest_revision, document_status, total_minor, currency_code, quote_date, created_at
    FROM purchase_quotes
    WHERE root_quote_id = ? OR id = ?
    ORDER BY revision_number DESC
  `).all(rootId, rootId) as {
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
  return revisions;
}
