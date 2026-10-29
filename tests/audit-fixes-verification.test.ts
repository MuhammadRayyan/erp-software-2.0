import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const testDataDir = mkdtempSync(path.join(tmpdir(), "audit-fixes-verification-"));

Object.assign(process.env, {
  ERP_DATA_DIR: testDataDir,
  BETTER_AUTH_SECRET: "audit-fixes-test-secret-64-bytes-long-super-secret-key-ok",
  SETUP_KEY: "audit-fixes-test-setup-key-12345678901234567890",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { getSystemSqlite } = await import("../src/core/db/system");
const { checkDatabases } = await import("../src/core/db/check");
const { reconcileBusinessDatabase } = await import("../src/core/db/reconciliation");
const { importManagerBackupToNewBusiness } = await import("../src/modules/migration/manager-importer");
const { BUSINESSES_DIRECTORY } = await import("../src/core/db/paths");
const { getRelatedDocumentPath } = await import("../src/app/b/[businessId]/emails/page");
const { primaryNav } = await import("../src/components/app-shell/nav-items");
const {
  installPostedCurrencyImmutabilityTriggers,
} = await import("../src/modules/currency/exchange-rate");
const { runActivityLogCleanup } = await import("../src/modules/activity-log/activity-log-service");

test("Audited Architectural & Functional Fixes Verification Suite", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;

  await suite.test("1. P0: checkDatabases ignores orphaned unregistered business folders on disk", () => {
    // Intentionally create an orphaned business folder in BUSINESSES_DIRECTORY with an obsolete schema
    const orphanedDirKey = `orphaned-biz-${Date.now()}`;
    const orphanedPath = path.join(BUSINESSES_DIRECTORY, orphanedDirKey);
    mkdirSync(orphanedPath, { recursive: true });
    const orphanedDb = new Database(path.join(orphanedPath, "business.sqlite"));
    try {
      orphanedDb.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
        INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'initial', datetime('now'));
      `);
    } finally {
      orphanedDb.close();
    }

    // checkDatabases should only inspect registered businesses and succeed cleanly!
    const checkResult = checkDatabases({ deep: false });
    assert.ok(checkResult.systemVersion > 0);
    assert.ok(checkResult.businesses.length >= 1);
    const checkedLabels = checkResult.businesses.map((b) => b.label);
    assert.ok(checkedLabels.includes(`business ${businessId}`));
    assert.ok(!checkedLabels.some((l) => l.includes(orphanedDirKey)));

    // Deep check should also succeed
    const deepResult = checkDatabases({ deep: true });
    assert.ok(deepResult.businesses.length >= 1);

    // Clean up orphaned test directory
    rmSync(orphanedPath, { recursive: true, force: true });
  });

  await suite.test("2. P0: Manager.io importer uses synchronous = FULL and passes reconciliation", () => {
    const legacyFilePath = path.resolve(process.cwd(), "manager_backup_file.manager");
    if (!existsSync(legacyFilePath)) {
      return;
    }
    const fileBuffer = readFileSync(legacyFilePath);
    const result = importManagerBackupToNewBusiness(fileBuffer, adminId, {
      overrideBusinessName: "Manager Import Reconciliation Test",
      documentStatus: "posted",
    });
    assert.ok(result.businessId);

    const context = getBusinessDb(result.businessId, adminId);

    // Verify pragma synchronous is FULL (value 2 in SQLite pragma synchronous)
    const syncPragma = context.sqlite.pragma("synchronous", { simple: true });
    // SQLite synchronous pragma returns 2 for FULL, 1 for NORMAL, 0 for OFF
    assert.equal(syncPragma, 2, "synchronous pragma must be FULL (2) after Manager import");

    // Verify payslip_lines were inserted
    const payslipLinesCount = (
      context.sqlite.prepare("SELECT COUNT(*) AS count FROM payslip_lines").get() as { count: number }
    ).count;
    assert.ok(payslipLinesCount > 0, "Manager import must create payslip lines for imported payslips");

    // Verify reconcileBusinessDatabase succeeds on imported business
    const reconResult = reconcileBusinessDatabase(context.sqlite);
    assert.equal(reconResult.unbalancedJournals, 0);
    assert.equal(reconResult.invalidPostedPayslips, 0);
    assert.equal(reconResult.invalidPayslipTotals, 0);
    assert.equal(reconResult.missingDocumentJournals, 0);
  });

  await suite.test("3. P0: Standard business reconciliation still catches unjournaled posted documents", () => {
    const context = getBusinessDb(businessId, adminId);
    const testInvId = randomUUID();
    const now = new Date().toISOString();

    // Insert an unjournaled posted sales invoice created NOW (after any setup)
    context.sqlite.prepare(`
      INSERT INTO sales_invoices (
        id, invoice_number, customer_id, invoice_date, tax_date, supply_emirate, due_date,
        document_status, subtotal_minor, tax_minor, total_minor,
        currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
        base_subtotal_minor, base_tax_minor, base_total_minor,
        created_by, created_at, updated_at
      ) VALUES (
        ?, 'TEST-UNJOURNALED-INV', (SELECT id FROM customers LIMIT 1), '2026-10-29', '2026-10-29', 'dubai', '2026-10-29',
        'posted', 10000, 500, 10500,
        'AED', '1', '2026-10-29', 'Base',
        10000, 500, 10500,
        ?, ?, ?
      )
    `).run(testInvId, adminId, now, now);

    try {
      assert.throws(
        () => reconcileBusinessDatabase(context.sqlite),
        /Financial reconciliation failed.*missingDocumentJournals/,
        "Standard business must strictly detect missing document journals for posted invoices"
      );
    } finally {
      context.sqlite.prepare("DELETE FROM sales_invoices WHERE id = ?").run(testInvId);
    }
  });

  await suite.test("4. P1: Sent Emails navigation and multi-document linking helper", () => {
    // Test navigation entries
    const salesGroup = primaryNav.find((g) => g.label === "Sales");
    assert.ok(salesGroup, "Sales nav group must exist");
    assert.ok(
      salesGroup.items.some((i) => i.path === "/emails" && i.module === "sales"),
      "Sales nav group must have Sent Emails"
    );

    const purchasesGroup = primaryNav.find((g) => g.label === "Purchases");
    assert.ok(purchasesGroup, "Purchases nav group must exist");
    assert.ok(
      purchasesGroup.items.some((i) => i.path === "/emails" && i.module === "purchases"),
      "Purchases nav group must have Sent Emails accessible to purchases users"
    );

    // Test getRelatedDocumentPath for all 6 document types + purchases invoice
    const bId = "test-biz";
    assert.equal(getRelatedDocumentPath(bId, "sales_invoice", "inv-1"), "/b/test-biz/sales/invoices/inv-1");
    assert.equal(getRelatedDocumentPath(bId, "sales_quote", "sq-1"), "/b/test-biz/sales/quotes/sq-1");
    assert.equal(getRelatedDocumentPath(bId, "sales_order", "so-1"), "/b/test-biz/sales/orders/so-1");
    assert.equal(getRelatedDocumentPath(bId, "purchase_invoice", "pi-1"), "/b/test-biz/purchases/invoices/pi-1");
    assert.equal(getRelatedDocumentPath(bId, "purchase_order", "po-1"), "/b/test-biz/purchases/orders/po-1");
    assert.equal(getRelatedDocumentPath(bId, "purchase_quote", "pq-1"), "/b/test-biz/purchases/quotes/pq-1");
    assert.equal(getRelatedDocumentPath(bId, "debit_note", "dn-1"), "/b/test-biz/purchases/debit-notes/dn-1");
    assert.equal(getRelatedDocumentPath(bId, null, "any"), null);
    assert.equal(getRelatedDocumentPath(bId, "unknown_type", "any"), null);
  });

  await suite.test("5. P1: Currency immutability triggers for debit_notes, receipts, and supplier_payments", () => {
    const context = getBusinessDb(businessId, adminId);
    const sqlite = context.sqlite;

    // Ensure triggers are installed
    installPostedCurrencyImmutabilityTriggers(sqlite);

    const now = new Date().toISOString();
    const supplierId = (sqlite.prepare("SELECT id FROM suppliers LIMIT 1").get() as { id: string }).id;
    const customerId = (sqlite.prepare("SELECT id FROM customers LIMIT 1").get() as { id: string }).id;
    const bankAccountId = (sqlite.prepare("SELECT id FROM accounts WHERE type = 'asset' LIMIT 1").get() as { id: string }).id;

    // --- A. DEBIT NOTE IMMUTABILITY ---
    const debitNoteId = randomUUID();
    sqlite.prepare(`
      INSERT INTO debit_notes (
        id, debit_note_number, supplier_id, debit_note_date, tax_date,
        document_status, subtotal_minor, tax_minor, total_minor,
        currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
        base_subtotal_minor, base_tax_minor, base_total_minor,
        created_by, created_at, updated_at
      ) VALUES (
        ?, 'DN-IMMUTABLE-TEST', ?, '2026-10-29', '2026-10-29',
        'posted', 1000, 50, 1050,
        'AED', '1', '2026-10-29', 'Base',
        1000, 50, 1050,
        ?, ?, ?
      )
    `).run(debitNoteId, supplierId, adminId, now, now);

    try {
      assert.throws(
        () => sqlite.prepare("UPDATE debit_notes SET currency_code = 'USD' WHERE id = ?").run(debitNoteId),
        /Posted document currency and exchange rate are immutable/
      );
      assert.throws(
        () => sqlite.prepare("UPDATE debit_notes SET exchange_rate_to_base = '3.67' WHERE id = ?").run(debitNoteId),
        /Posted document currency and exchange rate are immutable/
      );
    } finally {
      sqlite.prepare("DELETE FROM debit_notes WHERE id = ?").run(debitNoteId);
    }

    // --- B. RECEIPT IMMUTABILITY ---
    const receiptId = randomUUID();
    sqlite.prepare(`
      INSERT INTO receipts (
        id, receipt_number, customer_id, date, bank_account_id,
        amount_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
        base_amount_minor, released_carrying_amount_minor, realized_fx_amount_minor,
        document_status, created_by, created_at, posted_at
      ) VALUES (
        ?, 'RCV-IMMUTABLE-TEST', ?, '2026-10-29', ?,
        5000, 'AED', '1', '2026-10-29', 'Base',
        5000, 5000, 0,
        'posted', ?, ?, ?
      )
    `).run(receiptId, customerId, bankAccountId, adminId, now, now);

    try {
      assert.throws(
        () => sqlite.prepare("UPDATE receipts SET currency_code = 'USD' WHERE id = ?").run(receiptId),
        /Posted document currency and exchange rate are immutable/
      );
      assert.throws(
        () => sqlite.prepare("UPDATE receipts SET exchange_rate_to_base = '3.67' WHERE id = ?").run(receiptId),
        /Posted document currency and exchange rate are immutable/
      );
    } finally {
      sqlite.prepare("DELETE FROM receipts WHERE id = ?").run(receiptId);
    }

    // --- C. SUPPLIER PAYMENT IMMUTABILITY ---
    const paymentId = randomUUID();
    sqlite.prepare(`
      INSERT INTO supplier_payments (
        id, payment_number, supplier_id, date, bank_account_id,
        amount_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
        base_amount_minor, released_carrying_amount_minor, realized_fx_amount_minor,
        document_status, created_by, created_at, posted_at
      ) VALUES (
        ?, 'PAY-IMMUTABLE-TEST', ?, '2026-10-29', ?,
        5000, 'AED', '1', '2026-10-29', 'Base',
        5000, 5000, 0,
        'posted', ?, ?, ?
      )
    `).run(paymentId, supplierId, bankAccountId, adminId, now, now);

    try {
      assert.throws(
        () => sqlite.prepare("UPDATE supplier_payments SET currency_code = 'USD' WHERE id = ?").run(paymentId),
        /Posted document currency and exchange rate are immutable/
      );
      assert.throws(
        () => sqlite.prepare("UPDATE supplier_payments SET exchange_rate_to_base = '3.67' WHERE id = ?").run(paymentId),
        /Posted document currency and exchange rate are immutable/
      );
    } finally {
      sqlite.prepare("DELETE FROM supplier_payments WHERE id = ?").run(paymentId);
    }
  });

  await suite.test("6. P2: Playwright configuration fallback test", async () => {
    const configPath = path.resolve(process.cwd(), "playwright.hardening.config.ts");
    const content = readFileSync(configPath, "utf-8");
    assert.ok(content.includes('existsSync(path.resolve(process.cwd(), ".next-validate"))'));
    assert.ok(content.includes('? ".next-validate" : ".next"'));
  });

  await suite.test("7. P0: checkDatabases ignores businesses marked with status = 'trash'", () => {
    const systemSqlite = getSystemSqlite();
    const trashedBizId = `trashed-biz-${Date.now()}`;
    const trashedDirKey = `nonexistent-dir-${Date.now()}`;
    const now = new Date().toISOString();

    // Insert a trashed business whose disk directory does NOT exist
    systemSqlite.prepare(`
      INSERT INTO businesses (
        id, name, country, currency, financial_year_start_month,
        directory_key, status, created_at, updated_at
      ) VALUES (?, 'Trashed Test Biz', 'AE', 'AED', 1, ?, 'trash', ?, ?)
    `).run(trashedBizId, trashedDirKey, now, now);

    try {
      // Must not throw even though the folder does not exist on disk
      const checkResult = checkDatabases({ deep: false });
      assert.ok(checkResult.businesses.every((b) => !b.label.includes(trashedBizId)));

      const deepResult = checkDatabases({ deep: true });
      assert.ok(deepResult.businesses.every((b) => !b.label.includes(trashedBizId)));
    } finally {
      systemSqlite.prepare("DELETE FROM businesses WHERE id = ?").run(trashedBizId);
    }
  });

  await suite.test("8. P0: Manager.io payslip lines balance with deductions and satisfy reconciliation", () => {
    const context = getBusinessDb(businessId, adminId);
    const slipId = randomUUID();
    const empId = (context.sqlite.prepare("SELECT id FROM employees LIMIT 1").get() as { id: string })?.id;
    if (!empId) return;

    const grossMinor = 500000;
    const deductionsMinor = 50000;
    const netMinor = 450000;
    const now = new Date().toISOString();

    context.sqlite.prepare(`
      INSERT INTO payslips (
        id, payslip_number, employee_id, date, gross_amount_minor, deductions_minor, net_amount_minor,
        document_status, created_by, created_at, posted_at, updated_at
      ) VALUES (?, 'PS-DEDUCT-TEST', ?, '2026-10-29', ?, ?, ?, 'draft', ?, ?, NULL, ?)
    `).run(slipId, empId, grossMinor, deductionsMinor, netMinor, adminId, now, now);

    context.sqlite.prepare(`
      INSERT INTO payslip_lines (id, payslip_id, item_id, type, description, account_id, amount_minor, position)
      VALUES (?, ?, NULL, 'earnings', 'Basic Salary', 'acct-salaries-expense-6100', ?, 1)
    `).run(randomUUID(), slipId, grossMinor);

    context.sqlite.prepare(`
      INSERT INTO payslip_lines (id, payslip_id, item_id, type, description, account_id, amount_minor, position)
      VALUES (?, ?, NULL, 'deduction', 'Health Insurance', 'acct-payroll-payable-2200', ?, 2)
    `).run(randomUUID(), slipId, deductionsMinor);

    try {
      const recon = reconcileBusinessDatabase(context.sqlite);
      assert.equal(recon.invalidPayslipTotals, 0);
    } finally {
      context.sqlite.prepare("DELETE FROM payslip_lines WHERE payslip_id = ?").run(slipId);
      context.sqlite.prepare("DELETE FROM payslips WHERE id = ?").run(slipId);
    }
  });

  await suite.test("9. P0: pruneActivityLogs preserves business_profile genesis import logs", () => {
    const context = getBusinessDb(businessId, adminId);
    const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    // Insert an old Manager.io import activity log and an old non-genesis activity log
    const genesisLogId = randomUUID();
    const transientLogId = randomUUID();

    context.sqlite.prepare(`
      INSERT INTO activity_logs (
        id, business_id, user_id, user_name, user_email,
        action, entity_type, entity_id, entity_number,
        summary, details_json, created_at
      ) VALUES (?, ?, ?, 'Admin', 'admin@example.com', 'created', 'business_profile', ?, 'Test Biz',
        'Imported business from Manager.io', '{"source":"manager.io"}', ?)
    `).run(genesisLogId, businessId, adminId, businessId, oldDate);

    context.sqlite.prepare(`
      INSERT INTO activity_logs (
        id, business_id, user_id, user_name, user_email,
        action, entity_type, entity_id, entity_number,
        summary, details_json, created_at
      ) VALUES (?, ?, ?, 'Admin', 'admin@example.com', 'viewed', 'sales_invoice', 'inv-1', 'INV-001',
        'Viewed invoice', NULL, ?)
    `).run(transientLogId, businessId, adminId, oldDate);

    try {
      // Run retention pruning with 0 days (prune all old logs)
      runActivityLogCleanup(businessId, adminId, 0);

      // Transient log should be deleted
      const transient = context.sqlite.prepare("SELECT 1 FROM activity_logs WHERE id = ?").get(transientLogId);
      assert.equal(transient, undefined, "Transient log must be pruned");

      // Genesis business_profile import log MUST be preserved
      const genesis = context.sqlite.prepare("SELECT 1 FROM activity_logs WHERE id = ?").get(genesisLogId);
      assert.ok(genesis, "Genesis business_profile import log must be preserved across retention pruning");

      // Reconcile must still work and find the import log
      const recon = reconcileBusinessDatabase(context.sqlite);
      assert.equal(recon.unbalancedJournals, 0);
    } finally {
      context.sqlite.prepare("DELETE FROM activity_logs WHERE id IN (?, ?)").run(genesisLogId, transientLogId);
    }
  });

  await suite.test("10. P1: getRelatedDocumentPath supports dashed entity types and additional modules", () => {
    const bId = "test-biz";
    assert.equal(getRelatedDocumentPath(bId, "sales-invoice", "inv-1"), "/b/test-biz/sales/invoices/inv-1");
    assert.equal(getRelatedDocumentPath(bId, "sales-quote", "sq-1"), "/b/test-biz/sales/quotes/sq-1");
    assert.equal(getRelatedDocumentPath(bId, "sales-order", "so-1"), "/b/test-biz/sales/orders/so-1");
    assert.equal(getRelatedDocumentPath(bId, "purchase-invoice", "pi-1"), "/b/test-biz/purchases/invoices/pi-1");
    assert.equal(getRelatedDocumentPath(bId, "purchase-order", "po-1"), "/b/test-biz/purchases/orders/po-1");
    assert.equal(getRelatedDocumentPath(bId, "purchase-quote", "pq-1"), "/b/test-biz/purchases/quotes/pq-1");
    assert.equal(getRelatedDocumentPath(bId, "debit-note", "dn-1"), "/b/test-biz/purchases/debit-notes/dn-1");
    assert.equal(getRelatedDocumentPath(bId, "receipt", "rcv-1"), "/b/test-biz/sales/receipts/rcv-1");
    assert.equal(getRelatedDocumentPath(bId, "sales_receipt", "rcv-2"), "/b/test-biz/sales/receipts/rcv-2");
    assert.equal(getRelatedDocumentPath(bId, "sales-credit-note", "cn-1"), "/b/test-biz/sales/credit-notes/cn-1");
    assert.equal(getRelatedDocumentPath(bId, "delivery-note", "dn-2"), "/b/test-biz/sales/delivery-notes/dn-2");
    assert.equal(getRelatedDocumentPath(bId, "goods-receipt", "gr-1"), "/b/test-biz/purchases/goods-receipts/gr-1");
    assert.equal(getRelatedDocumentPath(bId, "supplier-payment", "pay-1"), "/b/test-biz/purchases/payments/pay-1");
  });

  await suite.test("11. P1: installPostedCurrencyImmutabilityTriggers is idempotent", () => {
    const context = getBusinessDb(businessId, adminId);
    // Running install multiple times should not throw
    installPostedCurrencyImmutabilityTriggers(context.sqlite);
    installPostedCurrencyImmutabilityTriggers(context.sqlite);
  });
});
