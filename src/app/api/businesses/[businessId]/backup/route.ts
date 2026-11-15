import { requireApiAuth } from "@/core/auth/api-auth";
import { createBusinessBackupStream } from "@/core/businesses/backup-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId, requireAdmin: true });
  if (authError || !access || !session) return authError;
  const { stream, filename } = await createBusinessBackupStream(businessId, session.user.id, request.signal);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
