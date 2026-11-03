"use client";

import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";

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
  const availableRates = rates.filter((rate) => rate.currencyCode === currencyCode);
  const selectedRate = availableRates.find((rate) => rate.rateToBase === exchangeRateToBase && rate.rateDate === exchangeRateDate && rate.source === exchangeRateSource);

  function selectCurrency(code: string) {
    onChange("currencyCode", code);
    if (code === baseCurrencyCode) {
      onChange("exchangeRateToBase", "1");
      onChange("exchangeRateDate", relevantDate);
      onChange("exchangeRateSource", "Base");
      return;
    }
    onChange("exchangeRateToBase", "");
    onChange("exchangeRateDate", "");
    onChange("exchangeRateSource", "");
  }

  function selectRate(rateId: string) {
    const rate = availableRates.find((entry) => entry.id === rateId);
    if (!rate) return;
    onChange("exchangeRateToBase", rate.rateToBase);
    onChange("exchangeRateDate", rate.rateDate);
    onChange("exchangeRateSource", rate.source);
  }

  if (!foreign) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor="currencyCode">Currency</Label>
        <SelectNative
          id="currencyCode"
          value={currencyCode}
          disabled={disabled || lockCurrency}
          onChange={(event) => selectCurrency(event.target.value)}
        >
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </SelectNative>
        <input type="hidden" name="exchangeRateToBase" value={exchangeRateToBase} readOnly />
        <input type="hidden" name="exchangeRateDate" value={exchangeRateDate} readOnly />
        <input type="hidden" name="exchangeRateSource" value={exchangeRateSource} readOnly />
      </div>
    );
  }

  return (
    <div className="col-span-full grid gap-5 sm:grid-cols-2 md:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="currencyCode">Currency</Label>
        <SelectNative
          id="currencyCode"
          value={currencyCode}
          disabled={disabled || lockCurrency}
          onChange={(event) => selectCurrency(event.target.value)}
        >
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </SelectNative>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="storedExchangeRate">Exchange rate</Label>
        <SelectNative
          id="storedExchangeRate"
          value={selectedRate?.id ?? ""}
          disabled={disabled}
          onChange={(event) => selectRate(event.target.value)}
        >
          <option value="">Choose a stored rate…</option>
          {availableRates.map((rate) => (
            <option key={rate.id} value={rate.id}>
              {rate.rateDate} · 1 {currencyCode} = {rate.rateToBase} {baseCurrencyCode} ({rate.source})
            </option>
          ))}
        </SelectNative>
        {availableRates.length === 0 && (
          <p className="text-xs text-danger">No stored rate for {currencyCode}. Add in Settings → Currencies.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Rate snapshot</Label>
        <div className="flex h-9 items-center rounded-md border border-border bg-surface-muted/60 px-3 text-xs font-mono font-medium text-foreground truncate">
          {exchangeRateToBase
            ? `1 ${currencyCode} = ${exchangeRateToBase} ${baseCurrencyCode} (${exchangeRateSource})`
            : "No rate selected"}
        </div>
      </div>
      <input type="hidden" name="exchangeRateToBase" value={exchangeRateToBase} readOnly />
      <input type="hidden" name="exchangeRateDate" value={exchangeRateDate} readOnly />
      <input type="hidden" name="exchangeRateSource" value={exchangeRateSource} readOnly />
    </div>
  );
}
