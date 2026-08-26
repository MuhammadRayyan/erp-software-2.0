import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('const { createQuote, getQuote }', 'const { saveSalesQuote: createQuote, getSalesQuote: getQuote }')
c = c.replace('const { createSalesOrder: createOrder, getSalesOrder: getOrder }', 'const { saveSalesOrder: createOrder, getSalesOrder: getOrder }')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
