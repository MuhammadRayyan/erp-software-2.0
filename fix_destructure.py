import os

file_path = "src/components/document-view-actions.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("onDelete,\n  extraActions,", "onDelete,\n  onClose,\n  extraActions,")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
