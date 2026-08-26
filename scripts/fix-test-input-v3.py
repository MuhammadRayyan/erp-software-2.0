import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('amountsIncludeTax: true, // test inclusive', 'currency: "AED",\n      exchangeRate: "",\n      amountsIncludeTax: true, // test inclusive')
c = c.replace('amountsIncludeTax: false,', 'currency: "AED",\n      exchangeRate: "",\n      amountsIncludeTax: false,')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
