"use client";

import { cn } from "@/lib/cn";
import { formatMoney } from "@/core/format";

export interface DocumentTotalsPanelProps {
  subtotalMinor: number;
  taxMinor: number;
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
  currencyCode,
  minorUnit,
  baseEquivalentMinor,
  baseCurrencyCode,
  baseMinorUnit,
  className,
}: DocumentTotalsPanelProps) {
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
        <dt>Total</dt>
        <dd className="money">
          {formatMoney(subtotalMinor + taxMinor, currencyCode, minorUnit)}
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
