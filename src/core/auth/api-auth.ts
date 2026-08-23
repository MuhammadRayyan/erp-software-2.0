import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";
import type { ModuleKey } from "@/core/permissions/permissions";

export async function requireApiAuth(
  request: Request,
  options?: { businessId?: string; module?: ModuleKey; requireAdmin?: boolean }
) {
  const session = await getCurrentSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (options?.businessId) {
    const access = getBusinessAccess(options.businessId, session.user.id);
    if (!access) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    if (options.requireAdmin && access.membership.role !== "administrator") {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    if (options.module && !access.modules.includes(options.module)) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return { session, access };
  }

  return { session, access: null };
}
