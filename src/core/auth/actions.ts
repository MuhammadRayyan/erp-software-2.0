"use server";

import { headers } from "next/headers";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "./rate-limiter";

async function getClientIp(): Promise<string> {
  const reqHeaders = await headers();
  const forwarded = reqHeaders.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const realIp = reqHeaders.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return "unknown";
}

export async function preLoginCheck() {
  const ip = await getClientIp();
  const status = checkRateLimit(ip);
  if (!status.allowed) {
    return {
      allowed: false,
      error: "Too many login attempts. Try again later.",
      retryAfter: Math.ceil((status.resetAt - Date.now()) / 1000),
    };
  }
  return { allowed: true };
}

/**
 * Note: Failed attempts and clears are handled authoritatively by server-side Better-Auth hooks in auth.ts.
 * These actions are kept as safe no-ops to prevent unauthenticated client-side manipulation of rate limits.
 */
export async function reportFailedLogin() {
  // Handled authoritatively by auth hooks
}

export async function clearLoginAttempts() {
  // Handled authoritatively by auth hooks
}
