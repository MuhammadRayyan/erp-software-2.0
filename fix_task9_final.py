import re

file_path = "src/modules/accounting/services/purchase-invoice-posting-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if line.startswith("type ProjectAmount = {"):
        skip = True
    if not skip:
        new_lines.append(line)
    if line.startswith("}") and skip:
        skip = False

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)
