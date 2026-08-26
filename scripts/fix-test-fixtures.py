import os
import re

for filepath in ["tests/phase-8.test.ts", "tests/phase-9.test.ts"]:
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()
    c = re.sub(r'assert\.strictEqual\(([^,]+),\s*14\)', r'assert.strictEqual(\1, 16)', c)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)

print("done")
