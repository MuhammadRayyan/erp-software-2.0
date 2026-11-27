import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-gratuity-")),
  BETTER_AUTH_SECRET: "gratuity-accrual-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { saveEmployee, savePayslip, voidPayslip, toggleEmployeeActive } = await import("../../src/modules/payroll/services/payroll-service");
const { calculateUaeEosb } = await import("../../src/modules/payroll/services/eosb-calculator");
const {
  previewGratuityAccrual,
  postGratuityAccrual,
  reverseGratuityAccrual,
  getGratuityProvisionBalances,
  listGratuityAccruals,
  GRATUITY_EXPENSE_ACCOUNT_ID,
  GRATUITY_PROVISION_ACCOUNT_ID,
} = await import("../../src/modules/payroll/services/gratuity-accrual-service");
const { setFinancialLockDate } = await import("../../src/modules/accounting/services/financial-lock-service");
const { getTrialBalance } = await import("../../src/modules/reports/report-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);

const ali = saveEmployee(businessId, adminId, { name: "Ali Hassan", code: "GR-1", joiningDate: "2033-01-01", basicSalaryMinor: 1_000_000 });
const bina = saveEmployee(businessId, adminId, { name: "Bina Rao", code: "GR-2", joiningDate: "2034-06-15", basicSalaryMinor: 600_000 });
const chen = saveEmployee(businessId, adminId, { name: "Chen Wei", code: "GR-3", joiningDate: "2025-01-01", basicSalaryMinor: 2_000_000 });

const eosb = (joiningDate: string, terminationDate: string, basicSalaryMinor: number) =>
  calculateUaeEosb({ joiningDate, terminationDate, basicSalaryMinor }).gratuityMinor;

function glBalance(accountId: string) {
  return (sqlite.prepare(`
    SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
    WHERE jl.account_id = ?
  `).get(accountId) as { balance: number }).balance;
}
const provisionGl = () => 0 - glBalance(GRATUITY_PROVISION_ACCOUNT_ID);
const accrualJournals = () => (sqlite.prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE source_type = 'gratuity_accrual'").get() as { c: number }).c;

function assertTiedAndBalanced() {
  const balances = getGratuityProvisionBalances(businessId, adminId);
  assert.equal(balances.subledgerMinor, balances.glMinor, "per-employee provision ties to the provision GL account");
  const tb = getTrialBalance(businessId, adminId);
  assert.equal(tb.debitMinor, tb.creditMinor, "trial balance stays balanced");
  return balances;
}

const janAli = eosb("2033-01-01", "2035-01-31", 1_000_000);
const janChen = eosb("2025-01-01", "2035-01-31", 2_000_000);

test("the monthly accrual books each employee's EOSB liability at month end from the statutory calculator", () => {
  const preview = previewGratuityAccrual(businessId, adminId, "2035-01");
  assert.equal(preview.accrualDate, "2035-01-31");
  const byId = new Map(preview.lines.map((line) => [line.employeeId, line]));
  assert.equal(byId.get(ali)!.liabilityMinor, janAli);
  assert.equal(byId.get(ali)!.amountMinor, janAli);
  assert.equal(byId.get(chen)!.liabilityMinor, janChen);
  assert.equal(byId.has(bina), false, "under one year of service accrues nothing under the calculator");
  assert.equal(preview.totalAmountMinor, janAli + janChen);

  const run = postGratuityAccrual(businessId, adminId, "2035-01");
  assert.equal(run.totalAmountMinor, janAli + janChen);
  const expense = sqlite.prepare("SELECT type FROM accounts WHERE id = ?").get(GRATUITY_EXPENSE_ACCOUNT_ID) as { type: string };
  const provision = sqlite.prepare("SELECT type FROM accounts WHERE id = ?").get(GRATUITY_PROVISION_ACCOUNT_ID) as { type: string };
  assert.deepEqual([expense.type, provision.type], ["expense", "liability"], "accounts are created on first use");
  assert.equal(glBalance(GRATUITY_EXPENSE_ACCOUNT_ID), janAli + janChen);
  assert.equal(provisionGl(), janAli + janChen);
  assertTiedAndBalanced();
});

test("re-running a month replaces its accrual instead of duplicating it", () => {
  const before = sqlite.prepare("SELECT journal_entry_id FROM gratuity_accruals WHERE period = '2035-01' AND status = 'posted'").get() as { journal_entry_id: string };
  postGratuityAccrual(businessId, adminId, "2035-01");
  assert.equal(accrualJournals(), 1);
  assert.equal(provisionGl(), janAli + janChen);

  // A salary correction is picked up by re-running the same month.
  saveEmployee(businessId, adminId, { id: ali, name: "Ali Hassan", code: "GR-1", joiningDate: "2033-01-01", basicSalaryMinor: 1_100_000 });
  const corrected = eosb("2033-01-01", "2035-01-31", 1_100_000);
  postGratuityAccrual(businessId, adminId, "2035-01");
  const after = sqlite.prepare("SELECT journal_entry_id FROM gratuity_accruals WHERE period = '2035-01' AND status = 'posted'").get() as { journal_entry_id: string };
  assert.equal(after.journal_entry_id, before.journal_entry_id, "the same journal is rewritten");
  assert.equal(accrualJournals(), 1);
  assert.equal(provisionGl(), corrected + janChen);
  saveEmployee(businessId, adminId, { id: ali, name: "Ali Hassan", code: "GR-1", joiningDate: "2033-01-01", basicSalaryMinor: 1_000_000 });
  postGratuityAccrual(businessId, adminId, "2035-01");
  assert.equal(provisionGl(), janAli + janChen);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS c FROM gratuity_accruals WHERE period = '2035-01'").get() as { c: number }).c, 1);
  assertTiedAndBalanced();
});

test("the next month books only the increase over the provision already booked", () => {
  const febAli = eosb("2033-01-01", "2035-02-28", 1_000_000);
  const febChen = eosb("2025-01-01", "2035-02-28", 2_000_000);
  const run = postGratuityAccrual(businessId, adminId, "2035-02");
  assert.equal(run.totalAmountMinor, (febAli - janAli) + (febChen - janChen));
  const lines = sqlite.prepare("SELECT employee_id, opening_provision_minor, amount_minor FROM gratuity_accrual_lines WHERE accrual_id = ?").all(run.id) as { employee_id: string; opening_provision_minor: number; amount_minor: number }[];
  assert.deepEqual(lines.find((line) => line.employee_id === ali), { employee_id: ali, opening_provision_minor: janAli, amount_minor: febAli - janAli });
  assert.equal(provisionGl(), febAli + febChen);
  assertTiedAndBalanced();

  assert.throws(() => postGratuityAccrual(businessId, adminId, "2035-01"), /Reverse later months/);
  assert.throws(() => reverseGratuityAccrual(businessId, adminId, "2035-01"), /Reverse later months/);
});

test("a month can be reversed and re-posted, and lock dates are respected", () => {
  const withFeb = provisionGl();
  reverseGratuityAccrual(businessId, adminId, "2035-02");
  assert.equal(provisionGl(), janAli + janChen, "the reversal undoes the month");
  assert.equal(listGratuityAccruals(businessId, adminId).find((run) => run.period === "2035-02")!.status, "reversed");
  assertTiedAndBalanced();

  setFinancialLockDate(businessId, adminId, "2035-02-28");
  try {
    assert.throws(() => postGratuityAccrual(businessId, adminId, "2035-02"), /closed/);
    assert.ok(previewGratuityAccrual(businessId, adminId, "2035-02").lockedReason);
  } finally {
    setFinancialLockDate(businessId, adminId, null);
  }
  postGratuityAccrual(businessId, adminId, "2035-02");
  assert.equal(provisionGl(), withFeb);

  setFinancialLockDate(businessId, adminId, "2035-02-28");
  try {
    assert.throws(() => reverseGratuityAccrual(businessId, adminId, "2035-02"), /closed/);
  } finally {
    setFinancialLockDate(businessId, adminId, null);
  }
  assertTiedAndBalanced();
});

let aliSettlementId = "";

test("a final-settlement payslip draws the gratuity from the provision, not expense again", () => {
  const provisionForAli = eosb("2033-01-01", "2035-02-28", 1_000_000);
  const paid = eosb("2033-01-01", "2035-03-15", 1_000_000);
  const expenseBefore = glBalance(GRATUITY_EXPENSE_ACCOUNT_ID);
  const salariesBefore = glBalance("acct-salaries-expense-6100");

  aliSettlementId = savePayslip(businessId, adminId, {
    employeeId: ali, date: "2035-03-15", periodDescription: "Final settlement",
    lines: [
      { itemId: "item-basic-salary", type: "earnings", description: "Basic Salary", accountId: "acct-salaries-expense-6100", amountMinor: 500_000 },
      { itemId: "item-eosb-gratuity", type: "earnings", description: "End of Service Gratuity", accountId: "acct-salaries-expense-6100", amountMinor: paid },
    ],
    autoPost: true,
  });
  const journal = sqlite.prepare(`
    SELECT jl.account_id, jl.debit_minor, jl.credit_minor FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_type = 'payslip' AND je.source_id = ?
  `).all(aliSettlementId) as { account_id: string; debit_minor: number; credit_minor: number }[];
  const debit = (accountId: string) => journal.filter((line) => line.account_id === accountId).reduce((sum, line) => sum + line.debit_minor, 0);
  assert.equal(debit(GRATUITY_PROVISION_ACCOUNT_ID), provisionForAli, "the booked provision is drawn down");
  assert.equal(debit("acct-salaries-expense-6100"), 500_000 + (paid - provisionForAli), "only the excess over the provision is expensed");
  assert.equal(glBalance(GRATUITY_EXPENSE_ACCOUNT_ID), expenseBefore, "gratuity expense is not charged again");
  assert.equal(glBalance("acct-salaries-expense-6100") - salariesBefore, 500_000 + paid - provisionForAli);
  assertTiedAndBalanced();

  // Chen is paid less than the booked provision and leaves too.
  savePayslip(businessId, adminId, {
    employeeId: chen, date: "2035-03-20", periodDescription: "Final settlement",
    lines: [{ itemId: "item-eosb-gratuity", type: "earnings", description: "End of Service Gratuity", accountId: "acct-salaries-expense-6100", amountMinor: 100_000 }],
    autoPost: true,
  });
  toggleEmployeeActive(businessId, adminId, ali, false);
  toggleEmployeeActive(businessId, adminId, chen, false);
});

test("after settlement the next accrual releases any leftover provision and never re-accrues", () => {
  const before = getGratuityProvisionBalances(businessId, adminId);
  const chenLeft = before.balances.find((row) => row.employeeId === chen)!.balanceMinor;
  assert.equal(before.balances.find((row) => row.employeeId === ali)!.balanceMinor, 0);
  assert.ok(chenLeft > 0);

  const preview = previewGratuityAccrual(businessId, adminId, "2035-03");
  assert.equal(preview.lines.some((line) => line.employeeId === ali), false, "a fully settled leaver has nothing to book");
  const chenLine = preview.lines.find((line) => line.employeeId === chen)!;
  assert.equal(chenLine.liabilityMinor, 0);
  assert.equal(chenLine.amountMinor, -chenLeft);

  const expenseBefore = glBalance(GRATUITY_EXPENSE_ACCOUNT_ID);
  postGratuityAccrual(businessId, adminId, "2035-03");
  assert.equal(glBalance(GRATUITY_EXPENSE_ACCOUNT_ID), expenseBefore - chenLeft, "the unused provision is released to expense");
  assert.equal(provisionGl(), 0, "no active employee has a liability at March end");
  assertTiedAndBalanced();
});

test("voiding a settlement payslip restores the provision it drew", () => {
  const before = getGratuityProvisionBalances(businessId, adminId).balances.find((row) => row.employeeId === ali)!.balanceMinor;
  voidPayslip(businessId, adminId, aliSettlementId);
  const after = assertTiedAndBalanced().balances.find((row) => row.employeeId === ali)!.balanceMinor;
  assert.equal(after - before, eosb("2033-01-01", "2035-02-28", 1_000_000));
});
