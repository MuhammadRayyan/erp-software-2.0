"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { requireUser } from "@/core/auth/session";
import { getSystemDb } from "@/core/db/system";
import { users } from "@/core/db/system-schema";
import { auth } from "@/core/auth/auth";

import { validateDisplayName, validatePasswordChange } from "./validation";

export async function updateDisplayNameAction(name: string) {
  const validation = validateDisplayName(name);
  if (!validation.valid || !validation.name) {
    return { error: validation.error };
  }

  const user = await requireUser();

  try {
    getSystemDb()
      .update(users)
      .set({
        name: validation.name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .run();

    revalidatePath("/", "layout");
    return { success: true, name: validation.name };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update display name.";
    return { error: message };
  }
}

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  revokeOtherSessions: boolean = false,
) {
  const validation = validatePasswordChange(currentPassword, newPassword);
  if (!validation.valid) {
    return { error: validation.error };
  }

  await requireUser();

  try {
    const reqHeaders = await headers();
    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions,
      },
      headers: reqHeaders,
    });

    return { success: true };
  } catch (err: unknown) {
    let message = "Failed to change password. Please verify your current password.";
    const apiErr = err as { message?: string; body?: { message?: string; code?: string } };
    const errText = [apiErr?.message, apiErr?.body?.message, apiErr?.body?.code]
      .filter((s): s is string => typeof s === "string")
      .join(" ")
      .toLowerCase();

    if (errText.includes("invalid_password") || errText.includes("invalid password")) {
      message = "The current password you entered is incorrect.";
    } else if (errText.includes("password_too_short") || errText.includes("too short")) {
      message = "New password must be at least 8 characters long.";
    } else if (errText.includes("password_too_long") || errText.includes("too long")) {
      message = "New password cannot exceed 128 characters.";
    } else if (errText.includes("unauthorized") || errText.includes("session")) {
      message = "Your session has expired. Please sign in again.";
    } else if (err instanceof Error && err.message) {
      message = err.message;
    }
    return { error: message };
  }
}
