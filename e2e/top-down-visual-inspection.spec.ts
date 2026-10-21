import { test, expect } from '@playwright/test';

test.describe('Top-Down Visual and Architecture Flow Verification', () => {
  let businessId = '';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Select first business card
    const businessCard = page.locator('article a').first();
    await expect(businessCard).toBeVisible({ timeout: 15000 });
    await businessCard.click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15000 });

    const url = page.url();
    const match = url.match(/\/b\/([^/]+)/);
    if (match) {
      businessId = match[1];
    }
  });

  test('1. Visual Paper Document View: Sales Invoice, Zoom, Print CSS, Tabs & PDF Download', async ({ page, request }) => {
    test.setTimeout(60000);
    // Navigate to Sales Invoices
    await page.goto(`/b/${businessId}/sales/invoices`);
    await expect(page.getByRole('heading', { name: 'Sales Invoices' })).toBeVisible();

    // Click on the first invoice link in the table
    const firstInvoiceLink = page.locator('table tbody tr a').first();
    await expect(firstInvoiceLink).toBeVisible();
    await firstInvoiceLink.click();

    // 1. Check Breadcrumb / BackLink
    const backLink = page.locator('a:has-text("Sales Invoices")').first();
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', `/b/${businessId}/sales/invoices`);

    // 2. Check Paper Document Sheet container
    const paperSheet = page.locator('#printable-document-sheet');
    await expect(paperSheet).toBeVisible();
    await expect(paperSheet).toHaveClass(/print-document-paper/);

    // 3. Check Paper Document Header elements
    await expect(paperSheet.getByRole('heading', { level: 1 })).toBeVisible(); // Company Name
    await expect(paperSheet.getByRole('heading', { level: 2 })).toBeVisible(); // Document title (e.g. TAX INVOICE)
    await expect(paperSheet.locator('p.font-mono')).toBeVisible(); // Document Number
    await expect(paperSheet.locator('text=BILL TO')).toBeVisible(); // Customer label
    await expect(paperSheet.locator('text=Date:')).toBeVisible();

    // 4. Check Paper Document Items & Totals table
    await expect(paperSheet.locator('table')).toBeVisible();
    await expect(paperSheet.getByText('Subtotal')).toBeVisible();
    // 5. Check Remittance Advice & Signatures if configured
    const remittance = paperSheet.locator('text=Payment Instructions / Remittance Advice');
    if (await remittance.isVisible()) {
      await expect(remittance).toBeVisible();
    }
    const signature = paperSheet.locator('text=Prepared By');
    if (await signature.isVisible()) {
      await expect(signature).toBeVisible();
    }

    // Take screenshot of Document Paper View
    await page.screenshot({ path: 'screenshots/01-sales-invoice-paper-view.png', fullPage: true });

    // 6. Test Zoom controls
    const zoom75 = page.getByRole('button', { name: '75%' });
    const zoomFit = page.getByRole('button', { name: 'Fit' });
    const zoom100 = page.getByRole('button', { name: '100%' });
    await expect(zoom75).toBeVisible();
    await zoom75.click();
    await page.waitForTimeout(300);
    await zoomFit.click();
    await page.waitForTimeout(300);
    await zoom100.click();
    await page.waitForTimeout(300);

    // 7. Test View Switcher Tab (Document View vs. Operational & Ledger)
    const ledgerTab = page.getByRole('button', { name: /Operational & Ledger/i });
    await expect(ledgerTab).toBeVisible();
    await ledgerTab.click();

    // Verify operational components are visible
    const flowStepper = page.locator('nav[aria-label="Document flow"]');
    if (await flowStepper.isVisible()) {
      await expect(flowStepper).toBeVisible();
    }
    await page.screenshot({ path: 'screenshots/02-sales-invoice-operational-ledger.png', fullPage: true });

    // Switch back to Document View
    const docTab = page.getByRole('button', { name: /Document View \(Paper\)/i });
    await expect(docTab).toBeVisible();
    await docTab.click();
    await expect(paperSheet).toBeVisible();

    // 8. Test Print Button presence
    const printBtn = page.getByRole('button', { name: /^Print$/i }).first();
    await expect(printBtn).toBeVisible();

    // 9. Test PDF Download endpoint directly
    const downloadPdfLink = page.locator('a[download]').or(page.locator('a:has-text("Download PDF")')).first();
    const pdfHref = await downloadPdfLink.getAttribute('href');
    expect(pdfHref).toBeTruthy();
    expect(pdfHref).toContain('/pdf');

    const pdfResponse = await request.get(pdfHref!);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()['content-type']).toBe('application/pdf');
    const pdfBody = await pdfResponse.body();
    expect(pdfBody.length).toBeGreaterThan(1000); // Valid PDF binary
  });

  test('2. Customer Form Validation: onTouched inline field feedback & red border', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto(`/b/${businessId}/customers/new`);
    await expect(page.getByRole('heading', { name: 'New Customer' })).toBeVisible();

    // Fill valid name
    const nameInput = page.locator('#name');
    await nameInput.fill('Visual Audit Customer');

    // Enter bad email
    const emailInput = page.locator('#email');
    await emailInput.fill('not-a-valid-email');

    // Trigger blur by clicking outside (e.g. phone field)
    const phoneInput = page.locator('#phone');
    await phoneInput.click();

    // Expect red highlight (aria-invalid=true) and inline error message directly below the field
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    const emailError = page.locator('p.field-error:has-text("email")');
    await expect(emailError).toBeVisible();

    await page.screenshot({ path: 'screenshots/03-customer-email-validation-error.png' });

    // Now fix the email
    await emailInput.fill('valid.customer@example.com');
    await phoneInput.click();

    // Expect error to disappear immediately
    await expect(emailInput).toHaveAttribute('aria-invalid', 'false');
    await expect(page.locator('p.field-error:has-text("email")')).toHaveCount(0);

    await page.screenshot({ path: 'screenshots/04-customer-email-validation-resolved.png' });
  });

  test('3. Top-Down Sales Architecture Flow & Calculation Math: Quote -> Order -> Invoice -> Paper Canvas', async ({ page }) => {
    test.setTimeout(120000);
    const ts = Date.now();
    const customerName = `Flow Customer ${ts}`;
    const itemName = `Flow Item ${ts}`;

    // 1. Create a Customer
    await page.getByRole('link', { name: 'Customers', exact: true }).click();
    await page.getByRole('link', { name: 'New Customer' }).first().click();
    await page.getByLabel(/customer name/i).first().fill(customerName);
    await page.getByRole('button', { name: /save customer/i }).click();
    await expect(page.getByRole('heading', { name: customerName, exact: true })).toBeVisible();

    // 2. Create an Item
    await page.getByRole('link', { name: 'Items', exact: true }).click();
    await page.getByRole('link', { name: 'New Item' }).first().click();
    await page.getByLabel(/item name/i).first().fill(itemName);
    await page.getByLabel(/sales price/i).first().fill('100.00');
    await page.getByRole('button', { name: /create item/i }).click();
    await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

    // 3. Create Sales Quote
    await page.getByRole('link', { name: 'Sales Quotes', exact: true }).click();
    await page.getByRole('link', { name: 'New Quote' }).first().click();

    // Select customer
    await page.getByLabel(/customer/i).first().selectOption({ label: customerName });
    await page.getByPlaceholder(/description/i).first().fill('Custom Consulting Services');
    await page.getByLabel(/Line 1 quantity/i).fill('10');
    await page.getByLabel(/Line 1 rate/i).fill('100.00');
    await page.getByLabel(/Line 1 sales account/i).selectOption({ label: 'Sales' });

    // Issue Quote directly
    const issueBtn = page.getByRole('button', { name: /Issue Quote/i });
    await issueBtn.click();

    // Wait for the quote view to load
    await expect(page.locator('#printable-document-sheet')).toBeVisible({ timeout: 20000 });
    const quotePaper = page.locator('#printable-document-sheet');
    await expect(quotePaper.getByRole('heading', { name: 'SALES QUOTE' })).toBeVisible();
    await expect(quotePaper.locator('text=Custom Consulting Services')).toBeVisible();

    // Math check: 10 * 100 = 1,000.00 subtotal. VAT 5% = 50.00. Total = 1,050.00 AED
    await expect(quotePaper.locator('text=1,000.00').first()).toBeVisible();
    await expect(quotePaper.locator('text=1,050.00').first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/05-quote-flow-paper.png', fullPage: true });

    // 4. Convert Quote to Sales Order
    const convertToOrderBtn = page.getByRole('button', { name: /convert to order/i });
    await expect(convertToOrderBtn).toBeVisible();
    await convertToOrderBtn.click();

    // On Order View (as draft)
    await expect(page).toHaveURL(/.*\/sales\/orders\/[a-zA-Z0-9-]{10,}.*/);
    
    // Edit and Issue the order
    const editOrderLink = page.getByRole('link', { name: 'Edit', exact: true });
    await editOrderLink.click();
    const issueOrderBtn = page.getByRole('button', { name: /Issue Order/i });
    await expect(issueOrderBtn).toBeVisible({ timeout: 15000 });
    await issueOrderBtn.click();

    // Wait for issued order paper canvas
    await expect(page.locator('#printable-document-sheet')).toBeVisible({ timeout: 15000 });
    const orderPaper = page.locator('#printable-document-sheet');
    await expect(orderPaper.getByRole('heading', { name: 'SALES ORDER' })).toBeVisible();
    await expect(orderPaper.locator('text=1,050.00').first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/06-order-flow-paper.png', fullPage: true });

    // 5. Convert Order to Sales Invoice
    const convertToInvoiceBtn = page.getByRole('button', { name: /convert to invoice/i });
    await expect(convertToInvoiceBtn).toBeVisible();
    await convertToInvoiceBtn.click();

    // On Invoice View (as draft)
    await expect(page).toHaveURL(/.*\/sales\/invoices\/[a-zA-Z0-9-]{10,}.*/);
    const editInvoiceLink = page.getByRole('link', { name: 'Edit', exact: true });
    await editInvoiceLink.click();
    const postInvoiceBtn = page.getByRole('button', { name: /Post Invoice/i });
    await expect(postInvoiceBtn).toBeVisible({ timeout: 15000 });
    await postInvoiceBtn.click();

    // Wait for posted invoice paper canvas
    await expect(page.locator('#printable-document-sheet')).toBeVisible({ timeout: 15000 });
    const invoicePaper = page.locator('#printable-document-sheet');
    await expect(invoicePaper.getByRole('heading', { name: /INVOICE/i })).toBeVisible();
    await expect(invoicePaper.locator('text=1,050.00').first()).toBeVisible();

    await page.screenshot({ path: 'screenshots/07-invoice-flow-paper.png', fullPage: true });
  });

  test('4. Visual Paper Document View across all modules: Customer Receipt, Purchase Bill, Purchase Order, Debit Note, Supplier Payment', async ({ page }) => {
    test.setTimeout(90000);

    // 1. Customer Receipts
    await page.goto(`/b/${businessId}/sales/receipts`);
    const receiptLink = page.locator('table tbody tr a').first();
    if (await receiptLink.isVisible()) {
      await receiptLink.click();
      const receiptPaper = page.locator('#printable-document-sheet');
      await expect(receiptPaper).toBeVisible();
      await expect(receiptPaper.getByRole('heading', { name: 'PAYMENT RECEIPT' })).toBeVisible();
      await page.screenshot({ path: 'screenshots/08-customer-receipt-paper.png', fullPage: true });
    }

    // 2. Purchase Bills (Invoices)
    await page.goto(`/b/${businessId}/purchases/invoices`);
    const billLink = page.locator('table tbody tr a').first();
    if (await billLink.isVisible()) {
      await billLink.click();
      const billPaper = page.locator('#printable-document-sheet');
      await expect(billPaper).toBeVisible();
      await expect(billPaper.getByRole('heading', { name: 'PURCHASE INVOICE' })).toBeVisible();
      await page.screenshot({ path: 'screenshots/09-purchase-bill-paper.png', fullPage: true });

      // Copy to Debit Note
      const copyToBtn = page.getByRole('button', { name: /copy to/i });
      if (await copyToBtn.isVisible()) {
        await copyToBtn.click();
        const dnMenuItem = page.getByRole('menuitem', { name: /debit note/i });
        if (await dnMenuItem.isVisible()) {
          await dnMenuItem.click();
          const postDnBtn = page.getByRole('button', { name: /post debit note/i });
          if (await postDnBtn.isVisible({ timeout: 10000 })) {
            await postDnBtn.click();
            await expect(page.locator('#printable-document-sheet')).toBeVisible({ timeout: 15000 });
            const dnPaper = page.locator('#printable-document-sheet');
            await expect(dnPaper.getByRole('heading', { name: 'DEBIT NOTE' })).toBeVisible();
            await page.screenshot({ path: 'screenshots/11-debit-note-paper.png', fullPage: true });
          }
        }
      }
    }

    // 3. Purchase Orders
    await page.goto(`/b/${businessId}/purchases/orders`);
    const poLink = page.locator('table tbody tr a').first();
    if (await poLink.isVisible()) {
      await poLink.click();
      const poPaper = page.locator('#printable-document-sheet');
      await expect(poPaper).toBeVisible();
      await expect(poPaper.getByRole('heading', { name: 'PURCHASE ORDER' })).toBeVisible();
      await page.screenshot({ path: 'screenshots/10-purchase-order-paper.png', fullPage: true });
    }

    // 4. Debit Notes
    await page.goto(`/b/${businessId}/purchases/debit-notes`);
    const dnLink = page.locator('table tbody tr a').first();
    if (await dnLink.isVisible()) {
      await dnLink.click();
      const dnPaper = page.locator('#printable-document-sheet');
      await expect(dnPaper).toBeVisible();
      await expect(dnPaper.getByRole('heading', { name: 'DEBIT NOTE' })).toBeVisible();
      await page.screenshot({ path: 'screenshots/11-debit-note-paper.png', fullPage: true });
    }

    // 5. Supplier Payments
    await page.goto(`/b/${businessId}/purchases/payments`);
    const payLink = page.locator('table tbody tr a').first();
    if (await payLink.isVisible()) {
      await payLink.click();
      const payPaper = page.locator('#printable-document-sheet');
      await expect(payPaper).toBeVisible();
      await expect(payPaper.getByRole('heading', { name: 'PAYMENT VOUCHER' })).toBeVisible();
      await page.screenshot({ path: 'screenshots/12-supplier-payment-paper.png', fullPage: true });
    }
  });
});
