import re

path_page = r'src\app\b\[businessId]\sales\invoices\page.tsx'
with open(path_page, 'r', encoding='utf-8') as f: c = f.read()

c = c.replace(
    '  const pageSize = parsePageSizeParam(sp.pageSize);\n  \n  const { rows: invoices, ...pagination }',
    '  const pageSize = parsePageSizeParam(sp.pageSize);\n  const status = (sp as any).status as "overdue" | "draft" | "unpaid" | "paid" | "void" | undefined;\n  \n  const { rows: invoices, ...pagination }'
)

with open(path_page, 'w', encoding='utf-8') as f: f.write(c)

print("Fixed status parameter")
