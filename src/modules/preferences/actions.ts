"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/core/auth/session";
import { clearPreferences } from "@/modules/preferences/preference-service";

/**
 * Wipes every per-account preference for the calling user on the given
 * business. Intended for the "Reset to defaults" affordance on the
 * preferences settings page. Returns `{ ok: true, deleted }` on success
 * or `{ error }` on auth/validation failure.
 */
export async function resetBusinessPreferences(businessId: string) {
  const session = await getCurrentSession();
  if (!session) return { error: "Unauthorized" };

  try {
    const deleted = clearPreferences(businessId, session.user.id);
    revalidatePath(`/b/${businessId}/settings/preferences`, "page");
    return { ok: true as const, deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset preferences.";
    return { error: message };
  }
}
