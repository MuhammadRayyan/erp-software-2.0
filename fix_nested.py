import re

file_path = "src/modules/accounting/services/purchase-invoice-posting-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Just manually strip out the whole function
start = content.find("function addProjectAmount")
if start != -1:
    end = content.find("}\n", start + 50)
    if end != -1:
        # Check if there are more braces
        end2 = content.find("}\n", end + 1)
        if end2 != -1:
            content = content[:start] + content[end2+2:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
