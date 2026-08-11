# Phase 4 — Basic Inventory + Delivery / Goods Receipt

## Purpose

Add a reliable but intentionally simple inventory foundation.

Phase 4 should support:
- inventory items;
- inventory locations;
- stock quantities;
- stock movement history;
- goods receipts from suppliers;
- delivery notes to customers;
- basic moving weighted-average valuation;
- stock/accounting impact;
- project linkage;
- basic inventory reports.

Do not add bins, serials, batches/lots, expiry dates, barcode scanning, reservations,
landed cost, manufacturing, FIFO/LIFO, warehouse routes, bank feeds, UAE e-invoicing,
advanced permissions, or production infrastructure.

Implement the whole phase first.
Run the final verification only after the phase is complete.

## 1. Phase 4 Outcome

At the end of this phase:

```text
Inventory Item
  -> Purchase Order
  -> Goods Receipt
  -> Purchase Invoice

Inventory Item
  -> Sales Invoice
  -> Delivery Note
```

Stock changes only from inventory movement documents.

Core inventory reports:
```text
Stock On Hand
Inventory Movement
Items to Receive
Items to Deliver
```

## 2. Keep Existing Architecture

Continue:
- Next.js + TypeScript;
- Drizzle + SQLite per business;
- explicit versioned migration runner;
- Docker Compose Watch;
- webpack development mode;
- existing theme/UI;
- existing accounting services.

Do not add new infrastructure.

## 3. Navigation

Keep sidebar compact:

```text
INVENTORY
Items
Locations
```

Do not add Goods Receipts, Delivery Notes, Adjustments, or Reports as permanent sidebar entries.

## 4. Inventory Items

Routes:

```text
/b/[businessId]/inventory/items
/b/[businessId]/inventory/items/new
/b/[businessId]/inventory/items/[itemId]
/b/[businessId]/inventory/items/[itemId]/edit
```

Minimum fields:

```text
id
sku
name
description optional
unit_name
sales_price_minor optional
purchase_price_minor optional
sales_account_id
inventory_asset_account_id
cost_of_sales_account_id
is_active
created_at
updated_at
```

SKU should be unique per business when present.

Keep service/non-inventory lines as normal free-text invoice lines for now.

## 5. Item List UI

```text
Inventory Items                               [+ New Item]

[Search items...]                       [Filter] [Columns]

SKU         Item                    On Hand      Avg Cost       Value       Status
ITM-001     Copper Cable 2.5mm      420 m        AED 3.20       1,344       Active
```

Optional columns:
- Sales Price
- Purchase Price
- To Receive
- To Deliver
- Location

## 6. Item View

```text
ITM-001
Copper Cable 2.5mm

Active

[Edit] [Receive Stock] [Deliver Stock] [More ▾]
```

Compact metrics:

```text
On Hand
To Receive
To Deliver
Average Cost
Inventory Value
```

Sections:
```text
Overview
Movements
Purchases
Sales
```

## 7. Inventory Locations

Routes:

```text
/b/[businessId]/inventory/locations
/b/[businessId]/inventory/locations/new
/b/[businessId]/inventory/locations/[locationId]
/b/[businessId]/inventory/locations/[locationId]/edit
```

Fields:

```text
id
code
name
address optional
is_default
is_active
created_at
updated_at
```

Seed:

```text
MAIN
Main Warehouse
```

## 8. Inventory Movement Ledger

Add authoritative movement table:

```text
inventory_movements
```

Fields:

```text
id
date
item_id
location_id
movement_type
quantity_delta
unit_cost
value_delta_minor
source_type
source_id
source_line_id optional
project_id optional
description optional
created_at
```

Movement types:

```text
GoodsReceipt
Delivery
AdjustmentIn
AdjustmentOut
OpeningBalance
```

Do not store editable quantity-on-hand as the authority.

On Hand:

```text
SUM(quantity_delta)
```

## 9. Quantity Precision

Support decimal quantities:

```text
10 pcs
12.5 kg
420.75 m
```

Use decimal-safe quantity arithmetic.

Do not use JS floating point for valuation.

## 10. Goods Receipts

Routes:

```text
/b/[businessId]/purchases/goods-receipts
/b/[businessId]/purchases/goods-receipts/new
/b/[businessId]/purchases/goods-receipts/[receiptId]
/b/[businessId]/purchases/goods-receipts/[receiptId]/edit
```

Preferred creation:
```text
Purchase Order View -> Receive Goods
Purchase Invoice View -> Receive Goods
```

Direct creation is also allowed.

Goods Receipt changes physical stock.
It does not create Accounts Payable.

## 11. Goods Receipt Fields

Header:

