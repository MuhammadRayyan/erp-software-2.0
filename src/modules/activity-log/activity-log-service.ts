import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import { getBusinessDb } from "@/core/db/business";
import { getSystemDb } from "@/core/db/system";
import { users } from "@/core/db/system-schema";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { listBusinessUsers } from "@/core/permissions/membership-service";

export type ActivityAction =
  | "created"
  | "updated"
  | "posted"
  | "voided"
  | "deleted"
  | "emailed"
  | "reconciled"
  | "imported"
  | "settings_changed";

export interface RecordActivityInput {
  userId: string;
  userName?: string;
  userEmail?: string;
  action: ActivityAction | string;
  entityType: string;
  entityId?: string | null;
  entityNumber?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt?: string;
  sqlite?: Database.Database;
}

export interface ActivityLogItem {
  id: string;
  businessId: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityNumber: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface ActivityLogFilters {
  userId?: string;
  action?: string;
  entityType?: string;
  search?: string;
  dateRange?: "all" | "today" | "7d" | "30d" | "custom";
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityLogMetrics {
  totalCount: number;
  createdCount: number;
  postedCount: number;
  voidedCount: number;
  updatedCount: number;
  settingsCount: number;
  uniqueUsersCount: number;
}

export interface ListActivityLogsResult {
  logs: ActivityLogItem[];
  total: number;
  isAdmin: boolean;
  metrics: ActivityLogMetrics;
  limit: number;
  offset: number;
}

/**
 * Resolves user metadata (name, email) from system DB if not provided.
 */
function resolveUserInfo(userId: string, userName?: string, userEmail?: string): { name: string; email: string } {
  if (userName && userEmail) {
    return { name: userName, email: userEmail };
  }
  try {
    const userRow = getSystemDb()
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (userRow) {
      return {
        name: userName || userRow.name,
        email: userEmail || userRow.email,
      };
    }
  } catch {
    // Ignore error and fall back to defaults
  }
  return {
    name: userName || "Team Member",
    email: userEmail || "user@workspace.local",
  };
}

/**
 * Records an activity/audit log entry.
 * Safe to call inside or outside transactions. Errors are caught and logged so
 * primary operations are never blocked by logging failures.
 */
export function recordActivity(
  businessId: string,
  input: RecordActivityInput,
): ActivityLogItem | null {
  try {
    const id = randomUUID();
    const createdAt = input.createdAt || new Date().toISOString();
    const userInfo = resolveUserInfo(input.userId, input.userName, input.userEmail);
    const detailsJson = input.details ? JSON.stringify(input.details) : null;

    const sqlite = input.sqlite || getBusinessDb(businessId, input.userId).sqlite;

    sqlite
      .prepare(`
        INSERT INTO activity_logs (
          id, business_id, user_id, user_name, user_email,
          action, entity_type, entity_id, entity_number,
          summary, details_json, ip_address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        businessId,
        input.userId,
        userInfo.name,
        userInfo.email,
        input.action,
        input.entityType,
        input.entityId || null,
        input.entityNumber || null,
        input.summary,
        detailsJson,
        input.ipAddress || null,
        createdAt,
      );

    return {
      id,
      businessId,
      userId: input.userId,
      userName: userInfo.name,
      userEmail: userInfo.email,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      entityNumber: input.entityNumber || null,
      summary: input.summary,
      details: input.details || null,
      ipAddress: input.ipAddress || null,
      createdAt,
    };
  } catch (error) {
    console.error("[ActivityLog] Failed to record activity:", error);
    return null;
  }
}

/**
 * Retrieves activity logs respecting role-based visibility:
 * - Administrators can see logs from ALL users or filter by any user.
 * - Standard users can ONLY ever see their OWN activity logs.
 */
export function listActivityLogs(
  businessId: string,
  requestingUserId: string,
  filters: ActivityLogFilters = {},
): ListActivityLogsResult {
  const access = getBusinessAccess(businessId, requestingUserId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");

  const isAdmin = access.membership.role === "administrator";

  // Strict role isolation: non-admins cannot query other users
  const effectiveUserId = isAdmin ? filters.userId : requestingUserId;

  const sqlite = getBusinessDb(businessId, requestingUserId).sqlite;

  // Build WHERE conditions
  const conditions: string[] = ["business_id = ?"];
  const params: unknown[] = [businessId];

  if (effectiveUserId) {
    conditions.push("user_id = ?");
    params.push(effectiveUserId);
  }

  if (filters.action && filters.action !== "all") {
    conditions.push("action = ?");
    params.push(filters.action);
  }

  if (filters.entityType && filters.entityType !== "all") {
    conditions.push("entity_type = ?");
    params.push(filters.entityType);
  }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push("(summary LIKE ? OR entity_number LIKE ? OR user_name LIKE ? OR user_email LIKE ?)");
    params.push(q, q, q, q);
  }

  // Handle date filters
  const now = new Date();
  if (filters.dateRange === "today") {
    const todayStr = now.toISOString().slice(0, 10);
    conditions.push("created_at >= ?");
    params.push(`${todayStr}T00:00:00.000Z`);
  } else if (filters.dateRange === "7d") {
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    conditions.push("created_at >= ?");
    params.push(d7);
  } else if (filters.dateRange === "30d") {
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    conditions.push("created_at >= ?");
    params.push(d30);
  } else if (filters.dateRange === "custom" || filters.startDate || filters.endDate) {
    if (filters.startDate) {
      conditions.push("created_at >= ?");
      params.push(filters.startDate.includes("T") ? filters.startDate : `${filters.startDate}T00:00:00.000Z`);
    }
    if (filters.endDate) {
      conditions.push("created_at <= ?");
      params.push(filters.endDate.includes("T") ? filters.endDate : `${filters.endDate}T23:59:59.999Z`);
    }
  }

  const whereClause = conditions.join(" AND ");

  // Count total matching
  const totalRow = sqlite
    .prepare(`SELECT COUNT(*) as count FROM activity_logs WHERE ${whereClause}`)
    .get(...params) as { count: number };
  const total = totalRow?.count ?? 0;

  // Pagination
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  // Fetch page rows
  const rows = sqlite
    .prepare(`
      SELECT id, business_id, user_id, user_name, user_email,
             action, entity_type, entity_id, entity_number,
             summary, details_json, ip_address, created_at
      FROM activity_logs
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as {
      id: string;
      business_id: string;
      user_id: string;
      user_name: string;
      user_email: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      entity_number: string | null;
      summary: string;
      details_json: string | null;
      ip_address: string | null;
      created_at: string;
    }[];

  const logs: ActivityLogItem[] = rows.map((r) => {
    let details: Record<string, unknown> | null = null;
    if (r.details_json) {
      try {
        details = JSON.parse(r.details_json);
      } catch {
        details = null;
      }
    }
    return {
      id: r.id,
      businessId: r.business_id,
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      entityNumber: r.entity_number,
      summary: r.summary,
      details,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    };
  });

  // Calculate metrics
  // For base metrics, calculate within the user scope
  const baseConditions = ["business_id = ?"];
  const baseParams: unknown[] = [businessId];
  if (effectiveUserId) {
    baseConditions.push("user_id = ?");
    baseParams.push(effectiveUserId);
  }
  const baseWhere = baseConditions.join(" AND ");

  const metricsRow = sqlite
    .prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN action = 'created' THEN 1 ELSE 0 END) as created_count,
        SUM(CASE WHEN action = 'posted' THEN 1 ELSE 0 END) as posted_count,
        SUM(CASE WHEN action = 'voided' THEN 1 ELSE 0 END) as voided_count,
        SUM(CASE WHEN action = 'updated' THEN 1 ELSE 0 END) as updated_count,
        SUM(CASE WHEN action = 'settings_changed' THEN 1 ELSE 0 END) as settings_count,
        COUNT(DISTINCT user_id) as unique_users_count
      FROM activity_logs
      WHERE ${baseWhere}
    `)
    .get(...baseParams) as {
      total_count: number;
      created_count: number | null;
      posted_count: number | null;
      voided_count: number | null;
      updated_count: number | null;
      settings_count: number | null;
      unique_users_count: number | null;
    };

  const metrics: ActivityLogMetrics = {
    totalCount: metricsRow?.total_count ?? 0,
    createdCount: metricsRow?.created_count ?? 0,
    postedCount: metricsRow?.posted_count ?? 0,
    voidedCount: metricsRow?.voided_count ?? 0,
    updatedCount: metricsRow?.updated_count ?? 0,
    settingsCount: metricsRow?.settings_count ?? 0,
    uniqueUsersCount: metricsRow?.unique_users_count ?? 0,
  };

  return {
    logs,
    total,
    isAdmin,
    metrics,
    limit,
    offset,
  };
}

/**
 * Returns available user list for activity log filtering:
 * - Admin receives all business members.
 * - Standard user receives only their own user entry.
 */
export function getActivityLogUsers(
  businessId: string,
  requestingUserId: string,
): { id: string; name: string; email: string; role: string }[] {
  const access = getBusinessAccess(businessId, requestingUserId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");

  if (access.membership.role !== "administrator") {
    const userRow = getSystemDb()
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, requestingUserId))
      .get();
    return userRow
      ? [{ id: userRow.id, name: userRow.name, email: userRow.email, role: "standard" }]
      : [];
  }

  return listBusinessUsers(businessId, requestingUserId).map(({ user, membership }) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: membership.role,
  }));
}

export interface ActivityLogSettings {
  retentionEnabled: boolean;
  retentionDays: number;
  lastCleanupAt: string | null;
  lastCleanupCount: number;
}

/**
 * Fetches activity log retention policy settings.
 */
export function getActivityLogSettings(
  businessId: string,
  requestingUserId: string,
): ActivityLogSettings {
  const access = getBusinessAccess(businessId, requestingUserId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");

  const sqlite = getBusinessDb(businessId, requestingUserId).sqlite;
  const row = sqlite
    .prepare(`
      SELECT retention_enabled, retention_days, last_cleanup_at, last_cleanup_count
      FROM activity_log_settings
      WHERE business_id = ?
      LIMIT 1
    `)
    .get(businessId) as {
      retention_enabled: number;
      retention_days: number;
      last_cleanup_at: string | null;
      last_cleanup_count: number;
    } | undefined;

  if (!row) {
    return {
      retentionEnabled: false,
      retentionDays: 90,
      lastCleanupAt: null,
      lastCleanupCount: 0,
    };
  }

  return {
    retentionEnabled: Boolean(row.retention_enabled),
    retentionDays: row.retention_days ?? 90,
    lastCleanupAt: row.last_cleanup_at ?? null,
    lastCleanupCount: row.last_cleanup_count ?? 0,
  };
}

/**
 * Updates activity log retention policy settings (Admin only).
 */
export function updateActivityLogSettings(
  businessId: string,
  requestingUserId: string,
  input: { retentionEnabled: boolean; retentionDays: number },
): ActivityLogSettings {
  const access = getBusinessAccess(businessId, requestingUserId);
  if (!access || access.membership.role !== "administrator") {
    throw new Error("ADMIN_REQUIRED");
  }

  const days = Math.min(Math.max(Number(input.retentionDays) || 90, 7), 3650);
  const enabled = Boolean(input.retentionEnabled);
  const now = new Date().toISOString();

  const sqlite = getBusinessDb(businessId, requestingUserId).sqlite;

  const existing = sqlite
    .prepare("SELECT id FROM activity_log_settings WHERE business_id = ?")
    .get(businessId) as { id: string } | undefined;

  if (existing) {
    sqlite
      .prepare(`
        UPDATE activity_log_settings
        SET retention_enabled = ?, retention_days = ?, updated_at = ?
        WHERE business_id = ?
      `)
      .run(enabled ? 1 : 0, days, now, businessId);
  } else {
    sqlite
      .prepare(`
        INSERT INTO activity_log_settings (
          id, business_id, retention_enabled, retention_days,
          last_cleanup_at, last_cleanup_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 0, ?, ?)
      `)
      .run(randomUUID(), businessId, enabled ? 1 : 0, days, now, now);
  }

  recordActivity(businessId, {
    userId: requestingUserId,
    action: "settings_changed",
    entityType: "activity_log_retention",
    entityId: "retention-policy",
    summary: `Updated activity log retention policy: ${
      enabled ? `Enabled (${days} days)` : "Disabled"
    }`,
    details: { retentionEnabled: enabled, retentionDays: days },
    sqlite,
  });

  return getActivityLogSettings(businessId, requestingUserId);
}

/**
 * Executes log retention pruning, deleting logs older than specified retention days.
 */
export function runActivityLogCleanup(
  businessId: string,
  requestingUserId: string,
  overrideDays?: number,
): { deletedCount: number; cutoffDate: string; lastCleanupAt: string } {
  const access = getBusinessAccess(businessId, requestingUserId);
  if (!access || access.membership.role !== "administrator") {
    throw new Error("ADMIN_REQUIRED");
  }

  const sqlite = getBusinessDb(businessId, requestingUserId).sqlite;
  const currentSettings = getActivityLogSettings(businessId, requestingUserId);

  const days = overrideDays ?? currentSettings.retentionDays ?? 90;
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffTime).toISOString();
  const now = new Date().toISOString();

  const deleteResult = sqlite
    .prepare(`
      DELETE FROM activity_logs
      WHERE business_id = ? AND created_at < ?
    `)
    .run(businessId, cutoffDate);

  const deletedCount = deleteResult.changes;

  // Update settings record with cleanup timestamp and count
  const existing = sqlite
    .prepare("SELECT id FROM activity_log_settings WHERE business_id = ?")
    .get(businessId) as { id: string } | undefined;

  if (existing) {
    sqlite
      .prepare(`
        UPDATE activity_log_settings
        SET last_cleanup_at = ?, last_cleanup_count = ?, updated_at = ?
        WHERE business_id = ?
      `)
      .run(now, deletedCount, now, businessId);
  } else {
    sqlite
      .prepare(`
        INSERT INTO activity_log_settings (
          id, business_id, retention_enabled, retention_days,
          last_cleanup_at, last_cleanup_count, created_at, updated_at
        ) VALUES (?, ?, 0, ?, ?, ?, ?, ?)
      `)
      .run(randomUUID(), businessId, days, now, deletedCount, now, now);
  }

  if (deletedCount > 0) {
    recordActivity(businessId, {
      userId: requestingUserId,
      action: "deleted",
      entityType: "activity_log_retention",
      entityId: "retention-cleanup",
      summary: `Automated retention cleanup pruned ${deletedCount} activity logs older than ${days} days (${cutoffDate.slice(0, 10)})`,
      details: { deletedCount, cutoffDate, retentionDays: days },
      sqlite,
    });
  }

  return {
    deletedCount,
    cutoffDate,
    lastCleanupAt: now,
  };
}
