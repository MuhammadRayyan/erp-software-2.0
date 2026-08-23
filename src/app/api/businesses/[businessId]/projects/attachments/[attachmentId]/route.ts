import { existsSync, readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getProjectAttachment } from "@/modules/projects/project-attachment-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; attachmentId: string }> }) {
  const { businessId, attachmentId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "projects" });
  if (authError || !session || !access) return authError;
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
