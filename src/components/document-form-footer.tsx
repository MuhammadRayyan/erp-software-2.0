import * as React from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/core/format";
import { cn } from "@/lib/cn";

export type DocumentTotalsSummary = {
  subtotalMinor?: number;
  taxMinor?: number;
  creditAppliedMinor?: number;
  totalMinor: number;
  currencyCode: string;
  minorUnit?: number;
};

export function DocumentFormFooter({
  children,
  onCancel,
  cancelLabel = "Cancel",
  status,
  totals,
  className,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  cancelLabel?: string;
  status?: string;
  totals?: DocumentTotalsSummary;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x shadow-md",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onCancel} type="button">
          {cancelLabel}
        </Button>
        {status && (
          <div className="hidden sm:flex items-center gap-1.5 border-l border-border pl-3">
            <span className="text-xs text-muted-foreground font-medium">Status:</span>
            <StatusBadge status={status} />
          </div>
        )}
      </div>

      {totals && (
        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
          {totals.subtotalMinor !== undefined && (
            <div className="hidden md:flex items-center gap-1 text-muted-foreground">
              <span>Subtotal:</span>
              <span className="font-medium text-foreground tabular">
                {formatMoney(totals.subtotalMinor, totals.currencyCode, totals.minorUnit ?? 2)}
              </span>
            </div>
          )}
          {totals.taxMinor !== undefined && totals.taxMinor > 0 && (
            <div className="hidden md:flex items-center gap-1 text-muted-foreground">
              <span>Tax:</span>
              <span className="font-medium text-foreground tabular">
                {formatMoney(totals.taxMinor, totals.currencyCode, totals.minorUnit ?? 2)}
              </span>
            </div>
          )}
          {totals.creditAppliedMinor !== undefined && totals.creditAppliedMinor > 0 && (
            <div className="hidden lg:flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <span>Credit:</span>
              <span className="font-medium tabular">
                -{formatMoney(totals.creditAppliedMinor, totals.currencyCode, totals.minorUnit ?? 2)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-surface-muted px-2.5 py-1 rounded-md border border-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {totals.creditAppliedMinor && totals.creditAppliedMinor > 0 ? "Net Due:" : "Total:"}
            </span>
            <span className="text-sm font-bold text-foreground tabular">
              {formatMoney(
                Math.max(0, totals.totalMinor - (totals.creditAppliedMinor ?? 0)),
                totals.currencyCode,
                totals.minorUnit ?? 2
              )}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 ml-auto sm:ml-0">{children}</div>
    </div>
  );
}
