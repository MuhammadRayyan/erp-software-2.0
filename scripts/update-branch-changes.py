import os

filepath = "docs/branch_changes.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_section = """
## Manager.io Architecture Refactor & Module Expansion

### Added
- **Sales Quotes** (src/modules/sales-quotes): Added complete module logic, UI, API routing, and DB schema modeling.
- **Sales Orders** (src/modules/sales-orders): Added complete module logic, UI, API routing, and DB schema modeling.
- **Form Columns**: Added mountsIncludeTax at the header level and discountType, discountValue at the line level.
- **PDF Configuration**: Image upload support for headerImageUrl and ooterImageUrl.
- **Navigation**: Inserted Sales Quotes, Orders, and Credit Notes directly into the main sidebar.

### Changed
- **Form UI Redesign**: Sales Invoices, Credit Notes, Purchase Orders, and Purchase Invoices are now full-width arrays with advanced bottom-left toggles and inline dynamic calculation states.
- **Math Engine**: Deeply updated calculations/document-line-calculator.ts and money.ts to seamlessly manage Manager.io-inspired subtractive discounts and inclusive tax splits.
- **PDF Engine**: The template mapper conditionally renders Discount and Tax columns when applicable values are supplied by lines.
- **Database Schema**: Unified tracking of Numbering parameters for quotes and orders inside the usinessSettings table. Standardized documentStatus values (sent, ccepted, ejected).
- **Code Health**: Executed massive search-and-replace to strip raw SQL artifacts stemming from previous duplications. un run typecheck produces 0 errors.

"""

c = c + "\n" + new_section.strip()

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
