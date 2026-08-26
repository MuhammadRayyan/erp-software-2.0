import os

# Fix quote-service.ts
filepath = "src/modules/sales-quotes/quote-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('QUOTE BY', 'ORDER BY')
c = c.replace('internal_number', 'invoice_number')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# Fix sales-order-service.ts
filepath = "src/modules/sales-orders/sales-order-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('internal_number', 'invoice_number')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
