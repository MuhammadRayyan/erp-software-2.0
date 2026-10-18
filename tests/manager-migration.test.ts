import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inspectManagerBackup, importManagerBackupToNewBusiness } from "../src/modules/migration/manager-importer";
import { getBusinessDb } from "../src/core/db/business";
import { getSystemDb } from "../src/core/db/system";
import { businesses, memberships, users } from "../src/core/db/system-schema";
import { eq } from "drizzle-orm";
import { exportBusinessBackup, importBusinessBackup } from "../src/core/businesses/backup-service";

test("Manager.io Migration & Native Backup Verification Suite", async (t) => {
  const managerFilePath = path.resolve(process.cwd(), "manager_backup_file.manager");
  const fileBuffer = readFileSync(managerFilePath);

  // Setup test user
  const systemDb = getSystemDb();
  const testUserId = "manager-migration-test-user";
  systemDb.insert(users).values({
    id: testUserId,
    name: "Migration Test Admin",
    email: "migration-test@ledgerly.internal",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing().run();

  let importedBusinessId: string | undefined;

  await t.test("1. Inspect Manager.io backup metadata and entity counts", () => {
    const inspection = inspectManagerBackup(fileBuffer);
    assert.equal(inspection.businessName, "MASS AUTO REPARING");
    assert.equal(inspection.trn, "100565644000003");
    assert.equal(inspection.country, "United Arab Emirates");
    assert.equal(inspection.currency, "AED");
    assert.equal(inspection.customersCount, 307);
    assert.equal(inspection.suppliersCount, 148);
    assert.equal(inspection.inventoryItemsCount, 645);
    assert.equal(inspection.fixedAssetsCount, 251);
    assert.equal(inspection.projectsCount, 955);
    assert.equal(inspection.salesInvoicesCount, 63);
    assert.equal(inspection.purchaseInvoicesCount, 99);
    assert.equal(inspection.salesQuotesCount, 180);
    assert.equal(inspection.bankTransfersCount, 24);
    assert.equal(inspection.bankAccountsCount, 7);
    assert.equal(inspection.accountsCount, 61);
  });

  await t.test("2. Execute full migration into a new business workspace", () => {
    const result = importManagerBackupToNewBusiness(fileBuffer, testUserId, "MASS AUTO REPARING (Migrated)");
    assert.ok(result.businessId);
    importedBusinessId = result.businessId;

    // Verify system DB registration
    const biz = systemDb.select().from(businesses).where(eq(businesses.id, result.businessId)).get();
    assert.ok(biz);
    assert.equal(biz.name, "MASS AUTO REPARING (Migrated)");
    assert.equal(biz.currency, "AED");

    // Verify membership
    const mem = systemDb.select().from(memberships).where(eq(memberships.businessId, result.businessId)).get();
    assert.ok(mem);
    assert.equal(mem.userId, testUserId);
    assert.equal(mem.role, "administrator");

    // Verify business database contents
    const context = getBusinessDb(result.businessId, testUserId);
    const customersCount = (context.sqlite.prepare("SELECT count(*) as c FROM customers").get() as any).c;
    assert.equal(customersCount, 307);

    const suppliersCount = (context.sqlite.prepare("SELECT count(*) as c FROM suppliers").get() as any).c;
    assert.equal(suppliersCount, 148);

    const projectsCount = (context.sqlite.prepare("SELECT count(*) as c FROM projects").get() as any).c;
    assert.equal(projectsCount, 955);

    const itemsCount = (context.sqlite.prepare("SELECT count(*) as c FROM inventory_items").get() as any).c;
    // 645 items + 251 equipment assets
    assert.equal(itemsCount, 645 + 251);

    const salesInvoicesCount = (context.sqlite.prepare("SELECT count(*) as c FROM sales_invoices").get() as any).c;
    assert.equal(salesInvoicesCount, 63);

    const purchaseInvoicesCount = (context.sqlite.prepare("SELECT count(*) as c FROM purchase_invoices").get() as any).c;
    assert.equal(purchaseInvoicesCount, 99);

    const quotesCount = (context.sqlite.prepare("SELECT count(*) as c FROM sales_quotes").get() as any).c;
    assert.equal(quotesCount, 180);

    const bankTransfersCount = (context.sqlite.prepare("SELECT count(*) as c FROM bank_transfers").get() as any).c;
    assert.equal(bankTransfersCount, 24);

    const profile = context.sqlite.prepare("SELECT * FROM business_profile WHERE id = 'default'").get() as any;
    assert.ok(profile);
    assert.equal(profile.tax_id, "100565644000003");
  });

  await t.test("3. Verify native .erpbackup export and re-import roundtrip of the migrated business", async () => {
    assert.ok(importedBusinessId);
    // Export native backup
    const backupBuffer = await exportBusinessBackup(importedBusinessId, testUserId);
    assert.ok(backupBuffer.byteLength > 1000);

    // Re-import native backup
    const reimportedId = await importBusinessBackup(backupBuffer, testUserId);
    assert.ok(reimportedId);

    // Verify re-imported business database integrity
    const reimportedContext = getBusinessDb(reimportedId, testUserId);
    const reimportedCustomers = (reimportedContext.sqlite.prepare("SELECT count(*) as c FROM customers").get() as any).c;
    assert.equal(reimportedCustomers, 307);

    const reimportedProjects = (reimportedContext.sqlite.prepare("SELECT count(*) as c FROM projects").get() as any).c;
    assert.equal(reimportedProjects, 955);
  });
});
