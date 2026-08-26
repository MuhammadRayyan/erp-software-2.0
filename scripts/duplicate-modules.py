import os
import shutil

src_dir = "src/modules/sales-invoices"
quotes_dir = "src/modules/sales-quotes"
orders_dir = "src/modules/sales-orders"

def duplicate_module(dest_dir, old_prefix, new_prefix, old_name, new_name, old_singular, new_singular):
    if not os.path.exists(dest_dir):
        shutil.copytree(src_dir, dest_dir)
    
    for root, dirs, files in os.walk(dest_dir):
        for file in files:
            old_path = os.path.join(root, file)
            new_file = file.replace(old_prefix, new_prefix).replace("invoice", new_singular)
            new_path = os.path.join(root, new_file)
            if old_path != new_path:
                os.rename(old_path, new_path)
            
            with open(new_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Simple replacements
            content = content.replace("salesInvoices", new_name)
            content = content.replace("salesInvoiceLines", new_name + "Lines")
            content = content.replace("invoice", new_singular)
            content = content.replace("Invoice", new_singular.capitalize())
            content = content.replace("INVOICE", new_singular.upper())
            content = content.replace("sales-invoices", dest_dir.split("/")[-1])
            
            with open(new_path, "w", encoding="utf-8") as f:
                f.write(content)

duplicate_module(quotes_dir, "invoice", "quote", "salesInvoices", "salesQuotes", "invoice", "quote")
duplicate_module(orders_dir, "invoice", "order", "salesInvoices", "salesOrders", "invoice", "order")

print("done")
