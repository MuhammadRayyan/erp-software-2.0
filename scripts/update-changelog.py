import os

filepath = "docs/CHANGELOG.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_changelog = """
### Manager.io Architecture & New Modules
* **Sales Quotes & Sales Orders**: Fully scaffolded backend services, DB schemas, numbering sequences, and unified Manager.io-inspired forms.
* **Debit Notes**: Completely integrated into double-entry ledger (Accounts Payable debit, Expense credit, Tax reversal).
* **Math Engine Standardization**: Replicated the mountsIncludeTax feature across Purchase Orders, Purchase Invoices, Credit Notes, and Debit Notes.
* **UI Streamlining**: Upgraded the form layouts to be full-width with a simplified grid for descriptions, accounts, discounts, and tracking.
* **Schema Evolution**: Added 100% type safety and custom-field bindings for sales_quote, sales_order, and debit_note.
""" + "\n"

c = c.replace("## History", "## History\n" + new_changelog)
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
