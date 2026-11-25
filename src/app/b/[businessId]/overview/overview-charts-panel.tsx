"use client";

import { PermissionDenied } from "@/components/permission-denied";
import { Button } from "@/components/ui/button";
import type { MonthlyFinancialTrend, ReceivablesAgingSummary } from "@/modules/reports/report-service";
import type { CashFlowForecastData } from "@/modules/reports/cash-flow-forecast-service";
import { FinancialCharts } from "./financial-charts";
import { CashFlowRunwayView } from "./cash-flow-runway-view";

export interface OverviewChartsPayload {
  canViewReports: boolean;
  currency: string;
  trend: MonthlyFinancialTrend[];
  aging: ReceivablesAgingSummary | null;
  forecast: CashFlowForecastData | null;
}

/** Client panel rendering Overview Chart Views cleanly from SSR data or prefetched JSON. */
export function OverviewChartsPanel({
  businessId,
  data,
  loading,
  error,
  onRetry,
}: {
  businessId: string;
  data: OverviewChartsPayload | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  if (!data && loading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="data-panel h-80 animate-pulse bg-surface-raised/60" />
          <div className="data-panel h-80 animate-pulse bg-surface-raised/60" />
        </div>
        <div className="data-panel h-48 animate-pulse bg-surface-raised/60" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="data-panel flex flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm font-medium text-foreground">
          {error || "Unable to load chart views."}
        </p>
        {onRetry && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (!data.canViewReports || !data.aging) {
    return (
      <PermissionDenied
        module="financial reports"
        returnHref={`/b/${businessId}/overview`}
        returnLabel="Return to overview"
      />
    );
  }

  return (
    <div className="space-y-6">
      <FinancialCharts
        businessId={businessId}
        currency={data.currency}
        trend={data.trend}
        aging={data.aging}
      />
      <CashFlowRunwayView
        businessId={businessId}
        currency={data.currency}
        forecast={data.forecast}
      />
    </div>
  );
}
