import Decimal from "decimal.js";

const BUSINESS_TIME_ZONE = "Asia/Dubai";

const knownMinorUnits: Record<string, number> = { AED: 2, USD: 2, EUR: 2, JPY: 0, KWD: 3 };

// Cache Intl.NumberFormat instances — construction is expensive and formatters
// are reused across hundreds of table cells per page render.
const moneyFormatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: number, currency = "AED", minorUnit = knownMinorUnits[currency] ?? 2) {
  const key = `${currency}:${minorUnit}`;
  let fmt = moneyFormatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: minorUnit,
      maximumFractionDigits: minorUnit,
    });
    moneyFormatterCache.set(key, fmt);
  }
  return fmt.format(new Decimal(minor).div(new Decimal(10).pow(minorUnit)).toNumber());
}

// Cache Intl.DateTimeFormat instances — same reason as NumberFormat above.
// Keyed by JSON-serialized options so variable option sets get their own formatter.
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const resolvedOptions = options ?? DEFAULT_DATE_OPTIONS;
  const key = JSON.stringify(resolvedOptions);
  let fmt = dateFormatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-AE", { ...resolvedOptions, timeZone: BUSINESS_TIME_ZONE });
    dateFormatterCache.set(key, fmt);
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(value);
  return fmt.format(date);
}

export function formatDateTime(value: string) {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatRelativeOpened(value: string | null) {
  if (!value) return "Never opened";
  const date = new Date(value);
  const today = new Date();
  const days = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Last opened today";
  if (days === 1) return "Last opened yesterday";
  return `Last opened ${days} days ago`;
}
