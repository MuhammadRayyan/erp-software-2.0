import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-ui-ux-")),
  BETTER_AUTH_SECRET: "e2e-secret-ui-ux",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
const { formatMultiCurrencyTotals, renderMultiCurrencyString } = await import("../src/components/table-totals-bar");
const { saveSalesQuote, getSalesQuote } = await import("../src/modules/sales-quotes/quote-service");
const { saveSalesOrder, getSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
const { createInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { savePurchaseQuote, getPurchaseQuote } = await import("../src/modules/purchase-quotes/purchase-quote-service");
const { savePurchaseOrder, getPurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");

test("UI & UX Productivity Enhancements", async (suite) => {
  await suite.test("Table Totals Bar Aggregations", () => {
    // Empty array
    const emptyTotals = formatMultiCurrencyTotals([]);
    assert.deepEqual(emptyTotals, []);
    const emptyStr = renderMultiCurrencyString([]);
    assert.equal(emptyStr, "—");

    // Single currency aggregation
    const items = [
      { amount: 15000, currency: "AED", minorUnit: 2 },
      { amount: 35000, currency: "AED", minorUnit: 2 },
      { amount: 5000, currency: "aed", minorUnit: 2 },
    ];
    const totals = formatMultiCurrencyTotals(items);
    assert.equal(totals.length, 1);
    assert.equal(totals[0].currency, "AED");
    assert.equal(totals[0].total, 55000);

    const str = renderMultiCurrencyString(items);
    assert.ok(str.includes("550.00"));
    assert.ok(str.includes("AED"));

    // Multi-currency aggregation
    const multiItems = [
      { amount: 10000, currency: "USD", minorUnit: 2 },
      { amount: 50000, currency: "AED", minorUnit: 2 },
      { amount: 2500, currency: "USD", minorUnit: 2 },
    ];
    const multiTotals = formatMultiCurrencyTotals(multiItems);
    assert.equal(multiTotals.length, 2);

    const usdTotal = multiTotals.find((t) => t.currency === "USD");
    const aedTotal = multiTotals.find((t) => t.currency === "AED");
    assert.equal(usdTotal?.total, 12500);
    assert.equal(aedTotal?.total, 50000);

    const multiStr = renderMultiCurrencyString(multiItems);
    assert.ok(multiStr.includes("USD"));
    assert.ok(multiStr.includes("AED"));
    assert.ok(multiStr.includes("+"));
  });

  await suite.test("Cross-Document Flow & Relational Linkage", async () => {
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
      sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('sales', 'both') LIMIT 1").get() as any
    ).id;

    const customerId = createCustomer(businessId, adminId, {
      name: "UI Flow Customer",
      email: "flow@customer.com",
      defaultCurrencyCode: "AED",
      isActive: true,
    });

    const supplierId = createSupplier(businessId, adminId, {
      name: "UI Flow Supplier",
      email: "flow@supplier.com",
      defaultCurrencyCode: "AED",
      isActive: true,
    });

    // 1. Create and issue Sales Quote
    const quoteId = saveSalesQuote(
      businessId,
      adminId,
      {
        customerId,
        date: "2026-10-01",
        expectedDate: "2026-10-15",
        currencyCode: "AED",
        lines: [
          {
            description: "Consulting & Scoping",
            quantity: "1",
            unitPrice: "500",
            salesAccountId: salesAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "issue"
    );
    assert.ok(quoteId);

    const quoteRecord = getSalesQuote(businessId, adminId, quoteId);
    assert.ok(quoteRecord);

    // 2. Create Sales Order linking quote
    const orderId = saveSalesOrder(
      businessId,
      adminId,
      {
        customerId,
        salesQuoteId: quoteId,
        date: "2026-10-02",
        expectedDate: "2026-10-20",
        currencyCode: "AED",
        lines: [
          {
            description: "Consulting & Scoping",
            quantity: "1",
            unitPrice: "500",
            salesAccountId: salesAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "issue"
    );
    assert.ok(orderId);

    // Verify order links back to quote
    const orderRecord = getSalesOrder(businessId, adminId, orderId);
    assert.ok(orderRecord);
    assert.equal(orderRecord.linkedQuote?.id, quoteId);

    // Verify quote lists linked order
    const quoteWithOrders = getSalesQuote(businessId, adminId, quoteId);
    assert.ok(quoteWithOrders?.linkedOrders);
    assert.equal(quoteWithOrders.linkedOrders.length, 1);
    assert.equal(quoteWithOrders.linkedOrders[0].id, orderId);

    // 3. Create Sales Invoice linking order and quote
    const invoiceId = createInvoice(
      businessId,
      adminId,
      {
        customerId,
        salesOrderId: orderId,
        invoiceDate: "2026-10-03",
        dueDate: "2026-10-30",
        currencyCode: "AED",
        lines: [
          {
            description: "Consulting & Scoping",
            quantity: "1",
            unitPrice: "500",
            salesAccountId: salesAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "post"
    );
    assert.ok(invoiceId);

    // Verify invoice links to order and quote
    const invoiceRecord = getInvoice(businessId, adminId, invoiceId);
    assert.ok(invoiceRecord);
    assert.equal(invoiceRecord.linkedOrder?.id, orderId);
    assert.equal(invoiceRecord.linkedQuote?.id, quoteId);

    // 4. Create and issue Purchase Quote
    const pQuoteId = savePurchaseQuote(
      businessId,
      adminId,
      {
        supplierId,
        date: "2026-10-01",
        expiryDate: "2026-10-15",
        currencyCode: "AED",
        lines: [
          {
            description: "Dedicated Server",
            quantity: "2",
            unitPrice: "1500",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "issue"
    );
    assert.ok(pQuoteId);

    // 5. Create Purchase Order linking purchase quote
    const pOrderId = savePurchaseOrder(
      businessId,
      adminId,
      {
        supplierId,
        purchaseQuoteId: pQuoteId,
        date: "2026-10-02",
        expectedDate: "2026-10-20",
        currencyCode: "AED",
        lines: [
          {
            description: "Dedicated Server",
            quantity: "2",
            unitPrice: "1500",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
          },
        ],
      },
      "issue"
    );
    assert.ok(pOrderId);

    // Verify PO links to Purchase Quote
    const pOrderRecord = getPurchaseOrder(businessId, adminId, pOrderId);
    assert.ok(pOrderRecord);
    assert.equal(pOrderRecord.linkedQuote?.id, pQuoteId);

    // Verify Purchase Quote links to PO
    const pQuoteRecord = getPurchaseQuote(businessId, adminId, pQuoteId);
    assert.ok(pQuoteRecord?.linkedOrders);
    assert.equal(pQuoteRecord.linkedOrders.length, 1);
    assert.equal(pQuoteRecord.linkedOrders[0].id, pOrderId);
  });
});
