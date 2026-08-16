import { test, expect } from '@playwright/test';

test.describe('Settings Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can view settings index', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('can view document templates settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: /templates/i }).first().click();
    await expect(page.getByRole('heading', { name: /Invoice Template/i })).toBeVisible();
  });
  
  test('can view tax codes settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: /tax codes/i }).first().click();
    await expect(page.getByRole('heading', { name: /Tax Codes/i })).toBeVisible();
  });
});
