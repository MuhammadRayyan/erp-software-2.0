import os
import re

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

lines = c.split("\n")
for i, line in enumerate(lines):
    if "const taxDate = data.taxDate || data.date;" in line:
        if i > 50:
            lines[i] = ""

c = "\n".join(lines)
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('input, "sent"', 'input, "issue"')
c = c.replace('input, "issued"', 'input, "issue"')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
