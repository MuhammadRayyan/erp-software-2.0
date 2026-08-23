import re

file_path = "src/modules/sales-invoices/invoice-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace calculateLines signature and body
content = re.sub(
    r"function calculateLines\(.*?\}\n\nfunction totalsForLines",
    "function totalsForLines",
    content,
    flags=re.DOTALL
)

# Remove totalsForLines
content = re.sub(
    r"function totalsForLines\(lines: StoredLine\[\]\) \{.*?\}\n",
    "",
    content,
    flags=re.DOTALL
)

# Remove StoredLine type
content = re.sub(
    r"type StoredLine = \{.*?\};\n\n?",
    "",
    content,
    flags=re.DOTALL
)

# Fix calculateLines call
# Old: const lines = calculateLines(sqlite, data, minorUnit);
# New: const lines = calculateLines(sqlite, data.lines, minorUnit, { accountTypeFilter: "income", taxDirection: "sales", supportItems: true, accountFieldOnLine: "salesAccountId" });
content = re.sub(
    r"const lines = calculateLines\(sqlite, data, minorUnit\);",
    'const lines = calculateLines(sqlite, data.lines, minorUnit, { accountTypeFilter: "income", taxDirection: "sales", supportItems: true, accountFieldOnLine: "salesAccountId" });',
    content
)

# Fix totalsForLines call (none needed, the function name is the same)
# But wait, did I remove totalsForLines? Yes. The new one is totalsForLines.

import_stmt = 'import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";\n'
last_import = content.rfind("import ")
end = content.find("\n", last_import) + 1
content = content[:end] + import_stmt + content[end:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
