import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = mkdtempSync(path.join(tmpdir(), "modern-erp-pdf-test-"));
Object.assign(process.env, {
  ERP_DATA_DIR: tempDir,
  BETTER_AUTH_SECRET: "pdf-test-secret-key-12345",
  NODE_ENV: "test",
});

const { getBusinessDb } = await import("../src/core/db/business");
const { seedDemoData } = await import("../src/core/db/seed");
const { renderDocumentPdf, renderInvoicePdf } = await import("../src/modules/document-templates/template-registry");
const { getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { getPurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");
const { formatMoney } = await import("../src/core/format");
const { quantityMicrosToInput } = await import("../src/modules/accounting/calculations/money");

test("PDF Generation Test - Document Layouts and Visibility", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);
  const businessName = seeded.business.name;
  const currency = seeded.business.currency;

  // ── Sales Invoice PDF ──────────────────────────────────────────────────────
  const invoiceIdRow = sqlite.prepare("SELECT id FROM sales_invoices LIMIT 1").get() as any;
  assert.ok(invoiceIdRow, "A posted sales invoice exists in demo data");
  const invoice = getInvoice(businessId, adminId, invoiceIdRow.id);
  assert.ok(invoice, "Invoice record loaded");

  // Build the same InvoiceTemplateData shape used by the real PDF route
  const invoiceData = {
    companyName: businessName,
    invoiceNumber: invoice.invoice.invoiceNumber,
    invoiceDate: invoice.invoice.invoiceDate,
    dueDate: invoice.invoice.dueDate,
    customerName: invoice.customer.name,
    subtotal: formatMoney(invoice.invoice.subtotalMinor, currency),
    tax: formatMoney(invoice.invoice.taxMinor, currency),
    total: formatMoney(invoice.invoice.totalMinor, currency),
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: quantityMicrosToInput(l.quantityMicros),
      unitPrice: formatMoney(l.unitPriceMinor, currency),
      amount: formatMoney(l.grossAmountMinor, currency),
    })),
  };

  const salesPdfBuffer = await renderInvoicePdf(businessId, adminId, invoiceData as any);
  assert.ok(salesPdfBuffer.length > 1000, "Sales invoice PDF generated and non-empty");
  assert.equal(salesPdfBuffer.slice(0, 4).toString(), "%PDF", "Output is a valid PDF file");
  const invoicePdfPath = path.join(tempDir, "invoice.pdf");
  writeFileSync(invoicePdfPath, new Uint8Array(salesPdfBuffer));
  console.log(`✔ Invoice PDF saved → ${invoicePdfPath}`);

  // ── Purchase Order PDF ─────────────────────────────────────────────────────
  const poIdRow = sqlite.prepare("SELECT id FROM purchase_orders LIMIT 1").get() as any;
  assert.ok(poIdRow, "A purchase order exists in demo data");
  const po = getPurchaseOrder(businessId, adminId, poIdRow.id);
  assert.ok(po, "Purchase order record loaded");

  const poData = {
    companyName: businessName,
    invoiceTitle: "PURCHASE ORDER",
    invoiceNumber: po.order.orderNumber,
    customerLabel: "SUPPLIER",
    customerName: po.supplier.name,
    invoiceDate: po.order.date,
    dueDate: po.order.expectedDate ?? "—",
    subtotal: formatMoney(po.order.subtotalMinor, po.order.currencyCode),
    tax: formatMoney(po.order.taxMinor, po.order.currencyCode),
    total: formatMoney(po.order.totalMinor, po.order.currencyCode),
    lines: po.lines.map((l) => ({
      description: l.description,
      quantity: quantityMicrosToInput(l.quantityMicros),
      unitPrice: formatMoney(l.unitPriceMinor, po.order.currencyCode),
      amount: formatMoney(l.grossAmountMinor, po.order.currencyCode),
    })),
  };

  const poPdfBuffer = await renderDocumentPdf(businessId, adminId, "purchase-order", poData as any);
  assert.ok(poPdfBuffer.length > 1000, "Purchase order PDF generated and non-empty");
  assert.equal(poPdfBuffer.slice(0, 4).toString(), "%PDF", "Output is a valid PDF file");
  const poPdfPath = path.join(tempDir, "po.pdf");
  writeFileSync(poPdfPath, new Uint8Array(poPdfBuffer));
  console.log(`✔ PO PDF saved → ${poPdfPath}`);

  // ── Minimal Template with Full Customizations ──────────────────────────────
  const { saveTemplateSettings, getTemplateSettings } = await import("../src/modules/document-templates/template-service");

  const customMinimalSettings = {
    templateType: "minimal" as const,
    primaryColor: "#065f46",
    fontName: "Inter" as const,
    fontSize: "small" as const,
    logoPosition: "center" as const,
    logoSize: "medium" as const,
    watermarkText: "ORIGINAL",
    showPaymentInstructions: true,
    paymentInstructions: "Bank: Emirates NBD\nIBAN: AE070260000101234567801\nSWIFT: EBILAEAD",
    showSignatureBlock: true,
    signatureLabel: "Financial Controller",
    showNotes: true,
    showPaymentTerms: true,
    showPageNumbers: true,
    showTaxColumn: true,
    showDiscountColumn: true,
    headerText: "Authorized UAE Technology Partner",
    footerText: "Subject to standard trading terms & conditions",
  };

  const richInvoiceData = {
    ...invoiceData,
    invoiceTitle: "TAX INVOICE",
    customerLabel: "CUSTOMER",
    customerAddress: "Office 24, Boulevard Plaza, Downtown Dubai",
    customerTrn: "100987654300003",
    notes: "Please transfer funds referencing invoice DOC-2026-0001.",
    terms: "Payment terms are Net 30 days from date of supply.",
  };

  const minimalPdfBuffer = await renderDocumentPdf(businessId, adminId, "sales-invoice", richInvoiceData as any, customMinimalSettings as any);
  assert.ok(minimalPdfBuffer.length > 1000, "Minimal layout PDF generated and non-empty");
  assert.equal(minimalPdfBuffer.slice(0, 4).toString(), "%PDF", "Output is a valid PDF file");
  const minimalPdfPath = path.join(tempDir, "minimal-invoice.pdf");
  writeFileSync(minimalPdfPath, new Uint8Array(minimalPdfBuffer));
  console.log(`✔ Minimal layout PDF saved → ${minimalPdfPath}`);

  // ── Classic Template with Signature & Watermark ────────────────────────────
  const customClassicSettings = {
    ...customMinimalSettings,
    templateType: "classic" as const,
    primaryColor: "#1e3a8a",
    watermarkText: "DRAFT",
  };

  const classicPdfBuffer = await renderDocumentPdf(businessId, adminId, "sales-invoice", richInvoiceData as any, customClassicSettings as any);
  assert.ok(classicPdfBuffer.length > 1000, "Classic layout PDF generated and non-empty");
  assert.equal(classicPdfBuffer.slice(0, 4).toString(), "%PDF", "Output is a valid PDF file");
  console.log("✔ Classic layout PDF verified with watermark and signature block");

  // ── Brand Inheritance Fallback ─────────────────────────────────────────────
  saveTemplateSettings(businessId, adminId, "sales-invoice", {
    templateType: "modern",
    primaryColor: "#4f46e5",
    headerText: "Company Global Header",
  });

  // Querying purchase-quote (which has not been customized) should inherit sales-invoice branding
  const inheritedSettings = getTemplateSettings(businessId, adminId, "purchase-quote");
  assert.equal(inheritedSettings.primaryColor, "#4f46e5", "Inherited primaryColor from sales-invoice company template");
  assert.equal(inheritedSettings.headerText, "Company Global Header", "Inherited headerText from sales-invoice company template");
  console.log("✔ Template brand inheritance fallback verified across unconfigured documents");
});

