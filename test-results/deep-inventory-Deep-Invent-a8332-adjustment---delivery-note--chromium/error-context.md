# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deep-inventory.spec.ts >> Deep Inventory Testing >> can perform inventory workflows (goods receipt -> stock adjustment -> delivery note)
- Location: e2e\deep-inventory.spec.ts:10:3

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.fill: Test timeout of 120000ms exceeded.
Call log:
  - waiting for getByLabel(/supplier name/i).first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - link "Ledgerly" [ref=e5] [cursor=pointer]:
          - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/overview
        - button "Search or jump to (Ctrl K)" [ref=e13]:
          - text: Search or jump to…
          - generic [ref=e17]: Ctrl K
        - button "Help" [ref=e18]
        - button "Account menu for Demo Administrator" [ref=e22]:
          - generic [ref=e27]: Demo Administrator
    - generic [ref=e28]:
      - complementary [ref=e29]:
        - button "Northstar Technical Services LLC Current business" [ref=e31]:
          - generic [ref=e37]:
            - generic [ref=e38]: Northstar Technical Services LLC
            - generic [ref=e39]: Current business
        - navigation "Business modules" [ref=e43]:
          - generic [ref=e44]:
            - link "Overview" [ref=e47] [cursor=pointer]:
              - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/overview
            - generic [ref=e53]:
              - paragraph [ref=e54]: Sales
              - generic [ref=e55]:
                - link "Customers" [ref=e56] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/customers
                - link "Sales Quotes" [ref=e61] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/quotes
                - link "Sales Orders" [ref=e65] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/orders
                - link "Sales Invoices" [ref=e70] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/invoices
                - link "Receipts" [ref=e73] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/receipts
                - link "Credit Notes" [ref=e77] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/credit-notes
                - link "Delivery Notes" [ref=e80] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/delivery-notes
                - link "Sent Emails" [ref=e86] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/emails
            - generic [ref=e90]:
              - paragraph [ref=e91]: Purchases
              - generic [ref=e92]:
                - link "Suppliers" [ref=e93] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/suppliers
                - link "Purchase Quotes" [ref=e99] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/quotes
                - link "Purchase Orders" [ref=e103] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/orders
                - link "Purchase Invoices" [ref=e108] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/invoices
                - link "Supplier Payments" [ref=e113] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/payments
                - link "Debit Notes" [ref=e120] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/debit-notes
                - link "Goods Receipts" [ref=e123] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/goods-receipts
            - generic [ref=e129]:
              - paragraph [ref=e130]: Banking
              - link "Bank Accounts" [ref=e132] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/banking/accounts
            - generic [ref=e136]:
              - paragraph [ref=e137]: Projects
              - link "Projects" [ref=e139] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/projects
            - generic [ref=e142]:
              - paragraph [ref=e143]: Inventory
              - generic [ref=e144]:
                - link "Items" [ref=e145] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/items
                - link "Locations" [ref=e150] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/locations
            - generic [ref=e154]:
              - paragraph [ref=e155]: Accounting
              - generic [ref=e156]:
                - link "Chart of Accounts" [ref=e157] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/accounting/chart-of-accounts
                - link "Journal" [ref=e160] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/accounting/journal
            - generic [ref=e165]:
              - paragraph [ref=e166]: Reports
              - link "Reports" [ref=e168] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/reports
          - link "Settings" [ref=e173] [cursor=pointer]:
            - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/settings
      - main [ref=e177]:
        - generic [ref=e178]:
          - heading "Failed to load data" [level=3] [ref=e179]
          - paragraph [ref=e180]: "no such column: code"
          - button "Try again" [ref=e181]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e187] [cursor=pointer]
  - alert [ref=e191]: Ledgerly ERP
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Deep Inventory Testing', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('can perform inventory workflows (goods receipt -> stock adjustment -> delivery note)', async ({ page }) => {
  11 |     test.setTimeout(120000);
  12 |     const ts = Date.now();
  13 |     const customer = `Cust ${ts}`;
  14 |     const supplier = `Supp ${ts}`;
  15 |     const item = `Item ${ts}`;
  16 | 
  17 |     // 1. Create a supplier and customer
  18 |     await page.getByRole('link', { name: 'Suppliers', exact: true }).click();
  19 |     await page.getByRole('link', { name: 'New Supplier' }).first().click();
> 20 |     await page.getByLabel(/supplier name/i).first().fill(supplier);
     |                                                     ^ Error: locator.fill: Test timeout of 120000ms exceeded.
  21 |     await page.getByRole('button', { name: /create supplier/i }).click();
  22 |     await expect(page.getByRole('heading', { name: supplier })).toBeVisible();
  23 | 
  24 |     await page.getByRole('link', { name: 'Customers', exact: true }).click();
  25 |     await page.getByRole('link', { name: 'New Customer' }).first().click();
  26 |     await page.getByLabel(/customer name/i).first().fill(customer);
  27 |     await page.getByRole('button', { name: /save customer/i }).click();
  28 |     await expect(page.getByRole('heading', { name: customer })).toBeVisible();
  29 | 
  30 |     // 2. Create an Item
  31 |     await page.getByRole('link', { name: 'Items', exact: true }).click();
  32 |     await page.getByRole('link', { name: 'New Item' }).first().click();
  33 |     await page.getByLabel(/item name/i).first().fill(item);
  34 |     await page.getByLabel(/sales price/i).first().fill('100.00');
  35 |     await page.getByLabel(/purchase price/i).first().fill('50.00');
  36 |     await page.getByRole('button', { name: /create item/i }).click();
  37 |     await expect(page.getByRole('heading', { name: item })).toBeVisible();
  38 | 
  39 |     // 3. Goods Receipt (without PO/Invoice)
  40 |     await page.getByRole('link', { name: 'Goods Receipts', exact: true }).click();
  41 |     await page.getByRole('link', { name: 'New Goods Receipt' }).first().click();
  42 |     await page.getByLabel(/supplier/i).first().selectOption({ label: supplier });
  43 |     await page.getByLabel(/Line 1 item/i).selectOption({ label: item });
  44 |     await page.getByLabel(/Line 1 quantity/i).fill('10');
  45 |     await page.getByRole('button', { name: /post receipt/i }).click();
  46 |     await expect(page.getByText('POSTED').first()).toBeVisible();
  47 | 
  48 |     // 4. Stock Adjustment
  49 |     await page.getByRole('link', { name: 'Items', exact: true }).click();
  50 |     await page.getByRole('link', { name: 'Adjust Stock' }).first().click();
  51 |     await page.getByLabel(/item/i).selectOption({ label: item });
  52 |     await page.getByLabel(/quantity change/i).fill('-2');
  53 |     await page.getByLabel(/reason/i).selectOption({ label: 'Damaged' });
  54 |     await page.getByRole('button', { name: /post adjustment/i }).click();
  55 |     await expect(page.getByText('POSTED').first()).toBeVisible();
  56 | 
  57 |     // 5. Delivery Note
  58 |     await page.getByRole('link', { name: 'Delivery Notes', exact: true }).click();
  59 |     await page.getByRole('link', { name: 'New Delivery Note' }).first().click();
  60 |     await page.getByLabel(/customer/i).first().selectOption({ label: customer });
  61 |     await page.getByLabel(/Line 1 item/i).selectOption({ label: item });
  62 |     await page.getByLabel(/Line 1 quantity/i).fill('5');
  63 |     await page.getByRole('button', { name: /post delivery note/i }).click();
  64 |     await expect(page.getByText('POSTED').first()).toBeVisible();
  65 |   });
  66 | });
  67 | 
```