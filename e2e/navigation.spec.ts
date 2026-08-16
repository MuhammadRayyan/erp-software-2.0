import { test, expect } from '@playwright/test';

test.describe('Navigation & Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('Overview page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('Sales Customers page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  });

  test('Sales Invoices page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sales Invoices' })).toBeVisible();
  });

  test('Purchases Suppliers page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Suppliers' }).click();
    await expect(page.getByRole('heading', { name: 'Suppliers' })).toBeVisible();
  });

  test('Purchase Orders page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Purchase Orders' }).click();
    await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible();
  });

  test('Inventory Items page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inventory Items' })).toBeVisible();
  });

  test('Banking Accounts page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Bank Accounts' }).click();
    await expect(page.getByRole('heading', { name: 'Bank Accounts' })).toBeVisible();
  });

  test('Accounting Journal Entries page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Journal', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  });

  test('Reports page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  });

  test('Settings page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
});
