import os

quotes_dir = "src/modules/sales-quotes"
orders_dir = "src/modules/sales-orders"

def fix_content(directory, old_file_prefix, new_file_prefix, is_quotes):
    for root, dirs, files in os.walk(directory):
        for file in files:
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                c = f.read()
            
            c = c.replace(f"./{old_file_prefix}-", f"./{new_file_prefix}-")
            c = c.replace("salesQuotesLines", "salesQuoteLines")
            c = c.replace("salesOrdersLines", "salesOrderLines")
            c = c.replace(".status", ".documentStatus")
            c = c.replace("status:", "documentStatus:")
            c = c.replace("quoteBy(", "orderBy(")
            
            with open(path, "w", encoding="utf-8") as f:
                f.write(c)

fix_content(quotes_dir, "purchase-order", "quote", True)
fix_content(orders_dir, "purchase-order", "sales-order", False)
print("done")
