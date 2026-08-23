"use server";

import { headers } from "next/headers";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "./rate-limiter";

async function getClientIp(): Promise<string> {
  const reqHeaders = await headers();
  const forwarded = reqHeaders.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = reqHeaders.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export async function preLoginCheck() {
  const ip = await getClientIp();
  const status = checkRateLimit(ip);
  if (!status.allowed) {
    return {
      allowed: false,
      error: "Too many login attempts. Try again later.",
      retryAfter: Math.ceil((status.resetAt - Date.now()) / 1000)
    };
  }
  return { allowed: true };
}

export async function reportFailedLogin() {
  const ip = await getClientIp();
  recordFailedAttempt(ip);
}

export async function clearLoginAttempts() {
  const ip = await getClientIp();
  clearAttempts(ip);
}
