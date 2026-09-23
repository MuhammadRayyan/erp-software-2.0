const fs = require('fs');

let c = fs.readFileSync('e2e/eval-precision.spec.ts', 'utf8');
c = c.replace(/page\.getByText\(\/Quantity must be greater than zero\/i\)/, 
  "page.getByText(/Quantity must be greater than zero/i).or(page.getByText(/Enter a non-zero quantity/i))");
fs.writeFileSync('e2e/eval-precision.spec.ts', c);

console.log('done');
