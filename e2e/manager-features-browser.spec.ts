import { test, expect } from '@playwright/test';

test.describe('Manager.io ERP Features & Interactive Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Select the first business from list
    const businessLink = page.locator('article a').first();
    await expect(businessLink).toBeVisible();
    await businessLink.click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('1. Settings Hub displays new Manager.io modules and filters correctly', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Verify all new settings modules exist in the hub via their dedicated hrefs
    await expect(page.locator('a[href*="/settings/payment-terms"]')).toBeVisible();
    await expect(page.locator('a[href*="/settings/units-of-measure"]')).toBeVisible();
    await expect(page.locator('a[href*="/settings/email-templates"]')).toBeVisible();
    await expect(page.locator('a[href*="/settings/lock-date"]')).toBeVisible();
    await expect(page.locator('a[href*="/settings/opening-balances"]')).toBeVisible();

    // Filter by keyword "Payment"
    const searchInput = page.getByPlaceholder(/Filter settings by keyword/i);
    await searchInput.fill('Payment');
    await expect(page.locator('a[href*="/settings/payment-terms"]')).toBeVisible();
    await expect(page.locator('a[href*="/settings/units-of-measure"]')).not.toBeVisible();

    // Clear filter
    await page.locator('button:has(svg.lucide-x)').click();
    await expect(page.locator('a[href*="/settings/units-of-measure"]')).toBeVisible();
  });

  test('2. Payment Terms Presets Manager CRUD and calculations', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.locator('a[href*="/settings/payment-terms"]').first().click();
    await expect(page.getByRole('heading', { name: 'Payment Terms', exact: true })).toBeVisible();

    // Verify seeded presets exist
    await expect(page.getByText('Net 30', { exact: true })).toBeVisible();
    await expect(page.getByText('Due on Receipt', { exact: true })).toBeVisible();

    // Create a new custom term: Net 21
    const testTermName = `Net 21 Test ${Date.now().toString().slice(-4)}`;
    await page.locator('#termName').fill(testTermName);
    await page.locator('#daysCount').fill('21');
    await page.getByRole('button', { name: 'Add Term', exact: true }).click();

    // Verify created term appears in list
    const termRow = page.locator('div.divide-y > div').filter({ hasText: testTermName }).first();
    await expect(termRow).toBeVisible();
    await expect(termRow.getByText(/21 days from invoice date/i)).toBeVisible();

    // Edit term
    await termRow.getByRole('button', { name: 'Edit Term' }).click();
    await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
    await page.locator('#daysCount').fill('28');
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(termRow.getByText(/28 days from invoice date/i)).toBeVisible();

    // Clean up - delete term
    page.once('dialog', (dialog) => dialog.accept());
    await termRow.getByRole('button', { name: 'Delete Term' }).click();
    await expect(page.getByText(testTermName)).not.toBeVisible({ timeout: 5000 });
  });

  test('3. Units of Measure (UOM) Catalog CRUD', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.locator('a[href*="/settings/units-of-measure"]').first().click();
    await expect(page.getByRole('heading', { name: 'Units of Measure', exact: true })).toBeVisible();

    // Verify standard seeded units exist
    await expect(page.getByText('Pieces', { exact: true })).toBeVisible();
    await expect(page.getByText('Kilograms', { exact: true })).toBeVisible();

    // Add a new custom UOM
    const testCode = `ctn${Date.now().toString().slice(-4)}`;
    const testName = `Carton Container ${Date.now().toString().slice(-4)}`;
    await page.locator('#uom-code').fill(testCode);
    await page.locator('#uom-name').fill(testName);
    await page.getByRole('button', { name: 'Add Unit', exact: true }).click();

    // Verify added
    const uomRow = page.locator('tr').filter({ hasText: testCode }).first();
    await expect(uomRow).toBeVisible();
    await expect(uomRow.getByText(testName)).toBeVisible();

    // Delete custom UOM
    await uomRow.getByRole('button', { name: 'Delete unit' }).click();
    await expect(page.getByText(testCode)).not.toBeVisible({ timeout: 5000 });
  });

  test('4. Email Templates Studio with dynamic token insertion and live preview', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.locator('a[href*="/settings/email-templates"]').first().click();
    await expect(page.getByRole('heading', { name: 'Email Templates', exact: true })).toBeVisible();

    // Switch tabs
    await page.getByRole('button', { name: /Sales Quote/i }).click();
    await expect(page.getByText(/present.*estimate or quote/i)).toBeVisible();

    // Dynamic variable tokens
    await expect(page.getByRole('button', { name: '{{customer_name}}' })).toBeVisible();
    await expect(page.getByRole('button', { name: '{{document_number}}' })).toBeVisible();
    await expect(page.getByRole('button', { name: '{{total_amount}}' })).toBeVisible();

    // Insert a variable
    await page.getByRole('button', { name: '{{business_name}}' }).click();

    // Verify live preview card shows sample interpolation
    await expect(page.getByText(/Live Sample Preview/i)).toBeVisible();
    await expect(page.getByText(/Acme Industrial Supplies LLC/i)).toBeVisible();

    // Save template
    await page.getByRole('button', { name: /Save Template/i }).click();
    await expect(page.getByText(/Template saved for/i)).toBeVisible();
  });

  test('5. Guided Opening Balances Onboarding Engine', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.locator('a[href*="/settings/opening-balances"]').first().click();
    await expect(page.getByRole('heading', { name: 'Opening Balances', exact: true })).toBeVisible();

    // Verify self-balancing debit/credit summary banner
    await expect(page.getByText(/Debits:/i)).toBeVisible();
    await expect(page.getByText(/Credits:/i)).toBeVisible();

    // Verify account sections
    await expect(page.getByText(/Assets \(Bank, Cash/i)).toBeVisible();
    await expect(page.getByText(/Liabilities \(Payables/i)).toBeVisible();

    // Date picker field
    const dateInput = page.locator('#opening-date');
    await expect(dateInput).toBeVisible();
  });

  test('6. Global Financial Lock Date period closing controls', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.locator('a[href*="/settings/lock-date"]').first().click();
    await expect(page.getByRole('heading', { name: 'Financial Lock Date', exact: true })).toBeVisible();

    // Fill lock date
    const lockDateInput = page.locator('#lock-date');
    await lockDateInput.fill('2026-06-30');

    // Save Lock Date
    await page.getByRole('button', { name: 'Apply Lock Date', exact: true }).click();
    await expect(page.getByText(/Financial period closed through/i)).toBeVisible();

    // Verify active lock status badge
    await expect(page.getByText(/Locked through/i)).toBeVisible();

    // Clear lock date
    await page.getByRole('button', { name: 'Remove Lock Date', exact: true }).click();
    await expect(page.getByText(/Financial lock date cleared/i)).toBeVisible();
    await expect(page.getByText(/Open \(No Lock Date\)/i)).toBeVisible();
  });

  test('7. Chart of Accounts universal clickable balance drill-down', async ({ page }) => {
    await page.getByRole('link', { name: 'Chart of Accounts', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Chart of Accounts/i })).toBeVisible();

    // Check account balances are interactive links drilling into the General Ledger
    const balanceLinks = page.locator('tbody tr td a[href*="/reports/general-ledger?accountId="]');
    const count = await balanceLinks.count();
    expect(count).toBeGreaterThan(0);

    // Click the first balance link
    const firstLink = balanceLinks.first();
    await firstLink.click();

    // Verify navigation to General Ledger with filtered account
    await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible();
    expect(page.url()).toContain('/reports/general-ledger');
    expect(page.url()).toContain('accountId=');
  });

  test('8. Profit & Loss reports drill-down and Cash vs Accrual basis toggle', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await page.locator('a[href*="/reports/profit-loss"]').first().click();
    await expect(page.getByRole('heading', { name: 'Profit & Loss', exact: true })).toBeVisible();

    // Verify Cash vs Accrual basis select dropdown exists
    const basisSelect = page.locator('select[name="basis"]');
    await expect(basisSelect).toBeVisible();

    // Switch to Cash Basis and submit form
    await basisSelect.selectOption('cash');
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page).toHaveURL(/basis=cash/);

    // Switch back to Accrual Basis
    await basisSelect.selectOption('accrual');
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page).not.toHaveURL(/basis=cash/);

    // Verify export CSV button is present
    await expect(page.getByRole('button', { name: /Export CSV/i })).toBeVisible();
  });

  test('9. Commercial register multi-select batch operations bar', async ({ page }) => {
    await page.getByRole('link', { name: 'Sales Invoices', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sales Invoices' })).toBeVisible();

    // Look for row selection checkboxes in table
    const rowCheckboxes = page.locator('tbody input[type="checkbox"]');
    const rowCount = await rowCheckboxes.count();

    if (rowCount > 0) {
      // Select first row
      await rowCheckboxes.first().click();

      // Verify BatchActionBar floating bar appears at bottom
      const batchBar = page.getByText(/selected/i);
      await expect(batchBar).toBeVisible();
      await expect(page.getByRole('button', { name: /Export CSV/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Print/i })).toBeVisible();

      // Click "Clear" button in dock
      await page.getByRole('button', { name: /Clear/i }).click();
      await expect(page.locator('div.fixed.bottom-6')).not.toBeVisible();
    }
  });

  test('10. Sticky Action Dock on commercial forms with live running totals', async ({ page }) => {
    await page.getByRole('link', { name: 'Sales Invoices', exact: true }).click();
    await page.getByRole('link', { name: 'New Invoice' }).first().click();
    await expect(page.getByRole('heading', { name: 'New Sales Invoice' })).toBeVisible();

    // Verify Sticky Action Dock is visible
    const stickyDock = page.locator('div.sticky.bottom-0');
    await expect(stickyDock).toBeVisible();

    // Verify Status pill badge in sticky dock
    await expect(stickyDock.getByText('Draft', { exact: true })).toBeVisible();

    // Verify running totals indicator and action buttons
    await expect(stickyDock.getByText('Total:', { exact: true })).toBeVisible();
    await expect(stickyDock.getByRole('button', { name: 'Save Draft' })).toBeVisible();
    await expect(stickyDock.getByRole('button', { name: 'Post Invoice' })).toBeVisible();
  });
});
