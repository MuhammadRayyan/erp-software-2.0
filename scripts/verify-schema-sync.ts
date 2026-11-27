import { pathToFileURL } from "node:url";
import { getTableColumns, isTable, type Table } from "drizzle-orm";
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import Database from "better-sqlite3";
import * as businessSchema from "../src/core/db/business-schema";
import * as systemSchema from "../src/core/db/system-schema";
import { SYSTEM_DB_PATH, getBusinessPaths } from "../src/core/db/paths";

// Compares the Drizzle schema (what queries are typed against) with a migrated
// SQLite database (the source of truth: migrations are hand-written). Checks
// tables, columns, indexes (name, columns in order, unique, partial) and inline
// UNIQUE constraints. SQLite names those constraints' indexes sqlite_autoindex_*,
// so they are matched by column list instead of by name; primary keys are ignored.
//
// Run against the databases under ERP_DATA_DIR: `npm run check:schema` does it
// for a freshly migrated and seeded temporary data directory.

type IndexShape = { columns: string[]; unique: boolean; partial: boolean };

const EXPRESSION = "<expression>";

function describe(shape: IndexShape) {
  return `${shape.unique ? "UNIQUE " : ""}(${shape.columns.join(", ")})${shape.partial ? " WHERE …" : ""}`;
}

function drizzleIndexes(table: SQLiteTable) {
  const indexes = new Map<string, IndexShape>();
  for (const index of getTableConfig(table).indexes) {
    const { name, columns, unique, where } = index.config;
    indexes.set(name, {
      columns: columns.map((column) => (isColumn(column) ? column.name : EXPRESSION)),
      unique,
      partial: where !== undefined,
    });
  }
  return indexes;
}

function isColumn(value: unknown): value is { name: string } {
  return typeof value === "object" && value !== null && "name" in value && typeof (value as { name: unknown }).name === "string" && !("queryChunks" in value);
}

/** UNIQUE constraints (column `.unique()` or table `unique().on(...)`), as column lists. */
function drizzleUniqueConstraints(table: SQLiteTable) {
  const config = getTableConfig(table);
  return [
    ...config.columns.filter((column) => column.isUnique).map((column) => [column.name]),
    ...config.uniqueConstraints.map((constraint) => constraint.columns.map((column) => column.name)),
  ].map((columns) => columns.join(", "));
}

function sqliteIndexes(sqlite: Database.Database, tableName: string) {
  const indexes = new Map<string, IndexShape>();
  const uniqueConstraints: string[] = [];
  const list = sqlite.prepare(`PRAGMA index_list("${tableName}")`).all() as { name: string; unique: number; origin: string; partial: number }[];
  for (const entry of list) {
    const info = sqlite.prepare(`PRAGMA index_info("${entry.name}")`).all() as { seqno: number; cid: number; name: string | null }[];
    const columns = info.sort((a, b) => a.seqno - b.seqno).map((column) => column.name ?? EXPRESSION);
    // Inline UNIQUE constraints are unnamed sqlite_autoindex_* indexes: compare them by columns only.
    if (entry.origin === "u") uniqueConstraints.push(columns.join(", "));
    if (entry.name.startsWith("sqlite_autoindex_")) continue;
    indexes.set(entry.name, { columns, unique: entry.unique === 1, partial: entry.partial === 1 });
  }
  return { indexes, uniqueConstraints };
}

/** Entries of `left` not matched one-for-one in `right`. */
function difference(left: string[], right: string[]) {
  const remaining = [...right];
  return left.filter((entry) => {
    const found = remaining.indexOf(entry);
    if (found === -1) return true;
    remaining.splice(found, 1);
    return false;
  });
}

/** Returns every difference between the Drizzle schema module and the database; empty means in sync. */
export function verifySchema(sqlite: Database.Database, schemaModule: Record<string, unknown>, label: string) {
  const problems: string[] = [];
  const fkViolations = sqlite.pragma("foreign_key_check") as unknown[];
  if (fkViolations.length > 0) problems.push(`${fkViolations.length} foreign key violation(s): ${JSON.stringify(fkViolations.slice(0, 5))}`);

  const dbTableNames = new Set(
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name),
  );
  let tables = 0;
  let columns = 0;
  let indexes = 0;

  for (const [key, value] of Object.entries(schemaModule)) {
    if (!isTable(value)) continue;
    const table = value as SQLiteTable;
    const tableName = getTableConfig(table).name;
    tables++;

    if (!dbTableNames.has(tableName)) {
      problems.push(`table "${tableName}" (${key}) is defined in Drizzle but missing from SQLite`);
      continue;
    }

    const dbColumns = new Set((sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as { name: string }[]).map((c) => c.name));
    for (const [columnKey, column] of Object.entries(getTableColumns(table as Table))) {
      columns++;
      if (!dbColumns.has(column.name)) problems.push(`column "${tableName}.${column.name}" (${columnKey}) is defined in Drizzle but missing from SQLite`);
    }

    const expected = drizzleIndexes(table);
    const { indexes: actual, uniqueConstraints } = sqliteIndexes(sqlite, tableName);
    for (const [name, shape] of expected) {
      indexes++;
      const real = actual.get(name);
      if (!real) problems.push(`index "${name}" on "${tableName}" is defined in Drizzle ${describe(shape)} but missing from SQLite`);
      else if (describe(real) !== describe(shape)) problems.push(`index "${name}" on "${tableName}" differs: Drizzle ${describe(shape)}, SQLite ${describe(real)}`);
    }
    for (const [name, shape] of actual) {
      if (!expected.has(name)) problems.push(`index "${name}" on "${tableName}" exists in SQLite ${describe(shape)} but is not defined in Drizzle`);
    }

    const expectedUnique = drizzleUniqueConstraints(table);
    for (const columns of difference(expectedUnique, uniqueConstraints)) {
      problems.push(`UNIQUE constraint (${columns}) on "${tableName}" is defined in Drizzle but missing from SQLite`);
    }
    for (const columns of difference(uniqueConstraints, expectedUnique)) {
      problems.push(`UNIQUE constraint (${columns}) on "${tableName}" exists in SQLite but is not defined in Drizzle`);
    }
  }

  if (problems.length === 0) console.log(`✔ ${label}: ${tables} tables, ${columns} columns and ${indexes} indexes in sync; foreign keys valid.`);
  else {
    console.error(`✘ ${label}: ${problems.length} difference(s)`);
    for (const problem of problems) console.error(`  - ${problem}`);
  }
  return problems;
}

/** Verifies the system database and every registered business database under ERP_DATA_DIR. */
export function verifyAllSchemas() {
  let problems = 0;
  const systemSqlite = new Database(SYSTEM_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    problems += verifySchema(systemSqlite, systemSchema, "System database").length;
    const businesses = systemSqlite.prepare("SELECT id, directory_key, name FROM businesses ORDER BY id").all() as {
      id: string;
      directory_key: string;
      name: string;
    }[];
    for (const business of businesses) {
      const businessSqlite = new Database(getBusinessPaths(business.directory_key).database, { readonly: true, fileMustExist: true });
      try {
        problems += verifySchema(businessSqlite, businessSchema, `Business database "${business.name}" (${business.id})`).length;
      } finally {
        businessSqlite.close();
      }
    }
    return { businesses: businesses.length, problems };
  } finally {
    systemSqlite.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { businesses, problems } = verifyAllSchemas();
  if (problems > 0) {
    console.error(`\nSchema drift: ${problems} difference(s) between the Drizzle schema and SQLite.`);
    process.exit(1);
  }
  console.log(`\nSystem and ${businesses} business database(s) match the Drizzle schema.`);
}
