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

    // Select money in
    await page.getByLabel(/direction/i).selectOption({ label: 'Money In' });
    
    // Select an account like Accounts Receivable
    const selectContent = await page.locator(`select[name="lines.0.accountId"]`).innerText();
    expect(selectContent).not.toContain('Accounts Receivable');
    expect(selectContent).not.toContain('Accounts Payable');
  });
});
