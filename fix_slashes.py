import os

files = [
    "src/modules/sales-invoices/invoice-service.ts",
    "src/modules/sales-credit-notes/credit-note-service.ts",
    "src/modules/purchase-invoices/purchase-invoice-service.ts",
    "src/modules/purchase-orders/purchase-order-service.ts"
]

for file_path in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    content = content.replace(r'\"', '"')
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
