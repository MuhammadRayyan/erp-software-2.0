import os

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('import { getExchangeRateContext, storedRateSnapshot } from "@/modules/currency/currency";', 
'import { resolveRateSnapshot, storedRateSnapshot } from "@/modules/currency/validation";\nimport { convertDocumentLinesToBase } from "@/modules/currency/conversion";')

usage_old = "  const { rate, base } = getExchangeRateContext(context.sqlite, data);"
usage_new = """  const taxDate = data.taxDate || data.date;
  const rate = resolveRateSnapshot(context.sqlite, {
    currencyCode: data.currencyCode,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: taxDate,
    taxCodeIds: data.lines.map((l) => l.taxCodeId)
  });"""
c = c.replace(usage_old, usage_new)

base_calc_new = """  const totals = totalsForLines(lines);
  const amounts = totals;
  const base = convertDocumentLinesToBase(lines, rate);"""

c = c.replace("  const amounts = totalsForLines(lines);", base_calc_new)

c = c.replace('import { postDebitNote } from "@/modules/accounting/services/debit-note-posting-service";',
'import { postDebitNote } from "@/modules/accounting/services/debit-note-posting-service";\nimport { reverseTransaction } from "@/modules/accounting/services/posting-service";')

c = c.replace('reversePurchaseDocumentInLedger(context, id, "debit_note_void");', 
'reverseTransaction(context.sqlite, { originalSourceType: "debit_note", originalSourceId: id, reversalSourceType: "debit_note_void", reversalSourceId: id, date: now.slice(0, 10), description: Void Debit Note  });')
c = c.replace('reversePurchaseDocumentInLedger(context, noteId, "debit_note_void");', 
'reverseTransaction(context.sqlite, { originalSourceType: "debit_note", originalSourceId: noteId, reversalSourceType: "debit_note_void", reversalSourceId: noteId, date: now.slice(0, 10), description: Void Debit Note  });')
c = c.replace('reversePurchaseDocumentInLedger', 'reverseTransaction')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
