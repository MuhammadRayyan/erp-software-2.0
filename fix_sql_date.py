import os

file_path = "src/modules/settlement/settlement-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("SELECT id, date, currency_code", "SELECT id, currency_code")
content = content.replace("SELECT id, invoice_date, currency_code", "SELECT id, currency_code")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
