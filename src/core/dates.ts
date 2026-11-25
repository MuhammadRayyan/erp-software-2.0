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
