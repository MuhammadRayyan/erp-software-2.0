import os
import re

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# strip my test
c = re.sub(r'test\("Debit Notes correctly calculate discount, tax inclusive, and ledger posting".*?\}\);', '', c, flags=re.DOTALL)
c = c.replace("import { saveDebitNote, getDebitNote } from \"@/modules/debit-notes/debit-note-service\";\n", "")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)
