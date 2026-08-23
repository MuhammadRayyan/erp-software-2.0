import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getEInvoiceXml } from "@/modules/einvoicing/einvoice-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; documentId: string }> }) {
  const { businessId, documentId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "sales" });
  if (authError || !session || !access) return authError;
  const payload = getEInvoiceXml(businessId, session.user.id, documentId);
  if (!payload) return NextResponse.json({ error: "Validated XML not found" }, { status: 404 });
  return new NextResponse(payload.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="einvoice-${payload.uuid}.xml"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-EInvoice-SHA256": payload.hash,
    },
  });
}
