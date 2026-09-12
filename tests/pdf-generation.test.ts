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
});
