import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-phase-10-")),
  BETTER_AUTH_SECRET: "phase-10-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createBusiness } = await import("../src/core/businesses/business-service");
const { businessMigrations, migrateBusinessDatabase } = await import(
  "../src/core/db/business-migrations"
);
const { saveSalesQuote: createQuote, getSalesQuote: getQuote } = await import(
  "../src/modules/sales-quotes/quote-service"
);
const { saveSalesOrder: createOrder, getSalesOrder: getOrder } = await import(
  "../src/modules/sales-orders/sales-order-service"
);

test("Phase 10: New Modules (Quotes & Orders)", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);
  
  const customerId = (sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = 'AED' OR default_currency_code IS NULL LIMIT 1").get() as any).id;
  const standardAccount = (sqlite.prepare("SELECT default_sales_account_id FROM business_accounting_settings LIMIT 1").get() as any).default_sales_account_id;
  const outputVatId = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get() as any).id;


  let quoteId = "";
  let orderId = "";

  await suite.test("Quotes module supports amountsIncludeTax and discountValue", () => {
    const input = {
      customerId,
      date: "2026-08-26",
      expiryDate: "2026-09-26",
      reference: "TEST-QUOTE-1",
      currency: "AED",
      exchangeRate: "",
      amountsIncludeTax: true, // test inclusive
      lines: [
        {
          description: "Software License",
          quantity: "1",
          unitPrice: "105.00", // 105.00
          discountType: "percentage" as const,
          discountValue: "10", // 10%
          salesAccountId: standardAccount,
          taxCodeId: outputVatId,
          projectId: "",
          itemId: "",
        },
      ],
    };
    quoteId = createQuote(businessId, adminId, input, "issue");
    const quote = getQuote(businessId, adminId, quoteId);
    assert.ok(quote);
    assert.equal(quote.quote.amountsIncludeTax, true);
    
    // 105.00 * 1 = 105.00
    // discount = 10.50
    // gross after discount = 94.50 (9450 minor)
    // inclusive tax (5%) = 9450 / 1.05 = 9000 net, 450 tax
    assert.equal(quote.quote.subtotalMinor, 9000);
    assert.equal(quote.quote.taxMinor, 450);
    assert.equal(quote.quote.totalMinor, 9450);
  });

  await suite.test("Orders module supports linking to quotes and standard fields", () => {
    const input = {
      customerId,
      date: "2026-08-26",
      reference: "TEST-ORDER-1",
      currency: "AED",
      exchangeRate: "",
      amountsIncludeTax: false,
      salesQuoteId: quoteId,
      lines: [
        {
          description: "Consulting",
          quantity: "2",
          unitPrice: "50.00", // 50.00 each => 100.00
          discountType: "fixed" as const,
          discountValue: "20.00", // 20.00 flat discount
          salesAccountId: standardAccount,
          taxCodeId: outputVatId,
          projectId: "",
          itemId: "",
        },
      ],
    };
    orderId = createOrder(businessId, adminId, input, "issue");
    const order = getOrder(businessId, adminId, orderId);
    assert.ok(order);
    assert.equal(order.order.salesQuoteId, quoteId);
    assert.equal(order.order.amountsIncludeTax, false);

    // 100.00 - 20.00 discount = 80.00 (8000 minor)
    // exclusive tax (5%) = 8000 * 0.05 = 400 tax
    assert.equal(order.order.subtotalMinor, 8000);
    assert.equal(order.order.taxMinor, 400);
    assert.equal(order.order.totalMinor, 8400);
  });
  
  await suite.test("Form defaults API schema operations", () => {
      const payload = { test: true };
      sqlite.prepare("INSERT INTO form_defaults (id, form_type, payload_json, updated_at) VALUES (?, ?, ?, ?)").run(
        "fd-1",
        "sales-quote",
        JSON.stringify(payload),
        new Date().toISOString()
      );
      
      const existing = sqlite.prepare("SELECT * FROM form_defaults WHERE form_type = 'sales-quote'").get();
      assert.ok(existing);
  });
});


