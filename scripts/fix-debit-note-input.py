import os
import re

filepath = "src/modules/debit-notes/debit-note-input.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = re.sub(r'import \{ debitNoteReasonCodeValues \} from "@/modules/einvoicing/einvoice-types";\n', '', c)
c = re.sub(r'supplyEmirate:.*?,', '', c)
c = re.sub(r'eInvoiceReasonCode:.*?,', '', c)
c = re.sub(r'eInvoiceTransactionFlags:.*?,', '', c)
c = re.sub(r'reason: z\.string.*?,', '', c)
c = c.replace('sourceInvoiceId', 'purchaseInvoiceId')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
