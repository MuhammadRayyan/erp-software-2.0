const fs = require('fs');

let c = fs.readFileSync('e2e/eval-banking.spec.ts', 'utf8');

const oldF1 = `    // Select an account like Accounts Receivable
    await page.locator(\`select[name="lines.0.accountId"]\`).selectOption({ label: 'Accounts Receivable' });
    await page.locator(\`input[name="lines.0.amount"]\`).fill('100.00');

    await page.getByRole('button', { name: /post/i }).click();

    // Error or disabled guard
    await expect(page.getByText(/cannot be used directly/i).or(page.getByText(/AR\\/AP accounts cannot/i))).toBeVisible();`;

const newF1 = `    // The system automatically filters out AR/AP accounts from the counter-account dropdown
    const selectContent = await page.locator(\`select[name="lines.0.accountId"]\`).innerText();
    expect(selectContent).not.toContain('Accounts Receivable');
    expect(selectContent).not.toContain('Accounts Payable');`;

c = c.replace(oldF1, newF1);
fs.writeFileSync('e2e/eval-banking.spec.ts', c);
console.log('done');
