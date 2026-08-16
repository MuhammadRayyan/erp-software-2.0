import { cache } from "react";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getBusinessDb } from "@/core/db/business";
import { businesses } from "@/core/db/system-schema";
import { getSystemDb } from "@/core/db/system";
import { getBaseCurrency, getCurrency, listCurrencies } from "./currency";
import { validateExchangeRate, validateMinorUnit } from "./conversion";

const knownCurrencyNames: Record<string, { name: string; symbol: string | null; minorUnit: number }> = {
  AED: { name: "UAE Dirham", symbol: "د.إ", minorUnit: 2 },
  USD: { name: "US Dollar", symbol: "$", minorUnit: 2 },
  EUR: { name: "Euro", symbol: "€", minorUnit: 2 },
  JPY: { name: "Japanese Yen", symbol: "¥", minorUnit: 0 },
  KWD: { name: "Kuwaiti Dinar", symbol: "د.ك", minorUnit: 3 },
};

function normalizedCode(value: string) {
  return z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).parse(value).toUpperCase();
}

function hasBaseCurrencyActivity(sqlite: Database.Database) {
  const checks = [
    "SELECT 1 FROM journal_entries LIMIT 1",
    "SELECT 1 FROM tax_entries LIMIT 1",
    "SELECT 1 FROM inventory_movements LIMIT 1",
    "SELECT 1 FROM bank_transactions WHERE document_status = 'posted' LIMIT 1",
    "SELECT 1 FROM bank_transfers WHERE document_status = 'posted' LIMIT 1",
    "SELECT 1 FROM bank_reconciliations WHERE status = 'completed' LIMIT 1",
  ];
  return checks.some((query) => Boolean(sqlite.prepare(query).get()));
}

function updateBaseCurrencyFacts(sqlite: Database.Database, fromCode: string, toCode: string) {
  const documentTables = [
    "sales_invoices", "sales_credit_notes", "purchase_orders", "purchase_invoices",
    "receipts", "supplier_payments",
  ];
  for (const table of documentTables) {
    sqlite.prepare(`
      UPDATE ${table} SET currency_code = ?
      WHERE currency_code = ? AND exchange_rate_to_base = '1' AND exchange_rate_source = 'Base'
    `).run(toCode, fromCode);
  }
  sqlite.prepare(`
    UPDATE tax_entries SET document_currency = ?
    WHERE document_currency = ? AND exchange_rate_to_base = '1' AND rate_source = 'Base'
  `).run(toCode, fromCode);
  sqlite.prepare("UPDATE bank_accounts SET currency_code = ? WHERE currency_code = ?")
    .run(toCode, fromCode);
  sqlite.prepare("UPDATE customers SET default_currency_code = ? WHERE default_currency_code = ?")
    .run(toCode, fromCode);
  sqlite.prepare("UPDATE suppliers SET default_currency_code = ? WHERE default_currency_code = ?")
    .run(toCode, fromCode);
  // Every stored rate is defined relative to the former base and cannot survive
  // a base-currency change without changing its meaning.
  sqlite.prepare("DELETE FROM exchange_rates").run();
}

function dropPostedCurrencyImmutabilityTriggers(sqlite: Database.Database) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS posted_sales_invoice_currency_immutable;
    DROP TRIGGER IF EXISTS posted_purchase_invoice_currency_immutable;
    DROP TRIGGER IF EXISTS posted_credit_note_currency_immutable;
  `);
}

function installPostedCurrencyImmutabilityTriggers(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TRIGGER posted_sales_invoice_currency_immutable
    BEFORE UPDATE OF currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source
    ON sales_invoices WHEN OLD.document_status = 'posted' AND (
      NEW.currency_code <> OLD.currency_code OR NEW.exchange_rate_to_base <> OLD.exchange_rate_to_base
      OR NEW.exchange_rate_date <> OLD.exchange_rate_date OR NEW.exchange_rate_source <> OLD.exchange_rate_source)
    BEGIN SELECT RAISE(ABORT, 'Posted document currency and exchange rate are immutable'); END;
    CREATE TRIGGER posted_purchase_invoice_currency_immutable
    BEFORE UPDATE OF currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source
    ON purchase_invoices WHEN OLD.document_status = 'posted' AND (
      NEW.currency_code <> OLD.currency_code OR NEW.exchange_rate_to_base <> OLD.exchange_rate_to_base
      OR NEW.exchange_rate_date <> OLD.exchange_rate_date OR NEW.exchange_rate_source <> OLD.exchange_rate_source)
    BEGIN SELECT RAISE(ABORT, 'Posted document currency and exchange rate are immutable'); END;
    CREATE TRIGGER posted_credit_note_currency_immutable
    BEFORE UPDATE OF currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source
    ON sales_credit_notes WHEN OLD.document_status = 'posted' AND (
      NEW.currency_code <> OLD.currency_code OR NEW.exchange_rate_to_base <> OLD.exchange_rate_to_base
      OR NEW.exchange_rate_date <> OLD.exchange_rate_date OR NEW.exchange_rate_source <> OLD.exchange_rate_source)
    BEGIN SELECT RAISE(ABORT, 'Posted document currency and exchange rate are immutable'); END;
  `);
}

