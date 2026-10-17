import Link from "next/link";
import { AlertTriangle, ArrowRight, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { formatMoney } from "@/core/format";
import { getCashFlowForecast, type CashFlowForecastData } from "@/modules/reports/cash-flow-forecast-service";

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

  if (!forecast) return null;

  const { summary, inflows, outflows } = forecast;
  const netIsPositive = summary.netCashFlowMinor >= 0;
  const hasDeficitRisk = summary.deficitDaysCount > 0 || summary.minimumProjectedCashMinor < 0;

  return (
    <section
        aria-label="30-Day Liquidity Forecast"
        className="rounded-xl border border-border bg-surface p-5 shadow-sm mt-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="size-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">30-Day Cash Runway Forecast</h2>
              <p className="text-xs text-muted-foreground">
                Projected cash movement based on open receivables and payables due within 30 days.
              </p>
            </div>
          </div>
          <Link
            href={`/b/${businessId}/reports/cash-flow-forecast`}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Full 90-day forecast <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {hasDeficitRisk && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              <strong>Deficit Warning:</strong> Projected cash dips to{" "}
              {formatMoney(summary.minimumProjectedCashMinor, currency)} within the next 30 days.
            </span>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-surface-raised p-3.5">
            <span className="text-xs text-muted-foreground">Current Liquid Cash</span>
            <p className="money mt-1 text-lg font-semibold">
              {formatMoney(summary.startingCashMinor, currency)}
            </p>
            <span className="text-[11px] text-muted-foreground">Cash & bank accounts</span>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface-raised p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Expected Inflows (30d)</span>
              <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="money mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              +{formatMoney(summary.totalInflowsMinor, currency)}
            </p>
            <span className="text-[11px] text-muted-foreground">
              {inflows.length} customer invoices due
            </span>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface-raised p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Expected Outflows (30d)</span>
              <TrendingDown className="size-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="money mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">
              -{formatMoney(summary.totalOutflowsMinor, currency)}
            </p>
            <span className="text-[11px] text-muted-foreground">
              {outflows.length} supplier bills due
            </span>
          </div>

          <div className="rounded-lg border border-border/70 bg-surface-raised p-3.5">
            <span className="text-xs text-muted-foreground">Projected Position (Day 30)</span>
            <p
              className={`money mt-1 text-lg font-semibold ${
                summary.projectedClosingCashMinor < 0
                  ? "text-danger"
                  : "text-foreground"
              }`}
            >
              {formatMoney(summary.projectedClosingCashMinor, currency)}
            </p>
            <span
              className={`text-[11px] font-medium ${
                netIsPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {netIsPositive ? "Net positive +" : "Net change "}
              {formatMoney(summary.netCashFlowMinor, currency)}
            </span>
          </div>
        </div>
      </section>
    );
}
