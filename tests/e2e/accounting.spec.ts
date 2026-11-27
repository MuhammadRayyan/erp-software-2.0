import { test, expect } from '@playwright/test';
import { openDemoBusiness } from './helpers/session';

test.describe('Accounting & Reports Module', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoBusiness(page);
  });

  test('can view journal entries', async ({ page }) => {
    await page.getByRole('link', { name: 'Journal', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  });

  test('can view reports list', async ({ page }) => {
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  });
});
