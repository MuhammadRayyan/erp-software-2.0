import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("expect(quote.quote.amountsIncludeTax).toBe(true);", "expect((quote as any).quote.amountsIncludeTax).toBe(true);")
c = c.replace("expect(quote.quote.totalMinor).toBe(12600);", "expect((quote as any).quote.totalMinor).toBe(12600);")
c = c.replace("expect(quote.quote.taxMinor).toBe(600);", "expect((quote as any).quote.taxMinor).toBe(600);")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
