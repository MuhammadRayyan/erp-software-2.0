import os

def remove_nocheck(directory):
    for root, _, files in os.walk(directory):
        for f in files:
            if not f.endswith(".tsx") and not f.endswith(".ts"): continue
            filepath = os.path.join(root, f)
            with open(filepath, "r", encoding="utf-8") as file:
                c = file.read()
            if "// @ts-nocheck" in c:
                c = c.replace("// @ts-nocheck\n", "")
                with open(filepath, "w", encoding="utf-8") as file:
                    file.write(c)

remove_nocheck("src/app/b/[businessId]/sales/quotes")
remove_nocheck("src/app/b/[businessId]/sales/orders")
print("done")
