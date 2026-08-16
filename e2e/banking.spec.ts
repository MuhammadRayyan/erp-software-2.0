import { test, expect } from '@playwright/test';

test.describe('Banking Module', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('article a').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('can view bank accounts list', async ({ page }) => {
    await page.getByRole('link', { name: 'Bank Accounts' }).click();
    await expect(page.getByRole('heading', { name: 'Bank Accounts' })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('can open new bank account form', async ({ page }) => {
    await page.getByRole('link', { name: 'Bank Accounts' }).click();
    await expect(page.getByRole('heading', { name: 'Bank Accounts' })).toBeVisible();
    await page.getByRole('link', { name: /new/i }).first().click();
    await expect(page.getByRole('heading', { name: 'New Bank Account' })).toBeVisible();
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
  });
});
