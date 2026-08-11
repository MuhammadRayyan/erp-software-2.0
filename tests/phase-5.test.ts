import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-phase-5-")),
  BETTER_AUTH_SECRET: "phase-5-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createBusiness } = await import("../src/core/businesses/business-service");
const { exportBusinessBackup, importBusinessBackup } = await import("../src/core/businesses/backup-service");
const { canAccessModule } = await import("../src/core/permissions/permissions");
const { importBankStatement } = await import("../src/modules/banking/statement-service");
const { confirmStatementMatch } = await import("../src/modules/banking/matching-service");
const { saveBankTransaction } = await import("../src/modules/banking/bank-transaction-service");
const { createBankTransfer } = await import("../src/modules/banking/bank-transfer-service");
const { getBankTransactionHistory } = await import("../src/modules/banking/banking-report-service");
const { startReconciliation, getReconciliationSnapshot, completeReconciliation } = await import("../src/modules/banking/reconciliation-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const standardId = seeded.standard.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const bank = sqlite.prepare("SELECT * FROM bank_accounts WHERE is_cash_account = 0 LIMIT 1").get() as { id: string; ledger_account_id: string };
const cash = sqlite.prepare("SELECT * FROM bank_accounts WHERE is_cash_account = 1 LIMIT 1").get() as { id: string; ledger_account_id: string };
const settings = sqlite.prepare("SELECT default_purchase_expense_account_id FROM business_accounting_settings WHERE id = 'default'").get() as { default_purchase_expense_account_id: string };
const noVat = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'out_of_scope' AND direction = 'both' LIMIT 1").get() as { id: string };
const vat = sqlite.prepare("SELECT id FROM tax_codes WHERE id = 'tax-uae-vat-5' LIMIT 1").get() as { id: string };
const income = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' ORDER BY code LIMIT 1").get() as { id: string };
const project = sqlite.prepare("SELECT id FROM projects WHERE status = 'active' LIMIT 1").get() as { id: string };

test("Phase 5 banking invariants", async (suite) => {
  await suite.test("Bank Account Book Balance is the mapped GL balance", () => {
    const expected = (sqlite.prepare(`
      SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
      FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.status = 'posted' AND jl.account_id = ?
    `).get(bank.ledger_account_id) as { balance: number }).balance;
    const actual = (sqlite.prepare(`
      SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
      FROM bank_accounts ba LEFT JOIN journal_lines jl ON jl.account_id = ba.ledger_account_id
      LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      WHERE ba.id = ?
    `).get(bank.id) as { balance: number }).balance;
    assert.equal(actual, expected);
  });

  await suite.test("CSV import stores lines, skips duplicates, and never creates journals", () => {
    const before = (sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count;
    const csv = "Date,Description,Reference,Amount,ID\n2026-08-01,Test deposit,T-1,10.00,PH5-1\n2026-08-02,Test fee,T-2,-5.00,PH5-2";
    const mapping = { date: "Date", valueDate: "", description: "Description", reference: "Reference", amount: "Amount", debit: "", credit: "", externalId: "ID" };
    const first = importBankStatement(businessId, adminId, bank.id, "phase-5.csv", csv, mapping);
    assert.equal(first.importedCount, 2);
    assert.equal(first.duplicateCount, 0);
    const second = importBankStatement(businessId, adminId, bank.id, "phase-5-repeat.csv", csv, mapping);
    assert.equal(second.importedCount, 0);
    assert.equal(second.duplicateCount, 2);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count, before);
  });

  await suite.test("existing Receipt and Supplier Payment are confirmed matches without duplicate journals", () => {
    const receiptLine = sqlite.prepare("SELECT id FROM bank_statement_lines WHERE external_id = 'DEMO-STMT-001'").get() as { id: string };
    const paymentLine = sqlite.prepare("SELECT id FROM bank_statement_lines WHERE external_id = 'DEMO-STMT-002'").get() as { id: string };
    const receipt = sqlite.prepare("SELECT id FROM receipts WHERE reference = 'DEMO-PARTIAL-RECEIPT'").get() as { id: string };
    const payment = sqlite.prepare("SELECT id FROM supplier_payments WHERE reference = 'DEMO-SUPPLIER-PARTIAL'").get() as { id: string };
    const before = (sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count;
    confirmStatementMatch(businessId, adminId, receiptLine.id, "receipt", receipt.id);
    confirmStatementMatch(businessId, adminId, paymentLine.id, "supplier_payment", payment.id);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count, before);
    assert.equal((sqlite.prepare("SELECT match_status FROM bank_statement_lines WHERE id = ?").get(receiptLine.id) as { match_status: string }).match_status, "matched");
  });

  await suite.test("existing Transfer is matched without another source document or journal", () => {
    const transferLine = sqlite.prepare("SELECT id FROM bank_statement_lines WHERE external_id = 'DEMO-STMT-004'").get() as { id: string };
    const transfer = sqlite.prepare("SELECT id FROM bank_transfers WHERE reference = 'DEMO-BANK-TRANSFER'").get() as { id: string };
    const beforeTransfers = (sqlite.prepare("SELECT COUNT(*) AS count FROM bank_transfers").get() as { count: number }).count;
    const beforeJournals = (sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count;
    confirmStatementMatch(businessId, adminId, transferLine.id, "bank_transfer", transfer.id);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM bank_transfers").get() as { count: number }).count, beforeTransfers);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count, beforeJournals);
  });

  await suite.test("unmatched lines create balanced expense and income Bank Transactions", () => {
    const expenseLine = sqlite.prepare("SELECT id FROM bank_statement_lines WHERE external_id = 'DEMO-STMT-003'").get() as { id: string };
    const expenseId = saveBankTransaction(businessId, adminId, {
      bankAccountId: bank.id, date: new Date().toISOString().slice(0, 10), type: "money_out",
      reference: "STMT-EXPENSE", description: "Office supplies", statementLineId: expenseLine.id,
      lines: [{ accountId: settings.default_purchase_expense_account_id, taxCodeId: vat.id,
        projectId: "", description: "Office supplies", amount: "105.00" }],
    }, "post");
    const expense = sqlite.prepare(`
      SELECT SUM(jl.debit_minor) AS debit, SUM(jl.credit_minor) AS credit
      FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.source_type = 'bank_transaction' AND je.source_id = ?
    `).get(expenseId) as { debit: number; credit: number };
    assert.deepEqual(expense, { debit: 10500, credit: 10500 });

    const csv = "Date,Description,Reference,Amount,ID\n2026-08-03,Other income,INC-1,52.50,PH5-INCOME";
    importBankStatement(businessId, adminId, bank.id, "phase-5-income.csv", csv,
      { date: "Date", valueDate: "", description: "Description", reference: "Reference", amount: "Amount", debit: "", credit: "", externalId: "ID" });
    const incomeLine = sqlite.prepare("SELECT id FROM bank_statement_lines WHERE external_id = 'PH5-INCOME'").get() as { id: string };
    const incomeId = saveBankTransaction(businessId, adminId, {
      bankAccountId: bank.id, date: "2026-08-03", type: "money_in", reference: "INC-1",
      description: "Other income", statementLineId: incomeLine.id,
      lines: [{ accountId: income.id, taxCodeId: vat.id, projectId: "", description: "Other income", amount: "52.50" }],
    }, "post");
    const incomeJournal = sqlite.prepare(`
      SELECT SUM(jl.debit_minor) AS debit, SUM(jl.credit_minor) AS credit
      FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.source_type = 'bank_transaction' AND je.source_id = ?
    `).get(incomeId) as { debit: number; credit: number };
    assert.equal(incomeJournal.debit, incomeJournal.credit);
  });

  await suite.test("Transfer uses one source and updates both Bank Account histories", () => {
    const transferId = createBankTransfer(businessId, adminId, {
      fromBankAccountId: bank.id, toBankAccountId: cash.id, date: "2026-08-04",
      amount: "1000.00", reference: "PH5-TRANSFER", description: "Cash funding",
    });
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries WHERE source_type = 'bank_transfer' AND source_id = ?").get(transferId) as { count: number }).count, 1);
    assert.ok(getBankTransactionHistory(businessId, adminId, bank.id).some((row) => row.source_id === transferId));
    assert.ok(getBankTransactionHistory(businessId, adminId, cash.id).some((row) => row.source_id === transferId));
  });

  await suite.test("Project-tagged bank expense updates ledger-derived Project cost", () => {
    const cost = () => (sqlite.prepare(`
      SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS total
      FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id AND a.type = 'expense'
      WHERE je.status = 'posted' AND jl.project_id = ?
    `).get(project.id) as { total: number }).total;
    const before = cost();
    saveBankTransaction(businessId, adminId, {
      bankAccountId: bank.id, date: "2026-08-05", type: "money_out", reference: "PH5-PROJECT",
      description: "Project site expense", statementLineId: "",
      lines: [{ accountId: settings.default_purchase_expense_account_id, taxCodeId: noVat.id,
        projectId: project.id, description: "Project site expense", amount: "25.00" }],
    }, "post");
    assert.equal(cost(), before + 2500);
  });

  await suite.test("reconciliation completes only at zero and never changes the ledger", () => {
    const probeId = startReconciliation(businessId, adminId, bank.id, { statementDate: "2026-12-31", statementEndingBalance: "0.00" });
    const probe = getReconciliationSnapshot(businessId, adminId, probeId, bank.id)!;
    assert.throws(() => completeReconciliation(businessId, adminId, bank.id, probeId), /Difference is zero/i);
    const ending = `${probe.clearedBookBalanceMinor < 0 ? "-" : ""}${Math.floor(Math.abs(probe.clearedBookBalanceMinor) / 100)}.${String(Math.abs(probe.clearedBookBalanceMinor) % 100).padStart(2, "0")}`;
    const reconciliationId = startReconciliation(businessId, adminId, bank.id, { statementDate: "2026-12-31", statementEndingBalance: ending });
    const before = (sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count;
    completeReconciliation(businessId, adminId, bank.id, reconciliationId);
    assert.equal((sqlite.prepare("SELECT status FROM bank_reconciliations WHERE id = ?").get(reconciliationId) as { status: string }).status, "completed");
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count, before);
  });

  await suite.test("Banking permissions and business isolation remain enforced", () => {
    assert.equal(canAccessModule(businessId, standardId, "banking"), false);
    const other = createBusiness({ name: "Phase 5 Isolated Business", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 1 }, adminId);
    assert.equal((getBusinessDb(other.id, adminId).sqlite.prepare("SELECT COUNT(*) AS count FROM bank_accounts").get() as { count: number }).count, 0);
  });

  await suite.test("business backup preserves Banking and completed reconciliation state", async () => {
    const expectedAccounts = (sqlite.prepare("SELECT COUNT(*) AS count FROM bank_accounts").get() as { count: number }).count;
    const expectedLines = (sqlite.prepare("SELECT COUNT(*) AS count FROM bank_statement_lines").get() as { count: number }).count;
    const expectedCompleted = (sqlite.prepare("SELECT COUNT(*) AS count FROM bank_reconciliations WHERE status = 'completed'").get() as { count: number }).count;
    const backup = await exportBusinessBackup(businessId, adminId);
    const importedId = await importBusinessBackup(Uint8Array.from(backup).buffer, adminId);
    const imported = getBusinessDb(importedId, adminId).sqlite;
    assert.equal((imported.prepare("SELECT COUNT(*) AS count FROM bank_accounts").get() as { count: number }).count, expectedAccounts);
    assert.equal((imported.prepare("SELECT COUNT(*) AS count FROM bank_statement_lines").get() as { count: number }).count, expectedLines);
    assert.equal((imported.prepare("SELECT COUNT(*) AS count FROM bank_reconciliations WHERE status = 'completed'").get() as { count: number }).count, expectedCompleted);
  });
});
