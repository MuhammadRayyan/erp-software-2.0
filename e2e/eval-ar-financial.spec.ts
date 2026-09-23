import { test, expect } from '@playwright/test';

test.describe('Evaluation Suite C: AR/AP Financial Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('C1 & C3: Settle-then-Void Lifecycle and Over-payment Guard', async ({ page }) => {
    test.setTimeout(120000);
    const ts = Date.now();
    const customerName = `Cust C1 ${ts}`;
    const item = `Item C1 ${ts}`;
    const businessId = page.url().match(/\/b\/([^/]+)/)?.[1];

    // Create Customer
    await page.goto(`/b/${businessId}/customers/new`);
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Create Item
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(item);
    await page.getByLabel(/sales price/i).first().fill('500.00');
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Create & Post Sales Invoice
    await page.goto(`/b/${businessId}/sales/invoices/new`);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: item });
    
    await page.getByRole('button', { name: /post invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible();
    
    // C1: Over-payment Guard
    await page.getByRole('link', { name: 'Record Receipt' }).click();
    await page.getByLabel(/amount/i).fill('600.00');
    await page.getByRole('button', { name: /post receipt/i }).click();
    await expect(page.getByText(/Receipt amount cannot exceed the invoice balance/i)).toBeVisible();
    
    // C3: Happy Path Settle
    await page.getByLabel(/amount/i).fill('500.00');
    await page.getByRole('button', { name: /post receipt/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible();

    // Go back to invoice to check status
    await page.goto(`/b/${businessId}/sales/invoices`);
    await page.getByRole('row', { name: customerName }).first().getByRole('link').first().click();
    await expect(page.getByText('PAID').first()).toBeVisible();

    // Attempt to void the invoice
    await page.getByRole('button', { name: /more actions/i }).click();
    await page.getByRole('menuitem', { name: /void/i }).click();
    await page.getByRole('button', { name: 'Void', exact: true }).click();
    await expect(page.getByText(/Cannot void an invoice that has receipt allocations/i)).toBeVisible();
  });
});
