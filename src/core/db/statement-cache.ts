import "server-only";

import type Database from "better-sqlite3";

/**
 * Per-connection prepared-statement cache.
 *
 * better-sqlite3 keeps the native memory of every statement prepared on a
 * connection until that connection closes; dropping the JS reference and even
 * forcing GC does not return it. Drizzle (and most of our raw SQL) calls
 * `prepare()` on every query, so a long-lived connection grows ~3 KB per query
 * without bound. In production that pushed `next-server` past its 3 GB cgroup
 * limit roughly every 1.5 days.
 *
 * Caching by SQL text makes repeated queries reuse one native statement.
 * `misses` counts statements actually created (i.e. native memory retained), so
 * owners can retire a connection once churn from unique SQL gets large.
 */

export type StatementCacheStats = {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
};

type Statement = Database.Statement;

const DEFAULT_MAX_ENTRIES = 2_000;
const statsByConnection = new WeakMap<Database.Database, StatementCacheStats>();

export function installStatementCache(
  sqlite: Database.Database,
  options: { maxEntries?: number } = {},
): StatementCacheStats {
  const existing = statsByConnection.get(sqlite);
  if (existing) return existing;

  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const originalPrepare = sqlite.prepare.bind(sqlite) as (source: string) => Statement;
  const cache = new Map<string, Statement>();
  const stats: StatementCacheStats = { hits: 0, misses: 0, evictions: 0, size: 0 };

  const prepareFresh = (source: string) => {
    stats.misses += 1;
    return originalPrepare(source);
  };

  const cachedPrepare = (source: string): Statement => {
    const cached = cache.get(source);
    if (cached) {
      // A statement mid-iteration cannot be reused or reconfigured.
      if (cached.busy) return prepareFresh(source);
      // raw()/pluck()/expand() modes persist on a statement; Drizzle toggles
      // raw() for some queries. Hand every caller a statement in default mode.
      if (cached.reader) {
        try {
          cached.raw(false).pluck(false).expand(false);
        } catch {
          return prepareFresh(source);
        }
      }
      // Refresh LRU position.
      cache.delete(source);
      cache.set(source, cached);
      stats.hits += 1;
      return cached;
    }

    const statement = prepareFresh(source);
    cache.set(source, statement);
    if (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
        stats.evictions += 1;
      }
    }
    stats.size = cache.size;
    return statement;
  };

  Object.defineProperty(sqlite, "prepare", {
    value: cachedPrepare,
    configurable: true,
    writable: true,
  });
  statsByConnection.set(sqlite, stats);
  return stats;
}

export function getStatementCacheStats(sqlite: Database.Database): StatementCacheStats | undefined {
  return statsByConnection.get(sqlite);
}
