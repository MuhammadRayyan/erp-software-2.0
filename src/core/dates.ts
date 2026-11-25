/** A calendar date must round-trip exactly; Date otherwise normalizes impossible days. */
export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseDateOnly(value: string): Date {
  if (!isDateOnly(value)) throw new Error("Enter a valid calendar date in YYYY-MM-DD format.");
  return new Date(`${value}T00:00:00.000Z`);
}

const BUSINESS_TIME_ZONE = "Asia/Dubai";
const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Today's calendar date in the business time zone (UAE, UTC+4). Ledger dates
 * such as void and reversal dates must use this, not the UTC date: between
 * 00:00 and 04:00 in Dubai the UTC date is still the previous day, which can
 * place a reversal in the prior (possibly locked or filed) period.
 */
export function businessToday(now: Date = new Date()): string {
  return businessDateFormatter.format(now);
}
