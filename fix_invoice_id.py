import os

file_path = "src/modules/settlement/settlement-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("const invoice = sqlite.prepare(`", "const invoiceId = data.invoiceId || data.purchaseInvoiceId;\n  const invoice = sqlite.prepare(`")
content = content.replace(".get(data.invoiceId, partyId) as any;", ".get(invoiceId, partyId) as any;")
content = content.replace("invoiceId: data.invoiceId", "invoiceId")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
