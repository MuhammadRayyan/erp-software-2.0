import os

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("import { calculateLines, totalsForLines } from \"@/modules/accounting/calculations/money\";", "import { calculateLines, totalsForLines } from \"@/modules/accounting/services/document-line-calculator\";")

c = c.replace("export function saveDebitNote(businessId: string, userId: string, data: DebitNoteInput, intent: \"draft\" | \"post\", noteId?: string) {", "export type DebitNoteStatus = \"draft\" | \"posted\" | \"void\";\nexport type DebitNoteIntent = \"draft\" | \"post\";\nexport function saveDebitNote(businessId: string, userId: string, data: DebitNoteInput, intent: DebitNoteIntent, noteId?: string) {")
c = c.replace("intent: \"draft\" | \"post\",", "intent: DebitNoteIntent,")
c = c.replace("const postingLines = lines.map((line) =>", "const postingLines = lines.map((line: any) =>")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)


# Re-add DebitNoteStatus exports/imports
# Wait, I just added DebitNoteStatus to service.ts!

# fix debit-note-form.tsx
filepath = "src/modules/debit-notes/debit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("import {  } from \"./debit-note-service\";", "import { DebitNoteStatus } from \"./debit-note-service\";")
import re
c = re.sub(r'import \{\s*\} from "\./debit-note-service";', 'import { DebitNoteStatus } from "./debit-note-service";', c)
c = c.replace("status?: string", "status?: DebitNoteStatus")
c = c.replace("status: string", "status: DebitNoteStatus")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# fix actions.ts
filepath = "src/modules/debit-notes/actions.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("import { saveDebitNote, voidDebitNote, deleteDebitNote, duplicateDebitNote } from \"./debit-note-service\";", "import { saveDebitNote, voidDebitNote, deleteDebitNote, duplicateDebitNote, DebitNoteIntent } from \"./debit-note-service\";")
c = c.replace("intent: \"draft\" | \"post\"", "intent: DebitNoteIntent")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# fix debit-note-table.tsx
filepath = "src/modules/debit-notes/debit-note-table.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("import { CreditNoteStatus } from \"./sales-credit-note-service\";", "import { DebitNoteStatus } from \"./debit-note-service\";\nimport { CreditNoteStatus } from \"../sales-credit-notes/sales-credit-note-service\";") # wait, might not be there
c = c.replace("status: string", "status: DebitNoteStatus")
if "DebitNoteStatus" not in c and "status" in c:
    c = "import { DebitNoteStatus } from \"./debit-note-service\";\n" + c
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# fix debit-note-view-actions.tsx
filepath = "src/modules/debit-notes/debit-note-view-actions.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("status: string", "status: DebitNoteStatus")
if "DebitNoteStatus" not in c and "status" in c:
    c = "import { DebitNoteStatus } from \"./debit-note-service\";\n" + c
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
