import os

for filepath in ["src/modules/sales-quotes/quote-service.ts", "src/modules/sales-orders/sales-order-service.ts"]:
    with open(filepath, "r", encoding="utf-8") as f:
        c = f.read()

    c = c.replace('accountTypeFilter: "expense"', 'accountTypeFilter: "income"')
    c = c.replace('taxDirection: "purchases"', 'taxDirection: "sales"')

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(c)

print("done")
