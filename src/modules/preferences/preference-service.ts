import { and, eq } from "drizzle-orm";
import { getSystemDb } from "@/core/db/system";
import { businesses, memberships, userBusinessPreferences } from "@/core/db/system-schema";
import { getBusinessAccess } from "@/core/permissions/permissions";

/**
 * Per-account, per-business UI preferences (column visibility, KPI card
 * toggles, etc.). Synced across devices via the system DB.
 *
 * Schema: each row is one (user, business, key) tuple with a single JSON-
 * serialized string `value`. The composite PK guarantees one value per
 * key. The `businessId` is verified to belong to the caller's membership
 * before any read/write so cross-business access cannot happen.
 */

const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 8192;
const MAX_PAIRS_PER_WRITE = 32;

function validateKey(key: string): void {
  if (!key || key.length > MAX_KEY_LENGTH) {
    throw new Error(`Preference key must be 1..${MAX_KEY_LENGTH} characters.`);
  }
  if (!/^[a-z0-9_.:-]+$/i.test(key)) {
    throw new Error("Preference key may only contain letters, digits, dot, colon, underscore, or hyphen.");
  }
}

function assertMembership(businessId: string, userId: string): void {
  // Cached React helper already validates archived flag + active membership.
  const access = getBusinessAccess(businessId, userId);
  if (!access) {
    throw new Error("User does not have access to this business.");
  }
}

/**
 * Load every preference key for this (user, business) pair as a flat
 * `Record<string,string>`. Returns an empty object if no preferences are
 * stored yet. The map is intended to be merged on top of client-side
 * defaults at render time — values are JSON strings the client decodes.
 *
 * Uses drizzle's `select().where().all()` on the system DB. Safe to call
 * inside server components; the call is cached per-request by React's
 * `cache()` wrapping the `getSystemDb` provider.
 */
export function listPreferences(businessId: string, userId: string): Record<string, string> {
  assertMembership(businessId, userId);
  const rows = getSystemDb()
    .select({ key: userBusinessPreferences.key, value: userBusinessPreferences.value })
    .from(userBusinessPreferences)
    .where(and(eq(userBusinessPreferences.userId, userId), eq(userBusinessPreferences.businessId, businessId)))
    .all();
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * Upsert up to `MAX_PAIRS_PER_WRITE` preference keys atomically. Each
 * value must be a string (≤ 8 KB); callers serialize JSON themselves
 * because column visibility maps etc. are tiny. Writes go through a
 * single transaction so partial updates cannot happen if the process
 * is interrupted mid-batch.
 */
export function upsertPreferences(
  businessId: string,
  userId: string,
  values: Record<string, string>,
): void {
  assertMembership(businessId, userId);
  const entries = Object.entries(values);
  if (entries.length === 0) return;
  if (entries.length > MAX_PAIRS_PER_WRITE) {
    throw new Error(`Too many preference pairs in one write (${entries.length} > ${MAX_PAIRS_PER_WRITE}).`);
  }
  for (const [key, value] of entries) {
    validateKey(key);
    if (typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
      throw new Error(`Preference value for "${key}" must be a string ≤ ${MAX_VALUE_LENGTH} chars.`);
    }
  }
  const db = getSystemDb();
  const now = new Date();
  db.transaction((tx) => {
    for (const [key, value] of entries) {
      tx.insert(userBusinessPreferences)
        .values({ userId, businessId, key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: [userBusinessPreferences.userId, userBusinessPreferences.businessId, userBusinessPreferences.key],
          set: { value, updatedAt: now },
        })
        .run();
    }
  });
}

/**
 * Delete every preference key for this (user, business) pair. Used by
 * the "Reset to defaults" button in the appearance settings page so a
 * user can wipe their stored column/card toggles and start fresh.
 */
export function clearPreferences(businessId: string, userId: string): number {
  assertMembership(businessId, userId);
  const result = getSystemDb()
    .delete(userBusinessPreferences)
    .where(and(eq(userBusinessPreferences.userId, userId), eq(userBusinessPreferences.businessId, businessId)))
    .run();
  return result.changes;
}

export { businesses, memberships };
