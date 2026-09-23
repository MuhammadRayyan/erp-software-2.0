const fs = require('fs');

let c = fs.readFileSync('e2e/eval-currency.spec.ts', 'utf8');
c = c.replace(/await page\.getByLabel\(\/Line 1 unit price\/i\)\.fill\('100.00'\);\s*\/\/\s*100 USD/g, 
  "await page.waitForTimeout(1000); // Wait for form re-render after item selection");
fs.writeFileSync('e2e/eval-currency.spec.ts', c);

console.log('done');
