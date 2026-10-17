import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-pdf-custom-")),
  BETTER_AUTH_SECRET: "pdf-customization-secret-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { createInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { renderDocumentPdf } = await import("../src/modules/document-templates/template-registry");
const { saveTemplateSettings, getTemplateSettings } = await import("../src/modules/document-templates/template-service");
const { generateDocumentPdf } = await import("../src/modules/document-templates/pdf-service");

test("PDF Customization & Letterhead Studio Suite", async (t) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const standardVat = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'standard' LIMIT 1").get() as { id: string };

  const customerId = createCustomer(businessId, userId, {
    name: "Emirates Corporate Holdings PJSC",
    email: "finance@emiratescorp.example",
    defaultCurrencyCode: "AED",
  });

  const invoiceId = createInvoice(
    businessId,
    userId,
    {
      customerId,
      invoiceDate: "2026-10-18",
      dueDate: "2026-11-17",
      currencyCode: "AED",
      lines: [
        {
          description: "Enterprise Architecture Consulting",
          quantity: "20",
          unitPrice: "450",
          salesAccountId: incomeAccount.id,
          taxCodeId: standardVat.id,
        },
      ],
    },
    "post",
  );

  await t.test("1. Pre-printed Letterhead Mode with Top & Bottom Margin Offsets", async () => {
    // Configure template settings for Pre-printed Stationery
    saveTemplateSettings(businessId, userId, "sales-invoice", {
      templateType: "modern",
      letterheadMode: "preprinted",
      hideDigitalHeader: true,
      hideDigitalFooter: true,
      marginTop: 125, // 125pt (~44mm offset for pre-printed letterhead)
      marginBottom: 85,
      marginLeft: 40,
      marginRight: 40,
      customDocumentTitle: "COMMERCIAL TAX INVOICE",
      customPartyLabel: "BILL TO CLIENT",
      customDescriptionLabel: "Scope of Services",
      customQuantityLabel: "Billed Hours",
      customUnitPriceLabel: "Hourly Rate",
      customAmountLabel: "Line Amount",
      customTotalLabel: "Total Amount Payable",
    });

    const settings = getTemplateSettings(businessId, userId, "sales-invoice");
    assert.equal(settings.letterheadMode, "preprinted");
    assert.equal(settings.hideDigitalHeader, true);
    assert.equal(settings.marginTop, 125);
    assert.equal(settings.customDocumentTitle, "COMMERCIAL TAX INVOICE");
    assert.equal(settings.customQuantityLabel, "Billed Hours");

    // Generate PDF with preprinted stationery settings
    const result = await generateDocumentPdf(
      businessId,
      userId,
      "Apex Group LLC",
      "AED",
      "sales-invoice",
      invoiceId,
    );

    assert.ok(result.pdf.byteLength > 1000, "PDF buffer must be valid size");
    assert.equal(result.pdf.subarray(0, 4).toString(), "%PDF", "Must be a valid PDF format");
  });

  await t.test("2. Full-Page Background Letterhead Artwork Mode", async () => {
    // 1x1 transparent PNG data URL for test
    const dummyA4Background = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    saveTemplateSettings(businessId, userId, "sales-invoice", {
      templateType: "classic",
      letterheadMode: "background",
      letterheadBackgroundUrl: dummyA4Background,
      marginTop: 80,
      marginBottom: 60,
      marginLeft: 45,
      marginRight: 45,
    });

    const settings = getTemplateSettings(businessId, userId, "sales-invoice");
    assert.equal(settings.letterheadMode, "background");
    assert.equal(settings.letterheadBackgroundUrl, dummyA4Background);

    const result = await generateDocumentPdf(
      businessId,
      userId,
      "Apex Group LLC",
      "AED",
      "sales-invoice",
      invoiceId,
    );

    assert.ok(result.pdf.byteLength > 1000);
    assert.equal(result.pdf.subarray(0, 4).toString(), "%PDF");
  });

  await t.test("3. Dual Signatures & Structured Bank Remittance Details", async () => {
    const dummySignature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    saveTemplateSettings(businessId, userId, "sales-invoice", {
      templateType: "minimal",
      letterheadMode: "digital",
      showPaymentInstructions: true,
      bankName: "First Abu Dhabi Bank (FAB)",
      bankAccountName: "Apex Corporate Technologies LLC",
      bankAccountNumber: "1098765432100",
      bankIban: "AE070331234567890123456",
      bankSwiftBic: "FABAAEADXXX",
      paymentInstructions: "Please reference invoice number in all wire remittances.",
      showSignatureBlock: true,
      signatureLayout: "dual",
      secondarySignatureLabel: "Prepared By: Accounts Dept",
      secondarySignatureImageUrl: dummySignature,
      signatureLabel: "Authorized Signatory: Managing Director",
      signatureImageUrl: dummySignature,
    });

    const settings = getTemplateSettings(businessId, userId, "sales-invoice");
    assert.equal(settings.signatureLayout, "dual");
    assert.equal(settings.bankName, "First Abu Dhabi Bank (FAB)");
    assert.equal(settings.bankIban, "AE070331234567890123456");
    assert.equal(settings.secondarySignatureLabel, "Prepared By: Accounts Dept");

    const result = await generateDocumentPdf(
      businessId,
      userId,
      "Apex Group LLC",
      "AED",
      "sales-invoice",
      invoiceId,
    );

    assert.ok(result.pdf.byteLength > 1000);
    assert.equal(result.pdf.subarray(0, 4).toString(), "%PDF");
  });

  await t.test("4. Direct renderDocumentPdf with Partial Override Settings", async () => {
    // Verify renderDocumentPdf cleanly handles partial override settings without throwing
    const sampleData = {
      companyName: "Test Company",
      invoiceTitle: "INVOICE",
      invoiceNumber: "INV-9999",
      invoiceDate: "2026-10-18",
      customerName: "Client Org",
      lines: [{ description: "Consulting", quantity: "1", unitPrice: "100.00", amount: "100.00" }],
      subtotal: "100.00",
      tax: "5.00",
      total: "105.00",
    };

    // Passing only custom labels and margins as a partial
    const buffer = await renderDocumentPdf(businessId, userId, "sales-invoice", sampleData, {
      customDocumentTitle: "PROFORMA INVOICE",
      customDescriptionLabel: "Service Details",
      marginTop: 65,
    });

    assert.ok(buffer.byteLength > 500);
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  });
});
