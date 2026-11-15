"use client";

import { useEffect, useMemo, useRef } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";

export type DocumentCurrencyOption = {
  code: string;
  name: string;
  minorUnit: number;
};

export type DocumentRateOption = {
  id: string;
  currencyCode: string;
  rateDate: string;
  rateToBase: string;
  source: "Manual" | "CBUAE";
  sourceReference: string | null;
};

/** Pick the best stored FX rate for a currency on or before `relevantDate`, preferring CBUAE over Manual. */
export function pickAutoExchangeRate(
  rates: readonly DocumentRateOption[],
  currencyCode: string,
  relevantDate: string,
): DocumentRateOption | undefined {
  const matching = rates.filter((rate) => rate.currencyCode === currencyCode);
  if (matching.length === 0) return undefined;

  const sorted = [...matching].sort((a, b) => {
    const aOnOrBefore = relevantDate && a.rateDate <= relevantDate ? 1 : 0;
    const bOnOrBefore = relevantDate && b.rateDate <= relevantDate ? 1 : 0;
    if (aOnOrBefore !== bOnOrBefore) return bOnOrBefore - aOnOrBefore;
    if (a.rateDate !== b.rateDate) return b.rateDate.localeCompare(a.rateDate);
    if (a.source !== b.source) return a.source === "CBUAE" ? -1 : 1;
    return 0;
  });

  return sorted[0];
}

export function DocumentCurrencyFields({
  baseCurrencyCode,
  currencies,
  rates,
  currencyCode,
  exchangeRateToBase,
  exchangeRateDate,
  exchangeRateSource,
  relevantDate,
  disabled = false,
  lockCurrency = false,
  onChange,
}: {
  baseCurrencyCode: string;
  currencies: DocumentCurrencyOption[];
  rates: DocumentRateOption[];
  currencyCode: string;
  exchangeRateToBase: string;
  exchangeRateDate: string;
  exchangeRateSource: string;
  relevantDate: string;
  disabled?: boolean;
  lockCurrency?: boolean;
  onChange: (field: "currencyCode" | "exchangeRateToBase" | "exchangeRateDate" | "exchangeRateSource", value: string) => void;
}) {
  const foreign = currencyCode !== baseCurrencyCode;
  const prevRelevantDateRef = useRef(relevantDate);

  const matchedRate = useMemo(
    () => (foreign ? pickAutoExchangeRate(rates, currencyCode, relevantDate) : undefined),
    [foreign, rates, currencyCode, relevantDate],
  );

  // Sync hidden rate fields when the document date changes on an unlocked foreign document,
  // or when a foreign currency has no snapshot selected yet.
  useEffect(() => {
    const dateChanged = prevRelevantDateRef.current !== relevantDate;
    prevRelevantDateRef.current = relevantDate;
    if (disabled || !foreign) return;
    if (!dateChanged && exchangeRateToBase) return;

    if (matchedRate) {
      if (exchangeRateToBase !== matchedRate.rateToBase) {
        onChange("exchangeRateToBase", matchedRate.rateToBase);
      }
      if (exchangeRateDate !== matchedRate.rateDate) {
        onChange("exchangeRateDate", matchedRate.rateDate);
      }
      if (exchangeRateSource !== matchedRate.source) {
        onChange("exchangeRateSource", matchedRate.source);
      }
    }
  }, [
    disabled,
    foreign,
    relevantDate,
    matchedRate,
    exchangeRateToBase,
    exchangeRateDate,
    exchangeRateSource,
    onChange,
  ]);

  const currencyOptions = useMemo<ComboboxOption[]>(
    () =>
      currencies.map((currency) => ({
        value: currency.code,
        label: `${currency.code} — ${currency.name}`,
        badge: currency.code === baseCurrencyCode ? "Base" : undefined,
        keywords: [currency.code, currency.name],
      })),
    [currencies, baseCurrencyCode],
  );

  function selectCurrency(code: string) {
    if (!code) return;
    onChange("currencyCode", code);
    if (code === baseCurrencyCode) {
      onChange("exchangeRateToBase", "1");
      onChange("exchangeRateDate", relevantDate);
      onChange("exchangeRateSource", "Base");
      return;
    }
    const picked = pickAutoExchangeRate(rates, code, relevantDate);
    if (picked) {
      onChange("exchangeRateToBase", picked.rateToBase);
      onChange("exchangeRateDate", picked.rateDate);
      onChange("exchangeRateSource", picked.source);
    } else {
      onChange("exchangeRateToBase", "");
      onChange("exchangeRateDate", "");
      onChange("exchangeRateSource", "");
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="currencyCode">Currency</Label>
      <Combobox
        id="currencyCode"
        ariaLabel="Currency"
        options={currencyOptions}
        value={currencyCode}
        disabled={disabled || lockCurrency}
        onValueChange={selectCurrency}
        placeholder="Select currency"
        searchPlaceholder="Search currency..."
      />
      {foreign && !matchedRate && (
        <p className="text-xs text-danger">
          No stored FX rate for {currencyCode}. Configure in Settings → Currencies.
        </p>
      )}
      <input type="hidden" name="exchangeRateToBase" value={exchangeRateToBase} readOnly />
      <input type="hidden" name="exchangeRateDate" value={exchangeRateDate} readOnly />
      <input type="hidden" name="exchangeRateSource" value={exchangeRateSource} readOnly />
    </div>
  );
}
