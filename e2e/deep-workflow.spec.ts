import { test, expect } from '@playwright/test';

test.describe('Deep Workflow Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can perform a full sales quote to invoice workflow', async ({ page }) => {
    test.setTimeout(60000); // 1 minute timeout for this long workflow
    const ts = Date.now();
    const customerName = `Workflow Customer ${ts}`;
    const itemName = `Workflow Item ${ts}`;

    // 1. Create a Customer
    await page.getByRole('link', { name: 'Customers', exact: true }).click();
    await page.getByRole('link', { name: 'New Customer' }).first().click();
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.getByRole('button', { name: /save customer/i }).click();
    await expect(page.getByRole('heading', { name: customerName, exact: true })).toBeVisible();

    // 2. Create an Item
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await page.getByRole('link', { name: 'New Item' }).first().click();
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.getByLabel(/sales price/i).first().fill('100.00');
    await page.getByRole('button', { name: /create item/i }).click();
    await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

    // 3. Create a Sales Quote
    await page.getByRole('link', { name: 'Sales Quotes', exact: true }).click();
    await page.getByRole('link', { name: 'New Quote' }).first().click();
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
    await page.getByLabel(/Line 1 quantity/i).fill('2');
    
    // Save as draft and then issue (or directly issue)
    await page.getByRole('button', { name: /Issue Quote/i }).click();
    
    // Sometimes there are notifications or direct navigation
    await expect(page).toHaveURL(/.*\/sales\/quotes\/.*/);
    await expect(page.getByRole('button', { name: /convert to order/i })).toBeVisible({ timeout: 15000 });

    // 4. Convert to Sales Order
    await page.getByRole('button', { name: /convert to order/i }).click();
    
    // We are now on the Sales Order view
    await expect(page).toHaveURL(/.*\/sales\/orders\/[a-zA-Z0-9-]{10,}.*/);
    await page.getByRole('link', { name: 'Edit', exact: true }).click();

    // Now on Sales Order edit form
    await expect(page.getByRole('heading', { name: /Edit Sales Order/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Issue Order/i }).click();
    
    // Back to Sales Order view
    await expect(page).toHaveURL(/.*\/sales\/orders\/[a-zA-Z0-9-]{10,}.*/);
    await expect(page.getByRole('button', { name: /convert to invoice/i })).toBeVisible({ timeout: 15000 });

    // 5. Convert to Invoice
    await page.getByRole('button', { name: /convert to invoice/i }).click();
    
    // We are now on the Sales Invoice view
    await expect(page).toHaveURL(/.*\/sales\/invoices\/[a-zA-Z0-9-]{10,}.*/);
    await page.getByRole('link', { name: 'Edit', exact: true }).click();

    // Now on Sales Invoice edit form
    await expect(page.getByRole('heading', { name: /Edit Sales Invoice/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Post Invoice/i }).click();
    
    // Back to Sales Invoice view
    await expect(page).toHaveURL(/.*\/sales\/invoices\/[a-zA-Z0-9-]{10,}.*/);
    
    // We should see a success marker (like Record Payment, or the invoice status)
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });
  });
});

