import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-lifecycle-crosslink-")),
  BETTER_AUTH_SECRET: "e2e-secret-crosslink",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
const {
  saveSalesQuote,
  getSalesQuote,
  issueSalesQuote,
} = await import("../src/modules/sales-quotes/quote-service");
const {
  savePurchaseQuote,
  getPurchaseQuote,
  issuePurchaseQuote,
} = await import("../src/modules/purchase-quotes/purchase-quote-service");
const {
  saveSalesOrder,
  getSalesOrder,
  issueSalesOrder,
} = await import("../src/modules/sales-orders/sales-order-service");
const {
  savePurchaseOrder,
  getPurchaseOrder,
  issuePurchaseOrder,
} = await import("../src/modules/purchase-orders/purchase-order-service");
const {
  createInvoice,
  getInvoice,
  postInvoice,
} = await import("../src/modules/sales-invoices/invoice-service");
const {
  savePurchaseInvoice,
  getPurchaseInvoice,
  postPurchaseInvoiceDoc,
} = await import("../src/modules/purchase-invoices/purchase-invoice-service");

test("Document Lifecycle & Cross-Referencing Verification", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  const salesAccount = (
    sqlite.prepare("SELECT default_sales_account_id FROM business_accounting_settings LIMIT 1").get() as any
  ).default_sales_account_id;
  const expenseAccount = (
    sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as any
  ).id;
  const vatCode = (
    sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get() as any
  ).id;

  const customerId = createCustomer(businessId, adminId, {
    name: "Crosslink Client LLC",
    email: "client@crosslink.test",
    defaultCurrencyCode: "AED",
    isActive: true,
  });

  const supplierId = createSupplier(businessId, adminId, {
    name: "Crosslink Vendor FZE",
    email: "vendor@crosslink.test",
    defaultCurrencyCode: "AED",
  });

  await suite.test("1. Sales Quote draft -> Issue Quote (sent)", () => {
    const quoteId = saveSalesQuote(
      businessId,
      adminId,
      {
        customerId,
        date: "2026-10-01",
        expectedDate: "2026-10-15",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Web Portal Development",
            quantity: "1",
            unitPrice: "5000.00",
            salesAccountId: salesAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "draft",
    );

    const draft = getSalesQuote(businessId, adminId, quoteId);
    assert.equal(draft?.quote.documentStatus, "draft");

    issueSalesQuote(businessId, adminId, quoteId);
    const issued = getSalesQuote(businessId, adminId, quoteId);
    assert.equal(issued?.quote.documentStatus, "sent");

    // Cannot issue an already sent quote
    assert.throws(() => issueSalesQuote(businessId, adminId, quoteId), /Only a draft sales quote can be issued/);
  });

  await suite.test("2. Purchase Quote draft -> Issue Quote (sent)", () => {
    const quoteId = savePurchaseQuote(
      businessId,
      adminId,
      {
        supplierId,
        date: "2026-10-01",
        expiryDate: "2026-10-15",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Server Hardware",
            quantity: "1",
            unitPrice: "3000.00",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "draft",
    );

    const draft = getPurchaseQuote(businessId, adminId, quoteId);
    assert.equal(draft?.quote.documentStatus, "draft");

    issuePurchaseQuote(businessId, adminId, quoteId);
    const issued = getPurchaseQuote(businessId, adminId, quoteId);
    assert.equal(issued?.quote.documentStatus, "sent");

    // Cannot issue an already sent quote
    assert.throws(() => issuePurchaseQuote(businessId, adminId, quoteId), /Only a draft purchase quote can be issued/);
  });

  await suite.test("3. Sales Order draft -> Activate Order (active) with quote linkage", () => {
    // Create quote first
    const quoteId = saveSalesQuote(
      businessId,
      adminId,
      {
        customerId,
        date: "2026-10-02",
        expectedDate: "2026-10-20",
        amountsIncludeTax: false,
        lines: [
          {
            description: "ERP Setup",
            quantity: "1",
            unitPrice: "8000.00",
            salesAccountId: salesAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "draft",
    );

    const orderId = saveSalesOrder(
      businessId,
      adminId,
      {
        customerId,
        salesQuoteId: quoteId,
        date: "2026-10-02",
        expectedDate: "2026-10-25",
        reference: "Ref from quote",
        amountsIncludeTax: false,
        lines: [
          {
            description: "ERP Setup Service",
            quantity: "1",
            unitPrice: "8000.00",
            salesAccountId: salesAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "draft",
    );

    const draft = getSalesOrder(businessId, adminId, orderId);
    assert.equal(draft?.order.documentStatus, "draft");
    assert.equal(draft?.order.salesQuoteId, quoteId);
    assert.equal(draft?.linkedQuote?.id, quoteId);

    issueSalesOrder(businessId, adminId, orderId);
    const active = getSalesOrder(businessId, adminId, orderId);
    assert.equal(active?.order.documentStatus, "active");

    assert.throws(() => issueSalesOrder(businessId, adminId, orderId), /Only a draft sales order can be activated/);
  });

  await suite.test("4. Purchase Order draft -> Issue Order (issued) with quote linkage", () => {
    const quoteId = savePurchaseQuote(
      businessId,
      adminId,
      {
        supplierId,
        date: "2026-10-02",
        expiryDate: "2026-10-20",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Data Center Racks",
            quantity: "2",
            unitPrice: "1500.00",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "draft",
    );

    const orderId = savePurchaseOrder(
      businessId,
      adminId,
      {
        supplierId,
        purchaseQuoteId: quoteId,
        date: "2026-10-02",
        expectedDate: "2026-10-25",
        reference: "PO for racks",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Data Center Racks",
            quantity: "2",
            unitPrice: "1500.00",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "draft",
    );

    const draft = getPurchaseOrder(businessId, adminId, orderId);
    assert.equal(draft?.order.status, "draft");
    assert.equal(draft?.order.purchaseQuoteId, quoteId);
    assert.equal(draft?.linkedQuote?.id, quoteId);

    issuePurchaseOrder(businessId, adminId, orderId);
    const issued = getPurchaseOrder(businessId, adminId, orderId);
    assert.equal(issued?.order.status, "issued");

    assert.throws(() => issuePurchaseOrder(businessId, adminId, orderId), /Only a draft purchase order can be issued/);
  });

  await suite.test("5. Sales Invoice draft -> Post Invoice (posted) with order linkage", () => {
    // Create sales order
    const orderId = saveSalesOrder(
      businessId,
      adminId,
      {
        customerId,
        date: "2026-10-03",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Consulting Milestone 1",
            quantity: "1",
            unitPrice: "4000.00",
            salesAccountId: salesAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "issue",
    );

    const invoiceId = createInvoice(
      businessId,
      adminId,
      {
        customerId,
        salesOrderId: orderId,
        invoiceDate: "2026-10-03",
        taxDate: "2026-10-03",
        dueDate: "2026-10-17",
        reference: "Inv for order",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Consulting Milestone 1",
            quantity: "1",
            unitPrice: "4000.00",
            salesAccountId: salesAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "draft",
    );

    const draft = getInvoice(businessId, adminId, invoiceId);
    assert.equal(draft?.invoice.documentStatus, "draft");
    assert.equal(draft?.invoice.salesOrderId, orderId);
    assert.equal(draft?.linkedOrder?.id, orderId);

    postInvoice(businessId, adminId, invoiceId);
    const posted = getInvoice(businessId, adminId, invoiceId);
    assert.equal(posted?.invoice.documentStatus, "posted");
    assert.ok(posted?.journal);
  });

  await suite.test("6. Purchase Invoice (Bill) draft -> Post Bill (posted) with order linkage", () => {
    const orderId = savePurchaseOrder(
      businessId,
      adminId,
      {
        supplierId,
        date: "2026-10-03",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Hardware shipment",
            quantity: "1",
            unitPrice: "2500.00",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "issue",
    );

    const billId = savePurchaseInvoice(
      businessId,
      adminId,
      {
        supplierId,
        purchaseOrderId: orderId,
        supplierInvoiceNumber: "SUPP-INV-9988",
        invoiceDate: "2026-10-03",
        taxDate: "2026-10-03",
        dueDate: "2026-10-20",
        reference: "Hardware bill",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Hardware shipment",
            quantity: "1",
            unitPrice: "2500.00",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "draft",
    );

    const draft = getPurchaseInvoice(businessId, adminId, billId);
    assert.equal(draft?.invoice.documentStatus, "draft");
    assert.equal(draft?.invoice.purchaseOrderId, orderId);
    assert.equal(draft?.order?.id, orderId);
    assert.equal(draft?.journal, null);

    postPurchaseInvoiceDoc(businessId, adminId, billId);
    const posted = getPurchaseInvoice(businessId, adminId, billId);
    assert.equal(posted?.invoice.documentStatus, "posted");
    assert.ok(posted?.journal);
  });
});
