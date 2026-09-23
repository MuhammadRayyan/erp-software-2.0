import { test, expect } from '@playwright/test';

test.describe('Evaluation Suite D: Document Lifecycle Transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('D2: Delivery Note Locks Invoice Editing', async ({ page }) => {
    test.setTimeout(90000);
    const ts = Date.now();
    const customerName = `Cust D2 ${ts}`;
    const itemName = `Item D2 ${ts}`;
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];

    // Customer
    await page.goto(`/b/${businessId}/customers/new`);
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Item (add stock so we can deliver)
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.getByLabel(/sales price/i).first().fill('100.00');
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Add stock
    await page.goto(`/b/${businessId}/inventory/adjustments/new`);
    await page.getByLabel(/inventory item/i).selectOption({ label: itemName });
    await page.getByLabel(/quantity change/i).fill('10');
    await page.getByLabel(/reason/i).selectOption({ label: 'Opening Balance' });
    await page.getByLabel(/unit cost/i).fill('50.00');
    await page.getByRole('button', { name: /post adjustment/i }).click();
    
    // Invoice
    await page.goto(`/b/${businessId}/sales/invoices/new`);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
    await page.getByRole('button', { name: /post invoice/i }).click();
    
    // Create Delivery Note from Invoice (if button exists, else skip or create manually)
    // Actually there is a "Deliver Items" button on the invoice view
    await page.getByRole('link', { name: 'Create Delivery Note' }).click();
    await page.locator('button', { hasText: 'Post Delivery' }).click(); await page.waitForTimeout(2000);
    
    // Navigate back to Invoice
    await page.goto(`/b/${businessId}/sales/invoices`);
    await page.getByRole('row', { name: customerName }).first().getByRole('link').first().click(); // Should hit the invoice we just made

    // Try editing
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: /update posted invoice/i }).click();

    await expect(page.getByText(/A Sales Invoice cannot be edited after a Delivery Note has been created from it/i)).toBeVisible();
  });
});
