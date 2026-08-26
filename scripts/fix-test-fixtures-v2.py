import os

filepath = "src/app/api/businesses/[businessId]/form-defaults/[formType]/route.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("export const runtime = 'nodejs';", 'export const runtime = "nodejs";')
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)


for filepath in ["tests/phase-8.test.ts", "tests/phase-9.test.ts"]:
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()
    c = c.replace("assert.strictEqual(migrations.length, 14);", "assert.strictEqual(migrations.length, 16);")
    c = c.replace("assert.strictEqual(finalState.currentVersion, 14);", "assert.strictEqual(finalState.currentVersion, 16);")
    c = c.replace("assert.strictEqual(finalState.latestVersion, 14);", "assert.strictEqual(finalState.latestVersion, 16);")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)

print("done")
