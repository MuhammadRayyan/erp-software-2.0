import { test, expect } from '@playwright/test';

test.describe('Deep Inventory Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can perform inventory workflows (goods receipt -> stock adjustment -> delivery note)', async ({ page }) => {
    test.setTimeout(120000);
    const ts = Date.now();
    const customer = `Cust ${ts}`;
    const supplier = `Supp ${ts}`;
    const item = `Item ${ts}`;

    // 1. Create a supplier and customer
    await page.getByRole('link', { name: 'Suppliers', exact: true }).click();
    await page.getByRole('link', { name: 'New Supplier' }).first().click();
    await page.getByLabel(/supplier name/i).first().fill(supplier);
    await page.getByRole('button', { name: /create supplier/i }).click();
    await expect(page.getByRole('heading', { name: supplier })).toBeVisible();

    await page.getByRole('link', { name: 'Customers', exact: true }).click();
    await page.getByRole('link', { name: 'New Customer' }).first().click();
    await page.getByLabel(/customer name/i).first().fill(customer);
    await page.getByRole('button', { name: /save customer/i }).click();
    await expect(page.getByRole('heading', { name: customer })).toBeVisible();

    // 2. Create an Item
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await page.getByRole('link', { name: 'New Item' }).first().click();
    await page.getByLabel(/item name/i).first().fill(item);
    await page.getByLabel(/sales price/i).first().fill('100.00');
    await page.getByLabel(/purchase price/i).first().fill('50.00');
    await page.getByRole('button', { name: /create item/i }).click();
    await expect(page.getByRole('heading', { name: item })).toBeVisible();

    // 3. Goods Receipt (without PO/Invoice)
    await page.getByRole('link', { name: 'Goods Receipts', exact: true }).click();
    await page.getByRole('link', { name: 'New Goods Receipt' }).first().click();
    await page.getByLabel(/supplier/i).first().selectOption({ label: supplier });
    await page.getByLabel(/Line 1 item/i).selectOption({ label: item });
    await page.getByLabel(/Line 1 quantity/i).fill('10');
    await page.getByRole('button', { name: /post receipt/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible();

    // 4. Stock Adjustment
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await page.getByRole('link', { name: 'Adjust Stock' }).first().click();
    await page.getByLabel(/item/i).selectOption({ label: item });
    await page.getByLabel(/quantity change/i).fill('-2');
    await page.getByLabel(/reason/i).selectOption({ label: 'Damaged' });
    await page.getByRole('button', { name: /post adjustment/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible();

    // 5. Delivery Note
    await page.getByRole('link', { name: 'Delivery Notes', exact: true }).click();
    await page.getByRole('link', { name: 'New Delivery Note' }).first().click();
    await page.getByLabel(/customer/i).first().selectOption({ label: customer });
    await page.getByLabel(/Line 1 item/i).selectOption({ label: item });
    await page.getByLabel(/Line 1 quantity/i).fill('5');
    await page.getByRole('button', { name: /post delivery note/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible();
  });
});
