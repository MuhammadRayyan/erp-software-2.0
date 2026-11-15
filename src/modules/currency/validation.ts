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

  const vatSettings = sqlite.prepare(`
    SELECT vat_registered FROM business_tax_settings WHERE id = 'default'
  `).get() as { vat_registered: number } | undefined;
  const vatRelevant = Boolean(
    input.enforceVatPolicy
    && vatSettings?.vat_registered
    && isVatRelevant(sqlite, input.taxCodeIds ?? []),
  );

  const rawRate = input.exchangeRateToBase?.trim();
  const rawSource = input.exchangeRateSource;
  const hasExplicitSnapshot = Boolean(rawRate && rawSource && ["Manual", "CBUAE"].includes(rawSource));

  let resolvedRateToBase: string;
  let resolvedRateDate: string;
  let resolvedSource: "Manual" | "CBUAE";

  if (hasExplicitSnapshot) {
    const rateDate = input.exchangeRateDate?.trim() || input.relevantDate;
    const source = rawSource as "Manual" | "CBUAE";
    validateExchangeRate(rawRate!);
    const stored = sqlite.prepare(`
      SELECT rate_to_base FROM exchange_rates
      WHERE currency_code = ? AND rate_date = ? AND source = ?
    `).get(currency.code, rateDate, source) as { rate_to_base: string } | undefined;
    if (!stored || stored.rate_to_base !== rawRate) {
      throw new Error(`An exchange rate is required for ${currency.code} on ${rateDate}.`);
    }
    if (vatRelevant && (source !== "CBUAE" || rateDate !== input.relevantDate)) {
      throw new Error(
        "A UAE VAT foreign-currency document requires the applicable CBUAE rate for its tax date.",
      );
    }
    resolvedRateToBase = stored.rate_to_base;
    resolvedRateDate = rateDate;
    resolvedSource = source;
  } else if (vatRelevant) {
    const cbuaeRow = sqlite.prepare(`
      SELECT rate_to_base, rate_date, source FROM exchange_rates
      WHERE currency_code = ? AND rate_date = ? AND source = 'CBUAE'
      ORDER BY created_at DESC LIMIT 1
    `).get(currency.code, input.relevantDate) as
      | { rate_to_base: string; rate_date: string; source: "CBUAE" }
      | undefined;
    if (!cbuaeRow) {
      throw new Error(
        "A UAE VAT foreign-currency document requires the applicable CBUAE rate for its tax date.",
      );
    }
    validateExchangeRate(cbuaeRow.rate_to_base);
    resolvedRateToBase = cbuaeRow.rate_to_base;
    resolvedRateDate = cbuaeRow.rate_date;
    resolvedSource = cbuaeRow.source;
  } else {
    const preferredRow = (sqlite.prepare(`
      SELECT rate_to_base, rate_date, source FROM exchange_rates
      WHERE currency_code = ? AND rate_date <= ?
      ORDER BY rate_date DESC, CASE source WHEN 'CBUAE' THEN 0 ELSE 1 END, created_at DESC
      LIMIT 1
    `).get(currency.code, input.relevantDate) ??
      sqlite.prepare(`
        SELECT rate_to_base, rate_date, source FROM exchange_rates
        WHERE currency_code = ?
        ORDER BY rate_date DESC, CASE source WHEN 'CBUAE' THEN 0 ELSE 1 END, created_at DESC
        LIMIT 1
      `).get(currency.code)) as
      | { rate_to_base: string; rate_date: string; source: "Manual" | "CBUAE" }
      | undefined;
    if (!preferredRow) {
      throw new Error(`An exchange rate is required for ${currency.code} on ${input.relevantDate}.`);
    }
    validateExchangeRate(preferredRow.rate_to_base);
    resolvedRateToBase = preferredRow.rate_to_base;
    resolvedRateDate = preferredRow.rate_date;
    resolvedSource = preferredRow.source;
  }

  return {
    currencyCode: currency.code,
    exchangeRateToBase: resolvedRateToBase,
    exchangeRateDate: resolvedRateDate,
    exchangeRateSource: resolvedSource,
    currencyMinorUnit: currency.minor_unit,
    baseCurrencyCode: base.code,
    baseMinorUnit: base.minor_unit,
  };
}
