import os

filepath = "src/modules/sales-quotes/quote-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("purchasePriceMinor", "salesPriceMinor")
c = c.replace("inventoryAssetAccountId", "salesAccountId")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

filepath = "src/modules/sales-orders/sales-order-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()
c = c.replace("purchasePriceMinor", "salesPriceMinor")
c = c.replace("inventoryAssetAccountId", "salesAccountId")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
