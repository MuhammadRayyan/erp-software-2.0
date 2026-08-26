import os
import re

quotes_dir = "src/modules/sales-quotes"
orders_dir = "src/modules/sales-orders"

def fix_content(directory, old_prefix, new_prefix):
    for root, dirs, files in os.walk(directory):
        for file in files:
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                c = f.read()
            
            c = c.replace("purchaseQuote", "salesQuote")
            c = c.replace("PurchaseQuote", "SalesQuote")
            c = c.replace("purchase-quote", "quote")
            c = c.replace("purchaseOrder", "salesOrder")
            c = c.replace("PurchaseOrder", "SalesOrder")
            c = c.replace("purchase-order", "sales-order")
            c = c.replace("sales-sales-order", "sales-order")
            c = c.replace("salessalesOrder", "salesOrder")
            c = c.replace("SalesSalesOrder", "SalesOrder")
            
            c = c.replace("salesQuoteId", "quoteId") # Fix ID column for quotes
            c = c.replace("salesOrderId", "orderId") # Fix ID column for orders
            
            with open(path, "w", encoding="utf-8") as f:
                f.write(c)

fix_content(quotes_dir, "purchase-quote", "quote")
fix_content(orders_dir, "purchase-order", "sales-order")
print("done")
