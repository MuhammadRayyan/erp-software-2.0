import os

file_path = "src/modules/settlement/settlement-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("SELECT id, date, currency_code", "SELECT id, invoice_date, currency_code")
content = content.replace("invoiceDate: invoice.date,", "invoiceDate: invoice.invoice_date,")
content = content.replace("relevantDate: data.date,\n    enforceVatPolicy: false,", "invoiceDate: invoice.invoice_date,\n    relevantDate: data.date,\n    enforceVatPolicy: false,")
# Actually, the original didn't complain about invoiceDate missing from type because it WAS in the type `resolveRateSnapshot` config. Wait, the type error was:
# 'invoiceDate' does not exist in type '{ currencyCode: string; ... }'
# Let's check `resolveRateSnapshot` to see if it takes `invoiceDate`. 
