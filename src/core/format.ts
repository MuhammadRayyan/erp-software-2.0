import Decimal from "decimal.js";

const BUSINESS_TIME_ZONE = "Asia/Dubai";

const knownMinorUnits: Record<string, number> = {
  AED: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  SAR: 2,
  QAR: 2,
};

export function minorToDecimalString(minor: number = 0, currency = "AED", minorUnit?: number): string {
  const resolvedMinorUnit = minorUnit ?? knownMinorUnits[currency.toUpperCase()] ?? 2;
  return new Decimal(minor).div(new Decimal(10).pow(resolvedMinorUnit)).toFixed(resolvedMinorUnit);
}

// Cache Intl.NumberFormat instances — construction is expensive and formatters
// are reused across hundreds of table cells per page render.
const moneyFormatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor?: number | null, currency = "AED", minorUnit = knownMinorUnits[currency] ?? 2) {
  if (minor == null || Number.isNaN(minor)) {
    minor = 0;
  }
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

export type DateFormatPattern = "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "DD MMM YYYY";

export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions | DateFormatPattern) {
  if (!value) return "—";

  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date = new Date(`${value}T00:00:00Z`);
  } else {
    date = new Date(value);
  }
  
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  if (typeof options === "string") {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = String(date.getUTCFullYear());
    const monthShort = date.toLocaleDateString("en-AE", { month: "short", timeZone: "UTC" });

    switch (options) {
      case "YYYY-MM-DD":
        return `${year}-${month}-${day}`;
      case "MM/DD/YYYY":
        return `${month}/${day}/${year}`;
      case "DD MMM YYYY":
        return `${day} ${monthShort} ${year}`;
      case "DD/MM/YYYY":
      default:
        return `${day}/${month}/${year}`;
    }
  }

  const resolvedOptions = options ?? DEFAULT_DATE_OPTIONS;
  const key = JSON.stringify(resolvedOptions);
  let fmt = dateFormatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-AE", { ...resolvedOptions, timeZone: BUSINESS_TIME_ZONE });
    dateFormatterCache.set(key, fmt);
  }
  
  return fmt.format(date);
}

export function formatDateTime(value?: string | null) {
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

export const EMPTY_CELL = "—";
export function formatOptional(value?: string | null): string {
  return value ?? EMPTY_CELL;
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

