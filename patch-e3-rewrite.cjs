const fs = require('fs');

let c = fs.readFileSync('e2e/eval-currency.spec.ts', 'utf8');

const e3Test = `  test('E3: Currency Mismatch in Receipt', async ({ page }) => {
    test.setTimeout(90000);
    const ts = Date.now();
    const customerName = \`USD Cust \${ts}\`;
    const itemName = \`Item \${ts}\`;
    const businessId = page.url().match(/\\/b\\/([^/]+)/)?.[1] || "demo";

    // Create USD Customer
    await page.goto(\`/b/\${businessId}/customers/new\`);
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.getByLabel(/currency/i).selectOption({ value: 'USD' });
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Create Item
    await page.goto(\`/b/\${businessId}/inventory/items/new\`);
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1500);

    // Create Sales Invoice in USD
    await page.goto(\`/b/\${businessId}/sales/invoices/new\`);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.getByLabel(/Line 1 inventory item/i).selectOption({ label: itemName });
    await page.getByLabel(/Line 1 unit price/i).fill('100.00'); // 100 USD
    
    // Automatically should have USD and exchange rate
    await page.getByRole('button', { name: /post invoice/i }).click();
    await expect(page.getByText('POSTED').first()).toBeVisible();

    // Try to record an AED receipt against it
    await page.goto(\`/b/\${businessId}/sales/receipts/new\`);
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    
    // Ensure currency dropdown is locked to USD
    await expect(page.getByLabel(/currency/i).first()).toBeDisabled();
    await expect(page.getByLabel(/currency/i).first()).toHaveValue('USD');
  });
});`;

c = c.replace(/test\('E3: Currency Mismatch in Receipt'[\s\S]*$/, e3Test + "\n");
fs.writeFileSync('e2e/eval-currency.spec.ts', c);

console.log('done');
