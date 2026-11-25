import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { getSystemDb } from "@/core/db/system";
import { businesses, memberships, users } from "@/core/db/system-schema";
import {
  getBusinessAccess,
  hasActionPermission,
  type ActionKey,
  type ModuleKey,
} from "@/core/permissions/permissions";
import {
  sendApprovalDecisionEmail,
  sendApprovalRequestedEmail,
} from "@/modules/email/system-email-service";

export interface NotificationRecord {
  id: string;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  entityNumber: string | null;
  actionUrl: string | null;
  actorUserId: string | null;
  actorName: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    recipientUserId: String(row.recipient_user_id),
    type: String(row.type),
    title: String(row.title),
    message: String(row.message),
    entityType: row.entity_type ? String(row.entity_type) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    entityNumber: row.entity_number ? String(row.entity_number) : null,
    actionUrl: row.action_url ? String(row.action_url) : null,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorName: row.actor_name ? String(row.actor_name) : null,
    isRead: Boolean(row.is_read),
    readAt: row.read_at ? String(row.read_at) : null,
    createdAt: String(row.created_at),
  };
}

export function insertNotification(
  sqlite: Database.Database,
  input: {
    recipientUserId: string;
    type: string;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
    entityNumber?: string | null;
    actionUrl?: string | null;
    actorUserId?: string | null;
    actorName?: string | null;
  },
): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(`
      INSERT INTO notifications (
        id, recipient_user_id, type, title, message,
        entity_type, entity_id, entity_number, action_url,
        actor_user_id, actor_name, is_read, read_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `)
    .run(
      id,
      input.recipientUserId,
      input.type,
      input.title,
      input.message,
      input.entityType ?? null,
      input.entityId ?? null,
      input.entityNumber ?? null,
      input.actionUrl ?? null,
      input.actorUserId ?? null,
      input.actorName ?? null,
      now,
    );
  return id;
}

export function resolveEligibleApprovers(
  businessId: string,
  module: ModuleKey,
  requiredAction: ActionKey = "approve",
  excludeUserId?: string | null,
): { userId: string; name: string; email: string }[] {
  const sysDb = getSystemDb();
  const rows = sysDb
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      status: users.status,
      role: memberships.role,
      requiresApproval: memberships.requiresApproval,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.businessId, businessId))
    .all();

  const business = sysDb.select().from(businesses).where(eq(businesses.id, businessId)).get();
  const ownerId = business?.ownerUserId;

  const eligible: { userId: string; name: string; email: string }[] = [];
  for (const row of rows) {
    if (row.status !== "active") continue;
    if (excludeUserId && row.userId === excludeUserId) continue;

    const isAdmin = row.role === "administrator" || row.userId === ownerId;
    if (isAdmin) {
      eligible.push({ userId: row.userId, name: row.name, email: row.email });
      continue;
    }

    if (row.requiresApproval) continue;
    if (
      hasActionPermission(businessId, row.userId, module, requiredAction) ||
      hasActionPermission(businessId, row.userId, module, "post")
    ) {
      eligible.push({ userId: row.userId, name: row.name, email: row.email });
    }
  }

  return eligible;
}

export function notifyApproversInTransaction(
  sqlite: Database.Database,
  params: {
    businessId: string;
    businessName: string;
    module: ModuleKey;
    requiredAction?: ActionKey;
    requesterUserId: string;
    requesterName: string;
    requireCheckerSeparation: boolean;
    documentLabel: string;
    entityType: string;
    entityId: string;
    entityNumber: string;
    amountFormatted: string;
  },
): string[] {
  const actionPath = `/b/${params.businessId}/approvals`;
  let approvers = resolveEligibleApprovers(
    params.businessId,
    params.module,
    params.requiredAction ?? "approve",
    params.requireCheckerSeparation ? params.requesterUserId : undefined,
  );

  // Fallback: if separation excluded all users (single-member test workspace), notify owner/admins
  if (approvers.length === 0) {
    approvers = resolveEligibleApprovers(
      params.businessId,
      params.module,
      params.requiredAction ?? "approve",
      undefined,
    );
  }

  const notifiedIds: string[] = [];
  for (const approver of approvers) {
    insertNotification(sqlite, {
      recipientUserId: approver.userId,
      type: "approval_requested",
      title: `Approval Required: ${params.entityNumber}`,
      message: `${params.requesterName} submitted ${params.documentLabel} ${params.entityNumber} (${params.amountFormatted}) for approval.`,
      entityType: params.entityType,
      entityId: params.entityId,
      entityNumber: params.entityNumber,
      actionUrl: actionPath,
      actorUserId: params.requesterUserId,
      actorName: params.requesterName,
    });
    notifiedIds.push(approver.userId);

    if (approver.email) {
      void sendApprovalRequestedEmail({
        businessId: params.businessId,
        businessName: params.businessName,
        recipientEmail: approver.email,
        recipientName: approver.name,
        requesterName: params.requesterName,
        documentLabel: params.documentLabel,
        entityNumber: params.entityNumber,
        amountFormatted: params.amountFormatted,
        actionPath,
      }).catch(() => {});
    }
  }

  return notifiedIds;
}

