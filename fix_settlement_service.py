import os

file_path = "src/modules/settlement/settlement-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("invoiceDate: invoice.date,\n    relevantDate: data.date,\n    enforceVatPolicy: false,", "relevantDate: data.date,\n    enforceVatPolicy: false,")
content = content.replace('"receipt" : "supplier_payment"', '"receipt" : "supplierPayment"')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
