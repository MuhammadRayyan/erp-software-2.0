import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-ui-ux-")),
  BETTER_AUTH_SECRET: "ui-ux-test-secret-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { createBusiness } = await import("../src/core/businesses/business-service");
const { customerInputSchema } = await import("../src/modules/customers/customer-input");
const { supplierInputSchema } = await import("../src/modules/suppliers/supplier-input");
const { getCashFlowForecast } = await import("../src/modules/reports/cash-flow-forecast-service");
const { getTrialBalance } = await import("../src/modules/reports/report-service");
const { createCustomer, updateCustomer, getCustomer } = await import("../src/modules/customers/customer-service");
const { getBusinessDb } = await import("../src/core/db/business");
const { customers } = await import("../src/core/db/business-schema");
const { eq } = await import("drizzle-orm");

test("UI/UX & Validation Suite", async (t) => {
  const seed = await seedDemoData();
  const userId = seed.admin.id;

  const business = createBusiness(
    {
      name: "UX Verification Business",
      currency: "AED",
      country: "United Arab Emirates",
      financialYearStartMonth: 1,
    },
    userId,
  );

  await t.test("Customer form validation: invalid email format rejects on validation", () => {
    const invalidEmailResult = customerInputSchema.safeParse({
      name: "Acme Corp",
      email: "not-an-email",
      defaultCurrencyCode: "AED",
    });
    assert.equal(invalidEmailResult.success, false, "Invalid email should fail validation");
    if (!invalidEmailResult.success) {
      const emailIssue = invalidEmailResult.error.issues.find((i) => i.path.includes("email"));
      assert.ok(emailIssue, "Should have issue for email");
      assert.match(emailIssue.message, /valid email/i);
    }
  });

  await t.test("Customer form validation: valid email and empty email both pass", () => {
    const validEmailResult = customerInputSchema.safeParse({
      name: "Acme Corp",
      email: "billing@acme.com",
      defaultCurrencyCode: "AED",
    });
    assert.equal(validEmailResult.success, true, "Valid email should pass validation");

    const emptyEmailResult = customerInputSchema.safeParse({
      name: "Acme Corp",
      email: "",
      defaultCurrencyCode: "AED",
    });
    assert.equal(emptyEmailResult.success, true, "Empty email should pass validation (optional)");
  });

  await t.test("Customer form validation: payment terms and name boundaries", () => {
    const shortNameResult = customerInputSchema.safeParse({
      name: "A",
      defaultCurrencyCode: "AED",
    });
    assert.equal(shortNameResult.success, false, "Name < 2 chars should fail");

    const negativeTermsResult = customerInputSchema.safeParse({
      name: "Acme Corp",
      paymentTermsDays: -5,
      defaultCurrencyCode: "AED",
    });
    assert.equal(negativeTermsResult.success, false, "Negative terms should fail");

    const validResult = customerInputSchema.safeParse({
      name: "Valid Customer LLC",
      paymentTermsDays: 30,
      defaultCurrencyCode: "AED",
    });
    assert.equal(validResult.success, true, "Valid customer payload should pass");
  });

  await t.test("Supplier form validation: invalid email rejects with clear message", () => {
    const invalidResult = supplierInputSchema.safeParse({
      name: "Global Supplier",
      email: "invalid-email-string",
      defaultCurrencyCode: "AED",
    });
    assert.equal(invalidResult.success, false, "Invalid supplier email should fail");
    if (!invalidResult.success) {
      const emailIssue = invalidResult.error.issues.find((i) => i.path.includes("email"));
      assert.ok(emailIssue);
      assert.match(emailIssue.message, /valid email/i);
    }
  });

  await t.test("Supplier form validation: valid supplier payload passes", () => {
    const validResult = supplierInputSchema.safeParse({
      name: "Global Parts FZ-LLC",
      email: "orders@globalparts.ae",
      defaultCurrencyCode: "AED",
    });
    assert.equal(validResult.success, true);
  });

  await t.test("Overview cash flow forecast service computes 30-day runway safely", () => {
    const forecast = getCashFlowForecast(business.id, userId, { horizonDays: 30 });
    assert.ok(forecast.summary, "Forecast should produce summary");
    assert.equal(typeof forecast.summary.startingCashMinor, "number");
    assert.equal(typeof forecast.summary.totalInflowsMinor, "number");
    assert.equal(typeof forecast.summary.totalOutflowsMinor, "number");
    assert.equal(typeof forecast.summary.projectedClosingCashMinor, "number");
    assert.ok(Array.isArray(forecast.dailyLedger));
    assert.equal(forecast.dailyLedger.length, 31, "30-day horizon produces 31 daily ledger entries (day 0 through 30)");
  });

  await t.test("Overview financial summary trial balance integration", () => {
    const tb = getTrialBalance(business.id, userId);
    assert.ok(Array.isArray(tb.accounts), "Trial balance should return accounts list");
    assert.equal(typeof tb.debitMinor, "number");
    assert.equal(typeof tb.creditMinor, "number");
    // Strict double-entry balance check
    assert.equal(tb.debitMinor, tb.creditMinor, "Trial balance debits must equal credits");
  });

  await t.test("Searchable item filter logic matches SKU and Name", () => {
    const items = [
      { id: "1", name: "MacBook Pro 16", sku: "LAP-001" },
      { id: "2", name: "Dell XPS 15", sku: "LAP-002" },
      { id: "3", name: "Wireless Mouse", sku: "ACC-010" },
    ];

    // Filter by SKU
    const skuMatches = items.filter((i) => i.sku?.toLowerCase().includes("001") || i.name.toLowerCase().includes("001"));
    assert.equal(skuMatches.length, 1);
    assert.equal(skuMatches[0].name, "MacBook Pro 16");

    // Filter by Name
    const nameMatches = items.filter((i) => i.sku?.toLowerCase().includes("mouse") || i.name.toLowerCase().includes("mouse"));
    assert.equal(nameMatches.length, 1);
    assert.equal(nameMatches[0].sku, "ACC-010");
  });

  await t.test("Customer creation with TRN synchronizes both taxReference and trn columns", () => {
    const custId = createCustomer(business.id, userId, {
      name: "Al Habtoor Contracting LLC",
      taxReference: "100123456789003",
      defaultCurrencyCode: "AED",
    });

    const saved = getCustomer(business.id, userId, custId);
    assert.ok(saved);
    assert.equal(saved.taxReference, "100123456789003", "taxReference must be populated");
    assert.equal(saved.trn, "100123456789003", "trn column must be synchronized with taxReference");
  });

  await t.test("Customer update with new TRN synchronizes columns without stale legacy TRN shadowing", () => {
    // 1. Create a customer with a legacy TRN directly in the DB
    const custId = createCustomer(business.id, userId, {
      name: "Legacy UAE Client LLC",
      defaultCurrencyCode: "AED",
    });

    const bDb = getBusinessDb(business.id, userId);
    bDb.db
      .update(customers)
      .set({ trn: "100111111111111", taxReference: null })
      .where(eq(customers.id, custId))
      .run();

    const legacy = getCustomer(business.id, userId, custId);
    assert.equal(legacy?.trn, "100111111111111");
    assert.equal(legacy?.taxReference, null);

    // 2. Update via updateCustomer with a new TRN in taxReference
    updateCustomer(business.id, userId, custId, {
      name: "Legacy UAE Client LLC (Updated)",
      taxReference: "100999999999999",
      defaultCurrencyCode: "AED",
    });

    const updated = getCustomer(business.id, userId, custId);
    assert.ok(updated);
    assert.equal(updated.name, "Legacy UAE Client LLC (Updated)");
    assert.equal(updated.taxReference, "100999999999999", "Updated taxReference must be persisted");
    assert.equal(updated.trn, "100999999999999", "trn must be updated so obsolete TRN does not shadow on invoices");
  });

  await t.test("Customer update with cleared TRN clears both columns", () => {
    const custId = createCustomer(business.id, userId, {
      name: "Tax Exempt Entity",
      taxReference: "100555555555003",
      defaultCurrencyCode: "AED",
    });

    updateCustomer(business.id, userId, custId, {
      name: "Tax Exempt Entity",
      taxReference: "",
      defaultCurrencyCode: "AED",
    });

    const cleared = getCustomer(business.id, userId, custId);
    assert.ok(cleared);
    assert.equal(cleared.taxReference, null);
    assert.equal(cleared.trn, null);
  });
});

