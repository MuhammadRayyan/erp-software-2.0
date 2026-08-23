import os

file_path = "src/components/document-view-actions.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# I will add onClose
content = content.replace(
    'onDelete?: { label: string; description: string; action: () => Promise<void> };',
    'onDelete?: { label: string; description: string; action: () => Promise<void> };\n  onClose?: { label: string; description: string; action: () => Promise<void> };'
)

content = content.replace(
    'type ConfirmState = "duplicate" | "void" | "delete" | null;',
    'type ConfirmState = "duplicate" | "void" | "delete" | "close" | null;'
)

content = content.replace(
    'if (confirm === "delete" && onDelete) await onDelete.action();',
    'if (confirm === "delete" && onDelete) await onDelete.action();\n      if (confirm === "close" && onClose) await onClose.action();'
)

content = content.replace(
    '{(onVoid || onDelete) && <DropdownMenuSeparator />}',
    '{(onVoid || onDelete || onClose) && <DropdownMenuSeparator />}'
)

# Insert the Close item right before Void
void_str = '''{onVoid && (
              <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => { setError(""); setConfirm("void"); }}>
                <Ban className="size-4" /> {onVoid.label}
              </DropdownMenuItem>
            )}'''
close_str = '''{onClose && (
              <DropdownMenuItem onSelect={() => { setError(""); setConfirm("close"); }}>
                <Ban className="size-4" /> {onClose.label}
              </DropdownMenuItem>
            )}
            
            ''' + void_str

content = content.replace(void_str, close_str)

# In dialog
content = content.replace(
    '{confirm === "delete" && `${onDelete?.label} ${documentNumber}?`}',
    '{confirm === "delete" && `${onDelete?.label} ${documentNumber}?`}\n            {confirm === "close" && `${onClose?.label} ${documentNumber}?`}'
)

content = content.replace(
    '{confirm === "delete" && onDelete?.description}',
    '{confirm === "delete" && onDelete?.description}\n            {confirm === "close" && onClose?.description}'
)

content = content.replace(
    '{confirm === "delete" && onDelete?.label}',
    '{confirm === "delete" && onDelete?.label}\n              {confirm === "close" && onClose?.label}'
)

# And if there are no primary actions at all except the more button, and it's a receipt, the more button is the only one.
# That's fine.

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
