# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deep-workflow.spec.ts >> Deep Workflow Testing >> can perform a full sales quote to invoice workflow
- Location: e2e\deep-workflow.spec.ts:10:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.fill: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByLabel(/customer name/i).first()

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
  - generic [ref=e186] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e187]
    - generic [ref=e191]:
      - button "Open issues overlay" [ref=e192]:
        - generic [ref=e193]:
          - generic [ref=e194]: "0"
          - generic [ref=e195]: "1"
        - generic [ref=e196]: Issue
      - button "Collapse issues badge" [ref=e197]
  - alert [ref=e200]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Deep Workflow Testing', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('can perform a full sales quote to invoice workflow', async ({ page }) => {
  11 |     test.setTimeout(60000); // 1 minute timeout for this long workflow
  12 |     const ts = Date.now();
  13 |     const customerName = `Workflow Customer ${ts}`;
  14 |     const itemName = `Workflow Item ${ts}`;
  15 | 
  16 |     // 1. Create a Customer
  17 |     await page.getByRole('link', { name: 'Customers', exact: true }).click();
  18 |     await page.getByRole('link', { name: 'New Customer' }).first().click();
> 19 |     await page.getByLabel(/customer name/i).first().fill(customerName);
     |                                                     ^ Error: locator.fill: Test timeout of 60000ms exceeded.
  20 |     await page.getByRole('button', { name: /save customer/i }).click();
  21 |     await expect(page.getByRole('heading', { name: customerName, exact: true })).toBeVisible();
  22 | 
  23 |     // 2. Create an Item
  24 |     await page.getByRole('link', { name: 'Items', exact: true }).click();
  25 |     await page.getByRole('link', { name: 'New Item' }).first().click();
  26 |     await page.getByLabel(/item name/i).first().fill(itemName);
  27 |     await page.getByLabel(/sales price/i).first().fill('100.00');
  28 |     await page.getByRole('button', { name: /create item/i }).click();
  29 |     await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
  30 | 
  31 |     // 3. Create a Sales Quote
  32 |     await page.getByRole('link', { name: 'Sales Quotes', exact: true }).click();
  33 |     await page.getByRole('link', { name: 'New Quote' }).first().click();
  34 |     await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
  35 |     await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
  36 |     await page.getByLabel(/Line 1 quantity/i).fill('2');
  37 |     
  38 |     // Save as draft and then issue (or directly issue)
  39 |     await page.getByRole('button', { name: /Issue Quote/i }).click();
  40 |     
  41 |     // Sometimes there are notifications or direct navigation
  42 |     await expect(page).toHaveURL(/.*\/sales\/quotes\/.*/);
  43 |     await expect(page.getByRole('button', { name: /convert to order/i })).toBeVisible({ timeout: 15000 });
  44 | 
  45 |     // 4. Convert to Sales Order
  46 |     await page.getByRole('button', { name: /convert to order/i }).click();
  47 |     
  48 |     // We are now on the Sales Order view
  49 |     await expect(page).toHaveURL(/.*\/sales\/orders\/[a-zA-Z0-9-]{10,}.*/);
  50 |     await page.getByRole('link', { name: 'Edit', exact: true }).click();
  51 | 
  52 |     // Now on Sales Order edit form
  53 |     await expect(page.getByRole('heading', { name: /Edit Sales Order/i })).toBeVisible({ timeout: 15000 });
  54 |     await page.getByRole('button', { name: /Issue Order/i }).click();
  55 |     
  56 |     // Back to Sales Order view
  57 |     await expect(page).toHaveURL(/.*\/sales\/orders\/[a-zA-Z0-9-]{10,}.*/);
  58 |     await expect(page.getByRole('button', { name: /convert to invoice/i })).toBeVisible({ timeout: 15000 });
  59 | 
  60 |     // 5. Convert to Invoice
  61 |     await page.getByRole('button', { name: /convert to invoice/i }).click();
  62 |     
  63 |     // We are now on the Sales Invoice view
  64 |     await expect(page).toHaveURL(/.*\/sales\/invoices\/[a-zA-Z0-9-]{10,}.*/);
  65 |     await page.getByRole('link', { name: 'Edit', exact: true }).click();
  66 | 
  67 |     // Now on Sales Invoice edit form
  68 |     await expect(page.getByRole('heading', { name: /Edit Sales Invoice/i })).toBeVisible({ timeout: 15000 });
  69 |     await page.getByRole('button', { name: /Post Invoice/i }).click();
  70 |     
  71 |     // Back to Sales Invoice view
  72 |     await expect(page).toHaveURL(/.*\/sales\/invoices\/[a-zA-Z0-9-]{10,}.*/);
  73 |     
  74 |     // We should see a success marker (like Record Payment, or the invoice status)
  75 |     await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });
  76 |   });
  77 | });
  78 | 
  79 | 
```