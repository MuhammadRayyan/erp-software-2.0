import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = "import { saveDebitNote, getDebitNote } from \"@/modules/debit-notes/debit-note-service\";\n" + c

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
