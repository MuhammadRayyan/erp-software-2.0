import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getDocumentPdfModule } from "@/core/permissions/document-pdf-access";
import { generateDocumentPdf } from "@/modules/document-templates/pdf-service";
import { createStreamingZipStream, deduplicateArchiveFilename } from "@/lib/streaming-zip";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string; documentType: string }> }
) {
  const { businessId, documentType } = await params;

  const requiredModule = getDocumentPdfModule(documentType);
  if (!requiredModule) {
    return NextResponse.json({ error: "Unsupported document type" }, { status: 404 });
  }

  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: requiredModule, action: "export" });
  if (authError || !session || !access) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const documentIds: string[] = Array.isArray(body.documentIds)
      ? body.documentIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (!documentIds.length) {
      return NextResponse.json({ error: "No document IDs provided" }, { status: 400 });
    }
    const safeIds = documentIds.slice(0, 100);
    const today = new Date().toISOString().slice(0, 10);
    const zipFilename = `${documentType}-batch-${today}.zip`;

    const stream = createStreamingZipStream({
      signal: request.signal,
      populate: async (zip, helpers) => {
        const seenNames = new Set<string>();
        for (const docId of safeIds) {
          if (helpers.isCancelled()) break;
          try {
            const { pdf, filename } = await generateDocumentPdf(
              businessId,
              session.user.id,
              access.business.name,
              access.business.currency,
              documentType,
              docId
            );
            if (helpers.isCancelled()) break;
            const archiveName = deduplicateArchiveFilename(filename, seenNames);
            zip.addBuffer(pdf, archiveName, { compress: true, compressionLevel: 6 });
          } catch (err) {
            console.warn(`Failed to generate PDF for ${docId}:`, err);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch PDF generation failed" },
      { status: 500 }
    );
  }
}
