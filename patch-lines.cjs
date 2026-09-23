const fs = require('fs');
let c;

// Fix A1 & A4 in eval-inventory-integrity.spec.ts
c = fs.readFileSync('e2e/eval-inventory-integrity.spec.ts', 'utf8');
c = c.replace(/Line 1 inventory item/g, 'Line 1 item');
fs.writeFileSync('e2e/eval-inventory-integrity.spec.ts', c);

// Fix F1 in eval-banking.spec.ts
c = fs.readFileSync('e2e/eval-banking.spec.ts', 'utf8');
c = c.replace(/await page\.getByLabel\(\/Line 1 account\/i\)\.selectOption/g, 'await page.locator(`select[name="lines.0.accountId"]`).selectOption');
c = c.replace(/await page\.getByLabel\(\/Line 1 amount\/i\)\.fill/g, 'await page.locator(`input[name="lines.0.amount"]`).fill');
fs.writeFileSync('e2e/eval-banking.spec.ts', c);

// Fix B1 & B3 in eval-tax-vat.spec.ts
c = fs.readFileSync('e2e/eval-tax-vat.spec.ts', 'utf8');
c = c.replace(/label: 'Standard Rate \(5%\)'/g, 'label: /Standard/i');
c = c.replace(/label: 'Zero Rate \(0%\)'/g, 'label: /Zero/i');
fs.writeFileSync('e2e/eval-tax-vat.spec.ts', c);

console.log('patched');
