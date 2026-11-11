"use client";

import { cn } from "@/lib/cn";
import { formatMoney } from "@/core/format";

export interface DocumentTotalsPanelProps {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor?: number;
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
  currencyCode,
  minorUnit,
  baseEquivalentMinor,
  baseCurrencyCode,
  baseMinorUnit,
  className,
}: DocumentTotalsPanelProps) {
  const displayTotalMinor = totalMinor != null ? totalMinor : subtotalMinor + taxMinor;

  return (
    <dl className={cn("w-full max-w-xs space-y-2 text-sm", className)}>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="money">{formatMoney(subtotalMinor, currencyCode, minorUnit)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">VAT</dt>
        <dd className="money">{formatMoney(taxMinor, currencyCode, minorUnit)}</dd>
      </div>
      <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
        <div>
          <dt>Total</dt>
          {displayTotalMinor < subtotalMinor + taxMinor && (
            <p className="text-[11px] font-normal text-muted-foreground">
              Reverse Charge self-accounted
            </p>
          )}
        </div>
        <dd className="money">
          {formatMoney(displayTotalMinor, currencyCode, minorUnit)}
        </dd>
      </div>
      {baseEquivalentMinor != null && baseCurrencyCode && (
        <div className="flex justify-between border-t border-border pt-2">
          <dt className="text-muted-foreground">Base equivalent</dt>
          <dd className="money">
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
