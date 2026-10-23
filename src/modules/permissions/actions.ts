"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/core/permissions/require-module";
import {
  addExistingUser,
  createAndAddBusinessUser,
  createInvitationLinkForUser,
  createPasswordResetLinkForUser,
  inviteBusinessUser,
  removeBusinessUser,
  resendInvitation,
  sendPasswordResetForUser,
  toggleUserSuspension,
  updateMembership,
} from "@/core/permissions/membership-service";
import { moduleKeys, type ModuleKey } from "@/core/permissions/permissions";

export async function inviteBusinessUserAction(
  businessId: string,
  input: {
    email: string;
    role?: "administrator" | "standard";
    modules?: string[];
    sendEmail?: boolean;
  }
) {

  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };

  try {
    const safeModules = input.modules
      ? (input.modules.filter((m) => moduleKeys.includes(m as ModuleKey)) as ModuleKey[])
      : undefined;

    const res = await inviteBusinessUser(businessId, user.id, {
      email: input.email,
      role: input.role,
      modules: safeModules,
      sendEmail: input.sendEmail,
    });

    revalidatePath(`/b/${businessId}/settings/users`);
    return {
      success: true,
      data: res,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not invite user" };
  }
}

export async function createInvitationLinkAction(businessId: string, targetUserId: string) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };

  try {
    const res = createInvitationLinkForUser(businessId, user.id, targetUserId);
    revalidatePath(`/b/${businessId}/settings/users`);
    return { success: true, data: res };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create invitation link" };
  }
}

export async function createPasswordResetLinkAction(businessId: string, targetUserId: string) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };

  try {
    const res = createPasswordResetLinkForUser(businessId, user.id, targetUserId);
    revalidatePath(`/b/${businessId}/settings/users`);
    return { success: true, data: res };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create password reset link" };
  }
}

export async function resendInvitationAction(businessId: string, targetUserId: string) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };

  try {
    const res = await resendInvitation(businessId, user.id, targetUserId);
    revalidatePath(`/b/${businessId}/settings/users`);
    return { success: true, data: res };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not resend invitation" };
  }
}

export async function sendPasswordResetAction(businessId: string, targetUserId: string) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };

  try {
    const res = await sendPasswordResetForUser(businessId, user.id, targetUserId);
    revalidatePath(`/b/${businessId}/settings/users`);
    return { success: true, data: res };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send password reset email" };
  }
}


export async function toggleUserSuspensionAction(
  businessId: string,
  targetUserId: string,
  status: "active" | "suspended"
) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };

  try {
    const res = toggleUserSuspension(businessId, user.id, targetUserId, status);
    revalidatePath(`/b/${businessId}/settings/users`);
    return { success: true, newStatus: res.newStatus };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update user status" };
  }
}

export async function removeBusinessUserAction(businessId: string, membershipId: string) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };

  try {
    removeBusinessUser(businessId, user.id, membershipId);
    revalidatePath(`/b/${businessId}/settings/users`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not remove user access" };
  }
}

export async function updateMembershipAction(
  businessId: string,
  membershipId: string,
  role: "administrator" | "standard",
  modules: string[]
) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };
  try {
    updateMembership(
      businessId,
      user.id,
      membershipId,
      role,
      moduleKeys.filter((module) => modules.includes(module)) as ModuleKey[]
    );
    revalidatePath(`/b/${businessId}/settings/users`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update access" };
  }
}

export async function addExistingUserAction(businessId: string, email: string) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };
  try {
    addExistingUser(businessId, user.id, email);
    revalidatePath(`/b/${businessId}/settings/users`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add user" };
  }
}

export async function createAndAddBusinessUserAction(
  businessId: string,
  input: { name: string; email: string; password?: string; role?: "administrator" | "standard"; modules?: ModuleKey[] }
) {
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return { error: "Administrator access is required." };
  try {
    await createAndAddBusinessUser(businessId, user.id, input);
    revalidatePath(`/b/${businessId}/settings/users`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create user" };
  }
}
