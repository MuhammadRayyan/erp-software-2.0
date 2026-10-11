import { test, expect } from '@playwright/test';

test.describe('Settings Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can view settings index and filter by keyword', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // Verify category headings
    await expect(page.getByText('Organization & Profile')).toBeVisible();
    await expect(page.getByText('Commercial & Documents')).toBeVisible();
    await expect(page.getByText('Accounting & Tax')).toBeVisible();
    await expect(page.getByText('Workspace & Access')).toBeVisible();

    // Test search filtering
    const searchInput = page.getByPlaceholder(/Filter settings by keyword/i);
    await searchInput.fill('numbering');
    await expect(page.getByRole('link', { name: /Document Numbering/i })).toBeVisible();
    await expect(page.getByText('Organization & Profile')).not.toBeVisible();

    // Clear search
    await page.locator('button:has(svg.lucide-x)').click();
    await expect(page.getByText('Organization & Profile')).toBeVisible();
  });

  test('can update business profile and branding', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: /Business Profile & Branding/i }).click();
    await expect(page.getByRole('heading', { name: 'Business Profile & Branding' })).toBeVisible();

    // Fill profile fields
    const testTradingName = `Acme Gulf ${Date.now().toString().slice(-4)}`;
    await page.locator('#tradingName').fill(testTradingName);
    await page.locator('#legalName').fill(`${testTradingName} FZ-LLC`);
    await page.locator('#city').fill('Dubai');
    await page.locator('#addressLine1').fill('Office 802, Business Bay Tower');

    // Submit
    await page.getByRole('button', { name: /Save Business Profile/i }).click();
    await expect(page.getByText(/Business profile and organization branding updated/i)).toBeVisible();

    // Refresh and verify persistence
    await page.reload();
    await expect(page.locator('#tradingName')).toHaveValue(testTradingName);
    await expect(page.locator('#city')).toHaveValue('Dubai');
  });

  test('can update regional and localization settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: /Regional & Localization/i }).click();
    await expect(page.getByRole('heading', { name: 'Regional & Localization' })).toBeVisible();

    // Select ISO date format and 24-hour time
    await page.locator('input[value="YYYY-MM-DD"]').check();
    await page.locator('input[value="24h"]').check();

    // Save
    await page.getByRole('button', { name: /Save Localization Settings/i }).click();
    await expect(page.getByText(/Regional and localization settings updated/i)).toBeVisible();

    // Refresh and check persisted values
    await page.reload();
    await expect(page.locator('input[value="YYYY-MM-DD"]')).toBeChecked();
    await expect(page.locator('input[value="24h"]')).toBeChecked();
  });

  test('can view and update document numbering sequences', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: /Document Numbering/i }).click();
    await expect(page.getByRole('heading', { name: 'Numbering' })).toBeVisible();

    // Verify categorized groups
    await expect(page.getByText('Sales & Customers')).toBeVisible();
    await expect(page.getByText('Purchases & Suppliers')).toBeVisible();
    await expect(page.getByText('Inventory & Projects')).toBeVisible();
    await expect(page.getByText('Banking & Financial Entries')).toBeVisible();

    // Verify debit note and sales quote inputs exist
    await expect(page.locator('#salesQuotePrefix')).toBeVisible();
    await expect(page.locator('#debitNotePrefix')).toBeVisible();

    // Update quote prefix
    await page.locator('#salesQuotePrefix').fill('QUO-');
    await page.getByRole('button', { name: /Save all numbering sequences/i }).click();
    await expect(page.getByText(/Document numbering updated/i)).toBeVisible();
  });

  test('can configure form defaults with line toggles', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: /Form Defaults/i }).click();
    await expect(page.getByRole('heading', { name: 'Form Defaults' })).toBeVisible();

    // Verify sections
    await expect(page.getByText('Sales Documents')).toBeVisible();
    await expect(page.getByText('Purchase Documents')).toBeVisible();
    await expect(page.getByText('Inventory & Stock')).toBeVisible();

    // Click on Sales Invoice form default
    await page.locator('main a[href*="form-defaults/sales-invoice"]').click();
    await expect(page.getByRole('heading', { name: /Sales Invoice defaults/i })).toBeVisible();

    // Check payment terms input and toggle
    await page.locator('#defaultPaymentTermsDays').fill('45');
    await page.locator('#defaultNotes').fill('Thank you for choosing us.');
    await page.getByRole('button', { name: /Save defaults/i }).click();
    await expect(page.getByText(/Form defaults saved/i)).toBeVisible();
  });

  test('can view appearance settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.locator('main').getByRole('link', { name: /Appearance & Theme/i }).click();
    await expect(page.getByRole('heading', { name: 'Appearance Settings' })).toBeVisible();

    // Check live preview card and theme controls
    await expect(page.getByText(/Live Interface Preview/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Light\b/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Dark\b/i })).toBeVisible();
  });

  test('can view tax codes settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.locator('main').getByRole('link', { name: /Tax Codes/i }).first().click();
    await expect(page.getByRole('heading', { name: /Tax Codes/i })).toBeVisible();
  });

  test('can view document templates settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.locator('main').getByRole('link', { name: /Document Templates/i }).first().click();
    await expect(page.getByRole('heading', { name: /Document Templates/i })).toBeVisible();
  });
});
