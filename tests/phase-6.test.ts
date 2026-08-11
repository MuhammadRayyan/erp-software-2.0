import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-phase-6-")),
  BETTER_AUTH_SECRET: "phase-6-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { businessMigrations } = await import("../src/core/db/business-migrations");
const { runMigrations } = await import("../src/core/db/migrations/runner");
const { createBusiness } = await import("../src/core/businesses/business-service");
const { exportBusinessBackup, importBusinessBackup } = await import("../src/core/businesses/backup-service");
const { getBusinessAccess, canAccessModule } = await import("../src/core/permissions/permissions");
const { calculateTax } = await import("../src/modules/accounting/calculations/money");
const { createInvoice, updateInvoice, voidInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { saveCreditNote } = await import("../src/modules/sales-credit-notes/credit-note-service");
const { savePurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { saveBankTransaction } = await import("../src/modules/banking/bank-transaction-service");
const { updateTaxSettings } = await import("../src/modules/tax/tax-settings-service");
const {
  addVatAdjustment,
  createVatPeriod,
  finalizeVatPeriod,
  getVatPeriod,
  markVatPeriodFiledExternally,
  markVatPeriodPrepared,
  reopenVatPeriod,
} = await import("../src/modules/tax/vat-period-service");
const { getVatTransactionDetail, getVatWorkingPaper } = await import("../src/modules/tax/vat-report-service");

test("Phase 6 migration flags ambiguous historical zero-rate data without guessing", () => {
  const legacy = new Database(":memory:");
  const phase5Migrations = businessMigrations.filter((migration) => migration.version <= 5);
  runMigrations(legacy, { label: "Phase 6 historical fixture", migrations: phase5Migrations });
  const now = new Date().toISOString();
  legacy.prepare(`
    INSERT INTO customers (id, name, email, phone, tax_reference, status, created_at, updated_at)
    VALUES ('legacy-customer', 'Legacy Customer', NULL, NULL, NULL, 'active', ?, ?)
  `).run(now, now);
  legacy.prepare(`
    INSERT INTO sales_invoices (
      id, invoice_number, customer_id, invoice_date, due_date, reference, document_status,
      subtotal_minor, tax_minor, total_minor, created_by, created_at, updated_at, posted_at, voided_at
    ) VALUES ('legacy-invoice', 'LEG-0001', 'legacy-customer', '2026-03-31', '2026-04-30',
      'Historical migration fixture', 'posted', 20000, 500, 20500, 'legacy-user', ?, ?, ?, NULL)
  `).run(now, now, now);
  const insertLine = legacy.prepare(`
    INSERT INTO sales_invoice_lines (
      id, invoice_id, description, quantity_micros, unit_price_minor, sales_account_id,
      tax_code_id, net_amount_minor, tax_amount_minor, gross_amount_minor, position
    ) VALUES (?, 'legacy-invoice', ?, 1000000, 10000, 'acct-sales-4000', ?, 10000, ?, ?, ?)
  `);
  insertLine.run("legacy-zero-line", "Historically ambiguous zero-rate line", "tax-no-vat", 0, 10000, 0);
  insertLine.run("legacy-standard-line", "Safely classifiable standard line", "tax-uae-vat-5", 500, 10500, 1);

  runMigrations(legacy, { label: "Phase 6 historical fixture", migrations: businessMigrations });

  const entries = legacy.prepare("SELECT vat_category, supply_emirate FROM tax_entries WHERE source_id = 'legacy-invoice'").all() as { vat_category: string; supply_emirate: string | null }[];
  assert.deepEqual(entries, [{ vat_category: "standard", supply_emirate: null }]);
  const reviews = legacy.prepare("SELECT issue_type FROM vat_data_review WHERE source_id = 'legacy-invoice' ORDER BY issue_type").all() as { issue_type: string }[];
  assert.deepEqual(reviews.map((row) => row.issue_type), ["ambiguous_zero_rate", "missing_emirate"]);
  legacy.close();
});

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const standardUserId = seeded.standard.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const customer = sqlite.prepare("SELECT id FROM customers WHERE status = 'active' ORDER BY name LIMIT 1").get() as { id: string };
const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE is_active = 1 ORDER BY name LIMIT 1").get() as { id: string };
const accounting = sqlite.prepare(`
  SELECT default_sales_account_id, default_purchase_expense_account_id
  FROM business_accounting_settings WHERE id = 'default'
`).get() as { default_sales_account_id: string; default_purchase_expense_account_id: string };
const bank = sqlite.prepare("SELECT id FROM bank_accounts WHERE is_active = 1 AND is_cash_account = 0 LIMIT 1").get() as { id: string };
const codes = {
  sales: "tax-uae-vat-5-sales",
  purchases: "tax-uae-vat-5-purchases",
  zero: "tax-zero-rated-sales",
  exempt: "tax-exempt-sales",
  outOfScope: "tax-out-of-scope",
  reverseCharge: "tax-reverse-charge-purchases",
  import: "tax-import-vat-purchases",
};

const periodDates = { start: "2030-04-01", end: "2030-06-30", due: "2030-07-28" };
let periodId = "";
let dubaiInvoiceId = "";
let lockInvoiceId = "";

function saleInput(reference: string, amount: string, taxCodeId: string, supplyEmirate: "dubai" | "abu_dhabi" | "" = "dubai") {
  return {
    customerId: customer.id,
    projectId: "",
    invoiceDate: "2030-04-15",
    taxDate: "2030-04-15",
    supplyEmirate,
    dueDate: "2030-05-15",
    reference,
    lines: [{ itemId: "", description: reference, quantity: "1", unitPrice: amount,
      salesAccountId: accounting.default_sales_account_id, taxCodeId, projectId: "" }],
  };
}

function postPurchase(reference: string, amount: string, taxCodeId: string) {
  return savePurchaseInvoice(businessId, adminId, {
    supplierId: supplier.id,
    projectId: "",
    supplierInvoiceNumber: reference,
    invoiceDate: "2030-05-10",
    taxDate: "2030-05-10",
    dueDate: "2030-06-10",
    reference,
    purchaseOrderId: "",
    lines: [{ itemId: "", description: reference, quantity: "1", unitPrice: amount,
      expenseAccountId: accounting.default_purchase_expense_account_id, taxCodeId, projectId: "" }],
  }, "post");
}

function journalBalance(sourceType: string, sourceId: string) {
  return sqlite.prepare(`
    SELECT COALESCE(SUM(jl.debit_minor), 0) AS debit, COALESCE(SUM(jl.credit_minor), 0) AS credit
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_type = ? AND je.source_id = ?
  `).get(sourceType, sourceId) as { debit: number; credit: number };
}

test("Phase 6 UAE VAT working papers and explicit period controls", async (suite) => {
  await suite.test("VAT settings and an explicit period are stored without a cadence assumption", () => {
    updateTaxSettings(businessId, adminId, {
      vatRegistered: true,
      trn: "100000000000003",
      vatRegistrationEffectiveDate: "2026-01-01",
      vatDeregistrationDate: "",
      defaultSupplyEmirate: "dubai",
    });
    periodId = createVatPeriod(businessId, adminId, {
      periodReference: "Apr-Jun 2030",
      startDate: periodDates.start,
      endDate: periodDates.end,
      filingDueDate: periodDates.due,
      notes: "Explicit FTA-assigned period fixture",
    });
    const period = getVatPeriod(businessId, adminId, periodId)!;
    assert.equal(period.period.start_date, periodDates.start);
    assert.equal(period.period.end_date, periodDates.end);
    assert.equal(period.period.filing_due_date, periodDates.due);
  });

  await suite.test("drafts create no tax entries and journal plus tax detail roll back together", () => {
    const draftId = createInvoice(businessId, adminId, saleInput("PH6-DRAFT", "100.00", codes.sales), "draft");
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM tax_entries WHERE source_id = ?").get(draftId) as { count: number }).count, 0);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries WHERE source_id = ?").get(draftId) as { count: number }).count, 0);

    sqlite.prepare("UPDATE business_tax_settings SET default_supply_emirate = NULL WHERE id = 'default'").run();
    const beforeInvoices = (sqlite.prepare("SELECT COUNT(*) AS count FROM sales_invoices").get() as { count: number }).count;
    const beforeJournals = (sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count;
    const beforeTaxEntries = (sqlite.prepare("SELECT COUNT(*) AS count FROM tax_entries").get() as { count: number }).count;
    assert.throws(() => createInvoice(businessId, adminId, saleInput("PH6-ROLLBACK", "100.00", codes.sales, ""), "post"), /supply Emirate/i);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM sales_invoices").get() as { count: number }).count, beforeInvoices);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count, beforeJournals);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM tax_entries").get() as { count: number }).count, beforeTaxEntries);
    sqlite.prepare("UPDATE business_tax_settings SET default_supply_emirate = 'dubai' WHERE id = 'default'").run();
  });

  await suite.test("posted Sales, Credit Note and Emirate detail produce signed output VAT", () => {
    dubaiInvoiceId = createInvoice(businessId, adminId, saleInput("PH6-DUBAI", "1000.00", codes.sales), "post");
    const abuDhabiId = createInvoice(businessId, adminId,
      { ...saleInput("PH6-ABU-DHABI", "500.00", codes.sales, "abu_dhabi"), invoiceDate: "2030-04-16", taxDate: "2030-04-16" }, "post");
    lockInvoiceId = abuDhabiId;
    const entry = sqlite.prepare("SELECT * FROM tax_entries WHERE source_type = 'sales_invoice' AND source_id = ?").get(dubaiInvoiceId) as Record<string, number | string>;
    assert.equal(entry.net_amount_minor, 100000);
    assert.equal(entry.output_vat_minor, 5000);
    assert.equal(entry.supply_emirate, "dubai");
    assert.deepEqual(journalBalance("sales_invoice", dubaiInvoiceId), { debit: 105000, credit: 105000 });
    assert.deepEqual(journalBalance("sales_invoice", abuDhabiId), { debit: 52500, credit: 52500 });

    const creditId = saveCreditNote(businessId, adminId, {
      customerId: customer.id,
      projectId: "",
      sourceInvoiceId: dubaiInvoiceId,
      date: "2030-04-20",
      taxDate: "2030-04-20",
      supplyEmirate: "dubai",
      reference: "PH6-CREDIT",
      reason: "Agreed allowance",
      lines: [{ description: "Agreed allowance", quantity: "1", unitPrice: "200.00",
        salesAccountId: accounting.default_sales_account_id, taxCodeId: codes.sales, projectId: "" }],
    }, "post");
    const creditEntry = sqlite.prepare("SELECT net_amount_minor, output_vat_minor FROM tax_entries WHERE source_id = ?").get(creditId) as { net_amount_minor: number; output_vat_minor: number };
    assert.deepEqual(creditEntry, { net_amount_minor: -20000, output_vat_minor: -1000 });
  });

  await suite.test("purchase, import, reverse charge and Bank VAT post correctly", () => {
    const purchaseId = postPurchase("PH6-PURCHASE", "1000.00", codes.purchases);
    const purchaseEntry = sqlite.prepare("SELECT * FROM tax_entries WHERE source_id = ?").get(purchaseId) as Record<string, number>;
    assert.equal(purchaseEntry.recoverable_vat_minor, 5000);
    assert.deepEqual(journalBalance("purchase_invoice", purchaseId), { debit: 105000, credit: 105000 });

    postPurchase("PH6-IMPORT", "200.00", codes.import);
    const reverseChargeId = postPurchase("PH6-REVERSE-CHARGE", "300.00", codes.reverseCharge);
    const reverseCharge = sqlite.prepare("SELECT output_vat_minor, recoverable_vat_minor FROM tax_entries WHERE source_id = ?").get(reverseChargeId) as { output_vat_minor: number; recoverable_vat_minor: number };
    assert.deepEqual(reverseCharge, { output_vat_minor: 1500, recoverable_vat_minor: 1500 });
    assert.deepEqual(journalBalance("purchase_invoice", reverseChargeId), { debit: 31500, credit: 31500 });

    const bankId = saveBankTransaction(businessId, adminId, {
      bankAccountId: bank.id,
      date: "2030-05-20",
      taxDate: "2030-05-20",
      supplyEmirate: "",
      type: "money_out",
      reference: "PH6-BANK-VAT",
      description: "VAT-bearing bank expense",
      statementLineId: "",
      lines: [{ accountId: accounting.default_purchase_expense_account_id, taxCodeId: codes.purchases,
        projectId: "", description: "VAT-bearing bank expense", amount: "105.00" }],
    }, "post");
    const bankEntry = sqlite.prepare("SELECT net_amount_minor, vat_amount_minor, recoverable_vat_minor FROM tax_entries WHERE source_id = ?").get(bankId) as { net_amount_minor: number; vat_amount_minor: number; recoverable_vat_minor: number };
    assert.deepEqual(bankEntry, { net_amount_minor: 10000, vat_amount_minor: 500, recoverable_vat_minor: 500 });
    assert.deepEqual(journalBalance("bank_transaction", bankId), { debit: 10500, credit: 10500 });
  });

  await suite.test("Zero Rated, Exempt and Out-of-Scope remain distinct", () => {
    createInvoice(businessId, adminId, saleInput("PH6-ZERO", "300.00", codes.zero), "post");
    createInvoice(businessId, adminId, saleInput("PH6-EXEMPT", "400.00", codes.exempt), "post");
    createInvoice(businessId, adminId, saleInput("PH6-OUT-OF-SCOPE", "500.00", codes.outOfScope), "post");
    const voidedId = createInvoice(businessId, adminId, saleInput("PH6-VOIDED-ZERO", "50.00", codes.zero), "post");
    voidInvoice(businessId, adminId, voidedId);
    const voidedRows = sqlite.prepare("SELECT net_amount_minor FROM tax_entries WHERE source_id = ?").all(voidedId) as { net_amount_minor: number }[];
    assert.equal(voidedRows.reduce((sum, row) => sum + row.net_amount_minor, 0), 0);
    const categories = getVatTransactionDetail(businessId, adminId, { periodId })
      .filter((row) => row.source_number.startsWith("INV-"))
      .map((row) => row.vat_category);
    assert.ok(categories.includes("zero_rated"));
    assert.ok(categories.includes("exempt"));
    assert.ok(categories.includes("out_of_scope"));
  });

  await suite.test("working-paper buckets, Emirate split, drill-down and reconciliation derive from tax entries", () => {
    const report = getVatWorkingPaper(businessId, adminId, periodId);
    assert.deepEqual(report.buckets.standard_sales, { netMinor: 130000, vatMinor: 6500, outputVatMinor: 6500, recoverableVatMinor: 0, count: 3 });
    assert.equal(report.buckets.zero_rated_sales.netMinor, 30000);
    assert.equal(report.buckets.exempt_sales.netMinor, 40000);
    assert.equal(report.buckets.reverse_charge_output.outputVatMinor, 1500);
    assert.equal(report.buckets.reverse_charge_purchases.recoverableVatMinor, 1500);
    assert.equal(report.buckets.import_purchases.recoverableVatMinor, 1000);
    assert.equal(report.details.filter((row) => row.vat_category === "out_of_scope").reduce((sum, row) => sum + row.net_amount_minor, 0), 50000);
    assert.equal((report.buckets as Record<string, unknown>).out_of_scope, undefined);
    const dubai = report.emirateBreakdown.find((row) => row.emirate === "dubai")!;
    const abuDhabi = report.emirateBreakdown.find((row) => row.emirate === "abu_dhabi")!;
    assert.deepEqual({ net: dubai.netMinor, vat: dubai.vatMinor }, { net: 80000, vat: 4000 });
    assert.deepEqual({ net: abuDhabi.netMinor, vat: abuDhabi.vatMinor }, { net: 50000, vat: 2500 });
    const drillDown = getVatTransactionDetail(businessId, adminId, { periodId, bucket: "standard_sales" });
    assert.equal(drillDown.reduce((sum, row) => sum + row.net_amount_minor, 0), report.buckets.standard_sales.netMinor);
    assert.deepEqual(report.reconciliation, { outputGlMinor: 8000, inputGlMinor: 8000, outputDifferenceMinor: 0, inputDifferenceMinor: 0 });

    const outputLine = sqlite.prepare(`
      SELECT jl.id, jl.credit_minor FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN business_accounting_settings bas ON bas.vat_output_account_id = jl.account_id
      WHERE je.source_type = 'sales_invoice' AND je.source_id = ?
    `).get(dubaiInvoiceId) as { id: string; credit_minor: number };
    sqlite.prepare("UPDATE journal_lines SET credit_minor = credit_minor + 1 WHERE id = ?").run(outputLine.id);
    assert.equal(getVatWorkingPaper(businessId, adminId, periodId).reconciliation.outputDifferenceMinor, -1);
    sqlite.prepare("UPDATE journal_lines SET credit_minor = ? WHERE id = ?").run(outputLine.credit_minor, outputLine.id);
  });

  await suite.test("adjustments remain separate and rounding is deterministic", () => {
    const before = getVatWorkingPaper(businessId, adminId, periodId);
    addVatAdjustment(businessId, adminId, periodId, {
      reportBucket: "output_vat_adjustment",
      amount: "0.00",
      vatAmount: "1.00",
      reason: "Rounding review adjustment",
      reference: "PH6-ADJ-1",
    });
    const after = getVatWorkingPaper(businessId, adminId, periodId);
    assert.equal(after.calculatedOutputVatMinor, before.calculatedOutputVatMinor);
    assert.equal(after.outputAdjustmentMinor, 100);
    assert.equal(after.totalOutputVatMinor, before.totalOutputVatMinor + 100);
    assert.equal(calculateTax(101, 500), 5);
    assert.equal(calculateTax(110, 500), 6);
  });

  await suite.test("finalization locks VAT changes; Admin reopen records a reason and recalculates the lock", () => {
    markVatPeriodPrepared(businessId, adminId, periodId);
    finalizeVatPeriod(businessId, adminId, periodId);
    const finalized = getVatPeriod(businessId, adminId, periodId)!;
    assert.equal(finalized.period.status, "finalized");
    assert.ok(finalized.snapshots.some((row) => row.snapshot_kind === "finalized"));
    assert.equal((sqlite.prepare("SELECT tax_lock_date FROM business_tax_settings WHERE id = 'default'").get() as { tax_lock_date: string }).tax_lock_date, periodDates.end);
    assert.throws(() => createInvoice(businessId, adminId, saleInput("PH6-LOCKED-POST", "10.00", codes.sales), "post"), /finalized/i);
    assert.throws(() => updateInvoice(businessId, adminId, dubaiInvoiceId, saleInput("PH6-LOCKED-EDIT", "900.00", codes.sales), "post"), /finalized/i);
    assert.throws(() => voidInvoice(businessId, adminId, lockInvoiceId), /finalized/i);

    reopenVatPeriod(businessId, adminId, periodId, { reason: "Correct supporting document classification" });
    const reopened = getVatPeriod(businessId, adminId, periodId)!;
    assert.equal(reopened.period.status, "reopened");
    assert.equal(reopened.period.reopen_reason, "Correct supporting document classification");
    assert.ok(reopened.audit.some((row) => row.action === "reopened" && row.reason_or_reference === "Correct supporting document classification"));
    assert.equal((sqlite.prepare("SELECT tax_lock_date FROM business_tax_settings WHERE id = 'default'").get() as { tax_lock_date: string | null }).tax_lock_date, null);
  });

  await suite.test("Filed Externally stores immutable snapshots and never represents submission", () => {
    finalizeVatPeriod(businessId, adminId, periodId);
    markVatPeriodFiledExternally(businessId, adminId, periodId, { filedAt: "2030-07-20", filingReference: "EMARATAX-USER-REF" });
    const filed = getVatPeriod(businessId, adminId, periodId)!;
    assert.equal(filed.period.status, "filed_externally");
    assert.equal(filed.period.filing_reference, "EMARATAX-USER-REF");
    const firstFiledSnapshot = filed.snapshots.find((row) => row.snapshot_kind === "filed_externally")!;
    const frozenJson = String(firstFiledSnapshot.snapshot_json);
    const filedPayload = JSON.parse(frozenJson) as { filedExternally: { filedAt: string; filedBy: string; filingReference: string; recordedAt: string; submissionPerformedByErp: boolean } };
    assert.equal(filedPayload.filedExternally.filedAt, "2030-07-20");
    assert.equal(filedPayload.filedExternally.filedBy, adminId);
    assert.equal(filedPayload.filedExternally.filingReference, "EMARATAX-USER-REF");
    assert.match(filedPayload.filedExternally.recordedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(filedPayload.filedExternally.submissionPerformedByErp, false);

    reopenVatPeriod(businessId, adminId, periodId, { reason: "Post-filing correction reviewed externally" });
    createInvoice(businessId, adminId, { ...saleInput("PH6-AFTER-FILING", "10.00", codes.zero), invoiceDate: "2030-06-25", taxDate: "2030-06-25" }, "post");
    const unchanged = sqlite.prepare("SELECT snapshot_json FROM vat_period_snapshots WHERE id = ?").get(String(firstFiledSnapshot.id)) as { snapshot_json: string };
    assert.equal(unchanged.snapshot_json, frozenJson);
    assert.ok(!String((getVatPeriod(businessId, adminId, periodId)!.audit.find((row) => row.action === "filed_externally")?.reason_or_reference) ?? "").toLowerCase().includes("submitted"));

    finalizeVatPeriod(businessId, adminId, periodId);
    markVatPeriodFiledExternally(businessId, adminId, periodId, { filedAt: "2030-07-21", filingReference: "EMARATAX-CORRECTED-REF" });
  });

  await suite.test("VAT data is permission-aware, business-isolated, and preserved by backup", async () => {
    assert.equal(getBusinessAccess(businessId, standardUserId)?.membership.role, "standard");
    assert.equal(canAccessModule(businessId, standardUserId, "settings"), false);
    assert.equal(canAccessModule(businessId, adminId, "settings"), true);

    const other = createBusiness({ name: "Phase 6 Isolated Business", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 1 }, adminId);
    const isolated = getBusinessDb(other.id, adminId).sqlite;
    assert.equal((isolated.prepare("SELECT COUNT(*) AS count FROM vat_periods").get() as { count: number }).count, 0);
    assert.equal((isolated.prepare("SELECT COUNT(*) AS count FROM tax_entries").get() as { count: number }).count, 0);

    const expectedEntries = (sqlite.prepare("SELECT COUNT(*) AS count FROM tax_entries").get() as { count: number }).count;
    const expectedSnapshots = (sqlite.prepare("SELECT COUNT(*) AS count FROM vat_period_snapshots").get() as { count: number }).count;
    const backup = await exportBusinessBackup(businessId, adminId);
    const importedId = await importBusinessBackup(Uint8Array.from(backup).buffer, adminId);
    const imported = getBusinessDb(importedId, adminId).sqlite;
    assert.equal((imported.prepare("SELECT COUNT(*) AS count FROM tax_entries").get() as { count: number }).count, expectedEntries);
    assert.equal((imported.prepare("SELECT COUNT(*) AS count FROM vat_period_snapshots").get() as { count: number }).count, expectedSnapshots);
    assert.equal((imported.prepare("SELECT status FROM vat_periods WHERE id = ?").get(periodId) as { status: string }).status, "filed_externally");
  });
});
