import { test, expect } from '@playwright/test';

test('G2 standalone', async ({ page }) => {
  await page.goto('http://localhost:3000/b/demo/inventory/adjustments/new');
  await page.getByLabel(/quantity change/i).fill('999999999999');
  await page.getByRole('button', { name: /post adjustment/i }).click();
  await page.waitForTimeout(2000);
  console.log(await page.content());
});
