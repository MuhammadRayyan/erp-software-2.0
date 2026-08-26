import os

filepath = "src/core/db/business-schema.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('purchaseAccountId: text("purchase_account_id")', 'expenseAccountId: text("expense_account_id")')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
