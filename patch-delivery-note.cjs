const fs = require('fs');

// A1
let c = fs.readFileSync('e2e/eval-inventory-integrity.spec.ts', 'utf8');
c = c.replace(/await page\.locator\('button', \{ hasText: 'Post Delivery Note' \}\)\.click\(\);/g, "await page.locator('button', { hasText: 'Post Delivery' }).click();");
fs.writeFileSync('e2e/eval-inventory-integrity.spec.ts', c);

// D2
c = fs.readFileSync('e2e/eval-document-lifecycle.spec.ts', 'utf8');
c = c.replace(/await page\.getByRole\('button', \{ name: \/post delivery note\/i \}\)\.click\(\);/g, "await page.locator('button', { hasText: 'Post Delivery' }).click();");
fs.writeFileSync('e2e/eval-document-lifecycle.spec.ts', c);

console.log('done');
