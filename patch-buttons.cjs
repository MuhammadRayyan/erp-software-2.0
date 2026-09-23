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
    c = c.replace(/getByRole\('button', \{ name: \/save\/i \}\)\.click\(\)/g, 'locator(\'button[type="submit"]\').click()');
    fs.writeFileSync(f, c);
  }
}
console.log('done');
