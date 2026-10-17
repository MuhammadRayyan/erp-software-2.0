import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-bank-rules-")),
  BETTER_AUTH_SECRET: "bank-rules-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { importBankStatement, listStatementLines } = await import("../src/modules/banking/statement-service");
const {
  createBankRule,
  listBankRules,
  getBankRule,
  updateBankRule,
  deleteBankRule,
  toggleBankRuleActive,
  matchRuleAgainstLine,
  findMatchingBankRule,
  applyBankRule,
  batchApplyBankRules,
  getRuleMatchesCount,
} = await import("../src/modules/banking/bank-rule-service");
const { voidBankTransaction, getBankTransaction } = await import("../src/modules/banking/bank-transaction-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);

const bank = sqlite.prepare("SELECT * FROM bank_accounts WHERE is_cash_account = 0 LIMIT 1").get() as {
  id: string;
  name: string;
  ledger_account_id: string;
};
const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' ORDER BY name LIMIT 1").get() as {
  id: string;
};
const taxCode5 = sqlite.prepare("SELECT id FROM tax_codes WHERE id = 'tax-uae-vat-5' LIMIT 1").get() as {
  id: string;
};
const taxCodeZero = sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1").get() as {
  id: string;
};

test("Bank Rules Engine & Auto-Categorization", async (suite) => {
  await suite.test("1. Bank Rule CRUD operations", () => {
    // Create rule
    const ruleId = createBankRule(businessId, adminId, {
      name: "DEWA Electricity",
      direction: "money_out",
      matchField: "description",
      matchType: "contains",
      matchText: "DEWA",
      bankAccountId: bank.id,
      targetAccountId: expenseAccount.id,
      targetTaxCodeId: taxCode5.id,
      autoDescription: "Monthly DEWA Utility Bill",
      isActive: true,
    });

    assert.ok(ruleId);

    // Get rule
    const fetched = getBankRule(businessId, adminId, ruleId);
    assert.ok(fetched);
    assert.equal(fetched.name, "DEWA Electricity");
    assert.equal(fetched.direction, "money_out");
    assert.equal(fetched.match_field, "description");
    assert.equal(fetched.match_type, "contains");
    assert.equal(fetched.match_text, "DEWA");
    assert.equal(fetched.target_account_id, expenseAccount.id);
    assert.equal(fetched.target_tax_code_id, taxCode5.id);
    assert.equal(fetched.auto_description, "Monthly DEWA Utility Bill");
    assert.equal(fetched.is_active, 1);

    // List rules
    const allRules = listBankRules(businessId, adminId);
    assert.ok(allRules.some((r) => r.id === ruleId));

    // Update rule
    updateBankRule(businessId, adminId, ruleId, {
      name: "DEWA Electricity & Water",
      direction: "money_out",
      matchField: "description",
      matchType: "contains",
      matchText: "DEWA DUBAI",
      bankAccountId: null, // all accounts
      targetAccountId: expenseAccount.id,
      targetTaxCodeId: taxCodeZero.id,
      autoDescription: "DEWA Electricity & Water Payment",
      isActive: true,
    });

    const updated = getBankRule(businessId, adminId, ruleId);
    assert.equal(updated?.name, "DEWA Electricity & Water");
    assert.equal(updated?.match_text, "DEWA DUBAI");
    assert.equal(updated?.bank_account_id, null);

    // Toggle active
    toggleBankRuleActive(businessId, adminId, ruleId, false);
    const toggledOff = getBankRule(businessId, adminId, ruleId);
    assert.equal(toggledOff?.is_active, 0);

    toggleBankRuleActive(businessId, adminId, ruleId, true);
    const toggledOn = getBankRule(businessId, adminId, ruleId);
    assert.equal(toggledOn?.is_active, 1);

    // Delete rule
    deleteBankRule(businessId, adminId, ruleId);
    const afterDelete = getBankRule(businessId, adminId, ruleId);
    assert.equal(afterDelete, undefined);
  });

  await suite.test("2. Pattern matching engine (contains, exact, starts_with, direction, reference)", () => {
    const ruleContains = {
      id: "r-1",
      name: "DEWA",
      rule_order: 10,
      direction: "money_out" as const,
      match_field: "description" as const,
      match_type: "contains" as const,
      match_text: "DEWA",
      bank_account_id: null,
      target_account_id: expenseAccount.id,
      target_tax_code_id: null,
      auto_description: null,
      is_active: 1,
      created_at: "",
      updated_at: "",
    };

    const ruleExact = {
      ...ruleContains,
      id: "r-2",
      match_type: "exact" as const,
      match_text: "BANK SERVICE CHARGE",
    };

    const ruleStartsWith = {
      ...ruleContains,
      id: "r-3",
      match_type: "starts_with" as const,
      match_text: "SALIK",
    };

    const ruleRef = {
      ...ruleContains,
      id: "r-4",
      match_field: "reference" as const,
      match_type: "contains" as const,
      match_text: "REF999",
    };

    const ruleMoneyIn = {
      ...ruleContains,
      id: "r-5",
      direction: "money_in" as const,
      match_text: "INTEREST",
    };

    // Test contains (case-insensitive)
    assert.equal(
      matchRuleAgainstLine(ruleContains, {
        description: "POS PAYMENT - DEWA DUBAI GOVT",
        amount_minor: -45000,
        bank_account_id: bank.id,
      }),
      true,
    );
    assert.equal(
      matchRuleAgainstLine(ruleContains, {
        description: "ETISALAT TELECOM",
        amount_minor: -45000,
        bank_account_id: bank.id,
      }),
      false,
    );

    // Test exact
    assert.equal(
      matchRuleAgainstLine(ruleExact, {
        description: "Bank Service Charge",
        amount_minor: -1500,
        bank_account_id: bank.id,
      }),
      true,
    );
    assert.equal(
      matchRuleAgainstLine(ruleExact, {
        description: "Bank Service Charge August",
        amount_minor: -1500,
        bank_account_id: bank.id,
      }),
      false,
    );

    // Test starts_with
    assert.equal(
      matchRuleAgainstLine(ruleStartsWith, {
        description: "SALIK RECHARGE AUTO",
        amount_minor: -10000,
        bank_account_id: bank.id,
      }),
      true,
    );
    assert.equal(
      matchRuleAgainstLine(ruleStartsWith, {
        description: "AUTO SALIK RECHARGE",
        amount_minor: -10000,
        bank_account_id: bank.id,
      }),
      false,
    );

    // Test reference matching
    assert.equal(
      matchRuleAgainstLine(ruleRef, {
        description: "Vendor transfer",
        reference: "INV-REF999-XYZ",
        amount_minor: -5000,
        bank_account_id: bank.id,
      }),
      true,
    );
    assert.equal(
      matchRuleAgainstLine(ruleRef, {
        description: "Vendor transfer REF999",
        reference: "OTHER-REF",
        amount_minor: -5000,
        bank_account_id: bank.id,
      }),
      false,
    );

    // Test direction filtering
    assert.equal(
      matchRuleAgainstLine(ruleMoneyIn, {
        description: "CREDIT INTEREST PAYMENT",
        amount_minor: 1250, // deposit
        bank_account_id: bank.id,
      }),
      true,
    );
    assert.equal(
      matchRuleAgainstLine(ruleMoneyIn, {
        description: "CREDIT INTEREST PAYMENT",
        amount_minor: -1250, // withdrawal
        bank_account_id: bank.id,
      }),
      false,
    );
  });

  await suite.test("3. Single statement line application creates Bank Transaction and matches line", () => {
    // 1. Create a bank rule
    const ruleId = createBankRule(businessId, adminId, {
      name: "Etisalat Office Internet",
      direction: "money_out",
      matchField: "description",
      matchType: "contains",
      matchText: "ETISALAT",
      bankAccountId: bank.id,
      targetAccountId: expenseAccount.id,
      targetTaxCodeId: taxCode5.id,
      autoDescription: "Monthly Fiber Internet Service",
      isActive: true,
    });

    // 2. Import a bank statement line matching the rule
    const csv = "Date,Description,Reference,Amount,ID\n2026-08-10,POS ETISALAT BILL PAYMENT,ETI-881,-367.50,STMT-ETI-1";
    const mapping = {
      date: "Date",
      valueDate: "",
      description: "Description",
      reference: "Reference",
      amount: "Amount",
      debit: "",
      credit: "",
      externalId: "ID",
    };
    importBankStatement(businessId, adminId, bank.id, "etisalat-test.csv", csv, mapping);

    const lines = listStatementLines(businessId, adminId, bank.id);
    const line = lines.find((l) => l.external_id === "STMT-ETI-1");
    assert.ok(line);
    assert.equal(line.match_status, "unmatched");

    // 3. Verify findMatchingBankRule finds the rule
    const rules = listBankRules(businessId, adminId, bank.id);
    const matched = findMatchingBankRule(rules, line);
    assert.ok(matched);
    assert.equal(matched.id, ruleId);

    // 4. Apply the rule
    const { transactionId } = applyBankRule(businessId, adminId, ruleId, line.id);
    assert.ok(transactionId);

    // 5. Verify the statement line is now 'created' and linked
    const reloadedLine = listStatementLines(businessId, adminId, bank.id).find((l) => l.id === line.id);
    assert.equal(reloadedLine?.match_status, "created");
    assert.equal(reloadedLine?.matched_source_type, "bank_transaction");
    assert.equal(reloadedLine?.matched_source_id, transactionId);

    // 6. Verify the created Bank Transaction
    const tx = getBankTransaction(businessId, adminId, transactionId);
    assert.ok(tx);
    assert.equal(tx.transaction.document_status, "posted");
    assert.equal(tx.transaction.type, "money_out");
    assert.equal(tx.transaction.total_minor, 36750);
    assert.equal(tx.transaction.description, "Monthly Fiber Internet Service");
    assert.equal(tx.transaction.statement_line_id, line.id);
    assert.equal(tx.lines.length, 1);
    assert.equal(tx.lines[0].account_id, expenseAccount.id);

    // 7. Verify GL entries
    const journal = sqlite.prepare(`
      SELECT * FROM journal_entries WHERE source_type = 'bank_transaction' AND source_id = ?
    `).get(transactionId) as { id: string; status: string };
    assert.ok(journal);
    assert.equal(journal.status, "posted");

    const journalLines = sqlite.prepare(`
      SELECT * FROM journal_lines WHERE journal_entry_id = ?
    `).all(journal.id) as { account_id: string; debit_minor: number; credit_minor: number }[];
    
    // Credit bank ledger account
    const bankCredit = journalLines.find((jl) => jl.account_id === bank.ledger_account_id);
    assert.ok(bankCredit);
    assert.equal(bankCredit.credit_minor, 36750);

    // Clean up rule
    deleteBankRule(businessId, adminId, ruleId);
  });

  await suite.test("4. Batch auto-categorization across multiple statement lines", () => {
    // 1. Create 2 rules: ADNOC Fuel and Bank Charge
    const fuelRuleId = createBankRule(businessId, adminId, {
      name: "ADNOC Fuel",
      direction: "money_out",
      matchField: "description",
      matchType: "contains",
      matchText: "ADNOC",
      targetAccountId: expenseAccount.id,
      targetTaxCodeId: taxCode5.id,
      autoDescription: "Vehicle Fuel - ADNOC",
      isActive: true,
    });

    const feeRuleId = createBankRule(businessId, adminId, {
      name: "Bank Monthly Fee",
      direction: "money_out",
      matchField: "description",
      matchType: "contains",
      matchText: "SERVICE CHARGE",
      targetAccountId: expenseAccount.id,
      targetTaxCodeId: taxCodeZero.id,
      autoDescription: "Bank Account Monthly Maintenance Fee",
      isActive: true,
    });

    // 2. Import CSV with 4 lines: 2 matching fuel, 1 matching fee, 1 unmatched misc
    const csv = [
      "Date,Description,Reference,Amount,ID",
      "2026-08-11,ADNOC STATION 812,TX-101,-150.00,STMT-BATCH-1",
      "2026-08-12,ADNOC STATION 405,TX-102,-200.00,STMT-BATCH-2",
      "2026-08-13,MONTHLY SERVICE CHARGE,TX-103,-25.00,STMT-BATCH-3",
      "2026-08-14,OFFICE FURNITURE L.L.C.,TX-104,-3000.00,STMT-BATCH-4",
    ].join("\n");

    const mapping = {
      date: "Date",
      valueDate: "",
      description: "Description",
      reference: "Reference",
      amount: "Amount",
      debit: "",
      credit: "",
      externalId: "ID",
    };
    importBankStatement(businessId, adminId, bank.id, "batch-test.csv", csv, mapping);

    // 3. Test getRuleMatchesCount
    const countResult = getRuleMatchesCount(businessId, adminId, bank.id);
    assert.ok(countResult.ruleMatchesCount >= 3);

    // 4. Run batch auto-categorization
    const batchResult = batchApplyBankRules(businessId, adminId, bank.id);
    assert.ok(batchResult.appliedCount >= 3);

    // 5. Verify the 3 matching lines are now 'created' and the misc line is still 'unmatched'
    const lines = listStatementLines(businessId, adminId, bank.id);
    const line1 = lines.find((l) => l.external_id === "STMT-BATCH-1");
    const line2 = lines.find((l) => l.external_id === "STMT-BATCH-2");
    const line3 = lines.find((l) => l.external_id === "STMT-BATCH-3");
    const line4 = lines.find((l) => l.external_id === "STMT-BATCH-4");

    assert.equal(line1?.match_status, "created");
    assert.equal(line2?.match_status, "created");
    assert.equal(line3?.match_status, "created");
    assert.equal(line4?.match_status, "unmatched"); // misc line remained unmatched

    // Clean up rules
    deleteBankRule(businessId, adminId, fuelRuleId);
    deleteBankRule(businessId, adminId, feeRuleId);
  });

  await suite.test("5. Voiding an auto-categorized Bank Transaction reverses GL and resets statement line", () => {
    // Take line1 from previous batch test
    const line1 = listStatementLines(businessId, adminId, bank.id).find((l) => l.external_id === "STMT-BATCH-1");
    assert.ok(line1);
    assert.equal(line1.match_status, "created");
    assert.ok(line1.matched_source_id);

    const transactionId = line1.matched_source_id;

    // Void the bank transaction
    voidBankTransaction(businessId, adminId, transactionId);

    // Verify transaction status is void
    const tx = getBankTransaction(businessId, adminId, transactionId);
    assert.equal(tx?.transaction.document_status, "void");

    // Verify statement line is reset to unmatched
    const resetLine = listStatementLines(businessId, adminId, bank.id).find((l) => l.id === line1.id);
    assert.equal(resetLine?.match_status, "unmatched");
    assert.equal(resetLine?.matched_source_type, null);
    assert.equal(resetLine?.matched_source_id, null);
  });
});
