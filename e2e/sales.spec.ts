import { test, expect } from '@playwright/test';

test.describe('Sales Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can view customer list and search', async ({ page }) => {
    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
    
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('Demo Customer');
    }
  });

  test('can view sales invoices list', async ({ page }) => {
    await page.getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sales Invoices' })).toBeVisible();
  });

  test('can open a new sales invoice form', async ({ page }) => {
    await page.getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sales Invoices' })).toBeVisible();
    await page.getByRole('link', { name: /new/i }).first().click();
    await expect(page.getByRole('heading', { name: 'New Sales Invoice' })).toBeVisible();
    
    // Verify essential form fields exist
    await expect(page.getByLabel(/customer/i)).toBeVisible();
    await expect(page.getByLabel(/invoice date/i)).toBeVisible();
  });

  test('can open a new customer form', async ({ page }) => {
    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
    await page.getByRole('link', { name: /new/i }).first().click();
    await expect(page.getByRole('heading', { name: 'New Customer' })).toBeVisible();
    
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /save customer/i })).toBeVisible();
  });
});
