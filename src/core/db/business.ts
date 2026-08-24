import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { businesses, memberships } from "./system-schema";
import { getBusinessPaths } from "./paths";
import { getSystemDb } from "./system";
import { migrateBusinessDatabase } from "./business-migrations";
import * as schema from "./business-schema";

const MAX_CONNECTIONS = 32;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes
// Never evict a connection that was used this recently: a request may hold
// the handle across an await boundary, and closing it would crash that
// request with "database is closed".
const MIN_AGE_BEFORE_EVICTION_MS = 10_000;

type Connection = {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle>;
  paths: ReturnType<typeof getBusinessPaths>;
  lastUsed: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

const connections = new Map<string, Connection>();

function closeConnection(directoryKey: string) {
  const conn = connections.get(directoryKey);
  if (!conn) return;
  if (conn.idleTimer) clearTimeout(conn.idleTimer);
  conn.sqlite.close();
  connections.delete(directoryKey);
}

function scheduleIdleClose(directoryKey: string) {
  const conn = connections.get(directoryKey);
  if (!conn) return;
  if (conn.idleTimer) clearTimeout(conn.idleTimer);
  conn.idleTimer = setTimeout(() => {
    closeConnection(directoryKey);
  }, IDLE_TIMEOUT_MS);
}

function evictIfNeeded() {
  if (connections.size < MAX_CONNECTIONS) return;
  const now = Date.now();
  // Evict the least-recently-used connection that is old enough to be
  // safely closable. If every connection is currently active, allow the
  // pool to grow past the soft cap instead of yanking a live handle.
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, conn] of connections) {
    if (now - conn.lastUsed < MIN_AGE_BEFORE_EVICTION_MS) continue;
    if (conn.lastUsed < oldestTime) {
      oldestTime = conn.lastUsed;
      oldestKey = key;
    }
  }
  if (oldestKey) closeConnection(oldestKey);
}

export function openBusinessDatabase(directoryKey: string) {
  let conn = connections.get(directoryKey);
  if (!conn) {
    evictIfNeeded();
    const paths = getBusinessPaths(directoryKey);
    mkdirSync(paths.attachments, { recursive: true });
    const sqlite = new Database(paths.database);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    migrateBusinessDatabase(sqlite, `business database ${directoryKey}`);
    const db = drizzle(sqlite, { schema });
    conn = { sqlite, db, paths, lastUsed: Date.now(), idleTimer: null };
    connections.set(directoryKey, conn);
  }
  conn.lastUsed = Date.now();
  scheduleIdleClose(directoryKey);
  return { sqlite: conn.sqlite, db: conn.db, paths: conn.paths };
}

export function getBusinessDb(businessId: string, userId: string) {
  const row = getSystemDb()
    .select({ business: businesses, membership: memberships })
    .from(businesses)
    .innerJoin(
      memberships,
      and(eq(memberships.businessId, businesses.id), eq(memberships.userId, userId)),
    )
    .where(and(eq(businesses.id, businessId), eq(businesses.archived, false)))
    .get();

  if (!row) throw new Error("BUSINESS_ACCESS_DENIED");
  return { ...openBusinessDatabase(row.business.directoryKey), ...row };
}

export function closeBusinessConnection(directoryKey: string) {
  closeConnection(directoryKey);
}

// For testing / graceful shutdown
export function closeAllBusinessConnections() {
  for (const key of [...connections.keys()]) {
    closeConnection(key);
  }
}
