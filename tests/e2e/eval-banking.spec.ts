import { test, expect } from '@playwright/test';

test.describe('Evaluation Suite F: Banking & Reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('F1: Bank Transaction — AR/AP Counter Account Rejected', async ({ page }) => {
    test.setTimeout(90000);
    
    // Go to Bank Transactions
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];
    await page.goto(`/b/${businessId}/banking/transactions/new`);
    await page.waitForTimeout(2000);

    // Select money in
    await page.getByLabel(/direction/i).selectOption({ label: 'Money In' });
    
    // Open counter-account combobox and verify AR/AP control accounts are excluded
    const accountTrigger = page.getByLabel('Line 1 counter account', { exact: true });
    await expect(accountTrigger).toBeVisible();
    await accountTrigger.click();
    const popover = page.locator('[cmdk-root]:visible').last();
    await expect(popover).toBeVisible();
    await expect(popover.locator('[cmdk-item]').first()).toBeVisible();
    const optionTexts = await popover.locator('[cmdk-item]').allInnerTexts();
    expect(optionTexts.join('\n')).not.toContain('Accounts Receivable');
    expect(optionTexts.join('\n')).not.toContain('Accounts Payable');
  });
});
