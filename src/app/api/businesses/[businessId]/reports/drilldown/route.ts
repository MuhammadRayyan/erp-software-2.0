import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { getReportDrilldown } from "@/modules/reports/drilldown-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, {
    businessId,
    module: "reports",
    action: "view",
  });
  if (authError || !session || !access) return authError;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as
    | "account"
    | "cash_pnl"
    | "retained_earnings"
    | "vat_bucket"
    | null;

  if (!kind || !["account", "cash_pnl", "retained_earnings", "vat_bucket"].includes(kind)) {
    return NextResponse.json({ error: "Invalid drill-down kind." }, { status: 400 });
  }

  try {
    const data = getReportDrilldown(businessId, session.user.id, {
      kind,
      accountId: url.searchParams.get("accountId") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      periodId: url.searchParams.get("periodId") ?? undefined,
      bucket: url.searchParams.get("bucket") ?? undefined,
      emirate: url.searchParams.get("emirate") ?? undefined,
    });
    return NextResponse.json({ data, currency: access.business.currency });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load drill-down details." },
      { status: 400 },
    );
  }
}
