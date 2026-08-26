import os
import re

filepath = "src/modules/tax/tax-entry-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('sourceType: "sales_invoice" | "sales_credit_note" | "purchase_invoice" | "bank_transaction";', 'sourceType: "sales_invoice" | "sales_credit_note" | "purchase_invoice" | "debit_note" | "bank_transaction";')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = re.sub(r'reverseTransaction\(context, noteId, "debit_note", "void"\);', 'reverseTransaction(context.sqlite, { originalSourceType: "debit_note", originalSourceId: noteId, reversalSourceType: "debit_note_void", reversalSourceId: noteId, date: now.slice(0, 10), description: Void Debit Note  });', c)
c = re.sub(r'reversePurchaseDocumentInLedger\(.*?\);', 'reverseTransaction(context.sqlite, { originalSourceType: "debit_note", originalSourceId: noteId, reversalSourceType: "debit_note_void", reversalSourceId: noteId, date: now.slice(0, 10), description: Void Debit Note  });', c)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
