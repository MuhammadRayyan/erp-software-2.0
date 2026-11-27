"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/permissions/require-module";
import {
  postFxRevaluation,
  previewFxRevaluation,
  voidFxRevaluation,
  type FxRevaluationInput,
  type FxRevaluationPreview,
} from "./services/fx-revaluation-service";

function revalidate(businessId: string) {
  revalidatePath(`/b/${businessId}/accounting/fx-revaluation`);
  revalidatePath(`/b/${businessId}/accounting/journal`);
  revalidatePath(`/b/${businessId}/reports`);
}

export async function previewFxRevaluationAction(
  businessId: string,
  input: FxRevaluationInput,
): Promise<{ preview?: FxRevaluationPreview; error?: string }> {
  try {
    const { user } = await requirePermission(businessId, "accounting", "view");
    return { preview: previewFxRevaluation(businessId, user.id, input) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The revaluation could not be previewed." };
  }
}

export async function postFxRevaluationAction(
  businessId: string,
  input: FxRevaluationInput,
): Promise<{ id?: string; revaluationNumber?: string; error?: string }> {
  try {
    const { user } = await requirePermission(businessId, "accounting", "post");
    const result = postFxRevaluation(businessId, user.id, input);
    revalidate(businessId);
    return { id: result.id, revaluationNumber: result.revaluationNumber };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The revaluation could not be posted." };
  }
}

export async function voidFxRevaluationAction(
  businessId: string,
  revaluationId: string,
): Promise<{ error?: string }> {
  try {
    const { user } = await requirePermission(businessId, "accounting", "delete");
    voidFxRevaluation(businessId, user.id, revaluationId);
    revalidate(businessId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The revaluation could not be voided." };
  }
}
