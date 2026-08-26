import os

filepath = "docs/CURRENT_STATE.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_section = """
## Manager.io Architecture Refactor (Latest Updates)

- **Line Calculations & Tax Inclusivity**: All commercial forms (Invoices, Credit Notes, Purchase Orders, etc.) now support Manager.io-style line-level calculations via the mountsIncludeTax flag, dynamically extracting tax vs adding it on top. Added dynamic percentage and fixed value Discount applications at the line level.
- **Form UI Redesign**: Transitioned core modules (Sales Quotes, Sales Orders, Sales Invoices, Sales Credit Notes, Purchase Orders, Purchase Invoices) to a unified, full-width spreadsheet-like UI. Incorporates global Default Tax dropdowns, context-sensitive Amount/Tax column visibilities, and toggles for showLineNumber, showDescription, and showDiscounts. 
- **Module Expansion**: Sales Quotes and Sales Orders exist as distinct domains with draft | sent | accepted | rejected | cancelled lifecycles and dedicated NumberKind prefixes/counters via the usinessSettings table.
- **PDF Configuration**: React-PDF configurations track headerImageUrl and ooterImageUrl uploads. Core generic templates (classic and modern) parse document lines and inject Discount and Tax columns perfectly mapped back to the DB discountValue, discountType, and 	axCodeId references when requested.
- **Code Health**: Stronger adherence to strict typing inside queries/routes, removing unneeded raw SQL string injections, resolving cross-module inconsistencies. 

"""

c = c.replace("## Important domain rules", new_section.strip() + "\n\n## Important domain rules")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