```text
Supplier
Purchase Order optional
Purchase Invoice optional
Receipt Number
Date
Location
Reference
Project optional
Notes
Status
```

Status:
```text
Draft
Posted
Void
```

Lines:
```text
Inventory Item
Description
Quantity Received
Unit Cost
Project optional
```

When linked to PO:
- prefill supplier;
- prefill remaining quantities;
- default Main Warehouse.

## 12. Goods Receipt Effect

Posted Goods Receipt:

```text
quantity_delta = +received quantity
```

Example:

```text
100 m @ AED 3
=> +100 m
=> value +AED 300
```

No AP journal is created by the Goods Receipt itself.

## 13. Delivery Notes

Routes:

```text
/b/[businessId]/sales/delivery-notes
/b/[businessId]/sales/delivery-notes/new
/b/[businessId]/sales/delivery-notes/[deliveryId]
/b/[businessId]/sales/delivery-notes/[deliveryId]/edit
```

Preferred creation:

```text
Sales Invoice View -> Create Delivery Note
```

Direct creation is allowed.

Delivery Notes do not create Accounts Receivable.
They create stock movement and Cost of Sales accounting.

## 14. Delivery Fields

Header:

```text
Customer
Sales Invoice optional
Delivery Number
Date
Location
Reference
Project optional
Notes
Status
```

Lines:

```text
Inventory Item
Description
Quantity Delivered
Project optional
```

## 15. Negative Stock

Default Phase 4 behavior:

```text
Prevent negative stock.
```

Example error:

```text
Cannot post delivery. Copper Cable has only 20 m available at Main Warehouse.
```

Validate inside the same DB transaction used for posting.

## 16. Valuation Method

Use one method only:

```text
Moving Weighted Average Cost
```

Formula:

```text
Existing value + Received value
-------------------------------
New quantity
= new average cost
```

Example:

```text
100 @ AED 10 = AED 1,000
50 @ AED 14  = AED   700

150 units
AED 1,700 value
Average = AED 11.333333...
```

Keep sufficient internal precision.

## 17. Historical Valuation

Each posted movement should preserve enough information for auditability:

```text
quantity_delta
unit_cost
value_delta
```

Current inventory value:

```text
SUM(value_delta)
```

Current average:

```text
current value / current quantity
```

Do not depend only on a mutable item average-cost field.

## 18. Inventory Accounting

For inventory items:

Purchase Invoice:

```text
Debit  Inventory Asset
Debit  Input VAT
Credit Accounts Payable
```

Sales Invoice:

```text
Debit  Accounts Receivable
Credit Sales
Credit VAT Payable
```

Delivery Note:

```text
Debit  Cost of Sales
Credit Inventory Asset
```

So:
- Purchase Invoice records inventory asset/AP;
- Goods Receipt records physical quantity;
- Sales Invoice records revenue/AR;
- Delivery Note records physical issue + COGS.

## 19. Goods Receipt vs Purchase Invoice Timing

Keep Phase 4 simple.

Purchase Invoice:
- posts financial inventory value;
- does not change physical stock.

Goods Receipt:
- changes physical stock;
- uses PO/invoice cost when linked;
- does not create duplicate AP/inventory accounting.

This can create timing differences between accounting inventory and physical inventory.

Accept and document this Phase 4 limitation.

Do not build GRNI/received-not-invoiced clearing yet.

## 20. Cost of Sales Posting

When Delivery posts:

```text
Debit Cost of Sales
Credit Inventory Asset
```

at moving-average cost at delivery time.

Movement creation and journal posting must happen in one SQLite transaction.

No partial stock-only or journal-only posting.

## 21. Invoice Line Integration

Sales and Purchase Invoice lines may reference:

```text
Inventory Item
or
normal description/non-inventory line
```

When item selected:
- description prefills;
- sales/purchase price may prefill;
- account mappings derive from item;
- quantity required.

Sales Invoice does not reduce stock.

Purchase Invoice does not increase physical stock.

## 22. Purchase Order Integration

PO lines may reference Inventory Items.

PO View:

```text
Item            Ordered    Received    Remaining
Copper Cable    100        60          40
```

Action:

```text
[Receive Goods]
```

Do not let linked cumulative receipts exceed ordered quantity.

## 23. Sales Invoice / Delivery Integration

Sales Invoice inventory line should show delivery progress on View:

```text
Delivered: 25 / 50
Remaining: 25
```

Action:

```text
[Create Delivery Note]
```

Ignore non-inventory lines.

Do not let linked cumulative deliveries exceed invoiced quantity.

## 24. Stock Adjustments

Add simple Stock Adjustment flow.

Fields:

```text
Date
Location
Item
Quantity change
Reason
Project optional
Notes
```

Examples:

