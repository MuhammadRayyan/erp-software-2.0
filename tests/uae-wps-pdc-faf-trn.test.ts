import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-uae-p2-")),
  BETTER_AUTH_SECRET: "uae-p2-test-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { closeAllBusinessConnections, getBusinessDb } = await import("../src/core/db/business");
const { reconcileBusinessDatabase } = await import("../src/core/db/reconciliation");
const { updateBusinessProfile } = await import("../src/modules/business-profile/business-profile-service");
const { saveEmployee, savePayslip, postPayslipToLedger } = await import("../src/modules/payroll/services/payroll-service");
const { generateWpsSifFile } = await import("../src/modules/payroll/services/wps-service");
const { createPdc, depositPdc, clearPdc, bouncePdc, cancelPdc, getPdc, getPdcMaturitySummary } = await import("../src/modules/banking/pdc-service");
const { validateUaeTrn, generateUaeTrnWithChecksum, passesUaeTrnLuhn } = await import("../src/modules/tax/trn-validation");
const { taxSettingsInputSchema } = await import("../src/modules/tax/tax-settings-input");
const { generateFtaAuditFile } = await import("../src/modules/tax/faf-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);

test("UAE 15-digit TRN Luhn checksum verification & tax settings validation", () => {
  const validTrn = generateUaeTrnWithChecksum("10023456789012");
  assert.equal(validTrn.length, 15);
  assert.equal(passesUaeTrnLuhn(validTrn), true);

  const verified = validateUaeTrn(validTrn);
  assert.equal(verified.status, "verified");
  assert.equal(verified.validFormat, true);
  assert.equal(verified.validChecksum, true);

  // Format valid but non-Luhn check digit
  const badCheckDigit = `${validTrn.slice(0, 14)}${(Number(validTrn[14]) + 1) % 10}`;
  const formatOnly = validateUaeTrn(badCheckDigit);
  assert.equal(formatOnly.status, "format_only");
  assert.equal(formatOnly.validFormat, true);
  assert.equal(formatOnly.validChecksum, false);

  const invalid = validateUaeTrn("12345");
  assert.equal(invalid.status, "invalid");

  assert.equal(
    taxSettingsInputSchema.safeParse({
      vatRegistered: true,
      trn: badCheckDigit,
      enforceTrnChecksum: true,
      vatRegistrationEffectiveDate: "2026-01-01",
      defaultSupplyEmirate: "dubai",
    }).success,
    false,
  );
  assert.equal(
    taxSettingsInputSchema.safeParse({
      vatRegistered: true,
      trn: validTrn,
      enforceTrnChecksum: true,
      vatRegistrationEffectiveDate: "2026-01-01",
      defaultSupplyEmirate: "dubai",
    }).success,
    true,
  );
});

test("UAE WPS (.SIF) generator validates MOHRE/IBAN fields and produces accurate EDR & SCR rows", () => {
  const salaryExpense = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' AND is_active = 1 LIMIT 1").get() as { id: string };
  const empId = saveEmployee(businessId, adminId, {
    name: "Tariq Al Mansoori",
    code: "EMP-WPS-1",
    basicSalaryMinor: 1000000,
    molPersonId: "12345678901234",
    bankRoutingCode: "303100001",
    iban: "AE070331234567890123456",
    wpsEnabled: true,
    isActive: true,
  });

  const payDate = "2026-11-28";
  const payslipId = savePayslip(businessId, adminId, {
    employeeId: empId,
    date: payDate,
    periodDescription: "November 2026",
    lines: [
      { type: "earnings", description: "Basic Salary", accountId: salaryExpense.id, amountMinor: 1000000 },
      { type: "earnings", description: "Overtime Bonus", accountId: salaryExpense.id, amountMinor: 150000 },
    ],
  });
  postPayslipToLedger(businessId, adminId, payslipId);

  // Missing employer MOL & routing initially -> invalid=false with clear employer error
  const beforeProfile = generateWpsSifFile(businessId, adminId, { salaryMonth: "2026-11" });
  assert.equal(beforeProfile.valid, false);
  assert.ok(beforeProfile.errors.some((e) => e.scope === "employer"));

  updateBusinessProfile(businessId, adminId, {
    legalName: "Emberline Technical LLC",
    tradingName: "Emberline",
    molEstablishmentId: "9988776655443",
    wpsBankRoutingCode: "303100001",
    country: "United Arab Emirates",
    countryCode: "AE",
  });

  const sif = generateWpsSifFile(businessId, adminId, {
    salaryMonth: "2026-11",
    employerReference: "NOV2026",
  });
  assert.equal(sif.valid, true, sif.errors.map((e) => e.message).join("; "));
  assert.equal(sif.summary.edrCount, 1);
  assert.equal(sif.summary.totalFixedMinor, 1000000);
  assert.equal(sif.summary.totalVariableMinor, 150000);
  assert.equal(sif.summary.totalSalaryMinor, 1150000);
  assert.ok(sif.filename.endsWith(".SIF"));

  const lines = sif.sifContent.trim().split(/\r?\n/);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith("EDR,12345678901234,303100001,AE070331234567890123456,2026-11-01,2026-11-30,30,10000.00,1500.00,0"));
  assert.ok(lines[1].startsWith("SCR,9988776655443,303100001,"));
  assert.ok(lines[1].includes(",112026,1,11500.00,AED,NOV2026"));
});

