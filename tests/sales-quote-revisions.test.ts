import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-quote-rev-")),
  BETTER_AUTH_SECRET: "e2e-secret-rev",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createCustomer } = await import("../src/modules/customers/customer-service");
const {
  saveSalesQuote,
  getSalesQuote,
  createSalesQuoteRevision,
  listSalesQuoteRevisions,
  listSalesQuotes,
} = await import("../src/modules/sales-quotes/quote-service");
const { saveSalesOrder, getSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
const { quantityMicrosToInput } = await import("../src/modules/accounting/calculations/money");

test("Sales Quote Revisions & Versioning Lifecycle", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  const salesAccount = (
    sqlite.prepare("SELECT default_sales_account_id FROM business_accounting_settings LIMIT 1").get() as any
  ).default_sales_account_id;
  const vatCode = (
    sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('sales', 'both') LIMIT 1").get() as any
  ).id;

  const customerId = createCustomer(businessId, adminId, {
    name: "Acme Corp",
    email: "client@acme.com",
    defaultCurrencyCode: "AED",
    isActive: true,
  });

  let originalQuoteId = "";
  let rev1QuoteId = "";
  let rev2QuoteId = "";

  await suite.test("1. Create initial quote SQ (Rev 0) and issue it", () => {
    originalQuoteId = saveSalesQuote(
      businessId,
      adminId,
      {
        customerId,
        date: "2026-08-28",
        expectedDate: "2026-09-15",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Consulting Package A",
            quantity: "10",
            unitPrice: "1000",
            taxCodeId: vatCode,
            salesAccountId: salesAccount,
            discountType: "none",
            discountValue: "0",
          },
        ],
      },
      "issue",
    );

    const record = getSalesQuote(businessId, adminId, originalQuoteId);
    assert.ok(record);
    assert.equal(record.quote.documentStatus, "sent");
    assert.equal(record.quote.revisionNumber, 0);
    assert.equal(record.quote.isLatestRevision, true);
    assert.equal(record.quote.subtotalMinor, 1000000); // 10,000.00
  });

  await suite.test("2. Create Revision 1 upon client feedback", () => {
    rev1QuoteId = createSalesQuoteRevision(businessId, adminId, originalQuoteId);
    assert.ok(rev1QuoteId);
    assert.notEqual(rev1QuoteId, originalQuoteId);

    // Verify original quote is now superseded and not latest
    const originalRecord = getSalesQuote(businessId, adminId, originalQuoteId);
    assert.ok(originalRecord);
    assert.equal(originalRecord.quote.documentStatus, "superseded");
    assert.equal(originalRecord.quote.isLatestRevision, false);

    // Verify rev 1 has sequential -R1 numbering and draft status
    const rev1Record = getSalesQuote(businessId, adminId, rev1QuoteId);
    assert.ok(rev1Record);
    assert.equal(rev1Record.quote.quoteNumber, `${originalRecord.quote.quoteNumber}-R1`);
    assert.equal(rev1Record.quote.revisionNumber, 1);
    assert.equal(rev1Record.quote.documentStatus, "draft");
    assert.equal(rev1Record.quote.isLatestRevision, true);
    assert.equal(rev1Record.lines.length, 1);
    assert.equal(rev1Record.lines[0].description, "Consulting Package A");
  });

  await suite.test("3. Modify Rev 1 (add 10% discount) and issue it", () => {
    saveSalesQuote(
      businessId,
      adminId,
      {
        customerId,
        date: "2026-08-28",
        expectedDate: "2026-09-15",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Consulting Package A",
            quantity: "10",
            unitPrice: "1000",
            taxCodeId: vatCode,
            salesAccountId: salesAccount,
            discountType: "percentage",
            discountValue: "10",
          },
        ],
      },
      "issue",
      rev1QuoteId,
    );

    const rev1Record = getSalesQuote(businessId, adminId, rev1QuoteId);
    assert.ok(rev1Record);
    assert.equal(rev1Record.quote.documentStatus, "sent");
    assert.equal(rev1Record.quote.subtotalMinor, 900000); // 9,000.00 (10% off 10,000)
  });

  await suite.test("4. Create Revision 2 (add extra line item)", () => {
    rev2QuoteId = createSalesQuoteRevision(businessId, adminId, rev1QuoteId);
    assert.ok(rev2QuoteId);

    // Rev 1 should now be superseded
    const rev1Record = getSalesQuote(businessId, adminId, rev1QuoteId);
    assert.equal(rev1Record?.quote.documentStatus, "superseded");
    assert.equal(rev1Record?.quote.isLatestRevision, false);

    // Rev 2 should be -R2
    const rev2Record = getSalesQuote(businessId, adminId, rev2QuoteId);
    assert.ok(rev2Record);
    assert.ok(rev2Record.quote.quoteNumber.endsWith("-R2"));
    assert.equal(rev2Record.quote.revisionNumber, 2);
    assert.equal(rev2Record.quote.isLatestRevision, true);

    // Save with an extra line item
    saveSalesQuote(
      businessId,
      adminId,
      {
        customerId,
        date: "2026-08-28",
        expectedDate: "2026-09-15",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Consulting Package A",
            quantity: "10",
            unitPrice: "1000",
            taxCodeId: vatCode,
            salesAccountId: salesAccount,
            discountType: "percentage",
            discountValue: "10",
          },
          {
            description: "Onsite Training Workshop",
            quantity: "1",
            unitPrice: "2000",
            taxCodeId: vatCode,
            salesAccountId: salesAccount,
            discountType: "none",
            discountValue: "0",
          },
        ],
      },
      "issue",
      rev2QuoteId,
    );

    const updatedRev2 = getSalesQuote(businessId, adminId, rev2QuoteId);
    assert.equal(updatedRev2?.quote.documentStatus, "sent");
    assert.equal(updatedRev2?.quote.subtotalMinor, 1100000); // 9,000 + 2,000 = 11,000.00
  });

  await suite.test("5. List revisions for the quote family", () => {
    const revisions = listSalesQuoteRevisions(businessId, adminId, rev2QuoteId);
    assert.equal(revisions.length, 3);
    assert.equal(revisions[0].revision_number, 2);
    assert.equal(revisions[0].is_latest_revision, 1);
    assert.equal(revisions[1].revision_number, 1);
    assert.equal(revisions[1].is_latest_revision, 0);
    assert.equal(revisions[2].revision_number, 0);
    assert.equal(revisions[2].is_latest_revision, 0);
  });

  await suite.test("6. Convert accepted Rev 2 into Sales Order", () => {
    try {
      const quoteData = getSalesQuote(businessId, adminId, rev2QuoteId);
      assert.ok(quoteData);
      console.log("DEBUG quoteData.lines:", JSON.stringify(quoteData.lines.map(l => ({ id: l.id, desc: l.description, unitPriceMinor: l.unitPriceMinor, qtyMicros: l.quantityMicros, discountType: l.discountType, discountValue: l.discountValue }))));
      console.log("DEBUG quote header:", { subtotalMinor: quoteData.quote.subtotalMinor, taxMinor: quoteData.quote.taxMinor, totalMinor: quoteData.quote.totalMinor });

      const input = {
        customerId: quoteData.quote.customerId,
        projectId: quoteData.quote.projectId || "",
        amountsIncludeTax: quoteData.quote.amountsIncludeTax,
        date: "2026-08-28",
        expectedDate: "",
        reference: quoteData.quote.quoteNumber,
        salesQuoteId: rev2QuoteId,
        notes: "",
        currencyCode: quoteData.quote.currencyCode,
        exchangeRateToBase: String(quoteData.quote.exchangeRateToBase),
        exchangeRateDate: quoteData.quote.exchangeRateDate || "",
        exchangeRateSource: quoteData.quote.exchangeRateSource as any,
        lines: quoteData.lines.map((l: any) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          discountType: l.discountType || "none",
          discountValue: l.discountValue || "0",
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          salesAccountId: l.salesAccountId || "",
          taxCodeId: l.taxCodeId || "",
          projectId: l.projectId || "",
        })),
      };

      const orderId = saveSalesOrder(businessId, adminId, input, "draft");
      assert.ok(orderId);

      // Sales Order should link to Rev 2 and have matching totals
      const order = getSalesOrder(businessId, adminId, orderId);
      assert.ok(order);
      assert.equal(order.order.salesQuoteId, rev2QuoteId);
      assert.equal(order.order.subtotalMinor, 1100000);
      assert.equal(order.lines.length, 2);
      assert.equal(order.lines[1].description, "Onsite Training Workshop");
    } catch (e) {
      console.error("STEP 6 ERROR:", e);
      throw e;
    }
  });
});
