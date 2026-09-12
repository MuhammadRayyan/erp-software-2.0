import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getDocumentPdfModule } from "@/core/permissions/document-pdf-access";
import { generateDocumentPdf } from "@/modules/document-templates/pdf-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string; documentType: string; documentId: string }> }
) {
  const { businessId, documentType, documentId } = await params;
  
  const requiredModule = getDocumentPdfModule(documentType);
  if (!requiredModule) {
    return NextResponse.json({ error: "Unsupported document type" }, { status: 404 });
  }

  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: requiredModule });
  if (authError || !session || !access) {
    return NextResponse.json({ error: authError || "Unauthorized" }, { status: 401 });
  }

  try {
    const { pdf, filename } = await generateDocumentPdf(
      businessId,
      session.user.id,
      access.business.name,
      access.business.currency,
      documentType,
      documentId
    );
    
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF generation failed" },
      { status: error instanceof Error && error.message.includes("not found") ? 404 : 500 }
    );
  }
}
