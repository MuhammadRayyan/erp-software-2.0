import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace('sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = \'AED\' OR default_currency_code IS NULL LIMIT 1").get().id', '(sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = \'AED\' OR default_currency_code IS NULL LIMIT 1").get() as any).id')
c = c.replace('sqlite.prepare("SELECT default_sales_account_id FROM business_accounting_settings LIMIT 1").get().default_sales_account_id', '(sqlite.prepare("SELECT default_sales_account_id FROM business_accounting_settings LIMIT 1").get() as any).default_sales_account_id')
c = c.replace('sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get().id', '(sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get() as any).id')

c = c.replace('intent: "sent"', 'intent: "sent" as any')
c = c.replace('intent: "issued"', 'intent: "issued" as any')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)
