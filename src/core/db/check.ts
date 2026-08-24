import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { businessMigrations } from "./business-migrations";
import { BUSINESSES_DIRECTORY, getBusinessPaths, SYSTEM_DB_PATH } from "./paths";
import { readMigrationState } from "./migrations/runner";
import { systemMigrations } from "./migrations/system";

type RegistryBusiness = {
  id: string;
  directory_key: string;
};

function checkForeignKeys(sqlite: Database.Database, label: string) {
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(`${label} has ${violations.length} foreign-key violation(s).`);
  }
}

function discoverBusinessDatabases(registry: readonly RegistryBusiness[]) {
  const discovered = new Map<string, { id?: string; database: string }>();
  for (const business of registry) {
    const database = getBusinessPaths(business.directory_key).database;
    if (!existsSync(database)) {
      throw new Error(`Registered business ${business.id} is missing ${database}.`);
    }
    discovered.set(business.directory_key, { id: business.id, database });
  }

  if (!existsSync(BUSINESSES_DIRECTORY)) return discovered;
  for (const entry of readdirSync(BUSINESSES_DIRECTORY, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const database = path.join(BUSINESSES_DIRECTORY, entry.name, "business.sqlite");
    if (!existsSync(database)) continue;
    const current = discovered.get(entry.name);
    discovered.set(entry.name, { id: current?.id, database });
  }
  return discovered;
}

export function checkDatabases() {
  if (!existsSync(SYSTEM_DB_PATH)) {
    throw new Error(`System database is missing at ${SYSTEM_DB_PATH}; run npm run db:migrate.`);
  }

  const systemSqlite = new Database(SYSTEM_DB_PATH, { readonly: true, fileMustExist: true });
  let registry: RegistryBusiness[] = [];
  let systemVersion = -1;
  try {
    const state = readMigrationState(systemSqlite, systemMigrations, "system database");
    if (!state.current) {
      throw new Error(
        `System database is at schema ${state.currentVersion}; expected ${state.latestVersion}.`,
      );
    }
    systemVersion = state.currentVersion;
    checkForeignKeys(systemSqlite, "system database");
    registry = systemSqlite
      .prepare("SELECT id, directory_key FROM businesses ORDER BY id")
      .all() as RegistryBusiness[];
  } finally {
    systemSqlite.close();
  }

  const businesses = [] as { label: string; version: number }[];
  for (const [directoryKey, business] of discoverBusinessDatabases(registry)) {
    const label = business.id
      ? `business ${business.id}`
      : `unregistered business directory ${directoryKey}`;
    const sqlite = new Database(business.database, { readonly: true, fileMustExist: true });
    try {
      const state = readMigrationState(sqlite, businessMigrations, label);
      if (!state.current) {
        throw new Error(`${label} is at schema ${state.currentVersion}; expected ${state.latestVersion}.`);
      }
      checkForeignKeys(sqlite, label);
      businesses.push({ label, version: state.currentVersion });
    } finally {
      sqlite.close();
    }
  }

  return { systemVersion, businesses };
}
