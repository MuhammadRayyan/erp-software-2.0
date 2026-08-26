import os

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# Fix db import
c = c.replace('from "@/core/db/business-db"', 'from "@/core/db/business"')

# Fix currency import
c = c.replace('from "@/modules/currency/currency-service"', 'from "@/modules/currency/currency"')

# Fix tax imports
c = c.replace('replaceTaxEntries,\n  reverseTaxEntries,\n  assertVatDateUnlocked,\n  assertVatSourceUnlocked,\n} from "@/modules/tax/tax-service"', 'replaceTaxEntries,\n  reverseTaxEntries\n} from "@/modules/tax/tax-entry-service";\nimport {\n  assertVatDateUnlocked,\n  assertVatSourceUnlocked,\n} from "@/modules/tax/tax-lock-service"')

# Fix posting import
c = c.replace('from "@/modules/accounting/services/purchase-posting-service"', 'from "@/modules/accounting/services/debit-note-posting-service"')
c = c.replace('import { postPurchaseDocumentToLedger, reversePurchaseDocumentInLedger }', 'import { postDebitNote }')

# Fix the call to postDebitNote
# The old call was: postPurchaseDocumentToLedger(context, id, "debit_note");
# But postDebitNote expects: sqlite, { id, debitNoteNumber, supplierId, date, totalMinor, rate }, postingLines, replace
post_call = """      postDebitNote(context.sqlite, { id, debitNoteNumber: number, supplierId: data.supplierId, date: data.date, totalMinor: amounts.totalMinor, rate }, postingLines, replace);"""
c = c.replace('      postPurchaseDocumentToLedger(context, id, "debit_note");', post_call)

# Fix reversePurchaseDocumentInLedger if it exists
# Oh wait, debit notes voiding doesn't use reversePurchaseDocumentInLedger, it uses reverseTransaction!
# Let me check if debit-note-service has reversePurchaseDocumentInLedger
if "reversePurchaseDocumentInLedger" in c:
    pass # Wait, if it's there I need to fix it!

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
