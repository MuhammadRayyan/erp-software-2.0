# -*- coding: utf-8 -*-
import os
import re

filepath = "src/modules/sales-credit-notes/credit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Fix variables
content = content.replace("availableProjects", "projects")
content = content.replace("defaultSalesAccountId", "defaultSales")
content = content.replace("itemId: \"\", ", "")
content = re.sub(r"\{baseEquivalentMinor != null && \([\s\S]*?<\/div>\s*\)\}", "", content)

# Remove the Item column header
content = content.replace("<th className=\"min-w-[150px] py-3 text-left font-semibold text-muted-foreground\">Item</th>", "")

# Remove the Item <select> column using regex because of encoding issues
content = re.sub(r"<td>\s*<select aria-label=\{Line \$\{index \+ 1\} inventory item\}[\s\S]*?<\/select>\s*<\/td>", "", content)

# Replace the conditional Sales Account render with just the select (since no itemId) using regex
content = re.sub(r"\{lines\[index\]\?\.itemId \? \([\s\S]*?\) : \([\s\S]*?<select aria-label=\{Line \$\{index \+ 1\} sales account\} ([\s\S]*?)<\/select>\s*\)\}", r"<select aria-label={Line  sales account} \1</select>", content)


with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
