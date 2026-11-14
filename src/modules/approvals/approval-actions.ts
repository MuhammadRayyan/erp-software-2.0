"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { saveApprovalRule } from "./approval-policy";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
import {
  approveDocumentRequest,
  rejectDocumentRequest,
  withdrawApprovalRequest,
} from "./approval-service";

export async function approveDocumentRequestAction(
  businessId: string,
  requestId: string,
  note?: string,
) {
  try {
    const user = await requireUser();
    const updated = approveDocumentRequest(businessId, user.id, requestId, note);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    revalidatePath(updated.entityUrl);
    return { request: updated };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to approve request.") };
  }
}

export async function rejectDocumentRequestAction(
  businessId: string,
  requestId: string,
  note: string,
) {
  try {
    const user = await requireUser();
    const updated = rejectDocumentRequest(businessId, user.id, requestId, note);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    revalidatePath(updated.entityUrl);
    return { request: updated };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to reject request.") };
  }
}

export async function withdrawApprovalRequestAction(
  businessId: string,
  requestId: string,
  entityUrl?: string,
) {
  try {
    const user = await requireUser();
    withdrawApprovalRequest(businessId, user.id, requestId);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    if (entityUrl) revalidatePath(entityUrl);
    return { ok: true };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to withdraw request.") };
  }
}

export async function saveApprovalRuleAction(
  businessId: string,
  input: {
    entityType: string;
    isEnabled: boolean;
    thresholdMinor: number;
    requireCheckerSeparation: boolean;
  },
) {
  try {
    const user = await requireUser();
    const rule = saveApprovalRule(businessId, user.id, input);
    revalidatePath(`/b/${businessId}/settings/approvals`);
    revalidatePath(`/b/${businessId}/approvals`);
    return { rule };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to update approval rule.") };
  }
}
