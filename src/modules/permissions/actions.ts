"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/core/permissions/require-module";
import { addExistingUser, updateMembership } from "@/core/permissions/membership-service";
import { moduleKeys, type ModuleKey } from "@/core/permissions/permissions";

export async function addExistingUserAction(businessId: string, email: string) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };
  try { addExistingUser(businessId, user.id, email); revalidatePath(`/b/${businessId}/settings/users`); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "Could not add user" }; }
}

export async function updateMembershipAction(businessId: string, membershipId: string, role: "administrator" | "standard", modules: string[]) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };
  try { updateMembership(businessId, user.id, membershipId, role, moduleKeys.filter((module) => modules.includes(module)) as ModuleKey[]); revalidatePath(`/b/${businessId}/settings/users`); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "Could not update access" }; }
}
