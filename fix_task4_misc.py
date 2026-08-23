import re

file_path = "src/modules/purchase-invoices/purchase-invoice-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("ReturnType<typeof totals>", "ReturnType<typeof totalsForLines>")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

file_path2 = "src/modules/accounting/services/purchase-invoice-posting-service.ts"
with open(file_path2, "r", encoding="utf-8") as f:
    content2 = f.read()

content2 = re.sub(r"function addProjectAmount\([^}]+\}\n", "", content2)
content2 = re.sub(r"type ProjectAmount = \{[^}]+\};\n\n?", "", content2)

with open(file_path2, "w", encoding="utf-8") as f:
    f.write(content2)
