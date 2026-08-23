
import os
import re

pattern = re.compile(r"<div className=\"sticky bottom-0 z-20 -mx-4 flex[^\"]*justify-between[^\"]*border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x\">\s*<Button[^>]*>\s*<Link href=\{([^}]+)\}>Cancel</Link>\s*</Button>\s*(.*?)\s*</div>", re.DOTALL)
import_statement = "import { DocumentFormFooter } from \"@/components/document-form-footer\";\n"

for root, dirs, files in os.walk("src"):
    for file_name in files:
        if file_name.endswith("-form.tsx"):
            file_path = os.path.join(root, file_name)
            with open(file_path, "r", encoding="utf-8") as file:
                content = file.read()
            
            if pattern.search(content):
                content = pattern.sub(r"<DocumentFormFooter onCancel={() => router.push(\1)}>\2</DocumentFormFooter>", content)
                
                # We need `useRouter` from `next/navigation`
                if "useRouter" not in content:
                    next_nav_import = "import { useRouter } from \"next/navigation\";\n"
                    last_import = content.rfind("import ")
                    end = content.find("\n", last_import) + 1
                    content = content[:end] + next_nav_import + content[end:]
                    
                    # We also need to add `const router = useRouter();` in the component body
                    # Find the component definition
                    comp_def = re.search(r"export function [A-Z][a-zA-Z0-9_]+\(.*?\)\s*\{", content)
                    if comp_def:
                        pos = comp_def.end()
                        content = content[:pos] + "\n  const router = useRouter();" + content[pos:]
                
                # Add DocumentFormFooter import
                if "DocumentFormFooter" not in content:
                    last_import = content.rfind("import ")
                    end = content.find("\n", last_import) + 1
                    content = content[:end] + import_statement + content[end:]
                    
                with open(file_path, "w", encoding="utf-8") as file:
                    file.write(content)

