import { requireModule } from "@/core/permissions/require-module";
import { BackLink } from "@/components/back-link";
import {
  getCashFlowForecast,
  type CashFlowHorizon,
} from "@/modules/reports/cash-flow-forecast-service";
import { CashFlowForecastView } from "@/modules/reports/cash-flow-forecast-view";

export const metadata = {
  title: "Cash Flow & Liquidity Forecast",
};

export default async function CashFlowForecastPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ horizon?: string; asOfDate?: string }>;
}) {
  const { businessId } = await params;
  const { horizon, asOfDate } = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");

  const horizonDays: CashFlowHorizon =
    horizon === "60" ? 60 : horizon === "90" ? 90 : 30;

  const data = getCashFlowForecast(businessId, user.id, {
    horizonDays,
    asOfDate,
  });

  return (
    <div className="page-container space-y-6">
      <BackLink href={`/b/${businessId}/reports`}>Reports</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cash Flow & Liquidity Forecast</h1>
          <p className="page-description">
            Forward-looking 30, 60, and 90-day cash projection modeling liquid bank reserves, expected accounts receivable inflows, and committed accounts payable obligations.
          </p>
        </div>
      </div>

      <CashFlowForecastView
        businessId={businessId}
        data={data}
        currency={access.business.currency}
      />
    </div>
  );
}
