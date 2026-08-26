import os
import re

# Fix tests
filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('intent: "sent" as any', 'intent: "issue"')
c = c.replace('intent: "issued" as any', 'intent: "issue"')
c = c.replace('intent: "sent"', 'intent: "issue"')
c = c.replace('intent: "issued"', 'intent: "issue"')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# Fix debit-note-service.ts
filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = re.sub(r'const taxDate = data\.taxDate \|\| data\.date;\n\s*const taxDate = data\.taxDate \|\| data\.date;', 'const taxDate = data.taxDate || data.date;', c)

c = c.replace('currencyCode: data.currencyCode,', 'currencyCode: data.currencyCode ?? "AED",')

c = c.replace(', replace);', ', false);')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
