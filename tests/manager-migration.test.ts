import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { inspectManagerBackup, importManagerBackupToNewBusiness } from "../src/modules/migration/manager-importer";
import { getBusinessDb } from "../src/core/db/business";
import { getSystemDb } from "../src/core/db/system";
import { users } from "../src/core/db/system-schema";
import { exportBusinessBackup, importBusinessBackup } from "../src/core/businesses/backup-service";

test("Manager.io Universal Migration & Contracting Architecture Suite", async (t) => {
  const legacyFilePath = path.resolve(process.cwd(), "manager_backup_file.manager");
  const contractingFilePath1 = path.resolve(process.cwd(), "Al Qamar Al Muneer Tech. Cont.  (2026-10-19).manager");
  const contractingFilePath2 = path.resolve(process.cwd(), "AQAMTC_(Saleem) (2026-10-19).manager");

  // Setup test user
  const systemDb = getSystemDb();
  const testUserId = "manager-migration-test-user";
  systemDb.insert(users).values({
    id: testUserId,
    name: "Migration Test Admin",
    email: "migration-test@uaemanager.internal",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing().run();

  let importedLegacyBusinessId: string | undefined;
  let importedContractingBusinessId: string | undefined;

  // -------------------------------------------------------------
  // PART 1: LEGACY BENCHMARK (MASS AUTO REPARING)
  // -------------------------------------------------------------
  await t.test("1. Inspect Legacy Manager.io backup metadata (MASS AUTO REPARING)", () => {
    const fileBuffer = readFileSync(legacyFilePath);
    const start = Date.now();
    const inspection = inspectManagerBackup(fileBuffer);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 100, `Inspection took ${elapsed}ms; should be < 100ms`);
    assert.equal(inspection.businessName, "MASS AUTO REPARING");
    assert.equal(inspection.trn, "100565644000003");
    assert.equal(inspection.country, "United Arab Emirates");
    assert.equal(inspection.currency, "AED");
    assert.equal(inspection.customersCount, 307);
    assert.equal(inspection.suppliersCount, 148);
    assert.equal(inspection.inventoryItemsCount, 645);
    assert.equal(inspection.fixedAssetsCount, 251);
    assert.equal(inspection.projectsCount, 955);
    assert.equal(inspection.salesInvoicesCount, 68);
    assert.equal(inspection.purchaseInvoicesCount, 105);
    assert.equal(inspection.salesQuotesCount, 183);
    assert.equal(inspection.salesOrdersCount, 1);
    assert.equal(inspection.bankTransfersCount, 24);
    assert.equal(inspection.bankAccountsCount, 7);
    assert.equal(inspection.accountsCount, 61);
  });

  await t.test("2. Migrate Legacy Manager.io backup with Active Ledger Mode", () => {
    const fileBuffer = readFileSync(legacyFilePath);
    const result = importManagerBackupToNewBusiness(fileBuffer, testUserId, {
      overrideBusinessName: "MASS AUTO REPARING (Migrated)",
      documentStatus: "posted",
    });
    assert.ok(result.businessId);
    importedLegacyBusinessId = result.businessId;

    const context = getBusinessDb(result.businessId, testUserId);
    const customersCount = (context.sqlite.prepare("SELECT count(*) as c FROM customers").get() as any).c;
    assert.equal(customersCount, 307);

    const suppliersCount = (context.sqlite.prepare("SELECT count(*) as c FROM suppliers").get() as any).c;
    assert.equal(suppliersCount, 148);

    const projectsCount = (context.sqlite.prepare("SELECT count(*) as c FROM projects").get() as any).c;
    assert.equal(projectsCount, 955);

    const itemsCount = (context.sqlite.prepare("SELECT count(*) as c FROM inventory_items").get() as any).c;
    assert.equal(itemsCount, 645 + 251);

    const invoices = context.sqlite.prepare("SELECT count(*) as c, sum(CASE WHEN document_status = 'posted' THEN 1 ELSE 0 END) as p FROM sales_invoices").get() as any;
    assert.equal(invoices.c, 68);
    assert.equal(invoices.p, 68);

    const bills = context.sqlite.prepare("SELECT count(*) as c, sum(CASE WHEN document_status = 'posted' THEN 1 ELSE 0 END) as p FROM purchase_invoices").get() as any;
    assert.equal(bills.c, 105);
    assert.equal(bills.p, 105);
  });

  // -------------------------------------------------------------
  // PART 2: MODERN CONTRACTING (AL QAMAR AL MUNEER TECH. CONT. - 31MB)
  // -------------------------------------------------------------
  if (existsSync(contractingFilePath1)) {
    await t.test("3. Inspect Modern Contracting Backup (Al Qamar - 31.2 MB) with optional performance budget", () => {
      const fileBuffer = readFileSync(contractingFilePath1);
      const start = Date.now();
      const inspection = inspectManagerBackup(fileBuffer);
      const elapsed = Date.now() - start;

      if (process.env.ERP_RUN_PERF === "1") assert.ok(elapsed < 500, `Inspection exceeded the controlled performance budget: ${elapsed}ms`);
      assert.equal(inspection.businessName, "Al Qamar Al Muneer Tech. Cont.");
      assert.equal(inspection.trn, "104959072000003");
      assert.equal(inspection.customersCount, 89);
      assert.equal(inspection.suppliersCount, 490);
      assert.equal(inspection.projectsCount, 70);
      assert.equal(inspection.inventoryItemsCount, 71);
      assert.equal(inspection.bankAccountsCount, 7);
      assert.equal(inspection.bankTransfersCount, 416);
      assert.equal(inspection.salesInvoicesCount, 169);
      assert.equal(inspection.purchaseInvoicesCount, 3545);
      assert.equal(inspection.salesQuotesCount, 244);
      assert.equal(inspection.salesOrdersCount, 124);
      assert.equal(inspection.receiptsCount, 172);
      assert.equal(inspection.paymentsCount, 3881);
      assert.equal(inspection.employeesCount, 19);
      assert.equal(inspection.payslipsCount, 205);
      assert.equal(inspection.journalEntriesCount, 6);
    });

    await t.test("4. Full High-Speed Migration of Al Qamar Contracting Ledger (8,500+ Transactions)", () => {
      const fileBuffer = readFileSync(contractingFilePath1);
      const start = Date.now();
      const result = importManagerBackupToNewBusiness(fileBuffer, testUserId, {
        overrideBusinessName: "Al Qamar Al Muneer Tech. Cont. (Active Ledger)",
        documentStatus: "posted",
      });
      const elapsed = Date.now() - start;
      console.log(`[TEST INFO] 31MB Al Qamar ingestion completed in ${elapsed}ms`);

      assert.ok(result.businessId);
      importedContractingBusinessId = result.businessId;

      const context = getBusinessDb(result.businessId, testUserId);

      // Verify Customers & Suppliers
      const custCount = (context.sqlite.prepare("SELECT count(*) as c FROM customers").get() as any).c;
      assert.equal(custCount, 89);
      const suppCount = (context.sqlite.prepare("SELECT count(*) as c FROM suppliers").get() as any).c;
      assert.equal(suppCount, 490);

      // Verify Contracting Sites / Projects
      const prjCount = (context.sqlite.prepare("SELECT count(*) as c FROM projects").get() as any).c;
      assert.equal(prjCount, 70);

      // Verify Sales Orders
      const orderCount = (context.sqlite.prepare("SELECT count(*) as c FROM sales_orders").get() as any).c;
      assert.equal(orderCount, 124);

      // Verify Sales Invoices & Line Projects
      const invCount = (context.sqlite.prepare("SELECT count(*) as c FROM sales_invoices WHERE document_status = 'posted'").get() as any).c;
      assert.equal(invCount, 169);

      // Verify Purchase Bills & Line Projects
      const billCount = (context.sqlite.prepare("SELECT count(*) as c FROM purchase_invoices WHERE document_status = 'posted'").get() as any).c;
      assert.equal(billCount, 3545);

      // Verify Customer Receipts & Allocations
      const rcvCount = (context.sqlite.prepare("SELECT count(*) as c FROM receipts WHERE document_status = 'posted'").get() as any).c;
      assert.equal(rcvCount, 172);
      const rcvAllocCount = (context.sqlite.prepare("SELECT count(*) as c FROM receipt_allocations").get() as any).c;
      assert.ok(rcvAllocCount > 0, "Receipt allocations must be populated for customer payments");

      // Verify Supplier Payments & Allocations
      const payCount = (context.sqlite.prepare("SELECT count(*) as c FROM supplier_payments WHERE document_status = 'posted'").get() as any).c;
      assert.equal(payCount, 3881);
      const payAllocCount = (context.sqlite.prepare("SELECT count(*) as c FROM supplier_payment_allocations").get() as any).c;
      assert.ok(payAllocCount > 0, "Supplier payment allocations must be populated for bill payments");

      // Verify Employees (Migration 33)
      const empCount = (context.sqlite.prepare("SELECT count(*) as c FROM employees").get() as any).c;
      assert.equal(empCount, 19);

      // Verify Payslips (Migration 33)
      const slipCount = (context.sqlite.prepare("SELECT count(*) as c FROM payslips WHERE document_status = 'posted'").get() as any).c;
      assert.equal(slipCount, 205);

      // Verify Journal Entries
      const jeCount = (context.sqlite.prepare("SELECT count(*) as c FROM journal_entries").get() as any).c;
      assert.equal(jeCount, 6);
    });
  }

  // -------------------------------------------------------------
  // PART 3: SECOND BACKUP VERIFICATION (AQAMTC SALIM - 4.58MB)
  // -------------------------------------------------------------
  if (existsSync(contractingFilePath2)) {
    await t.test("5. Migrate AQAMTC Salim in Draft Review Mode", () => {
      const fileBuffer = readFileSync(contractingFilePath2);
      const result = importManagerBackupToNewBusiness(fileBuffer, testUserId, {
        overrideBusinessName: "AQAMTC Saleem (Draft Review)",
        documentStatus: "draft",
      });
      assert.ok(result.businessId);

      const context = getBusinessDb(result.businessId, testUserId);
      const invDrafts = (context.sqlite.prepare("SELECT count(*) as c FROM sales_invoices WHERE document_status = 'draft'").get() as any).c;
      assert.equal(invDrafts, 139);

      const billDrafts = (context.sqlite.prepare("SELECT count(*) as c FROM purchase_invoices WHERE document_status = 'draft'").get() as any).c;
      assert.equal(billDrafts, 3110);

      const empCount = (context.sqlite.prepare("SELECT count(*) as c FROM employees").get() as any).c;
      assert.equal(empCount, 18);

      const slipCount = (context.sqlite.prepare("SELECT count(*) as c FROM payslips WHERE document_status = 'draft'").get() as any).c;
      assert.equal(slipCount, 176);
    });
  }

  // -------------------------------------------------------------
  // PART 4: NATIVE .ERPBACKUP ROUNDTRIP PRESERVATION
  // -------------------------------------------------------------
  await t.test("6. Native .erpbackup export and restore preserves contracting entities (Employees, Payslips)", async () => {
    const targetBusinessId = importedContractingBusinessId || importedLegacyBusinessId;
    assert.ok(targetBusinessId);

    // Export .erpbackup
    const backupBuffer = await exportBusinessBackup(targetBusinessId, testUserId);
    assert.ok(backupBuffer.byteLength > 1000);

    // Re-import .erpbackup into fresh workspace
    const reimportedId = await importBusinessBackup(backupBuffer, testUserId);
    assert.ok(reimportedId);

    // Verify database contents in re-imported business
    const reimportedContext = getBusinessDb(reimportedId, testUserId);
    if (importedContractingBusinessId) {
      const empCount = (reimportedContext.sqlite.prepare("SELECT count(*) as c FROM employees").get() as any).c;
      assert.equal(empCount, 19, "Employees must be 100% preserved in .erpbackup roundtrip");
      const slipCount = (reimportedContext.sqlite.prepare("SELECT count(*) as c FROM payslips").get() as any).c;
      assert.equal(slipCount, 205, "Payslips must be 100% preserved in .erpbackup roundtrip");
    } else {
      const custCount = (reimportedContext.sqlite.prepare("SELECT count(*) as c FROM customers").get() as any).c;
      assert.equal(custCount, 307);
    }
  });
});
