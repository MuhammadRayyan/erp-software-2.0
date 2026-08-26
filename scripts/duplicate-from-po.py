import os
import shutil

src_dir = "src/modules/purchase-orders"
quotes_dir = "src/modules/sales-quotes"
orders_dir = "src/modules/sales-orders"

# Delete the bad clones
shutil.rmtree(quotes_dir, ignore_errors=True)
shutil.rmtree(orders_dir, ignore_errors=True)

def duplicate_module(dest_dir, old_prefix, new_prefix, old_name, new_name, old_singular, new_singular):
    if not os.path.exists(dest_dir):
        shutil.copytree(src_dir, dest_dir)
    
    for root, dirs, files in os.walk(dest_dir):
        for file in files:
            old_path = os.path.join(root, file)
            new_file = file.replace(old_prefix, new_prefix).replace("order", new_singular)
            new_path = os.path.join(root, new_file)
            if old_path != new_path:
                os.rename(old_path, new_path)
            
            with open(new_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Simple replacements
            content = content.replace("purchaseOrders", new_name)
            content = content.replace("purchaseOrderLines", new_name + "Lines")
            content = content.replace("order", new_singular)
            content = content.replace("Order", new_singular.capitalize())
            content = content.replace("ORDER", new_singular.upper())
            content = content.replace("purchase-orders", dest_dir.split("/")[-1])
            # Purchase order specific vars to Sales variants
            content = content.replace("expenseAccountId", "salesAccountId")
            content = content.replace("supplierId", "customerId")
            content = content.replace("Supplier", "Customer")
            content = content.replace("supplier", "customer")
            
            with open(new_path, "w", encoding="utf-8") as f:
                f.write(content)

duplicate_module(quotes_dir, "purchase-order", "quote", "purchaseOrders", "salesQuotes", "order", "quote")
duplicate_module(orders_dir, "purchase-order", "sales-order", "purchaseOrders", "salesOrders", "order", "order")

print("done")
