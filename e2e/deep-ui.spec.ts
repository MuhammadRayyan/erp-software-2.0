import { test, expect } from '@playwright/test';

test.describe('Deep UI Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can fill out and save a new customer', async ({ page }) => {
    await page.getByRole('link', { name: 'Customers', exact: true }).click();
    await page.getByRole('link', { name: 'New Customer' }).first().click();
    
    await expect(page.getByRole('heading', { name: 'New Customer' })).toBeVisible();
    
    // Use timestamp-unique values to avoid collisions with previous test runs
    const ts = Date.now();
    const customerName = `Deep Test Customer ${ts}`;
    const email = `deep.${ts}@test.com`;

    // Fill form
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.getByLabel(/email/i).first().fill(email);
    await page.getByLabel(/TRN \/ reference/i).first().fill('TAX-12345');
    
    // Click Save
    await page.getByRole('button', { name: /save customer/i }).click();
    
    // Should navigate to customer detail page
    await expect(page.getByRole('heading', { name: customerName, exact: true })).toBeVisible();
    
    // Verify a detail exists
    await expect(page.getByText('TAX-12345')).toBeVisible();
  });

  test('can fill out and save a new item', async ({ page }) => {
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await page.getByRole('link', { name: 'New Item' }).first().click();
    
    // Use timestamp-unique values to avoid collisions with previous test runs
    const ts = Date.now();
    const itemName = `Deep Test Item ${ts}`;
    const sku = `DIT-${ts}`;

    // Fill form
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.getByLabel(/sku/i).first().fill(sku);
    await page.getByLabel(/sales price/i).first().fill('150.00');
    
    // Account dropdowns are pre-populated by the server with defaults — no action needed.
    
    // Click Save
    await page.getByRole('button', { name: /create item/i }).click();
    
    // Should navigate to item detail page
    await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
    await expect(page.getByText(sku)).toBeVisible();
  });
});
