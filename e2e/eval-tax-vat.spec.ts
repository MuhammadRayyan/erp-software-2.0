import { test, expect } from '@playwright/test';

test.describe('Evaluation Suite B: Tax & VAT Calculations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('B1: UAE VAT Arithmetic (5% Standard + Zero Rated)', async ({ page }) => {
    test.setTimeout(90000);
    const ts = Date.now();
    const customerName = `VatCust ${ts}`;
    const item1 = `Item Standard ${ts}`;
    const item2 = `Item Zero ${ts}`;
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];

    // Create customer
    await page.goto(`/b/${businessId}/customers/new`);
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Create Items
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(item1);
    await page.getByLabel(/sales price/i).first().fill('100.00');
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);
    
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(item2);
    await page.getByLabel(/sales price/i).first().fill('50.00');
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Create Invoice
    await page.goto(`/b/${businessId}/sales/invoices/new`);
    
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.getByLabel(/supply emirate/i).selectOption({ label: 'Dubai' });

    // Line 1: Standard
    await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: item1 });
        
    // Add line 2: Zero
    await page.getByRole('button', { name: /add line/i }).click();
    await page.getByLabel(/Line 2 inventory item/i).selectOption({ label: item2 });
    await page.getByLabel(/Line 2 quantity/i).fill('2'); // 50 * 2 = 100
    // @ts-ignore
    await page.getByLabel(/Line 2 tax code/i).selectOption(/Zero/i);

    // Assert UI totals
    await expect(page.locator('text=Subtotal').locator('..').getByText('200.00')).toBeVisible();
    await expect(page.locator('text=VAT').locator('..').getByText('5.00')).toBeVisible();
    await expect(page.locator('text=Total').locator('..').getByText('205.00').first()).toBeVisible();
  });

    test('B3: Standard-Rated Sale Missing Emirate', async ({ page }) => {
    test.setTimeout(90000);
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1] || "demo";

    // Ensure VAT is registered in settings
    await page.goto(`/b/${businessId}/settings/tax`);
    
    const vatCheckbox = page.getByLabel(/vat registered/i);
    const isChecked = await vatCheckbox.isChecked();
    if (!isChecked) {
      await vatCheckbox.check();
    }
    
    // Attempt to clear default supply emirate while VAT is registered
    await page.getByLabel(/default supply emirate/i).selectOption({ index: 0 }); // none
    await page.locator('button', { hasText: 'Save VAT settings' }).click();

    // Assert that the settings page itself prevents this
    await expect(page.getByText(/Check the VAT registration settings/i)).toBeVisible();
  });
});
