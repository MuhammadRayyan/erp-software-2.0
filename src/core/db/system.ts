import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureDataDirectories, SYSTEM_DB_PATH } from "./paths";
import { runMigrations } from "./migrations/runner";
import { systemMigrations } from "./migrations/system";
import { detectAndValidateSystemBaseline } from "./migrations/system-baseline";
import * as schema from "./system-schema";

let systemSqlite: Database.Database | undefined;

export function getSystemSqlite() {
  if (!systemSqlite) {
    ensureDataDirectories();
    systemSqlite = new Database(SYSTEM_DB_PATH);
    systemSqlite.pragma("journal_mode = WAL");
    systemSqlite.pragma("foreign_keys = ON");
    migrateSystemDatabase(systemSqlite);
  }
  return systemSqlite;
}

export function getSystemDb() {
  return drizzle(getSystemSqlite(), { schema });
}

export function migrateSystemDatabase(sqlite = getSystemSqlite()) {
  runMigrations(sqlite, {
    label: "system database",
    migrations: systemMigrations,
    baselineVersion: detectAndValidateSystemBaseline,
  });
}
