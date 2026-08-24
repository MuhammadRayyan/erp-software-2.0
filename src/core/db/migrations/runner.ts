import type Database from "better-sqlite3";

export const MIGRATION_TABLE = "schema_migrations";

export type SqliteMigration = Readonly<{
  version: number;
  name: string;
  up: (sqlite: Database.Database) => void;
  foreignKeys?: "off";
}>;

type MigrationRow = {
  version: number;
  name: string;
  applied_at: string;
};

type RunnerOptions = {
  label: string;
  migrations: readonly SqliteMigration[];
  legacyHistoryTable?: "business_schema_migrations";
  baselineVersion?: (sqlite: Database.Database) => number | null;
};

function tableExists(sqlite: Database.Database, table: string) {
  return Boolean(
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

function readHistory(sqlite: Database.Database, table = MIGRATION_TABLE) {
  return sqlite
    .prepare(`SELECT version, name, applied_at FROM "${table}" ORDER BY version`)
    .all() as MigrationRow[];
}

function validateRegistry(migrations: readonly SqliteMigration[]) {
  let previousVersion = -1;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version < 0) {
      throw new Error(`Migration version must be a non-negative integer: ${migration.version}`);
    }
    if (!migration.name.trim()) throw new Error(`Migration ${migration.version} has no name.`);
    if (migration.version <= previousVersion) {
      throw new Error("Migration registry must be in strict ascending version order.");
    }
    previousVersion = migration.version;
  }
}

function validateHistory(
  rows: readonly MigrationRow[],
  migrations: readonly SqliteMigration[],
  label: string,
) {
  const latestVersion = migrations.at(-1)?.version ?? -1;
  const newestApplied = rows.at(-1)?.version ?? -1;
  if (newestApplied > latestVersion) {
    throw new Error(
      `${label} schema version ${newestApplied} is newer than this application understands (${latestVersion}).`,
    );
  }

  let foundPending = false;
  const appliedByVersion = new Map(rows.map((row) => [row.version, row]));
  for (const migration of migrations) {
    const applied = appliedByVersion.get(migration.version);
    if (!applied) {
      foundPending = true;
      continue;
    }
    if (foundPending) {
      throw new Error(`${label} migration history is out of order at version ${migration.version}.`);
    }
    if (applied.name !== migration.name) {
      throw new Error(
        `${label} migration ${migration.version} is recorded as "${applied.name}", expected "${migration.name}".`,
      );
    }
    appliedByVersion.delete(migration.version);
  }

  const unknown = appliedByVersion.values().next().value as MigrationRow | undefined;
  if (unknown) {
    throw new Error(`${label} contains unknown migration version ${unknown.version} (${unknown.name}).`);
  }
}

function createHistoryTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "${MIGRATION_TABLE}" (
      "version" INTEGER PRIMARY KEY NOT NULL,
      "name" TEXT NOT NULL,
      "applied_at" TEXT NOT NULL
    );
  `);
}

function prepareHistory(sqlite: Database.Database, options: RunnerOptions) {
  const hasCurrentHistory = tableExists(sqlite, MIGRATION_TABLE);
  const hasLegacyHistory = options.legacyHistoryTable
    ? tableExists(sqlite, options.legacyHistoryTable)
    : false;

  if (hasCurrentHistory) {
    const currentRows = readHistory(sqlite);
    validateHistory(currentRows, options.migrations, options.label);
    if (hasLegacyHistory && options.legacyHistoryTable) {
      const legacyRows = readHistory(sqlite, options.legacyHistoryTable);
      validateHistory(legacyRows, options.migrations, options.label);
      if (JSON.stringify(currentRows) !== JSON.stringify(legacyRows)) {
        throw new Error(`${options.label} has conflicting current and legacy migration histories.`);
      }
      sqlite.transaction(() => {
        sqlite.exec(`DROP TABLE "${options.legacyHistoryTable}";`);
      }).immediate();
    }
    return;
  }

  if (hasLegacyHistory && options.legacyHistoryTable) {
    const legacyRows = readHistory(sqlite, options.legacyHistoryTable);
    validateHistory(legacyRows, options.migrations, options.label);
    sqlite.transaction(() => {
      createHistoryTable(sqlite);
      const insert = sqlite.prepare(
        `INSERT INTO "${MIGRATION_TABLE}" (version, name, applied_at) VALUES (?, ?, ?)`,
      );
      for (const row of legacyRows) insert.run(row.version, row.name, row.applied_at);
      sqlite.exec(`DROP TABLE "${options.legacyHistoryTable}";`);
    }).immediate();
    console.info(`[db:migrate] ${options.label}: adopted the legacy migration history.`);
    return;
  }

  sqlite.transaction(() => {
    createHistoryTable(sqlite);
  }).immediate();
}

function applyBaseline(sqlite: Database.Database, options: RunnerOptions) {
  if (!options.baselineVersion || readHistory(sqlite).length > 0) return;
  const version = options.baselineVersion(sqlite);
  if (version === null) return;
  const baseline = options.migrations.filter((migration) => migration.version <= version);
  if (baseline.at(-1)?.version !== version) {
    throw new Error(`${options.label} cannot adopt unknown baseline version ${version}.`);
  }
  sqlite.transaction(() => {
    const insert = sqlite.prepare(
      `INSERT INTO "${MIGRATION_TABLE}" (version, name, applied_at) VALUES (?, ?, ?)`,
    );
    const appliedAt = new Date().toISOString();
    for (const migration of baseline) insert.run(migration.version, migration.name, appliedAt);
  }).immediate();
  console.info(`[db:migrate] ${options.label}: adopted schema baseline ${version}.`);
}

export function readMigrationState(
  sqlite: Database.Database,
  migrations: readonly SqliteMigration[],
  label: string,
) {
  validateRegistry(migrations);
  if (!tableExists(sqlite, MIGRATION_TABLE)) {
    throw new Error(`${label} has no ${MIGRATION_TABLE} table; run npm run db:migrate.`);
  }
  const rows = readHistory(sqlite);
  validateHistory(rows, migrations, label);
  const latestVersion = migrations.at(-1)?.version ?? -1;
  const currentVersion = rows.at(-1)?.version ?? -1;
  return {
    currentVersion,
    latestVersion,
    current: currentVersion === latestVersion,
    applied: rows,
  };
}

export function runMigrations(sqlite: Database.Database, options: RunnerOptions) {
  validateRegistry(options.migrations);
  prepareHistory(sqlite, options);
  applyBaseline(sqlite, options);

  const state = readMigrationState(sqlite, options.migrations, options.label);
  for (const migration of options.migrations) {
    if (migration.version <= state.currentVersion) continue;
    const foreignKeysEnabled = Number(sqlite.pragma("foreign_keys", { simple: true })) === 1;
    if (migration.foreignKeys === "off") sqlite.pragma("foreign_keys = OFF");
    try {
      sqlite.transaction(() => {
        migration.up(sqlite);
        const violations = sqlite.pragma("foreign_key_check") as unknown[];
        if (violations.length > 0) {
          throw new Error(`foreign_key_check found ${violations.length} violation(s).`);
        }
        sqlite
          .prepare(
            `INSERT INTO "${MIGRATION_TABLE}" (version, name, applied_at) VALUES (?, ?, ?)`,
          )
          .run(migration.version, migration.name, new Date().toISOString());
      }).immediate();
      console.info(`[db:migrate] ${options.label}: applied ${migration.version} ${migration.name}.`);
    } catch (error) {
      console.error(
        `[db:migrate] ${options.label}: failed ${migration.version} ${migration.name}.`,
        error,
      );
      throw error;
    } finally {
      if (migration.foreignKeys === "off" && foreignKeysEnabled) sqlite.pragma("foreign_keys = ON");
    }
  }
}
