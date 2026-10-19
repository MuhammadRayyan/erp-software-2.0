import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "../src/core/db/business";
import { getSystemDb } from "../src/core/db/system";
import { users } from "../src/core/db/system-schema";
import { createBusiness } from "../src/core/businesses/business-service";
import {
  saveEmployee,
  getEmployee,
  listEmployees,
  toggleEmployeeActive,
  savePayslipItem,
  listPayslipItems,
  savePayslip,
  getPayslipWithLines,
  postPayslipToLedger,
  voidPayslip,
  generateBatchPayslips,
} from "../src/modules/payroll/services/payroll-service";
import { calculateUaeEosb } from "../src/modules/payroll/services/eosb-calculator";
import { allocateNumber } from "../src/modules/accounting/services/numbering-service";
import { buildDocumentTemplateData } from "../src/modules/document-templates/document-data-extractor";
import { generateDocumentPdf } from "../src/modules/document-templates/pdf-service";
import { createAccount, deleteAccount } from "../src/modules/accounting/services/account-service";

test("UAE HR & Payroll Module Test Suite (Manager.io-Inspired)", async (t) => {
  const systemDb = getSystemDb();
  const testUserId = `test-user-${randomUUID().slice(0, 8)}`;

  // Provision test user
  systemDb.insert(users).values({
    id: testUserId,
    name: "Payroll Test Admin",
    email: `${testUserId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).run();

  const business = createBusiness({
    name: "Payroll Apex Trading LLC",
    country: "AE",
    currency: "AED",
    financialYearStartMonth: 1,
  }, testUserId);

  const testBusinessId = business.id;
  const context = getBusinessDb(testBusinessId, testUserId);

  // -------------------------------------------------------------
  // TEST 1: Migration 34 Schema & Seed Verification
  // -------------------------------------------------------------
  await t.test("1. Migration 34 Schema, Tables & Seeded Master Data", () => {
    // Check employees table schema
    const empCols = (context.sqlite.prepare("PRAGMA table_info(employees)").all() as { name: string }[]).map((c) => c.name);
    assert.ok(empCols.includes("joining_date"), "employees table must have joining_date");
    assert.ok(empCols.includes("department"), "employees table must have department");
    assert.ok(empCols.includes("basic_salary_minor"), "employees table must have basic_salary_minor");
    assert.ok(empCols.includes("housing_allowance_minor"), "employees table must have housing_allowance_minor");
    assert.ok(empCols.includes("transport_allowance_minor"), "employees table must have transport_allowance_minor");
    assert.ok(empCols.includes("other_allowances_minor"), "employees table must have other_allowances_minor");

    // Check payslips table schema
    const payslipCols = (context.sqlite.prepare("PRAGMA table_info(payslips)").all() as { name: string }[]).map((c) => c.name);
    assert.ok(payslipCols.includes("journal_entry_id"), "payslips table must have journal_entry_id");

    // Check tables exist
    const tables = (context.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    assert.ok(tables.includes("payslip_items"), "payslip_items table must exist");
    assert.ok(tables.includes("payslip_lines"), "payslip_lines table must exist");

    // Check seeded GL accounts
    const salariesExpense = context.sqlite.prepare("SELECT * FROM accounts WHERE id = 'acct-salaries-expense-6100'").get() as any;
    assert.ok(salariesExpense, "Salaries expense account (6100) must be seeded");
    assert.equal(salariesExpense.type, "expense");

    const payrollPayable = context.sqlite.prepare("SELECT * FROM accounts WHERE id = 'acct-payroll-payable-2200'").get() as any;
    assert.ok(payrollPayable, "Payroll payable account (2200) must be seeded");
    assert.equal(payrollPayable.type, "liability");

    const advances = context.sqlite.prepare("SELECT * FROM accounts WHERE id = 'acct-employee-advances-1220'").get() as any;
    assert.ok(advances, "Employee advances account (1220) must be seeded");
    assert.equal(advances.type, "asset");

    const deductionsRecovery = context.sqlite.prepare("SELECT * FROM accounts WHERE id = 'acct-payroll-deductions-4200'").get() as any;
    assert.ok(deductionsRecovery, "Payroll deductions recovery account (4200) must be seeded");

    // Check seeded items
    const seededItems = listPayslipItems(testBusinessId, testUserId);
    assert.ok(seededItems.length >= 9, "At least 9 default payslip items must be seeded");
    const basicItem = seededItems.find((i) => i.id === "item-basic-salary");
    assert.ok(basicItem, "Basic Salary item must be present");
    assert.equal(basicItem.type, "earnings");
    assert.equal(basicItem.accountId, "acct-salaries-expense-6100");
  });

  // -------------------------------------------------------------
  // TEST 2: Numbering Sequence for Payslips
  // -------------------------------------------------------------
  await t.test("2. Payslip Number Allocation via numbering-service", () => {
    const num1 = allocateNumber(context.sqlite, "payslip");
    const num2 = allocateNumber(context.sqlite, "payslip");
    assert.ok(num1.startsWith("PS-"), `Payslip number ${num1} must start with PS-`);
    assert.ok(num2.startsWith("PS-"), `Payslip number ${num2} must start with PS-`);
    assert.notEqual(num1, num2, "Consecutive allocations must produce unique sequential numbers");
  });

  // -------------------------------------------------------------
  // TEST 3: Employee CRUD & Salary Structure
  // -------------------------------------------------------------
  let emp1Id: string;
  let emp2Id: string;

  await t.test("3. Employee CRUD and Compensation Management", () => {
    emp1Id = saveEmployee(testBusinessId, testUserId, {
      name: "Tariq Mansoor",
      code: "EMP-101",
      designation: "Senior Estimator",
      department: "Engineering",
      joiningDate: "2021-06-01",
      basicSalaryMinor: 1200000, // 12,000 AED
      housingAllowanceMinor: 400000, // 4,000 AED
      transportAllowanceMinor: 150000, // 1,500 AED
      otherAllowancesMinor: 50000, // 500 AED
      email: "tariq@apex.ae",
      phone: "+971501112233",
      isActive: true,
    });
    assert.ok(emp1Id);

    const emp1 = getEmployee(testBusinessId, testUserId, emp1Id);
    assert.ok(emp1);
    assert.equal(emp1.name, "Tariq Mansoor");
    assert.equal(emp1.basicSalaryMinor, 1200000);
    assert.equal(emp1.housingAllowanceMinor, 400000);
    assert.equal(emp1.transportAllowanceMinor, 150000);
    assert.equal(emp1.otherAllowancesMinor, 50000);
    assert.equal(emp1.isActive, true);

    emp2Id = saveEmployee(testBusinessId, testUserId, {
      name: "Fatima Al Hashimi",
      code: "EMP-102",
      designation: "Finance Specialist",
      department: "Accounts",
      joiningDate: "2022-01-15",
      basicSalaryMinor: 1500000, // 15,000 AED
      housingAllowanceMinor: 500000, // 5,000 AED
      isActive: true,
    });
    assert.ok(emp2Id);

    // List employees
    const list = listEmployees(testBusinessId, testUserId);
    assert.ok(list.length >= 2);

    // Toggle active status
    toggleEmployeeActive(testBusinessId, testUserId, emp2Id, false);
    const updatedEmp2 = getEmployee(testBusinessId, testUserId, emp2Id);
    assert.equal(updatedEmp2?.isActive, false);

    toggleEmployeeActive(testBusinessId, testUserId, emp2Id, true);
    assert.equal(getEmployee(testBusinessId, testUserId, emp2Id)?.isActive, true);
  });

  // -------------------------------------------------------------
  // TEST 4: Payslip Item Management
  // -------------------------------------------------------------
  await t.test("4. Custom Payslip Item Creation", () => {
    const customItemId = savePayslipItem(testBusinessId, testUserId, {
      name: "Site Hardship Allowance",
      type: "earnings",
      accountId: "acct-salaries-expense-6100",
      description: "Additional allowance for remote UAE project sites",
    });
    assert.ok(customItemId);

    const items = listPayslipItems(testBusinessId, testUserId);
    const item = items.find((i) => i.id === customItemId);
    assert.ok(item);
    assert.equal(item.name, "Site Hardship Allowance");
    assert.equal(item.type, "earnings");
  });

  // -------------------------------------------------------------
  // TEST 5: Payslip Calculations & Balanced GL Posting
  // -------------------------------------------------------------
  let payslipId: string;

  await t.test("5. Payslip Creation, Line Calculations & Balanced GL Posting", () => {
    // Tariq's payslip:
    // Earnings:
    //   Basic Salary: 12,000 AED (1,200,000 minor)
    //   Housing Allowance: 4,000 AED (400,000 minor)
    //   Overtime: 1,000 AED (100,000 minor)
    //   Gross = 17,000 AED (1,700,000 minor)
    // Deductions:
    //   Advance deduction: 2,000 AED (200,000 minor) -> 1220 Employee Advances
    //   Unpaid leave: 500 AED (50,000 minor) -> 6100 Salaries Expense
    //   Total deductions = 2,500 AED (250,000 minor)
    // Net Pay = 17,000 - 2,500 = 14,500 AED (1,450,000 minor)
    payslipId = savePayslip(testBusinessId, testUserId, {
      employeeId: emp1Id,
      date: "2026-10-31",
      periodDescription: "October 2026",
      notes: "Regular monthly payroll with overtime and advance recovery",
      lines: [
        {
          itemId: "item-basic-salary",
          type: "earnings",
          description: "Basic Salary",
          accountId: "acct-salaries-expense-6100",
          amountMinor: 1200000,
        },
        {
          itemId: "item-housing-allowance",
          type: "earnings",
          description: "Housing Allowance",
          accountId: "acct-salaries-expense-6100",
          amountMinor: 400000,
        },
        {
          itemId: "item-overtime-pay",
          type: "earnings",
          description: "Overtime Pay (15 hours)",
          accountId: "acct-salaries-expense-6100",
          amountMinor: 100000,
        },
        {
          itemId: "item-advance-deduction",
          type: "deduction",
          description: "Advance Recovery installment 1/3",
          accountId: "acct-employee-advances-1220",
          amountMinor: 200000,
        },
        {
          itemId: "item-unpaid-leave",
          type: "deduction",
          description: "Unpaid leave (1 day)",
          accountId: "acct-salaries-expense-6100",
          amountMinor: 50000,
        },
      ],
      autoPost: false,
    });

    assert.ok(payslipId);

    const record = getPayslipWithLines(testBusinessId, testUserId, payslipId);
    assert.ok(record);
    assert.equal(record.payslip.grossAmountMinor, 1700000);
    assert.equal(record.payslip.deductionsMinor, 250000);
    assert.equal(record.payslip.netAmountMinor, 1450000);
    assert.equal(record.payslip.documentStatus, "draft");
    assert.equal(record.lines.length, 5);

    // Now post to General Ledger
    postPayslipToLedger(testBusinessId, testUserId, payslipId);

    const postedRecord = getPayslipWithLines(testBusinessId, testUserId, payslipId);
    assert.ok(postedRecord);
    assert.equal(postedRecord.payslip.documentStatus, "posted");
    assert.ok(postedRecord.payslip.journalEntryId, "Journal entry ID must be populated");
    assert.ok(postedRecord.journal, "Journal details must be linked");

    // Inspect the General Ledger journal lines
    const jLines = context.sqlite.prepare(`
      SELECT account_id, debit_minor, credit_minor, description
      FROM journal_lines
      WHERE journal_entry_id = ?
    `).all(postedRecord.payslip.journalEntryId) as Array<{
      account_id: string;
      debit_minor: number;
      credit_minor: number;
      description: string;
    }>;

    const totalDebit = jLines.reduce((s, l) => s + l.debit_minor, 0);
    const totalCredit = jLines.reduce((s, l) => s + l.credit_minor, 0);

    // Verify STRICT balanced double entry
    assert.equal(totalDebit, 1700000, "Total debits must equal gross earnings (17,000 AED)");
    assert.equal(totalCredit, 1700000, "Total credits must equal deductions + net payable (17,000 AED)");
    assert.equal(totalDebit, totalCredit, "Journal entry MUST be strictly balanced");

    // Verify net pay was credited to 2200 Payroll Payable
    const netCredit = jLines.find((l) => l.account_id === "acct-payroll-payable-2200");
    assert.ok(netCredit);
    assert.equal(netCredit.credit_minor, 1450000);

    // Verify advances was credited for recovery
    const advanceCredit = jLines.find((l) => l.account_id === "acct-employee-advances-1220");
    assert.ok(advanceCredit);
    assert.equal(advanceCredit.credit_minor, 200000);
  });

  // -------------------------------------------------------------
  // TEST 6: Void / General Ledger Reversal
  // -------------------------------------------------------------
  await t.test("6. Void Payslip & Automated GL Reversal", () => {
    voidPayslip(testBusinessId, testUserId, payslipId);

    const voidedRecord = getPayslipWithLines(testBusinessId, testUserId, payslipId);
    assert.ok(voidedRecord);
    assert.equal(voidedRecord.payslip.documentStatus, "void");

    // Verify reversal journal entry was posted
    const reversal = context.sqlite.prepare(`
      SELECT id, entry_number FROM journal_entries
      WHERE source_type = 'payslip_void' AND source_id = ?
    `).get(payslipId) as { id: string; entry_number: string } | undefined;

    assert.ok(reversal, "Reversal journal entry must be created");

    const reversalLines = context.sqlite.prepare(`
      SELECT account_id, debit_minor, credit_minor FROM journal_lines WHERE journal_entry_id = ?
    `).all(reversal.id) as Array<{ account_id: string; debit_minor: number; credit_minor: number }>;

    const revDebit = reversalLines.reduce((s, l) => s + l.debit_minor, 0);
    const revCredit = reversalLines.reduce((s, l) => s + l.credit_minor, 0);
    assert.equal(revDebit, 1700000);
    assert.equal(revCredit, 1700000);
    assert.equal(revDebit, revCredit);
  });

  // -------------------------------------------------------------
  // TEST 7: Batch Monthly Pay Run Generation
  // -------------------------------------------------------------
  await t.test("7. Batch Pay Run Generation for Active Employees", () => {
    const result = generateBatchPayslips(testBusinessId, testUserId, {
      periodDate: "2026-11-30",
      periodDescription: "November 2026",
      autoPost: true,
    });

    assert.ok(result.createdCount >= 2, "Batch pay run should generate payslips for all eligible employees");
    assert.equal(result.payslipIds.length, result.createdCount);

    for (const id of result.payslipIds) {
      const p = getPayslipWithLines(testBusinessId, testUserId, id);
      assert.ok(p);
      assert.equal(p.payslip.documentStatus, "posted");
      assert.ok(p.payslip.journalEntryId);
      assert.ok(p.payslip.grossAmountMinor > 0);
    }
  });

  // -------------------------------------------------------------
  // TEST 8: PDF Document Data Extractor
  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // TEST 8: PDF Document Data Extractor & Real PDF Rendering
  // -------------------------------------------------------------
  await t.test("8. Document Template PDF Extractor & Rendering for Payslips", async () => {
    // Generate a fresh payslip to test PDF extraction
    const pId = savePayslip(testBusinessId, testUserId, {
      employeeId: emp1Id,
      date: "2026-10-31",
      periodDescription: "October 2026",
      lines: [
        {
          itemId: "item-basic-salary",
          type: "earnings",
          description: "Basic Salary",
          accountId: "acct-salaries-expense-6100",
          amountMinor: 1200000,
        },
      ],
      autoPost: true,
    });

    const pdfData = buildDocumentTemplateData(
      testBusinessId,
      testUserId,
      "Payroll Apex Trading LLC",
      "AED",
      "payslip",
      pId
    );

    assert.equal(pdfData.title, "PAYSLIP");
    assert.equal(pdfData.data.customerLabel, "EMPLOYEE");
    assert.equal(pdfData.data.customerName, "Tariq Mansoor");
    assert.equal(pdfData.totalMinor, 1200000);
    assert.ok(pdfData.data.lines.length >= 1);

    // Verify real PDF generation Buffer
    const { pdf, filename } = await generateDocumentPdf(
      testBusinessId,
      testUserId,
      "Payroll Apex Trading LLC",
      "AED",
      "payslip",
      pId
    );
    assert.ok(Buffer.isBuffer(pdf), "Output must be a Buffer");
    assert.ok(pdf.length > 500, `PDF size (${pdf.length} bytes) must be substantial`);
    assert.ok(filename.endsWith(".pdf"), "Filename must end with .pdf");
  });

  // -------------------------------------------------------------
  // TEST 9: UAE Labor Law EOSB Calculation (Article 51 & 29)
  // -------------------------------------------------------------
  await t.test("9. UAE Labor Law End of Service Gratuity & Leave Encashment Math", () => {
    // Case 1: Under 1 year continuous service -> 0 AED
    const under1Year = calculateUaeEosb({
      joiningDate: "2024-01-01",
      terminationDate: "2024-10-31", // 10 months (~305 days)
      basicSalaryMinor: 1000000, // 10,000 AED
    });
    assert.equal(under1Year.eligibleForGratuity, false);
    assert.equal(under1Year.gratuityMinor, 0);

    // Case 2: Exactly 3 years continuous service, 10,000 AED basic
    // Daily wage = 10,000 / 30 = 333.333 AED (33333 minor)
    // 3 years * 21 days = 63 days
    // Gratuity = 63 * 33333 = 2,099,979 minor (~21,000 AED)
    const exactly3Years = calculateUaeEosb({
      joiningDate: "2021-01-01",
      terminationDate: "2024-01-01",
      basicSalaryMinor: 1000000,
    });
    assert.equal(exactly3Years.eligibleForGratuity, true);
    assert.ok(
      Math.abs(exactly3Years.gratuityMinor - 2100000) < 5000,
      `Expected ~2,100,000 minor, got ${exactly3Years.gratuityMinor}`
    );

    // Case 3: 7 years continuous service, 15,000 AED basic
    // First 5 years: 5 * 21 = 105 days
    // Next 2 years: 2 * 30 = 60 days
    // Total 165 days @ 500 AED / day = 82,500 AED (8,250,000 minor)
    const sevenYears = calculateUaeEosb({
      joiningDate: "2017-01-01",
      terminationDate: "2024-01-01",
      basicSalaryMinor: 1500000,
    });
    assert.equal(sevenYears.eligibleForGratuity, true);
    assert.ok(
      Math.abs(sevenYears.gratuityMinor - 8250000) < 10000,
      `Expected ~8,250,000 minor, got ${sevenYears.gratuityMinor}`
    );

    // Case 4: Statutory 24-month basic salary cap
    // 35 years service on 10,000 AED basic
    // Uncapped would be ~330,000 AED
    // Max cap = 24 * 10,000 AED = 240,000 AED (24,000,000 minor)
    const cappedCase = calculateUaeEosb({
      joiningDate: "1989-01-01",
      terminationDate: "2024-01-01",
      basicSalaryMinor: 1000000,
    });
    assert.equal(cappedCase.isCapped, true);
    assert.equal(cappedCase.gratuityMinor, 24000000, "Gratuity must be capped at 24 months basic");

    // Case 5: Unpaid leave deduction (Article 51 clause 4)
    const withUnpaidLeave = calculateUaeEosb({
      joiningDate: "2023-01-01",
      terminationDate: "2024-01-01", // ~366 days
      basicSalaryMinor: 1000000,
      unpaidLeaveDays: 30, // drops net service to 336 days (< 365)
    });
    assert.equal(withUnpaidLeave.eligibleForGratuity, false);
    assert.equal(withUnpaidLeave.gratuityMinor, 0);

    // Case 6: Article 29 Leave Encashment
    // 15 unused days @ 10,000 / 30 = 5,000 AED (500,000 minor)
    const withLeave = calculateUaeEosb({
      joiningDate: "2021-01-01",
      terminationDate: "2024-01-01",
      basicSalaryMinor: 1000000,
      unusedLeaveDays: 15,
    });
    assert.ok(
      Math.abs(withLeave.leaveEncashmentMinor - 500000) < 1000,
      `Expected ~500,000 minor, got ${withLeave.leaveEncashmentMinor}`
    );
    assert.equal(
      withLeave.totalSettlementMinor,
      withLeave.gratuityMinor + withLeave.leaveEncashmentMinor
    );
  });

  // -------------------------------------------------------------
  // TEST 10: Protection Against Deleting Accounts Used in Payroll
  // -------------------------------------------------------------
  await t.test("10. Chart of Accounts Deletion Protection for Payroll Items & Lines", () => {
    // Create custom expense account
    createAccount(testBusinessId, testUserId, {
      name: "6150 - Technical Consulting Wages",
      type: "expense",
      subtype: "operating_expense",
    });

    const accts = context.sqlite
      .prepare("SELECT id FROM accounts WHERE name = '6150 - Technical Consulting Wages'")
      .get() as { id: string };
    assert.ok(accts?.id);

    // Assign account to a custom payslip item
    const customItemId = savePayslipItem(testBusinessId, testUserId, {
      name: "Technical Consultation Fee",
      type: "earnings",
      accountId: accts.id,
      description: "Specialized hourly technical advisory",
    });
    assert.ok(customItemId);

    // Attempting to delete this account must be blocked
    assert.throws(
      () => deleteAccount(testBusinessId, testUserId, accts.id),
      /Cannot delete this account because it has transactions or is configured for accounting/
    );
  });

  // -------------------------------------------------------------
  // TEST 11: Dynamic Account Resolution in Batch Pay Run
  // -------------------------------------------------------------
  await t.test("11. Batch Pay Run Respects Configured Item Expense Accounts", () => {
    // Create dedicated account for housing allowance
    createAccount(testBusinessId, testUserId, {
      name: "6110 - Housing Allowance Expense",
      type: "expense",
      subtype: "operating_expense",
    });
    const housingAcct = context.sqlite
      .prepare("SELECT id FROM accounts WHERE name = '6110 - Housing Allowance Expense'")
      .get() as { id: string };
    assert.ok(housingAcct?.id);

    // Update housing allowance item to use this custom account
    savePayslipItem(testBusinessId, testUserId, {
      id: "item-housing-allowance",
      name: "Housing Allowance",
      type: "earnings",
      accountId: housingAcct.id,
      description: "Employee residential housing allowance",
    });

    // Run batch pay run
    const payRun = generateBatchPayslips(testBusinessId, testUserId, {
      periodDate: "2026-12-31",
      periodDescription: "December 2026",
      employeeIds: [emp1Id],
      autoPost: false,
    });
    assert.equal(payRun.createdCount, 1);

    const generatedSlip = getPayslipWithLines(testBusinessId, testUserId, payRun.payslipIds[0]);
    assert.ok(generatedSlip);

    const housingLine = generatedSlip.lines.find((l) => l.itemId === "item-housing-allowance");
    assert.ok(housingLine);
    assert.equal(
      housingLine.accountId,
      housingAcct.id,
      "Batch payslip must use the item's configured GL account, not a hardcoded default"
    );
  });

  // -------------------------------------------------------------
  // TEST 12: Resilient getPayslipWithLines Fallback for Deleted/Legacy Employees
  // -------------------------------------------------------------
  await t.test("12. getPayslipWithLines Fallback on Dangling/Missing Employee Reference", () => {
    // Disable foreign keys temporarily to simulate raw corrupt/migrated legacy state
    context.sqlite.pragma("foreign_keys = OFF");
    const orphanPayslipId = `orphan-slip-${randomUUID().slice(0, 8)}`;
    context.sqlite
      .prepare(`
        INSERT INTO payslips (
          id, payslip_number, employee_id, date, period_description,
          gross_amount_minor, deductions_minor, net_amount_minor,
          document_status, created_by, created_at, updated_at
        ) VALUES (?, 'PS-9999', 'non-existent-employee-id', '2026-10-31', 'Legacy Run', 500000, 0, 500000, 'posted', ?, ?, ?)
      `)
      .run(orphanPayslipId, testUserId, new Date().toISOString(), new Date().toISOString());
    context.sqlite.pragma("foreign_keys = ON");

    // Must not return null or throw an unhandled error
    const record = getPayslipWithLines(testBusinessId, testUserId, orphanPayslipId);
    assert.ok(record, "Should successfully return record with fallback employee details");
    assert.ok(record.employee);
    assert.equal(record.employee.id, "non-existent-employee-id");
  });

  // -------------------------------------------------------------
  // TEST 13: Deterministic UTC Dates & Leap Year EOSB Calculation
  // -------------------------------------------------------------
  await t.test("13. Deterministic UTC Date Math Across Leap Years", () => {
    // 4 full years across leap year 2024 (2020-03-01 to 2024-03-01)
    const leapService = calculateUaeEosb({
      joiningDate: "2020-03-01",
      terminationDate: "2024-03-01",
      basicSalaryMinor: 1200000, // 12,000 AED
    });

    assert.equal(leapService.durationSummary.years, 4);
    assert.equal(leapService.durationSummary.months, 0);
    assert.equal(leapService.durationSummary.days, 0);
    assert.equal(leapService.eligibleForGratuity, true);
  });
});
