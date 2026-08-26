import os

filepath = "src/modules/custom-fields/custom-field-schema.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('"customer", "supplier", "sales_invoice", "sales_credit_note", "purchase_invoice"',
'"customer", "supplier", "sales_invoice", "sales_credit_note", "purchase_invoice", "sales_quote", "sales_order"')
c = c.replace('"customer" | "supplier" | "sales_invoice" | "sales_credit_note" | "purchase_invoice"',
'"customer" | "supplier" | "sales_invoice" | "sales_credit_note" | "purchase_invoice" | "sales_quote" | "sales_order"')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
