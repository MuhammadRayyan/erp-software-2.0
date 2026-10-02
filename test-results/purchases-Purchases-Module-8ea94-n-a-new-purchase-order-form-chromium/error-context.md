# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: purchases.spec.ts >> Purchases Module >> can open a new purchase order form
- Location: e2e\purchases.spec.ts:31:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'New Purchase Order' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: 'New Purchase Order' })

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
  - paragraph: "no such column: \"payment_terms_days\" - should this be a string literal in single-quotes?"
  - button "Try again"
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Purchases Module', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('can view supplier list', async ({ page }) => {
  11 |     await page.getByRole('link', { name: 'Suppliers', exact: true }).click();
  12 |     await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible();
  13 |   });
  14 | 
  15 |   test('can view purchase invoices list', async ({ page }) => {
  16 |     await page.getByRole('link', { name: 'Purchase Invoices', exact: true }).click();
  17 |     await expect(page.getByRole('heading', { name: 'Purchase Invoices', exact: true })).toBeVisible();
  18 |   });
  19 | 
  20 |   test('can open a new purchase invoice form', async ({ page }) => {
  21 |     await page.getByRole('link', { name: 'Purchase Invoices', exact: true }).click();
  22 |     await expect(page.getByRole('heading', { name: 'Purchase Invoices', exact: true })).toBeVisible();
  23 |     await page.getByRole('link', { name: 'New Purchase Invoice' }).first().click();
  24 |     await expect(page.getByRole('heading', { name: 'New Purchase Invoice' })).toBeVisible();
  25 |     
  26 |     // Verify essential form fields exist
  27 |     await expect(page.locator('select#supplierId')).toBeVisible();
  28 |     await expect(page.getByLabel(/invoice date/i)).toBeVisible();
  29 |   });
  30 | 
  31 |   test('can open a new purchase order form', async ({ page }) => {
  32 |     await page.getByRole('link', { name: 'Purchase Orders', exact: true }).click();
  33 |     await expect(page.getByRole('heading', { name: 'Purchase Orders', exact: true })).toBeVisible();
  34 |     await page.getByRole('link', { name: 'New Purchase Order' }).first().click();
> 35 |     await expect(page.getByRole('heading', { name: 'New Purchase Order' })).toBeVisible();
     |                                                                             ^ Error: expect(locator).toBeVisible() failed
  36 |     
  37 |     await expect(page.getByLabel(/supplier/i)).toBeVisible();
  38 |   });
  39 | });
  40 | 
```