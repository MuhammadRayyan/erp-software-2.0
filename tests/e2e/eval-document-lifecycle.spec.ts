import { test, expect } from '@playwright/test';
import { selectComboboxOption } from './helpers/combobox';

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
    await page.waitForTimeout(2000);
    await selectComboboxOption(page, page.getByLabel(/inventory item/i), itemName);
    await page.getByLabel(/quantity change/i).fill('10');
    await page.getByLabel(/reason/i).selectOption({ label: 'Opening Balance' });
    await page.getByLabel(/unit cost/i).fill('50.00');
    await page.getByRole('button', { name: /post adjustment/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });
    
    // Invoice
    await page.goto(`/b/${businessId}/sales/invoices/new`);
    await page.waitForTimeout(2000);
    await selectComboboxOption(page, page.getByLabel(/customer/i).first(), customerName);
    await expect(page.getByLabel(/customer/i).first()).not.toHaveAttribute('data-value', '');
    await selectComboboxOption(page, page.getByLabel(/Line 1 inventory item/i), itemName);
    await page.getByRole('button', { name: /Create & Post|Save & Post|Post Invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });
    
    // Create Delivery Note from Invoice
    await page.getByRole('link', { name: 'Create Delivery Note' }).click();
    await expect(page.getByRole('heading', { name: /New Delivery Note/i })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /Post Delivery/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });
    
    // Navigate back to Invoice
    await page.goto(`/b/${businessId}/sales/invoices`);
    await page.getByRole('row', { name: customerName }).first().getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: /INV-/i })).toBeVisible({ timeout: 15000 });

    // Edit action is hidden and direct /edit navigation is locked once a Delivery Note exists
    const invoicePath = new URL(page.url()).pathname;
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await page.goto(`${invoicePath}/edit`);
    await expect(page.getByRole('heading', { name: /Locked invoice/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/A Sales Invoice cannot be edited after a Delivery Note has been created from it/i)).toBeVisible({ timeout: 15000 });
  });
});
