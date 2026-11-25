import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";

const testDataDir = mkdtempSync(path.join(tmpdir(), "modern-erp-statement-cache-test-"));
Object.assign(process.env, {
  ERP_DATA_DIR: testDataDir,
  ERP_SQLITE_RECYCLE_AFTER_STATEMENTS: "50",
  BETTER_AUTH_SECRET: "test-better-auth-secret-for-statement-cache-64chars-long-minimum",
  NODE_ENV: "test",
});

const { installStatementCache, getStatementCacheStats } = await import("../../src/core/db/statement-cache");
const { getSystemSqlite, getSystemDb } = await import("../../src/core/db/system");

test.after(() => rmSync(testDataDir, { recursive: true, force: true }));

function memoryDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO t VALUES (1, 'a'), (2, 'b');");
  return sqlite;
}

test("repeated SQL reuses one prepared statement", () => {
  const sqlite = memoryDb();
  const stats = installStatementCache(sqlite);
  const first = sqlite.prepare("SELECT name FROM t WHERE id = ?");
  const second = sqlite.prepare("SELECT name FROM t WHERE id = ?");
  assert.equal(first, second);
  assert.deepEqual(second.get(2), { name: "b" });
  assert.equal(stats.misses, 1);
  assert.equal(stats.hits, 1);
  assert.equal(installStatementCache(sqlite), stats, "installing twice is a no-op");
  sqlite.close();
});

test("cached statements are handed out in default (object) mode", () => {
  const sqlite = memoryDb();
  installStatementCache(sqlite);
  const stmt = sqlite.prepare("SELECT id, name FROM t ORDER BY id");
  assert.deepEqual(stmt.raw().all(), [[1, "a"], [2, "b"]]);
  assert.deepEqual(sqlite.prepare("SELECT id, name FROM t ORDER BY id").all(), [
    { id: 1, name: "a" },
    { id: 2, name: "b" },
  ]);
  sqlite.prepare("SELECT name FROM t ORDER BY id").pluck();
  assert.deepEqual(sqlite.prepare("SELECT name FROM t ORDER BY id").get(), { name: "a" });
  sqlite.close();
});

test("a statement busy iterating is not reused", () => {
  const sqlite = memoryDb();
  const stats = installStatementCache(sqlite);
  const source = "SELECT id FROM t ORDER BY id";
  const outer = sqlite.prepare(source);
  const seen: unknown[] = [];
  for (const row of outer.iterate()) {
    const inner = sqlite.prepare(source);
    assert.notEqual(inner, outer);
    seen.push(row);
  }
  assert.equal(seen.length, 2);
  assert.ok(stats.misses >= 2);
  sqlite.close();
});

test("LRU evicts the oldest statement beyond the limit", () => {
  const sqlite = memoryDb();
  const stats = installStatementCache(sqlite, { maxEntries: 2 });
  const a = sqlite.prepare("SELECT 1");
  sqlite.prepare("SELECT 2");
  sqlite.prepare("SELECT 1");
  sqlite.prepare("SELECT 3");
  assert.equal(stats.evictions, 1);
  assert.equal(sqlite.prepare("SELECT 1"), a, "recently used entry survived");
  sqlite.close();
});

test("Drizzle queries mixing object and raw modes return correct shapes", () => {
  const sqlite = memoryDb();
  const stats = installStatementCache(sqlite);
  const db = drizzle(sqlite);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(db.all(sql`SELECT id, name FROM t ORDER BY id`), [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    assert.deepEqual(db.values(sql`SELECT id, name FROM t ORDER BY id`), [[1, "a"], [2, "b"]]);
  }
  assert.equal(stats.misses, 1);
  sqlite.close();
});

test("system connection uses the cache and is replaced after heavy statement churn", async () => {
  const sqlite = getSystemSqlite();
  const stats = getStatementCacheStats(sqlite);
  assert.ok(stats, "system connection has a statement cache");

  for (let i = 0; i < 60; i++) sqlite.prepare(`SELECT ${i} AS n`).get();
  const replacement = getSystemSqlite();
  assert.notEqual(replacement, sqlite, "churned connection was retired");
  assert.ok(sqlite.open, "retired handle stays open for in-flight requests");
  assert.ok(getStatementCacheStats(replacement));
  assert.ok(getSystemDb().all(sql`SELECT 1 AS ok`).length === 1, "drizzle rebinds to the new connection");
});
