
import os
import re

pattern = re.compile(r"<div role=\"alert\" className=\"rounded-md border border-danger/25 bg-danger/10 px-3 py-2\.5 text-sm text-danger\">\s*\{([^}]+)\}\s*</div>")
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
                    last_import = content.rfind("import ")
                    if last_import != -1:
                        end_of_import = content.find("\n", last_import) + 1
                        content = content[:end_of_import] + import_statement + content[end_of_import:]
                    else:
                        content = import_statement + content
                        
                with open(file_path, "w", encoding="utf-8") as file:
                    file.write(content)

