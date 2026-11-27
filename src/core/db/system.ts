import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureDataDirectories, SYSTEM_DB_PATH } from "./paths";
import { runMigrations } from "./migrations/runner";
import { systemMigrations } from "./migrations/system";
import { detectAndValidateSystemBaseline } from "./migrations/system-baseline";
import * as schema from "./system-schema";
import { readMigrationState } from "./migrations/runner";
import { applyStandardSqlitePragmas } from "./pragmas";
import { installStatementCache, type StatementCacheStats } from "./statement-cache";
import { RETIRED_CONNECTION_CLOSE_DELAY_MS, STATEMENT_CHURN_RECYCLE_THRESHOLD } from "./connection-limits";

let systemSqlite: Database.Database | undefined;
let systemStats: StatementCacheStats | undefined;
let systemDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

function openSystemConnection() {
  ensureDataDirectories();
  const sqlite = new Database(SYSTEM_DB_PATH, { timeout: 5000, fileMustExist: process.env.ERP_MIGRATION_MODE === "external" });
  try {
    applyStandardSqlitePragmas(sqlite);
    if (process.env.ERP_MIGRATION_MODE === "external") {
      if (!readMigrationState(sqlite, systemMigrations, "system database").current) throw new Error("System migrations are pending.");
    } else migrateSystemDatabase(sqlite);
    return { sqlite, stats: installStatementCache(sqlite) };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

/**
 * Replaces a connection whose statement churn (unique SQL texts) has retained
 * too much native memory. The old handle stays open briefly so any request
 * still holding it across an await can finish.
 */
function retireSystemConnectionIfChurned() {
  if (!systemSqlite || !systemStats || systemStats.misses < STATEMENT_CHURN_RECYCLE_THRESHOLD) return;
  if (systemSqlite.inTransaction) return;
  const replacement = openSystemConnection();
  const retired = systemSqlite;
  systemSqlite = replacement.sqlite;
  systemStats = replacement.stats;
  systemDb = undefined;
  const timer = setTimeout(() => {
    try {
      if (retired.open) retired.close();
    } catch {
      // Closing a retired handle is best-effort.
    }
  }, RETIRED_CONNECTION_CLOSE_DELAY_MS);
  timer.unref?.();
}

export function getSystemSqlite() {
  if (!systemSqlite) {
    const opened = openSystemConnection();
    systemSqlite = opened.sqlite;
    systemStats = opened.stats;
  } else {
    retireSystemConnectionIfChurned();
  }
  return systemSqlite;
}

export function getSystemDb() {
  const sqlite = getSystemSqlite();
  if (!systemDb) {
    systemDb = drizzle(sqlite, { schema });
  }
  return systemDb;
}

export function migrateSystemDatabase(sqlite = getSystemSqlite()) {
  runMigrations(sqlite, {
    label: "system database",
    migrations: systemMigrations,
    baselineVersion: detectAndValidateSystemBaseline,
  });
}
