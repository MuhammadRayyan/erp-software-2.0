import os
import re

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("minorToCurrencyInput", "currencyMinorUnitToInput")
c = c.replace("line.discountValue,", "line.discountValue || \"0\",")
c = c.replace("data.reference || null,", "data.reference || null, // fix ref\n")
c = c.replace("(data.purchaseInvoiceId || null) as string | null, data.amountsIncludeTax ? 1 : 0", "(data.purchaseInvoiceId || null) as string | null, data.amountsIncludeTax ? 1 : 0") # already string | null? Wait, maybe it's date?
# What is string | undefined on line 108?
# Let's fix line.projectId
c = c.replace("line.projectId,", "line.projectId || null,")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/debit-notes/actions.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("intent: DebitNoteIntent", "intent: \"draft\" | \"post\"")
c = c.replace(", DebitNoteIntent } from", "} from")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/debit-notes/debit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = re.sub(r'<div className="space-y-1\.5 md:col-span-2">\s*<Label htmlFor="reason">.*?</Input>\s*</div>', '', c, flags=re.DOTALL)
c = re.sub(r'<div className="space-y-1\.5 md:col-span-2">.*?name="reason".*?</div>', '', c, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
