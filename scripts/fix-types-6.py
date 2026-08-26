import os
import re

filepath = "src/modules/debit-notes/debit-note-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("data.projectId)", "data.projectId || null)")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/debit-notes/debit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = re.sub(r'<div className="space-y-1\.5 md:col-span-2">\s*<Label htmlFor="reason">.*?</Input>\s*</div>', '', c, flags=re.DOTALL)
c = re.sub(r'<Label htmlFor="reason">.*?reason.*?</div>', '', c, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
