import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const tempDir = mkdtempSync(path.join(tmpdir(), "modern-erp-sprint1-test-"));
Object.assign(process.env, {
  ERP_DATA_DIR: tempDir,
  BETTER_AUTH_SECRET: "sprint1-secret-key-12345",
  NODE_ENV: "test",
});

const { getSystemSqlite } = await import("../../src/core/db/system");
const { getBusinessDb } = await import("../../src/core/db/business");
const { seedDemoData } = await import("../../src/core/db/seed");
const {
  applyStandardSqlitePragmas,
  checkpointAndOptimizeSqlite,
  resolveConfiguredSynchronousMode,
} = await import("../../src/core/db/pragmas");
const { resolveBaseCurrencyCode } = await import("../../src/modules/reports/currency-fallback");
const { getCustomerAging } = await import("../../src/modules/reports/customer-statement-service");
const { getSupplierAging } = await import("../../src/modules/reports/supplier-statement-service");
const {
  buildInitialCustomFieldValues,
  haveCustomFieldValuesChanged,
} = await import("../../src/modules/custom-fields/custom-field-display");

test("Sprint 1 verification suite", async (suite) => {
  await suite.test("1. SQLite PRAGMAs default to crash-safe NORMAL under WAL and honor ERP_SQLITE_SYNCHRONOUS=FULL", () => {
    const sysSqlite = getSystemSqlite();
    assert.equal(resolveConfiguredSynchronousMode(), "NORMAL");
    assert.equal(sysSqlite.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(sysSqlite.pragma("synchronous", { simple: true }), 1);
    assert.equal(sysSqlite.pragma("temp_store", { simple: true }), 2);
    assert.equal(sysSqlite.pragma("cache_size", { simple: true }), -16000);
    assert.equal(sysSqlite.pragma("mmap_size", { simple: true }), 67108864);
    assert.equal(sysSqlite.pragma("wal_autocheckpoint", { simple: true }), 1000);

    const scratchDbPath = path.join(tempDir, "pragma-override.db");
    const scratch = new Database(scratchDbPath);
    const previous = process.env.ERP_SQLITE_SYNCHRONOUS;
    try {
      process.env.ERP_SQLITE_SYNCHRONOUS = "FULL";
      assert.equal(resolveConfiguredSynchronousMode(), "FULL");
      applyStandardSqlitePragmas(scratch);
      assert.equal(scratch.pragma("synchronous", { simple: true }), 2);
      assert.doesNotThrow(() => checkpointAndOptimizeSqlite(scratch));
    } finally {
      if (previous === undefined) {
        delete process.env.ERP_SQLITE_SYNCHRONOUS;
      } else {
        process.env.ERP_SQLITE_SYNCHRONOUS = previous;
      }
      scratch.close();
      rmSync(scratchDbPath, { force: true });
    }
  });

  await suite.test("2. Business DB Migration 38 creates date & status+date indexes for receipts, payments, and credit notes", async () => {
    const seeded = await seedDemoData();
    const { sqlite } = getBusinessDb(seeded.business.id, seeded.admin.id);

    const indexRows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    const indexNames = new Set(indexRows.map((row) => row.name));

    for (const expectedIndex of [
      "receipt_date_idx",
      "receipt_status_date_idx",
      "supplier_payment_date_idx",
      "supplier_payment_status_date_idx",
      "sales_credit_note_date_idx",
      "sales_credit_note_status_date_idx",
    ]) {
      assert.ok(indexNames.has(expectedIndex), `Expected SQLite index '${expectedIndex}' to exist`);
    }
  });

  await suite.test("3. Customer and supplier aging succeed with empty history without querying business_settings", async () => {
    const seeded = await seedDemoData();
    const { sqlite, business } = getBusinessDb(seeded.business.id, seeded.admin.id);

    // Clear default_currency_code on a new synthetic customer & supplier with zero documents
    const customerId = "cust-sprint1-fallback";
    const supplierId = "supp-sprint1-fallback";
    const now = new Date().toISOString();

    sqlite
      .prepare(
        `INSERT INTO customers (id, name, default_currency_code, payment_terms_days, is_active, created_at, updated_at)
         VALUES (?, ?, NULL, 0, 1, ?, ?)`,
      )
      .run(customerId, "Sprint1 Fallback Customer", now, now);

    sqlite
      .prepare(
        `INSERT INTO suppliers (id, name, default_currency_code, payment_terms_days, is_active, created_at, updated_at)
         VALUES (?, ?, NULL, 0, 1, ?, ?)`,
      )
      .run(supplierId, "Sprint1 Fallback Supplier", now, now);

    const customerAging = getCustomerAging(seeded.business.id, seeded.admin.id, customerId);
    assert.equal(customerAging.currencyCode, business.currency);
    assert.equal(customerAging.totalMinor, 0);

    const supplierAging = getSupplierAging(seeded.business.id, seeded.admin.id, supplierId);
    assert.equal(supplierAging.currencyCode, business.currency);
    assert.equal(supplierAging.totalMinor, 0);

    // Verify SQLite currencies table fallback when business currency is omitted
    assert.equal(resolveBaseCurrencyCode(sqlite, undefined), business.currency);
  });

  await suite.test("4. Custom-field baseline and dirty detection helpers track changes accurately", () => {
    const definitions = [
      { id: "cf-text", fieldType: "text" as const },
      { id: "cf-check", fieldType: "checkbox" as const },
    ];
    const baseline = buildInitialCustomFieldValues(definitions, { "cf-text": "PO-1" });
    assert.deepEqual(baseline, { "cf-text": "PO-1", "cf-check": "false" });
    assert.equal(haveCustomFieldValuesChanged(baseline, { ...baseline }), false);
    assert.equal(
      haveCustomFieldValuesChanged(baseline, { "cf-text": "PO-2", "cf-check": "false" }),
      true,
    );
    assert.equal(
      haveCustomFieldValuesChanged(baseline, { "cf-text": "PO-1", "cf-check": "true" }),
      true,
    );
  });

  await suite.test("5. Modules directory links point only to valid routes and omit removed paths", () => {
    const modulesPagePath = path.resolve(
      process.cwd(),
      "src/app/b/[businessId]/modules/page.tsx",
    );
    const source = readFileSync(modulesPagePath, "utf8");

    assert.equal(source.includes("inventory/goods-receipts"), false);
    assert.equal(source.includes("inventory/delivery-notes"), false);
    assert.equal(source.includes("banking/receipts"), false);

    const routeMatches = [...source.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(routeMatches.length >= 15, "Expected modules directory links to be present");

    for (const relRoute of routeMatches) {
      const pageFile = path.resolve(
        process.cwd(),
        "src/app/b/[businessId]",
        relRoute,
        "page.tsx",
      );
      assert.ok(existsSync(pageFile), `Modules link '${relRoute}' must point to an existing page.tsx`);
    }
  });
});
