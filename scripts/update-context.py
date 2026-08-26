import os

filepath = "docs/CURRENT_STATE.md"
with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.startswith("- Purchases/AP:"):
        new_lines.append(line.replace("draft/posted/void Purchase Invoices", "draft/posted/void Purchase Invoices, Debit Notes").replace("non-posting Purchase Orders", "non-posting Purchase Orders"))
    elif line.startswith("- Sales/AR:"):
        new_lines.append(line.replace("base- or foreign-currency draft/posted/void Sales Invoices", "base- or foreign-currency non-posting Sales Quotes, non-posting Sales Orders, draft/posted/void Sales Invoices"))
    elif "Manager.io Architecture Refactor" in line:
        pass # Will rewrite the end section
    else:
        new_lines.append(line)

new_lines = [l for l in new_lines if "Manager.io Architecture Refactor" not in l and "Sales Quotes, Sales Orders, Debit Notes" not in l]

new_lines.append("\n## Manager.io Architecture Refactor (Latest Updates)\n")
new_lines.append("- Implemented unified Manager.io-inspired UX and calculation engine for Document Forms (Sales Quotes, Sales Orders, Sales Invoices, Purchase Orders, Purchase Invoices, Credit Notes, Debit Notes).\n")
new_lines.append("- Upgraded Drizzle DB Schema to support Sales Quotes, Sales Orders, Debit Notes, and fully integrated them into the accounting posting systems.\n")
new_lines.append("- Standardized line items layout with hidden/visible columns (Description, Account, Discount) and Amounts Are Tax Inclusive global form checkboxes.\n")
new_lines.append("- Verified type-safety across forms and core calculation engine, extending the test suite to validate phase-10 new features.\n")

with open(filepath, "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print("done")
