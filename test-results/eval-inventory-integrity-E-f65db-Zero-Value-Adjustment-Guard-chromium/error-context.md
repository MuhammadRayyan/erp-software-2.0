# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: eval-inventory-integrity.spec.ts >> Evaluation Suite A: Inventory Integrity >> A4: Opening Balance + Zero-Value Adjustment Guard
- Location: e2e\eval-inventory-integrity.spec.ts:41:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Use Opening Balance with a unit cost when no valued stock exists/i)
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText(/Use Opening Balance with a unit cost when no valued stock exists/i)

```

```yaml
- banner:
  - link "Ledgerly":
    - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/overview
  - button "Search or jump to (Ctrl K)": Search or jump to… Ctrl K
  - button "Help"
  - button "Account menu for Demo Administrator": Demo Administrator
- complementary:
  - button "Northstar Technical Services LLC Current business"
  - navigation "Business modules":
    - link "Overview":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/overview
    - paragraph: Sales
    - link "Customers":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/customers
    - link "Sales Quotes":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/quotes
    - link "Sales Orders":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/orders
    - link "Sales Invoices":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/invoices
    - link "Receipts":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/receipts
    - link "Credit Notes":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/credit-notes
    - link "Delivery Notes":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/delivery-notes
    - link "Sent Emails":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/emails
    - paragraph: Purchases
    - link "Suppliers":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/suppliers
    - link "Purchase Quotes":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/quotes
    - link "Purchase Orders":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/orders
    - link "Purchase Invoices":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/invoices
    - link "Supplier Payments":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/payments
    - link "Debit Notes":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/debit-notes
    - link "Goods Receipts":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/goods-receipts
    - paragraph: Banking
    - link "Bank Accounts":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/banking/accounts
    - paragraph: Projects
    - link "Projects":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/projects
    - paragraph: Inventory
    - link "Items":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/items
    - link "Locations":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/locations
    - paragraph: Accounting
    - link "Chart of Accounts":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/accounting/chart-of-accounts
    - link "Journal":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/accounting/journal
    - paragraph: Reports
    - link "Reports":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/reports
    - link "Settings":
      - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/settings
