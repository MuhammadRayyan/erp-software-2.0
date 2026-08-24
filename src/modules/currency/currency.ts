import type Database from "better-sqlite3";

export type CurrencyRecord = {
  code: string;
  name: string;
  symbol: string | null;
  minor_unit: number;
  is_base: number;
  is_active: number;
};

export function getBaseCurrency(sqlite: Database.Database) {
  const row = sqlite.prepare(`
    SELECT c.code, c.name, c.symbol, c.minor_unit, c.is_base, c.is_active
    FROM business_currency_settings bcs
    INNER JOIN currencies c ON c.code = bcs.base_currency_code
    WHERE bcs.id = 'default'
  `).get() as CurrencyRecord | undefined;
  if (!row) throw new Error("Base currency is not configured.");
  return row;
}

export function getCurrency(sqlite: Database.Database, code: string, requireActive = true) {
  const normalized = code.trim().toUpperCase();
  const row = sqlite.prepare(`
    SELECT code, name, symbol, minor_unit, is_base, is_active
    FROM currencies WHERE code = ?
  `).get(normalized) as CurrencyRecord | undefined;
  if (!row || (requireActive && !row.is_active)) throw new Error("This currency is not enabled.");
  return row;
}

export function listCurrencies(sqlite: Database.Database, activeOnly = false) {
  return sqlite.prepare(`
    SELECT code, name, symbol, minor_unit, is_base, is_active, created_at, updated_at
    FROM currencies ${activeOnly ? "WHERE is_active = 1" : ""}
    ORDER BY is_base DESC, code
  `).all() as (CurrencyRecord & { created_at: string; updated_at: string })[];
}
