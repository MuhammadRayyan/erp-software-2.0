import { test, expect } from '@playwright/test';

test.describe('Evaluation Suite E: Currency & Multi-Currency', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

    test('E3: Currency Mismatch in Receipt', async ({ page }) => {
    test.setTimeout(90000);
    const ts = Date.now();
    const customerName = `USD Cust ${ts}`;
    const itemName = `Item ${ts}`;
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1] || "demo";

    // Create USD Customer
    await page.goto(`/b/${businessId}/customers/new`);
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.getByLabel(/currency/i).selectOption({ value: 'USD' });
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Create Item
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Create Sales Invoice in USD
    await page.goto(`/b/${businessId}/sales/invoices/new`);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
    await page.waitForTimeout(1000); // Wait for form re-render after item selection
    
    // Automatically should have USD and exchange rate
    await page.getByRole('button', { name: /post invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible();

    // Try to record an AED receipt against it
    await page.goto(`/b/${businessId}/sales/receipts/new`);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    
    // Ensure currency dropdown is locked to USD
    await expect(page.getByLabel(/currency/i).first()).toBeDisabled();
    await expect(page.getByLabel(/currency/i).first()).toHaveValue('USD');
  });
});
