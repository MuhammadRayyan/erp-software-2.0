import os
import re

files = [
    ("src/modules/sales-invoices/invoice-service.ts", "salesAccountId", "sales", True),
    ("src/modules/sales-credit-notes/credit-note-service.ts", "salesAccountId", "sales", False),
    ("src/modules/purchase-invoices/purchase-invoice-service.ts", "expenseAccountId", "purchases", True),
    ("src/modules/purchase-orders/purchase-order-service.ts", "expenseAccountId", "purchases", True)
]

for file_path, account_field, direction, support_items in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove StoredLine definition
    content = re.sub(r"type StoredLine = \{[^}]+\};\n\n?", "", content)

    # Remove calculateLines
    start_calc = content.find("function calculateLines(")
    if start_calc != -1:
        brace_count = 0
        in_string = False
        end_calc = -1
        for i in range(start_calc, len(content)):
            if content[i] == '\"':
                in_string = not in_string
            if not in_string:
                if content[i] == "{":
                    brace_count += 1
                elif content[i] == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        end_calc = i
                        break
        
        if end_calc != -1:
            content = content[:start_calc] + content[end_calc+1:].lstrip()

    # Remove totals
    start_totals = content.find("function totals")
    if start_totals != -1:
        brace_count = 0
        end_totals = -1
        for i in range(start_totals, len(content)):
            if content[i] == "{":
                brace_count += 1
            elif content[i] == "}":
                brace_count -= 1
                if brace_count == 0:
                    end_totals = i
                    break
        if end_totals != -1:
            content = content[:start_totals] + content[end_totals+1:].lstrip()

    account_filter = "\"income\"" if direction == "sales" else "\"expense\""
    support_str = "true" if support_items else "false"
    
    content = re.sub(r"calculateLines\(([^,]+),\s*([^,]+),\s*([^)]+)\)", 
                     rf"calculateLines(\1, \2.lines, \3, {{ accountTypeFilter: {account_filter}, taxDirection: \"{direction}\", supportItems: {support_str}, accountFieldOnLine: \"{account_field}\" }})", 
                     content)

    content = re.sub(r"\btotals\s*\(", "totalsForLines(", content)
    content = re.sub(r"\btotalsFromLines\s*\(", "totalsForLines(", content)

    import_statement = "import { calculateLines, totalsForLines, type StoredLine } from \"@/modules/accounting/services/document-line-calculator\";\n"
    if "calculateLines" in content and "import { calculateLines" not in content:
        last_import = content.rfind("import ")
        end = content.find("\n", last_import) + 1
        content = content[:end] + import_statement + content[end:]

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