function applyBaseCurrency(
  sqlite: Database.Database,
  code: string,
  metadataSource: "registry" | "configured" | "backup",
) {
  const normalized = normalizedCode(code);
  const current = getBaseCurrency(sqlite);
  if (current.code === normalized) {
    sqlite.prepare(`
      UPDATE business_currency_settings SET metadata_source = ?, updated_at = ? WHERE id = 'default'
    `).run(metadataSource, new Date().toISOString());
    return;
  }
  const known = knownCurrencyNames[normalized] ?? { name: normalized, symbol: null, minorUnit: 2 };
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO currencies (code, name, symbol, minor_unit, is_base, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 1, ?, ?)
    ON CONFLICT(code) DO UPDATE SET is_active = 1, updated_at = excluded.updated_at
  `).run(normalized, known.name, known.symbol, known.minorUnit, now, now);
  sqlite.prepare("UPDATE currencies SET is_base = 0, updated_at = ? WHERE is_base = 1").run(now);
  sqlite.prepare("UPDATE currencies SET is_base = 1, is_active = 1, updated_at = ? WHERE code = ?")
    .run(now, normalized);
  updateBaseCurrencyFacts(sqlite, current.code, normalized);
  sqlite.prepare(`
    UPDATE business_currency_settings
    SET base_currency_code = ?, metadata_source = ?, updated_at = ? WHERE id = 'default'
  `).run(normalized, metadataSource, now);
}

export function synchronizeBusinessBaseCurrency(sqlite: Database.Database, registryCurrency: string) {
  const settings = sqlite.prepare(`
    SELECT base_currency_code, metadata_source FROM business_currency_settings WHERE id = 'default'
  `).get() as { base_currency_code: string; metadata_source: string } | undefined;
  if (!settings || settings.base_currency_code === registryCurrency.toUpperCase()) return;
  if (settings.metadata_source !== "migration_default") {
    throw new Error("Business base-currency metadata does not match the system registry.");
  }
  sqlite.transaction(() => {
    // Phase 9 initially migrates legacy facts as AED. A trusted pre-existing registry
    // currency must relabel those rate-1 base facts before immutability takes effect.
    dropPostedCurrencyImmutabilityTriggers(sqlite);
    applyBaseCurrency(sqlite, registryCurrency, "registry");
    installPostedCurrencyImmutabilityTriggers(sqlite);
  }).immediate();
}

export function changeBaseCurrency(businessId: string, userId: string, nextCode: string) {
  const context = getBusinessDb(businessId, userId);
  if (context.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const code = normalizedCode(nextCode);
  getCurrency(context.sqlite, code, false);
  if (hasBaseCurrencyActivity(context.sqlite)) {
    throw new Error("Base currency cannot be changed after accounting activity exists.");
  }
  context.sqlite.transaction(() => applyBaseCurrency(context.sqlite, code, "configured")).immediate();
  getSystemDb().update(businesses)
    .set({ currency: code, updatedAt: new Date().toISOString() })
    .where(eq(businesses.id, businessId))
    .run();
}

export const getCurrencySettings = cache((businessId: string, userId: string) => {
  const context = getBusinessDb(businessId, userId);
  const fxMappings = context.sqlite.prepare(`
    SELECT realized_fx_gain_account_id, realized_fx_loss_account_id
    FROM business_accounting_settings WHERE id = 'default'
  `).get() as {
    realized_fx_gain_account_id: string | null;
    realized_fx_loss_account_id: string | null;
  };
  return {
    base: getBaseCurrency(context.sqlite),
    currencies: listCurrencies(context.sqlite),
    rates: context.sqlite.prepare(`
      SELECT er.*, c.name AS currency_name, c.minor_unit
      FROM exchange_rates er INNER JOIN currencies c ON c.code = er.currency_code
      ORDER BY er.rate_date DESC, er.currency_code, er.source
    `).all() as {
      id: string; currency_code: string; currency_name: string; minor_unit: number;
      rate_date: string; rate_to_base: string; source: "Manual" | "CBUAE";
      source_reference: string | null; created_by: string | null; created_at: string;
    }[],
    fxMappings,
    gainAccounts: context.sqlite.prepare(`
      SELECT id, code, name FROM accounts
      WHERE is_active = 1 AND type IN ('other_income', 'income')
      ORDER BY code
    `).all() as { id: string; code: string; name: string }[],
    lossAccounts: context.sqlite.prepare(`
      SELECT id, code, name FROM accounts
      WHERE is_active = 1 AND type IN ('other_expense', 'expense')
      ORDER BY code
    `).all() as { id: string; code: string; name: string }[],
    baseLocked: hasBaseCurrencyActivity(context.sqlite),
  };
});

export function saveRealizedFxAccounts(
  businessId: string,
  userId: string,
  input: { gainAccountId: string; lossAccountId: string },
) {
  const context = getBusinessDb(businessId, userId);
  if (context.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const gain = context.sqlite.prepare(`
    SELECT type FROM accounts WHERE id = ? AND is_active = 1
  `).get(input.gainAccountId) as { type: string } | undefined;
  const loss = context.sqlite.prepare(`
    SELECT type FROM accounts WHERE id = ? AND is_active = 1
  `).get(input.lossAccountId) as { type: string } | undefined;
  if (!gain || !["other_income", "income"].includes(gain.type)) {
    throw new Error("Choose an active income account for realized FX gains.");
  }
  if (!loss || !["other_expense", "expense"].includes(loss.type)) {
    throw new Error("Choose an active expense account for realized FX losses.");
  }
  context.sqlite.prepare(`
    UPDATE business_accounting_settings
    SET realized_fx_gain_account_id = ?, realized_fx_loss_account_id = ?, updated_at = ?
    WHERE id = 'default'
  `).run(input.gainAccountId, input.lossAccountId, new Date().toISOString());
}

export function saveCurrency(
  businessId: string,
  userId: string,
  input: { code: string; name: string; symbol?: string; minorUnit: number; isActive: boolean },
) {
  const context = getBusinessDb(businessId, userId);
  if (context.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const code = normalizedCode(input.code);
  const name = z.string().trim().min(2).max(80).parse(input.name);
  const symbol = z.string().trim().max(8).optional().parse(input.symbol) || null;
  const minorUnit = validateMinorUnit(Number(input.minorUnit));
  const current = context.sqlite.prepare("SELECT is_base, minor_unit FROM currencies WHERE code = ?")
    .get(code) as { is_base: number; minor_unit: number } | undefined;
  if (current?.is_base && !input.isActive) throw new Error("The base currency cannot be disabled.");
  if (current && current.minor_unit !== minorUnit) {
    const used = ["sales_invoices", "sales_credit_notes", "purchase_orders", "purchase_invoices", "receipts", "supplier_payments"]
      .some((table) => Boolean(context.sqlite.prepare(`SELECT 1 FROM ${table} WHERE currency_code = ? LIMIT 1`).get(code)));
    if (used) throw new Error("Minor units cannot be changed after a currency is used by a document.");
  }
  const now = new Date().toISOString();
  context.sqlite.prepare(`
    INSERT INTO currencies (code, name, symbol, minor_unit, is_base, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, symbol = excluded.symbol,
      minor_unit = excluded.minor_unit, is_active = excluded.is_active, updated_at = excluded.updated_at
  `).run(code, name, symbol, minorUnit, input.isActive ? 1 : 0, now, now);
}

export function saveExchangeRate(
  businessId: string,
  userId: string,
  input: {
    currencyCode: string;
    rateDate: string;
    rateToBase: string;
    source: "Manual" | "CBUAE";
    sourceReference?: string;
  },
) {
  const context = getBusinessDb(businessId, userId);
  if (context.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  const currency = getCurrency(context.sqlite, input.currencyCode, true);
  if (currency.is_base) throw new Error("The base currency always has a rate of 1.");
  const rateDate = z.iso.date().parse(input.rateDate);
  const rateToBase = validateExchangeRate(input.rateToBase);
  const source = z.enum(["Manual", "CBUAE"]).parse(input.source);
  const reference = z.string().trim().max(160).optional().parse(input.sourceReference) || null;
  context.sqlite.prepare(`
    INSERT INTO exchange_rates
      (id, currency_code, rate_date, rate_to_base, source, source_reference, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(currency_code, rate_date, source) DO UPDATE SET
      rate_to_base = excluded.rate_to_base, source_reference = excluded.source_reference,
      created_by = excluded.created_by, created_at = excluded.created_at
  `).run(randomUUID(), currency.code, rateDate, rateToBase, source, reference, userId, new Date().toISOString());
}

export function deleteExchangeRate(businessId: string, userId: string, rateId: string) {
  const context = getBusinessDb(businessId, userId);
  if (context.membership.role !== "administrator") throw new Error("BUSINESS_ACCESS_DENIED");
  context.sqlite.prepare("DELETE FROM exchange_rates WHERE id = ?").run(rateId);
}
