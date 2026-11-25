import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-split-match-")),
  BETTER_AUTH_SECRET: "split-match-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { importBankStatement } = await import("../../src/modules/banking/statement-service");
const { confirmStatementMatches, listUnmatchedMovements, resetStatementLine } = await import("../../src/modules/banking/matching-service");
const { startReconciliation, getReconciliationSnapshot, completeReconciliation } = await import("../../src/modules/banking/reconciliation-service");
const { createReceipt, voidReceipt } = await import("../../src/modules/receipts/receipt-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const bank = sqlite.prepare("SELECT id, ledger_account_id FROM bank_accounts WHERE is_cash_account = 0 LIMIT 1").get() as { id: string; ledger_account_id: string };
const customer = sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = 'AED' AND is_active = 1 ORDER BY name LIMIT 1").get() as { id: string };
const mapping = { date: "Date", valueDate: "", description: "Description", reference: "Reference", amount: "Amount", debit: "", credit: "", externalId: "ID" };

function receipt(amount: string, reference: string) {
  return createReceipt(businessId, adminId, {
    customerId: customer.id, date: "2035-02-03", bankAccountId: bank.ledger_account_id, amount, reference,
    description: "Split deposit part",
  });
}

function statementLine(externalId: string, amount: string) {
  importBankStatement(businessId, adminId, bank.id, `${externalId}.csv`,
    `Date,Description,Reference,Amount,ID\n2035-02-04,Cash deposit,DEP,${amount},${externalId}\n`, mapping);
  return (sqlite.prepare("SELECT id FROM bank_statement_lines WHERE external_id = ?").get(externalId) as { id: string }).id;
}

const isUnmatched = (sourceId: string) =>
  listUnmatchedMovements(businessId, adminId, bank.id).some((movement) => movement.sourceId === sourceId);

test("one deposit can clear several receipts, and only when they add up exactly", () => {
  const a = receipt("100.00", "SPLIT-A");
  const b = receipt("200.00", "SPLIT-B");
  const lineId = statementLine("SPLIT-DEP-1", "300.00");

  assert.throws(
    () => confirmStatementMatches(businessId, adminId, lineId, [{ sourceType: "receipt", sourceId: a.id }]),
    /does not match/,
  );
  confirmStatementMatches(businessId, adminId, lineId, [
    { sourceType: "receipt", sourceId: a.id },
    { sourceType: "receipt", sourceId: b.id },
  ]);

  const line = sqlite.prepare("SELECT match_status, matched_source_type FROM bank_statement_lines WHERE id = ?").get(lineId);
  assert.deepEqual(line, { match_status: "matched", matched_source_type: "multiple" });
  assert.equal(isUnmatched(a.id), false);
  assert.equal(isUnmatched(b.id), false);

  const otherLine = statementLine("SPLIT-DEP-2", "100.00");
  assert.throws(
    () => confirmStatementMatches(businessId, adminId, otherLine, [{ sourceType: "receipt", sourceId: a.id }]),
    /already matched/,
  );

  resetStatementLine(businessId, adminId, lineId);
  assert.equal(isUnmatched(a.id), true, "unmatching releases every entry of a split line");
  assert.equal(isUnmatched(b.id), true);
});

test("voiding one receipt of a split match returns the whole line to unmatched", () => {
  const a = receipt("40.00", "VOID-A");
  const b = receipt("60.00", "VOID-B");
  const lineId = statementLine("SPLIT-DEP-3", "100.00");
  confirmStatementMatches(businessId, adminId, lineId, [
    { sourceType: "receipt", sourceId: a.id },
    { sourceType: "receipt", sourceId: b.id },
  ]);
  voidReceipt(businessId, adminId, a.id);
  const line = sqlite.prepare("SELECT match_status FROM bank_statement_lines WHERE id = ?").get(lineId) as { match_status: string };
  assert.equal(line.match_status, "unmatched");
  assert.equal(isUnmatched(b.id), true);
});

test("a completed reconciliation clears every entry of a split line and locks it", () => {
  const a = receipt("15.00", "RECON-A");
  const b = receipt("25.00", "RECON-B");
  const lineId = statementLine("SPLIT-DEP-4", "40.00");
  confirmStatementMatches(businessId, adminId, lineId, [
    { sourceType: "receipt", sourceId: a.id },
    { sourceType: "receipt", sourceId: b.id },
  ]);

  const draft = startReconciliation(businessId, adminId, bank.id, { statementDate: "2035-02-28", statementEndingBalance: "0" });
  const snapshot = getReconciliationSnapshot(businessId, adminId, draft, bank.id)!;
  const clearedForLine = snapshot.cleared.filter((row) => row.statement_line_id === lineId);
  assert.deepEqual(clearedForLine.map((row) => row.matched_source_id).sort(), [a.id, b.id].sort());
  assert.ok(!snapshot.outstanding.some((row) => row.source_id === a.id || row.source_id === b.id));

  // Force a zero difference so the reconciliation can complete.
  sqlite.prepare("UPDATE bank_reconciliations SET statement_ending_balance_minor = ? WHERE id = ?")
    .run(snapshot.clearedBookBalanceMinor, draft);
  completeReconciliation(businessId, adminId, bank.id, draft);
  const items = sqlite.prepare("SELECT COUNT(*) AS count FROM bank_reconciliation_items WHERE statement_line_id = ?").get(lineId) as { count: number };
  assert.equal(items.count, 2);
  assert.throws(() => voidReceipt(businessId, adminId, a.id), /completed bank reconciliation/);
});
