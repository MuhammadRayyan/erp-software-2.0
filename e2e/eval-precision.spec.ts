import { test, expect } from '@playwright/test';

test.describe('Evaluation Suite G: Precision & Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('G2: Maximum Quantity Overflow Guard', async ({ page }) => {
    test.setTimeout(90000);
    const ts = Date.now();
    const itemName = `OverflowItem ${ts}`;
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];

    // Item
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Adjust Stock with huge quantity
    await page.goto(`/b/${businessId}/inventory/adjustments/new`);
    await page.getByLabel(/inventory item/i).selectOption({ label: itemName });
    await page.getByLabel(/quantity change/i).fill('9999999999999'); // huge
    await page.getByLabel(/reason/i).selectOption({ label: 'Opening Balance' });
    await page.getByLabel(/unit cost/i).fill('10.00');
    
    await page.getByRole('button', { name: /post adjustment/i }).click();

    // G2 Error
    await expect(page.getByText(/Quantity is too large/i).or(page.getByText(/must be a positive number with up to/i).or(page.getByText(/Quantity must be greater than zero/i).or(page.getByText(/Enter a non-zero quantity/i).or(page.getByText(/Enter a positive or negative quantity with up to 4 decimals/i)))))).toBeVisible();
  });
});
