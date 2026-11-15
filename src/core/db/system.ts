import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureDataDirectories, SYSTEM_DB_PATH } from "./paths";
import { runMigrations } from "./migrations/runner";
import { systemMigrations } from "./migrations/system";
import { detectAndValidateSystemBaseline } from "./migrations/system-baseline";
import * as schema from "./system-schema";
import { readMigrationState } from "./migrations/runner";
import { applyStandardSqlitePragmas } from "./pragmas";

let systemSqlite: Database.Database | undefined;
let systemDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getSystemSqlite() {
  if (!systemSqlite) {
    ensureDataDirectories();
    const sqlite = new Database(SYSTEM_DB_PATH, { timeout: 5000, fileMustExist: process.env.ERP_MIGRATION_MODE === "external" });
    try {
      applyStandardSqlitePragmas(sqlite);
      if (process.env.ERP_MIGRATION_MODE === "external") {
        if (!readMigrationState(sqlite, systemMigrations, "system database").current) throw new Error("System migrations are pending.");
      } else migrateSystemDatabase(sqlite);
      systemSqlite = sqlite;
    } catch (error) {
      sqlite.close();
      throw error;
    }
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
