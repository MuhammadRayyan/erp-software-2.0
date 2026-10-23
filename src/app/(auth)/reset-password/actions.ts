"use server";

import { completePasswordReset, createPasswordResetToken } from "@/core/permissions/invitation-service";
import { sendPasswordResetEmail } from "@/modules/email/system-email-service";

export async function completePasswordResetAction(input: {
  token: string;
  password: string;
  confirmPassword: string;
}) {
  const token = input.token?.trim();
  if (!token) {
    return { error: "Password reset token is missing." };
  }

  const password = input.password;
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters long." };
  }

  if (password !== input.confirmPassword) {
    return { error: "Passwords do not match." };
  }

  try {
    const res = await completePasswordReset(token, password);
    return { success: true, email: res.email };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to reset password.",
    };
  }
}

export async function requestPasswordResetAction(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { error: "Please enter a valid email address." };
  }

  try {
    const { token, user } = createPasswordResetToken(cleanEmail);
    await sendPasswordResetEmail({
      to: user.email,
      userName: user.name,
      resetToken: token,
    });
  } catch (err) {
    // Log diagnostics on server console without disclosing whether the user exists or is suspended
    console.warn("[requestPasswordResetAction] Notice:", err instanceof Error ? err.message : err);
  }

  // Always return identical success response to protect against user enumeration
  // and NEVER return reset URL/token to unauthenticated public callers.
  return {
    success: true,
    emailSent: true,
  };
}
