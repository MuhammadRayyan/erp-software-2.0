import { getCashFlowForecast, type CashFlowForecastData } from "@/modules/reports/cash-flow-forecast-service";
import { CashFlowRunwayView } from "./cash-flow-runway-view";

export function CashFlowRunwayWidget({
  businessId,
  userId,
  currency,
}: {
  businessId: string;
  userId: string;
  currency: string;
}) {
  let forecast: CashFlowForecastData | null = null;
  try {
    forecast = getCashFlowForecast(businessId, userId, { horizonDays: 30 });
  } catch {
    forecast = null;
  }

  return <CashFlowRunwayView businessId={businessId} currency={currency} forecast={forecast} />;
}
