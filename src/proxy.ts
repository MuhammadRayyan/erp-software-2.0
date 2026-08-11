import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/core/auth/auth";
import { canAccessModule } from "@/core/permissions/permissions";
import { moduleForBusinessPath } from "@/core/permissions/module-access";

export async function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/login", request.url));

  const requirement = moduleForBusinessPath(request.nextUrl.pathname);
  if (requirement) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    if (!canAccessModule(requirement.businessId, session.user.id, requirement.module)) {
      const forbiddenUrl = new URL(`/b/${requirement.businessId}/forbidden`, request.url);
      forbiddenUrl.searchParams.set("module", requirement.module);
      return NextResponse.rewrite(forbiddenUrl, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/businesses/:path*", "/b/:path*"] };
