import re
import os

files = [
    ("src/modules/sales-invoices/invoice-service.ts", "salesAccountId", "sales", "true"),
    ("src/modules/sales-credit-notes/credit-note-service.ts", "salesAccountId", "sales", "false"),
    ("src/modules/purchase-invoices/purchase-invoice-service.ts", "expenseAccountId", "purchases", "true"),
    ("src/modules/purchase-orders/purchase-order-service.ts", "expenseAccountId", "purchases", "true")
]

for file_path, account_field, direction, support_items in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    account_filter = "\"income\"" if direction == "sales" else "\"expense\""
    
    # Sometimes it is lines instead of data.lines (e.g. mapping) but actually calculateLines was called like:
    # calculateLines(sqlite, data, minorUnit) or calculateLines(sqlite, invoice, minorUnit)
    # wait! The 3 arguments are because calculateLines(sqlite, existing, minorUnit)
    
    content = re.sub(
        r"calculateLines\(([^,]+),\s*([^,]+),\s*([^),]+)\)", 
        rf"calculateLines(\1, \2.lines, \3, {{ accountTypeFilter: {account_filter}, taxDirection: \"{direction}\", supportItems: {support_items}, accountFieldOnLine: \"{account_field}\" }})", 
        content
    )
    
    # some files might still have 	otals( if the previous regex missed it because it was 	otals(existing.lines)
    content = re.sub(r"\btotals\s*\(", "totalsForLines(", content)
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
