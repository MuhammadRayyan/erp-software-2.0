import { test, expect } from '@playwright/test';

test.describe('Deep Banking Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can perform a full banking workflow (accounts -> transfer -> receipt -> payment)', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes timeout for this long workflow
    const ts = Date.now();
    const account1 = `Checking ${ts}`;
    const account2 = `Savings ${ts}`;
    const code1 = `CHK${ts.toString().slice(-4)}`;
    const code2 = `SAV${ts.toString().slice(-4)}`;

    // Navigate to Banking
    await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();

    // 2. Perform a transfer
    await page.getByRole('link', { name: 'Transfer', exact: true }).click();
    await page.getByLabel(/from account/i).selectOption({ index: 1 });
    await page.getByLabel(/to account/i).selectOption({ index: 2 });
    await page.getByLabel(/amount/i).fill('500.00');
    await page.getByRole('button', { name: /post transfer/i }).click();
    
    await expect(page.getByText('Bank Transfer posted').first()).toBeVisible();
    await expect(page.getByText('Posted').first()).toBeVisible();

    // 3. Perform a manual receipt
    await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
    await page.locator('table tbody tr').nth(0).getByRole('link').first().click();
    await page.getByRole('link', { name: 'New Transaction' }).first().click();
    await page.getByLabel(/type/i).selectOption({ label: 'Receipt' });
    await page.getByLabel(/amount/i).fill('1000.00');
    await page.getByLabel(/description/i).fill('Initial deposit');
    await page.getByLabel(/Line 1 account/i).selectOption({ index: 1 });
    await page.getByRole('button', { name: /post transaction/i }).click();
    
    await expect(page.getByText('Transaction posted')).toBeVisible();

    // 4. Perform a manual payment
    await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
    await page.locator('table tbody tr').nth(1).getByRole('link').first().click();
    await page.getByRole('link', { name: 'New Transaction' }).first().click();
    await page.getByLabel(/type/i).selectOption({ label: 'Payment' });
    await page.getByLabel(/amount/i).fill('100.00');
    await page.getByLabel(/description/i).fill('Office supplies');
    await page.getByLabel(/Line 1 account/i).selectOption({ index: 2 });
    await page.getByRole('button', { name: /post transaction/i }).click();
    
    await expect(page.getByText('Transaction posted')).toBeVisible();
  });
});
