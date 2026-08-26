import os

filepath = "src/core/db/business-schema.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('documentStatus: text("document_status", { enum: ["draft", "sent", "accepted", "rejected"] })',
'documentStatus: text("document_status", { enum: ["draft", "sent", "accepted", "rejected", "cancelled"] })')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
