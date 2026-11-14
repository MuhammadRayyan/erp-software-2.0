import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessAccess, hasActionPermission } from "@/core/permissions/permissions";
import { getBusinessDb, runImmediateTransaction } from "@/core/db/business";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { notifyMakerDecisionInTransaction } from "@/modules/notifications/notification-service";
import {
  APPROVAL_ENTITY_CONFIG,
  getApprovalRuleRow,
  type ApprovalEntityType,
} from "./approval-policy";
import {
  postPendingSalesInvoice,
  revertSalesInvoiceToDraft,
} from "@/modules/sales-invoices/invoice-service";
import {
  postPendingPurchaseInvoice,
  revertPurchaseInvoiceToDraft,
} from "@/modules/purchase-invoices/purchase-invoice-service";
import {
  issuePendingPurchaseOrder,
  revertPurchaseOrderToDraft,
} from "@/modules/purchase-orders/purchase-order-service";
import {
  postPendingReceipt,
  revertReceiptToDraft,
} from "@/modules/receipts/receipt-service";
import {
  postPendingSupplierPayment,
  revertSupplierPaymentToDraft,
} from "@/modules/supplier-payments/supplier-payment-service";

export type ApprovalRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface ApprovalRequestRecord {
  id: string;
  entityType: ApprovalEntityType;
  entityLabel: string;
  entityId: string;
  entityNumber: string;
  entityUrl: string;
  module: string;
  amountMinor: number;
  baseAmountMinor: number;
  currencyCode: string;
  status: ApprovalRequestStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  targetIntent: string;
  canApprove: boolean;
  blockedReason: string | null;
}

function getEntityConfig(entityType: string) {
  const cfg = APPROVAL_ENTITY_CONFIG[entityType as ApprovalEntityType];
  if (!cfg) throw new Error(`Unsupported approval entity type: ${entityType}`);
  return cfg;
}

function canUserApproveRequest(
  businessId: string,
  userId: string,
  entityType: string,
  requestedBy: string,
  requireCheckerSeparation: boolean,
): { canApprove: boolean; blockedReason: string | null } {
  const access = getBusinessAccess(businessId, userId);
  if (!access) return { canApprove: false, blockedReason: "No workspace access." };
  const cfg = APPROVAL_ENTITY_CONFIG[entityType as ApprovalEntityType];
  if (!cfg) return { canApprove: false, blockedReason: "Unsupported document type." };

  const hasCap =
    hasActionPermission(businessId, userId, cfg.module, cfg.defaultAction) ||
    hasActionPermission(businessId, userId, cfg.module, "post") ||
    hasActionPermission(businessId, userId, cfg.module, "approve");

  if (!hasCap) {
    return { canApprove: false, blockedReason: `Missing ${cfg.module}:${cfg.defaultAction} permission.` };
  }
  if (access.requiresApproval) {
    return {
      canApprove: false,
      blockedReason: "Users marked as requiring approval cannot act as approvers.",
    };
  }
  if (requireCheckerSeparation && requestedBy === userId) {
    return {
      canApprove: false,
      blockedReason: "Maker-Checker separation prevents approving your own submission.",
    };
  }
  return { canApprove: true, blockedReason: null };
}

function mapApprovalRow(
  businessId: string,
  userId: string,
  row: Record<string, unknown>,
  separationByType: Map<string, boolean>,
): ApprovalRequestRecord {
  const entityType = String(row.entity_type) as ApprovalEntityType;
  const cfg = APPROVAL_ENTITY_CONFIG[entityType];
  const requestedBy = String(row.requested_by);
  const sep = separationByType.get(entityType) ?? true;
  const eligibility =
    String(row.status) === "pending"
      ? canUserApproveRequest(businessId, userId, entityType, requestedBy, sep)
      : { canApprove: false, blockedReason: null };

  return {
    id: String(row.id),
    entityType,
    entityLabel: cfg?.label ?? entityType,
    entityId: String(row.entity_id),
    entityNumber: String(row.entity_number),
    entityUrl: cfg ? cfg.detailUrl(businessId, String(row.entity_id)) : `/b/${businessId}/overview`,
    module: String(row.module),
    amountMinor: Number(row.amount_minor ?? 0),
    baseAmountMinor: Number(row.base_amount_minor ?? 0),
    currencyCode: String(row.currency_code ?? "AED"),
    status: String(row.status) as ApprovalRequestStatus,
    requestedBy,
    requestedByName: String(row.requested_by_name),
    requestedAt: String(row.requested_at),
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    decidedByName: row.decided_by_name ? String(row.decided_by_name) : null,
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    decisionNote: row.decision_note ? String(row.decision_note) : null,
    targetIntent: String(row.target_intent ?? "post"),
    canApprove: eligibility.canApprove,
    blockedReason: eligibility.blockedReason,
  };
}

