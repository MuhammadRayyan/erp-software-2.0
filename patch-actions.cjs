const fs = require('fs');
let c;
c = fs.readFileSync('e2e/eval-document-lifecycle.spec.ts', 'utf8');
c = c.replace(/name: 'Deliver Items'/g, "name: 'Create Delivery Note'");
fs.writeFileSync('e2e/eval-document-lifecycle.spec.ts', c);

c = fs.readFileSync('e2e/eval-ar-financial.spec.ts', 'utf8');
c = c.replace(/name: 'Record Payment'/g, "name: 'Record Receipt'");
fs.writeFileSync('e2e/eval-ar-financial.spec.ts', c);
console.log('done');
