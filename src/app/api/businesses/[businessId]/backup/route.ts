import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { exportBusinessBackup } from "@/core/businesses/backup-service";
import { getBusinessForUser } from "@/core/businesses/business-service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId } = await params;
  const access = getBusinessForUser(businessId, session.user.id);
  if (!access || access.membership.role !== "administrator") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const backup = await exportBusinessBackup(businessId, session.user.id);
  const filename = `${access.business.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business"}.erpbackup`;
  return new NextResponse(new Uint8Array(backup), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
