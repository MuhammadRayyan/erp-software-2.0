const fs = require('fs');

let c = fs.readFileSync('e2e/eval-tax-vat.spec.ts', 'utf8');
c = c.replace(/page\.getByText\(\/Choose the default supply Emirate\/i\)/, "page.getByText(/Check the VAT registration settings/i)");
fs.writeFileSync('e2e/eval-tax-vat.spec.ts', c);

console.log('done');
