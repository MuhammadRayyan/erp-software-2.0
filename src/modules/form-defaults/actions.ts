"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/permissions/require-module";
import { saveFormDefaults, type FormDefaultValues } from "./form-defaults-service";

export async function saveFormDefaultsAction(
  businessId: string,
  formType: string,
  values: FormDefaultValues,
): Promise<{ error?: string }> {
  try {
    const { user } = await requirePermission(businessId, "settings", "edit");
    saveFormDefaults(businessId, user.id, formType, values);
    revalidatePath(`/b/${businessId}/settings/form-defaults/${formType}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save form defaults." };
  }
}
