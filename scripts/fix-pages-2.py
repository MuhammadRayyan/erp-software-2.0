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
            
            # Since they were copied from sales_invoices:
            if "quotes" in directory:
                c = c.replace("Invoice", "Quote")
                c = c.replace("invoice", "quote")
                c = c.replace("INVOICE", "QUOTE")
                c = c.replace("sales_quote", "sales_quote")
                c = c.replace("salesAccountId", "salesAccountId")
            elif "orders" in directory:
                c = c.replace("Invoice", "Order")
                c = c.replace("invoice", "order")
                c = c.replace("INVOICE", "ORDER")
                c = c.replace("sales_order", "sales_order")
                c = c.replace("salesAccountId", "salesAccountId")

            with open(filepath, "w", encoding="utf-8") as file:
                file.write(c)

process_dir("src/app/b/[businessId]/sales/quotes", "sales-invoices", "sales-quotes", "salesInvoice", "salesQuote", "SalesInvoice", "SalesQuote")
process_dir("src/app/b/[businessId]/sales/orders", "sales-invoices", "sales-orders", "salesInvoice", "salesOrder", "SalesInvoice", "SalesOrder")

print("done")
