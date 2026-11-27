"use client";

import type { Control, FieldValues } from "react-hook-form";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/core/format";
import { convertToBase } from "@/modules/currency/conversion";
import { useDocumentTotals, type DocumentLineTaxOption } from "./document-calculations";

export interface DocumentTotalsPanelProps {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor?: number;
  creditAppliedMinor?: number;
  creditLabel?: string;
  currencyCode: string;
  minorUnit: number;
  baseEquivalentMinor?: number | null;
  baseCurrencyCode?: string;
  baseMinorUnit?: number;
  className?: string;
}

export function DocumentTotalsPanel({
  subtotalMinor,
  taxMinor,
  totalMinor,
  creditAppliedMinor = 0,
  creditLabel = "Credit applied",
  currencyCode,
  minorUnit,
  baseEquivalentMinor,
  baseCurrencyCode,
  baseMinorUnit,
  className,
}: DocumentTotalsPanelProps) {
  const displayTotalMinor = totalMinor != null ? totalMinor : subtotalMinor + taxMinor;
  const effectiveCreditMinor = Math.min(displayTotalMinor, Math.max(0, creditAppliedMinor));
  const netDueMinor = Math.max(0, displayTotalMinor - effectiveCreditMinor);

  return (
    <dl className={cn("w-full space-y-2 text-sm", className)}>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="money whitespace-nowrap tabular-nums">{formatMoney(subtotalMinor, currencyCode, minorUnit)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">VAT</dt>
        <dd className="money whitespace-nowrap tabular-nums">{formatMoney(taxMinor, currencyCode, minorUnit)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
        <div>
          <dt>Total</dt>
          {displayTotalMinor < subtotalMinor + taxMinor && (
            <p className="text-[11px] font-normal text-muted-foreground">
              Reverse charge / import VAT self-accounted
            </p>
          )}
        </div>
        <dd className="money whitespace-nowrap tabular-nums">
          {formatMoney(displayTotalMinor, currencyCode, minorUnit)}
        </dd>
      </div>
      {effectiveCreditMinor > 0 && (
        <>
          <div className="flex justify-between gap-4 text-success">
            <dt>{creditLabel}</dt>
            <dd className="money whitespace-nowrap tabular-nums">
              -{formatMoney(effectiveCreditMinor, currencyCode, minorUnit)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
            <dt>Net Due</dt>
            <dd className="money whitespace-nowrap tabular-nums">
              {formatMoney(netDueMinor, currencyCode, minorUnit)}
            </dd>
          </div>
        </>
      )}
      {baseEquivalentMinor != null && baseCurrencyCode && (
        <div className="flex justify-between gap-4 border-t border-border pt-2">
          <dt className="text-muted-foreground">Base equivalent</dt>
          <dd className="money whitespace-nowrap tabular-nums">
            {formatMoney(
              baseEquivalentMinor,
              baseCurrencyCode,
              baseMinorUnit ?? minorUnit
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}

export interface IsolatedDocumentTotalsProps<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
> {
  control: Control<TFieldValues, TContext, TTransformedValues>;
  taxCodes: DocumentLineTaxOption[];
  currencyCode: string;
  minorUnit: number;
  availableCreditMinor?: number;
  creditLabel?: string;
  baseCurrencyCode?: string;
  baseMinorUnit?: number;
  exchangeRateToBase?: string;
  className?: string;
}

export function IsolatedDocumentTotals<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
>({
  control,
  taxCodes,
  currencyCode,
  minorUnit,
  availableCreditMinor = 0,
  creditLabel,
  baseCurrencyCode,
  baseMinorUnit,
  exchangeRateToBase,
  className,
}: IsolatedDocumentTotalsProps<TFieldValues, TContext, TTransformedValues>) {
  const { subtotalMinor, taxMinor, totalMinor } = useDocumentTotals({
    control: control as unknown as Control<FieldValues>,
    taxCodes,
    minorUnit,
  });

  const creditAppliedMinor =
    availableCreditMinor > 0 ? Math.min(totalMinor, availableCreditMinor) : 0;

  let baseEquivalentMinor: number | null = null;
  if (
    baseCurrencyCode &&
    baseCurrencyCode !== currencyCode &&
    exchangeRateToBase
  ) {
    try {
      baseEquivalentMinor = convertToBase(
        totalMinor,
        minorUnit,
        baseMinorUnit ?? minorUnit,
        exchangeRateToBase
      );
    } catch {
      baseEquivalentMinor = null;
    }
  }

  return (
    <DocumentTotalsPanel
      subtotalMinor={subtotalMinor}
      taxMinor={taxMinor}
      totalMinor={totalMinor}
      creditAppliedMinor={creditAppliedMinor}
      creditLabel={creditLabel}
      currencyCode={currencyCode}
      minorUnit={minorUnit}
      baseEquivalentMinor={baseEquivalentMinor}
      baseCurrencyCode={baseCurrencyCode}
      baseMinorUnit={baseMinorUnit}
      className={className}
    />
  );
}
