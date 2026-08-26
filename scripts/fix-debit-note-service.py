import os
import re

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# Fix imports and e-invoicing
c = re.sub(r'import \{ DebitNoteReasonCode.*?\n', '', c)
c = re.sub(r'import \{ generateEInvoice, submitEInvoice, resolveSourceEInvoice \} from "@/modules/einvoicing/einvoice-service";\n', '', c)
c = re.sub(r'import \{ getEInvoiceBySource \} from "@/modules/einvoicing/einvoice-repository";\n', '', c)
c = c.replace('import { getDebitNotePostingService } from "@/modules/accounting/services/debit-note-posting-service";\n', '')
c = c.replace('import { postDebitNoteToLedger, reverseDebitNoteInLedger } from "@/modules/accounting/services/debit-note-posting-service";', 'import { postPurchaseDocumentToLedger, reversePurchaseDocumentInLedger } from "@/modules/accounting/services/purchase-posting-service";')

# Fix getDebitNote eInvoice properties
c = re.sub(r'eInvoiceReasonCode: header\.debitNote\.eInvoiceReasonCode,.*?eInvoiceTransactionFlagsJson: header\.debitNote\.eInvoiceTransactionFlagsJson,', '', c, flags=re.DOTALL)
c = c.replace('eInvoice: eInvoiceRows[0] ?? null,', '')

# Fix e-invoicing intent logic in saveDebitNote
c = re.sub(r'const nextStatus = intent === "post" \? "posted" : "draft";', 'const status = intent === "post" ? "posted" : "draft";', c)
c = re.sub(r'// E-Invoicing API.*?\n\s+if \(intent === "post"\) \{.*?\n\s+\}', '', c, flags=re.DOTALL)

# Fix saveDebitNote INSERT and UPDATE statements
c = re.sub(r'UPDATE debit_notes SET supplier_id = \?, project_id = \?, purchase_invoice_id = \?, date = \?, tax_date = \?, supply_emirate = \?, reference = \?, reason = \?, einvoice_reason_code = \?, einvoice_transaction_flags_json = \?, document_status = \?, subtotal_minor = \?, tax_minor = \?, total_minor = \?, currency_code = \?, exchange_rate_to_base = \?, exchange_rate_date = \?, exchange_rate_source = \?, base_subtotal_minor = \?, base_tax_minor = \?, base_total_minor = \?, updated_at = \? WHERE id = \?',
           'UPDATE debit_notes SET supplier_id = ?, project_id = ?, purchase_invoice_id = ?, debit_note_date = ?, tax_date = ?, reference = ?, document_status = ?, subtotal_minor = ?, tax_minor = ?, total_minor = ?, currency_code = ?, exchange_rate_to_base = ?, exchange_rate_date = ?, exchange_rate_source = ?, base_subtotal_minor = ?, base_tax_minor = ?, base_total_minor = ?, updated_at = ? WHERE id = ?', c)

c = re.sub(r'\.run\(data\.supplierId, data\.projectId \|\| null, data\.purchaseInvoiceId, data\.date, data\.taxDate, data\.supplyEmirate, data\.reference \|\| null, data\.reason \|\| null, data\.eInvoiceReasonCode, JSON\.stringify\(data\.eInvoiceTransactionFlags\), nextStatus, amounts\.subtotalMinor, amounts\.taxMinor, amounts\.totalMinor, rate\.currencyCode, rate\.exchangeRateToBase, rate\.exchangeRateDate, rate\.exchangeRateSource, base\.baseSubtotalMinor, base\.baseTaxMinor, base\.baseTotalMinor, now, debitNoteId\);',
           '.run(data.supplierId, data.projectId || null, data.purchaseInvoiceId || null, data.date, data.taxDate, data.reference || null, status, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, now, debitNoteId);', c)

c = re.sub(r'INSERT INTO debit_notes \(id, debit_note_number, supplier_id, project_id, purchase_invoice_id, date, tax_date, supply_emirate, reference, reason, einvoice_reason_code, einvoice_transaction_flags_json, document_status, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, created_by, created_at, updated_at\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)',
           'INSERT INTO debit_notes (id, debit_note_number, supplier_id, project_id, purchase_invoice_id, debit_note_date, tax_date, reference, document_status, subtotal_minor, tax_minor, total_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source, base_subtotal_minor, base_tax_minor, base_total_minor, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', c)

c = re.sub(r'\.run\(id, debitNoteNumber, data\.supplierId, data\.projectId \|\| null, data\.purchaseInvoiceId, data\.date, data\.taxDate, data\.supplyEmirate, data\.reference \|\| null, data\.reason \|\| null, data\.eInvoiceReasonCode, JSON\.stringify\(data\.eInvoiceTransactionFlags\), status, amounts\.subtotalMinor, amounts\.taxMinor, amounts\.totalMinor, rate\.currencyCode, rate\.exchangeRateToBase, rate\.exchangeRateDate, rate\.exchangeRateSource, base\.baseSubtotalMinor, base\.baseTaxMinor, base\.baseTotalMinor, userId, now, now\);',
           '.run(id, debitNoteNumber, data.supplierId, data.projectId || null, data.purchaseInvoiceId || null, data.date, data.taxDate, data.reference || null, status, amounts.subtotalMinor, amounts.taxMinor, amounts.totalMinor, rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource, base.baseSubtotalMinor, base.baseTaxMinor, base.baseTotalMinor, userId, now, now);', c)

# Fix posting service call
c = c.replace('postDebitNoteToLedger(context, id);', 'postPurchaseDocumentToLedger(context, id, "debit_note");')
c = c.replace('reverseDebitNoteInLedger(context, debitNoteId, "void");', 'reversePurchaseDocumentInLedger(context, debitNoteId, "debit_note", "void");')

# Fix NumberKind
c = c.replace('"debitNote"', '"purchaseInvoice"')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
