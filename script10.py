
import os
import re

file_path = "src/modules/accounting/services/purchase-invoice-posting-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(r"function addAmount\([^}]+\}\n", "", content)
content = re.sub(r"function addProjectAmount\([^}]+\}\n", "", content)

if "addAmount" in content and "import { addAmount" not in content:
    content = content.replace("import { addMinor } from \"../calculations/money\";\n", "import { addMinor } from \"../calculations/money\";\nimport { addAmount, addProjectAmount, ProjectAmount } from \"./posting-helpers\";\n")
    content = content.replace("type ProjectAmount = { accountId: string; projectId: string | null; amountMinor: number };\n\n", "")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

