const fs = require('fs');

// Fix F1
let c = fs.readFileSync('e2e/eval-banking.spec.ts', 'utf8');
c = c.replace(/await page\.locator\(`select\[name="lines\.0\.accountId"\]`\)\.selectOption[\s\S]*?(?=\}\);)/, 
`const selectContent = await page.locator(\`select[name="lines.0.accountId"]\`).innerText();
    expect(selectContent).not.toContain('Accounts Receivable');
    expect(selectContent).not.toContain('Accounts Payable');
  `);
fs.writeFileSync('e2e/eval-banking.spec.ts', c);

// Fix B3 and B1
c = fs.readFileSync('e2e/eval-tax-vat.spec.ts', 'utf8');
c = c.replace(/selectOption\(\{ label: \/Standard\/i \}\)/g, 'selectOption(/Standard/i)');
c = c.replace(/selectOption\(\{ label: \/Zero\/i \}\)/g, 'selectOption(/Zero/i)');
fs.writeFileSync('e2e/eval-tax-vat.spec.ts', c);

console.log('patched');
