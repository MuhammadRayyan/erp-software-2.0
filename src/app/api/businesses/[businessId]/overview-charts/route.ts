import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { hasActionPermission } from "@/core/permissions/permissions";
import {
  getMonthlyFinancialTrend,
  getReceivablesAgingSummary,
} from "@/modules/reports/report-service";
import { getCashFlowForecast, type CashFlowForecastData } from "@/modules/reports/cash-flow-forecast-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId });
  if (authError || !session || !access) return authError;

  const canViewReports = hasActionPermission(businessId, session.user.id, "reports", "view");
  const currency = access.business.currency;

  if (!canViewReports) {
    return NextResponse.json(
      {
        canViewReports: false,
        currency,
        trend: [],
        aging: null,
        forecast: null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const trend = getMonthlyFinancialTrend(businessId, session.user.id, 6);
  const aging = getReceivablesAgingSummary(businessId, session.user.id);
  let forecast: CashFlowForecastData | null = null;
  try {
    forecast = getCashFlowForecast(businessId, session.user.id, { horizonDays: 30 });
  } catch {
    forecast = null;
  }

  return NextResponse.json(
    {
      canViewReports: true,
      currency,
      trend,
      aging,
      forecast,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
