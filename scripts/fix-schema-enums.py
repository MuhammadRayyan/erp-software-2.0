import os

filepath = "src/core/db/business-schema.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('"sales_invoice", "sales_credit_note", "purchase_invoice"',
'"sales_invoice", "sales_credit_note", "purchase_invoice", "sales_quote", "sales_order", "purchase_order", "debit_note"')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
