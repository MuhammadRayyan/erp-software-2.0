import os
import re

filepath = "src/modules/debit-notes/debit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = re.sub(r'import \{ debitNoteReasonCodes \} from "@/modules/einvoicing/einvoice-types";\n', '', c)

c = re.sub(r'supplyEmirate: "abu_dhabi",\n\s+eInvoiceReasonCode: "1",\n\s+eInvoiceTransactionFlags: \{.*?\},', '', c, flags=re.DOTALL)
c = re.sub(r'reason: "",\n\s+', '', c)

c = re.sub(r'<FormField.*?name="reason".*?</FormItem>\n\s+</FormField>', '', c, flags=re.DOTALL)
c = re.sub(r'<FormField.*?name="supplyEmirate".*?</FormItem>\n\s+</FormField>', '', c, flags=re.DOTALL)
c = re.sub(r'<FormField.*?name="eInvoiceReasonCode".*?</FormItem>\n\s+</FormField>', '', c, flags=re.DOTALL)

# eInvoiceTransactionFlags render
c = re.sub(r'<div className="col-span-full border rounded-md p-4 bg-muted/20">.*?</div>', '', c, flags=re.DOTALL)

c = c.replace('sourceInvoiceId', 'purchaseInvoiceId')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
