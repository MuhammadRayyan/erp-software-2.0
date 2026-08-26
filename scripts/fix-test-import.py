import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('import(\n  "../src/modules/sales-orders/order-service"\n);', 'import(\n  "../src/modules/sales-orders/sales-order-service"\n);')
c = c.replace('const { createOrder, getOrder }', 'const { createSalesOrder: createOrder, getSalesOrder: getOrder }')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
