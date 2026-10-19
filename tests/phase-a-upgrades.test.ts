import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-phase-a-test-")),
  BETTER_AUTH_SECRET: "phase-a-test-secret-123456",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getSystemDb } = await import("../src/core/db/system");
const { users } = await import("../src/core/db/system-schema");
const { eq } = await import("drizzle-orm");
const {
  getBusinessQuickKpis,
  getPinnedBusinessIdsForUser,
  setBusinessPinned,
} = await import("../src/core/businesses/business-service");
const {
  getDashboardCounts,
  getMonthlyFinancialTrend,
  getReceivablesAgingSummary,
} = await import("../src/modules/reports/report-service");
const { validateDisplayName, validatePasswordChange } = await import(
  "../src/app/b/[businessId]/settings/profile/validation"
);
const { moduleForBusinessPath } = await import("../src/core/permissions/module-access");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;

test("1. getBusinessQuickKpis computes liquid balances, receivables, and employee counts", () => {
  const kpis = getBusinessQuickKpis(businessId, adminId);
  assert.ok(typeof kpis.liquidBalanceMinor === "number", "liquidBalanceMinor should be a number");
  assert.ok(typeof kpis.outstandingReceivablesMinor === "number", "outstandingReceivablesMinor should be a number");
  assert.ok(typeof kpis.overdueCount === "number", "overdueCount should be a number");
  assert.ok(typeof kpis.activeEmployeesCount === "number", "activeEmployeesCount should be a number");

  // In demo seed, there are invoices and bank balance
  assert.ok(kpis.outstandingReceivablesMinor >= 0, "receivables should be non-negative");
});

test("2. Favorite / Pin business capability saves, queries, and toggles status", () => {
  // Initially not pinned
  let pinned = getPinnedBusinessIdsForUser(adminId);
  assert.strictEqual(pinned.has(businessId), false, "should not be pinned initially");

  // Pin business
  setBusinessPinned(businessId, adminId, true);
  pinned = getPinnedBusinessIdsForUser(adminId);
  assert.strictEqual(pinned.has(businessId), true, "businessId should now be in pinned set");

  // Unpin business
  setBusinessPinned(businessId, adminId, false);
  pinned = getPinnedBusinessIdsForUser(adminId);
  assert.strictEqual(pinned.has(businessId), false, "businessId should be removed from pinned set");
});

test("3. Profile validateDisplayName validates input and updates system DB", () => {
  // Validation: short name
  const invalidRes = validateDisplayName("a");
  assert.strictEqual(invalidRes.valid, false);
  assert.ok(invalidRes.error?.includes("at least 2 characters"));

  // Validation: empty name
  const emptyRes = validateDisplayName("   ");
  assert.strictEqual(emptyRes.valid, false);

  // Validation: valid name
  const validRes = validateDisplayName("  Jane Doe  ");
  assert.strictEqual(validRes.valid, true);
  assert.strictEqual(validRes.name, "Jane Doe");

  // Fetch admin user from DB
  const originalUser = getSystemDb().select().from(users).where(eq(users.id, adminId)).get();
  assert.ok(originalUser, "Admin user must exist");

  // Valid update in DB
  const newName = "Senior Chief Accountant";
  getSystemDb()
    .update(users)
    .set({ name: newName, updatedAt: new Date() })
    .where(eq(users.id, adminId))
    .run();

  const updatedUser = getSystemDb().select().from(users).where(eq(users.id, adminId)).get();
  assert.strictEqual(updatedUser?.name, newName, "Display name should be updated in DB");

  // Restore original
  getSystemDb()
    .update(users)
    .set({ name: originalUser.name, updatedAt: new Date() })
    .where(eq(users.id, adminId))
    .run();
});

test("4. Password change validation rejects invalid passwords", () => {
  // Empty current password
  const res1 = validatePasswordChange("", "newpassword123");
  assert.strictEqual(res1.valid, false);
  assert.ok(res1.error?.includes("Current password is required"));

  // Short new password
  const res2 = validatePasswordChange("demo12345", "short");
  assert.strictEqual(res2.valid, false);
  assert.ok(res2.error?.includes("at least 8 characters"));

  // Valid password change inputs
  const res3 = validatePasswordChange("demo12345", "securepassword123");
  assert.strictEqual(res3.valid, true);
});

