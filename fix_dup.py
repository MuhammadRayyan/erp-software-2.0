import os

file_path = "src/components/document-view-actions.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('onSelect={() => void handleConfirm()}>', 'onSelect={() => { setError(""); setConfirm("duplicate"); }}>')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
