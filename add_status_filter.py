import re

# 1. Add status to InvoiceListFilters
path_is = r'src\modules\sales-invoices\invoice-service.ts'
with open(path_is, 'r', encoding='utf-8') as f: c = f.read()

c = c.replace(
    'export type InvoiceListFilters = {',
    'export type InvoiceListFilters = {\n    status?: "draft" | "overdue" | "unpaid" | "paid" | "void";'
)

# 2. Add filtering logic to countInvoiceRows and listInvoiceRows
# Find conditions and values setup
filter_logic = """
    if (filters?.status === "overdue") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor > (${ALLOCATED_MINOR_FRAGMENT})`);
      conditions.push("i.due_date < date('now', 'localtime')");
    } else if (filters?.status === "draft") {
      conditions.push("i.document_status = 'draft'");
    } else if (filters?.status === "void") {
      conditions.push("i.document_status = 'void'");
    } else if (filters?.status === "unpaid") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor > (${ALLOCATED_MINOR_FRAGMENT})`);
    } else if (filters?.status === "paid") {
      conditions.push("i.document_status = 'posted'");
      conditions.push(`i.total_minor <= (${ALLOCATED_MINOR_FRAGMENT})`);
    }
"""

# Inject into countInvoiceRows
c = re.sub(
    r'(function countInvoiceRows.*?const dateTo = validDate\(filters\?\.to\);)',
    r'\1\n' + filter_logic,
    c,
    flags=re.DOTALL
)
# Inject into listInvoiceRows
c = re.sub(
    r'(function listInvoiceRows.*?const dateTo = validDate\(filters\?\.to\);)',
    r'\1\n' + filter_logic,
    c,
    flags=re.DOTALL
)

with open(path_is, 'w', encoding='utf-8') as f: f.write(c)

# 3. Read status in page.tsx
path_page = r'src\app\b\[businessId]\sales\invoices\page.tsx'
with open(path_page, 'r', encoding='utf-8') as f: c = f.read()

# I need to get status from searchParams and pass it to listInvoicesPaginated
c = c.replace(
    'const to = validDate(sp.to);',
    'const to = validDate(sp.to);\n  const status = sp.status as any;'
)
c = c.replace(
    '{ from, to, page, pageSize }',
    '{ from, to, status, page, pageSize }'
)
c = c.replace(
    'buildDateSearchParams({ from, to });',
    'buildDateSearchParams({ from, to });\n  if (status) searchParamsUrl.set("status", status);'
)

with open(path_page, 'w', encoding='utf-8') as f: f.write(c)

print("Added overdue status filtering!")
