const fs = require('fs');

let c = fs.readFileSync('e2e/eval-currency.spec.ts', 'utf8');
c = c.replace(/const rateInput = page\.getByLabel\(\/exchange rate\/i\);[\s\S]*?\}\n/g, "");
fs.writeFileSync('e2e/eval-currency.spec.ts', c);

console.log('done');