export function listApprovalRequests(
  businessId: string,
  userId: string,
  options?: { status?: ApprovalRequestStatus | "all" },
): ApprovalRequestRecord[] {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  const { sqlite } = getBusinessDb(businessId, userId);

  const ruleRows = sqlite
    .prepare("SELECT entity_type, require_checker_separation FROM approval_rules")
    .all() as { entity_type: string; require_checker_separation: number }[];
  const separationByType = new Map(
    ruleRows.map((r) => [r.entity_type, Boolean(r.require_checker_separation)]),
  );

  const statusFilter = options?.status && options.status !== "all" ? options.status : null;
  const rows = (
    statusFilter
      ? sqlite
          .prepare(`
            SELECT * FROM approval_requests
            WHERE status = ?
            ORDER BY requested_at DESC
          `)
          .all(statusFilter)
      : sqlite
          .prepare(`
            SELECT * FROM approval_requests
            ORDER BY
              CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC,
              requested_at DESC
          `)
          .all()
  ) as Record<string, unknown>[];

  // Filter rows to modules the user can access or requests they submitted themselves
  const isAdmin =
    access.isSuperAdmin || access.isOwner || access.membership.role === "administrator";
  return rows
    .filter((row) => {
      if (isAdmin) return true;
      if (String(row.requested_by) === userId) return true;
      const cfg = APPROVAL_ENTITY_CONFIG[String(row.entity_type) as ApprovalEntityType];
      return cfg ? hasActionPermission(businessId, userId, cfg.module, "view") : false;
    })
    .map((row) => mapApprovalRow(businessId, userId, row, separationByType));
}

export function getPendingApprovalCount(businessId: string, userId: string): number {
  try {
    const items = listApprovalRequests(businessId, userId, { status: "pending" });
    return items.filter((item) => item.canApprove).length;
  } catch {
    return 0;
  }
}

