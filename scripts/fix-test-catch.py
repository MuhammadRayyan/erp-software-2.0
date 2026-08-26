import os

filepath = "tests/debit-notes.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("""  const noteId = saveDebitNote("test-business-1", "system", {""", """  let noteId = "";
  try {
    noteId = saveDebitNote("test-business-1", "system", {""")
c = c.replace("""  }, "post");""", """  }, "post");
  } catch (e: any) {
    console.error("SAVE ERROR:", e);
    throw e;
  }
""")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
