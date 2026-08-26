import os

filepath = "src/app/b/[businessId]/settings/page.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    'import { ArrowRight, Coins, FileText, LayoutGrid, ListOrdered, ListPlus, Percent, ReceiptText, Send, ShieldCheck } from "lucide-react";',
    'import { ArrowRight, Coins, FileText, LayoutGrid, ListOrdered, ListPlus, Percent, ReceiptText, Send, ShieldCheck, FileInput } from "lucide-react";'
)

c = c.replace(
    '{ title: "Tax codes"',
    '{ title: "Form defaults", description: "Configure default fields and layouts for new documents.", href: /b//settings/form-defaults, icon: FileInput },\n    { title: "Tax codes"'
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
