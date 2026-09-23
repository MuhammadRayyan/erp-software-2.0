const fs = require('fs');
const files = [
  'e2e/eval-inventory-integrity.spec.ts',
  'e2e/eval-tax-vat.spec.ts',
  'e2e/eval-ar-financial.spec.ts',
  'e2e/eval-document-lifecycle.spec.ts',
  'e2e/eval-currency.spec.ts',
  'e2e/eval-banking.spec.ts',
  'e2e/eval-precision.spec.ts'
];

for (const f of files) {
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    c = c.replace(/locator\('button\[type="submit"\]'\)\.click\(\);?/g, "locator('button[type=\"submit\"]').click(); await page.waitForTimeout(1500);");
    fs.writeFileSync(f, c);
  }
}
console.log('done');
