
import os
import re

for root, dirs, files in os.walk("src"):
    for file_name in files:
        if file_name.endswith(".tsx"):
            file_path = os.path.join(root, file_name)
            with open(file_path, "r", encoding="utf-8") as file:
                content = file.read()
            
            changed = False
            # fix "use client"
            if content.startswith("import") and "\"use client\";" in content[:200]:
                content = content.replace("\"use client\";\n", "")
                content = "\"use client\";\n" + content
                changed = True
                
            if "<DocumentFormFooter" in content and "DocumentFormFooter } from" not in content:
                # add import
                last_import = content.rfind("import ")
                end = content.find("\n", last_import) + 1
                content = content[:end] + "import { DocumentFormFooter } from \"@/components/document-form-footer\";\n" + content[end:]
                changed = True
                
            if "router.push" in content and "const router = useRouter()" not in content:
                comp_def = re.search(r"export function [A-Z][a-zA-Z0-9_]+\(.*?\)\s*\{", content)
                if comp_def:
                    pos = comp_def.end()
                    content = content[:pos] + "\n  const router = useRouter();" + content[pos:]
                    changed = True
                    
            if changed:
                with open(file_path, "w", encoding="utf-8") as file:
                    file.write(content)

