# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: eval-document-lifecycle.spec.ts >> Evaluation Suite D: Document Lifecycle Transitions >> D2: Delivery Note Locks Invoice Editing
- Location: e2e\eval-document-lifecycle.spec.ts:10:3

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
- generic [active] [ref=f3e1]:
  - generic [ref=f3e2]:
    - banner [ref=f3e3]:
      - generic [ref=f3e4]:
        - link "Ledgerly" [ref=f3e5] [cursor=pointer]:
          - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/overview
        - button "Search or jump to (Ctrl K)" [ref=f3e13]:
          - text: Search or jump to…
          - generic [ref=f3e17]: Ctrl K
        - button "Help" [ref=f3e18]
        - button "Account menu for Demo Administrator" [ref=f3e22]:
          - generic [ref=f3e27]: Demo Administrator
    - generic [ref=f3e28]:
      - complementary [ref=f3e29]:
        - button "Northstar Technical Services LLC Current business" [ref=f3e31]:
          - generic [ref=f3e37]:
            - generic [ref=f3e38]: Northstar Technical Services LLC
            - generic [ref=f3e39]: Current business
        - navigation "Business modules" [ref=f3e43]:
          - generic [ref=f3e44]:
            - link "Overview" [ref=f3e47] [cursor=pointer]:
              - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/overview
            - generic [ref=f3e53]:
              - paragraph [ref=f3e54]: Sales
              - generic [ref=f3e55]:
                - link "Customers" [ref=f3e56] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/customers
                - link "Sales Quotes" [ref=f3e61] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/quotes
                - link "Sales Orders" [ref=f3e65] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/orders
                - link "Sales Invoices" [ref=f3e70] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/invoices
                - link "Receipts" [ref=f3e73] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/receipts
                - link "Credit Notes" [ref=f3e77] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/credit-notes
                - link "Delivery Notes" [ref=f3e80] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/delivery-notes
                - link "Sent Emails" [ref=f3e86] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/emails
            - generic [ref=f3e90]:
              - paragraph [ref=f3e91]: Purchases
              - generic [ref=f3e92]:
                - link "Suppliers" [ref=f3e93] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/suppliers
                - link "Purchase Quotes" [ref=f3e99] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/quotes
                - link "Purchase Orders" [ref=f3e103] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/orders
                - link "Purchase Invoices" [ref=f3e108] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/invoices
                - link "Supplier Payments" [ref=f3e113] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/payments
                - link "Debit Notes" [ref=f3e120] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/debit-notes
                - link "Goods Receipts" [ref=f3e123] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/goods-receipts
            - generic [ref=f3e129]:
              - paragraph [ref=f3e130]: Banking
              - link "Bank Accounts" [ref=f3e132] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/banking/accounts
            - generic [ref=f3e136]:
              - paragraph [ref=f3e137]: Projects
              - link "Projects" [ref=f3e139] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/projects
            - generic [ref=f3e142]:
              - paragraph [ref=f3e143]: Inventory
              - generic [ref=f3e144]:
                - link "Items" [ref=f3e145] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/items
                - link "Locations" [ref=f3e150] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/inventory/locations
            - generic [ref=f3e154]:
              - paragraph [ref=f3e155]: Accounting
              - generic [ref=f3e156]:
                - link "Chart of Accounts" [ref=f3e157] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/accounting/chart-of-accounts
                - link "Journal" [ref=f3e160] [cursor=pointer]:
                  - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/accounting/journal
            - generic [ref=f3e165]:
              - paragraph [ref=f3e166]: Reports
              - link "Reports" [ref=f3e168] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/reports
          - link "Settings" [ref=f3e173] [cursor=pointer]:
            - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/settings
      - main [ref=f3e177]:
        - generic [ref=f3e178]:
          - heading "Failed to load data" [level=3] [ref=f3e179]
          - paragraph [ref=f3e180]: "no such column: code"
          - button "Try again" [ref=f3e181]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=f3e187] [cursor=pointer]
  - alert [ref=f3e191]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Evaluation Suite D: Document Lifecycle Transitions', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('D2: Delivery Note Locks Invoice Editing', async ({ page }) => {
  11 |     test.setTimeout(90000);
  12 |     const ts = Date.now();
  13 |     const customerName = `Cust D2 ${ts}`;
  14 |     const itemName = `Item D2 ${ts}`;
  15 |     const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];
  16 | 
  17 |     // Customer
  18 |     await page.goto(`/b/${businessId}/customers/new`);
> 19 |     await page.getByLabel(/customer name/i).first().fill(customerName);
     |                                                     ^ Error: locator.fill: Test timeout of 90000ms exceeded.
  20 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  21 | 
  22 |     // Item (add stock so we can deliver)
  23 |     await page.goto(`/b/${businessId}/inventory/items/new`);
  24 |     await page.getByLabel(/item name/i).first().fill(itemName);
  25 |     await page.getByLabel(/sales price/i).first().fill('100.00');
  26 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  27 | 
  28 |     // Add stock
  29 |     await page.goto(`/b/${businessId}/inventory/adjustments/new`);
  30 |     await page.getByLabel(/inventory item/i).selectOption({ label: itemName });
  31 |     await page.getByLabel(/quantity change/i).fill('10');
  32 |     await page.getByLabel(/reason/i).selectOption({ label: 'Opening Balance' });
  33 |     await page.getByLabel(/unit cost/i).fill('50.00');
  34 |     await page.getByRole('button', { name: /post adjustment/i }).click();
  35 |     
  36 |     // Invoice
  37 |     await page.goto(`/b/${businessId}/sales/invoices/new`);
  38 |     await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
  39 |     await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
  40 |     await page.getByRole('button', { name: /post invoice/i }).click();
  41 |     
  42 |     // Create Delivery Note from Invoice (if button exists, else skip or create manually)
  43 |     // Actually there is a "Deliver Items" button on the invoice view
  44 |     await page.getByRole('link', { name: 'Create Delivery Note' }).click();
  45 |     await page.locator('button', { hasText: 'Post Delivery' }).click(); await page.waitForTimeout(2000);
  46 |     
  47 |     // Navigate back to Invoice
  48 |     await page.goto(`/b/${businessId}/sales/invoices`);
  49 |     await page.getByRole('row', { name: customerName }).first().getByRole('link').first().click(); // Should hit the invoice we just made
  50 | 
  51 |     // Try editing
  52 |     await page.getByRole('link', { name: 'Edit', exact: true }).click();
  53 |     await page.getByRole('button', { name: /update posted invoice/i }).click();
  54 | 
  55 |     await expect(page.getByText(/A Sales Invoice cannot be edited after a Delivery Note has been created from it/i)).toBeVisible();
  56 |   });
  57 | });
  58 | 
```