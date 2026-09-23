const fs = require('fs');

let c = fs.readFileSync('e2e/eval-document-lifecycle.spec.ts', 'utf8');
c = c.replace(/await page\.getByRole\('button', \{ name: \/post invoice\/i \}\)\.click\(\);/g, 
  "await page.getByRole('button', { name: /update posted invoice/i }).click();");
fs.writeFileSync('e2e/eval-document-lifecycle.spec.ts', c);

console.log('done');
