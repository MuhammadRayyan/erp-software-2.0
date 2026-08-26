import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('const outputVatId = sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get().id;', 'const outputVatId = sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get().id;')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