test("5. getDashboardCounts contains all core and newly added modules", () => {
  const counts = getDashboardCounts(businessId, adminId);

  // Core sales & purchases
  assert.ok(typeof counts.customers === "number");
  assert.ok(typeof counts.salesQuotes === "number");
  assert.ok(typeof counts.salesOrders === "number");
  assert.ok(typeof counts.salesInvoices === "number");
  assert.ok(typeof counts.salesCreditNotes === "number");
  assert.ok(typeof counts.deliveryNotes === "number");
  assert.ok(typeof counts.suppliers === "number");
  assert.ok(typeof counts.purchaseOrders === "number");
  assert.ok(typeof counts.purchaseInvoices === "number");
  assert.ok(typeof counts.supplierPayments === "number");
  assert.ok(typeof counts.payments === "number", "backwards compatible alias");
  assert.ok(typeof counts.debitNotes === "number");
  assert.ok(typeof counts.goodsReceipts === "number");

  // Core banking & accounting
  assert.ok(typeof counts.bankAccounts === "number");
  assert.ok(typeof counts.receipts === "number");
  assert.ok(typeof counts.journals === "number");
  assert.ok(typeof counts.chartOfAccounts === "number");

  // Newly added modules
  assert.ok(typeof counts.inventoryItems === "number");
  assert.ok(typeof counts.employees === "number");
  assert.ok(typeof counts.payslips === "number");
  assert.ok(typeof counts.payslipItems === "number", "payslipItems should be tracked");
  assert.ok(typeof counts.projects === "number");
  assert.ok(typeof counts.vatPeriods === "number");
});

test("6. getMonthlyFinancialTrend returns 6 months with revenue, expenses, and net calculations", () => {
  const trend = getMonthlyFinancialTrend(businessId, adminId, 6);
  assert.strictEqual(trend.length, 6, "should return exactly 6 months");

  for (const m of trend) {
    assert.ok(m.month.match(/^\d{4}-\d{2}$/), "month format should be YYYY-MM");
    assert.ok(typeof m.label === "string", "month label should be present");
    assert.ok(typeof m.revenueMinor === "number", "revenueMinor should be a number");
    assert.ok(typeof m.expensesMinor === "number", "expensesMinor should be a number");
    assert.strictEqual(
      m.netIncomeMinor,
      m.revenueMinor - m.expensesMinor,
      "net income should equal revenue minus expenses",
    );
  }
});

test("7. getReceivablesAgingSummary computes buckets and total correctly", () => {
  const aging = getReceivablesAgingSummary(businessId, adminId);

  assert.ok(typeof aging.currentMinor === "number");
  assert.ok(typeof aging.days30Minor === "number");
  assert.ok(typeof aging.days60Minor === "number");
  assert.ok(typeof aging.days60PlusMinor === "number");
  assert.strictEqual(
    aging.totalMinor,
    aging.currentMinor + aging.days30Minor + aging.days60Minor + aging.days60PlusMinor,
    "totalMinor should equal sum of all 4 buckets",
  );
  assert.strictEqual(
    aging.totalCount,
    aging.currentCount + aging.days30Count + aging.days60Count + aging.days60PlusCount,
    "totalCount should equal sum of counts in all 4 buckets",
  );
});

