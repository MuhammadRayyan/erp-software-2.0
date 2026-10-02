# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: eval-tax-vat.spec.ts >> Evaluation Suite B: Tax & VAT Calculations >> B1: UAE VAT Arithmetic (5% Standard + Zero Rated)
- Location: e2e\eval-tax-vat.spec.ts:10:3

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
  3  | test.describe('Evaluation Suite B: Tax & VAT Calculations', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('B1: UAE VAT Arithmetic (5% Standard + Zero Rated)', async ({ page }) => {
  11 |     test.setTimeout(90000);
  12 |     const ts = Date.now();
  13 |     const customerName = `VatCust ${ts}`;
  14 |     const item1 = `Item Standard ${ts}`;
  15 |     const item2 = `Item Zero ${ts}`;
  16 |     const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];
  17 | 
  18 |     // Create customer
  19 |     await page.goto(`/b/${businessId}/customers/new`);
> 20 |     await page.getByLabel(/customer name/i).first().fill(customerName);
     |                                                     ^ Error: locator.fill: Test timeout of 90000ms exceeded.
  21 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  22 | 
  23 |     // Create Items
  24 |     await page.goto(`/b/${businessId}/inventory/items/new`);
  25 |     await page.getByLabel(/item name/i).first().fill(item1);
  26 |     await page.getByLabel(/sales price/i).first().fill('100.00');
  27 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  28 |     
  29 |     await page.goto(`/b/${businessId}/inventory/items/new`);
  30 |     await page.getByLabel(/item name/i).first().fill(item2);
  31 |     await page.getByLabel(/sales price/i).first().fill('50.00');
  32 |     await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
  33 | 
  34 |     // Create Invoice
  35 |     await page.goto(`/b/${businessId}/sales/invoices/new`);
  36 |     
  37 |     await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
  38 |     await page.getByLabel(/supply emirate/i).selectOption({ label: 'Dubai' });
  39 | 
  40 |     // Line 1: Standard
  41 |     await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: item1 });
  42 |         
  43 |     // Add line 2: Zero
  44 |     await page.getByRole('button', { name: /add line/i }).click();
  45 |     await page.getByLabel(/Line 2 inventory item/i).selectOption({ label: item2 });
  46 |     await page.getByLabel(/Line 2 quantity/i).fill('2'); // 50 * 2 = 100
  47 |     // @ts-ignore
  48 |     await page.getByLabel(/Line 2 tax code/i).selectOption(/Zero/i);
  49 | 
  50 |     // Assert UI totals
  51 |     await expect(page.locator('text=Subtotal').locator('..').getByText('200.00')).toBeVisible();
  52 |     await expect(page.locator('text=VAT').locator('..').getByText('5.00')).toBeVisible();
  53 |     await expect(page.locator('text=Total').locator('..').getByText('205.00').first()).toBeVisible();
  54 |   });
  55 | 
  56 |     test('B3: Standard-Rated Sale Missing Emirate', async ({ page }) => {
  57 |     test.setTimeout(90000);
  58 |     const businessId = page.url().match(/\/b\/([^/]+)/)?.[1] || "demo";
  59 | 
  60 |     // Ensure VAT is registered in settings
  61 |     await page.goto(`/b/${businessId}/settings/tax`);
  62 |     
  63 |     const vatCheckbox = page.getByLabel(/vat registered/i);
  64 |     const isChecked = await vatCheckbox.isChecked();
  65 |     if (!isChecked) {
  66 |       await vatCheckbox.check();
  67 |     }
  68 |     
  69 |     // Attempt to clear default supply emirate while VAT is registered
  70 |     await page.getByLabel(/default supply emirate/i).selectOption({ index: 0 }); // none
  71 |     await page.locator('button', { hasText: 'Save VAT settings' }).click();
  72 | 
  73 |     // Assert that the settings page itself prevents this
  74 |     await expect(page.getByText(/Check the VAT registration settings/i)).toBeVisible();
  75 |   });
  76 | });
  77 | 
```