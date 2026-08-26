import os
import re

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# I will just write a function to strip out the offending args from run calls in debit-note-service
c = re.sub(r'data\.supplyEmirate,\s*', '', c)
c = re.sub(r'data\.reason \|\| null,\s*', '', c)
c = re.sub(r'data\.eInvoiceReasonCode,\s*', '', c)
c = re.sub(r'JSON\.stringify\(data\.eInvoiceTransactionFlags\),\s*', '', c)

c = re.sub(r'supplyEmirate: header\.debitNote\.supplyEmirate.*?,', '', c, flags=re.DOTALL)
c = re.sub(r'reason: header\.debitNote\.reason \|\| "",', '', c)
c = re.sub(r'eInvoiceTransactionFlags: header\.debitNote\.eInvoiceTransactionFlagsJson.*?,', '', c, flags=re.DOTALL)
c = re.sub(r'date: header\.debitNote\.debitNoteDate,', 'date: header.debitNote.debitNoteDate,', c)
c = c.replace('date: header.debitNote.date,', 'date: header.debitNote.debitNoteDate,')


with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
