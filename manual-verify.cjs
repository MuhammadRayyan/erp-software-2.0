const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const ts = Date.now();
  
  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[name="email"]', 'admin@demo.local');
  await page.fill('input[name="password"]', 'demo12345');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/businesses');
  
  // Get business ID
  await page.locator('a[href^="/b/"]').first().click();
  await page.waitForTimeout(2000);
  
  const url = page.url();
  const match = url.match(/\/b\/([^/]+)/);
  if (!match) throw new Error("Could not find business ID");
  const businessId = match[1];

  // --- MANUAL VERIFICATION 1: G2 Stock Adjustment Overflow ---
  console.log("Verifying G2...");
  await page.goto(`http://localhost:3000/b/${businessId}/inventory/adjustments/new`);
  await page.getByLabel(/quantity change/i).fill('999999999999');
  await page.getByRole('button', { name: /post adjustment/i }).click();
  await page.waitForTimeout(1000); // Wait for Zod error to render
  await page.screenshot({ path: 'g2-verification.png' });

  // --- MANUAL VERIFICATION 2: B3 Tax Settings Error Masking ---
  console.log("Verifying B3...");
  await page.goto(`http://localhost:3000/b/${businessId}/settings/tax`);
  // First ensure VAT is registered
  const vatCheckbox = page.getByLabel(/vat registered/i);
  if (!(await vatCheckbox.isChecked())) {
    await vatCheckbox.check();
  }
  // Remove emirate
  await page.getByLabel(/default supply emirate/i).selectOption({ index: 0 }); // Choose Emirate
  await page.locator('button', { hasText: 'Save VAT settings' }).click();
  await page.waitForTimeout(1000); // Wait for React Hook Form render
  await page.screenshot({ path: 'b3-verification.png' });

  // --- MANUAL VERIFICATION 3: D2 Delivery Note Locks Invoice ---
  console.log("Verifying D2...");

  // Create Invoice
  await page.goto(`http://localhost:3000/b/${businessId}/sales/invoices/new`);
  await page.getByLabel(/customer/i).first().selectOption({ index: 1 });
  await page.getByLabel(/Line 1 inventory item/i).selectOption({ index: 1 });
  await page.waitForTimeout(1000); // Wait for unit price autofill
  await page.getByRole('button', { name: /post invoice/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'd2-invoice-posted.png' });
  
  // Create Delivery Note from it
  await page.getByRole('link', { name: 'Create Delivery Note' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'd2-delivery-note-form.png' });
  await page.locator('button', { hasText: 'Post Delivery' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'd2-delivery-note-posted.png' });

  // Go back to invoice and try to edit
  await page.goto(`http://localhost:3000/b/${businessId}/sales/invoices`);
  // Just click the first invoice link in the table (which is the newest)
  await page.locator('table tbody tr').first().getByRole('link').first().click();
  await page.waitForTimeout(1000);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'd2-invoice-edit-attempt.png' });
  await page.getByRole('button', { name: /update posted invoice/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'd2-invoice-locked-error.png' });

  await browser.close();
  console.log("Done.");
})();
