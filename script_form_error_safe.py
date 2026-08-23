
import os
import re

pattern = re.compile(r"<div\s+role=\"alert\"\s+className=\"[^\"]*bg-danger/10[^\"]*\"\s*>\s*\{([^}]+)\}\s*</div>", re.DOTALL)
import_statement = "import { FormError } from \"@/components/form-error\";\n"

for root, dirs, files in os.walk("src"):
    for file_name in files:
        if file_name.endswith(".tsx"):
            file_path = os.path.join(root, file_name)
            with open(file_path, "r", encoding="utf-8") as file:
                content = file.read()
            
            if pattern.search(content):
                content = pattern.sub(r"<FormError message={\1} />", content)
                
                # Add import if not present
                if "FormError" not in content[:1000]:
                    content = import_statement + content
                        
                with open(file_path, "w", encoding="utf-8") as file:
                    file.write(content)

