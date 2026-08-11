import type Database from "better-sqlite3";
import { getBaseCurrency, getCurrency } from "./currency";
import { validateExchangeRate } from "./conversion";

export type RateSnapshot = {
  currencyCode: string;
  exchangeRateToBase: string;
  exchangeRateDate: string;
  exchangeRateSource: "Base" | "Manual" | "CBUAE";
  currencyMinorUnit: number;
  baseCurrencyCode: string;
  baseMinorUnit: number;
};

export function storedRateSnapshot(
  sqlite: Database.Database,
  row: {
    currencyCode: string;
    exchangeRateToBase: string;
    exchangeRateDate: string;
    exchangeRateSource: string;
  },
): RateSnapshot {
  const base = getBaseCurrency(sqlite);
  const currency = getCurrency(sqlite, row.currencyCode, false);
  validateExchangeRate(row.exchangeRateToBase);
  if (!(["Base", "Manual", "CBUAE"] as const).includes(row.exchangeRateSource as "Base" | "Manual" | "CBUAE")) {
    throw new Error("Stored exchange-rate source is invalid.");
  }
  return {
    currencyCode: currency.code,
    exchangeRateToBase: row.exchangeRateToBase,
    exchangeRateDate: row.exchangeRateDate,
    exchangeRateSource: row.exchangeRateSource as "Base" | "Manual" | "CBUAE",
    currencyMinorUnit: currency.minor_unit,
    baseCurrencyCode: base.code,
    baseMinorUnit: base.minor_unit,
  };
}

export function isVatRelevant(
  sqlite: Database.Database,
  taxCodeIds: readonly string[],
) {
  if (!taxCodeIds.length) return false;
  const ids = [...new Set(taxCodeIds)];
  const rows = sqlite.prepare(`
    SELECT vat_category FROM tax_codes WHERE id IN (${ids.map(() => "?").join(", ")})
  `).all(...ids) as { vat_category: string | null }[];
  return rows.some((row) => row.vat_category !== "out_of_scope");
}

export function resolveRateSnapshot(
  sqlite: Database.Database,
  input: {
    currencyCode: string;
    exchangeRateToBase?: string | null;
    exchangeRateDate?: string | null;
    exchangeRateSource?: string | null;
    relevantDate: string;
    taxCodeIds?: readonly string[];
    enforceVatPolicy?: boolean;
  },
): RateSnapshot {
  const base = getBaseCurrency(sqlite);
  const currency = getCurrency(sqlite, input.currencyCode, true);
  if (currency.code === base.code) {
    return {
      currencyCode: base.code,
      exchangeRateToBase: "1",
      exchangeRateDate: input.relevantDate,
      exchangeRateSource: "Base",
      currencyMinorUnit: base.minor_unit,
      baseCurrencyCode: base.code,
      baseMinorUnit: base.minor_unit,
    };
  }

  const rateDate = input.exchangeRateDate?.trim() || input.relevantDate;
  const source = input.exchangeRateSource;
  const requestedRate = input.exchangeRateToBase?.trim();
  if (!requestedRate || !source || !["Manual", "CBUAE"].includes(source)) {
    throw new Error(`An exchange rate is required for ${currency.code} on ${rateDate}.`);
  }
  validateExchangeRate(requestedRate);
  const stored = sqlite.prepare(`
    SELECT rate_to_base FROM exchange_rates
    WHERE currency_code = ? AND rate_date = ? AND source = ?
  `).get(currency.code, rateDate, source) as { rate_to_base: string } | undefined;
  if (!stored || stored.rate_to_base !== requestedRate) {
    throw new Error(`An exchange rate is required for ${currency.code} on ${rateDate}.`);
  }

  const vatSettings = sqlite.prepare(`
    SELECT vat_registered FROM business_tax_settings WHERE id = 'default'
  `).get() as { vat_registered: number } | undefined;
  const vatRelevant = Boolean(
    input.enforceVatPolicy
    && vatSettings?.vat_registered
    && isVatRelevant(sqlite, input.taxCodeIds ?? []),
  );
  if (vatRelevant && (source !== "CBUAE" || rateDate !== input.relevantDate)) {
    throw new Error(
      "A UAE VAT foreign-currency document requires the applicable CBUAE rate for its tax date.",
    );
  }

  return {
    currencyCode: currency.code,
    exchangeRateToBase: stored.rate_to_base,
    exchangeRateDate: rateDate,
    exchangeRateSource: source as "Manual" | "CBUAE",
    currencyMinorUnit: currency.minor_unit,
    baseCurrencyCode: base.code,
    baseMinorUnit: base.minor_unit,
  };
}
