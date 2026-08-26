import os
import re

filepath = "src/core/db/migrations/business-baseline.ts"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_cols = """
  "supplier_payment_prefix",
  "supplier_payment_next_number",
  "sales_quote_prefix",
  "sales_quote_next_number",
  "sales_quote_padding",
  "sales_order_prefix",
  "sales_order_next_number",
  "sales_order_padding",
"""
c = c.replace(
    '"supplier_payment_prefix",\n  "supplier_payment_next_number",',
    new_cols.strip()
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
