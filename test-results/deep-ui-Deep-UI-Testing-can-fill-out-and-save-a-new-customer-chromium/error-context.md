# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deep-ui.spec.ts >> Deep UI Testing >> can fill out and save a new customer
- Location: e2e\deep-ui.spec.ts:10:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'New Customer' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: 'New Customer' })

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
  - heading "Failed to load data" [level=3]
  - paragraph: "no such column: code"
  - button "Try again"
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Deep UI Testing', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('can fill out and save a new customer', async ({ page }) => {
  11 |     await page.getByRole('link', { name: 'Customers', exact: true }).click();
  12 |     await page.getByRole('link', { name: 'New Customer' }).first().click();
  13 |     
> 14 |     await expect(page.getByRole('heading', { name: 'New Customer' })).toBeVisible();
     |                                                                       ^ Error: expect(locator).toBeVisible() failed
  15 |     
  16 |     // Use timestamp-unique values to avoid collisions with previous test runs
  17 |     const ts = Date.now();
  18 |     const customerName = `Deep Test Customer ${ts}`;
  19 |     const email = `deep.${ts}@test.com`;
  20 | 
  21 |     // Fill form
  22 |     await page.getByLabel(/customer name/i).first().fill(customerName);
  23 |     await page.getByLabel(/email/i).first().fill(email);
  24 |     await page.getByLabel(/TRN \/ reference/i).first().fill('TAX-12345');
  25 |     
  26 |     // Click Save
  27 |     await page.getByRole('button', { name: /save customer/i }).click();
  28 |     
  29 |     // Should navigate to customer detail page
  30 |     await expect(page.getByRole('heading', { name: customerName, exact: true })).toBeVisible();
  31 |     
  32 |     // Verify a detail exists
  33 |     await expect(page.getByText('TAX-12345')).toBeVisible();
  34 |   });
  35 | 
  36 |   test('can fill out and save a new item', async ({ page }) => {
  37 |     await page.getByRole('link', { name: 'Items', exact: true }).click();
  38 |     await page.getByRole('link', { name: 'New Item' }).first().click();
  39 |     
  40 |     // Use timestamp-unique values to avoid collisions with previous test runs
  41 |     const ts = Date.now();
  42 |     const itemName = `Deep Test Item ${ts}`;
  43 |     const sku = `DIT-${ts}`;
  44 | 
  45 |     // Fill form
  46 |     await page.getByLabel(/item name/i).first().fill(itemName);
  47 |     await page.getByLabel(/sku/i).first().fill(sku);
  48 |     await page.getByLabel(/sales price/i).first().fill('150.00');
  49 |     
  50 |     // Account dropdowns are pre-populated by the server with defaults — no action needed.
  51 |     
  52 |     // Click Save
  53 |     await page.getByRole('button', { name: /create item/i }).click();
  54 |     
  55 |     // Should navigate to item detail page
  56 |     await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  57 |     await expect(page.getByText(sku)).toBeVisible();
  58 |   });
  59 | });
  60 | 
```