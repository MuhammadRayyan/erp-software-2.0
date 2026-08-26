import os
import re

filepath = "src/modules/sales-orders/sales-order-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# Fix relatedInvoices
c = c.replace('WHERE order_id = ? ORDER BY', 'WHERE sales_order_id = ? ORDER BY')

# Fix goodsReceipts to empty arrays
c = re.sub(r'const receivedRows = context\.sqlite\.prepare.*?\.all\(orderId\) as \{.*?\}\[\];', 'const receivedRows = [] as { line_id: string; received_micros: number }[];', c)
c = re.sub(r'const goodsReceipts = context\.sqlite\.prepare.*?\.all\(orderId\) as \{.*?\}\[\];', 'const goodsReceipts = [] as { id: string; receipt_number: string; date: string; document_documentStatus: string }[];', c)

# Fix delivery_notes query during save
c = c.replace('if (context.sqlite.prepare("SELECT 1 FROM delivery_notes WHERE order_id = ? LIMIT 1").get(orderId)) throw new Error("A Purchase Order cannot be edited after a Goods Receipt has been created.");', '')


with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/sales-quotes/quote-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = re.sub(r'const relatedInvoices = context\.sqlite\.prepare.*?\.all\(quoteId\) as \{.*?\}\[\];', 'const relatedInvoices = [] as { id: string; internal_number: string; document_documentStatus: string; total_minor: number }[];', c)
c = re.sub(r'const receivedRows = context\.sqlite\.prepare.*?\.all\(quoteId\) as \{.*?\}\[\];', 'const receivedRows = [] as { line_id: string; received_micros: number }[];', c)
c = re.sub(r'const goodsReceipts = context\.sqlite\.prepare.*?\.all\(quoteId\) as \{.*?\}\[\];', 'const goodsReceipts = [] as { id: string; receipt_number: string; date: string; document_documentStatus: string }[];', c)
c = c.replace('if (context.sqlite.prepare("SELECT 1 FROM delivery_notes WHERE quote_id = ? LIMIT 1").get(quoteId)) throw new Error("A Purchase Order cannot be edited after a Goods Receipt has been created.");', '')


with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
