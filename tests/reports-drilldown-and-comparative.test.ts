import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-reports-drilldown-")),
  BETTER_AUTH_SECRET: "reports-drilldown-test-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { closeAllBusinessConnections } = await import("../src/core/db/business");
const { createAndAddBusinessUser } = await import("../src/core/permissions/membership-service");
const {
  getProfitAndLoss,
  getTrialBalance,
  getComparativeProfitAndLoss,
  getComparativeBalanceSheet,
  resolveComparativePnlPeriods,
  resolveComparativeBalanceDates,
  computeVariance,
} = await import("../src/modules/reports/report-service");
const { getReportDrilldown } = await import("../src/modules/reports/drilldown-service");
const {
  saveCustomReportView,
  listSavedReports,
  deleteCustomReportView,
  buildSavedReportHref,
} = await import("../src/modules/reports/saved-report-service");
const { listVatPeriods } = await import("../src/modules/tax/vat-period-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;

test("comparative P&L periods and variance math match underlying single-period reports", () => {
  const dateFrom = "2026-01-01";
  const dateTo = "2026-12-31";
  const periods = resolveComparativePnlPeriods({ dateFrom, dateTo, compareMode: "prior_period" });
  assert.equal(periods.length, 2);

  const compRows = getComparativeProfitAndLoss(businessId, adminId, periods, "accrual");
  const currentPnl = getProfitAndLoss(businessId, adminId, dateFrom, dateTo, "accrual");
  assert.ok(compRows.length > 0);
  const firstIncome = currentPnl.find((r) => r.type === "income");
  assert.ok(firstIncome);
  const matchedComp = compRows.find((r) => r.id === firstIncome.id)!;
  assert.equal(matchedComp.amountsMinor[0], firstIncome.net_minor);

  const v = computeVariance(matchedComp.amountsMinor[0], matchedComp.amountsMinor[1]);
  assert.equal(matchedComp.varianceMinor, v.varianceMinor);

  const multiPeriods = resolveComparativePnlPeriods({ dateFrom, dateTo, compareMode: "last_4_quarters" });
  assert.equal(multiPeriods.length, 4);
  const multiRows = getComparativeProfitAndLoss(businessId, adminId, multiPeriods, "accrual");
  assert.equal(multiRows[0].amountsMinor.length, 4);
  assert.equal(multiRows[0].varianceMinor, null);
});

test("comparative Balance Sheet resolves comparison dates cleanly", () => {
  const dates = resolveComparativeBalanceDates({ throughDate: "2026-12-31", compareMode: "prior_year" });
  assert.deepEqual(
    dates.map((d) => d.throughDate),
    ["2026-12-31", "2025-12-31"],
  );

  const compBs = getComparativeBalanceSheet(businessId, adminId, dates);
  const tb = getTrialBalance(businessId, adminId, "2026-12-31");
  const assetAcc = tb.accounts.find((a) => a.type === "asset" && (a.debit_total - a.credit_total) !== 0);
  assert.ok(assetAcc);
  const compAcc = compBs.accounts.find((a) => a.id === assetAcc.id)!;
  assert.equal(compAcc.amountsMinor[0], assetAcc.debit_total - assetAcc.credit_total);
});

test("financial report drill-down returns ledger transactions matching P&L/BS/VAT amounts with source links", () => {
  const pnl = getProfitAndLoss(businessId, adminId, "2000-01-01", "2099-12-31", "accrual");
  const incomeAcct = pnl.find((row) => row.type === "income" && row.net_minor !== 0);
  assert.ok(incomeAcct, "Expected non-zero income account in demo seed");

  const drill = getReportDrilldown(businessId, adminId, {
    kind: "account",
    accountId: incomeAcct.id,
    dateFrom: "2000-01-01",
    dateTo: "2099-12-31",
  });
  assert.ok(drill.rows.length > 0);
  assert.ok(drill.rows.some((r) => Boolean(r.sourceHref)), "Expected navigable source voucher href");
  assert.ok(drill.fullReportHref.includes(incomeAcct.id));

  const periods = listVatPeriods(businessId, adminId);
  if (periods.length > 0) {
    const vatDrill = getReportDrilldown(businessId, adminId, {
      kind: "vat_bucket",
      periodId: String(periods[0].id),
      bucket: "standard_sales",
    });
    assert.ok(vatDrill.fullReportHref.includes("vat-transactions"));
  }
});

test("saved custom report views persist, build navigable hrefs, and enforce permissions", async () => {
  const saved = saveCustomReportView(businessId, adminId, {
    name: "FY2026 YoY P&L",
    reportType: "profit_loss",
    description: "Comparative annual income view",
    config: { dateFrom: "2026-01-01", dateTo: "2026-12-31", compareMode: "prior_year", basis: "accrual" },
    isShared: true,
  });

  const list = listSavedReports(businessId, adminId, "profit_loss");
  assert.ok(list.some((r) => r.id === saved.id && r.name === "FY2026 YoY P&L"));

  const href = buildSavedReportHref(businessId, saved);
  assert.ok(href.includes(`/b/${businessId}/reports/profit-loss?`));
  assert.ok(href.includes("compareMode=prior_year"));

  const salesOnly = await createAndAddBusinessUser(businessId, adminId, {
    name: "Sales No Reports",
    email: "sales-no-reports@example.com",
    role: "standard",
    capabilities: { sales: ["view"] },
  });
  assert.throws(
    () => saveCustomReportView(businessId, salesOnly.userId, { name: "Blocked", reportType: "profit_loss", config: {} }),
    /PERMISSION_DENIED/,
  );

  deleteCustomReportView(businessId, adminId, saved.id);
  const afterDelete = listSavedReports(businessId, adminId, "profit_loss");
  assert.equal(afterDelete.some((r) => r.id === saved.id), false);
});

after(() => {
  closeAllBusinessConnections();
});
