import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import {
  getUnreadNotificationCount,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/modules/notifications/notification-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId });
  if (authError || !session || !access) return authError;

  const items = listNotificationsForUser(businessId, session.user.id, { limit: 25 });
  const unreadCount = getUnreadNotificationCount(businessId, session.user.id);
  return NextResponse.json(
    { unreadCount, notifications: items },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId });
  if (authError || !session || !access) return authError;

  const body = (await request.json().catch(() => ({}))) as {
    action?: "mark_read" | "mark_all_read";
    notificationId?: string;
  };

  if (body.action === "mark_all_read") {
    markAllNotificationsRead(businessId, session.user.id);
  } else if (body.action === "mark_read" && body.notificationId) {
    markNotificationRead(businessId, session.user.id, body.notificationId);
  }

  return NextResponse.json({
    ok: true,
    unreadCount: getUnreadNotificationCount(businessId, session.user.id),
  });
}