- main:
  - link "Stock Adjustments":
    - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/adjustments
  - heading "New Stock Adjustment" [level=1]
  - paragraph: Use Opening Balance for initial valued stock; normal corrections use current average cost.
  - heading "Adjustment details" [level=2]
  - paragraph: Use a positive quantity for stock in and a negative quantity for stock out.
  - text: Date
  - textbox "Date": 2026-10-02
  - text: Location
  - combobox "Location":
    - option "MAIN — Main Warehouse" [selected]
  - text: Inventory Item
  - combobox "Inventory Item":
    - option "Choose item…" [selected]
    - option "COPPER-CABLE — Copper Cable"
    - option "DEEP-ITM-1 — Deep Test Item"
    - option "DIT-1788546104634 — Deep Test Item 1788546104634"
    - option "DIT-1789422728659 — Deep Test Item 1789422728659"
    - option "DIT-1789423000915 — Deep Test Item 1789423000915"
    - option "DIT-1789423174910 — Deep Test Item 1789423174910"
    - option "DIT-1789423689738 — Deep Test Item 1789423689738"
    - option "DIT-1790954945440 — Deep Test Item 1790954945440"
    - option "INBOUND-FIXTURE — Inbound Matching Fixture"
    - option "Item 1789576414713"
    - option "Item 1789576559408"
    - option "Item 1789576748043"
    - option "Item 1789577300897"
    - option "Item 1789577440688"
    - option "Item 1789577529841"
    - option "Item 1789834555377"
    - option "Item 1789835073485"
    - option "Item 1789835089532"
    - option "Item 1789835371186"
    - option "Item 1789835389055"
    - option "Item 1789835608928"
    - option "Item 1789835630179"
    - option "Item 1789835882329"
    - option "Item 1789835894198"
    - option "Item 1789836242901"
    - option "Item 1789836251688"
    - option "Item 1789836587703"
    - option "Item 1789836598524"
    - option "Item 1789836795660"
    - option "Item 1789837020176"
    - option "Item 1789837419462"
    - option "Item 1789840944194"
    - option "Item C1 1789834555352"
    - option "Item C1 1789835073810"
    - option "Item C1 1789835371075"
    - option "Item C1 1789835609263"
    - option "Item C1 1789835882366"
    - option "Item C1 1789836242855"
    - option "Item C1 1789836587652"
    - option "Item C1 1789836795151"
    - option "Item C1 1789837020137"
    - option "Item C1 1789837419199"
    - option "Item C1 1789837530615"
    - option "Item C1 1789840944225"
    - option "Item D2 1789834555359"
    - option "Item D2 1789835073883"
    - option "Item D2 1789835371169"
    - option "Item D2 1789835609314"
    - option "Item D2 1789835882365"
    - option "Item D2 1789836242931"
    - option "Item D2 1789836587760"
    - option "Item D2 1789836795151"
    - option "Item D2 1789837020177"
    - option "Item D2 1789837419168"
    - option "Item D2 1789840944225"
    - option "Item Standard 1789834555410"
    - option "Item Standard 1789835073468"
    - option "Item Standard 1789835371186"
    - option "Item Standard 1789835609328"
    - option "Item Standard 1789835882406"
    - option "Item Standard 1789836242578"
    - option "Item Standard 1789836587762"
    - option "Item Standard 1789836795130"
    - option "Item Standard 1789837020162"
    - option "Item Standard 1789837419293"
    - option "Item Standard 1789837530579"
    - option "Item Standard 1789840944227"
    - option "Item Zero 1789835073468"
    - option "Item Zero 1789835371186"
    - option "Item Zero 1789835609328"
    - option "Item Zero 1789835882406"
    - option "Item Zero 1789836242578"
    - option "Item Zero 1789836587762"
    - option "Item Zero 1789836795130"
    - option "Item Zero 1789837020162"
    - option "Item Zero 1789837419293"
    - option "Item Zero 1789837530579"
    - option "Item Zero 1789840944227"
    - option "JUNCTION-BOX — Junction Box"
    - option "Manual Item 1789841162867"
    - option "NegStockItem 1789834555356"
    - option "NegStockItem 1789835073469"
    - option "NegStockItem 1789835371173"
    - option "NegStockItem 1789835608953"
    - option "NegStockItem 1789835882385"
    - option "NegStockItem 1789836242947"
    - option "NegStockItem 1789836587727"
    - option "NegStockItem 1789836795100"
    - option "NegStockItem 1789837020178"
    - option "NegStockItem 1789837418887"
    - option "NegStockItem 1789837530566"
    - option "NegStockItem 1789840944254"
    - option "NegStockItem 1790954961384"
    - option "OverflowItem 1789834555588"
    - option "OverflowItem 1789835073500"
    - option "OverflowItem 1789835371173"
    - option "OverflowItem 1789835609342"
    - option "OverflowItem 1789835882417"
    - option "OverflowItem 1789836242921"
    - option "OverflowItem 1789836587762"
    - option "OverflowItem 1789836795118"
    - option "OverflowItem 1789837020178"
    - option "OverflowItem 1789837419322"
    - option "OverflowItem 1789837530545"
    - option "OverflowItem 1789840944226"
    - option "PVC-CONDUIT — PVC Conduit"
    - option "Purchase Item 1789568141717"
    - option "Purchase Item 1789568246039"
    - option "Purchase Item 1789568331663"
    - option "Purchase Item 1789568559694"
    - option "Purchase Item 1789568643107"
    - option "Purchase Item 1789568897245"
    - option "Purchase Item 1789568950630"
    - option "Purchase Item 1789569023122"
    - option "Workflow Item 1789566876544"
    - option "Workflow Item 1789567060987"
    - option "Workflow Item 1789567093029"
    - option "Workflow Item 1789567212778"
    - option "Workflow Item 1789567298300"
    - option "Workflow Item 1789567533973"
    - option "Workflow Item 1789572427372"
    - option "Workflow Item 1789572489838"
    - option "Workflow Item 1789572617237"
    - option "ZeroValItem 1789834555375"
    - option "ZeroValItem 1789835073450"
    - option "ZeroValItem 1789835371164"
    - option "ZeroValItem 1789835609306"
    - option "ZeroValItem 1789835882400"
    - option "ZeroValItem 1789836242921"
    - option "ZeroValItem 1789836587743"
    - option "ZeroValItem 1789836795152"
    - option "ZeroValItem 1789837020140"
    - option "ZeroValItem 1789837419293"
    - option "ZeroValItem 1789840944208"
    - option "ZeroValItem 1790954961429"
  - text: Quantity change
  - textbox "Quantity change":
    - /placeholder: +5 or -2
    - text: "10"
  - text: Reason
  - combobox "Reason":
    - option "Stock count correction" [selected]
    - option "Damaged"
    - option "Opening Balance"
    - option "Other"
  - text: Unit cost (opening only)
  - textbox "Unit cost (opening only)"
  - text: Project (optional)
  - combobox "Project (optional)":
    - option "No project" [selected]
    - option "PRJ-00001 — Dubai Villa Fit-Out"
    - option "PRJ-00002 — Office Upgrade"
  - text: Notes (optional)
  - textbox "Notes (optional)"
  - link "Cancel":
    - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/adjustments
  - button "Save Draft"
  - button "Post Adjustment"
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Evaluation Suite A: Inventory Integrity', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('A1: Negative Stock Guard', async ({ page }) => {
  11 |     test.setTimeout(90000);
  12 |     const ts = Date.now();
  13 |     const itemName = `NegStockItem ${ts}`;
  14 |     const customerName = `NegStockCust ${ts}`;
  15 |     const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];
  16 | 
  17 |     // 1. Create a new item (0 stock)
  18 |     await page.goto(`/b/${businessId}/inventory/items/new`);
  19 |     await page.getByLabel(/item name/i).first().fill(itemName);
  20 |     await page.getByLabel(/sales price/i).first().fill('100.00');
  21 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  22 |     await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  23 | 
  24 |     // 2. Create customer
  25 |     await page.goto(`/b/${businessId}/customers/new`);
  26 |     await page.getByLabel(/customer name/i).first().fill(customerName);
  27 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  28 |     await expect(page.getByRole('heading', { name: customerName })).toBeVisible();
  29 | 
  30 |     // 3. Attempt to post Delivery Note for 5 units
  31 |     await page.goto(`/b/${businessId}/sales/delivery-notes/new`);
  32 |     await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
  33 |     await page.getByLabel(/Line 1 item/i).selectOption({ label: itemName });
  34 |     await page.getByLabel(/Line 1 quantity/i).fill('5');
  35 |     await page.locator('button', { hasText: 'Post Delivery' }).click();
  36 | 
  37 |     // 4. Assert error message is visible
  38 |     await expect(page.getByText(/Only 0/i).or(page.getByText(/available/i))).toBeVisible();
  39 |   });
  40 | 
  41 |   test('A4: Opening Balance + Zero-Value Adjustment Guard', async ({ page }) => {
  42 |     const ts = Date.now();
  43 |     const itemName = `ZeroValItem ${ts}`;
  44 |     const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];
  45 | 
  46 |     // 1. Create a new item (0 stock)
  47 |     await page.goto(`/b/${businessId}/inventory/items/new`);
  48 |     await page.getByLabel(/item name/i).first().fill(itemName);
  49 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  50 |     await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  51 | 
  52 |     // 2. Attempt positive Stock Adjustment (Reason: Adjustment)
  53 |     await page.goto(`/b/${businessId}/inventory/adjustments/new`);
  54 |     await page.getByLabel(/inventory item/i).selectOption({ label: itemName });
  55 |     await page.getByLabel(/quantity change/i).fill('10');
  56 |     await page.getByLabel(/reason/i).selectOption({ label: 'Stock count correction' }); // Not Opening Balance
  57 |     await page.getByRole('button', { name: /post adjustment/i }).click();
  58 | 
  59 |     // 3. Assert error
> 60 |     await expect(page.getByText(/Use Opening Balance with a unit cost when no valued stock exists/i)).toBeVisible();
     |                                                                                                       ^ Error: expect(locator).toBeVisible() failed
  61 |   });
  62 | });
  63 | 
```