const fs = require('fs');
let c = fs.readFileSync('e2e/eval-inventory-integrity.spec.ts', 'utf8');
c = c.replace(/await page\.getByRole\('button', \{ name: \/post delivery note\/i \}\)\.click\(\);/g, "await page.locator('button', { hasText: 'Post Delivery Note' }).click();");
fs.writeFileSync('e2e/eval-inventory-integrity.spec.ts', c);
console.log('done');
