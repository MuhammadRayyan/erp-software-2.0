import { test, expect } from '@playwright/test';
import { openDemoBusiness } from './helpers/session';

test.describe('Banking Module', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoBusiness(page);
  });

  test('can view bank accounts list', async ({ page }) => {
    await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bank Accounts', exact: true })).toBeVisible();
  });

  test('can open new bank account form', async ({ page }) => {
    await page.getByRole('link', { name: 'Bank Accounts', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bank Accounts', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'New Bank Account' }).first().click();
    await expect(page.getByRole('heading', { name: 'New Bank Account' })).toBeVisible();
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
  });
});
