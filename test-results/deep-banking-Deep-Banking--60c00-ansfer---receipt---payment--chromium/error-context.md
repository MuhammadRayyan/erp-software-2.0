# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deep-banking.spec.ts >> Deep Banking Testing >> can perform a full banking workflow (accounts -> transfer -> receipt -> payment)
- Location: e2e\deep-banking.spec.ts:10:3

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 120000ms exceeded.
Call log:
  - waiting for getByLabel(/type/i)

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
          - link "Bank Account" [ref=e179] [cursor=pointer]:
            - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/banking/accounts/10a1da9a-a559-4237-a041-753e0f59d64d
          - generic [ref=e183]:
            - heading "New Bank Transaction" [level=1] [ref=e184]
            - paragraph [ref=e185]: Record non-AR/AP money in or out. Use Receipts and Supplier Payments for customer or supplier activity.
          - generic [ref=e186]:
            - generic [ref=e187]:
              - heading "Transaction details" [level=2] [ref=e188]
              - generic [ref=e189]:
                - generic [ref=e190]:
                  - text: Bank Account
                  - combobox "Bank Account" [ref=e191]:
                    - option "Choose account"
                    - option "Main Bank" [selected]
                    - option "Petty Cash"
                - generic [ref=e192]:
                  - text: Direction
                  - combobox "Direction" [ref=e193]:
                    - option "Money Out" [selected]
                    - option "Money In"
                - generic [ref=e194]:
                  - text: Date
                  - textbox "Date" [ref=e195]: 2026-10-02
                - generic [ref=e196]:
                  - text: VAT tax date
                  - textbox "VAT tax date" [ref=e197]: 2026-10-02
                - generic [ref=e198]:
                  - generic [ref=e199]: Reference (optional)
                  - textbox "Reference (optional)" [ref=e200]
                - generic [ref=e201]:
                  - text: Description
                  - textbox "Description" [ref=e202]
            - generic [ref=e203]:
              - generic [ref=e204]:
                - generic [ref=e205]:
                  - heading "Expense allocation" [level=2] [ref=e206]
                  - paragraph [ref=e207]: Amounts include tax. Project is applied only to the counter-account P&L line.
                - button "Add line" [ref=e208]
              - generic [ref=e211]:
                - generic [ref=e212]:
                  - text: Description
                  - textbox [ref=e213]
                - generic [ref=e214]:
                  - text: Counter account
                  - combobox [ref=e215]:
                    - option "Choose account"
                    - option "Cost of Sales"
                    - option "Fixed Assets"
                    - option "General Purchases / Expenses" [selected]
                    - option "Inventory Adjustments"
                    - option "Inventory Asset"
                    - option "Operating Expenses"
                    - option "Other Current Assets"
                    - option "Other Income"
                    - option "Owner's Equity / Retained Earnings"
                    - option "Realized FX Gain"
                    - option "Realized FX Loss"
                    - option "Sales"
                    - option "VAT Payable"
                    - option "VAT Recoverable / Input VAT"
                - generic [ref=e216]:
                  - text: Tax
                  - combobox [ref=e217]:
                    - option "No VAT" [selected]
                    - option "Out of Scope"
                    - option "Import VAT 5% Purchases"
                    - option "UAE VAT 5%"
                    - option "UAE VAT 5% Purchases"
                - generic [ref=e218]:
                  - text: Project
                  - combobox [ref=e219]:
                    - option "No Project" [selected]
                    - option "Dubai Villa Fit-Out"
                    - option "Office Upgrade"
                - generic [ref=e220]:
                  - generic [ref=e221]:
                    - text: Amount incl. tax
                    - textbox [ref=e222]: "0.00"
                  - button "Remove line 1" [disabled]
              - generic [ref=e225]:
                - generic [ref=e226]: Transaction total
                - generic [ref=e227]: AED 0.00
            - generic [ref=e228]:
              - link "Cancel" [ref=e229] [cursor=pointer]:
                - /url: /b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/banking/accounts/10a1da9a-a559-4237-a041-753e0f59d64d
              - generic [ref=e230]:
                - button "Save Draft" [ref=e231]
                - button "Post Transaction" [ref=e232]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e238] [cursor=pointer]
  - alert [ref=e242]: Ledgerly ERP
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Deep Banking Testing', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await page.locator('article a').first().click();
  7  |     await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  8  |   });
  9  | 
  10 |   test('can perform a full banking workflow (accounts -> transfer -> receipt -> payment)', async ({ page }) => {
  11 |     test.setTimeout(120000); // 2 minutes timeout for this long workflow
  12 |     const ts = Date.now();
  13 |     const account1 = `Checking ${ts}`;
  14 |     const account2 = `Savings ${ts}`;
  15 |     const code1 = `CHK${ts.toString().slice(-4)}`;
  16 |     const code2 = `SAV${ts.toString().slice(-4)}`;
  17 | 
  18 |     // Navigate to Banking
  19 |     await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
  20 | 
  21 |     // 2. Perform a transfer
  22 |     await page.getByRole('link', { name: 'Transfer', exact: true }).click();
  23 |     await page.getByLabel(/from account/i).selectOption({ index: 1 });
  24 |     await page.getByLabel(/to account/i).selectOption({ index: 2 });
  25 |     await page.getByLabel(/amount/i).fill('500.00');
  26 |     await page.getByRole('button', { name: /post transfer/i }).click();
  27 |     
  28 |     await expect(page.getByText('Bank Transfer posted').first()).toBeVisible();
  29 |     await expect(page.getByText('Posted').first()).toBeVisible();
  30 | 
  31 |     // 3. Perform a manual receipt
  32 |     await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
  33 |     await page.locator('table tbody tr').nth(0).getByRole('link').first().click();
  34 |     await page.getByRole('link', { name: 'New Transaction' }).first().click();
> 35 |     await page.getByLabel(/type/i).selectOption({ label: 'Receipt' });
     |                                    ^ Error: locator.selectOption: Test timeout of 120000ms exceeded.
  36 |     await page.getByLabel(/amount/i).fill('1000.00');
  37 |     await page.getByLabel(/description/i).fill('Initial deposit');
  38 |     await page.getByLabel(/Line 1 account/i).selectOption({ index: 1 });
  39 |     await page.getByRole('button', { name: /post transaction/i }).click();
  40 |     
  41 |     await expect(page.getByText('Transaction posted')).toBeVisible();
  42 | 
  43 |     // 4. Perform a manual payment
  44 |     await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
  45 |     await page.locator('table tbody tr').nth(1).getByRole('link').first().click();
  46 |     await page.getByRole('link', { name: 'New Transaction' }).first().click();
  47 |     await page.getByLabel(/type/i).selectOption({ label: 'Payment' });
  48 |     await page.getByLabel(/amount/i).fill('100.00');
  49 |     await page.getByLabel(/description/i).fill('Office supplies');
  50 |     await page.getByLabel(/Line 1 account/i).selectOption({ index: 2 });
  51 |     await page.getByRole('button', { name: /post transaction/i }).click();
  52 |     
  53 |     await expect(page.getByText('Transaction posted')).toBeVisible();
  54 |   });
  55 | });
  56 | 
```