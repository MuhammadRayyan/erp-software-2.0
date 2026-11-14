import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-line-cf-")),
  BETTER_AUTH_SECRET: "line-cf-test-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { closeAllBusinessConnections, getBusinessDb } = await import("../src/core/db/business");
const { createCustomFieldDefinition, listCustomFieldDefinitions } = await import("../src/modules/custom-fields/custom-field-service");
const { createInvoice, getInvoice, updateInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { getDocumentViewData } = await import("../src/modules/document-templates/document-data-extractor");
const { savePurchaseOrder, getPurchaseOrder, createPurchaseOrderRevision } = await import("../src/modules/purchase-orders/purchase-order-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);

test("line-item custom fields persist and PDF extraction filters by showOnPdf", () => {
  const headerPublicId = createCustomFieldDefinition(businessId, adminId, {
    entityType: "sales_invoice",
    name: "Contract Ref",
    fieldType: "text",
    showOnPdf: true,
  });
  const headerInternalId = createCustomFieldDefinition(businessId, adminId, {
    entityType: "sales_invoice",
    name: "Internal Margin Note",
    fieldType: "text",
    showOnPdf: false,
  });
  const linePublicId = createCustomFieldDefinition(businessId, adminId, {
    entityType: "sales_invoice_line",
    name: "Serial Number",
    fieldType: "text",
    showOnPdf: true,
  });
  const lineInternalId = createCustomFieldDefinition(businessId, adminId, {
    entityType: "sales_invoice_line",
    name: "Vendor Cost Code",
    fieldType: "text",
    showOnPdf: false,
  });

  const lineDefs = listCustomFieldDefinitions(businessId, adminId, "sales_invoice_line");
  assert.equal(lineDefs.some((d) => d.id === linePublicId && d.showOnPdf === true), true);
  assert.equal(lineDefs.some((d) => d.id === lineInternalId && d.showOnPdf === false), true);

  const customer = sqlite.prepare("SELECT id FROM customers WHERE is_active = 1 LIMIT 1").get() as { id: string };
  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' AND is_active = 1 LIMIT 1").get() as { id: string };
  const taxCode = sqlite.prepare("SELECT id FROM tax_codes WHERE direction IN ('sales', 'both') AND is_active = 1 LIMIT 1").get() as { id: string };
  const today = new Date().toISOString().slice(0, 10);

  const invoiceId = createInvoice(
    businessId,
    adminId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      supplyEmirate: "dubai",
      dueDate: today,
      lines: [
        {
          description: "Industrial Generator",
          quantity: "1",
          unitPrice: "5000.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: taxCode.id,
          customFields: {
            [linePublicId]: "SN-UAE-9981",
            [lineInternalId]: "COST-SECRET-42",
          },
        },
      ],
    },
    "post",
    {
      [headerPublicId]: "CTR-2026-01",
      [headerInternalId]: "DO-NOT-PRINT",
    },
  );

  const record = getInvoice(businessId, adminId, invoiceId)!;
  assert.equal(record.lines[0].customFields[linePublicId], "SN-UAE-9981");
  assert.equal(record.lines[0].customFields[lineInternalId], "COST-SECRET-42");

  // Update line custom field & ensure stale line values clean up properly
  updateInvoice(
    businessId,
    adminId,
    invoiceId,
    {
      customerId: customer.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      invoiceDate: today,
      taxDate: today,
      supplyEmirate: "dubai",
      dueDate: today,
      lines: [
        {
          description: "Industrial Generator",
          quantity: "1",
          unitPrice: "5000.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: taxCode.id,
          customFields: {
            [linePublicId]: "SN-UAE-9982",
            [lineInternalId]: "COST-SECRET-42",
          },
        },
      ],
    },
    "post",
    {
      [headerPublicId]: "CTR-2026-01",
      [headerInternalId]: "DO-NOT-PRINT",
    },
  );

  const bundle = getDocumentViewData(businessId, adminId, seeded.business.name, "AED", "sales-invoice", invoiceId);
  assert.ok(bundle.data.customFields?.some((cf) => cf.name === "Contract Ref" && cf.value === "CTR-2026-01"));
  assert.equal(bundle.data.customFields?.some((cf) => cf.name === "Internal Margin Note"), false);

  const extractedLineCf = bundle.data.lines[0].customFields ?? [];
  assert.ok(extractedLineCf.some((cf) => cf.name === "Serial Number" && cf.value === "SN-UAE-9982"));
  assert.equal(extractedLineCf.some((cf) => cf.name === "Vendor Cost Code"), false);
});

test("purchase order line custom fields persist and filter on PDF extraction", () => {
  const poLinePublic = createCustomFieldDefinition(businessId, adminId, {
    entityType: "purchase_order_line",
    name: "Delivery Spec",
    fieldType: "text",
    showOnPdf: true,
  });
  const poLineHidden = createCustomFieldDefinition(businessId, adminId, {
    entityType: "purchase_order_line",
    name: "Buyer Internal Note",
    fieldType: "text",
    showOnPdf: false,
  });

  const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE is_active = 1 LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' AND is_active = 1 LIMIT 1").get() as { id: string };
  const taxCode = sqlite.prepare("SELECT id FROM tax_codes WHERE direction IN ('purchases', 'both') AND is_active = 1 LIMIT 1").get() as { id: string };
  const today = new Date().toISOString().slice(0, 10);

  const orderId = savePurchaseOrder(
    businessId,
    adminId,
    {
      supplierId: supplier.id,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: today,
      exchangeRateSource: "Base",
      date: today,
      lines: [
        {
          description: "Steel Beams",
          quantity: "10",
          unitPrice: "250.00",
          expenseAccountId: expenseAccount.id,
          taxCodeId: taxCode.id,
          customFields: {
            [poLinePublic]: "Grade A36",
            [poLineHidden]: "Negotiate 3% rebate",
          },
        },
      ],
    },
    "issue",
  );

  const po = getPurchaseOrder(businessId, adminId, orderId)!;
  assert.equal(po.lines[0].customFields[poLinePublic], "Grade A36");

  const bundle = getDocumentViewData(businessId, adminId, seeded.business.name, "AED", "purchase-order", orderId);
  const pdfFields = bundle.data.lines[0].customFields ?? [];
  assert.ok(pdfFields.some((f) => f.name === "Delivery Spec" && f.value === "Grade A36"));
  assert.equal(pdfFields.some((f) => f.name === "Buyer Internal Note"), false);

  // Creating a new revision must preserve line-level custom field values
  const revId = createPurchaseOrderRevision(businessId, adminId, orderId);
  const revPo = getPurchaseOrder(businessId, adminId, revId)!;
  assert.equal(revPo.lines[0].customFields[poLinePublic], "Grade A36");
  assert.equal(revPo.lines[0].customFields[poLineHidden], "Negotiate 3% rebate");
});

after(() => {
  closeAllBusinessConnections();
});
