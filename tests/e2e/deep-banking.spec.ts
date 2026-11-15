import { test, expect } from '@playwright/test';
import { selectComboboxByIndex } from './helpers/combobox';

test.describe('Deep Banking Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const demoArticle = page.locator('article').filter({ hasText: /Northstar Technical Services/i }).first();
    const businessCard = (await demoArticle.count()) > 0 ? demoArticle.locator('a').first() : page.locator('article a').first();
    await businessCard.click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can perform a full banking workflow (accounts -> transfer -> receipt -> payment)', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes timeout for this long workflow

    // Navigate to Banking
    await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();

    // 2. Perform a transfer
    await page.getByRole('link', { name: 'Transfer', exact: true }).click();
    await selectComboboxByIndex(page, page.getByLabel(/from account/i), 1);
    await selectComboboxByIndex(page, page.getByLabel(/to account/i), 2);
    await page.getByLabel(/amount/i).fill('500.00');
    await page.getByRole('button', { name: /post transfer/i }).click();
    
    await expect(page.getByText('Bank Transfer posted').first()).toBeVisible();
    await expect(page.getByText('Posted').first()).toBeVisible();

    // 3. Perform a manual receipt (Money In)
    await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
    await page.locator('table tbody tr').nth(0).getByRole('link').first().click();
    await page.getByRole('link', { name: 'New Transaction' }).first().click();
    await page.waitForTimeout(2000);
    await page.locator('select#type').selectOption({ value: 'money_in' });
    await page.locator('input#description').fill('Initial deposit');
    await page.locator('input[name="lines.0.description"]').fill('Line deposit');
    await selectComboboxByIndex(page, page.getByLabel('Line 1 counter account', { exact: true }), 1);
    await page.locator('input[name="lines.0.amount"]').fill('1000.00');
    await page.getByRole('button', { name: /post transaction/i }).click();
    
    await expect(page.getByText(/Transaction posted|POSTED/i).first()).toBeVisible({ timeout: 15000 });

    // 4. Perform a manual payment (Money Out)
    await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
    await page.locator('table tbody tr').nth(0).getByRole('link').first().click();
    await page.getByRole('link', { name: 'New Transaction' }).first().click();
    await page.waitForTimeout(2000);
    await page.locator('select#type').selectOption({ value: 'money_out' });
    await page.locator('input#description').fill('Office supplies');
    await page.locator('input[name="lines.0.description"]').fill('Line supplies');
    await selectComboboxByIndex(page, page.getByLabel('Line 1 counter account', { exact: true }), 2);
    await page.locator('input[name="lines.0.amount"]').fill('100.00');
    await page.getByRole('button', { name: /post transaction/i }).click();
    
    await expect(page.getByText(/Transaction posted|POSTED/i).first()).toBeVisible({ timeout: 15000 });
  });
});
