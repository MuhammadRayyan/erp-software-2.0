import Decimal from "decimal.js";

const BUSINESS_TIME_ZONE = "Asia/Dubai";

const knownMinorUnits: Record<string, number> = { AED: 2, USD: 2, EUR: 2, JPY: 0, KWD: 3 };

export function formatMoney(minor: number, currency = "AED", minorUnit = knownMinorUnits[currency] ?? 2) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  }).format(new Decimal(minor).div(new Decimal(10).pow(minorUnit)).toNumber());
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(value);
  return new Intl.DateTimeFormat("en-AE", {
    ...(options ?? { day: "2-digit", month: "short", year: "numeric" }),
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
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