```text
+5 stock count correction
-2 damaged
```

Status:
```text
Draft
Posted
Void
```

Use current average cost for normal adjustments.

Add system setting:

```text
inventoryAdjustmentAccountId
```

Shortage:

```text
Debit Inventory Adjustment Expense
Credit Inventory Asset
```

Positive adjustment:

```text
Debit Inventory Asset
Credit Inventory Adjustment account
```

## 25. Opening Stock

Use Stock Adjustment with reason:

```text
Opening Balance
```

Allow:
- quantity;
- unit cost;
- location;
- date.

Reuse existing accounting opening-balance conventions where practical.

Do not build a separate large wizard.

## 26. Locations on Documents

Goods Receipt requires Location.

Delivery Note requires Location.

Default to:

```text
Main Warehouse
```

Sales/Purchase Invoices do not require a Location because they do not move physical stock.

## 27. Project Integration

Reuse Phase 3 Project linkage.

Inventory movements may have:

```text
project_id
```

Important rule for inventory items:

```text
Purchase Invoice -> Inventory Asset, not Project Cost
Delivery Note -> Cost of Sales tagged to Project
```

This avoids counting inventory as Project Cost before it is actually consumed/delivered.

Delivery example:

```text
Cost of Sales        Debit   800   Project A
Inventory Asset      Credit  800
```

Project profitability should use the COGS P&L line.

## 28. Inventory Reports

### Stock On Hand

Route:

```text
/b/[businessId]/reports/stock-on-hand
```

Columns:

```text
Item
SKU
Location
Quantity
Average Cost
Inventory Value
```

Filters:
- Item
- Location
- Active only

### Inventory Movement

Route:

```text
/b/[businessId]/reports/inventory-movement
```

Columns:

```text
Date
Item
Type
Reference
Location
Qty In
Qty Out
Running Qty
Value
```

Filters:
- Date
- Item
- Location
- Movement type
- Project optional

### Items to Receive

```text
Purchase Order
Supplier
Item
Ordered
Received
Remaining
Expected Date
```

### Items to Deliver

```text
Sales Invoice
Customer
Item
Required
Delivered
Remaining
```

## 29. Reports Page

Add:

```text
Inventory
  Stock On Hand
  Inventory Movement
  Items to Receive
  Items to Deliver
```

Keep report catalog compact.

## 30. Numbering

Add sequences:

```text
Goods Receipt      GR-00001
Delivery Note      DN-00001
Stock Adjustment   SA-00001
```

Reuse existing numbering framework.

## 31. PDF / Print

Reuse existing renderer.

Need readable output for:
- Delivery Note;
- Goods Receipt.

Stock Adjustment PDF is optional.

Do not redesign the template editor.

## 32. Editing Posted Inventory Documents

Use source-rebuild logic.

Within one transaction:
1. remove/reverse generated movements;
2. remove/reverse generated journal if applicable;
3. validate new state;
4. regenerate movements;
5. regenerate journal;
6. update document.

Block edits that would make stock negative.

Do not create duplicate movements/journals.

## 33. Voiding

Posted Delivery:
- reverse movement;
- reverse COGS journal;
- mark Void.

Posted Goods Receipt:
- reverse movement;
- mark Void;
- block if reversal makes current stock negative.

Posted Adjustment:
- reverse movement;
- reverse adjustment journal;
- mark Void.

Drafts may be deleted.

## 34. Permissions

Add Inventory module toggle to existing simple permissions.

Without Inventory access:
- Inventory navigation hidden;
- direct routes rejected.

No granular warehouse permissions yet.

## 35. Demo Data

Seed:

```text
Location:
MAIN - Main Warehouse

Items:
Copper Cable
Junction Box
PVC Conduit

Goods Receipt:
100 Copper Cable

Delivery:
20 Copper Cable

PO:
50 Junction Boxes pending receipt

Sales Invoice:
30 PVC Conduit pending delivery
```

Keep it small.

## 36. Migration

Use existing explicit business migration runner.

Add:
- items;
- locations;
- inventory movements;
- goods receipts + lines;
- delivery notes + lines;
- stock adjustments;
- inventory account mappings;
- numbering sequences;
- inventory system settings;
- inventory item refs on sales/purchase lines;
- project refs where needed.

Preserve all Phase 0-3 data.

Do not infer items from historical free-text lines.

## 37. Error Messages

Use clear errors:

```text
Cannot deliver 25 m. Only 20 m are available at Main Warehouse.
Inventory Asset account is not configured.
Cost of Sales account is not configured for Copper Cable.
This Goods Receipt exceeds the remaining Purchase Order quantity.
This Delivery exceeds the remaining invoiced quantity.
Cannot void this Goods Receipt because the stock has already been consumed.
Inventory journal is not balanced.
```

