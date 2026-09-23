const fs = require('fs');

let c = fs.readFileSync('e2e/eval-tax-vat.spec.ts', 'utf8');

const b3Test = `  test('B3: Standard-Rated Sale Missing Emirate', async ({ page }) => {
    test.setTimeout(90000);
    const businessId = page.url().match(/\\/b\\/([^/]+)/)?.[1] || "demo";

    // Ensure VAT is registered in settings
    await page.goto(\`/b/\${businessId}/settings/tax\`);
    
    const vatCheckbox = page.getByLabel(/vat registered/i);
    const isChecked = await vatCheckbox.isChecked();
    if (!isChecked) {
      await vatCheckbox.check();
    }
    
    // Attempt to clear default supply emirate while VAT is registered
    await page.getByLabel(/default supply emirate/i).selectOption({ index: 0 }); // none
    await page.locator('button', { hasText: 'Save VAT settings' }).click();

    // Assert that the settings page itself prevents this
    await expect(page.getByText(/Choose the default supply Emirate/i)).toBeVisible();
  });
});`;

// Remove everything from "test('B3: Standard-Rated Sale Missing Emirate'" to the end of the file
c = c.replace(/test\('B3: Standard-Rated Sale Missing Emirate'[\s\S]*$/, b3Test + "\n");
fs.writeFileSync('e2e/eval-tax-vat.spec.ts', c);

console.log('done');
