const fs = require('fs');

// --- B1 ---
let c = fs.readFileSync('e2e/eval-tax-vat.spec.ts', 'utf8');
c = c.replace(/await expect\(page\.locator\('text=Total Tax'\)\.locator\('\.\.'\)\.getByText\('5\.00'\)\)\.toBeVisible\(\);/g, 
  "await expect(page.locator('text=VAT').locator('..').getByText('5.00')).toBeVisible();");
c = c.replace(/await page\.getByLabel\(\/Line 1 tax code\/i\)\.selectOption\(\/Standard\/i\);\n/g, "");

// --- B3 ---
const b3SettingsPatch = `
    const vatCheckbox = page.getByLabel(/vat registered/i);
    const isChecked = await vatCheckbox.isChecked();
    if (!isChecked) {
      await vatCheckbox.check();
    }
    await page.getByLabel(/default supply emirate/i).selectOption({ index: 0 }); // none
    await page.locator('button', { hasText: 'Save VAT settings' }).click(); await page.waitForTimeout(1500);
`;
c = c.replace(/const vatCheckbox = page\.getByLabel\(\/vat registered\/i\);[\s\S]*?await page\.waitForTimeout\(1500\);\n    \}/, b3SettingsPatch);
c = c.replace(/await page\.getByLabel\(\/Line 1 tax code\/i\)\.selectOption\(\/Standard\/i\);\n/g, "");

fs.writeFileSync('e2e/eval-tax-vat.spec.ts', c);

// --- D2 ---
c = fs.readFileSync('e2e/eval-document-lifecycle.spec.ts', 'utf8');
c = c.replace(/await page\.getByRole\('link', \{ name: customerName \}\)\.first\(\)\.click\(\);/g, 
  "await page.getByRole('row', { name: customerName }).first().getByRole('link').first().click();");
fs.writeFileSync('e2e/eval-document-lifecycle.spec.ts', c);

// --- C1/C3 ---
c = fs.readFileSync('e2e/eval-ar-financial.spec.ts', 'utf8');
c = c.replace(/await page\.getByRole\('button', \{ name: \/void\/i \}\)\.click\(\);/g, 
  `await page.getByRole('button', { name: /more actions/i }).click();\n    await page.getByRole('menuitem', { name: /void/i }).click();`);
c = c.replace(/await page\.getByRole\('button', \{ name: \/confirm void\/i \}\)\.click\(\);/g, 
  "await page.getByRole('button', { name: 'Void', exact: true }).click();"); // From the Dialog confirm button!
fs.writeFileSync('e2e/eval-ar-financial.spec.ts', c);

console.log('done');
