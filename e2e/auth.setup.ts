import { test as setup, expect } from '@playwright/test';
const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await page.fill('input[name="email"]', 'admin@demo.local');
  await page.fill('input[name="password"]', 'demo12345');
  await page.click('button[type="submit"]');

  // Wait until the page receives the cookies and navigates to the business list
  await expect(page.getByRole('heading', { name: 'My Businesses' })).toBeVisible({ timeout: 10000 });

  // Click the first business
  await page.locator('article a').first().click();
  
  // Wait for the business overview to load
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // Select a business context (if prompted or needed) 
  // For now, let's assume the dashboard loads successfully for the first business.
  
  await page.context().storageState({ path: authFile });
});
