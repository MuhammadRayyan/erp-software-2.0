import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { generateFtaAuditFile } from "@/modules/tax/faf-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, {
    businessId,
    module: "reports",
    action: "export",
  });
  if (authError || !session || !access) return authError;

  const url = new URL(request.url);
  const periodId = url.searchParams.get("periodId") ?? undefined;
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
  const dateTo = url.searchParams.get("dateTo") ?? undefined;
  const preview = url.searchParams.get("preview") === "1";

  try {
    const faf = generateFtaAuditFile(businessId, session.user.id, { periodId, dateFrom, dateTo });
    if (preview) {
      return NextResponse.json({
        filename: faf.filename,
        periodStart: faf.periodStart,
        periodEnd: faf.periodEnd,
        baseCurrency: faf.baseCurrency,
        trnAudit: faf.trnAudit,
        totals: faf.totals,
      });
    }
    return new NextResponse(faf.csvContent, {
      headers: {
        "Content-Type": faf.mimeType,
        "Content-Disposition": `attachment; filename="${faf.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate FTA Audit File" },
      { status: 400 },
    );
  }
}
