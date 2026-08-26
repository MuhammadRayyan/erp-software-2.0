import os

filepath = "src/app/api/businesses/[businessId]/documents/[documentType]/[documentId]/pdf/route.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(', tax: line.taxMinor > 0 ? formatMoney(line.taxMinor, currency) : undefined', '')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
