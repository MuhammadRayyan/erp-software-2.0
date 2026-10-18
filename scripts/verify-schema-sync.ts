import { getTableColumns, isTable } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import Database from "better-sqlite3";
import * as businessSchema from "../src/core/db/business-schema";
import * as systemSchema from "../src/core/db/system-schema";
import { SYSTEM_DB_PATH, getBusinessPaths } from "../src/core/db/paths";
import { getSystemDb } from "../src/core/db/system";

function verifySchema(sqlite: Database.Database, schemaModule: Record<string, any>, label: string) {
  console.log(`\n--- Validating ${label} ---`);
  const fkViolations = sqlite.pragma("foreign_key_check") as any[];
  if (fkViolations.length > 0) {
    console.error(`❌ Foreign key check failed for ${label}:`, fkViolations);
    process.exit(1);
  }
  console.log(`✔ Foreign keys valid (0 violations).`);

  const dbTables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  const dbTableNames = new Set(dbTables.map((t) => t.name));

  let tablesChecked = 0;
  let columnsChecked = 0;

  for (const [key, value] of Object.entries(schemaModule)) {
    if (!isTable(value)) continue;

    const config = getTableConfig(value as any);
    const tableName = config.name;
    tablesChecked++;

    if (!dbTableNames.has(tableName)) {
      console.error(`❌ Schema mismatch: Drizzle defines table "${tableName}" (${key}), but it does not exist in SQLite ${label}!`);
      process.exit(1);
    }

    const pragmaColumns = sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }[];
    const dbColumns = new Map(pragmaColumns.map((c) => [c.name, c]));

    const drizzleColumns = getTableColumns(value as any);
    for (const [colKey, col] of Object.entries(drizzleColumns)) {
      columnsChecked++;
      const colName = (col as any).name;
      if (!dbColumns.has(colName)) {
        console.error(
          `❌ Column mismatch: Drizzle defines column "${tableName}.${colName}" (${colKey}), but it is missing in SQLite ${label}!`
        );
        process.exit(1);
      }
    }
  }

  console.log(`✔ ${tablesChecked} Drizzle tables & ${columnsChecked} columns verified against SQLite schema.`);
}

async function run() {
  const systemSqlite = new Database(SYSTEM_DB_PATH, { readonly: true });
  verifySchema(systemSqlite, systemSchema, "System Database");

  const businesses = systemSqlite.prepare("SELECT id, directory_key, name FROM businesses ORDER BY id").all() as {
    id: string;
    directory_key: string;
    name: string;
  }[];

  console.log(`\nFound ${businesses.length} registered business(es) to verify.`);
  for (const business of businesses) {
    const businessDbPath = getBusinessPaths(business.directory_key).database;
    const businessSqlite = new Database(businessDbPath, { readonly: true });
    verifySchema(businessSqlite, businessSchema, `Business Database "${business.name}" (${business.id})`);
  }

  console.log(`\n✅ All ${businesses.length} business databases and system ORM/SQLite schemas are completely in sync!`);
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
