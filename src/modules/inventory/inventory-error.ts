export function inventoryErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  if (/SQLITE|UNIQUE constraint|FOREIGN KEY constraint|CHECK constraint|NOT NULL constraint/i.test(error.message)) return fallback;
  return error.message;
}
