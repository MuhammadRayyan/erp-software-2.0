import os
import re

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(r'sqlite\.prepare\(INSERT INTO debit_note_lines(.*?)VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)\)', r'sqlite.prepare(INSERT INTO debit_note_lines\1VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?))\n', content, flags=re.DOTALL)

content = re.sub(r'sqlite\.prepare\(UPDATE debit_notes SET(.*?)WHERE id = \?\)', r'sqlite.prepare(UPDATE debit_notes SET\1WHERE id = ?)', content, flags=re.DOTALL)

content = re.sub(r'sqlite\.prepare\(\s*INSERT INTO debit_notes(.*?)\)\s*\)\.run', r'sqlite.prepare(\n        INSERT INTO debit_notes\1)\n      ).run', content, flags=re.DOTALL)

content = re.sub(r'sqlite\.prepare\(UPDATE debit_notes SET document_status = \'posted\'(.*?)\)', r'sqlite.prepare(UPDATE debit_notes SET document_status = \'posted\'\1)', content, flags=re.DOTALL)

content = re.sub(r'sqlite\.prepare\(UPDATE debit_notes SET document_status = \'void\'(.*?)\)', r'sqlite.prepare(UPDATE debit_notes SET document_status = \'void\'\1)', content, flags=re.DOTALL)


content = re.sub(r'sqlite\.prepare\(\s*SELECT n\.\*(.*?)WHERE n\.id = \?\s*\)', r'sqlite.prepare(\n    SELECT n.*\1WHERE n.id = ?\n  )', content, flags=re.DOTALL)

content = re.sub(r'sqlite\.prepare\(\s*SELECT l\.\*(.*?)ORDER BY l\.position ASC\s*\)', r'sqlite.prepare(\n    SELECT l.*\1ORDER BY l.position ASC\n  )', content, flags=re.DOTALL)


with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("done")
