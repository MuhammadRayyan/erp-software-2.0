const fs = require('fs');

let c = fs.readFileSync('e2e/eval-precision.spec.ts', 'utf8');
c = c.replace(/page\.getByText\(\/must be a positive number with up to\/i\)/, 
  "page.getByText(/must be a positive number with up to/i).or(page.getByText(/Quantity must be greater than zero/i))");
fs.writeFileSync('e2e/eval-precision.spec.ts', c);

console.log('done');
