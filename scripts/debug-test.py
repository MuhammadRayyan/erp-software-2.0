import os

filepath = "tests/debit-notes.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("expect(note.note.amountsIncludeTax).toBe(true);", "console.log(JSON.stringify(note, null, 2));\n  expect(note.note.amountsIncludeTax).toBe(true);")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)
