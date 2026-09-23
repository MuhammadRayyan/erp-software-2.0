# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: eval-currency.spec.ts >> Evaluation Suite E: Currency & Multi-Currency >> E3: Currency Mismatch in Receipt
- Location: e2e\eval-currency.spec.ts:10:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('POSTED').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText('POSTED').first()

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
  - link "Sales Invoices":
    - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/invoices
  - heading "New Sales Invoice" [level=1]
  - paragraph: Save a non-posting draft or post a balanced Accounts Receivable entry.
  - alert: An exchange rate is required for USD on 2026-09-19.
  - heading "Invoice details" [level=2]
  - text: Customer
  - combobox "Customer":
    - option "Choose a customer…"
    - option "ABC Trading LLC"
    - option "Cust 1789576414713"
    - option "Cust 1789576559408"
    - option "Cust 1789576748043"
    - option "Cust 1789577300897"
    - option "Cust 1789577440688"
    - option "Cust 1789577529841"
    - option "Cust C1 1789834555352"
    - option "Cust C1 1789834843433"
    - option "Cust C1 1789835073810"
    - option "Cust C1 1789835371075"
    - option "Cust C1 1789835609263"
    - option "Cust C1 1789835882366"
    - option "Cust C1 1789836242855"
    - option "Cust C1 1789836587652"
    - option "Cust C1 1789836795151"
    - option "Cust C1 1789837020137"
    - option "Cust C1 1789837419199"
    - option "Cust C1 1789837530615"
    - option "Cust C1 1789840944225"
    - option "Cust D2 1789834555359"
    - option "Cust D2 1789834843550"
    - option "Cust D2 1789835073883"
    - option "Cust D2 1789835371169"
    - option "Cust D2 1789835609314"
    - option "Cust D2 1789835882365"
    - option "Cust D2 1789836242931"
    - option "Cust D2 1789836587760"
    - option "Cust D2 1789836795151"
    - option "Cust D2 1789837020177"
    - option "Cust D2 1789837419168"
    - option "Cust D2 1789840944225"
    - option "Deep Test Customer"
    - option "Deep Test Customer"
    - option "Deep Test Customer"
    - option "Deep Test Customer 1788546107591"
    - option "Deep Test Customer 1789422734788"
    - option "Deep Test Customer 1789423004389"
    - option "Deep Test Customer 1789423177350"
    - option "Deep Test Customer 1789423691738"
    - option "Delta LLC"
    - option "Dune Facilities Management"
    - option "Emberline Trading LLC"
    - option "NegStockCust 1789834555356"
    - option "NegStockCust 1789835073469"
    - option "NegStockCust 1789835371173"
    - option "NegStockCust 1789835608953"
    - option "NegStockCust 1789835882385"
    - option "NegStockCust 1789836242947"
    - option "NegStockCust 1789836587727"
    - option "NegStockCust 1789836795100"
    - option "NegStockCust 1789837020178"
    - option "NegStockCust 1789837418887"
    - option "NegStockCust 1789837530566"
    - option "NoEmirateCust 1789834870679"
    - option "NoEmirateCust 1789835089532"
    - option "NoEmirateCust 1789835389055"
    - option "NoEmirateCust 1789835630179"
    - option "NoEmirateCust 1789835894198"
    - option "NoEmirateCust 1789836251688"
    - option "NoEmirateCust 1789836598524"
    - option "Orion Export Services"
    - option "USD Cust 1789834555377"
    - option "USD Cust 1789834843594"
    - option "USD Cust 1789835073485"
    - option "USD Cust 1789835371186"
    - option "USD Cust 1789835608928"
    - option "USD Cust 1789835882329"
    - option "USD Cust 1789836242901"
    - option "USD Cust 1789836587703"
    - option "USD Cust 1789836795660"
    - option "USD Cust 1789837020176"
    - option "USD Cust 1789837419462"
    - option "USD Cust 1789840944194" [selected]
    - option "VatCust 1789834555410"
    - option "VatCust 1789834843549"
    - option "VatCust 1789835073468"
    - option "VatCust 1789835371186"
    - option "VatCust 1789835609328"
    - option "VatCust 1789835882406"
    - option "VatCust 1789836242578"
    - option "VatCust 1789836587762"
    - option "VatCust 1789836795130"
    - option "VatCust 1789837020162"
    - option "VatCust 1789837419293"
    - option "VatCust 1789837530579"
    - option "VatCust 1789840944227"
    - option "Workflow Customer 1789566876544"
    - option "Workflow Customer 1789567060987"
    - option "Workflow Customer 1789567093029"
    - option "Workflow Customer 1789567212778"
    - option "Workflow Customer 1789567298300"
    - option "Workflow Customer 1789567533973"
    - option "Workflow Customer 1789572427372"
    - option "Workflow Customer 1789572489838"
    - option "Workflow Customer 1789572617237"
  - text: Invoice date
  - textbox "Invoice date": 2026-09-19
  - text: VAT tax date
  - textbox "VAT tax date": 2026-09-19
  - text: Due date
  - textbox "Due date": 2026-10-03
  - text: Supply Emirate
  - combobox "Supply Emirate":
    - option "Use business default" [selected]
    - option "Abu Dhabi"
    - option "Dubai"
    - option "Sharjah"
    - option "Ajman"
    - option "Umm Al Quwain"
    - option "Ras Al Khaimah"
    - option "Fujairah"
  - paragraph: Reviewed for standard-rated Sales reporting.
  - text: Project (optional)
  - combobox "Project (optional)":
    - option "No project" [selected]
  - text: Reference (optional)
  - textbox "Reference (optional)"
  - heading "Document currency" [level=2]
  - text: Currency
  - combobox "Currency":
    - option "AED — UAE Dirham"
    - option "EUR — Euro"
    - option "JPY — Japanese Yen"
    - option "USD — US Dollar" [selected]
  - text: Stored exchange rate
  - combobox "Stored exchange rate":
    - option "Choose an explicit stored rate…" [selected]
    - option "2026-08-27 · 1 USD = 3.672500 AED · CBUAE"
    - option "2026-08-27 · 1 USD = 3.680000 AED · Manual"
  - text: Snapshot Not selected
  - paragraph: UAE VAT-relevant invoices require a stored CBUAE-labelled rate for the VAT tax date. Posting preserves this exact snapshot.
  - heading "Line items" [level=2]
  - paragraph: Select an item for inventory sales, or leave it blank for a service line.
  - button "Show Project per line"
  - table:
    - rowgroup:
      - row "Item (optional) Description Qty Rate Account VAT Amount Remove":
        - columnheader "Item (optional)"
        - columnheader "Description"
        - columnheader "Qty"
        - columnheader "Rate"
        - columnheader "Account"
        - columnheader "VAT"
        - columnheader "Amount"
        - columnheader "Remove"
    - rowgroup:
      - row "Item 1789840944194 Item 1789840944194 From item UAE VAT 5% USD 0.00 Remove line 1":
        - cell "Item 1789840944194":
          - combobox "Line 1 inventory item":
            - option "Service / free text"
            - option "COPPER-CABLE — Copper Cable"
            - option "DEEP-ITM-1 — Deep Test Item"
            - option "DIT-1788546104634 — Deep Test Item 1788546104634"
            - option "DIT-1789422728659 — Deep Test Item 1789422728659"
            - option "DIT-1789423000915 — Deep Test Item 1789423000915"
            - option "DIT-1789423174910 — Deep Test Item 1789423174910"
            - option "DIT-1789423689738 — Deep Test Item 1789423689738"
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
            - option "Item 1789840944194" [selected]
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
            - option "JUNCTION-BOX — Junction Box"
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
        - cell "Item 1789840944194":
          - textbox "Line 1 description": Item 1789840944194
        - cell:
          - spinbutton "Line 1 quantity": "1"
        - cell:
          - spinbutton "Line 1 rate": "0.00"
        - cell "From item"
        - cell "UAE VAT 5%":
          - combobox "Line 1 tax code":
            - option "Exempt"
            - option "No VAT"
            - option "Out of Scope"
            - option "Zero Rated"
            - option "UAE VAT 5%" [selected]
            - option "UAE VAT 5% Sales"
        - cell "USD 0.00"
        - cell "Remove line 1":
          - button "Remove line 1" [disabled]
  - button "Add line"
  - term: Subtotal
  - definition: USD 0.00
  - term: VAT
  - definition: USD 0.00
  - term: Total
  - definition: USD 0.00
  - button "Cancel"
  - button "Save Draft"
  - button "Post Invoice"
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Evaluation Suite E: Currency & Multi-Currency', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |     test('E3: Currency Mismatch in Receipt', async ({ page }) => {
  11 |     test.setTimeout(90000);
  12 |     const ts = Date.now();
  13 |     const customerName = `USD Cust ${ts}`;
  14 |     const itemName = `Item ${ts}`;
  15 |     const businessId = page.url().match(/\/b\/([^/]+)/)?.[1] || "demo";
  16 | 
  17 |     // Create USD Customer
  18 |     await page.goto(`/b/${businessId}/customers/new`);
  19 |     await page.getByLabel(/customer name/i).first().fill(customerName);
  20 |     await page.getByLabel(/currency/i).selectOption({ value: 'USD' });
  21 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  22 | 
  23 |     // Create Item
  24 |     await page.goto(`/b/${businessId}/inventory/items/new`);
  25 |     await page.getByLabel(/item name/i).first().fill(itemName);
  26 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  27 | 
  28 |     // Create Sales Invoice in USD
  29 |     await page.goto(`/b/${businessId}/sales/invoices/new`);
  30 |     await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
  31 |     await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
  32 |     await page.waitForTimeout(1000); // Wait for form re-render after item selection
  33 |     
  34 |     // Automatically should have USD and exchange rate
  35 |     await page.getByRole('button', { name: /post invoice/i }).click();
> 36 |     await expect(page.getByText('POSTED').first()).toBeVisible();
     |                                                    ^ Error: expect(locator).toBeVisible() failed
  37 | 
  38 |     // Try to record an AED receipt against it
  39 |     await page.goto(`/b/${businessId}/sales/receipts/new`);
  40 |     await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
  41 |     
  42 |     // Ensure currency dropdown is locked to USD
  43 |     await expect(page.getByLabel(/currency/i).first()).toBeDisabled();
  44 |     await expect(page.getByLabel(/currency/i).first()).toHaveValue('USD');
  45 |   });
  46 | });
  47 | 
```