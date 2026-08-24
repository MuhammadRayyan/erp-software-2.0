import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getSystemSqlite } from "@/core/db/system";
import { resolveBetterAuthSecret } from "./auth-config";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "./rate-limiter";

/**
 * Resolve the client IP for the strict failed-login limiter.
 * The rightmost `x-forwarded-for` entry is appended by the nearest proxy,
 * so it is the least spoofable value when a single trusted proxy fronts the app.
 */
function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return "unknown";
}

export const auth = betterAuth({
  appName: "Ledgerly ERP",
  database: getSystemSqlite(),
  secret: resolveBetterAuthSecret(),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  advanced: {
    ipAddress: {
      // Resolve client IPs for rate limiting/session tracking through the
      // reverse proxy in front of the app.
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
  // Generic better-auth rate limiting for ALL auth endpoints.
  // The window/max here are the fallback rule; the sign-in path gets a
  // stricter window below plus the failed-attempt limiter in hooks.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 10 },
    },
  },
  hooks: {
    // Strict server-side failed-attempt limiter for password sign-in.
    // This is the authoritative enforcement: direct POSTs to
    // /api/auth/sign-in/email cannot bypass it.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email" || !ctx.request) return;
      const ip = clientIpFromRequest(ctx.request);
      const status = checkRateLimit(ip);
      if (!status.allowed) {
        const minutes = Math.max(1, Math.ceil((status.resetAt - Date.now()) / 60_000));
        throw new APIError("TOO_MANY_REQUESTS", {
          message: `Too many failed sign-in attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email" || !ctx.request) return;
      const returned = (ctx.context as { returned?: unknown } | undefined)?.returned;
      const ip = clientIpFromRequest(ctx.request);
      if (returned instanceof APIError) {
        recordFailedAttempt(ip);
      } else {
        clearAttempts(ip);
      }
    }),
  },
  plugins: [nextCookies()],
});
