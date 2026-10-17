"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Landmark,
  LineChart,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { formatMoney, formatDate } from "@/core/format";
import { ExportCsvButton } from "@/components/export-csv-button";
import type {
  CashFlowForecastData,
  CashFlowHorizon,
} from "./cash-flow-forecast-service";

type Props = {
  businessId: string;
  data: CashFlowForecastData;
  currency: string;
};

export function CashFlowForecastView({ businessId, data, currency }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"timeline" | "inflows" | "outflows" | "accounts">("timeline");

  const { summary, accounts, dailyLedger, inflows, outflows } = data;

  const handleHorizonChange = (h: CashFlowHorizon) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("horizon", h.toString());
    router.push(`/b/${businessId}/reports/cash-flow-forecast?${params.toString()}`);
  };

  const csvRows = dailyLedger.map((d) => ({
    date: d.date,
    day: d.isToday ? "Today / Overdue" : `Day +${d.dayOffset}`,
    opening_balance: (d.openingBalanceMinor / 100).toFixed(2),
    inflows: (d.inflowsMinor / 100).toFixed(2),
    inflows_count: d.inflowCount,
    outflows: (d.outflowsMinor / 100).toFixed(2),
    outflows_count: d.outflowCount,
    net_change: (d.netChangeMinor / 100).toFixed(2),
    closing_balance: (d.closingBalanceMinor / 100).toFixed(2),
    status: d.isDeficit ? "DEFICIT" : "HEALTHY",
  }));

  const csvColumns = [
    { header: "Date", accessorKey: "date" },
    { header: "Timeline Offset", accessorKey: "day" },
    { header: "Opening Balance", accessorKey: "opening_balance" },
    { header: "Inflows", accessorKey: "inflows" },
    { header: "Inflow Count", accessorKey: "inflows_count" },
    { header: "Outflows", accessorKey: "outflows" },
    { header: "Outflow Count", accessorKey: "outflows_count" },
    { header: "Net Movement", accessorKey: "net_change" },
    { header: "Closing Balance", accessorKey: "closing_balance" },
    { header: "Status", accessorKey: "status" },
  ];

  // Visual trend calculation: find min and max closing balances to normalize chart
  const balances = dailyLedger.map((d) => d.closingBalanceMinor);
  const minBal = Math.min(...balances, 0);
  const maxBal = Math.max(...balances, 1000);
  const range = maxBal - minBal || 1;

  return (
    <div className="space-y-6">
      {/* Horizon Controls & Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Forecast Horizon:
          </span>
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs font-medium">
            {([30, 60, 90] as CashFlowHorizon[]).map((h) => (
              <button
                key={h}
                onClick={() => handleHorizonChange(h)}
                className={`rounded-md px-3 py-1.5 transition-all ${
                  summary.horizonDays === h
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {h} Days
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            As of: <span className="font-semibold text-foreground">{formatDate(summary.asOfDate)}</span>
          </span>
          <ExportCsvButton
            filename={`cash-flow-forecast-${summary.horizonDays}d-${summary.asOfDate}.csv`}
            columns={csvColumns}
            data={csvRows}
            variant="secondary"
          />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Starting Cash */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Current Liquid Cash</span>
            <Wallet className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {formatMoney(summary.startingCashMinor, currency)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Landmark className="size-3.5" />
            <span>Across {accounts.length} active account{accounts.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        {/* Card 2: Projected Inflows */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Projected Inflows</span>
            <ArrowDownRight className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            +{formatMoney(summary.totalInflowsMinor, currency)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {summary.overdueInflowsMinor > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {formatMoney(summary.overdueInflowsMinor, currency)} overdue
              </span>
            ) : (
              <span>All invoices current</span>
            )}
          </div>
        </div>

        {/* Card 3: Projected Outflows */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Committed Outflows</span>
            <ArrowUpRight className="size-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
            -{formatMoney(summary.totalOutflowsMinor, currency)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {summary.overdueOutflowsMinor > 0 ? (
              <span className="text-rose-600 dark:text-rose-400 font-medium">
                {formatMoney(summary.overdueOutflowsMinor, currency)} overdue bills
              </span>
            ) : (
              <span>All bills current</span>
            )}
          </div>
        </div>

        {/* Card 4: Projected Closing Cash */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Day +{summary.horizonDays} Closing</span>
            <LineChart className="size-4 text-primary" />
          </div>
          <div className={`mt-2 text-2xl font-bold tracking-tight ${
            summary.projectedClosingCashMinor < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
          }`}>
            {formatMoney(summary.projectedClosingCashMinor, currency)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Net shift:{" "}
            <span className={summary.netCashFlowMinor >= 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-rose-600 dark:text-rose-400 font-semibold"}>
              {summary.netCashFlowMinor >= 0 ? "+" : ""}{formatMoney(summary.netCashFlowMinor, currency)}
            </span>
          </div>
        </div>

        {/* Card 5: Runway Status & Trough */}
        <div className={`rounded-xl border p-4 shadow-2xs ${
          summary.runwayStatus === "deficit"
            ? "border-rose-300 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20"
            : summary.runwayStatus === "caution"
            ? "border-amber-300 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20"
            : "border-border bg-surface"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Liquidity Health</span>
            {summary.runwayStatus === "deficit" ? (
              <ShieldAlert className="size-4 text-rose-600 dark:text-rose-400" />
            ) : summary.runwayStatus === "caution" ? (
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <div className="mt-2 text-lg font-bold">
            {summary.runwayStatus === "deficit" ? (
              <span className="text-rose-600 dark:text-rose-400">Deficit Risk</span>
            ) : summary.runwayStatus === "caution" ? (
              <span className="text-amber-600 dark:text-amber-400">Low Buffer</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">Fully Funded</span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Lowest cash:{" "}
            <span className={`font-semibold ${summary.minimumProjectedCashMinor < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
              {formatMoney(summary.minimumProjectedCashMinor, currency)}
            </span>{" "}
            on {formatDate(summary.minimumProjectedDate)}
          </div>
        </div>
      </div>

      {/* Runway Timeline Curve / Sparkline Bar */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Projected Daily Liquidity Trajectory</h3>
            <p className="text-xs text-muted-foreground">
              Day-by-day closing cash balance over the next {summary.horizonDays} days
            </p>
          </div>
          {summary.deficitDaysCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              <AlertTriangle className="size-3.5" />
              <span>{summary.deficitDaysCount} deficit day{summary.deficitDaysCount === 1 ? "" : "s"} projected</span>
            </div>
          )}
        </div>

        {/* Visual Mini Chart */}
        <div className="h-28 w-full flex items-end gap-1 pt-4 pb-2 px-1">
          {dailyLedger.map((d) => {
            const heightPercent = Math.max(12, Math.min(100, Math.round(((d.closingBalanceMinor - minBal) / range) * 100)));
            const isNegative = d.closingBalanceMinor < 0;
            const isMin = d.closingBalanceMinor === summary.minimumProjectedCashMinor;

            return (
              <div
                key={d.date}
                className="group relative flex-1 flex flex-col justify-end items-center h-full"
              >
                {/* Tooltip */}
                <div className="pointer-events-none absolute bottom-full mb-2 hidden -translate-x-1/2 left-1/2 z-20 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block dark:bg-neutral-800">
                  <div className="font-semibold">{d.isToday ? "Today" : formatDate(d.date)}</div>
                  <div>Closing: {formatMoney(d.closingBalanceMinor, currency)}</div>
                  {d.inflowsMinor > 0 && <div className="text-emerald-400">+{formatMoney(d.inflowsMinor, currency)} in</div>}
                  {d.outflowsMinor > 0 && <div className="text-rose-400">-{formatMoney(d.outflowsMinor, currency)} out</div>}
                </div>

                {/* Bar */}
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full rounded-t-xs transition-all ${
                    isNegative
                      ? "bg-rose-500 hover:bg-rose-600"
                      : isMin
                      ? "bg-amber-500 hover:bg-amber-600"
                      : d.isToday
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-emerald-500/70 hover:bg-emerald-600"
                  }`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          <span>Today ({formatDate(summary.asOfDate)})</span>
          <span>Day +{Math.round(summary.horizonDays / 2)}</span>
          <span>Day +{summary.horizonDays} ({formatDate(dailyLedger[dailyLedger.length - 1]?.date || summary.asOfDate)})</span>
        </div>
      </div>

      {/* Horizon Bucket Distribution Matrix */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
        <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Liquidity Inflows vs Outflows by Aging Bucket
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Overdue / Immediate", data: summary.bucketSummaries.overdue, isOverdue: true },
            { label: "Next 1–7 Days", data: summary.bucketSummaries.days1To7 },
            { label: "8–30 Days", data: summary.bucketSummaries.days8To30 },
            { label: "31–60 Days", data: summary.bucketSummaries.days31To60 },
            { label: "61–90 Days", data: summary.bucketSummaries.days61To90 },
          ].map((b) => (
            <div
              key={b.label}
              className={`rounded-lg border p-3 ${
                b.isOverdue && (b.data.inflowsMinor > 0 || b.data.outflowsMinor > 0)
                  ? "border-amber-200 bg-amber-50/40 dark:border-amber-900/30 dark:bg-amber-950/10"
                  : "border-border bg-surface-raised"
              }`}
            >
              <div className="text-[11px] font-semibold text-muted-foreground uppercase">{b.label}</div>
              <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                +{formatMoney(b.data.inflowsMinor, currency)}
              </div>
              <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                -{formatMoney(b.data.outflowsMinor, currency)}
              </div>
              <div className="mt-1 border-t border-border pt-1 text-xs font-bold">
                Net:{" "}
                <span className={b.data.netMinor >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {b.data.netMinor >= 0 ? "+" : ""}{formatMoney(b.data.netMinor, currency)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("timeline")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "timeline"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="size-4" />
          <span>Daily Forecast Ledger</span>
          <span className="ml-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-normal">
            {dailyLedger.length} days
          </span>
        </button>

        <button
          onClick={() => setActiveTab("inflows")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "inflows"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowDownRight className="size-4 text-emerald-600" />
          <span>Expected Inflows</span>
          <span className="ml-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            {inflows.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("outflows")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "outflows"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowUpRight className="size-4 text-rose-600" />
          <span>Expected Outflows</span>
          <span className="ml-1 rounded-full bg-rose-100 dark:bg-rose-950/50 px-2 py-0.5 text-xs text-rose-700 dark:text-rose-300 font-medium">
            {outflows.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("accounts")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "accounts"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Landmark className="size-4 text-primary" />
          <span>Liquid Accounts</span>
          <span className="ml-1 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-normal">
            {accounts.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Daily Forecast Ledger */}
      {activeTab === "timeline" && (
        <div className="data-panel overflow-x-auto">
          <table className="data-table min-w-[850px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Timeline</th>
                <th className="text-right!">Opening Cash</th>
                <th className="text-right!">Inflows</th>
                <th className="text-right!">Outflows</th>
                <th className="text-right!">Net Change</th>
                <th className="text-right!">Closing Cash</th>
                <th className="text-center!">Status</th>
              </tr>
            </thead>
            <tbody>
              {dailyLedger.map((d) => (
                <tr
                  key={d.date}
                  className={
                    d.isDeficit
                      ? "bg-rose-50/50 dark:bg-rose-950/20 font-medium"
                      : d.isToday
                      ? "bg-primary/5 font-medium"
                      : undefined
                  }
                >
                  <td className="font-medium">
                    {formatDate(d.date)}
                    {d.isToday && (
                      <span className="ml-2 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Today
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {d.isToday ? "Immediate / Overdue" : `+${d.dayOffset} day${d.dayOffset === 1 ? "" : "s"}`}
                  </td>
                  <td className="money text-right font-mono">
                    {formatMoney(d.openingBalanceMinor, currency)}
                  </td>
                  <td className="money text-right font-mono text-emerald-600 dark:text-emerald-400">
                    {d.inflowsMinor > 0 ? (
                      <span>+{formatMoney(d.inflowsMinor, currency)} <span className="text-[10px] text-muted-foreground">({d.inflowCount})</span></span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="money text-right font-mono text-rose-600 dark:text-rose-400">
                    {d.outflowsMinor > 0 ? (
                      <span>-{formatMoney(d.outflowsMinor, currency)} <span className="text-[10px] text-muted-foreground">({d.outflowCount})</span></span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="money text-right font-mono font-medium">
                    {d.netChangeMinor !== 0 ? (
                      <span className={d.netChangeMinor > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                        {d.netChangeMinor > 0 ? "+" : ""}{formatMoney(d.netChangeMinor, currency)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className={`money text-right font-mono font-bold ${
                    d.closingBalanceMinor < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                  }`}>
                    {formatMoney(d.closingBalanceMinor, currency)}
                  </td>
                  <td className="text-center">
                    {d.isDeficit ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        <AlertTriangle className="size-3" /> Deficit
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="size-3" /> Safe
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Expected Inflows */}
      {activeTab === "inflows" && (
        <div className="data-panel overflow-x-auto">
          {inflows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No outstanding receivables invoices found.
            </div>
          ) : (
            <table className="data-table min-w-[850px]">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Invoice #</th>
                  <th>Invoice Date</th>
                  <th>Due Date</th>
                  <th>Bucket / Days</th>
                  <th className="text-right!">Foreign Open</th>
                  <th className="text-right!">Base Open ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {inflows.map((item) => (
                  <tr key={item.documentId}>
                    <td>
                      <Link
                        href={`/b/${businessId}/customers/${item.customerId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {item.customerName}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/b/${businessId}/sales/invoices/${item.documentId}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {item.documentNumber}
                      </Link>
                    </td>
                    <td className="text-xs text-muted-foreground">{formatDate(item.invoiceDate)}</td>
                    <td className="text-xs font-medium">{formatDate(item.dueDate)}</td>
                    <td>
                      {item.isOverdue ? (
                        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                          Overdue ({Math.abs(item.daysFromAsOf)}d)
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-surface-raised px-2 py-0.5 text-xs text-muted-foreground">
                          In {item.daysFromAsOf}d ({item.ageBucket})
                        </span>
                      )}
                    </td>
                    <td className="money text-right font-mono">
                      {formatMoney(item.foreignOpenMinor, item.currencyCode)}
                    </td>
                    <td className="money text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(item.baseCarryingMinor, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Expected Outflows */}
      {activeTab === "outflows" && (
        <div className="data-panel overflow-x-auto">
          {outflows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No outstanding purchase bills found.
            </div>
          ) : (
            <table className="data-table min-w-[850px]">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Internal #</th>
                  <th>Supplier Inv #</th>
                  <th>Due Date</th>
                  <th>Bucket / Days</th>
                  <th className="text-right!">Foreign Open</th>
                  <th className="text-right!">Base Open ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {outflows.map((item) => (
                  <tr key={item.documentId}>
                    <td>
                      <Link
                        href={`/b/${businessId}/suppliers/${item.supplierId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {item.supplierName}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/b/${businessId}/purchases/invoices/${item.documentId}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {item.documentNumber}
                      </Link>
                    </td>
                    <td className="text-xs text-muted-foreground">{item.supplierInvoiceNumber || "-"}</td>
                    <td className="text-xs font-medium">{formatDate(item.dueDate)}</td>
                    <td>
                      {item.isOverdue ? (
                        <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
                          Overdue ({Math.abs(item.daysFromAsOf)}d)
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-surface-raised px-2 py-0.5 text-xs text-muted-foreground">
                          In {item.daysFromAsOf}d ({item.ageBucket})
                        </span>
                      )}
                    </td>
                    <td className="money text-right font-mono">
                      {formatMoney(item.foreignOpenMinor, item.currencyCode)}
                    </td>
                    <td className="money text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                      {formatMoney(item.baseCarryingMinor, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 4: Liquid Accounts */}
      {activeTab === "accounts" && (
        <div className="data-panel overflow-x-auto">
          <table className="data-table min-w-[700px]">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Type</th>
                <th>Bank Institution</th>
                <th>Account Number</th>
                <th>Currency</th>
                <th className="text-right!">Current Liquid Balance ({currency})</th>
                <th className="text-right!">Share of Cash</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const sharePercent =
                  summary.startingCashMinor > 0
                    ? Math.max(0, Math.round((acc.balance_minor / summary.startingCashMinor) * 100))
                    : 0;

                return (
                  <tr key={acc.id}>
                    <td className="font-semibold text-foreground">{acc.name}</td>
                    <td>
                      <span className="inline-flex items-center rounded-md bg-surface-raised px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                        {acc.subtype}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground">{acc.bank_name || "-"}</td>
                    <td className="font-mono text-xs text-muted-foreground">{acc.account_number_masked || "-"}</td>
                    <td className="font-mono text-xs">{acc.currency_code}</td>
                    <td className="money text-right font-mono font-bold">
                      {formatMoney(acc.balance_minor, currency)}
                    </td>
                    <td className="text-right text-xs text-muted-foreground">
                      {sharePercent}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong bg-surface font-semibold">
                <td colSpan={5} className="h-11 px-3">
                  Total Liquid Cash Reserves
                </td>
                <td className="money h-11 px-3 text-right font-bold text-foreground">
                  {formatMoney(summary.startingCashMinor, currency)}
                </td>
                <td className="h-11 px-3 text-right text-xs">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
