# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sales.spec.ts >> Sales Module >> can open a new sales invoice form
- Location: e2e\sales.spec.ts:25:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Sales Invoices' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: 'Sales Invoices' })

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
  - paragraph: status is not defined
  - button "Try again"
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Sales Module', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('can view customer list and search', async ({ page }) => {
  11 |     await page.getByRole('link', { name: 'Customers', exact: true }).click();
  12 |     await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  13 |     
  14 |     const searchInput = page.getByPlaceholder(/search/i);
  15 |     if (await searchInput.isVisible()) {
  16 |       await searchInput.fill('Demo Customer');
  17 |     }
  18 |   });
  19 | 
  20 |   test('can view sales invoices list', async ({ page }) => {
  21 |     await page.getByRole('link', { name: 'Sales Invoices', exact: true }).click();
  22 |     await expect(page.getByRole('heading', { name: 'Sales Invoices' })).toBeVisible();
  23 |   });
  24 | 
  25 |   test('can open a new sales invoice form', async ({ page }) => {
  26 |     await page.getByRole('link', { name: 'Sales Invoices', exact: true }).click();
> 27 |     await expect(page.getByRole('heading', { name: 'Sales Invoices' })).toBeVisible();
     |                                                                         ^ Error: expect(locator).toBeVisible() failed
  28 |     await page.getByRole('link', { name: 'New Invoice' }).first().click();
  29 |     await expect(page.getByRole('heading', { name: 'New Sales Invoice' })).toBeVisible();
  30 |     
  31 |     // Verify essential form fields exist
  32 |     await expect(page.getByLabel(/customer/i)).toBeVisible();
  33 |     await expect(page.getByLabel(/invoice date/i)).toBeVisible();
  34 |   });
  35 | 
  36 |   test('can open a new customer form', async ({ page }) => {
  37 |     await page.getByRole('link', { name: 'Customers', exact: true }).click();
  38 |     await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  39 |     await page.getByRole('link', { name: 'New Customer' }).first().click();
  40 |     await expect(page.getByRole('heading', { name: 'New Customer' })).toBeVisible();
  41 |     
  42 |     await expect(page.getByLabel(/name/i).first()).toBeVisible();
  43 |     await expect(page.getByRole('button', { name: /save customer/i })).toBeVisible();
  44 |   });
  45 | });
  46 | 
```