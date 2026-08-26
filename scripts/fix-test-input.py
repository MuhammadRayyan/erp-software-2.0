import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('quoteDate: "2026-08-26",', 'date: "2026-08-26",')
c = c.replace('orderDate: "2026-08-26",', 'date: "2026-08-26",')
c = c.replace('quantityMicros: "1.0000",', 'quantity: "1",')
c = c.replace('unitPriceMinor: "10500",', 'unitPrice: "105.00",')
c = c.replace('quantityMicros: "2.0000",', 'quantity: "2",')
c = c.replace('unitPriceMinor: "5000",', 'unitPrice: "50.00",')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
