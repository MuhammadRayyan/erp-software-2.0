import os

filepath = "src/core/permissions/document-pdf-access.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('"sales-credit-note": "sales",', '"sales-credit-note": "sales",\n  "sales-quote": "sales",\n  "sales-order": "sales",')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
