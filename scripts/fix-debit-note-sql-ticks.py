import os

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("context.sqlite.prepare(\n      SELECT n.*", "context.sqlite.prepare(\n      SELECT n.*")
content = content.replace("WHERE n.id = ?\n    ).get(noteId)", "WHERE n.id = ?\n    ).get(noteId)")

content = content.replace("context.sqlite.prepare(\n      SELECT l.*", "context.sqlite.prepare(\n      SELECT l.*")
content = content.replace("ORDER BY l.position ASC\n    ).all(noteId)", "ORDER BY l.position ASC\n    ).all(noteId)")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("done")
