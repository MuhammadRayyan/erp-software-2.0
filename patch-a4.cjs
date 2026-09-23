const fs = require('fs');

let c = fs.readFileSync('e2e/eval-inventory-integrity.spec.ts', 'utf8');
c = c.replace(/await page\.getByLabel\(\/reason\/i\)\.selectOption\(\{ label: 'Adjustment' \}\);/g, 
  "await page.getByLabel(/reason/i).selectOption({ label: 'Stock count correction' });");
fs.writeFileSync('e2e/eval-inventory-integrity.spec.ts', c);

console.log('done');