Never expose raw SQLite errors.

## 38. Keep Files Small

Prefer focused files:

```text
inventory-item-service.ts
inventory-movement-service.ts
inventory-valuation.ts
goods-receipt-service.ts
delivery-note-service.ts
stock-adjustment-service.ts
stock-on-hand-report.ts
```

Do not build a generic warehouse framework.

## 39. UI / UX

Follow `docs/THEME.md`.

Inventory rules:
- right-align quantities and values;
- display unit clearly;
- keep tables dense;
- full pages for receiving/delivery;
- related source links visible but quiet;
- use restrained status badges;
- avoid bright warehouse dashboards.

Responsive:
- tables may horizontally scroll;
- header fields stack;
- Post/Save remains visible.

## 40. Do Not Build in Phase 4

Defer:

```text
Bins
Serial Numbers
Batches/Lots
Expiry Dates
Barcode Scanning
Reservations
Reorder Rules
Automatic Purchasing
Landed Costs
FIFO/LIFO
GRNI Clearing
Purchase Price Variance
Warehouse Transfers
Multi-Step Picking
Manufacturing
BOM
Assemblies
Cycle Counts
Scanner UI
Bank Feeds
UAE E-Invoicing
Advanced Permissions
Production Deployment
PostgreSQL
Playwright
```

## 41. Final Verification

Run once after Phase 4 is fully implemented.

### A. Baseline

1. `docker compose up --watch`
2. confirm hot refresh
3. run:

```bash
pnpm typecheck
pnpm lint
pnpm db:check
```

### B. Inventory Item

Create:

```text
SKU: CABLE-25
Copper Cable 2.5mm
Unit: m
Sales price: AED 5
Purchase price: AED 3
```

Confirm Item View.

### C. Opening Stock

Post:

```text
100 m @ AED 3
Main Warehouse
```

Confirm:
- On Hand = 100;
- Value = AED 300;
- Avg Cost = AED 3;
- journal balances.

### D. Moving Average

Receive:

```text
50 m @ AED 4
```

Expected:
```text
Qty = 150
Value = AED 500
Average = AED 3.333333...
```

### E. Purchase Order Receipt

PO:
```text
100 m
```

Receive 60.

Confirm remaining = 40.

Try receiving 50 more.

Confirm rejection.

### F. Purchase Invoice

Post inventory Purchase Invoice:

```text
Net AED 400
VAT AED 20
```

Expected:

```text
Inventory Asset       Debit 400
Input VAT             Debit 20
Accounts Payable      Credit 420
```

Confirm physical stock does not change from invoice alone.

### G. Delivery

Deliver 30 m.

Confirm:
- quantity decreases;
- COGS/Inventory Asset journal balances.

### H. Sales Invoice Separation

Post inventory Sales Invoice.

Confirm stock does not decrease until Delivery Note.

### I. Negative Stock

Try delivering more than available.

Confirm rejected.

### J. Project Cost

Deliver stock to Dubai Villa Project.

Confirm:
- COGS line has project_id;
- Project Cost increases;
- Inventory Asset does not drive Project profitability.

### K. Stock Adjustment

Post:
```text
-2 m damaged
```

Confirm stock decreases and adjustment journal balances.

### L. Reports

Verify:
- Stock On Hand;
- Inventory Movement;
- Items to Receive;
- Items to Deliver.

### M. Void Delivery

Void posted Delivery.

Confirm:
- quantity returns;
- COGS reverses;
- no duplicate movement.

### N. Goods Receipt Void Protection

Attempt to void a receipt whose stock has already been consumed enough that reversal would create negative stock.

Confirm blocked.

### O. Business Isolation

Create inventory in Business A.
Switch to Business B.
Confirm inventory is separate.

### P. Permissions

Disable Inventory for Standard User.

Confirm navigation hidden and direct route rejected.

### Q. Theme / Responsive

Check Light, Dark, desktop, and narrow/mobile.

## Phase 4 Definition of Done

Phase 4 is complete when:
- items and locations work;
- stock derives from movements;
- moving-average valuation works;
- Goods Receipts increase physical stock;
- Delivery Notes decrease stock;
- Purchase Invoices post Inventory Asset/AP;
- Delivery Notes post COGS;
- Project inventory consumption updates Project Cost correctly;
- negative stock is prevented;
- PO received/remaining quantities work;
- sales invoice/delivery separation is clear;
- inventory reports work;
- void/edit does not duplicate movements;
- business isolation remains intact;
- Docker hot reload remains fast;
- final verification passes.

Stop after Phase 4.

Recommended next phase:
**Banking + statement import + reconciliation**.
