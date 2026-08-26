import os
import re

# actions.ts
with open("src/modules/debit-notes/actions.ts", "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace(", type DebitNoteIntent", "")
c = c.replace("intent: DebitNoteIntent", "intent: \"draft\" | \"post\"")
with open("src/modules/debit-notes/actions.ts", "w", encoding="utf-8") as f:
    f.write(c)

# debit-note-form.tsx
with open("src/modules/debit-notes/debit-note-form.tsx", "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace('import { type DebitNoteStatus } from "./debit-note-service";\n', "")
c = c.replace('import { DebitNoteStatus } from "./debit-note-service";\n', "")
c = c.replace("status?: DebitNoteStatus", "status?: string")
c = re.sub(r'import \{.*?\} from "./debit-note-service";', 'import {  } from "./debit-note-service";', c) # we might have killed the wrong import, let's just do it manually if needed

# Let's fix the imports safely
with open("src/modules/debit-notes/debit-note-form.tsx", "r", encoding="utf-8") as f:
    c = f.read()
c = re.sub(r'import \{ type DebitNoteStatus \} from "\./debit-note-service";\n?', '', c)
c = re.sub(r'import \{ DebitNoteStatus \} from "\./debit-note-service";\n?', '', c)

# debit-note-table.tsx
with open("src/modules/debit-notes/debit-note-table.tsx", "r", encoding="utf-8") as f:
    c = f.read()
c = re.sub(r'import \{.*?DebitNoteStatus.*?\} from "\./debit-note-service";\n?', '', c)
c = c.replace("status: DebitNoteStatus", "status: string")
with open("src/modules/debit-notes/debit-note-table.tsx", "w", encoding="utf-8") as f:
    f.write(c)

# debit-note-view-actions.tsx
with open("src/modules/debit-notes/debit-note-view-actions.tsx", "r", encoding="utf-8") as f:
    c = f.read()
c = re.sub(r'import \{.*?DebitNoteStatus.*?\} from "\./debit-note-service";\n?', '', c)
c = c.replace("status: DebitNoteStatus", "status: string")
with open("src/modules/debit-notes/debit-note-view-actions.tsx", "w", encoding="utf-8") as f:
    f.write(c)

# tests/phase-10-new-features.test.ts
with open("tests/phase-10-new-features.test.ts", "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("export type SalesQuoteIntent", "// export type SalesQuoteIntent")
c = c.replace("export type SalesOrderIntent", "// export type SalesOrderIntent")
with open("tests/phase-10-new-features.test.ts", "w", encoding="utf-8") as f:
    f.write(c)

print("done")
