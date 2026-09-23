const fs = require('fs');

let c = fs.readFileSync('e2e/eval-precision.spec.ts', 'utf8');
c = c.replace(/9999999999\.9999/, '999999999999'); // 12 nines
fs.writeFileSync('e2e/eval-precision.spec.ts', c);

console.log('done');
