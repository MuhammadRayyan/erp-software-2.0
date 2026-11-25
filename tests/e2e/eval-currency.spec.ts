import { test, expect } from '@playwright/test';
import { selectComboboxOption } from './helpers/combobox';

test.describe('Evaluation Suite E: Currency & Multi-Currency', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const demoArticle = page.locator('article').filter({ hasText: /Northstar Technical Services/i }).first();
    const businessCard = (await demoArticle.count()) > 0 ? demoArticle.locator('a').first() : page.locator('article a').first();
    await businessCard.click();
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
    await selectComboboxOption(page, page.getByLabel(/customer/i).first(), customerName);
    await expect(page.getByLabel(/customer/i).first()).not.toHaveAttribute('data-value', '');
    await selectComboboxOption(page, page.getByLabel(/Line 1 inventory item/i), itemName);
    await page.waitForTimeout(1000); // Wait for form re-render after item selection
    
    // Keep invoice date and tax date aligned with today's seeded CBUAE USD FX rate (resolved automatically by backend)
    const todayDate = await page.getByLabel(/invoice date/i).inputValue();
    await page.getByLabel(/vat tax date/i).fill(todayDate);
    await expect(page.locator('#storedExchangeRate')).toHaveCount(0);
    
    // Automatically should have USD and exchange rate
    await page.getByRole('button', { name: /Create & Post|Save & Post|Post Invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });

    // Try to record a receipt against it
    await page.goto(`/b/${businessId}/sales/receipts/new`);
    await page.waitForTimeout(2000);
    await selectComboboxOption(page, page.getByLabel(/customer/i).first(), customerName);
    await expect(page.locator('#currencyCode')).toHaveAttribute('data-value', 'USD');
  });
});
