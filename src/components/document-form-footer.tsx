"use client";

import * as React from "react";
import type { Control, FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/core/format";
import { cn } from "@/lib/cn";
import { DocumentWorkflowPermissions } from "@/components/permissions-provider";
import { useDocumentTotals, type DocumentLineTaxOption } from "@/components/documents/document-calculations";
import { requestGuardedNavigation } from "@/hooks/use-unsaved-changes";

export type DocumentTotalsSummary = {
  subtotalMinor?: number;
  taxMinor?: number;
  creditAppliedMinor?: number;
  totalMinor: number;
  currencyCode: string;
  minorUnit?: number;
};

export type LiveFooterTotalsConfig<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
> = {
  control: Control<TFieldValues, TContext, TTransformedValues>;
  taxCodes: DocumentLineTaxOption[];
  currencyCode: string;
  minorUnit?: number;
  creditAppliedMinor?: number;
  availableCreditMinor?: number;
};

function FooterTotalsPill({
  totalMinor,
  creditAppliedMinor,
  currencyCode,
  minorUnit = 2,
}: {
  totalMinor: number;
  creditAppliedMinor?: number;
  currencyCode: string;
  minorUnit?: number;
}) {
  const credit = creditAppliedMinor ?? 0;
  const netMinor = Math.max(0, totalMinor - credit);
  return (
    <div className="flex items-center gap-3 text-xs sm:text-sm">
      {credit > 0 && (
        <div className="hidden lg:flex items-center gap-1 text-success">
          <span>Credit:</span>
          <span className="font-medium tabular">
            -{formatMoney(credit, currencyCode, minorUnit)}
          </span>
        </div>
      )}
      <div className="flex items-center gap-1.5 bg-surface-muted px-2.5 py-1 rounded-md border border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {credit > 0 ? "Net Due:" : "Total:"}
        </span>
        <span className="text-sm font-bold text-foreground tabular whitespace-nowrap">
          {formatMoney(netMinor, currencyCode, minorUnit)}
        </span>
      </div>
    </div>
  );
}

function IsolatedFooterTotal<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
>({
  control,
  taxCodes,
  currencyCode,
  minorUnit = 2,
  creditAppliedMinor,
  availableCreditMinor,
}: LiveFooterTotalsConfig<TFieldValues, TContext, TTransformedValues>) {
  const { totalMinor } = useDocumentTotals({
    control: control as unknown as Control<FieldValues>,
    taxCodes,
    minorUnit,
  });
  const computedCredit =
    availableCreditMinor != null && availableCreditMinor > 0
      ? Math.min(totalMinor, availableCreditMinor)
      : creditAppliedMinor;
  return (
    <FooterTotalsPill
      totalMinor={totalMinor}
      creditAppliedMinor={computedCredit}
      currencyCode={currencyCode}
      minorUnit={minorUnit}
    />
  );
}

export function DocumentFormFooter<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
>({
  children,
  onCancel,
  cancelLabel = "Cancel",
  status,
  totals,
  liveTotals,
  className,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  cancelLabel?: string;
  status?: string;
  totals?: DocumentTotalsSummary;
  liveTotals?: LiveFooterTotalsConfig<TFieldValues, TContext, TTransformedValues>;
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
        <Button
          variant="ghost"
          onClick={() => requestGuardedNavigation("#cancel", onCancel)}
          type="button"
        >
          {cancelLabel}
        </Button>
        {status && (
          <div className="hidden sm:flex items-center gap-1.5 border-l border-border pl-3">
            <span className="text-xs text-muted-foreground font-medium">Status:</span>
            <StatusBadge status={status} />
          </div>
        )}
      </div>

      {liveTotals ? (
        <IsolatedFooterTotal {...liveTotals} />
      ) : totals ? (
        <FooterTotalsPill
          totalMinor={totals.totalMinor}
          creditAppliedMinor={totals.creditAppliedMinor}
          currencyCode={totals.currencyCode}
          minorUnit={totals.minorUnit}
        />
      ) : null}

      <div className="flex items-center gap-3 ml-auto sm:ml-0">
        <DocumentWorkflowPermissions status={status}>
          {children}
        </DocumentWorkflowPermissions>
      </div>
    </div>
  );
}