test("PDC lifecycle transitions (held -> deposited -> cleared | bounced | cancelled) post balanced GL entries", () => {
  const bankAccount = sqlite.prepare("SELECT id, ledger_account_id FROM bank_accounts WHERE is_active = 1 LIMIT 1").get() as { id: string; ledger_account_id: string };
  const customer = sqlite.prepare("SELECT id FROM customers WHERE is_active = 1 LIMIT 1").get() as { id: string };
  const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE is_active = 1 LIMIT 1").get() as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

  // 1. Receivable PDC -> held -> deposited -> cleared
  const recId = createPdc(businessId, adminId, {
    direction: "receivable",
    chequeNumber: "CHQ-REC-101",
    chequeBankName: "Emirates NBD",
    issueDate: today,
    maturityDate: future,
    customerId: customer.id,
    bankAccountId: bankAccount.id,
    amount: "2500.00",
  });
  assert.equal(getPdc(businessId, adminId, recId)?.status, "held");
  depositPdc(businessId, adminId, recId, today);
  assert.equal(getPdc(businessId, adminId, recId)?.status, "deposited");
  clearPdc(businessId, adminId, recId, future);
  assert.equal(getPdc(businessId, adminId, recId)?.status, "cleared");

  // 2. Receivable PDC -> held -> bounced
  const bounceId = createPdc(businessId, adminId, {
    direction: "receivable",
    chequeNumber: "CHQ-REC-102",
    issueDate: today,
    maturityDate: future,
    customerId: customer.id,
    bankAccountId: bankAccount.id,
    amount: "1200.00",
  });
  bouncePdc(businessId, adminId, bounceId, "Insufficient funds", today);
  assert.equal(getPdc(businessId, adminId, bounceId)?.status, "bounced");

  // 3. Payable PDC -> held -> maturity summary & cancel
  const payId = createPdc(businessId, adminId, {
    direction: "payable",
    chequeNumber: "CHQ-PAY-201",
    issueDate: today,
    maturityDate: future,
    supplierId: supplier.id,
    bankAccountId: bankAccount.id,
    amount: "800.00",
  });
  const summary = getPdcMaturitySummary(businessId, adminId, 30);
  assert.equal(summary.heldPayableMinor, 80000);
  assert.ok(summary.bouncedCount >= 1);

  cancelPdc(businessId, adminId, payId);
  assert.equal(getPdc(businessId, adminId, payId)?.status, "cancelled");

  // Reconcile GL integrity
  const recCheck = reconcileBusinessDatabase(sqlite);
  assert.deepEqual(recCheck, {
    unbalancedJournals: 0,
    invalidPostedPayslips: 0,
    invalidPayslipTotals: 0,
    missingDocumentJournals: 0,
  });
});

test("UAE FTA Audit File (FAF) exports required CompInfo, SuppInfo, CustInfo, PurData, SupData, and GLData sections", () => {
  const faf = generateFtaAuditFile(businessId, adminId, {
    dateFrom: "2000-01-01",
    dateTo: "2099-12-31",
  });
  assert.ok(faf.csvContent.includes("CompInfoStart"));
  assert.ok(faf.csvContent.includes("SuppInfoStart"));
  assert.ok(faf.csvContent.includes("CustInfoStart"));
  assert.ok(faf.csvContent.includes("PurDataStart"));
  assert.ok(faf.csvContent.includes("PurTotals"));
  assert.ok(faf.csvContent.includes("SupDataStart"));
  assert.ok(faf.csvContent.includes("SupTotals"));
  assert.ok(faf.csvContent.includes("GLDataStart"));
  assert.ok(faf.csvContent.includes("GLTotals"));
  assert.equal(faf.totals.glDebitMinor, faf.totals.glCreditMinor);
  assert.ok(faf.totals.glLinesCount > 0);
});

after(() => {
  closeAllBusinessConnections();
});
