"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/permissions/require-module";
import { saveTemplateSettings } from "./template-service";

export type SettingsResult = { error?: string };

export async function saveTemplateSettingsAction(
  businessId: string,
  documentType: string,
  settings: unknown,
): Promise<SettingsResult> {
  try {
    const { user, access } = await requirePermission(businessId, "settings", "edit");
    if (access.membership.role !== "administrator") {
      return { error: "Administrator access is required." };
    }
    saveTemplateSettings(businessId, user.id, documentType, settings);
    revalidatePath(`/b/${businessId}/settings/document-templates`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save template settings" };
  }
}
