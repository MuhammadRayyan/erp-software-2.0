import os

filepath = "src/modules/debit-notes/debit-note-service.ts"

content = """import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { debitNotes } from "@/core/db/business-schema";
import { getBusinessDb } from "@/core/db/business-db";
import { DebitNoteInput } from "./debit-note-input";
import { allocateNumber, NumberKind } from "@/modules/accounting/services/numbering-service";
import { calculateLines, totalsForLines } from "@/modules/accounting/services/document-line-calculator";
import { getExchangeRateContext, storedRateSnapshot } from "@/modules/currency/currency-service";
import {
  replaceTaxEntries,
  reverseTaxEntries,
  assertVatDateUnlocked,
  assertVatSourceUnlocked,
} from "@/modules/tax/tax-service";
import { postPurchaseDocumentToLedger, reversePurchaseDocumentInLedger } from "@/modules/accounting/services/purchase-posting-service";
import { quantityMicrosToInput, minorToCurrencyInput } from "@/modules/accounting/calculations/money";

type StoredLine = {
  id: string;
  itemId: string | null;
  description: string;
  quantityMicros: number;
  unitPriceMinor: number;
  discountType: "percentage" | "fixed" | "none";
  discountValue: string;
  salesAccountId?: string;
  expenseAccountId?: string;
  taxCodeId: string;
  projectId: string | null;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  lineIndex: number;
};

export function saveDebitNote(businessId: string, userId: string, data: DebitNoteInput, intent: "draft" | "post", noteId?: string) {
  const context = getBusinessDb(businessId, userId);
  const status = intent === "post" ? "posted" : "draft";

  const { rate, base } = getExchangeRateContext(context.sqlite, data);
  const lines = calculateLines(context.sqlite, data.lines, rate.currencyMinorUnit, {
    accountTypeFilter: "expense",
    taxDirection: "purchases",
    supportItems: false,
    accountFieldOnLine: "expenseAccountId",
    amountsIncludeTax: data.amountsIncludeTax,
  });
  const amounts = totalsForLines(lines);
  const baseCarryingAmountReleased = Math.round(amounts.totalMinor * parseFloat(rate.exchangeRateToBase));

  function effectiveProjectId(lineProjectId: string | null, headerProjectId: string | null) {
    if (lineProjectId) return lineProjectId;
    if (headerProjectId) return headerProjectId;
    return null;
  }

  function insertLines(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], debitNoteId: string, lines: StoredLine[]) {
    const statement = sqlite.prepare(INSERT INTO debit_note_lines (id, debit_note_id, description, quantity_micros, unit_price_minor, discount_type, discount_value, expense_account_id, tax_code_id, project_id, net_amount_minor, tax_amount_minor, gross_amount_minor, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?));
    for (const line of lines) {
      statement.run(line.id, debitNoteId, line.description, line.quantityMicros, line.unitPriceMinor, line.discountType, line.discountValue, line.expenseAccountId, line.taxCodeId, line.projectId, line.netAmountMinor, line.taxAmountMinor, line.grossAmountMinor, line.lineIndex);
    }
  }

  const now = new Date().toISOString();
  const id = noteId ?? randomUUID();
  const taxDate = data.taxDate || data.date;
  const supplier = context.sqlite.prepare("SELECT name FROM suppliers WHERE id = ?").get(data.supplierId) as { name: string };

  context.sqlite.transaction(() => {
    let number: string;
    let shouldPost = intent === "post";
    
    if (noteId) {
      const current = context.db.select().from(debitNotes).where(eq(debitNotes.id, noteId)).get();
      if (!current) throw new Error("Debit note not found.");
      if (current.documentStatus === "void") throw new Error("A void debit note cannot be edited.");
      if (current.documentStatus === "posted") assertVatSourceUnlocked(context.sqlite, "debit_note", noteId, current.taxDate);
      if (current.purchaseInvoiceId !== data.purchaseInvoiceId && current.documentStatus === "posted") throw new Error("Cannot change the source invoice after posting.");
      
      number = current.debitNoteNumber;
      shouldPost = current.documentStatus === "posted" || intent === "post";
      
      context.sqlite.prepare(UPDATE debit_notes SET supplier_id = ?, project_id = ?, purchase_invoice_id = ?, amounts_include_tax = ?, debit_note_date = ?, tax_date = ?, reference = ?, document_status = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ? WHERE id = ?).run(data.supplierId, data.projectId || null, data.purchaseInvoiceId || null, data.amountsIncludeTax ? 1 : 0, data.date, taxDate, data.reference || null, status, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, baseCarryingAmountReleased, now, noteId);
      context.sqlite.prepare("DELETE FROM debit_note_lines WHERE debit_note_id = ?").run(noteId);
    } else {
      number = allocateNumber(context.sqlite, "purchaseInvoice");
      context.sqlite.prepare(
        INSERT INTO debit_notes (
          id, debit_note_number, supplier_id, project_id, purchase_invoice_id, amounts_include_tax, debit_note_date,
          tax_date, reference, document_status, subtotal_minor, tax_minor,
          total_minor, currency_code, exchange_rate_to_base, exchange_rate_date,
          exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at, posted_at, voided_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL
        )
      ).run(id, number, data.supplierId, data.projectId || null, data.purchaseInvoiceId || null, data.amountsIncludeTax ? 1 : 0, data.date, taxDate, data.reference || null, status, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, baseCarryingAmountReleased, userId, now, now);
    }
    
    insertLines(context.sqlite, id, lines);
    
    if (shouldPost) {
      assertVatDateUnlocked(context.sqlite, taxDate, lines.map((line) => line.taxCodeId));
      const postingLines = lines.map((line) => ({ ...line, projectId: effectiveProjectId(line.projectId, data.projectId) }));
      postPurchaseDocumentToLedger(context, id, "debit_note");
      replaceTaxEntries(context.sqlite, {
        sourceType: "debit_note", sourceId: id, sourceNumber: number,
        partyName: supplier.name, taxDate, direction: "purchases",
        supplyEmirate: null, sign: -1, rate,
      }, postingLines);
      context.sqlite.prepare("UPDATE debit_notes SET document_status = 'posted', posted_at = COALESCE(posted_at, ?) WHERE id = ?").run(now, id);
    }
  }).immediate();
  
  return id;
}

export function duplicateDebitNote(businessId: string, userId: string, noteId: string) {
  const record = getDebitNote(businessId, userId, noteId);
  if (!record) throw new Error("Debit note not found.");
  const rate = storedRateSnapshot(getBusinessDb(businessId, userId).sqlite, record.note);
  return saveDebitNote(businessId, userId, { 
    currencyCode: rate.currencyCode, 
    exchangeRateToBase: rate.exchangeRateToBase, 
    exchangeRateDate: rate.exchangeRateDate, 
    exchangeRateSource: rate.exchangeRateSource, 
    supplierId: record.note.supplierId, 
    projectId: record.note.projectId ?? "", 
    purchaseInvoiceId: record.note.purchaseInvoiceId, 
    amountsIncludeTax: record.note.amountsIncludeTax, 
    date: record.note.debitNoteDate, 
    taxDate: record.note.taxDate, 
    reference: record.note.reference ?? "", 
    lines: record.lines.map((line) => ({ 
      description: line.description, 
      quantity: quantityMicrosToInput(line.quantityMicros), 
      unitPrice: minorToCurrencyInput(line.unitPriceMinor, rate.currencyMinorUnit), 
      discountType: line.discountType, 
      discountValue: line.discountValue, 
      expenseAccountId: line.expenseAccountId, 
      taxCodeId: line.taxCodeId, 
      projectId: line.projectId ?? "" 
    })) 
  }, "draft");
}

export function deleteDebitNote(businessId: string, userId: string, noteId: string) {
  const context = getBusinessDb(businessId, userId); 
  const note = context.db.select().from(debitNotes).where(eq(debitNotes.id, noteId)).get();
  if (!note) throw new Error("Debit note not found."); 
  if (note.documentStatus !== "draft") throw new Error("Only draft debit notes can be deleted.");
  context.db.delete(debitNotes).where(eq(debitNotes.id, noteId)).run();
}

export function voidDebitNote(businessId: string, userId: string, noteId: string) {
  const context = getBusinessDb(businessId, userId); 
  const note = context.db.select().from(debitNotes).where(eq(debitNotes.id, noteId)).get();
  if (!note) throw new Error("Debit note not found."); 
  if (note.documentStatus !== "posted") throw new Error("Only posted debit notes can be voided.");
  
  const now = new Date().toISOString();
  context.sqlite.transaction(() => { 
    assertVatSourceUnlocked(context.sqlite, "debit_note", noteId, note.taxDate); 
    reversePurchaseDocumentInLedger(context, noteId, "debit_note", "void"); 
    reverseTaxEntries(context.sqlite, { originalSourceType: "debit_note", sourceId: noteId, reversalSourceType: "debit_note_void", taxDate: note.taxDate }); 
    context.sqlite.prepare("UPDATE debit_notes SET document_status = 'void', voided_at = ?, updated_at = ? WHERE id = ?").run(now, now, noteId); 
  }).immediate();
}

export function getDebitNote(businessId: string, userId: string, noteId: string) {
  const context = getBusinessDb(businessId, userId);
  const header = context.sqlite.prepare(
    SELECT n.*, s.name as supplierName, s.currency_code as supplierCurrency 
    FROM debit_notes n
    JOIN suppliers s ON n.supplier_id = s.id
    WHERE n.id = ?
  ).get(noteId) as any;
  
  if (!header) return null;
  
  const lines = context.sqlite.prepare(
    SELECT l.*, a.code as accountCode, a.name as accountName, t.name as taxCodeName, t.rate_basis_points as taxRateBasisPoints, p.code as projectCode, p.name as projectName
    FROM debit_note_lines l
    JOIN accounts a ON l.expense_account_id = a.id
    JOIN tax_codes t ON l.tax_code_id = t.id
    LEFT JOIN projects p ON l.project_id = p.id
    WHERE l.debit_note_id = ?
    ORDER BY l.position ASC
  ).all(noteId) as any[];

  return {
    note: {
      id: header.id,
      debitNoteNumber: header.debit_note_number,
      supplierId: header.supplier_id,
      supplierName: header.supplierName,
      supplierCurrency: header.supplierCurrency,
      purchaseInvoiceId: header.purchase_invoice_id,
      projectId: header.project_id,
      amountsIncludeTax: header.amounts_include_tax === 1,
      debitNoteDate: header.debit_note_date,
      taxDate: header.tax_date,
      reference: header.reference,
      documentStatus: header.document_status,
      subtotalMinor: header.subtotal_minor,
      taxMinor: header.tax_minor,
      totalMinor: header.total_minor,
      currencyCode: header.currency_code,
      exchangeRateToBase: header.exchange_rate_to_base,
      exchangeRateDate: header.exchange_rate_date,
      exchangeRateSource: header.exchange_rate_source,
    },
    lines: lines.map((line: any) => ({
      id: line.id,
      description: line.description,
      quantityMicros: line.quantity_micros,
      unitPriceMinor: line.unit_price_minor,
      discountType: line.discount_type,
      discountValue: line.discount_value,
      expenseAccountId: line.expense_account_id,
      expenseAccountCode: line.accountCode,
      expenseAccountName: line.accountName,
      taxCodeId: line.tax_code_id,
      taxCodeName: line.taxCodeName,
      taxCodeRate: line.taxRateBasisPoints,
      projectId: line.project_id,
      projectCode: line.projectCode,
      projectName: line.projectName,
      netAmountMinor: line.net_amount_minor,
      taxAmountMinor: line.tax_amount_minor,
      grossAmountMinor: line.gross_amount_minor,
    }))
  };
}
"""

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("done")
