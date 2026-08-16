import { test, expect } from '@playwright/test';

test.describe('Inventory Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can view items list', async ({ page }) => {
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inventory Items' })).toBeVisible();
  });

  test('can open new item form', async ({ page }) => {
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inventory Items' })).toBeVisible();
    await page.getByRole('link', { name: /new/i }).first().click();
    await expect(page.getByRole('heading', { name: 'New Inventory Item' })).toBeVisible();
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
  });
});
