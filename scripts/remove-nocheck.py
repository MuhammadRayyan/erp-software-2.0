import os

filepath = "src/modules/sales-quotes/quote-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("// @ts-nocheck\n", "")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/sales-orders/sales-order-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("// @ts-nocheck\n", "")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)
