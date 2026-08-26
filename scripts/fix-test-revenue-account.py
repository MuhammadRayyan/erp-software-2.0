import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('FROM accounts LIMIT 1', "FROM accounts WHERE type = 'revenue' LIMIT 1")
c = c.replace('accountId: standardAccount', 'salesAccountId: standardAccount')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
