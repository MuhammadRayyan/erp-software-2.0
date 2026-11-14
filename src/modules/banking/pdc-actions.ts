"use server";

import { revalidatePath } from "next/cache";
import { requireMutationPermission } from "@/core/permissions/require-module";
import type { PdcInput } from "./pdc-input";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
import { bouncePdc, cancelPdc, clearPdc, createPdc, depositPdc } from "./pdc-service";

export async function createPdcAction(businessId: string, input: PdcInput) {
  try {
    const { user } = await requireMutationPermission(businessId, "banking", "create");
    const id = createPdc(businessId, user.id, input);
    revalidatePath(`/b/${businessId}/banking/pdcs`);
    revalidatePath(`/b/${businessId}/overview`);
    return { id };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to register post-dated cheque.") };
  }
}

export async function depositPdcAction(businessId: string, pdcId: string, depositDate?: string) {
  try {
    const { user } = await requireMutationPermission(businessId, "banking", "edit");
    depositPdc(businessId, user.id, pdcId, depositDate);
    revalidatePath(`/b/${businessId}/banking/pdcs`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to mark cheque as deposited.") };
  }
}

export async function clearPdcAction(businessId: string, pdcId: string, clearingDate?: string) {
  try {
    const { user } = await requireMutationPermission(businessId, "banking", "approve");
    clearPdc(businessId, user.id, pdcId, clearingDate);
    revalidatePath(`/b/${businessId}/banking/pdcs`);
    revalidatePath(`/b/${businessId}/banking/accounts`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to clear post-dated cheque.") };
  }
}

export async function bouncePdcAction(
  businessId: string,
  pdcId: string,
  bounceReason: string,
  bounceDate?: string,
) {
  try {
    const { user } = await requireMutationPermission(businessId, "banking", "approve");
    bouncePdc(businessId, user.id, pdcId, bounceReason, bounceDate);
    revalidatePath(`/b/${businessId}/banking/pdcs`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to record bounced cheque.") };
  }
}

export async function cancelPdcAction(businessId: string, pdcId: string) {
  try {
    const { user } = await requireMutationPermission(businessId, "banking", "edit");
    cancelPdc(businessId, user.id, pdcId);
    revalidatePath(`/b/${businessId}/banking/pdcs`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true };
  } catch (error) {
    return { error: getErrorMessage(error, "Failed to cancel post-dated cheque.") };
  }
}
