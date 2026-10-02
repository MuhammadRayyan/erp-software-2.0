# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: eval-inventory-integrity.spec.ts >> Evaluation Suite A: Inventory Integrity >> A1: Negative Stock Guard
- Location: e2e\eval-inventory-integrity.spec.ts:10:3

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.fill: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByLabel(/customer name/i).first()

```

# Page snapshot

```yaml
- generic [active] [ref=f6e1]:
  - generic [ref=f6e2]:
    - banner [ref=f6e3]:
      - generic [ref=f6e4]:
        - link "Ledgerly" [ref=f6e5] [cursor=pointer]:
          - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/overview
        - button "Search or jump to (Ctrl K)" [ref=f6e13]:
          - text: Search or jump to…
          - generic [ref=f6e17]: Ctrl K
        - button "Help" [ref=f6e18]
        - button "Account menu for Demo Administrator" [ref=f6e22]:
          - generic [ref=f6e27]: Demo Administrator
    - generic [ref=f6e28]:
      - complementary [ref=f6e29]:
        - button "Northstar Technical Services LLC Current business" [ref=f6e31]:
          - generic [ref=f6e37]:
            - generic [ref=f6e38]: Northstar Technical Services LLC
            - generic [ref=f6e39]: Current business
        - navigation "Business modules" [ref=f6e43]:
          - generic [ref=f6e44]:
            - link "Overview" [ref=f6e47] [cursor=pointer]:
              - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/overview
            - generic [ref=f6e53]:
              - paragraph [ref=f6e54]: Sales
              - generic [ref=f6e55]:
                - link "Customers" [ref=f6e56] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/customers
                - link "Sales Quotes" [ref=f6e61] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/quotes
                - link "Sales Orders" [ref=f6e65] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/orders
                - link "Sales Invoices" [ref=f6e70] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/invoices
                - link "Receipts" [ref=f6e73] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/receipts
                - link "Credit Notes" [ref=f6e77] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/credit-notes
                - link "Delivery Notes" [ref=f6e80] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/delivery-notes
                - link "Sent Emails" [ref=f6e86] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/emails
            - generic [ref=f6e90]:
              - paragraph [ref=f6e91]: Purchases
              - generic [ref=f6e92]:
                - link "Suppliers" [ref=f6e93] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/suppliers
                - link "Purchase Quotes" [ref=f6e99] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/quotes
                - link "Purchase Orders" [ref=f6e103] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/orders
                - link "Purchase Invoices" [ref=f6e108] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/invoices
                - link "Supplier Payments" [ref=f6e113] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/payments
                - link "Debit Notes" [ref=f6e120] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/debit-notes
                - link "Goods Receipts" [ref=f6e123] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/goods-receipts
            - generic [ref=f6e129]:
              - paragraph [ref=f6e130]: Banking
              - link "Bank Accounts" [ref=f6e132] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/banking/accounts
            - generic [ref=f6e136]:
              - paragraph [ref=f6e137]: Projects
              - link "Projects" [ref=f6e139] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/projects
            - generic [ref=f6e142]:
              - paragraph [ref=f6e143]: Inventory
              - generic [ref=f6e144]:
                - link "Items" [ref=f6e145] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/items
                - link "Locations" [ref=f6e150] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/locations
            - generic [ref=f6e154]:
              - paragraph [ref=f6e155]: Accounting
              - generic [ref=f6e156]:
                - link "Chart of Accounts" [ref=f6e157] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/accounting/chart-of-accounts
                - link "Journal" [ref=f6e160] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/accounting/journal
            - generic [ref=f6e165]:
              - paragraph [ref=f6e166]: Reports
              - link "Reports" [ref=f6e168] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/reports
          - link "Settings" [ref=f6e173] [cursor=pointer]:
            - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/settings
      - main [ref=f6e177]:
        - generic [ref=f6e178]:
          - heading "Failed to load data" [level=3] [ref=f6e179]
          - paragraph [ref=f6e180]: "no such column: code"
          - button "Try again" [ref=f6e181]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=f6e187] [cursor=pointer]
  - alert [ref=f6e191]
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
> 26 |     await page.getByLabel(/customer name/i).first().fill(customerName);
     |                                                     ^ Error: locator.fill: Test timeout of 90000ms exceeded.
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
  60 |     await expect(page.getByText(/Use Opening Balance with a unit cost when no valued stock exists/i)).toBeVisible();
  61 |   });
  62 | });
  63 | 
```