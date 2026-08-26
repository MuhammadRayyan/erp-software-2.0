import os
import re

filepath = "src/core/db/business-migrations.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

# Replace the broken db.exec
broken = """  db.exec(
    ALTER TABLE business_accounting_settings ADD COLUMN sales_quote_prefix TEXT NOT NULL DEFAULT 'SQ-';
    ALTER TABLE business_accounting_settings ADD COLUMN sales_quote_next_number INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE business_accounting_settings ADD COLUMN sales_quote_padding INTEGER NOT NULL DEFAULT 4;
    ALTER TABLE business_accounting_settings ADD COLUMN sales_order_prefix TEXT NOT NULL DEFAULT 'SO-';
    ALTER TABLE business_accounting_settings ADD COLUMN sales_order_next_number INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE business_accounting_settings ADD COLUMN sales_order_padding INTEGER NOT NULL DEFAULT 4;
  );"""

fixed = """  db.exec(`
    ALTER TABLE business_accounting_settings ADD COLUMN sales_quote_prefix TEXT NOT NULL DEFAULT 'SQ-';
    ALTER TABLE business_accounting_settings ADD COLUMN sales_quote_next_number INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE business_accounting_settings ADD COLUMN sales_quote_padding INTEGER NOT NULL DEFAULT 4;
    ALTER TABLE business_accounting_settings ADD COLUMN sales_order_prefix TEXT NOT NULL DEFAULT 'SO-';
    ALTER TABLE business_accounting_settings ADD COLUMN sales_order_next_number INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE business_accounting_settings ADD COLUMN sales_order_padding INTEGER NOT NULL DEFAULT 4;
  `);"""

c = c.replace(broken, fixed)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
