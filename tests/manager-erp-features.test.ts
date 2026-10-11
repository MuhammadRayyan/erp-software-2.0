import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-manager-feat-")),
  BETTER_AUTH_SECRET: "e2e-secret-manager-features",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

// 1.A Financial Lock
const {
  getFinancialLockDate,
  setFinancialLockDate,
  assertFinancialLock,
} = await import("../src/modules/accounting/services/financial-lock-service");

// 1.B Accounts with balances
const { listAccountsWithBalances } = await import("../src/modules/accounting/services/account-service");

// 1.C Cash vs Accrual P&L
const { getProfitAndLoss } = await import("../src/modules/reports/report-service");

// 1.D Opening Balances
const { getOpeningBalances, saveOpeningBalances } = await import(
  "../src/modules/accounting/services/opening-balances-service"
);

// 2.E Units of Measure
const {
  listUnitsOfMeasure,
  createUnitOfMeasure,
  toggleUnitOfMeasure,
  deleteUnitOfMeasure,
} = await import("../src/modules/units-of-measure/uom-service");

// 4.A Payment Terms
const {
  listPaymentTerms,
  createPaymentTerm,
  calculateDueDate,
  setDefaultPaymentTerm,
} = await import("../src/modules/payment-terms/payment-terms-service");

// 4.C Email Templates
const {
  listEmailTemplates,
  saveEmailTemplate,
  interpolateEmailTemplate,
  resetEmailTemplate,
} = await import("../src/modules/email/email-template-service");

