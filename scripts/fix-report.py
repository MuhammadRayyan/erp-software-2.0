import os

filepath = "src/modules/reports/report-service.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('sqlite.prepare(SELECT COUNT(*) as c FROM ${table}).get()', 'sqlite.prepare(`SELECT COUNT(*) as c FROM ${table}`).get()')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
