import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getDocumentPdfModule } from "@/core/permissions/document-pdf-access";
import { generateDocumentPdf } from "@/modules/document-templates/pdf-service";

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

  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: requiredModule });
  if (authError || !session || !access) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const documentIds: string[] = Array.isArray(body.documentIds) ? body.documentIds : [];
    if (!documentIds.length) {
      return NextResponse.json({ error: "No document IDs provided" }, { status: 400 });
    }
    const safeIds = documentIds.slice(0, 100);

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    for (const docId of safeIds) {
      try {
        const { pdf, filename } = await generateDocumentPdf(
          businessId,
          session.user.id,
          access.business.name,
          access.business.currency,
          documentType,
          docId
        );
        zip.file(filename, pdf);
      } catch (err) {
        console.warn(`Failed to generate PDF for ${docId}:`, err);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const today = new Date().toISOString().slice(0, 10);
    const zipFilename = `${documentType}-batch-${today}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
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
