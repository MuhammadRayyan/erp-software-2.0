import os

file_path = "src/modules/sales-invoices/invoice-view-actions.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

lines = content.split('\n')
new_lines = []
for line in lines:
    if "router.push(" in line and "result.data" in line:
        continue
    new_lines.append(line)

with open(file_path, "w", encoding="utf-8") as f:
    f.write('\n'.join(new_lines))
