import { test, expect } from '@playwright/test';

test.describe('Purchases Deep Workflow Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can perform a full purchase quote to payment workflow omitting optional fields', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes timeout for this long workflow
    const ts = Date.now();
    const supplierName = `Workflow Supplier ${ts}`;
    const itemName = `Purchase Item ${ts}`;

    // 1. Create a Supplier
    await page.getByRole('link', { name: 'Suppliers', exact: true }).click();
    await page.getByRole('link', { name: 'New Supplier' }).first().click();
    await page.getByLabel(/supplier name/i).first().fill(supplierName);
    await page.getByRole('button', { name: /create supplier/i }).click();
    await expect(page.getByRole('heading', { name: supplierName, exact: true })).toBeVisible();

    // 2. Create an Item
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await page.getByRole('link', { name: 'New Item' }).first().click();
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.getByLabel(/purchase price/i).first().fill('50.00');
    await page.getByRole('button', { name: /create item/i }).click();
    await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

    // 3. Create a Purchase Quote (omitting Expiry Date)
    await page.getByRole('link', { name: 'Purchase Quotes', exact: true }).click();
    await page.getByRole('link', { name: 'New Purchase Quote' }).first().click();
    await page.getByLabel(/supplier/i).first().selectOption({ label: supplierName });
    await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
    await page.getByLabel(/Line 1 quantity/i).fill('5');
    
    // Save as draft and then issue (or directly issue)
    await page.getByRole('button', { name: /Issue Quote/i }).click();
    
    // Wait for the quote view to render with the convert button
    await expect(page.getByRole('button', { name: /convert to order/i })).toBeVisible();

    // 4. Convert to Purchase Order
    await page.getByRole('button', { name: /convert to order/i }).click();
    await expect(page).toHaveURL(/.*\/orders\/.*/);
    
    // We are now on the Purchase Order view, but it's a Draft. We need to edit to issue it.
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    
    await expect(page.getByRole('button', { name: /Issue Order/i })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: /Issue Order/i }).click();
    
    await expect(page.getByRole('button', { name: /Create Invoice/i })).toBeVisible({ timeout: 30000 });

    // 5. Convert to Purchase Invoice
    await page.getByRole('button', { name: /Create Invoice/i }).click();
    await expect(page).toHaveURL(/.*\/purchases\/invoices\/[a-zA-Z0-9-]{10,}.*/);
    
    // Click Edit to open the invoice form
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page).toHaveURL(/.*\/purchases\/invoices\/[a-zA-Z0-9-]{10,}\/edit/);
    
    // On the Purchase Invoice form
    await expect(page.getByRole('button', { name: /Post Invoice/i })).toBeVisible({ timeout: 30000 });
    // Intentionally omit Due Date
    await page.getByRole('button', { name: /Post Invoice/i }).click();
    
    // We should see a success marker (like POSTED status)
    await expect(page.getByText('POSTED').first()).toBeVisible();

    // 6. Record Payment
    await page.getByRole('link', { name: /Record Payment/i }).click();
    await expect(page.getByRole('heading', { name: /Record Supplier Payment|New Supplier Payment/i })).toBeVisible();
    await page.getByRole('button', { name: /Post Payment/i }).click();

    // Expect to be back on the payment view
    await expect(page.getByText('POSTED').first()).toBeVisible();
  });
});
