"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BarChart3, Clock, DollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { formatMoney } from "@/core/format";
import type { MonthlyFinancialTrend, ReceivablesAgingSummary } from "@/modules/reports/report-service";

type FinancialChartsProps = {
  businessId: string;
  currency: string;
  trend: MonthlyFinancialTrend[];
  aging: ReceivablesAgingSummary;
};

export function FinancialCharts({ businessId, currency, trend, aging }: FinancialChartsProps) {
  const [hoveredMonth, setHoveredMonth] = useState<MonthlyFinancialTrend | null>(null);

  // Compute scale max for trend chart
  const maxAmount = Math.max(
    1,
    ...trend.map((m) => Math.max(m.revenueMinor, m.expensesMinor)),
  );

  const totalRevenue = trend.reduce((sum, m) => sum + m.revenueMinor, 0);
  const totalExpenses = trend.reduce((sum, m) => sum + m.expensesMinor, 0);
  const netIncome = totalRevenue - totalExpenses;

  // Receivables shares (percentages strictly 0 if amount is 0 to prevent ghost segments)
  const agingTotal = Math.max(1, aging.totalMinor);
  const currentPct = aging.currentMinor > 0 ? (aging.currentMinor / agingTotal) * 100 : 0;
  const days30Pct = aging.days30Minor > 0 ? (aging.days30Minor / agingTotal) * 100 : 0;
  const days60Pct = aging.days60Minor > 0 ? (aging.days60Minor / agingTotal) * 100 : 0;
  const days60PlusPct = aging.days60PlusMinor > 0 ? (aging.days60PlusMinor / agingTotal) * 100 : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* 1. Monthly Revenue vs Expenses Trend Chart */}
      <section className="flex flex-col rounded-lg border border-border bg-surface p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Revenue vs Expenses Trend</h2>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="size-2.5 rounded-xs bg-emerald-500" /> Revenue
            </span>
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <span className="size-2.5 rounded-xs bg-rose-500" /> Expenses
            </span>
          </div>
        </div>

        {/* High level period summary banner */}
        <div className="mt-3 flex items-center justify-between rounded-md bg-surface-muted/50 p-2.5 text-xs">
          <div>
            <span className="text-muted-foreground">6-Mo Net: </span>
            <span
              className={`font-semibold tabular-nums ${
                netIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatMoney(netIncome, currency)}
            </span>
          </div>
          <div className="text-muted-foreground flex items-center gap-1">
            {netIncome >= 0 ? (
              <TrendingUp className="size-3.5 text-emerald-500" />
            ) : (
              <TrendingDown className="size-3.5 text-rose-500" />
            )}
            <span>{trend.length} Months Trailing</span>
          </div>
        </div>

        {/* Visual Bar Chart */}
        <div className="mt-6 flex-1 flex flex-col justify-end">
          <div className="h-44 flex items-end justify-between gap-2 sm:gap-4 px-2">
            {trend.map((m) => {
              const revHeight = m.revenueMinor > 0 ? Math.max(4, Math.round((m.revenueMinor / maxAmount) * 100)) : 0;
              const expHeight = m.expensesMinor > 0 ? Math.max(4, Math.round((m.expensesMinor / maxAmount) * 100)) : 0;
              const isHovered = hoveredMonth?.month === m.month;

              return (
                <div
                  key={m.month}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer focus-visible:outline-none"
                  tabIndex={0}
                  role="button"
                  aria-label={`${m.label}: Revenue ${formatMoney(m.revenueMinor, currency)}, Expenses ${formatMoney(m.expensesMinor, currency)}, Net ${formatMoney(m.netIncomeMinor, currency)}`}
                  onMouseEnter={() => setHoveredMonth(m)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  onFocus={() => setHoveredMonth(m)}
                  onBlur={() => setHoveredMonth(null)}
                  onClick={() => setHoveredMonth((prev) => (prev?.month === m.month ? null : m))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setHoveredMonth((prev) => (prev?.month === m.month ? null : m));
                    }
                  }}
                >
                  <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full">
                    {/* Revenue Bar */}
                    <div
                      style={{ height: `${revHeight}%` }}
                      className={`w-full max-w-[18px] rounded-t-xs bg-emerald-500/85 transition-all group-hover:bg-emerald-500 ${
                        isHovered ? "ring-2 ring-emerald-500/40" : ""
                      }`}
                      title={`Revenue: ${formatMoney(m.revenueMinor, currency)}`}
                    />
                    {/* Expenses Bar */}
                    <div
                      style={{ height: `${expHeight}%` }}
                      className={`w-full max-w-[18px] rounded-t-xs bg-rose-500/85 transition-all group-hover:bg-rose-500 ${
                        isHovered ? "ring-2 ring-rose-500/40" : ""
                      }`}
                      title={`Expenses: ${formatMoney(m.expensesMinor, currency)}`}
                    />
                  </div>
                  {/* Month Label */}
                  <span className="mt-2 text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate">
                    {m.label.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Interactive Inspection Tooltip / Summary */}
          <div className="mt-3 min-h-[36px] rounded-md border border-border/60 bg-surface-muted/30 px-3 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 text-xs">
            {hoveredMonth ? (
              <>
                <span className="font-semibold text-foreground shrink-0">{hoveredMonth.label}</span>
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5 tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Rev: {formatMoney(hoveredMonth.revenueMinor, currency)}
                  </span>
                  <span className="text-rose-600 dark:text-rose-400 font-medium">
                    Exp: {formatMoney(hoveredMonth.expensesMinor, currency)}
                  </span>
                  <span className="font-semibold text-foreground">
                    Net: {formatMoney(hoveredMonth.netIncomeMinor, currency)}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-muted-foreground text-[11px]">
                {totalRevenue === 0 && totalExpenses === 0
                  ? "No revenue or expenses recorded in this 6-month period."
                  : "Hover, tap, or focus bars to inspect monthly breakdown details."}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. Receivables Aging Breakdown Chart */}
      <section className="flex flex-col rounded-lg border border-border bg-surface p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Receivables Aging Breakdown</h2>
          </div>
          <Link
            href={`/b/${businessId}/sales/invoices?status=unpaid`}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Invoices <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        {aging.totalMinor === 0 ? (
          <div className="my-auto py-10 text-center">
            <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="size-5" />
            </div>
            <p className="font-medium text-sm text-foreground">All Invoices Settled</p>
            <p className="mt-1 text-xs text-muted-foreground">
              There are no unpaid or overdue customer invoices at this time.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex-1 flex flex-col justify-between space-y-4">
            {/* Stacked Percentage Visual Bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Outstanding Aging Distribution</span>
                <span className="font-semibold tabular-nums text-foreground">
                  Total: {formatMoney(aging.totalMinor, currency)} ({aging.totalCount} {aging.totalCount === 1 ? "invoice" : "invoices"})
                </span>
              </div>
              <div className="h-4 w-full rounded-full bg-surface-muted overflow-hidden flex shadow-inner">
                {currentPct > 0 && (
                  <div
                    style={{ width: `${currentPct}%` }}
                    className="bg-emerald-500 transition-all"
                    title={`Current: ${formatMoney(aging.currentMinor, currency)} (${Math.round(currentPct)}%)`}
                  />
                )}
                {days30Pct > 0 && (
                  <div
                    style={{ width: `${days30Pct}%` }}
                    className="bg-amber-400 transition-all"
                    title={`1-30 Days: ${formatMoney(aging.days30Minor, currency)} (${Math.round(days30Pct)}%)`}
                  />
                )}
                {days60Pct > 0 && (
                  <div
                    style={{ width: `${days60Pct}%` }}
                    className="bg-orange-500 transition-all"
                    title={`31-60 Days: ${formatMoney(aging.days60Minor, currency)} (${Math.round(days60Pct)}%)`}
                  />
                )}
                {days60PlusPct > 0 && (
                  <div
                    style={{ width: `${days60PlusPct}%` }}
                    className="bg-rose-500 transition-all"
                    title={`60+ Days Overdue: ${formatMoney(aging.days60PlusMinor, currency)} (${Math.round(days60PlusPct)}%)`}
                  />
                )}
              </div>
            </div>

            {/* Aging Bucket Metric Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-md border border-border/70 bg-surface-muted/30 p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-medium text-muted-foreground">Current</span>
                </div>
                <div className="mt-1 text-xs font-semibold tabular-nums text-foreground">
                  {formatMoney(aging.currentMinor, currency)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {aging.currentCount} not due
                </div>
              </div>

              <div className="rounded-md border border-border/70 bg-surface-muted/30 p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-400" />
                  <span className="text-[11px] font-medium text-muted-foreground">1 – 30 Days</span>
                </div>
                <div className="mt-1 text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {formatMoney(aging.days30Minor, currency)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {aging.days30Count} overdue
                </div>
              </div>

              <div className="rounded-md border border-border/70 bg-surface-muted/30 p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-orange-500" />
                  <span className="text-[11px] font-medium text-muted-foreground">31 – 60 Days</span>
                </div>
                <div className="mt-1 text-xs font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                  {formatMoney(aging.days60Minor, currency)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {aging.days60Count} overdue
                </div>
              </div>

              <div className="rounded-md border border-rose-300/60 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20 p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-rose-500" />
                  <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400">60+ Days</span>
                </div>
                <div className="mt-1 text-xs font-bold tabular-nums text-rose-700 dark:text-rose-400">
                  {formatMoney(aging.days60PlusMinor, currency)}
                </div>
                <div className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                  {aging.days60PlusCount} overdue
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
