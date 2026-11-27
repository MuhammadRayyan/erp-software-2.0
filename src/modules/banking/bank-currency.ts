import type Database from "better-sqlite3";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";

/**
 * A journal line's amount in its bank account's own currency (debit-positive).
 * Lines on a foreign-currency bank ledger always carry currency_amount_minor
 * (posting-service enforces it); base-currency bank lines leave it NULL and
 * their account-currency amount is simply debit minus credit. Unrealized FX
 * revaluation lines carry 0: they move the base value, not the bank balance.
 */
export const BANK_AMOUNT_SQL = "COALESCE(jl.currency_amount_minor, jl.debit_minor - jl.credit_minor)";

export type BankCurrency = {
  code: string;
  minorUnit: number;
  isBase: boolean;
  baseCode: string;
  baseMinorUnit: number;
};

function describe(sqlite: Database.Database, code: string): BankCurrency {
  const base = getBaseCurrency(sqlite);
  const currency = code === base.code ? base : getCurrency(sqlite, code, false);
  return {
    code: currency.code,
    minorUnit: currency.minor_unit,
    isBase: currency.code === base.code,
    baseCode: base.code,
    baseMinorUnit: base.minor_unit,
  };
}

export function bankAccountCurrency(sqlite: Database.Database, bankAccountId: string) {
  const row = sqlite.prepare("SELECT currency_code FROM bank_accounts WHERE id = ?")
    .get(bankAccountId) as { currency_code: string } | undefined;
  if (!row) throw new Error("Bank Account not found.");
  return describe(sqlite, row.currency_code);
}

/** Currency of the bank account mapped to a Bank/Cash ledger; base when the ledger has no bank account. */
export function ledgerBankCurrency(sqlite: Database.Database, ledgerAccountId: string) {
  const row = sqlite.prepare("SELECT currency_code FROM bank_accounts WHERE ledger_account_id = ?")
    .get(ledgerAccountId) as { currency_code: string } | undefined;
  return describe(sqlite, row?.currency_code ?? getBaseCurrency(sqlite).code);
}

/**
 * A foreign-currency bank account only takes money in its own currency. A
 * base-currency account may still receive or pay a foreign document: the bank
 * line then moves by the base equivalent, as before.
 */
export function assertBankAcceptsCurrency(
  sqlite: Database.Database,
  ledgerAccountId: string,
  currencyCode: string,
  label: string,
) {
  const bank = ledgerBankCurrency(sqlite, ledgerAccountId);
  if (!bank.isBase && bank.code !== currencyCode.toUpperCase()) {
    throw new Error(`A ${bank.code} bank account can only ${label} in ${bank.code}.`);
  }
  return bank;
}
