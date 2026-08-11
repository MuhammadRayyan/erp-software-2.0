import type Database from "better-sqlite3";

export type SchemaExpectation = {
  tables: Record<string, readonly string[]>;
  indexes?: readonly string[];
  foreignKeys?: readonly {
    table: string;
    from: string;
    toTable: string;
    to: string;
    onDelete?: string;
  }[];
  uniqueColumns?: readonly { table: string; columns: readonly string[] }[];
  checkTables?: readonly string[];
};

export function sqliteTableExists(sqlite: Database.Database, table: string) {
  return Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

export function sqliteColumnExists(
  sqlite: Database.Database,
  table: string,
  column: string,
) {
  if (!sqliteTableExists(sqlite, table)) return false;
  const columns = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  return columns.some((entry) => entry.name === column);
}

function hasUniqueColumns(
  sqlite: Database.Database,
  table: string,
  expectedColumns: readonly string[],
) {
  const indexes = sqlite.prepare(`PRAGMA index_list("${table}")`).all() as {
    name: string;
    unique: number;
  }[];
  return indexes.some((index) => {
    if (!index.unique) return false;
    const columns = sqlite.prepare(`PRAGMA index_info("${index.name}")`).all() as {
      seqno: number;
      name: string;
    }[];
    return columns
      .sort((left, right) => left.seqno - right.seqno)
      .map((entry) => entry.name)
      .join("\u0000") === expectedColumns.join("\u0000");
  });
}

export function validateSqliteSchema(
  sqlite: Database.Database,
  expectation: SchemaExpectation,
) {
  const issues: string[] = [];
  for (const [table, requiredColumns] of Object.entries(expectation.tables)) {
    if (!sqliteTableExists(sqlite, table)) {
      issues.push(`missing table ${table}`);
      continue;
    }
    const actualColumns = new Set(
      (sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[])
        .map((entry) => entry.name),
    );
    for (const column of requiredColumns) {
      if (!actualColumns.has(column)) issues.push(`missing column ${table}.${column}`);
    }
  }

  for (const index of expectation.indexes ?? []) {
    if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(index)) {
      issues.push(`missing index ${index}`);
    }
  }

  for (const expected of expectation.foreignKeys ?? []) {
    if (!sqliteTableExists(sqlite, expected.table)) continue;
    const keys = sqlite.prepare(`PRAGMA foreign_key_list("${expected.table}")`).all() as {
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }[];
    if (!keys.some((key) => (
      key.table === expected.toTable
      && key.from === expected.from
      && key.to === expected.to
      && (!expected.onDelete || key.on_delete.toUpperCase() === expected.onDelete.toUpperCase())
    ))) {
      issues.push(`missing foreign key ${expected.table}.${expected.from} -> ${expected.toTable}.${expected.to}`);
    }
  }

  for (const expected of expectation.uniqueColumns ?? []) {
    if (
      sqliteTableExists(sqlite, expected.table)
      && !hasUniqueColumns(sqlite, expected.table, expected.columns)
    ) {
      issues.push(`missing unique constraint ${expected.table}(${expected.columns.join(", ")})`);
    }
  }

  for (const table of expectation.checkTables ?? []) {
    const row = sqlite.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table) as { sql: string | null } | undefined;
    if (row && !row.sql?.toLowerCase().includes("check")) {
      issues.push(`missing CHECK constraint on ${table}`);
    }
  }
  return issues;
}
