import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { customers, salesCreditNoteLines, salesCreditNotes, salesInvoices } from "@/core/db/business-schema";
import {     quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { postCreditNote } from "@/modules/accounting/services/credit-note-posting-service";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { effectiveProjectId, validateProjectReferences } from "@/modules/projects/project-validation";
import { replaceTaxEntries, reverseTaxEntries } from "@/modules/tax/tax-entry-service";
import { assertVatDateUnlocked, assertVatSourceUnlocked } from "@/modules/tax/tax-lock-service";
import { assertDateNotLocked } from "@/modules/accounting/services/financial-lock-service";
import { creditNoteInputSchema, type CreditNoteInput } from "./credit-note-input";
import { convertDocumentLinesToBase, minorToCurrencyInput,  proportionalCarryingRelease } from "@/modules/currency/conversion";
import { storedRateSnapshot } from "@/modules/currency/validation";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";
import { recordActivity } from "@/modules/activity-log/activity-log-service";

export type CreditNoteStatus = "draft" | "posted" | "void";
export type CreditNoteIntent = "draft" | "post";
function receiptTotal(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string) {
  return (sqlite.prepare(`SELECT COALESCE(SUM(ra.amount_minor), 0) AS amount FROM receipt_allocations ra INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted' WHERE ra.sales_invoice_id = ?`).get(invoiceId) as { amount: number }).amount;
}

function creditTotal(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string, excludeNoteId?: string) {
  const values = excludeNoteId ? [invoiceId, excludeNoteId] : [invoiceId];
  return (sqlite.prepare(`SELECT COALESCE(SUM(scna.amount_minor), 0) AS amount FROM sales_credit_note_allocations scna INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted' WHERE scna.sales_invoice_id = ?${excludeNoteId ? " AND scn.id <> ?" : ""}`).get(...values) as { amount: number }).amount;
}

function remainingBaseCarrying(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string, excludeNoteId?: string) {
  const invoice = sqlite.prepare("SELECT base_total_minor FROM sales_invoices WHERE id = ?").get(invoiceId) as { base_total_minor: number };
  const receipts = (sqlite.prepare(`
    SELECT COALESCE(SUM(ra.base_carrying_amount_released), 0) AS amount
    FROM receipt_allocations ra INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
    WHERE ra.sales_invoice_id = ?
  `).get(invoiceId) as { amount: number }).amount;
  const values = excludeNoteId ? [invoiceId, excludeNoteId] : [invoiceId];
  const credits = (sqlite.prepare(`
    SELECT COALESCE(SUM(scna.base_carrying_amount_released), 0) AS amount
    FROM sales_credit_note_allocations scna
    INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
    WHERE scna.sales_invoice_id = ?${excludeNoteId ? " AND scn.id <> ?" : ""}
  `).get(...values) as { amount: number }).amount;
  return Math.max(0, invoice.base_total_minor - receipts - credits);
}

export function remainingInvoiceBalance(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string, excludeNoteId?: string) {
  const invoice = sqlite.prepare("SELECT total_minor FROM sales_invoices WHERE id = ? AND document_status = 'posted'").get(invoiceId) as { total_minor: number } | undefined;
  if (!invoice) return 0;
  return Math.max(0, invoice.total_minor - receiptTotal(sqlite, invoiceId) - creditTotal(sqlite, invoiceId, excludeNoteId));
}

export function getRemainingInvoiceBalance(businessId: string, userId: string, invoiceId: string, excludeNoteId?: string) {
  return remainingInvoiceBalance(getBusinessDb(businessId, userId).sqlite, invoiceId, excludeNoteId);
}


import { drizzle } from "drizzle-orm/better-sqlite3";
import * as businessSchema from "@/core/db/business-schema";

function insertLines(
  dbOrSqlite: ReturnType<typeof getBusinessDb>["db"] | ReturnType<typeof getBusinessDb>["sqlite"],
  noteId: string,
  lines: StoredLine[],
) {
  if (lines.length === 0) return;
  const db = "insert" in dbOrSqlite ? dbOrSqlite : drizzle(dbOrSqlite, { schema: businessSchema });
  const linesArray = lines.map((line) => ({
    id: line.id,
    creditNoteId: noteId,
    description: line.description,
    quantityMicros: line.quantityMicros,
    unitPriceMinor: line.unitPriceMinor,
    discountType: (line.discountType as "none" | "percentage" | "fixed") || "none",
    discountValue: line.discountValue || "0",
    salesAccountId: line.salesAccountId,
    taxCodeId: line.taxCodeId,
    projectId: line.projectId || null,
    netAmountMinor: line.netAmountMinor,
    taxAmountMinor: line.taxAmountMinor,
    grossAmountMinor: line.grossAmountMinor,
    position: line.lineIndex,
  }));
  db.insert(salesCreditNoteLines).values(linesArray).run();
}


export function listCreditNotes(
  businessId: string, 
  userId: string, 
  filters?: { customerId?: string; from?: string; to?: string }
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const where: string[] = [];
  const params: string[] = [];
  if (filters?.customerId) {
    where.push("scn.customer_id = ?");
    params.push(filters.customerId);
  }
  if (filters?.from) {
    where.push("scn.date >= ?");
    params.push(filters.from);
  }
  if (filters?.to) {
    where.push("scn.date <= ?");
    params.push(filters.to);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = sqlite.prepare(`
    SELECT scn.*, c.name AS customer_name, i.invoice_number, cur.minor_unit AS currency_minor_unit,
      (SELECT GROUP_CONCAT(DISTINCT COALESCE(l.project_id, scn.project_id)) FROM sales_credit_note_lines l WHERE l.credit_note_id = scn.id) AS project_ids
    FROM sales_credit_notes scn
    INNER JOIN customers c ON c.id = scn.customer_id
    INNER JOIN sales_invoices i ON i.id = scn.source_invoice_id
    INNER JOIN currencies cur ON cur.code = scn.currency_code
    ${whereClause}
    ORDER BY scn.date DESC, scn.created_at DESC
  `).all(...params) as {
    id: string; credit_note_number: string; customer_id: string; customer_name: string;
    source_invoice_id: string; invoice_number: string; project_id: string | null; project_ids: string | null;
    date: string; reference: string | null; reason: string | null; document_status: CreditNoteStatus;
    subtotal_minor: number; tax_minor: number; total_minor: number; currency_code: string; currency_minor_unit: number; created_at: string; updated_at: string;
  }[];
  const projects = sqlite.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project.name]));
  return rows.map((row) => { const projectIds = row.project_ids?.split(",").filter(Boolean) ?? []; return { ...row, projectIds, projectNames: projectIds.map((id) => projectById.get(id) ?? id) }; });
}