export function getLatestApprovalForEntity(
  businessId: string,
  userId: string,
  entityType: ApprovalEntityType,
  entityId: string,
): ApprovalRequestRecord | null {
  const access = getBusinessAccess(businessId, userId);
  if (!access) return null;
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare(`
      SELECT * FROM approval_requests
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY requested_at DESC
      LIMIT 1
    `)
    .get(entityType, entityId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const rule = getApprovalRuleRow(sqlite, entityType);
  const separationByType = new Map([[entityType, rule ? rule.requireCheckerSeparation : true]]);
  return mapApprovalRow(businessId, userId, row, separationByType);
}

export function approveDocumentRequest(
  businessId: string,
  userId: string,
  requestId: string,
  note?: string,
): ApprovalRequestRecord {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  const { sqlite } = getBusinessDb(businessId, userId);

  const reqRow = sqlite
    .prepare("SELECT * FROM approval_requests WHERE id = ?")
    .get(requestId) as Record<string, unknown> | undefined;
  if (!reqRow) throw new Error("Approval request not found.");
  if (String(reqRow.status) !== "pending") {
    throw new Error(`Approval request is already ${String(reqRow.status)}.`);
  }

  const entityType = String(reqRow.entity_type) as ApprovalEntityType;
  const entityId = String(reqRow.entity_id);
  const entityNumber = String(reqRow.entity_number);
  const requestedBy = String(reqRow.requested_by);
  const cfg = getEntityConfig(entityType);

  assertMutationPermission(businessId, userId, cfg.module, cfg.defaultAction);

  if (access.requiresApproval) {
    throw new Error("PERMISSION_DENIED: Users configured to require approval cannot approve documents.");
  }

  const rule = getApprovalRuleRow(sqlite, entityType);
  const requireSeparation = rule ? rule.requireCheckerSeparation : true;
  if (requireSeparation && requestedBy === userId) {
    throw new Error("Maker-Checker separation prevents you from approving your own submission.");
  }

  const now = new Date().toISOString();
  const deciderName = access.user.name || access.user.email;
  const cleanNote = note?.trim() || null;

  runImmediateTransaction(sqlite, () => {
    const claim = sqlite
      .prepare(`
        UPDATE approval_requests
        SET status = 'approved',
            decided_by = ?,
            decided_by_name = ?,
            decided_at = ?,
            decision_note = ?
        WHERE id = ? AND status = 'pending'
      `)
      .run(userId, deciderName, now, cleanNote, requestId);

    if (claim.changes !== 1) {
      throw new Error("Approval request is no longer pending.");
    }

    // Finalize the underlying document atomically (posts GL / VAT / inventory or issues operational doc)
    if (entityType === "sales_invoice") {
      postPendingSalesInvoice(businessId, userId, entityId);
    } else if (entityType === "purchase_invoice") {
      postPendingPurchaseInvoice(businessId, userId, entityId);
    } else if (entityType === "purchase_order") {
      issuePendingPurchaseOrder(businessId, userId, entityId);
    } else if (entityType === "receipt") {
      postPendingReceipt(businessId, userId, entityId);
    } else if (entityType === "supplier_payment") {
      postPendingSupplierPayment(businessId, userId, entityId);
    }

    notifyMakerDecisionInTransaction(sqlite, {
      businessId,
      businessName: access.business.name,
      recipientUserId: requestedBy,
      deciderUserId: userId,
      deciderName,
      decision: "approved",
      documentLabel: cfg.label,
      entityType,
      entityId,
      entityNumber,
      actionPath: cfg.detailUrl(businessId, entityId),
      note: cleanNote,
    });

    recordActivity(businessId, {
      entityType,
      entityId,
      entityNumber,
      action: "posted",
      summary: `${deciderName} approved ${cfg.label} ${entityNumber}`,
      userId,
      sqlite,
    });
  });

  const updated = sqlite
    .prepare("SELECT * FROM approval_requests WHERE id = ?")
    .get(requestId) as Record<string, unknown>;
  return mapApprovalRow(
    businessId,
    userId,
    updated,
    new Map([[entityType, requireSeparation]]),
  );
}

export function rejectDocumentRequest(
  businessId: string,
  userId: string,
  requestId: string,
  note: string,
): ApprovalRequestRecord {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  const cleanNote = note.trim();
  if (!cleanNote) throw new Error("Provide a reason when rejecting a submission.");

  const { sqlite } = getBusinessDb(businessId, userId);
  const reqRow = sqlite
    .prepare("SELECT * FROM approval_requests WHERE id = ?")
    .get(requestId) as Record<string, unknown> | undefined;
  if (!reqRow) throw new Error("Approval request not found.");
  if (String(reqRow.status) !== "pending") {
    throw new Error(`Approval request is already ${String(reqRow.status)}.`);
  }

  const entityType = String(reqRow.entity_type) as ApprovalEntityType;
  const entityId = String(reqRow.entity_id);
  const entityNumber = String(reqRow.entity_number);
  const requestedBy = String(reqRow.requested_by);
  const cfg = getEntityConfig(entityType);

  assertMutationPermission(businessId, userId, cfg.module, cfg.defaultAction);

  if (access.requiresApproval) {
    throw new Error("PERMISSION_DENIED: Users configured to require approval cannot reject others' documents.");
  }

  const rule = getApprovalRuleRow(sqlite, entityType);
  const requireSeparation = rule ? rule.requireCheckerSeparation : true;
  if (requireSeparation && requestedBy === userId) {
    throw new Error("Maker-Checker separation prevents you from deciding your own submission.");
  }

  const now = new Date().toISOString();
  const deciderName = access.user.name || access.user.email;

  runImmediateTransaction(sqlite, () => {
    const claim = sqlite
      .prepare(`
        UPDATE approval_requests
        SET status = 'rejected',
            decided_by = ?,
            decided_by_name = ?,
            decided_at = ?,
            decision_note = ?
        WHERE id = ? AND status = 'pending'
      `)
      .run(userId, deciderName, now, cleanNote, requestId);

    if (claim.changes !== 1) {
      throw new Error("Approval request is no longer pending.");
    }

    if (entityType === "sales_invoice") {
      revertSalesInvoiceToDraft(businessId, userId, entityId);
    } else if (entityType === "purchase_invoice") {
      revertPurchaseInvoiceToDraft(businessId, userId, entityId);
    } else if (entityType === "purchase_order") {
      revertPurchaseOrderToDraft(businessId, userId, entityId);
    } else if (entityType === "receipt") {
      revertReceiptToDraft(businessId, userId, entityId);
    } else if (entityType === "supplier_payment") {
      revertSupplierPaymentToDraft(businessId, userId, entityId);
    }

    notifyMakerDecisionInTransaction(sqlite, {
      businessId,
      businessName: access.business.name,
      recipientUserId: requestedBy,
      deciderUserId: userId,
      deciderName,
      decision: "rejected",
      documentLabel: cfg.label,
      entityType,
      entityId,
      entityNumber,
      actionPath: cfg.detailUrl(businessId, entityId),
      note: cleanNote,
    });

    recordActivity(businessId, {
      entityType,
      entityId,
      entityNumber,
      action: "updated",
      summary: `${deciderName} rejected ${cfg.label} ${entityNumber}: ${cleanNote}`,
      userId,
      sqlite,
    });
  });

  const updated = sqlite
    .prepare("SELECT * FROM approval_requests WHERE id = ?")
    .get(requestId) as Record<string, unknown>;
  return mapApprovalRow(
    businessId,
    userId,
    updated,
    new Map([[entityType, requireSeparation]]),
  );
}

export function withdrawApprovalRequest(
  businessId: string,
  userId: string,
  requestId: string,
): void {
  const access = getBusinessAccess(businessId, userId);
  if (!access) throw new Error("BUSINESS_ACCESS_DENIED");
  const { sqlite } = getBusinessDb(businessId, userId);

  const reqRow = sqlite
    .prepare("SELECT * FROM approval_requests WHERE id = ?")
    .get(requestId) as Record<string, unknown> | undefined;
  if (!reqRow) throw new Error("Approval request not found.");
  if (String(reqRow.status) !== "pending") {
    throw new Error("Only pending approval requests can be withdrawn.");
  }

  const entityType = String(reqRow.entity_type) as ApprovalEntityType;
  const entityId = String(reqRow.entity_id);
  const requestedBy = String(reqRow.requested_by);
  const cfg = getEntityConfig(entityType);

  assertMutationPermission(businessId, userId, cfg.module, "edit");
  const isAdmin =
    access.isSuperAdmin || access.isOwner || access.membership.role === "administrator";
  if (!isAdmin && requestedBy !== userId) {
    throw new Error("Only the submitter or an Administrator can withdraw a pending approval request.");
  }

  const now = new Date().toISOString();
  runImmediateTransaction(sqlite, () => {
    const claim = sqlite
      .prepare(`
        UPDATE approval_requests
        SET status = 'withdrawn', decided_by = ?, decided_by_name = ?, decided_at = ?, decision_note = 'Withdrawn by submitter'
        WHERE id = ? AND status = 'pending'
      `)
      .run(userId, access.user.name || access.user.email, now, requestId);

    if (claim.changes !== 1) {
      throw new Error("Only pending approval requests can be withdrawn.");
    }

    const tableMap: Record<ApprovalEntityType, { table: string; statusCol: string }> = {
      sales_invoice: { table: "sales_invoices", statusCol: "document_status" },
      purchase_invoice: { table: "purchase_invoices", statusCol: "document_status" },
      purchase_order: { table: "purchase_orders", statusCol: "status" },
      receipt: { table: "receipts", statusCol: "document_status" },
      supplier_payment: { table: "supplier_payments", statusCol: "document_status" },
    };
    const info = tableMap[entityType];
    sqlite
      .prepare(`UPDATE ${info.table} SET ${info.statusCol} = 'draft' WHERE id = ? AND ${info.statusCol} = 'pending_approval'`)
      .run(entityId);
  });
}
