import os

def process_dir(directory, search_kebab, replacement_kebab, search_camel, replacement_camel, search_pascal, replacement_pascal):
    for root, _, files in os.walk(directory):
        for f in files:
            if not f.endswith(".tsx") and not f.endswith(".ts"): continue
            filepath = os.path.join(root, f)
            with open(filepath, "r", encoding="utf-8") as file:
                c = file.read()
            
            c = c.replace(search_kebab, replacement_kebab)
            c = c.replace(search_camel, replacement_camel)
            c = c.replace(search_pascal, replacement_pascal)
            
            # Specific plural replacements
            if replacement_kebab == "sales-quotes":
                c = c.replace("Supplier", "Customer")
                c = c.replace("supplierId", "customerId")
                c = c.replace("purchase order", "sales quote")
                c = c.replace("Purchase order", "Sales quote")
                c = c.replace("Purchase Order", "Sales Quote")
            elif replacement_kebab == "sales-orders":
                c = c.replace("Supplier", "Customer")
                c = c.replace("supplierId", "customerId")
                c = c.replace("purchase order", "sales order")
                c = c.replace("Purchase order", "Sales order")
                c = c.replace("Purchase Order", "Sales Order")

            with open(filepath, "w", encoding="utf-8") as file:
                file.write(c)

process_dir("src/app/b/[businessId]/sales-quotes", "purchase-orders", "sales-quotes", "purchaseOrder", "salesQuote", "PurchaseOrder", "SalesQuote")
process_dir("src/app/b/[businessId]/sales-quotes", "purchase-order", "quote", "purchaseOrder", "salesQuote", "PurchaseOrder", "SalesQuote")

process_dir("src/app/b/[businessId]/sales-orders", "purchase-orders", "sales-orders", "purchaseOrder", "salesOrder", "PurchaseOrder", "SalesOrder")
process_dir("src/app/b/[businessId]/sales-orders", "purchase-order", "sales-order", "purchaseOrder", "salesOrder", "PurchaseOrder", "SalesOrder")

print("done")
