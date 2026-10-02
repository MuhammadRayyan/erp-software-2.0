import re

path_is = r'src\modules\sales-invoices\invoice-service.ts'
with open(path_is, 'r', encoding='utf-8') as f: c = f.read()

# Extract ALLOCATED_MINOR_FRAGMENT and ALLOCATED_BASE_MINOR_FRAGMENT
fragment_match = re.search(r'(const ALLOCATED_MINOR_FRAGMENT = `.*?WHERE scna\.sales_invoice_id = i\.id\), 0\);)\n\nconst ALLOCATED_BASE_MINOR_FRAGMENT = `(.*?)WHERE scna\.sales_invoice_id = i\.id\), 0\);', c, re.DOTALL)

if fragment_match:
    full_fragments = fragment_match.group(0)
    # Remove from original position
    c = c.replace(full_fragments, '')
    
    # Insert near the top, after imports
    c = re.sub(r'(import .*?;)\n\n', r'\1\n\n' + full_fragments + '\n\n', c, count=1)

with open(path_is, 'w', encoding='utf-8') as f: f.write(c)

print("Moved fragments to top")
