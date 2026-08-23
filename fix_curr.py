
import os

file_path = r"src/modules/currency/currency-settings-form.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import { SelectNative } from \"@/components/ui/select-native\";\n", "")
content = "import { SelectNative } from \"@/components/ui/select-native\";\n" + content

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

