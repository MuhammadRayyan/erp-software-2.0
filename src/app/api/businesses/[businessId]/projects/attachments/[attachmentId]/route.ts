import { existsSync, readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { getProjectAttachment } from "@/modules/projects/project-attachment-service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string; attachmentId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId, attachmentId } = await params;
  const access = getBusinessAccess(businessId, session.user.id);
  if (!access?.modules.includes("projects")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const attachment = getProjectAttachment(businessId, session.user.id, attachmentId);
  if (!attachment || !existsSync(attachment.fullPath)) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  const safeName = attachment.original_name.replace(/[\r\n"\\]/g, "_");
  return new NextResponse(new Uint8Array(readFileSync(attachment.fullPath)), {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Length": String(attachment.size_bytes),
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