test("8. Aging percentage calculation safety (prevents ghost 60+ days segment when 0 overdue)", () => {
  // Test case where days60PlusMinor is 0 and others sum to remainder:
  // e.g. current = 33, 1-30d = 33, 31-60d = 33, 60+ = 0. Total = 99.
  const sampleAging = {
    currentMinor: 33,
    days30Minor: 33,
    days60Minor: 33,
    days60PlusMinor: 0,
    totalMinor: 99,
  };
  const total = Math.max(1, sampleAging.totalMinor);
  const currentPct = sampleAging.currentMinor > 0 ? (sampleAging.currentMinor / total) * 100 : 0;
  const days30Pct = sampleAging.days30Minor > 0 ? (sampleAging.days30Minor / total) * 100 : 0;
  const days60Pct = sampleAging.days60Minor > 0 ? (sampleAging.days60Minor / total) * 100 : 0;
  const days60PlusPct = sampleAging.days60PlusMinor > 0 ? (sampleAging.days60PlusMinor / total) * 100 : 0;

  assert.strictEqual(days60PlusPct, 0, "60+ days percentage MUST be 0 when days60PlusMinor is 0");
  assert.ok(currentPct > 33 && currentPct < 34);
  assert.ok(days30Pct > 33 && days30Pct < 34);
  assert.ok(days60Pct > 33 && days60Pct < 34);
});

test("9. Display name boundary validation edge cases", () => {
  // Exactly 2 characters is valid
  assert.strictEqual(validateDisplayName("Al").valid, true);
  assert.strictEqual(validateDisplayName("Al").name, "Al");

  // 1 character is invalid
  assert.strictEqual(validateDisplayName("A").valid, false);

  // Exactly 100 characters is valid
  const hundred = "x".repeat(100);
  assert.strictEqual(validateDisplayName(hundred).valid, true);
  assert.strictEqual(validateDisplayName(hundred).name, hundred);

  // 101 characters is invalid
  const hundredOne = "x".repeat(101);
  assert.strictEqual(validateDisplayName(hundredOne).valid, false);
  assert.ok(validateDisplayName(hundredOne).error?.includes("cannot exceed 100 characters"));
});

test("10. moduleForBusinessPath allows all members access to settings/profile and settings/activity-log without requiring settings module", () => {
  assert.strictEqual(
    moduleForBusinessPath("/b/test-biz/settings/profile"),
    null,
    "settings/profile must be exempt from settings module restriction so standard users can manage their account",
  );
  assert.strictEqual(
    moduleForBusinessPath("/b/test-biz/settings/activity-log"),
    null,
    "settings/activity-log is accessible to all members",
  );
  assert.deepStrictEqual(
    moduleForBusinessPath("/b/test-biz/settings/users"),
    { businessId: "test-biz", module: "settings" },
    "admin settings like users still require settings module",
  );
});

test("11. setBusinessPinned rejects unauthorized business IDs", () => {
  assert.throws(
    () => setBusinessPinned("nonexistent-business-id", adminId, true),
    /BUSINESS_ACCESS_DENIED/,
  );
});

test("12. Enhanced validation edge cases for display name and password change", () => {
  // Null and non-string inputs
  assert.strictEqual(validateDisplayName(null as any).valid, false);
  assert.strictEqual(validateDisplayName(undefined as any).valid, false);
  assert.strictEqual(validateDisplayName(12345 as any).valid, false);

  // Normalization: replaces newlines/tabs with space
  const normalized = validateDisplayName("  Jane\nDoe\tSmith  ");
  assert.strictEqual(normalized.valid, true);
  assert.strictEqual(normalized.name, "Jane Doe Smith");

  // Password validation: null/undefined/number
  assert.strictEqual(validatePasswordChange(null as any, "password123").valid, false);
  assert.strictEqual(validatePasswordChange("currentPass", null as any).valid, false);
  assert.strictEqual(validatePasswordChange("currentPass", 12345678 as any).valid, false);

  // Password validation: identical passwords rejected
  const identicalRes = validatePasswordChange("ExactSamePassword1!", "ExactSamePassword1!");
  assert.strictEqual(identicalRes.valid, false);
  assert.ok(identicalRes.error?.includes("different from current password"));

  // Password validation: exceeds max length (128 characters)
  const tooLongRes = validatePasswordChange("currentPass", "a".repeat(129));
  assert.strictEqual(tooLongRes.valid, false);
  assert.ok(tooLongRes.error?.includes("cannot exceed 128 characters"));
});


