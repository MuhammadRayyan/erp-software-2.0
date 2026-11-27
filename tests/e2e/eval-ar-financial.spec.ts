import { test, expect } from '@playwright/test';
import { openDemoBusiness } from './helpers/session';
import { selectComboboxOption } from './helpers/combobox';

test.describe('Evaluation Suite C: AR/AP Financial Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoBusiness(page);
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
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: customerName })).toBeVisible({ timeout: 15000 });

    // Create Item
    await page.goto(`/b/${businessId}/inventory/items/new`);
    await page.getByLabel(/item name/i).first().fill(item);
    await page.getByLabel(/sales price/i).first().fill('500.00');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: item })).toBeVisible({ timeout: 15000 });

    // Create & Post Sales Invoice
    await page.goto(`/b/${businessId}/sales/invoices/new`);
    await page.waitForTimeout(2000);
    await selectComboboxOption(page, page.getByLabel(/customer/i).first(), customerName);
    await expect(page.getByLabel(/customer/i).first()).not.toHaveAttribute('data-value', '');
    await selectComboboxOption(page, page.getByLabel(/Line 1 inventory item/i), item);
    
    await page.getByRole('button', { name: /Create & Post|Save & Post|Post Invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });
    
    // C1: Over-payment Guard
    // "Record Receipt" opens the quick side sheet; the allocation guard lives on the full form.
    await page.getByRole('button', { name: 'Record Receipt' }).click();
    await page.getByRole('link', { name: 'Open full form' }).click();
    const allocInput = page.getByLabel(/Allocate amount for INV-/i).first();
    const fullAmount = await allocInput.inputValue();
    await page.locator('#amount').fill('600.00');
    await allocInput.fill('600.00');
    await page.getByRole('button', { name: /post receipt/i }).click();
    await expect(page.getByText(/Receipt allocation cannot exceed the invoice balance/i)).toBeVisible();
    
    // C3: Happy Path Settle
    await page.locator('#amount').fill(fullAmount);
    await allocInput.fill(fullAmount);
    await page.getByRole('button', { name: /post receipt/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible();

    // Go back to invoice to check status
    await page.goto(`/b/${businessId}/sales/invoices`);
    await page.getByRole('row', { name: customerName }).first().getByRole('link').first().click();
    await expect(page.getByText('PAID').first()).toBeVisible();

    // Settled invoice must hide Void and Record Receipt actions while receipt allocations exist
    await page.getByRole('button', { name: /more actions/i }).click();
    await expect(page.getByRole('menuitem', { name: /void/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Record Receipt' })).toHaveCount(0);
  });
});
