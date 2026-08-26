import os
import re

source_dir = "src/modules/sales-credit-notes"
dest_dir = "src/modules/debit-notes"

def replace_content(c):
    # Order matters
    c = c.replace('Credit Note', 'Debit Note')
    c = c.replace('credit notes', 'debit notes')
    c = c.replace('Credit notes', 'Debit notes')
    c = c.replace('sales-credit-notes', 'debit-notes')
    c = c.replace('salesCreditNotes', 'debitNotes')
    c = c.replace('salesCreditNoteLines', 'debitNoteLines')
    c = c.replace('salesCreditNote', 'debitNote')
    c = c.replace('sales_credit_notes', 'debit_notes')
    c = c.replace('sales_credit_note', 'debit_note')
    
    c = c.replace('creditNote', 'debitNote')
    c = c.replace('CreditNote', 'DebitNote')
    c = c.replace('credit-note', 'debit-note')

    # Re-route to suppliers
    c = c.replace('customerId', 'supplierId')
    c = c.replace('customer', 'supplier')
    c = c.replace('Customer', 'Supplier')
    
    # Re-route to expenses and purchases
    c = c.replace('salesAccountId', 'expenseAccountId')
    c = c.replace('defaultSalesAccountId', 'defaultExpenseAccountId')
    c = c.replace('accountTypeFilter: "income"', 'accountTypeFilter: "expense"')
    c = c.replace('taxDirection: "sales"', 'taxDirection: "purchases"')
    c = c.replace('accountFieldOnLine: "salesAccountId"', 'accountFieldOnLine: "expenseAccountId"')
    
    # Re-route sourceInvoiceId to purchaseInvoiceId
    c = c.replace('sourceInvoiceId', 'purchaseInvoiceId')
    c = c.replace('source_invoice_id', 'purchase_invoice_id')
    
    # DB references fixes
    c = c.replace('salesInvoices', 'purchaseInvoices')
    c = c.replace('sales_invoices', 'purchase_invoices')
    
    return c

for filename in os.listdir(source_dir):
    if not os.path.isfile(os.path.join(source_dir, filename)):
        continue
    
    with open(os.path.join(source_dir, filename), "r", encoding="utf-8") as f:
        content = f.read()
        
    new_content = replace_content(content)
    
    new_filename = filename.replace('credit-note', 'debit-note')
    
    with open(os.path.join(dest_dir, new_filename), "w", encoding="utf-8") as f:
        f.write(new_content)

print("done")
