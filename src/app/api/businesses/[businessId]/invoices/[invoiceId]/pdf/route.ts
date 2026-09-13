/**
 * Legacy invoice PDF route — kept for backwards compatibility with any external
 * bookmark/link that directly addresses /api/businesses/.../invoices/.../pdf.
 * All logic is delegated to the generic pdf-service so there is exactly ONE
 * code path for invoice PDF generation.
 */
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { generateDocumentPdf } from "@/modules/document-templates/pdf-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string; invoiceId: string }> }
) {
  const { businessId, invoiceId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "sales" });
  if (authError || !session || !access) return authError;

  try {
    const { pdf, filename } = await generateDocumentPdf(
      businessId,
      session.user.id,
      access.business.name,
      access.business.currency,
      "sales-invoice",
      invoiceId
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
