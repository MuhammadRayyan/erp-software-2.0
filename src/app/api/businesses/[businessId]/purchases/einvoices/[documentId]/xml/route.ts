import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { getBusinessAccess } from "@/core/permissions/permissions";
import { getInboundEInvoiceXml } from "@/modules/inbound-einvoicing/inbound-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string; documentId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId, documentId } = await params;
  const access = getBusinessAccess(businessId, session.user.id);
  if (!access?.modules.includes("purchases")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const payload = getInboundEInvoiceXml(businessId, session.user.id, documentId);
  if (!payload) return NextResponse.json({ error: "Inbound XML not found" }, { status: 404 });
  return new NextResponse(payload.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="supplier-einvoice-${payload.uuid}.xml"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-EInvoice-SHA256": payload.hash,
    },
  });
}
