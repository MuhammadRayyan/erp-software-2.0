
import os
import re

for root, dirs, files in os.walk("src"):
    for file_name in files:
        if file_name.endswith(".tsx"):
            file_path = os.path.join(root, file_name)
            with open(file_path, "r", encoding="utf-8") as file:
                content = file.read()
            
            changed = False
            if "router.push" in content and "const router = useRouter()" not in content:
                comp_def = re.search(r"export function [A-Z][a-zA-Z0-9_]+\(.*?\)\s*\{", content, re.DOTALL)
                if comp_def:
                    pos = comp_def.end()
                    content = content[:pos] + "\n  const router = useRouter();" + content[pos:]
                    changed = True
                    
            if changed:
                with open(file_path, "w", encoding="utf-8") as file:
                    file.write(content)

