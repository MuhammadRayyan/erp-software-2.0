import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('FROM customers LIMIT 1', "FROM customers WHERE default_currency_code = 'AED' OR default_currency_code IS NULL LIMIT 1")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
