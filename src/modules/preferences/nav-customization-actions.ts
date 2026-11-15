"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/core/auth/session";
import { saveHiddenNavPaths } from "@/modules/preferences/nav-customization-service";

/** Persist visible/hidden sidebar modules for a business and revalidate the workspace layout. */
export async function saveNavCustomizationAction(
  businessId: string,
  hiddenPaths: string[],
): Promise<{ ok?: true; hiddenPaths?: string[]; error?: string }> {
  const session = await getCurrentSession();
  if (!session) return { error: "Unauthorized" };

  try {
    const saved = saveHiddenNavPaths(businessId, session.user.id, hiddenPaths);
    revalidatePath(`/b/${businessId}`, "layout");
    revalidatePath(`/b/${businessId}/modules`, "page");
    revalidatePath(`/b/${businessId}/settings/customize`, "page");
    return { ok: true, hiddenPaths: saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save module visibility.";
    return { error: message };
  }
}
