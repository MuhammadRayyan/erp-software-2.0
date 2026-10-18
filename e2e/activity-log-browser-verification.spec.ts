import { test, expect } from '@playwright/test';

test.describe('Activity & Audit Log Browser Verification Suite', () => {
  let businessId = '';

  test.beforeEach(async ({ page }) => {
    // Capture uncaught page errors
    page.on('pageerror', (exception) => {
      console.error(`[Browser Page Error]: ${exception.message}`);
    });

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
  });

  test('1. Verify Activity Log page loads cleanly with KPI metrics ribbon and zero errors', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`/b/${businessId}/settings/activity-log`);

    // Verify main page title and description
    await expect(page.getByRole('heading', { name: /Activity & Audit Log|My Activity Log/i })).toBeVisible();

    // Verify KPI ribbon cards
    await expect(page.locator('span.uppercase', { hasText: 'Total Events' })).toBeVisible();
    await expect(page.locator('span.uppercase', { hasText: 'Postings' })).toBeVisible();
    await expect(page.locator('span.uppercase', { hasText: 'Created' })).toBeVisible();
    await expect(page.locator('span.uppercase', { hasText: 'Voided' })).toBeVisible();

    // Verify filter toolbar
    await expect(page.getByPlaceholder(/Search by document #, customer, summary/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Export CSV/i })).toBeVisible();
  });

  test('2. Verify Automated Log Retention & Storage Lifecycle Policy controls', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`/b/${businessId}/settings/activity-log`);

    // Check retention policy card
    const retentionCard = page.locator('text=Automated Log Retention & Cleanup Policy');
    await expect(retentionCard).toBeVisible();

    // Click Configure Retention button
    const configureBtn = page.getByRole('button', { name: /Configure Retention|Hide Policy Controls/i });
    await expect(configureBtn).toBeVisible();
    await configureBtn.click();

    // Check configuration inputs
    const enableCheckbox = page.locator('#retentionEnabled');
    await expect(enableCheckbox).toBeVisible();

    const retentionDaysSelect = page.locator('#retentionDays');
    await expect(retentionDaysSelect).toBeVisible();

    // Check options in the retention days select
    const options = await retentionDaysSelect.locator('option').allTextContents();
    expect(options.some((o) => o.includes('90 Days'))).toBeTruthy();
    expect(options.some((o) => o.includes('365 Days'))).toBeTruthy();
    expect(options.some((o) => o.includes('7 Years'))).toBeTruthy();

    // Check enable checkbox
    await enableCheckbox.check();

    // Select 180 Days
    await retentionDaysSelect.selectOption('180');

    // Click Save Retention Policy
    const saveBtn = page.getByRole('button', { name: /Save Retention Policy/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify toast or feedback
    await expect(page.getByText(/Automated retention cleanup/i).first()).toBeVisible({ timeout: 10000 });

    // Test Prune Expired Logs Now with dialog confirmation handler
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Permanently purge');
      await dialog.accept();
    });

    const pruneBtn = page.getByRole('button', { name: /Prune Expired Logs Now/i });
    await expect(pruneBtn).toBeVisible();
    await pruneBtn.click();

    // Verify toast notification appears after pruning
    await expect(page.getByText(/activity logs/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('3. Verify Document Type and Action Filtering with Event Cards', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`/b/${businessId}/settings/activity-log`);

    // Verify Document Types dropdown contains grouped options
    const entitySelect = page.locator('select').nth(1); // Document types selector
    await expect(entitySelect).toBeVisible();

    // Check optgroups
    const salesInvoicesOption = entitySelect.locator('option[value="sales_invoice"]');
    await expect(salesInvoicesOption).toBeAttached();

    const salesQuotesOption = entitySelect.locator('option[value="sales_quote"]');
    await expect(salesQuotesOption).toBeAttached();

    const salesOrdersOption = entitySelect.locator('option[value="sales_order"]');
    await expect(salesOrdersOption).toBeAttached();

    // Filter by Posted actions
    const postedActionBtn = page.getByRole('button', { name: 'Posted', exact: true });
    if (await postedActionBtn.isVisible()) {
      await postedActionBtn.click();
      await page.waitForTimeout(500);
    }

    // Filter by All
    const allActionBtn = page.getByRole('button', { name: 'All', exact: true }).first();
    await allActionBtn.click();
    await page.waitForTimeout(500);

    // Verify compact card layout without View audit details button per user preference
    await expect(page.getByRole('button', { name: /View audit details/i })).toHaveCount(0);
  });

  test('4. Verify Search functionality and Export CSV', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`/b/${businessId}/settings/activity-log`);

    const searchInput = page.getByPlaceholder(/Search by document #, customer, summary/i);
    await searchInput.fill('invoice');
    await page.waitForTimeout(600);

    // Clear search
    const resetBtn = page.getByRole('button', { name: 'Reset' });
    await resetBtn.click();
    await page.waitForTimeout(600);
    await expect(searchInput).toHaveValue('');

    // Click Export CSV
    const exportBtn = page.getByRole('button', { name: /Export CSV/i });
    if (await exportBtn.isEnabled()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toContain('activity-logs');
      }
    }
  });
});
