const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000');
  await page.locator('article a').first().click();
  const businessId = (await page.url()).match(/\/b\/([^/]+)/)[1];

  // Create item
  const ts = Date.now();
  await page.goto(`http://localhost:3000/b/${businessId}/inventory/items/new`);
  await page.getByLabel(/item name/i).first().fill(`Item ${ts}`);
  await page.locator('button[type="submit"]').click(); 
  await page.waitForTimeout(1500);

  // Stock Adjustment
  await page.goto(`http://localhost:3000/b/${businessId}/inventory/adjustments/new`);
  await page.getByLabel(/inventory item/i).first().selectOption({ label: `Item ${ts}` });
  await page.getByLabel(/quantity change/i).fill('9999999999.9999');
  await page.getByRole('button', { name: /post adjustment/i }).click();

  await page.waitForTimeout(1000);
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('g2_dump.html', html);
  await browser.close();
  console.log('DOM dumped to g2_dump.html');
})();
