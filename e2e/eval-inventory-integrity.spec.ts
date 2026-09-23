import { test, expect } from '@playwright/test';

test.describe('Evaluation Suite A: Inventory Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('A1: Negative Stock Guard', async ({ page }) => {
    test.setTimeout(90000);
    const ts = Date.now();
    const itemName = `NegStockItem ${ts}`;
    const customerName = `NegStockCust ${ts}`;
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];

    // 1. Create a new item (0 stock)
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.getByLabel(/sales price/i).first().fill('100.00');
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
    await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

    // 2. Create customer
    await page.goto(`/b/${businessId}/customers/new`);
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
    await expect(page.getByRole('heading', { name: customerName })).toBeVisible();

    // 3. Attempt to post Delivery Note for 5 units
    await page.goto(`/b/${businessId}/sales/delivery-notes/new`);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.getByLabel(/Line 1 item/i).selectOption({ label: itemName });
    await page.getByLabel(/Line 1 quantity/i).fill('5');
    await page.locator('button', { hasText: 'Post Delivery' }).click();

    // 4. Assert error message is visible
    await expect(page.getByText(/Only 0/i).or(page.getByText(/available/i))).toBeVisible();
  });

  test('A4: Opening Balance + Zero-Value Adjustment Guard', async ({ page }) => {
    const ts = Date.now();
    const itemName = `ZeroValItem ${ts}`;
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];

    // 1. Create a new item (0 stock)
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
    await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

    // 2. Attempt positive Stock Adjustment (Reason: Adjustment)
    await page.goto(`/b/${businessId}/inventory/adjustments/new`);
    await page.getByLabel(/inventory item/i).selectOption({ label: itemName });
    await page.getByLabel(/quantity change/i).fill('10');
    await page.getByLabel(/reason/i).selectOption({ label: 'Stock count correction' }); // Not Opening Balance
    await page.getByRole('button', { name: /post adjustment/i }).click();

    // 3. Assert error
    await expect(page.getByText(/Use Opening Balance with a unit cost when no valued stock exists/i)).toBeVisible();
  });
});