export function getCreditNote(businessId: string, userId: string, noteId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.db.select({ note: salesCreditNotes, customer: customers, invoice: salesInvoices }).from(salesCreditNotes).innerJoin(customers, eq(customers.id, salesCreditNotes.customerId)).innerJoin(salesInvoices, eq(salesInvoices.id, salesCreditNotes.sourceInvoiceId)).where(eq(salesCreditNotes.id, noteId)).get();
  if (!header) return null;
  const lines = context.db.select().from(salesCreditNoteLines).where(eq(salesCreditNoteLines.creditNoteId, noteId)).orderBy(asc(salesCreditNoteLines.position)).all();
  const accounts = context.sqlite.prepare("SELECT id, name FROM accounts").all() as { id: string; name: string }[];
  const taxes = context.sqlite.prepare("SELECT id, name, rate_basis_points FROM tax_codes").all() as { id: string; name: string; rate_basis_points: number }[];
  const projects = context.sqlite.prepare("SELECT id, code, name FROM projects").all() as { id: string; code: string; name: string }[];
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const taxById = new Map(taxes.map((row) => [row.id, row]));
  const projectById = new Map(projects.map((row) => [row.id, row]));
  const journal = context.sqlite.prepare("SELECT id, entry_number FROM journal_entries WHERE source_type = 'sales_credit_note' AND source_id = ?").get(noteId) as { id: string; entry_number: string } | undefined;
  return {
    ...header,
    project: header.note.projectId ? projectById.get(header.note.projectId) ?? null : null,
    lines: lines.map((line) => { const projectId = effectiveProjectId(line.projectId, header.note.projectId); return { ...line, salesAccount: accountById.get(line.salesAccountId) ?? null, taxCode: taxById.get(line.taxCodeId) ?? null, project: projectId ? projectById.get(projectId) ?? null : null }; }),
    journal: journal ? { id: journal.id, entryNumber: journal.entry_number } : null,
  };
}

