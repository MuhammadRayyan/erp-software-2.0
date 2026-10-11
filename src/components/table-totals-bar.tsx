"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/core/format";

export interface MultiCurrencyTotal {
  currency: string;
  total: number;
  minorUnit: number;
}

/**
 * Aggregates an array of amount records grouped by currency code.
 */
export function formatMultiCurrencyTotals(
  items: { amount: number; currency: string; minorUnit?: number }[]
): MultiCurrencyTotal[] {
  const map = new Map<string, { total: number; minorUnit: number }>();
  for (const item of items) {
    const cur = (item.currency || "AED").toUpperCase();
    const existing = map.get(cur);
    if (existing) {
      existing.total += item.amount;
    } else {
      map.set(cur, { total: item.amount, minorUnit: item.minorUnit ?? 2 });
    }
  }
  return Array.from(map.entries()).map(([currency, data]) => ({
    currency,
    total: data.total,
    minorUnit: data.minorUnit,
  }));
}

/**
 * Returns a human-friendly string formatted currency sum, e.g. "AED 1,500.00"
 * or "AED 1,500.00 + USD 200.00" if multi-currency.
 */
export function renderMultiCurrencyString(
  items: { amount: number; currency: string; minorUnit?: number }[]
): string {
  const totals = formatMultiCurrencyTotals(items);
  if (totals.length === 0) return "—";
  return totals.map((t) => formatMoney(t.total, t.currency, t.minorUnit)).join(" + ");
}

export interface TableTotalMetric {
  label: string;
  value: ReactNode;
  tone?: "default" | "primary" | "warning" | "danger" | "success";
}

export function TableTotalsBar({
  filteredCount,
  totalCount,
  itemLabel = "items",
  metrics = [],
  className,
}: {
  filteredCount: number;
  totalCount: number;
  itemLabel?: string;
  metrics?: TableTotalMetric[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/30 px-4 py-2.5 text-xs text-muted-foreground transition-colors sm:px-6",
        className
      )}
      aria-label="Table totals and summary"
    >
      <div className="flex items-center gap-1.5 font-medium">
        <span>Showing</span>
        <span className="font-semibold text-foreground tabular">{filteredCount}</span>
        {filteredCount !== totalCount && (
          <>
            <span>of</span>
            <span className="font-semibold text-foreground tabular">{totalCount}</span>
          </>
        )}
        <span>{itemLabel}</span>
      </div>

      {metrics.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
          {metrics.map((metric, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{metric.label}:</span>
              <span
                className={cn(
                  "font-semibold tabular text-foreground",
                  metric.tone === "primary" && "text-primary font-bold",
                  metric.tone === "danger" && "text-rose-600 dark:text-rose-400 font-bold",
                  metric.tone === "warning" && "text-amber-600 dark:text-amber-400",
                  metric.tone === "success" && "text-emerald-600 dark:text-emerald-400 font-bold"
                )}
              >
                {metric.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
