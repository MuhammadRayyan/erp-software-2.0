"use client";

import { Input } from "@/components/ui/input";
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

  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <div className="space-y-1.5"><Label htmlFor="currencyCode">Currency</Label><SelectNative id="currencyCode"  value={currencyCode} disabled={disabled || lockCurrency} onChange={(event) => selectCurrency(event.target.value)}>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</SelectNative></div>
    {foreign ? <>
      <div className="space-y-1.5 sm:col-span-1 lg:col-span-2"><Label htmlFor="storedExchangeRate">Stored exchange rate</Label><SelectNative id="storedExchangeRate"  value={selectedRate?.id ?? ""} disabled={disabled} onChange={(event) => selectRate(event.target.value)}><option value="">Choose an explicit stored rate…</option>{availableRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.rateDate} · 1 {currencyCode} = {rate.rateToBase} {baseCurrencyCode} · {rate.source}</option>)}</SelectNative>{availableRates.length === 0 && <p className="text-xs text-danger">No stored rate exists for {currencyCode}. Add one in Settings → Currencies & exchange rates.</p>}</div>
      <div className="space-y-1.5"><Label>Snapshot</Label><div className="min-h-9 rounded-[6px] border border-border bg-surface-muted px-2.5 py-2 text-xs tabular-nums">{exchangeRateToBase ? `${exchangeRateDate} · ${exchangeRateSource} · ${exchangeRateToBase}` : "Not selected"}</div></div>
    </> : <div className="space-y-1.5 sm:col-span-1 lg:col-span-3"><Label>Exchange rate</Label><Input value={`1 ${baseCurrencyCode} = 1 ${baseCurrencyCode}`} disabled /></div>}
    <input type="hidden" name="exchangeRateToBase" value={exchangeRateToBase} readOnly />
    <input type="hidden" name="exchangeRateDate" value={exchangeRateDate} readOnly />
    <input type="hidden" name="exchangeRateSource" value={exchangeRateSource} readOnly />
  </div>;
}
