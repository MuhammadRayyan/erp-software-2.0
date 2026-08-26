import os
import re

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# Fix the broken backticks and template string
c = re.sub(r'Void Debit Note \{note\.debitNoteNumber\}', r'Void Debit Note ${note.debitNoteNumber}', c)
c = re.sub(r'description: Void Debit Note \$\{note\.debitNoteNumber\}', r'description: `Void Debit Note ${note.debitNoteNumber}`', c)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