test("Manager.io & Modern ERP Feature Suite", async (suite) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  await suite.test("1.A Global Financial Lock Date", () => {
    // Initial lock date should be null
    const initial = getFinancialLockDate(businessId, userId);
    assert.equal(initial, null);

    // Set lock date to 2026-06-30
    setFinancialLockDate(businessId, userId, "2026-06-30");
    const updated = getFinancialLockDate(businessId, userId);
    assert.equal(updated, "2026-06-30");

    // Posting on or before lock date must throw
    assert.throws(
      () => assertFinancialLock(sqlite, "2026-06-30", "Test transaction"),
      /The financial period on or before 2026-06-30 is closed/
    );
    assert.throws(
      () => assertFinancialLock(sqlite, "2026-01-15", "Back-dated bill"),
      /The financial period on or before 2026-06-30 is closed/
    );

    // Posting after lock date must succeed without throwing
    assert.doesNotThrow(() => {
      assertFinancialLock(sqlite, "2026-07-01", "Future posting");
      assertFinancialLock(sqlite, "2026-10-15", "Current posting");
    });

    // Clear lock date
    setFinancialLockDate(businessId, userId, null);
    assert.equal(getFinancialLockDate(businessId, userId), null);
    assert.doesNotThrow(() => {
      assertFinancialLock(sqlite, "2025-01-01", "Unlocked posting");
    });
  });

  await suite.test("1.B Universal Balance Drill-Down (listAccountsWithBalances)", () => {
    const accounts = listAccountsWithBalances(businessId, userId);
    assert.ok(Array.isArray(accounts));
    assert.ok(accounts.length > 0);

    // Each account should have a balanceMinor number and valid subtype
    for (const acc of accounts) {
      assert.equal(typeof acc.id, "string");
      assert.equal(typeof acc.name, "string");
      assert.equal(typeof acc.balanceMinor, "number");
      assert.ok(acc.type);
      assert.ok(acc.subtype);
    }

    // Checking that Bank/Cash account has minor units
    const bankAccount = accounts.find((a) => a.subtype === "bank" || a.type === "asset");
    assert.ok(bankAccount, "Asset/bank account found");
  });

  await suite.test("1.C Cash Basis vs. Accrual Basis Toggle in Profit & Loss", () => {
    // Run P&L with accrual basis
    const accrualPL = getProfitAndLoss(businessId, userId, "2026-01-01", "2026-12-31", "accrual");
    assert.ok(Array.isArray(accrualPL));

    // Run P&L with cash basis
    const cashPL = getProfitAndLoss(businessId, userId, "2026-01-01", "2026-12-31", "cash");
    assert.ok(Array.isArray(cashPL));
  });

  await suite.test("1.D Guided Opening Balances Onboarding Engine", () => {
    const ob = getOpeningBalances(businessId, userId);
    assert.ok(Array.isArray(ob.accounts));
    assert.ok(ob.accounts.length > 0);

    // Pick two accounts to set opening balances
    const assetAcc = ob.accounts.find((a) => a.type === "asset")!;
    const liabilityAcc = ob.accounts.find((a) => a.type === "liability")!;

    // Save balanced opening balances: Asset 50,000 debit, Liability 50,000 credit
    saveOpeningBalances(businessId, userId, "2026-01-01", [
      { accountId: assetAcc.accountId, debitMinor: 5000000, creditMinor: 0 },
      { accountId: liabilityAcc.accountId, debitMinor: 0, creditMinor: 5000000 },
    ]);

    const updatedOb = getOpeningBalances(businessId, userId);
    assert.equal(updatedOb.openingDate, "2026-01-01");
    assert.ok(updatedOb.accounts.length > 0);

    // Save unbalanced opening balances: Asset 60,000 debit, Liability 40,000 credit
    // Auto-balances remainder into Retained Earnings / Equity
    saveOpeningBalances(businessId, userId, "2026-01-01", [
      { accountId: assetAcc.accountId, debitMinor: 6000000, creditMinor: 0 },
      { accountId: liabilityAcc.accountId, debitMinor: 0, creditMinor: 4000000 },
    ]);

    const rebalancedOb = getOpeningBalances(businessId, userId);
    assert.ok(rebalancedOb.accounts.length > 0);
  });

  await suite.test("2.E Units of Measure (UOM) Lifecycle", () => {
    // List initial seeded UOMs
    const uoms = listUnitsOfMeasure(businessId, userId);
    assert.ok(uoms.length >= 8, "Expected seeded standard units of measure");
    assert.ok(uoms.some((u) => u.code === "pcs"));
    assert.ok(uoms.some((u) => u.code === "kg"));
    assert.ok(uoms.some((u) => u.code === "box"));

    // Create a new custom unit of measure
    createUnitOfMeasure(businessId, userId, "drum", "55 Gal Drum");
    const drum = listUnitsOfMeasure(businessId, userId).find((u) => u.code === "drum");
    assert.ok(drum);
    assert.equal(drum.name, "55 Gal Drum");
    assert.equal(drum.isActive, true);

    // Toggle status
    toggleUnitOfMeasure(businessId, userId, drum.id, false);
    const updated = listUnitsOfMeasure(businessId, userId).find((u) => u.id === drum.id);
    assert.equal(updated?.isActive, false);

    // Delete custom unit
    deleteUnitOfMeasure(businessId, userId, drum.id);
    const afterDelete = listUnitsOfMeasure(businessId, userId).find((u) => u.id === drum.id);
    assert.equal(afterDelete, undefined);
  });

  await suite.test("4.A Payment Terms Presets and Due Date Calculations", () => {
    const terms = listPaymentTerms(businessId);
    assert.ok(terms.length >= 5, "Expected seeded payment terms");
    assert.ok(terms.some((t) => t.name.includes("Net 30") && t.is_default === 1));

    // Test calculateDueDate for days_after_invoice
    const net30 = { days: 30, is_eom: 0 };
    assert.equal(calculateDueDate("2026-01-15", net30), "2026-02-14");

    const receipt = { days: 0, is_eom: 0 };
    assert.equal(calculateDueDate("2026-03-20", receipt), "2026-03-20");

    // Test calculateDueDate for end_of_month
    const eom = { days: 0, is_eom: 1 };
    assert.equal(calculateDueDate("2026-01-10", eom), "2026-01-31");
    assert.equal(calculateDueDate("2026-02-12", eom), "2026-02-28");

    // Test calculateDueDate for end_of_month + 15 days
    const eom15 = { days: 15, is_eom: 1 };
    assert.equal(calculateDueDate("2026-01-10", eom15), "2026-02-15");

    // Create a new payment term preset
    const customTerm = createPaymentTerm(businessId, {
      name: "Net 90 Super Extended",
      days: 90,
      is_eom: false,
      is_default: false,
    });
    assert.equal(customTerm.name, "Net 90 Super Extended");
    assert.equal(customTerm.days, 90);

    // Set as default
    setDefaultPaymentTerm(businessId, customTerm.id);
    const refreshed = listPaymentTerms(businessId).find((t) => t.id === customTerm.id);
    assert.equal(refreshed?.is_default, 1);
  });

  await suite.test("4.C Email Templates & Dynamic Variable Token Interpolation", () => {
    const templates = listEmailTemplates(businessId);
    assert.ok(templates.length >= 7, "Expected seeded email templates");
    assert.ok(templates.some((t) => t.document_type === "sales_invoice" || t.document_type === "sales-invoice"));
    assert.ok(templates.some((t) => t.document_type === "sales_quote" || t.document_type === "sales-quote"));

    // Save custom email template
    const saved = saveEmailTemplate(businessId, "sales-invoice", {
      subject: "Invoice {{document_number}} - {{business_name}}",
      body: "Hi {{customer_name}}, please find invoice for {{total_amount}} due on {{due_date}}.",
    });
    assert.equal(saved.subject, "Invoice {{document_number}} - {{business_name}}");

    // Interpolate with real data
    const interpolated = interpolateEmailTemplate(saved, {
      customerName: "Apex Logistics",
      documentNumber: "INV-9921",
      businessName: "Gulf Corp",
      total: "AED 8,500.00",
      dueDate: "2026-11-30",
    });

    assert.equal(interpolated.subject, "Invoice INV-9921 - Gulf Corp");
    assert.equal(
      interpolated.body,
      "Hi Apex Logistics, please find invoice for AED 8,500.00 due on 2026-11-30."
    );

    // Reset template
    const reset = resetEmailTemplate(businessId, "sales-invoice");
    assert.ok(reset.subject.includes("Invoice"));
  });
});
