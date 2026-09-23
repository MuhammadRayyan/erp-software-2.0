const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Login first
  await page.goto('http://localhost:3000/login');
  await page.getByLabel('Email address').fill('admin@erp.local');
  await page.getByLabel('Password').fill('password');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/b/demo/dashboard');

  await page.goto('http://localhost:3000/b/demo/inventory/adjustments/new');
  await page.getByLabel(/quantity change/i).fill('999999999999');
  await page.getByRole('button', { name: /post adjustment/i }).click();
  await page.waitForTimeout(2000);
  
  const content = await page.content();
  require('fs').writeFileSync('g2_content.html', content);
  
  await browser.close();
})();
