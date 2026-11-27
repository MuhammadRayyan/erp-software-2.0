import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import * as businessSchema from "../../src/core/db/business-schema";
import { migrateBusinessDatabase } from "../../src/core/db/business-migrations";
import { verifySchema } from "../../scripts/verify-schema-sync";

function migratedBusinessDb() {
  const sqlite = new Database(":memory:");
  migrateBusinessDatabase(sqlite, "schema sync test");
  return sqlite;
}

test("Drizzle business schema matches a freshly migrated business database", () => {
  const sqlite = migratedBusinessDb();
  try {
    assert.deepEqual(verifySchema(sqlite, businessSchema, "fresh business"), []);
  } finally {
    sqlite.close();
  }
});

test("schema sync reports index drift: missing, extra, reordered and lost UNIQUE constraints", () => {
  const sqlite = migratedBusinessDb();
  try {
    sqlite.exec(`
      DROP INDEX sales_quote_status_date_idx;
      CREATE INDEX sales_order_status_date_extra_idx ON sales_orders(order_date);
      DROP INDEX goods_receipt_status_date_idx;
      CREATE INDEX goods_receipt_status_date_idx ON goods_receipts(date, document_status);
    `);
    const problems = verifySchema(sqlite, businessSchema, "drifted business");
    assert.ok(problems.some((p) => p.includes(`"sales_quote_status_date_idx"`) && p.includes("missing from SQLite")), problems.join("\n"));
    assert.ok(problems.some((p) => p.includes(`"sales_order_status_date_extra_idx"`) && p.includes("not defined in Drizzle")), problems.join("\n"));
    assert.ok(problems.some((p) => p.includes(`"goods_receipt_status_date_idx"`) && p.includes("differs")), problems.join("\n"));
    assert.equal(problems.length, 3, problems.join("\n"));
  } finally {
    sqlite.close();
  }
});

test("migration 40 drops the journal indexes that are prefixes of composite indexes", () => {
  const sqlite = migratedBusinessDb();
  try {
    const names = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map((r) => r.name);
    assert.ok(!names.includes("journal_date_idx"));
    assert.ok(!names.includes("journal_lines_account_idx"));
    assert.ok(names.includes("journal_entries_date_status_idx"));
    assert.ok(names.includes("journal_lines_account_entry_idx"));
  } finally {
    sqlite.close();
  }
});
