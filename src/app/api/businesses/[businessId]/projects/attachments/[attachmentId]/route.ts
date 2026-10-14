import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getBusinessDb } from "@/core/db/business";
import { getProjectAttachment } from "@/modules/projects/project-attachment-service";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; attachmentId: string }> }) {
  const { businessId, attachmentId } = await params;

  if (
    !businessId ||
    !UUID_REGEX.test(businessId) ||
    businessId.includes("..") ||
    businessId.includes("/") ||
    businessId.includes("\\")
  ) {
    return NextResponse.json({ error: "Invalid business ID" }, { status: 400 });
  }

  if (
    !attachmentId ||
    !UUID_REGEX.test(attachmentId) ||
    attachmentId.includes("..") ||
    attachmentId.includes("/") ||
    attachmentId.includes("\\")
  ) {
    return NextResponse.json({ error: "Invalid attachment ID" }, { status: 400 });
  }

  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "projects" });
  if (authError || !session || !access) return authError;

  const attachment = getProjectAttachment(businessId, session.user.id, attachmentId);
  if (!attachment || !existsSync(attachment.fullPath)) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const context = getBusinessDb(businessId, session.user.id);
  const resolvedAttachmentsRoot = path.resolve(context.paths.attachments);
  const resolvedFilePath = path.resolve(attachment.fullPath);
  if (!resolvedFilePath.startsWith(`${resolvedAttachmentsRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid attachment path" }, { status: 403 });
  }

  const baseName = path.basename(attachment.original_name);
  const safeName = baseName.replace(/[\r\n"\\]/g, "_") || "attachment";

  return new NextResponse(new Uint8Array(readFileSync(resolvedFilePath)), {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Length": String(attachment.size_bytes),
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(baseName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
