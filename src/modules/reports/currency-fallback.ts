import type Database from "better-sqlite3";

/**
 * Resolves the fallback reporting currency for a business when no document-level
 * or counterparty default currency is available.
 */
export function resolveBaseCurrencyCode(
  sqlite: Database.Database,
  businessCurrency?: string | null,
): string {
  const normalizedBusinessCurrency = businessCurrency?.trim().toUpperCase();
  if (normalizedBusinessCurrency) {
    return normalizedBusinessCurrency;
  }

  const baseRow = sqlite
    .prepare("SELECT code FROM currencies WHERE is_base = 1 LIMIT 1")
    .get() as { code?: string | null } | undefined;

  return baseRow?.code?.trim().toUpperCase() || "AED";
}
