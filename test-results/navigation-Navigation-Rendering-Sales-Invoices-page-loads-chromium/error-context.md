# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> Navigation & Rendering >> Sales Invoices page loads
- Location: e2e\navigation.spec.ts:19:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Sales Invoices', exact: true })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: 'Sales Invoices', exact: true })

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
  3  | test.describe('Navigation & Rendering', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('Overview page loads', async ({ page }) => {
  11 |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  12 |   });
  13 | 
  14 |   test('Sales Customers page loads', async ({ page }) => {
  15 |     await page.getByRole('link', { name: 'Customers', exact: true }).click();
  16 |     await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  17 |   });
  18 | 
  19 |   test('Sales Invoices page loads', async ({ page }) => {
  20 |     await page.getByRole('link', { name: 'Sales Invoices', exact: true }).click();
> 21 |     await expect(page.getByRole('heading', { name: 'Sales Invoices', exact: true })).toBeVisible();
     |                                                                                      ^ Error: expect(locator).toBeVisible() failed
  22 |   });
  23 | 
  24 |   test('Purchases Suppliers page loads', async ({ page }) => {
  25 |     await page.getByRole('link', { name: 'Suppliers', exact: true }).click();
  26 |     await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible();
  27 |   });
  28 | 
  29 |   test('Purchase Orders page loads', async ({ page }) => {
  30 |     await page.getByRole('link', { name: 'Purchase Orders', exact: true }).click();
  31 |     await expect(page.getByRole('heading', { name: 'Purchase Orders', exact: true })).toBeVisible();
  32 |   });
  33 | 
  34 |   test('Inventory Items page loads', async ({ page }) => {
  35 |     await page.getByRole('link', { name: 'Items', exact: true }).click();
  36 |     await expect(page.getByRole('heading', { name: 'Inventory Items' })).toBeVisible();
  37 |   });
  38 | 
  39 |   test('Banking Accounts page loads', async ({ page }) => {
  40 |     await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
  41 |     await expect(page.getByRole('heading', { name: 'Bank Accounts', exact: true })).toBeVisible();
  42 |   });
  43 | 
  44 |   test('Accounting Journal Entries page loads', async ({ page }) => {
  45 |     await page.getByRole('link', { name: 'Journal', exact: true }).click();
  46 |     await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  47 |   });
  48 | 
  49 |   test('Reports page loads', async ({ page }) => {
  50 |     await page.getByRole('link', { name: 'Reports', exact: true }).click();
  51 |     await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  52 |   });
  53 | 
  54 |   test('Settings page loads', async ({ page }) => {
  55 |     await page.getByRole('link', { name: 'Settings' }).click();
  56 |     await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  57 |   });
  58 | });
  59 | 
```