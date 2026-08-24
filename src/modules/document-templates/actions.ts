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
  const { user, access } = await requireModule(businessId, "settings");

  // Custom HTML templates execute server-side in a headless browser.
  // Restrict that engine choice to business administrators only.
  const wantsCustomHtml =
    typeof settings === "object" &&
    settings !== null &&
    (settings as { templateType?: unknown }).templateType === "custom-html";
  if (wantsCustomHtml && access.membership.role !== "administrator") {
    return { error: "Only administrators can configure custom HTML templates." };
  }

  try {
    saveTemplateSettings(businessId, user.id, documentType, settings);
    revalidatePath(`/b/${businessId}/settings/document-templates`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save template settings" };
  }
}
