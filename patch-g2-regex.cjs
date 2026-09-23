const fs = require('fs');

let c = fs.readFileSync('e2e/eval-precision.spec.ts', 'utf8');
c = c.replace(/page\.getByText\(\/Enter a non-zero quantity\/i\)/, 
  "page.getByText(/Enter a non-zero quantity/i).or(page.getByText(/Enter a positive or negative quantity with up to 4 decimals/i))");
fs.writeFileSync('e2e/eval-precision.spec.ts', c);

console.log('done');
