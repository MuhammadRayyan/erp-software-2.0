import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getSystemSqlite } from "@/core/db/system";
import { resolveBetterAuthSecret } from "./auth-config";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "./rate-limiter";
import { getAppBaseUrl, getTrustedOrigins } from "@/core/config/app-url";

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
  appName: "UAE Manager",
  database: getSystemSqlite(),
  secret: resolveBetterAuthSecret(),
  baseURL: getAppBaseUrl(),
  trustedOrigins: (request) => getTrustedOrigins(request),
  user: {
    additionalFields: {
      isSuperAdmin: {
        type: "boolean",
        fieldName: "is_super_admin",
        defaultValue: false,
        input: false,
      },
      status: {
        type: "string",
        fieldName: "status",
        defaultValue: "active",
        input: false,
      },
      isTenantAdmin: {
        type: "boolean",
        fieldName: "is_tenant_admin",
        defaultValue: false,
        input: false,
      },
      maxBusinesses: {
        type: "number",
        fieldName: "max_businesses",
        defaultValue: 3,
        input: false,
      },
      maxUsers: {
        type: "number",
        fieldName: "max_users",
        defaultValue: 5,
        input: false,
      },
      createdByUserId: {
        type: "string",
        fieldName: "created_by_user_id",
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    disableSignUp: process.env.NODE_ENV === "production",
  },
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days for persistent session
    updateAge: 24 * 60 * 60, // Refresh session expiration daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
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
    enabled: process.env.NODE_ENV === "production",
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
      // Enforce zero-tolerance public signup block: bots cannot hit /api/auth/sign-up/email over HTTP
      if (ctx.path === "/sign-up/email" && ctx.request) {
        throw new APIError("FORBIDDEN", {
          message: "Public registration is disabled. System initialization requires the secure setup key.",
        });
      }

      if (ctx.path === "/sign-in/email") {
        // 1. Check suspended user by email
        const body = (ctx as any).body || (ctx.context as any)?.body;
        const email = body?.email ? String(body.email).trim().toLowerCase() : null;
        if (email) {
          try {
            const row = getSystemSqlite()
              .prepare("SELECT status FROM user WHERE LOWER(email) = ?")
              .get(email) as { status?: string } | undefined;
            if (row?.status === "suspended") {
              throw new APIError("FORBIDDEN", {
                message: "Your account has been suspended by the platform administrator. Please contact support.",
              });
            }
          } catch (e) {
            if (e instanceof APIError) throw e;
          }
        }

        // 2. Failed attempt rate limiting (when HTTP request is present)
        if (ctx.request) {
          const ip = clientIpFromRequest(ctx.request);
          const status = checkRateLimit(ip);
          if (!status.allowed) {
            const minutes = Math.max(1, Math.ceil((status.resetAt - Date.now()) / 60_000));
            throw new APIError("TOO_MANY_REQUESTS", {
              message: `Too many failed sign-in attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
            });
          }
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const returned = (ctx.context as { returned?: unknown } | undefined)?.returned;
      const body = (ctx as any).body || (ctx.context as any)?.body;

      if (ctx.request) {
        const ip = clientIpFromRequest(ctx.request);
        if (returned instanceof APIError) {
          const status = (returned as any).status || (returned as any).statusCode;
          const code = (returned as any).body?.code || (returned as any).code;
          if (status === 401 || code === "INVALID_EMAIL_OR_PASSWORD" || code === "USER_NOT_FOUND") {
            recordFailedAttempt(ip);
          }
        } else {
          clearAttempts(ip);
        }
      }

      // If user selected "Remember me", clear any obsolete dont_remember token
      if (!(returned instanceof APIError) && body?.rememberMe !== false) {
        try {
          const cookie = (ctx.context as any)?.authCookies?.dontRememberToken;
          if (cookie && typeof (ctx as any).setCookie === "function") {
            (ctx as any).setCookie(cookie.name, "", {
              ...cookie.attributes,
              maxAge: 0,
            });
          }
        } catch {
          // ignore cookie cleanup error
        }
      }
    }),
  },
  plugins: [nextCookies()],
});
