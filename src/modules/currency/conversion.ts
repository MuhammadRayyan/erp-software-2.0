import Decimal from "decimal.js";
import type { RateSnapshot } from "./validation";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

function powerOfTen(exponent: number) {
  return new Decimal(10).pow(exponent);
}

function safeMinor(value: Decimal, label: string) {
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const number = rounded.toNumber();
  if (!Number.isSafeInteger(number)) throw new Error(`${label} is too large.`);
  return number;
}

export function validateMinorUnit(minorUnit: number) {
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 6) {
    throw new Error("Currency minor unit must be between 0 and 6.");
  }
  return minorUnit;
}

export function validateExchangeRate(rateToBase: string) {
  const value = rateToBase.trim();
  if (!/^\d{1,12}(?:\.\d{1,12})?$/.test(value)) {
    throw new Error("Exchange rate must be a positive decimal with up to 12 decimal places.");
  }
  const rate = new Decimal(value);
  if (!rate.isFinite() || rate.lte(0)) throw new Error("Exchange rate must be greater than zero.");
  return value;
}

export function parseCurrencyAmountToMinor(value: string, minorUnit: number, label = "Amount") {
  validateMinorUnit(minorUnit);
  const normalized = value.trim();
  const pattern = new RegExp(`^\\d{1,12}${minorUnit > 0 ? `(?:\\.\\d{1,${minorUnit}})?` : ""}$`);
  if (!pattern.test(normalized)) {
    throw new Error(`${label} must have no more than ${minorUnit} decimal place${minorUnit === 1 ? "" : "s"}.`);
  }
  return safeMinor(new Decimal(normalized).mul(powerOfTen(minorUnit)), label);
}

export function minorToCurrencyInput(amountMinor: number, minorUnit: number) {
  validateMinorUnit(minorUnit);
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Amount is invalid.");
  return new Decimal(amountMinor).div(powerOfTen(minorUnit)).toFixed(minorUnit);
}

// Used by unit tests only.
export function roundCurrencyAmount(value: Decimal.Value, minorUnit: number) {
  validateMinorUnit(minorUnit);
  return new Decimal(value).toDecimalPlaces(minorUnit, Decimal.ROUND_HALF_UP).toFixed(minorUnit);
}

/** rate_to_base is always base-currency units for one foreign-currency unit. */
export function convertToBase(
  foreignAmountMinor: number,
  foreignMinorUnit: number,
  baseMinorUnit: number,
  rateToBase: string,
) {
  if (!Number.isSafeInteger(foreignAmountMinor)) throw new Error("Foreign amount is invalid.");
  validateMinorUnit(foreignMinorUnit);
  validateMinorUnit(baseMinorUnit);
  const rate = new Decimal(validateExchangeRate(rateToBase));
  return safeMinor(
    new Decimal(foreignAmountMinor)
      .div(powerOfTen(foreignMinorUnit))
      .mul(rate)
      .mul(powerOfTen(baseMinorUnit)),
    "Base amount",
  );
}

// Used by unit tests only.
export function convertFromBase(
  baseAmountMinor: number,
  baseMinorUnit: number,
  foreignMinorUnit: number,
  rateToBase: string,
) {
  if (!Number.isSafeInteger(baseAmountMinor)) throw new Error("Base amount is invalid.");
  validateMinorUnit(foreignMinorUnit);
  validateMinorUnit(baseMinorUnit);
  const rate = new Decimal(validateExchangeRate(rateToBase));
  return safeMinor(
    new Decimal(baseAmountMinor)
      .div(powerOfTen(baseMinorUnit))
      .div(rate)
      .mul(powerOfTen(foreignMinorUnit)),
    "Foreign amount",
  );
}

export function proportionalCarryingRelease(
  foreignAmountAllocated: number,
  foreignOpenBefore: number,
  baseCarryingBefore: number,
) {
  if (
    !Number.isSafeInteger(foreignAmountAllocated)
    || !Number.isSafeInteger(foreignOpenBefore)
    || !Number.isSafeInteger(baseCarryingBefore)
    || foreignAmountAllocated <= 0
    || foreignAmountAllocated > foreignOpenBefore
    || baseCarryingBefore < 0
  ) {
    throw new Error("Settlement allocation amounts are invalid.");
  }
  if (foreignAmountAllocated === foreignOpenBefore) return baseCarryingBefore;
  return safeMinor(
    new Decimal(baseCarryingBefore).mul(foreignAmountAllocated).div(foreignOpenBefore),
    "Released carrying amount",
  );
}

export function convertDocumentLinesToBase<T extends {
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
}>(lines: readonly T[], rate: RateSnapshot) {
  const converted = lines.map((line) => {
    const baseNetAmountMinor = convertToBase(
      line.netAmountMinor,
      rate.currencyMinorUnit,
      rate.baseMinorUnit,
      rate.exchangeRateToBase,
    );
    const baseTaxAmountMinor = convertToBase(
      line.taxAmountMinor,
      rate.currencyMinorUnit,
      rate.baseMinorUnit,
      rate.exchangeRateToBase,
    );
    return {
      ...line,
      baseNetAmountMinor,
      baseTaxAmountMinor,
      baseGrossAmountMinor: line.grossAmountMinor === line.netAmountMinor
        ? baseNetAmountMinor
        : baseNetAmountMinor + baseTaxAmountMinor,
    };
  });
  return {
    lines: converted,
    baseSubtotalMinor: converted.reduce((sum, line) => sum + line.baseNetAmountMinor, 0),
    baseTaxMinor: converted.reduce((sum, line) => sum + line.baseTaxAmountMinor, 0),
    baseTotalMinor: converted.reduce((sum, line) => sum + line.baseGrossAmountMinor, 0),
  };
}
