import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { assertBusinessAdministrator, assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { getBusinessDb } from "@/core/db/business";
import { formatMoney } from "@/core/format";
import { notifyApproversInTransaction } from "@/modules/notifications/notification-service";

import {
  APPROVAL_ENTITY_CONFIG,
  type ApprovalEntityType,
  type ApprovalEvaluation,
  type ApprovalRuleRecord,
} from "./approval-constants";

export {
  APPROVAL_ENTITY_CONFIG,
  type ApprovalEntityType,
  type ApprovalEvaluation,
  type ApprovalRuleRecord,
};

export function getApprovalRuleRow(
  sqlite: Database.Database,
  entityType: string,
): ApprovalRuleRecord | null {
  const row = sqlite
    .prepare("SELECT * FROM approval_rules WHERE entity_type = ?")
    .get(entityType) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    entityType: String(row.entity_type),
    module: String(row.module),
    isEnabled: Boolean(row.is_enabled),
    thresholdMinor: Number(row.threshold_minor ?? 0),
    requireCheckerSeparation: Boolean(row.require_checker_separation),
    updatedAt: String(row.updated_at),
  };
}

export function evaluateApprovalRequirement(
  businessId: string,
  userId: string,
  entityType: ApprovalEntityType,
  baseAmountMinor: number,
  sqliteOverride?: Database.Database,
): ApprovalEvaluation {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");

  const sqlite = sqliteOverride ?? getBusinessDb(businessId, userId).sqlite;
  const rule = getApprovalRuleRow(sqlite, entityType);
  const requireCheckerSeparation = rule ? rule.requireCheckerSeparation : true;
  const ruleEnabled = Boolean(rule?.isEnabled);
  const thresholdMinor = rule?.thresholdMinor ?? 0;

  // Administrators / workspace owners / super-admins always proceed directly.
  if (access.isSuperAdmin || access.isOwner || access.membership.role === "administrator") {
    return {
      requiresApproval: false,
      reason: "none",
      ruleEnabled,
      thresholdMinor,
      requireCheckerSeparation,
    };
  }

  // Per-user selectable policy set in Users & Access Management
  if (access.requiresApproval) {
    return {
      requiresApproval: true,
      reason: "user_policy",
      ruleEnabled,
      thresholdMinor,
      requireCheckerSeparation,
    };
  }

  // Spend threshold rule (when explicitly enabled for non-admins)
  if (ruleEnabled && baseAmountMinor >= thresholdMinor) {
    return {
      requiresApproval: true,
      reason: "spend_threshold",
      ruleEnabled,
      thresholdMinor,
      requireCheckerSeparation,
    };
  }

  return {
    requiresApproval: false,
    reason: "none",
    ruleEnabled,
    thresholdMinor,
    requireCheckerSeparation,
  };
}

export function listApprovalRules(businessId: string, userId: string): ApprovalRuleRecord[] {
  assertMutationPermission(businessId, userId, "settings", "view");
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite
    .prepare("SELECT * FROM approval_rules ORDER BY entity_type ASC")
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.id),
    entityType: String(row.entity_type),
    module: String(row.module),
    isEnabled: Boolean(row.is_enabled),
    thresholdMinor: Number(row.threshold_minor ?? 0),
    requireCheckerSeparation: Boolean(row.require_checker_separation),
    updatedAt: String(row.updated_at),
  }));
}

export function saveApprovalRule(
  businessId: string,
  userId: string,
  input: {
    entityType: string;
    isEnabled: boolean;
    thresholdMinor: number;
    requireCheckerSeparation: boolean;
  },
): ApprovalRuleRecord {
  assertBusinessAdministrator(businessId, userId);
  const threshold = Math.max(0, Math.round(input.thresholdMinor));
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  const existing = getApprovalRuleRow(sqlite, input.entityType);
  if (!existing) {
    const id = `rule-${input.entityType}`;
    const cfg = APPROVAL_ENTITY_CONFIG[input.entityType as ApprovalEntityType];
    const moduleName = cfg?.module ?? "settings";
    sqlite
      .prepare(`
        INSERT INTO approval_rules (
          id, entity_type, module, is_enabled, threshold_minor, require_checker_separation, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.entityType,
        moduleName,
        input.isEnabled ? 1 : 0,
        threshold,
        input.requireCheckerSeparation ? 1 : 0,
        now,
      );
  } else {
    sqlite
      .prepare(`
        UPDATE approval_rules
        SET is_enabled = ?, threshold_minor = ?, require_checker_separation = ?, updated_at = ?
        WHERE entity_type = ?
      `)
      .run(
        input.isEnabled ? 1 : 0,
        threshold,
        input.requireCheckerSeparation ? 1 : 0,
        now,
        input.entityType,
      );
  }

  return getApprovalRuleRow(sqlite, input.entityType)!;
}

export function recordPendingApprovalInTransaction(
  sqlite: Database.Database,
  params: {
    businessId: string;
    userId: string;
    entityType: ApprovalEntityType;
    entityId: string;
    entityNumber: string;
    amountMinor: number;
    baseAmountMinor: number;
    currencyCode: string;
    targetIntent?: string;
    requireCheckerSeparation?: boolean;
  },
): { requestId: string; notifiedUserIds: string[] } {
  const access = getBusinessAccess(params.businessId, params.userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  const cfg = APPROVAL_ENTITY_CONFIG[params.entityType];
  const now = new Date().toISOString();

  // Supersede any stale pending approval request for the same document
  sqlite
    .prepare(`
      UPDATE approval_requests
      SET status = 'withdrawn', decided_at = COALESCE(decided_at, ?)
      WHERE entity_type = ? AND entity_id = ? AND status = 'pending'
    `)
    .run(now, params.entityType, params.entityId);

  const requestId = randomUUID();
  sqlite
    .prepare(`
      INSERT INTO approval_requests (
        id, entity_type, entity_id, entity_number, module,
        amount_minor, base_amount_minor, currency_code, status,
        requested_by, requested_by_name, requested_at, target_intent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `)
    .run(
      requestId,
      params.entityType,
      params.entityId,
      params.entityNumber,
      cfg.module,
      params.amountMinor,
      params.baseAmountMinor,
      params.currencyCode,
      params.userId,
      access.user.name || access.user.email,
      now,
      params.targetIntent ?? (cfg.defaultAction === "approve" ? "issue" : "post"),
    );

  const rule = getApprovalRuleRow(sqlite, params.entityType);
  const requireCheckerSeparation =
    params.requireCheckerSeparation ?? (rule ? rule.requireCheckerSeparation : true);

  const notifiedUserIds = notifyApproversInTransaction(sqlite, {
    businessId: params.businessId,
    businessName: access.business.name,
    module: cfg.module,
    requiredAction: cfg.defaultAction,
    requesterUserId: params.userId,
    requesterName: access.user.name || access.user.email,
    requireCheckerSeparation,
    documentLabel: cfg.label,
    entityType: params.entityType,
    entityId: params.entityId,
    entityNumber: params.entityNumber,
    amountFormatted: formatMoney(params.amountMinor, params.currencyCode),
  });

  return { requestId, notifiedUserIds };
}
