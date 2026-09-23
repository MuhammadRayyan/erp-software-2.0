const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000');
  await page.locator('article a').first().click();
  const businessId = (await page.url()).match(/\/b\/([^/]+)/)[1];

  const ts = Date.now();
  const customerName = `NoEmirateCust ${ts}`;
  const item1 = `Item ${ts}`;

  // Ensure VAT is registered in settings
  await page.goto(`http://localhost:3000/b/${businessId}/settings/tax`);
  const vatCheckbox = page.getByLabel(/vat registered/i);
  if (!(await vatCheckbox.isChecked())) await vatCheckbox.check();
  await page.getByLabel(/default supply emirate/i).selectOption({ index: 0 }); // none
  await page.locator('button', { hasText: 'Save VAT settings' }).click(); 
  await page.waitForTimeout(1500);

  // Create customer and item
  await page.goto(`http://localhost:3000/b/${businessId}/customers/new`);
  await page.getByLabel(/customer name/i).first().fill(customerName);
  await page.locator('button[type="submit"]').click(); 
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:3000/b/${businessId}/inventory/items/new`);
  await page.getByLabel(/item name/i).first().fill(item1);
  await page.locator('button[type="submit"]').click(); 
  await page.waitForTimeout(1500);

  // Create invoice
  await page.goto(`http://localhost:3000/b/${businessId}/sales/invoices/new`);
  await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
  await page.getByLabel(/supply emirate/i).selectOption({ index: 0 }); // none
  await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: item1 });
  await page.getByRole('button', { name: /post invoice/i }).click();

  await page.waitForTimeout(1000);
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('b3_dump.html', html);
  await browser.close();
  console.log('DOM dumped to b3_dump.html');
})();
