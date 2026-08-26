import os

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('reverseTransaction(context.sqlite, { originalSourceType: "debit_note", originalSourceId: noteId, reversalSourceType: "debit_note_void", reversalSourceId: noteId, date: now.slice(0, 10), description: Void Debit Note  });', 
'reverseTransaction(context.sqlite, { originalSourceType: "debit_note", originalSourceId: noteId, reversalSourceType: "debit_note_void", reversalSourceId: noteId, date: now.slice(0, 10), description: `Void Debit Note ${note.debitNoteNumber}` });')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
