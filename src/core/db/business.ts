import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { businesses, memberships } from "./system-schema";
import { getBusinessPaths } from "./paths";
import { getSystemDb } from "./system";
import { migrateBusinessDatabase } from "./business-migrations";
import * as schema from "./business-schema";

const connections = new Map<string, Database.Database>();

export function openBusinessDatabase(directoryKey: string) {
  let sqlite = connections.get(directoryKey);
  if (!sqlite) {
    const paths = getBusinessPaths(directoryKey);
    mkdirSync(paths.attachments, { recursive: true });
    sqlite = new Database(paths.database);
    migrateBusinessDatabase(sqlite, `business database ${directoryKey}`);
    connections.set(directoryKey, sqlite);
  }
  return { sqlite, db: drizzle(sqlite, { schema }), paths: getBusinessPaths(directoryKey) };
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
  const sqlite = connections.get(directoryKey);
  if (sqlite) {
    sqlite.close();
    connections.delete(directoryKey);
  }
}
