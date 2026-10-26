import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { getBusinessAccess, hasActionPermission, type ActionKey } from "@/core/permissions/permissions";
import type { ModuleKey } from "@/core/permissions/permissions";
import { assertActiveUser } from "./active-user";

export async function requireApiAuth(
  // Kept for future per-request context (e.g. rate limiting / client IP checks); intentionally unused.
  _request: Request,
  options?: { businessId?: string; module?: ModuleKey; action?: ActionKey; requireAdmin?: boolean }
) {
  const session = await getCurrentSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  try { assertActiveUser(session.user.id); }
  catch { return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }; }

  if (options?.businessId) {
    const access = getBusinessAccess(options.businessId, session.user.id);
    if (!access) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    if (options.requireAdmin && access.membership.role !== "administrator") {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    if (options.module && !hasActionPermission(options.businessId, session.user.id, options.module, options.action ?? "view")) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return { session, access };
  }

  return { session, access: null };
}
