import os

filepath = "src/modules/debit-notes/actions.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("import { saveDebitNote, voidDebitNote, deleteDebitNote, duplicateDebitNote, DebitNoteIntent } from \"./debit-note-service\";", "import { saveDebitNote, voidDebitNote, deleteDebitNote, duplicateDebitNote } from \"./debit-note-service\";")
c = c.replace("intent: DebitNoteIntent,", "intent: \"draft\" | \"post\",")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/debit-notes/debit-note-table.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("import { DebitNoteStatus } from \"./debit-note-service\";", "")
c = c.replace("function StatusBadge({ status }: { status: DebitNoteStatus }) {", "function StatusBadge({ status }: { status: string }) {")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/debit-notes/debit-note-view-actions.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("import { DebitNoteStatus } from \"./debit-note-service\";", "")
c = c.replace("status: DebitNoteStatus;", "status: string;")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/debit-notes/debit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("import { DebitNoteStatus } from \"./debit-note-service\";", "")
c = c.replace("export function DebitNoteForm({ businessId, noteId, initialData, defaultCurrency, defaultSupplierId, defaultPurchaseInvoiceId, status }: { businessId: string; noteId?: string; initialData?: any; defaultCurrency: string; defaultSupplierId?: string; defaultPurchaseInvoiceId?: string; status?: DebitNoteStatus }) {", "export function DebitNoteForm({ businessId, noteId, initialData, defaultCurrency, defaultSupplierId, defaultPurchaseInvoiceId, status }: { businessId: string; noteId?: string; initialData?: any; defaultCurrency: string; defaultSupplierId?: string; defaultPurchaseInvoiceId?: string; status?: string }) {")

# Remove supplyEmirate from debit-note-form.tsx completely!
import re
c = re.sub(r'<div className="w-full sm:w-1/2">.*?\{\.\.\.register\("supplyEmirate"\)\}.*?</div>', '', c, flags=re.DOTALL)
c = re.sub(r'<div className="w-full sm:w-1/2">.*?\{\.\.\.register\("eInvoiceReasonCode"\)\}.*?</div>', '', c, flags=re.DOTALL)
c = re.sub(r'<div className="w-full">.*?\{\.\.\.register\("reason"\)\}.*?</div>', '', c, flags=re.DOTALL)
c = re.sub(r'<details className="rounded-lg border border-border bg-surface-raised">.*?</details>', '', c, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
