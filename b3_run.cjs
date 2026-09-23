const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('http://localhost:3000/login');
  await page.getByLabel('Email address').fill('admin@erp.local');
  await page.getByLabel('Password').fill('password');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/b/demo/dashboard');

  await page.goto('http://localhost:3000/b/demo/settings/tax');
  await page.getByLabel(/default supply emirate/i).selectOption({ index: 0 });
  await page.locator('button', { hasText: 'Save VAT settings' }).click();
  
  await page.waitForTimeout(2000);
  const content = await page.content();
  fs.writeFileSync('b3_content.html', content);
  
  await browser.close();
})();
