import os
import re

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("sqlite.prepare(INSERT INTO debit_note_lines", "sqlite.prepare(INSERT INTO debit_note_lines")
content = content.replace("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?));", "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?););")

content = content.replace("context.sqlite.prepare(UPDATE debit_notes SET", "context.sqlite.prepare(UPDATE debit_notes SET")
content = content.replace("WHERE id = ?).run(", "WHERE id = ?).run(")

content = content.replace("context.sqlite.prepare(\n        INSERT INTO debit_notes", "context.sqlite.prepare(\n        INSERT INTO debit_notes")
content = content.replace("NULL, NULL\n        )\n      ).run(", "NULL, NULL\n        )\n      ).run(")

content = content.replace("context.sqlite.prepare(UPDATE debit_notes SET document_status = 'posted'", "context.sqlite.prepare(UPDATE debit_notes SET document_status = 'posted'")
content = content.replace("WHERE id = ?).run(now, id);", "WHERE id = ?).run(now, id);")

content = content.replace("context.sqlite.prepare(UPDATE debit_notes SET document_status = 'void'", "context.sqlite.prepare(UPDATE debit_notes SET document_status = 'void'")
content = content.replace("WHERE id = ?).run(now, now, noteId);", "WHERE id = ?).run(now, now, noteId);")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("done")
