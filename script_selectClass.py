
import os
import re

select_class_pattern = re.compile(r"const selectClass = [^;]+;\n?")
import_statement = "import { SelectNative } from \"@/components/ui/select-native\";\n"

for root, dirs, files in os.walk("src"):
    for file_name in files:
        if file_name.endswith(".tsx") or file_name.endswith(".ts"):
            file_path = os.path.join(root, file_name)
            with open(file_path, "r", encoding="utf-8") as file:
                content = file.read()
            
            if "selectClass" in content:
                # If there are inputs using selectClass, replace them with literal string
                literal = "\"h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60\""
                
                # Replace `<select ... className={selectClass}` with SelectNative
                # 1. className={selectClass} -> SelectNative
                content = re.sub(r"<select([^>]+)className=\{selectClass\}", r"<SelectNative\1", content)
                # 2. className={`${selectClass} ...`} -> SelectNative className="..."
                def replacer(m):
                    prefix = m.group(1)
                    extra = m.group(2)
                    # \1 is before className
                    # \2 is the extra classes
                    return f"<SelectNative{prefix}className=\"{extra}\""
                content = re.sub(r"<select([^>]+)className=\{\`\$\{selectClass\}\s+([^`]+)\`\}", replacer, content)
                
                # Change closing tag
                content = content.replace("</select>", "</SelectNative>")
                
                # Replace any remaining {selectClass} with literal (like inputs)
                content = content.replace("{selectClass}", literal)
                content = content.replace("${selectClass}", literal.strip("\""))
                
                # Remove the const declaration
                content = select_class_pattern.sub("", content)
                
                # Add import if SelectNative is used
                if "<SelectNative" in content and "SelectNative" not in content[:1000]:
                    last_import = content.rfind("import ")
                    end = content.find("\n", last_import) + 1
                    content = content[:end] + import_statement + content[end:]
                
                with open(file_path, "w", encoding="utf-8") as file:
                    file.write(content)

