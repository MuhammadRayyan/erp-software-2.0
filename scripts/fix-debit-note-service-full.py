import os

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Replace insertLines
import re

new_insert_lines = """
  function insertLines(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], noteId: string, lines: StoredLine[]) {
    const statement = sqlite.prepare(INSERT INTO debit_note_lines (id, debit_note_id, description, quantity_micros, unit_price_minor, discount_type, discount_value, expense_account_id, tax_code_id, project_id, net_amount_minor, tax_amount_minor, gross_amount_minor, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?));
    for (const line of lines) statement.run(line.id, noteId, line.description, line.quantityMicros, line.unitPriceMinor, line.discountType, line.discountValue, line.expenseAccountId, line.taxCodeId, line.projectId, line.netAmountMinor, line.taxAmountMinor, line.grossAmountMinor, line.lineIndex);
  }
"""
content = re.sub(r'  function insertLines.*?\}\n', new_insert_lines, content, flags=re.DOTALL)

# Replace the save transaction body
new_save_txn = """
  context.sqlite.transaction(() => {
    let number: string; let shouldPost = intent === "post"; let replace = false;
    if (noteId) {
      const current = context.db.select().from(debitNotes).where(eq(debitNotes.id, noteId)).get();
      if (!current) throw new Error("Debit note not found.");
      if (current.documentStatus === "void") throw new Error("A void debit note cannot be edited.");
      if (current.documentStatus === "posted") assertVatSourceUnlocked(context.sqlite, "debit_note", noteId, current.taxDate);
      if (current.purchaseInvoiceId !== data.purchaseInvoiceId && current.documentStatus === "posted") throw new Error("Cannot change the source invoice after posting.");
      number = current.debitNoteNumber; shouldPost = current.documentStatus === "posted" || intent === "post"; replace = current.documentStatus === "posted";
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
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, NULL, NULL
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
"""

content = re.sub(r'  context\.sqlite\.transaction\(\(\) => \{.*?  \}\)\.immediate\(\);\n', new_save_txn, content, flags=re.DOTALL)

# Fix duplicateDebitNote
new_dup = """
export function duplicateDebitNote(businessId: string, userId: string, noteId: string) {
  const record = getDebitNote(businessId, userId, noteId);
  if (!record) throw new Error("Debit note not found.");
  const rate = storedRateSnapshot(getBusinessDb(businessId, userId).sqlite, record.note);
  return saveDebitNote(businessId, userId, { currencyCode: rate.currencyCode, exchangeRateToBase: rate.exchangeRateToBase, exchangeRateDate: rate.exchangeRateDate, exchangeRateSource: rate.exchangeRateSource, supplierId: record.note.supplierId, projectId: record.note.projectId ?? "", purchaseInvoiceId: record.note.purchaseInvoiceId, amountsIncludeTax: record.note.amountsIncludeTax, date: record.note.debitNoteDate, taxDate: record.note.taxDate, reference: record.note.reference ?? "", lines: record.lines.map((line) => ({ description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, rate.currencyMinorUnit), discountType: line.discountType, discountValue: line.discountValue, expenseAccountId: line.expenseAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })) }, "draft");
}
"""

content = re.sub(r'export function duplicateDebitNote.*?\n\}\n', new_dup, content, flags=re.DOTALL)

# Fix voidDebitNote
new_void = """
export function voidDebitNote(businessId: string, userId: string, noteId: string) {
  const context = getBusinessDb(businessId, userId); const note = context.db.select().from(debitNotes).where(eq(debitNotes.id, noteId)).get();
  if (!note) throw new Error("Debit note not found."); if (note.documentStatus !== "posted") throw new Error("Only posted debit notes can be voided.");
  const now = new Date().toISOString();
  context.sqlite.transaction(() => { assertVatSourceUnlocked(context.sqlite, "debit_note", noteId, note.taxDate); reversePurchaseDocumentInLedger(context, noteId, "debit_note", "void"); reverseTaxEntries(context.sqlite, { originalSourceType: "debit_note", sourceId: noteId, reversalSourceType: "debit_note_void", taxDate: note.taxDate }); context.sqlite.prepare("UPDATE debit_notes SET document_status = 'void', voided_at = ?, updated_at = ? WHERE id = ?").run(now, now, noteId); }).immediate();
}
"""

content = re.sub(r'export function voidDebitNote.*?\n\}\n', new_void, content, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("done")