export function notifyMakerDecisionInTransaction(
  sqlite: Database.Database,
  params: {
    businessId: string;
    businessName: string;
    recipientUserId: string;
    deciderUserId: string;
    deciderName: string;
    decision: "approved" | "rejected";
    documentLabel: string;
    entityType: string;
    entityId: string;
    entityNumber: string;
    actionPath: string;
    note?: string | null;
  },
): string | null {
  const sysDb = getSystemDb();
  const recipient = sysDb
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.id, params.recipientUserId)))
    .get();

  const verb = params.decision === "approved" ? "Approved" : "Rejected";
  const detailSuffix = params.note ? `: ${params.note}` : "";
  const message =
    params.decision === "approved"
      ? `${params.deciderName} approved and finalized ${params.documentLabel} ${params.entityNumber}${detailSuffix}.`
      : `${params.deciderName} returned ${params.documentLabel} ${params.entityNumber} to draft${detailSuffix}.`;

  const notificationId = insertNotification(sqlite, {
    recipientUserId: params.recipientUserId,
    type: params.decision === "approved" ? "approval_approved" : "approval_rejected",
    title: `${verb}: ${params.entityNumber}`,
    message,
    entityType: params.entityType,
    entityId: params.entityId,
    entityNumber: params.entityNumber,
    actionUrl: params.actionPath,
    actorUserId: params.deciderUserId,
    actorName: params.deciderName,
  });

  if (recipient?.email) {
    void sendApprovalDecisionEmail({
      businessId: params.businessId,
      businessName: params.businessName,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      deciderName: params.deciderName,
      decision: params.decision,
      documentLabel: params.documentLabel,
      entityNumber: params.entityNumber,
      note: params.note,
      actionPath: params.actionPath,
    }).catch(() => {});
  }

  return notificationId;
}

export function listNotificationsForUser(
  businessId: string,
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number },
): NotificationRecord[] {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  const { sqlite } = getBusinessDb(businessId, userId);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);

  const sql = options?.unreadOnly
    ? `SELECT * FROM notifications WHERE recipient_user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY is_read ASC, created_at DESC LIMIT ?`;

  const rows = sqlite.prepare(sql).all(userId, limit) as Record<string, unknown>[];
  return rows.map(mapRow);
}

export function getUnreadNotificationCount(businessId: string, userId: string): number {
  const access = getBusinessAccess(businessId, userId);
  if (!access) return 0;
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare("SELECT COUNT(*) AS cnt FROM notifications WHERE recipient_user_id = ? AND is_read = 0")
    .get(userId) as { cnt: number };
  return row.cnt;
}

function assertMembership(businessId: string, userId: string): void {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  if (access.business.status === "suspended" && !access.isSuperAdmin) {
    throw new Error("BUSINESS_SUSPENDED");
  }
}

export function markNotificationRead(
  businessId: string,
  userId: string,
  notificationId: string,
): void {
  assertMembership(businessId, userId);
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite
    .prepare(`
      UPDATE notifications
      SET is_read = 1, read_at = COALESCE(read_at, ?)
      WHERE id = ? AND recipient_user_id = ?
    `)
    .run(now, notificationId, userId);
}

export function markAllNotificationsRead(businessId: string, userId: string): void {
  assertMembership(businessId, userId);
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite
    .prepare(`
      UPDATE notifications
      SET is_read = 1, read_at = COALESCE(read_at, ?)
      WHERE recipient_user_id = ? AND is_read = 0
    `)
    .run(now, userId);
}
