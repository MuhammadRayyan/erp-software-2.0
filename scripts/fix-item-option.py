import os

filepath = "src/modules/sales-quotes/quote-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("purchasePriceMinor: number | null;", "salesPriceMinor: number | null;")
c = c.replace("inventoryAssetAccountId: string", "salesAccountId: string")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/sales-orders/sales-order-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("purchasePriceMinor: number | null;", "salesPriceMinor: number | null;")
c = c.replace("inventoryAssetAccountId: string", "salesAccountId: string")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
