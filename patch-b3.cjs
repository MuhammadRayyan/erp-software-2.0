const fs = require('fs');

let c = fs.readFileSync('e2e/eval-tax-vat.spec.ts', 'utf8');
const patchB3 = `
    // Attempt to clear default supply emirate while VAT is registered
    await page.getByLabel(/default supply emirate/i).selectOption({ index: 0 }); // none
    await page.locator('button', { hasText: 'Save VAT settings' }).click();

    // Assert that the settings page itself prevents this
    await expect(page.getByText(/Choose the default supply Emirate/i)).toBeVisible();
  });
`;

c = c.replace(/await page\.getByLabel\(\/default supply emirate\/i\)\.selectOption\(\{ index: 0 \}\);[\s\S]*?\}\);/m, patchB3);
fs.writeFileSync('e2e/eval-tax-vat.spec.ts', c);

console.log('done');
