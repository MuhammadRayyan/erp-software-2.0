"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/permissions/require-module";
import {
  deleteCustomReportView,
  saveCustomReportView,
  type SavedReportInput,
  type SavedReportRecord,
} from "./saved-report-service";

export async function saveCustomReportViewAction(
  businessId: string,
  input: SavedReportInput,
  existingId?: string,
): Promise<{ data?: SavedReportRecord; error?: string }> {
  try {
    const { user } = await requirePermission(businessId, "reports", "view");
    const saved = saveCustomReportView(businessId, user.id, input, existingId);
    revalidatePath(`/b/${businessId}/reports`);
    return { data: saved };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save report view." };
  }
}

export async function deleteCustomReportViewAction(
  businessId: string,
  id: string,
): Promise<{ error?: string }> {
  try {
    const { user } = await requirePermission(businessId, "reports", "view");
    deleteCustomReportView(businessId, user.id, id);
    revalidatePath(`/b/${businessId}/reports`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not delete report view." };
  }
}
