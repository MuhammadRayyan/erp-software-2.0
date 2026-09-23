const fs = require('fs');

let c = fs.readFileSync('e2e/eval-document-lifecycle.spec.ts', 'utf8');
c = c.replace(/await page\.locator\('button', \{ hasText: 'Post Delivery' \}\)\.click\(\);/, 
  "await page.locator('button', { hasText: 'Post Delivery' }).click(); await page.waitForTimeout(2000);");
fs.writeFileSync('e2e/eval-document-lifecycle.spec.ts', c);

console.log('done');
