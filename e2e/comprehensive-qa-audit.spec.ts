import { test, expect, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { getBusinessPaths, SYSTEM_DB_PATH } from '../src/core/db/paths';

test.describe('Full End-to-End QA & Architecture Verification Audit', () => {
  let businessId = '';
  let directoryKey = '';
  let dbPath = '';
  let businessDb: Database.Database;

  function getFreshDb() {
    return new Database(dbPath, { readonly: true });
  }

  // Attached error tracker for zero-error policy
  function attachZeroErrorListeners(page: Page, capturedErrors: string[]) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore harmless favicon or external extension messages if any
        if (!text.includes('favicon.ico') && !text.includes('chrome-extension')) {
          capturedErrors.push(`[Console Error] ${text}`);
        }
      }
    });

    page.on('pageerror', (err) => {
      capturedErrors.push(`[Page Error] ${err.message}`);
    });

    page.on('response', (res) => {
      const status = res.status();
      const url = res.url();
      if (status >= 400 && !url.includes('favicon.ico') && !url.includes('/api/auth/session')) {
        capturedErrors.push(`[HTTP ${status}] ${url}`);
      }
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const businessCard = page.locator('article a').first();
    await expect(businessCard).toBeVisible({ timeout: 15000 });
    await businessCard.click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15000 });

    const url = page.url();
    const match = url.match(/\/b\/([^/]+)/);
    if (match) {
      businessId = match[1];
    }

    // Connect to SQLite DB for relational verification
    const systemDb = new Database(SYSTEM_DB_PATH, { readonly: true });
    const businessRow = systemDb.prepare('SELECT directory_key FROM businesses WHERE id = ?').get(businessId) as { directory_key: string };
    directoryKey = businessRow.directory_key;
    dbPath = getBusinessPaths(directoryKey).database;
    businessDb = new Database(dbPath, { readonly: true });
  });

  test.afterEach(() => {
    if (businessDb) {
      businessDb.close();
    }
  });

  test('1. Zero-Error Route Crawler across all 40+ ERP navigation routes and financial reports', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes to accommodate Next.js on-demand route compilation
    const capturedErrors: string[] = [];
    attachZeroErrorListeners(page, capturedErrors);

    const routesToCrawl = [
      // Overview
      `/b/${businessId}`,
      `/b/${businessId}/overview`,
      // Customers & Suppliers
      `/b/${businessId}/customers`,
      `/b/${businessId}/customers/new`,
      `/b/${businessId}/suppliers`,
      `/b/${businessId}/suppliers/new`,
      // Sales
      `/b/${businessId}/sales/quotes`,
      `/b/${businessId}/sales/orders`,
      `/b/${businessId}/sales/invoices`,
      `/b/${businessId}/sales/delivery-notes`,
      `/b/${businessId}/sales/credit-notes`,
      `/b/${businessId}/sales/receipts`,
      // Purchases
      `/b/${businessId}/purchases/quotes`,
      `/b/${businessId}/purchases/orders`,
      `/b/${businessId}/purchases/invoices`,
      `/b/${businessId}/purchases/goods-receipts`,
      `/b/${businessId}/purchases/debit-notes`,
      `/b/${businessId}/purchases/payments`,
      // Inventory
      `/b/${businessId}/inventory/items`,
      `/b/${businessId}/inventory/locations`,
      `/b/${businessId}/inventory/adjustments`,
      // Projects
      `/b/${businessId}/projects`,
      // Banking
      `/b/${businessId}/banking`,
      `/b/${businessId}/banking/accounts`,
      `/b/${businessId}/banking/transactions/new`,
      `/b/${businessId}/banking/transfers/new`,
      // Accounting
      `/b/${businessId}/accounting/chart-of-accounts`,
      `/b/${businessId}/accounting/journal`,
      `/b/${businessId}/accounting/find-and-recode`,
      // Reports
      `/b/${businessId}/reports`,
      `/b/${businessId}/reports/general-ledger`,
      `/b/${businessId}/reports/trial-balance`,
      `/b/${businessId}/reports/profit-loss`,
      `/b/${businessId}/reports/balance-sheet`,
      `/b/${businessId}/reports/cash-flow-forecast`,
      `/b/${businessId}/reports/accounts-receivable`,
      `/b/${businessId}/reports/accounts-payable`,
      `/b/${businessId}/reports/stock-on-hand`,
      `/b/${businessId}/reports/vat-transactions`,
      `/b/${businessId}/reports/customer-statement`,
      `/b/${businessId}/reports/supplier-statement`,
      // Settings
      `/b/${businessId}/settings`,
      `/b/${businessId}/settings/business-profile`,
      `/b/${businessId}/settings/currencies`,
      `/b/${businessId}/settings/tax-codes`,
      `/b/${businessId}/settings/payment-terms`,
      `/b/${businessId}/settings/document-templates`,
      `/b/${businessId}/settings/custom-fields`,
      `/b/${businessId}/settings/bank-rules`,
      `/b/${businessId}/settings/opening-balances`,
      `/b/${businessId}/settings/lock-date`,
      `/b/${businessId}/settings/system-health`,
    ];

    for (const route of routesToCrawl) {
      const response = await page.goto(route);
      expect(response?.ok(), `Failed to load route ${route} - HTTP ${response?.status()}`).toBeTruthy();

      // Check no Next.js error boundary / crash display
      const errorBoundary = page.locator('text=Application error: a client-side exception has occurred');
      await expect(errorBoundary).not.toBeVisible();

      const nextOverlay = page.locator('div[data-nextjs-dialog-overlay]');
      await expect(nextOverlay).not.toBeVisible();

      // Check that a page heading or container rendered
      const heading = page.locator('h1, h2, .page-title, .page-container').first();
      await expect(heading).toBeVisible({ timeout: 15000 });
    }

    // Zero-error assertion
    expect(capturedErrors, `Expected zero console errors and zero failed network responses across all routes. Found:\n${capturedErrors.join('\n')}`).toEqual([]);
  });

  test('2. Sales Relational Lifecycle: Customer -> Invoice -> Post -> Ledger Balance -> Receipt Settle', async ({ page }) => {
    test.setTimeout(90000);
    const capturedErrors: string[] = [];
    attachZeroErrorListeners(page, capturedErrors);

    const ts = Date.now();
    const customerName = `QA Audit Cust ${ts}`;

    // 1. Create Customer
    await page.goto(`/b/${businessId}/customers/new`);
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.getByLabel(/email/i).first().fill(`qa-${ts}@example.com`);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: customerName })).toBeVisible({ timeout: 15000 });

    // Verify DB persistence of Customer
    const customerRow = businessDb.prepare('SELECT id, name FROM customers WHERE name = ?').get(customerName) as { id: string; name: string };
    expect(customerRow).toBeDefined();
    expect(customerRow.name).toBe(customerName);

    // 2. Create & Post Sales Invoice with line item
    await page.goto(`/b/${businessId}/sales/invoices/new`);
    await page.waitForTimeout(1000);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await expect(page.getByLabel(/customer/i).first()).not.toHaveValue('');

    // Fill line item description and rate
    await page.getByLabel(/Line 1 description/i).fill('Consulting and Strategic Implementation');
    await page.getByLabel(/Line 1 rate/i).fill('1000.00');

    // Post the invoice
    await page.getByRole('button', { name: /post invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });

    // Verify Relational & Accounting Integrity in Database
    const invoiceRow = businessDb.prepare(
      'SELECT id, invoice_number, total_minor, document_status FROM sales_invoices WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(customerRow.id) as { id: string; invoice_number: string; total_minor: number; document_status: string };
    
    expect(invoiceRow).toBeDefined();
    expect(invoiceRow.document_status).toBe('posted');
    expect(invoiceRow.total_minor).toBe(105000); // 1000 + 5% standard VAT (50) = 1050.00 AED

    // Verify Accounts Receivable ledger journal entry exists and is balanced
    const journal = businessDb.prepare(
      "SELECT id FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?"
    ).get(invoiceRow.id) as { id: string };
    expect(journal).toBeDefined();

    const journalSum = businessDb.prepare(
      "SELECT SUM(debit_minor) AS total_debit_minor, SUM(credit_minor) AS total_credit_minor FROM journal_lines WHERE journal_entry_id = ?"
    ).get(journal.id) as { total_debit_minor: number; total_credit_minor: number };
    expect(journalSum.total_debit_minor).toBe(journalSum.total_credit_minor); // Debit = Credit invariant!
    expect(journalSum.total_debit_minor).toBe(105000);

    // 3. Record Customer Receipt to settle
    await page.getByRole('link', { name: 'Record Receipt' }).click();
    await expect(page.getByRole('heading', { name: 'Record Receipt' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /post receipt/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/receipts/new'), { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /REC-\d+|INV-\d+/ })).toBeVisible({ timeout: 15000 });

    // Verify receipt allocation is created in SQLite
    const receiptDb = getFreshDb();
    const allocation = receiptDb.prepare(
      'SELECT amount_minor FROM receipt_allocations WHERE sales_invoice_id = ?'
    ).get(invoiceRow.id) as { amount_minor: number };
    expect(allocation).toBeDefined();
    expect(allocation.amount_minor).toBe(105000);
    receiptDb.close();

    // Check zero console/network errors
    expect(capturedErrors).toEqual([]);
  });

  test('3. Purchase Relational Lifecycle: Supplier -> Bill -> AP Ledger Balance -> Payment Settle', async ({ page }) => {
    test.setTimeout(90000);
    const capturedErrors: string[] = [];
    attachZeroErrorListeners(page, capturedErrors);

    const ts = Date.now();
    const supplierName = `QA Audit Supp ${ts}`;

    // 1. Create Supplier
    await page.goto(`/b/${businessId}/suppliers/new`);
    await page.getByLabel(/supplier name/i).first().fill(supplierName);
    await page.getByLabel(/email/i).first().fill(`supp-${ts}@example.com`);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: supplierName })).toBeVisible({ timeout: 15000 });

    const supplierRow = businessDb.prepare('SELECT id, name FROM suppliers WHERE name = ?').get(supplierName) as { id: string; name: string };
    expect(supplierRow).toBeDefined();

    // 2. Create and Post Purchase Bill (Purchase Invoice)
    await page.goto(`/b/${businessId}/purchases/invoices/new?supplierId=${supplierRow.id}`);
    await page.waitForTimeout(1000);
    await page.getByLabel(/supplier invoice/i).first().fill(`SUPP-INV-${ts}`);
    await page.getByLabel(/Line 1 description/i).fill('Consulting and Professional Services');
    await page.getByLabel(/Line 1 rate/i).fill('400.00');

    await page.getByRole('button', { name: /post invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });

    // Verify Bill persistence in SQLite
    const billRow = businessDb.prepare(
      'SELECT id, internal_number, total_minor, document_status FROM purchase_invoices WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(supplierRow.id) as { id: string; internal_number: string; total_minor: number; document_status: string };
    expect(billRow).toBeDefined();
    expect(billRow.document_status).toBe('posted');
    expect(billRow.total_minor).toBe(42000); // 400 + 5% VAT (20) = 420.00 AED

    // Verify AP Ledger Journal Entry exists and Debits = Credits
    const apJournal = businessDb.prepare(
      "SELECT id FROM journal_entries WHERE source_type = 'purchase_invoice' AND source_id = ?"
    ).get(billRow.id) as { id: string };
    expect(apJournal).toBeDefined();

    const apJournalSum = businessDb.prepare(
      "SELECT SUM(debit_minor) AS total_debit_minor, SUM(credit_minor) AS total_credit_minor FROM journal_lines WHERE journal_entry_id = ?"
    ).get(apJournal.id) as { total_debit_minor: number; total_credit_minor: number };
    expect(apJournalSum.total_debit_minor).toBe(apJournalSum.total_credit_minor);
    expect(apJournalSum.total_debit_minor).toBe(42000);

    // 3. Record Supplier Payment
    await page.getByRole('link', { name: 'Record Payment' }).click();
    await expect(page.getByRole('heading', { name: 'Record Supplier Payment' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /post payment/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/payments/new'), { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /PAY-\d+|PI-\d+/ })).toBeVisible({ timeout: 15000 });

    // Verify Payment allocation in DB
    const paymentDb = getFreshDb();
    const paymentAllocation = paymentDb.prepare(
      'SELECT amount_minor FROM supplier_payment_allocations WHERE purchase_invoice_id = ?'
    ).get(billRow.id) as { amount_minor: number };
    expect(paymentAllocation).toBeDefined();
    expect(paymentAllocation.amount_minor).toBe(42000);
    paymentDb.close();

    expect(capturedErrors).toEqual([]);
  });

  test('4. Relational & Accounting Invariants: Bank Transfer, Negative Values & Form Validation', async ({ page }) => {
    test.setTimeout(60000);
    const capturedErrors: string[] = [];
    attachZeroErrorListeners(page, capturedErrors);

    // 1. Visit Bank Transfer form
    await page.goto(`/b/${businessId}/banking/transfers/new`);
    await expect(page.getByRole('heading', { name: 'New Bank Transfer' })).toBeVisible();

    const fromAccount = page.locator('#fromBankAccountId');
    const toAccount = page.locator('#toBankAccountId');
    const amountField = page.locator('#amount');

    // Test Edge Case: Transfer between the same account
    await fromAccount.selectOption({ index: 1 });
    await toAccount.selectOption({ index: 1 });
    await amountField.fill('250.00');
    await page.getByRole('button', { name: /post transfer/i }).click();

    // Verify validation blocks same account transfer
    await expect(page.locator('text=Source and destination accounts must differ')).toBeVisible({ timeout: 5000 });

    // Test Edge Case: Distinct accounts with negative amount
    await toAccount.selectOption({ index: 2 });
    await amountField.fill('-50.00');
    await page.getByRole('button', { name: /post transfer/i }).click();
    await expect(page.locator('text=Enter an amount with up to 2 decimals')).toBeVisible({ timeout: 5000 });

    // Happy Path: Valid positive amount
    await amountField.fill('250.00');
    await page.getByRole('button', { name: /post transfer/i }).click();

    // Should redirect to bank transfer view page
    await expect(page.getByRole('heading', { name: 'Bank Transfer' })).toBeVisible({ timeout: 15000 });

    // Verify Bank Transfer in SQLite DB creates balanced journal
    const transferDb = getFreshDb();
    const transferJournal = transferDb.prepare(
      "SELECT id FROM journal_entries WHERE source_type = 'bank_transfer' ORDER BY created_at DESC LIMIT 1"
    ).get() as { id: string };
    expect(transferJournal).toBeDefined();

    const transferSum = transferDb.prepare(
      "SELECT SUM(debit_minor) AS total_debit_minor, SUM(credit_minor) AS total_credit_minor FROM journal_lines WHERE journal_entry_id = ?"
    ).get(transferJournal.id) as { total_debit_minor: number; total_credit_minor: number };
    expect(transferSum.total_debit_minor).toBe(25000);
    expect(transferSum.total_credit_minor).toBe(25000); // Invariant: Debits = Credits
    transferDb.close();

    // 2. Test Customer form validation edge cases: empty name & invalid email
    await page.goto(`/b/${businessId}/customers/new`);

    // Blur empty name field
    const nameField = page.getByLabel(/customer name/i).first();
    await nameField.focus();
    await nameField.fill('a');
    await nameField.fill('');
    await nameField.blur();
    await expect(page.locator('text=Enter a customer name')).toBeVisible();

    // Enter invalid email and blur
    const emailField = page.getByLabel(/email/i).first();
    await emailField.fill('not-an-email');
    await emailField.blur();
    await expect(page.locator('text=Enter a valid email')).toBeVisible();

    // Clear invalid email
    await emailField.fill('');
    await emailField.blur();
    await expect(page.locator('text=Enter a valid email')).not.toBeVisible();

    // Zero unexpected client/network errors
    const nonExpectedErrors = capturedErrors.filter(
      (err) => !err.includes('400') || !err.includes('validation')
    );
    expect(nonExpectedErrors).toEqual([]);
  });
});
