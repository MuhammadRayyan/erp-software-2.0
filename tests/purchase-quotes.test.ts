import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-pq-rev-")),
  BETTER_AUTH_SECRET: "e2e-secret-pq-rev",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
const {
  savePurchaseQuote,
  getPurchaseQuote,
  listPurchaseQuotes,
  createPurchaseQuoteRevision,
  listPurchaseQuoteRevisions,
} = await import("../src/modules/purchase-quotes/purchase-quote-service");
const { savePurchaseOrder, getPurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");
const { quantityMicrosToInput } = await import("../src/modules/accounting/calculations/money");
const { savePurchaseInvoice, getPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");

test("Purchase Quotes Lifecycle, Revisions, and One-Click Conversions", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;

  const { sqlite } = getBusinessDb(businessId, adminId);

  const expenseAccount = (
    sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as any
  ).id;
  const vatCode = (
    sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('purchases', 'both') LIMIT 1").get() as any
  ).id;

  const supplierId = createSupplier(businessId, adminId, {
    name: "Industrial Suppliers Ltd",
    email: "supplier@industrialsupplies.com",
    defaultCurrencyCode: "AED",
    isActive: true,
  });

  let originalQuoteId = "";
  let rev1QuoteId = "";
  let rev2QuoteId = "";

  await suite.test("1. Create initial purchase quote PQ (Rev 0) and issue it", () => {
    originalQuoteId = savePurchaseQuote(
      businessId,
      adminId,
      {
        supplierId,
        date: "2026-08-28",
        expiryDate: "2026-09-28",
        reference: "RFQ-2026-001",
        notes: "Initial quote request",
        terms: "Net 30",
        currencyCode: "AED",
        exchangeRateToBase: "1",
        exchangeRateDate: "2026-08-28",
        exchangeRateSource: "Base",
        amountsIncludeTax: false,
        lines: [
          {
            itemId: "",
            description: "Industrial Steel Fasteners",
            quantity: "10",
            unitPrice: "100.00",
            discountType: "none",
            discountValue: "0",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
            projectId: "",
          },
        ],
      },
      "issue",
    );

    const quote = getPurchaseQuote(businessId, adminId, originalQuoteId);
    assert.ok(quote);
    assert.equal(quote.quote.documentStatus, "sent");
    assert.equal(quote.quote.revisionNumber, 0);
    assert.equal(quote.quote.isLatestRevision, true);
    assert.equal(quote.lines[0].netAmountMinor, 100_000); // 10 * 100.00 = 1000.00 = 100,000 minor
    assert.equal(quote.lines[0].grossAmountMinor, 105_000); // 5% VAT = 1,050.00
  });

  await suite.test("2. Create Revision 1 from the issued quote", () => {
    rev1QuoteId = createPurchaseQuoteRevision(businessId, adminId, originalQuoteId);
    assert.ok(rev1QuoteId);
    assert.notEqual(rev1QuoteId, originalQuoteId);

    const rev1 = getPurchaseQuote(businessId, adminId, rev1QuoteId);
    assert.ok(rev1);
    assert.equal(rev1.quote.revisionNumber, 1);
    assert.equal(rev1.quote.isLatestRevision, true);
    assert.equal(rev1.quote.documentStatus, "draft");
    assert.ok(rev1.quote.quoteNumber.endsWith("-R1"));

    // Check that original quote is superseded
    const original = getPurchaseQuote(businessId, adminId, originalQuoteId);
    assert.ok(original);
    assert.equal(original.quote.documentStatus, "superseded");
    assert.equal(original.quote.isLatestRevision, false);
  });

  await suite.test("3. Edit Revision 1: Add a 15% discount and issue it", () => {
    savePurchaseQuote(
      businessId,
      adminId,
      {
        supplierId,
        date: "2026-08-28",
        expiryDate: "2026-09-28",
        reference: "RFQ-2026-001-REV1",
        notes: "Updated with 15% negotiated discount",
        terms: "Net 30",
        currencyCode: "AED",
        exchangeRateToBase: "1",
        exchangeRateDate: "2026-08-28",
        exchangeRateSource: "Base",
        amountsIncludeTax: false,
        lines: [
          {
            itemId: "",
            description: "Industrial Steel Fasteners",
            quantity: "10",
            unitPrice: "100.00",
            discountType: "percentage",
            discountValue: "15",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
            projectId: "",
          },
        ],
      },
      "issue",
      rev1QuoteId,
    );

    const rev1 = getPurchaseQuote(businessId, adminId, rev1QuoteId);
    assert.ok(rev1);
    assert.equal(rev1.quote.documentStatus, "sent");
    assert.equal(rev1.lines[0].discountType, "percentage");
    assert.equal(rev1.lines[0].discountValue, "15");
    // 10 * 100 = 1000; 15% discount = 150; Net = 850 = 85,000 minor
    assert.equal(rev1.lines[0].netAmountMinor, 85_000);
    // 5% VAT on 850 = 42.50 = 4,250 minor; Gross = 89,250
    assert.equal(rev1.lines[0].taxAmountMinor, 4_250);
    assert.equal(rev1.lines[0].grossAmountMinor, 89_250);
  });

  await suite.test("4. Create Revision 2 from Revision 1", () => {
    rev2QuoteId = createPurchaseQuoteRevision(businessId, adminId, rev1QuoteId);
    assert.ok(rev2QuoteId);

    const rev2 = getPurchaseQuote(businessId, adminId, rev2QuoteId);
    assert.ok(rev2);
    assert.equal(rev2.quote.revisionNumber, 2);
    assert.equal(rev2.quote.isLatestRevision, true);
    assert.ok(rev2.quote.quoteNumber.endsWith("-R2"));

    // Verify revision history list
    const revisions = listPurchaseQuoteRevisions(businessId, adminId, rev2QuoteId);
    assert.equal(revisions.length, 3);
    assert.equal(revisions[0].revision_number, 2);
    assert.equal(revisions[1].revision_number, 1);
    assert.equal(revisions[2].revision_number, 0);
  });

  let createdOrderId = "";

  await suite.test("5. Convert accepted quote to Purchase Order (1-Click Pipeline)", async () => {
    // Issue rev2 first
    savePurchaseQuote(
      businessId,
      adminId,
      {
        supplierId,
        date: "2026-08-28",
        expiryDate: "2026-09-28",
        reference: "RFQ-2026-FINAL",
        notes: "Final approved supplier quotation",
        terms: "Net 30",
        currencyCode: "AED",
        exchangeRateToBase: "1",
        exchangeRateDate: "2026-08-28",
        exchangeRateSource: "Base",
        amountsIncludeTax: false,
        lines: [
          {
            itemId: "",
            description: "Industrial Steel Fasteners",
            quantity: "20",
            unitPrice: "90.00",
            discountType: "fixed",
            discountValue: "100.00",
            expenseAccountId: expenseAccount,
            taxCodeId: vatCode,
            projectId: "",
          },
        ],
      },
      "issue",
      rev2QuoteId,
    );

    const quoteData = getPurchaseQuote(businessId, adminId, rev2QuoteId);
    assert.ok(quoteData);

    const poInput = {
      supplierId: quoteData.quote.supplierId,
      projectId: quoteData.quote.projectId || "",
      amountsIncludeTax: quoteData.quote.amountsIncludeTax,
      date: "2026-08-28",
      expectedDate: "",
      reference: quoteData.quote.quoteNumber,
      purchaseQuoteId: rev2QuoteId,
      notes: quoteData.quote.notes || "",
      currencyCode: quoteData.quote.currencyCode,
      exchangeRateToBase: String(quoteData.quote.exchangeRateToBase),
      exchangeRateDate: quoteData.quote.exchangeRateDate || "",
      exchangeRateSource: quoteData.quote.exchangeRateSource as any,
      lines: quoteData.lines.map((l) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        discountType: (l.discountType as any) || "none",
        discountValue: l.discountValue || "0",
        unitPrice: (l.unitPriceMinor / 100).toFixed(2),
        expenseAccountId: l.expenseAccountId || "",
        taxCodeId: l.taxCodeId || "",
        projectId: l.projectId || "",
      })),
    };

    createdOrderId = savePurchaseOrder(businessId, adminId, poInput, "draft");
    assert.ok(createdOrderId);

    // Auto mark quote as accepted
    const { purchaseQuotes } = await import("../src/core/db/business-schema");
    const { eq } = await import("drizzle-orm");
    const context = getBusinessDb(businessId, adminId);
    context.db.update(purchaseQuotes).set({ documentStatus: "accepted" }).where(eq(purchaseQuotes.id, rev2QuoteId)).run();

    const order = getPurchaseOrder(businessId, adminId, createdOrderId);
    assert.ok(order);
    assert.equal(order.order.purchaseQuoteId, rev2QuoteId);
    // 20 * 90 = 1800; Fixed discount 100 = Net 1700 = 170,000 minor
    assert.equal(order.lines[0].netAmountMinor, 170_000);
    assert.equal(order.lines[0].discountType, "fixed");
    assert.equal(order.lines[0].discountValue, "100.00");

    const acceptedQuote = getPurchaseQuote(businessId, adminId, rev2QuoteId);
    assert.equal(acceptedQuote?.quote.documentStatus, "accepted");
  });

  await suite.test("6. Convert Purchase Order to Purchase Invoice", () => {
    const orderData = getPurchaseOrder(businessId, adminId, createdOrderId);
    assert.ok(orderData);

    const piInput = {
      supplierId: orderData.order.supplierId,
      projectId: orderData.order.projectId || "",
      supplierInvoiceNumber: "INV-SUP-999",
      invoiceDate: "2026-08-28",
      taxDate: "2026-08-28",
      dueDate: "2026-09-28",
      amountsIncludeTax: orderData.order.amountsIncludeTax,
      reference: orderData.order.orderNumber,
      purchaseOrderId: createdOrderId,
      currencyCode: orderData.order.currencyCode,
      exchangeRateToBase: String(orderData.order.exchangeRateToBase),
      exchangeRateDate: orderData.order.exchangeRateDate || "",
      exchangeRateSource: orderData.order.exchangeRateSource as any,
      lines: orderData.lines.map((l) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        discountType: (l.discountType as any) || "none",
        discountValue: l.discountValue || "0",
        unitPrice: (l.unitPriceMinor / 100).toFixed(2),
        expenseAccountId: l.expenseAccountId || "",
        taxCodeId: l.taxCodeId || "",
        projectId: l.projectId || "",
      })),
    };

    const invoiceId = savePurchaseInvoice(businessId, adminId, piInput, "draft");
    assert.ok(invoiceId);

    const invoice = getPurchaseInvoice(businessId, adminId, invoiceId);
    assert.ok(invoice);
    assert.equal(invoice.invoice.purchaseOrderId, createdOrderId);
    assert.equal(invoice.lines[0].netAmountMinor, 170_000);
    assert.equal(invoice.lines[0].discountType, "fixed");
  });
});
