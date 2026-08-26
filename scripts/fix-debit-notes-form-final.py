import os
import re

filepath = "src/modules/debit-notes/debit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = re.sub(r'<div className="space-y-1\.5 md:col-span-2">\s*<Label htmlFor="reason">.*?</Input>\s*</div>', '', c, flags=re.DOTALL)
c = re.sub(r'<div className="space-y-1\.5 md:col-span-2">\s*<Label htmlFor="eInvoiceReasonCode">.*?</SelectNative>\s*</div>', '', c, flags=re.DOTALL)
c = re.sub(r'<div className="space-y-1\.5">\s*<Label htmlFor="supplyEmirate">.*?</SelectNative>\s*</div>', '', c, flags=re.DOTALL)
c = re.sub(r'<details className="rounded-lg border border-border bg-surface-raised">.*?</details>', '', c, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
