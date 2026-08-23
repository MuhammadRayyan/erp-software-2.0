import re

# Fix purchase invoice service
file_path = "src/modules/purchase-invoices/purchase-invoice-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("const totals =", "const totalsForLinesResult =") # wait, totals might be called totalsForLines now? No, it's just a local variable?
# Let's check what it is actually.