export function saveCreditNote(businessId: string, userId: string, input: CreditNoteInput, intent: CreditNoteIntent, noteId?: string) {
  const data = creditNoteInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  if (noteId) {
    const current = context.db.select().from(salesCreditNotes).where(eq(salesCreditNotes.id, noteId)).get();
    if (current?.documentStatus === "posted") {
      assertDateNotLocked(context.sqlite, current.date, "Sales credit note");
    }
  }
  const invoice = context.db.select().from(salesInvoices).where(eq(salesInvoices.id, data.sourceInvoiceId)).get();
  if (!invoice || invoice.documentStatus !== "posted" || invoice.customerId !== data.customerId) throw new Error("Choose a posted invoice belonging to this customer.");
  if (input.currencyCode && input.currencyCode.toUpperCase() !== invoice.currencyCode) {
    throw new Error(`This Credit Note must use the linked ${invoice.currencyCode} invoice currency.`);
  }
  const rate = storedRateSnapshot(context.sqlite, invoice);
  validateProjectReferences(context.sqlite, { headerProjectId: data.projectId, lineProjectIds: data.lines.map((line) => line.projectId), customerId: data.customerId, customerFacing: true });
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, { accountTypeFilter: "income", taxDirection: "sales", supportItems: false, accountFieldOnLine: "salesAccountId", amountsIncludeTax: data.amountsIncludeTax });
  const amounts = totalsForLines(lines);
  const available = remainingInvoiceBalance(context.sqlite, invoice.id, noteId);
  if (amounts.totalMinor > available) throw new Error("Credit note cannot exceed the remaining invoice balance.");
  const base = convertDocumentLinesToBase(lines, rate);
  const baseCarryingAmountReleased = proportionalCarryingRelease(
    amounts.totalMinor,
    available,
    remainingBaseCarrying(context.sqlite, invoice.id, noteId),
  );
  const now = new Date().toISOString();
  const id = noteId ?? randomUUID();
  const taxDate = data.taxDate || data.date;
  const customer = context.sqlite.prepare("SELECT name FROM customers WHERE id = ?").get(data.customerId) as { name: string };
  context.sqlite.transaction(() => {
    let number: string; let shouldPost = intent === "post"; let replace = false;
    if (noteId) {
      const current = context.db.select().from(salesCreditNotes).where(eq(salesCreditNotes.id, noteId)).get();
      if (!current) throw new Error("Credit note not found.");
      if (current.documentStatus === "void") throw new Error("A void credit note cannot be edited.");
      if (current.documentStatus === "posted") {
        assertDateNotLocked(context.sqlite, current.date, "Sales credit note");
        assertVatSourceUnlocked(context.sqlite, "sales_credit_note", noteId, current.taxDate);
      }
      if (current.sourceInvoiceId !== data.sourceInvoiceId && current.documentStatus === "posted") throw new Error("Cannot change the source invoice after posting.");
      number = current.creditNoteNumber; shouldPost = current.documentStatus === "posted" || intent === "post"; replace = current.documentStatus === "posted";
      context.sqlite.prepare(`UPDATE sales_credit_notes SET customer_id = ?, project_id = ?, source_invoice_id = ?, date = ?, tax_date = ?, supply_emirate = ?, reference = ?, reason = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ? WHERE id = ?`).run(data.customerId, data.projectId || null, data.sourceInvoiceId, data.date, taxDate, data.supplyEmirate || null, data.reference || null, data.reason || null, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, baseCarryingAmountReleased, now, noteId);
      context.sqlite.prepare("DELETE FROM sales_credit_note_lines WHERE credit_note_id = ?").run(noteId);
    } else {
      number = allocateNumber(context.sqlite, "creditNote");
      context.sqlite.prepare(`
        INSERT INTO sales_credit_notes (
          id, credit_note_number, customer_id, project_id, source_invoice_id, date,
          tax_date, supply_emirate, reference, reason, document_status, subtotal_minor, tax_minor,
          total_minor, currency_code, exchange_rate_to_base, exchange_rate_date,
          exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at, posted_at, voided_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft',
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL
        )
      `).run(id, number, data.customerId, data.projectId || null, data.sourceInvoiceId, data.date, taxDate, data.supplyEmirate || null, data.reference || null, data.reason || null, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, baseCarryingAmountReleased, userId, now, now);
    }
    insertLines(context.db, id, lines);
    if (shouldPost) {
      assertDateNotLocked(context.sqlite, data.date, "Sales credit note");
      assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
      const postingLines = lines.map((line) => ({ ...line, projectId: effectiveProjectId(line.projectId, data.projectId) }));
      postCreditNote(context.sqlite, { id, creditNoteNumber: number, customerId: data.customerId, date: data.date, totalMinor: amounts.totalMinor, rate, baseCarryingAmountReleased }, postingLines, replace);
      replaceTaxEntries(context.sqlite, {
        sourceType: "sales_credit_note", sourceId: id, sourceNumber: number,
        partyName: customer.name, taxDate, direction: "sales",
        supplyEmirate: data.supplyEmirate || null, sign: -1, rate,
      }, postingLines);
      context.sqlite.prepare(`INSERT INTO sales_credit_note_allocations (id, credit_note_id, sales_invoice_id, amount_minor, foreign_amount_allocated, base_carrying_amount_released) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(credit_note_id, sales_invoice_id) DO UPDATE SET amount_minor = excluded.amount_minor, foreign_amount_allocated = excluded.foreign_amount_allocated, base_carrying_amount_released = excluded.base_carrying_amount_released`).run(randomUUID(), id, data.sourceInvoiceId, amounts.totalMinor, amounts.totalMinor, baseCarryingAmountReleased);
      context.sqlite.prepare("UPDATE sales_credit_notes SET document_status = 'posted', posted_at = COALESCE(posted_at, ?) WHERE id = ?").run(now, id);
    }

    try {
      recordActivity(businessId, {
        userId,
        action: shouldPost ? "posted" : (noteId ? "updated" : "created"),
        entityType: "sales_credit_note",
        entityId: id,
        entityNumber: number,
        summary: `${shouldPost ? "Issued" : (noteId ? "Updated" : "Created")} sales credit note ${number}`,
        details: { creditNoteNumber: number, totalMinor: amounts.totalMinor, currency: rate.currencyCode, customerId: data.customerId, sourceInvoiceId: data.sourceInvoiceId },
        sqlite: context.sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] sales_credit_note save failed:", e);
    }
  }).immediate();
  return id;
}

