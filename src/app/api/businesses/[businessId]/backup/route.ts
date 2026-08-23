import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { exportBusinessBackup } from "@/core/businesses/backup-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId, requireAdmin: true });
  if (authError || !access || !session) return authError;
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
