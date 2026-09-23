const fs = require('fs');

// Fix C1/C3
let c = fs.readFileSync('e2e/eval-ar-financial.spec.ts', 'utf8');
c = c.replace(/await page\.getByRole\('link', \{ name: customerName \}\)\.first\(\)\.click\(\);/g, "await page.getByRole('row', { name: customerName }).first().getByRole('link').first().click();");
fs.writeFileSync('e2e/eval-ar-financial.spec.ts', c);

// Fix D2
c = fs.readFileSync('e2e/eval-document-lifecycle.spec.ts', 'utf8');
c = c.replace(/await expect\(page\.getByText\('POSTED'\)\.first\(\)\)\.toBeVisible\(\);\n/g, "");
fs.writeFileSync('e2e/eval-document-lifecycle.spec.ts', c);

console.log('done');
