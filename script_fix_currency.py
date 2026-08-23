
import os
import re

file_path = r"src/modules/currency/currency-settings-form.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import { FormError } from \"@/components/form-error\";\n", "")
content = "import { FormError } from \"@/components/form-error\";\n" + content

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

