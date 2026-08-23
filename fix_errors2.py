import os

file_path = "src/modules/settlement/settlement-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("allocate ${invoice.currency_code.toUpperCase()} invoices", "allocate ${data.currencyCode.toUpperCase()} invoices")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