export function duplicateCreditNote(businessId: string, userId: string, noteId: string) {
  const record = getCreditNote(businessId, userId, noteId);
  if (!record) throw new Error("Credit note not found.");
  const rate = storedRateSnapshot(getBusinessDb(businessId, userId).sqlite, record.note);
  return saveCreditNote(businessId, userId, { currencyCode: rate.currencyCode, exchangeRateToBase: rate.exchangeRateToBase, exchangeRateDate: rate.exchangeRateDate, exchangeRateSource: rate.exchangeRateSource, customerId: record.note.customerId, projectId: record.note.projectId ?? "", sourceInvoiceId: record.note.sourceInvoiceId, date: record.note.date, taxDate: record.note.taxDate, supplyEmirate: record.note.supplyEmirate ?? "", reference: record.note.reference ?? "", reason: record.note.reason ?? "", lines: record.lines.map((line) => ({ description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, rate.currencyMinorUnit), salesAccountId: line.salesAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })) }, "draft");
}

export function deleteCreditNote(businessId: string, userId: string, noteId: string) {
  const context = getBusinessDb(businessId, userId); const note = context.db.select().from(salesCreditNotes).where(eq(salesCreditNotes.id, noteId)).get();
  if (!note) throw new Error("Credit note not found."); if (note.documentStatus !== "draft") throw new Error("Only draft credit notes can be deleted.");
  context.db.delete(salesCreditNotes).where(eq(salesCreditNotes.id, noteId)).run();

  try {
    recordActivity(businessId, {
      userId,
      action: "deleted",
      entityType: "sales_credit_note",
      entityId: noteId,
      entityNumber: note.creditNoteNumber,
      summary: `Deleted draft sales credit note ${note.creditNoteNumber}`,
      sqlite: context.sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] sales_credit_note delete failed:", e);
  }
}

export function voidCreditNote(businessId: string, userId: string, noteId: string) {
  const context = getBusinessDb(businessId, userId); const note = context.db.select().from(salesCreditNotes).where(eq(salesCreditNotes.id, noteId)).get();
  if (!note) throw new Error("Credit note not found."); if (note.documentStatus !== "posted") throw new Error("Only posted credit notes can be voided.");
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    assertDateNotLocked(context.sqlite, note.date, "Sales credit note void");
    assertDateNotLocked(context.sqlite, now.slice(0, 10), "Sales credit note void");
    assertVatSourceUnlocked(context.sqlite, "sales_credit_note", noteId, note.taxDate);
    reverseTransaction(context.sqlite, { originalSourceType: "sales_credit_note", originalSourceId: noteId, reversalSourceType: "sales_credit_note_void", reversalSourceId: noteId, date: now.slice(0, 10), description: `Void Sales Credit Note ${note.creditNoteNumber}` });
    reverseTaxEntries(context.sqlite, { originalSourceType: "sales_credit_note", sourceId: noteId, reversalSourceType: "sales_credit_note_void", taxDate: note.taxDate });
    context.sqlite.prepare("UPDATE sales_credit_notes SET document_status = 'void', voided_at = ?, updated_at = ? WHERE id = ?").run(now, now, noteId);

    try {
      recordActivity(businessId, {
        userId,
        action: "voided",
        entityType: "sales_credit_note",
        entityId: noteId,
        entityNumber: note.creditNoteNumber,
        summary: `Voided sales credit note ${note.creditNoteNumber}`,
        details: { creditNoteNumber: note.creditNoteNumber, totalMinor: note.totalMinor, customerId: note.customerId },
        sqlite: context.sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] sales_credit_note void failed:", e);
    }
  }).immediate();
}
