import re

file_path = "src/modules/purchase-orders/purchase-order-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(
    r"function calculateLines\(.*?\}\n\nfunction totals",
    "function totals",
    content,
    flags=re.DOTALL
)

content = re.sub(
    r"function totals\(lines: StoredLine\[\]\) \{.*?\}\n",
    "",
    content,
    flags=re.DOTALL
)

content = re.sub(
    r"type StoredLine = \{.*?\};\n\n?",
    "",
    content,
    flags=re.DOTALL
)

content = re.sub(
    r"const lines = calculateLines\(sqlite, data, minorUnit\);",
    'const lines = calculateLines(sqlite, data.lines, minorUnit, { accountTypeFilter: "expense", taxDirection: "purchases", supportItems: true, accountFieldOnLine: "expenseAccountId" });',
    content
)
content = re.sub(r"\btotals\(", "totalsForLines(", content)

import_stmt = 'import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";\n'
last_import = content.rfind("import ")
end = content.find("\n", last_import) + 1
content = content[:end] + import_stmt + content[end:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
