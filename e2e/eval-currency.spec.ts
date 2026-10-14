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
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: customerName, exact: true })).toBeVisible({ timeout: 15000 });

    // Create Item
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.getByLabel(/sales price/i).first().fill('100.00');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: itemName, exact: true })).toBeVisible({ timeout: 15000 });

    // Create Sales Invoice in USD
    await page.goto(`/b/${businessId}/sales/invoices/new`);
    await page.waitForTimeout(2000);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await expect(page.getByLabel(/customer/i).first()).not.toHaveValue('');
    await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
    await page.waitForTimeout(1000); // Wait for form re-render after item selection
    
    // Set invoice date and tax date to match stored rate date (2026-08-27)
    await page.getByLabel(/invoice date/i).fill('2026-08-27');
    await page.getByLabel(/vat tax date/i).fill('2026-08-27');
    // Select stored CBUAE exchange rate matching 2026-08-27
    await page.locator('#storedExchangeRate').selectOption({ label: '2026-08-27 · 1 USD = 3.672500 AED · CBUAE' });
    
    // Automatically should have USD and exchange rate
    await page.getByRole('button', { name: /post invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });

    // Try to record a receipt against it
    await page.goto(`/b/${businessId}/sales/receipts/new`);
    await page.waitForTimeout(2000);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.waitForTimeout(1000);
    await page.getByLabel(/invoice/i).selectOption({ index: 1 });
    
    // Ensure currency dropdown is locked to USD
    await expect(page.getByLabel(/currency/i).first()).toBeDisabled();
    await expect(page.getByLabel(/currency/i).first()).toHaveValue('USD');
  });
});
