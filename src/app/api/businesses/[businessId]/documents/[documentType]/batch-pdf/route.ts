import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getDocumentPdfModule } from "@/core/permissions/document-pdf-access";
import { createStreamingZipStream, deduplicateArchiveFilename } from "@/lib/streaming-zip";
import { getBusinessTodayIso } from "@/core/format";
import { generateDocumentPdfsInWorker } from "@/core/workers/jobs";

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
    const today = getBusinessTodayIso();
    const zipFilename = `${documentType}-batch-${today}.zip`;

    // Document data extraction and React-PDF layout run on a worker thread;
    // aborting the request (or cancelling the stream) terminates it.
    const cancel = new AbortController();
    const stream = createStreamingZipStream({
      signal: request.signal,
      onCleanup: () => cancel.abort(),
      populate: async (zip, helpers) => {
        const seenNames = new Set<string>();
        const documents = generateDocumentPdfsInWorker(
          {
            businessId,
            userId: session.user.id,
            businessName: access.business.name,
            baseCurrency: access.business.currency,
            documentType,
            documentIds: safeIds,
          },
          { signal: cancel.signal },
        );
        for await (const item of documents) {
          if (helpers.isCancelled()) break;
          if (!item.ok) {
            console.warn(`Failed to generate PDF for ${item.documentId}:`, item.error);
            continue;
          }
          const archiveName = deduplicateArchiveFilename(item.filename, seenNames);
          zip.addBuffer(item.pdf, archiveName, { compress: true, compressionLevel: 6 });
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
