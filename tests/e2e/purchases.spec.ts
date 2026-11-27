import { test, expect } from '@playwright/test';
import { openDemoBusiness } from './helpers/session';

test.describe('Purchases Module', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoBusiness(page);
  });

  test('can view supplier list', async ({ page }) => {
    await page.getByRole('link', { name: 'Suppliers', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible();
  });

  test('can view purchase invoices list', async ({ page }) => {
    await page.getByRole('link', { name: 'Purchase Invoices', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Purchase Invoices', exact: true })).toBeVisible();
  });

  test('can open a new purchase invoice form', async ({ page }) => {
    await page.getByRole('link', { name: 'Purchase Invoices', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Purchase Invoices', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'New Purchase Invoice' }).first().click();
    await expect(page.getByRole('heading', { name: 'New Purchase Invoice' })).toBeVisible();
    
    // Verify essential form fields exist
    await expect(page.locator('#supplierId')).toBeVisible();
    await expect(page.getByLabel(/invoice date/i)).toBeVisible();
  });

  test('can open a new purchase order form', async ({ page }) => {
    await page.getByRole('link', { name: 'Purchase Orders', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Purchase Orders', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'New Purchase Order' }).first().click();
    await expect(page.getByRole('heading', { name: 'New Purchase Order' })).toBeVisible();
    
    await expect(page.getByLabel(/supplier/i)).toBeVisible();
  });
});
