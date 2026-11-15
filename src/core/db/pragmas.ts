import type Database from "better-sqlite3";

export type SqliteSynchronousMode = "NORMAL" | "FULL";

/**
 * Resolves the configured SQLite synchronous mode from `ERP_SQLITE_SYNCHRONOUS`.
 * Defaults to `NORMAL`, which is crash-safe and recommended under WAL mode while
 * eliminating extra fsync flushes on every transaction commit. Set
 * `ERP_SQLITE_SYNCHRONOUS=FULL` when strict immediate disk durability per commit
 * is required.
 */
export function resolveConfiguredSynchronousMode(): SqliteSynchronousMode {
  return process.env.ERP_SQLITE_SYNCHRONOUS?.trim().toUpperCase() === "FULL"
    ? "FULL"
    : "NORMAL";
}

/**
 * Applies the shared performance, concurrency, and integrity PRAGMAs to a
 * `better-sqlite3` connection.
 */
export function applyStandardSqlitePragmas(sqlite: Database.Database): void {
  const synchronousMode = resolveConfiguredSynchronousMode();
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma(`synchronous = ${synchronousMode}`);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("cache_size = -16000");
  sqlite.pragma("mmap_size = 67108864");
  sqlite.pragma("wal_autocheckpoint = 1000");
}

/**
 * Runs query planner statistics optimization and checkpoints/truncates the WAL
 * cleanly when closing an idle database connection.
 */
export function checkpointAndOptimizeSqlite(sqlite: Database.Database): void {
  try {
    sqlite.pragma("optimize");
  } catch {
    // Ignore optimize failure if the connection is closing under contention.
  }
  try {
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Ignore checkpoint failure if another reader still holds a WAL lock.
  }
}
