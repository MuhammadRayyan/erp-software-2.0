"use server";

import { headers } from "next/headers";
import { createFixedWindowLimiter } from "@/core/auth/rate-limiter";
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

// Public, unauthenticated endpoint: bound how often one client can trigger
// reset emails, and how often any one mailbox can receive them. Each request
// also invalidates the previous token, so flooding would lock a user out.
const resetRequestsPerIp = createFixedWindowLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const resetRequestsPerEmail = createFixedWindowLimiter({ windowMs: 60 * 60 * 1000, max: 3 });

async function getClientIp() {
  try {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for");
    const parts = forwarded?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
    // The rightmost entry is appended by our own proxy (Caddy).
    if (parts.length > 0) return parts[parts.length - 1];
    return requestHeaders.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export async function requestPasswordResetAction(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { error: "Please enter a valid email address." };
  }

  const ip = await getClientIp();
  const ipAllowed = resetRequestsPerIp.take(ip);
  const emailAllowed = resetRequestsPerEmail.take(cleanEmail);
  if (!ipAllowed) {
    return { error: "Too many password reset requests. Please try again later." };
  }
  if (!emailAllowed) {
    // Same response as a normal request so callers cannot learn anything.
    return { success: true, emailSent: true };
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
