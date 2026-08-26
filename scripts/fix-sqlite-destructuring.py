import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('const sqlite = getBusinessDb(businessId, adminId).db;', 'const { sqlite } = getBusinessDb(businessId, adminId);')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
