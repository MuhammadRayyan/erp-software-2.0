"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/core/permissions/require-module";
import { saveTemplateSettings } from "./template-service";

export type SettingsResult = { error?: string };

export async function saveTemplateSettingsAction(
  businessId: string,
  documentType: string,
  settings: unknown,
): Promise<SettingsResult> {
  const { user } = await requireModule(businessId, "settings");
  try {
    saveTemplateSettings(businessId, user.id, documentType, settings);
    revalidatePath(`/b/${businessId}/settings/document-templates`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save template settings" };
  }
}
