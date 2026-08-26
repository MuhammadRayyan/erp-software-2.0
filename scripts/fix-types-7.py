import os

filepath = "src/modules/debit-notes/debit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("""          <div className="space-y-1.5 md:col-span-2">
            
          
        </div>""", """        </div>""")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
