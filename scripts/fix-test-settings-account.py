import os

filepath = "tests/phase-10-new-features.test.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

broken_setup = """  const customerId = sqlite.prepare("SELECT id FROM customers LIMIT 1").get().id;
  const standardAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'revenue' LIMIT 1").get().id;
  const outputVatId = sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get().id;"""

fixed_setup = """  const customerId = sqlite.prepare("SELECT id FROM customers LIMIT 1").get().id;
  const standardAccount = sqlite.prepare("SELECT default_sales_account_id FROM business_accounting_settings LIMIT 1").get().default_sales_account_id;
  const outputVatId = sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get().id;"""

c = c.replace(broken_setup, fixed_setup)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
