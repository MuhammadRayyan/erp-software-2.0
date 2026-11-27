import { assertSavePermission, assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";
import { bankAccountInputSchema, type BankAccountInput } from "./bank-account-input";
import { BANK_AMOUNT_SQL } from "./bank-currency";

export type BankAccountRow = {
  id: string;
  name: string;
  account_code: string | null;
  bank_name: string | null;
  account_number_masked: string | null;
  currency_code: string;
  ledger_account_id: string;
  ledger_name: string;
  is_cash_account: number;
  is_active: number;
  /** Balance in the account's own currency. */
  book_balance_minor: number;
  /** Mapped GL balance in the base currency (differs from book_balance_minor for foreign accounts). */
  base_balance_minor: number;
  statement_balance_minor: number | null;
  unreconciled_count: number;
};

// SQL fragment reused for both list and single-record queries — defined once
// at module level to avoid rebuilding the string on every invocation.
const ACCOUNT_SELECT = `
    SELECT ba.id, ba.name, ba.account_code, ba.bank_name, ba.account_number_masked,
      ba.currency_code, ba.ledger_account_id, ba.is_cash_account, ba.is_active,
      a.name AS ledger_name,
      COALESCE((
        SELECT SUM(${BANK_AMOUNT_SQL})
        FROM journal_lines jl
        INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
        WHERE jl.account_id = ba.ledger_account_id
      ), 0) AS book_balance_minor,
      COALESCE((
        SELECT SUM(jl.debit_minor - jl.credit_minor)
        FROM journal_lines jl
        INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
        WHERE jl.account_id = ba.ledger_account_id
      ), 0) AS base_balance_minor,
      (
        SELECT br.statement_ending_balance_minor FROM bank_reconciliations br
        WHERE br.bank_account_id = ba.id AND br.status = 'completed'
        ORDER BY br.statement_date DESC, br.completed_at DESC LIMIT 1
      ) AS statement_balance_minor,
      (
        SELECT COUNT(*) FROM bank_statement_lines bsl
        WHERE bsl.bank_account_id = ba.id AND bsl.match_status = 'unmatched'
      ) AS unreconciled_count
    FROM bank_accounts ba
    INNER JOIN accounts a ON a.id = ba.ledger_account_id
  `;

export const listBankAccounts = cache((businessId: string, userId: string, includeInactive = true) => {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`${ACCOUNT_SELECT} ${includeInactive ? "" : "WHERE ba.is_active = 1"} ORDER BY ba.is_active DESC, ba.name`).all() as BankAccountRow[];
});

export function getBankAccount(businessId: string, userId: string, bankAccountId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`${ACCOUNT_SELECT} WHERE ba.id = ?`).get(bankAccountId) as BankAccountRow | undefined;
}

export function listBankLedgerOptions(businessId: string, userId: string, currentBankAccountId?: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT a.id, a.name, a.subtype,
      CASE WHEN ba.id IS NULL OR ba.id = ? THEN 1 ELSE 0 END AS available
    FROM accounts a
    LEFT JOIN bank_accounts ba ON ba.ledger_account_id = a.id
    WHERE a.is_active = 1 AND a.type = 'asset' AND a.subtype IN ('bank', 'cash')
    ORDER BY a.name
  `).all(currentBankAccountId ?? "") as {
    id: string; name: string; subtype: "bank" | "cash"; available: number;
  }[];
}

function validateLedger(
  sqlite: ReturnType<typeof getBusinessDb>["sqlite"],
  ledgerAccountId: string,
  isCashAccount: boolean,
  excludeBankAccountId?: string,
) {
  const ledger = sqlite.prepare(`
    SELECT id, subtype FROM accounts
    WHERE id = ? AND is_active = 1 AND type = 'asset' AND subtype IN ('bank', 'cash')
  `).get(ledgerAccountId) as { id: string; subtype: "bank" | "cash" } | undefined;
  if (!ledger) throw new Error("Choose an active Asset ledger account with Bank or Cash subtype.");
  if (isCashAccount !== (ledger.subtype === "cash")) {
    throw new Error(isCashAccount
      ? "A cash account must map to a Cash ledger account."
      : "A bank account must map to a Bank ledger account.");
  }
  const duplicate = sqlite.prepare(`
    SELECT id FROM bank_accounts WHERE ledger_account_id = ?${excludeBankAccountId ? " AND id <> ?" : ""}
  `).get(...(excludeBankAccountId ? [ledgerAccountId, excludeBankAccountId] : [ledgerAccountId]));
  if (duplicate) throw new Error("This ledger account is already mapped to another Bank Account.");
}

export function saveBankAccount(
  businessId: string,
  userId: string,
  input: BankAccountInput,
  bankAccountId?: string,
) {
  assertSavePermission(businessId, userId, "banking", bankAccountId, "draft");
  const data = bankAccountInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const base = getBaseCurrency(context.sqlite);
  if (data.currencyCode !== base.code) getCurrency(context.sqlite, data.currencyCode, true);
  validateLedger(context.sqlite, data.ledgerAccountId, data.isCashAccount, bankAccountId);
  const now = new Date().toISOString();
  const id = bankAccountId ?? randomUUID();
  const current = bankAccountId
    ? context.sqlite.prepare("SELECT id, ledger_account_id, currency_code FROM bank_accounts WHERE id = ?").get(bankAccountId) as { id: string; ledger_account_id: string; currency_code: string } | undefined
    : undefined;
  if (bankAccountId && !current) throw new Error("Bank Account not found.");
  const hasBankingActivity = () => Boolean(bankAccountId && context.sqlite.prepare(`
    SELECT 1 FROM (
      SELECT bank_account_id FROM bank_statement_imports WHERE bank_account_id = ?
      UNION ALL SELECT bank_account_id FROM bank_transactions WHERE bank_account_id = ?
      UNION ALL SELECT from_bank_account_id FROM bank_transfers WHERE from_bank_account_id = ?
      UNION ALL SELECT to_bank_account_id FROM bank_transfers WHERE to_bank_account_id = ?
      UNION ALL SELECT bank_account_id FROM bank_reconciliations WHERE bank_account_id = ?
      UNION ALL SELECT bank_account_id FROM post_dated_cheques WHERE bank_account_id = ?
    ) LIMIT 1
  `).get(bankAccountId, bankAccountId, bankAccountId, bankAccountId, bankAccountId, bankAccountId));
  const ledgerHasEntries = (ledgerId: string) => Boolean(context.sqlite.prepare(
    "SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1",
  ).get(ledgerId));
  if (current && current.currency_code !== data.currencyCode
    && (hasBankingActivity() || ledgerHasEntries(current.ledger_account_id))) {
    throw new Error("The currency cannot change once the Bank Account has transactions.");
  }
  if (data.currencyCode !== base.code) {
    // Every entry on a foreign-currency bank ledger must carry its bank-currency
    // amount, so the account must start from an unused ledger.
    const settings = context.sqlite.prepare(`
      SELECT default_bank_account_id FROM business_accounting_settings WHERE id = 'default'
    `).get() as { default_bank_account_id: string | null } | undefined;
    if (settings?.default_bank_account_id === data.ledgerAccountId) {
      throw new Error(`The default bank ledger must stay in ${base.code}. Map the ${data.currencyCode} account to its own Bank ledger.`);
    }
    const ledgerIsNew = !current || current.ledger_account_id !== data.ledgerAccountId || current.currency_code !== data.currencyCode;
    if (ledgerIsNew && ledgerHasEntries(data.ledgerAccountId)) {
      throw new Error(`A ${data.currencyCode} Bank Account needs a GL account with no existing entries.`);
    }
  }
  if (current) {
    if (current.ledger_account_id !== data.ledgerAccountId && hasBankingActivity()) {
      throw new Error("The mapped GL account cannot change after banking activity exists.");
    }
    context.sqlite.prepare(`
      UPDATE bank_accounts SET name = ?, account_code = ?, bank_name = ?,
        account_number_masked = ?, currency_code = ?, ledger_account_id = ?,
        is_cash_account = ?, is_active = ?, updated_at = ? WHERE id = ?
    `).run(data.name, data.accountCode || null, data.isCashAccount ? null : data.bankName || null,
      data.isCashAccount ? null : data.accountNumberMasked || null, data.currencyCode, data.ledgerAccountId,
      data.isCashAccount ? 1 : 0, data.isActive ? 1 : 0, now, bankAccountId);
  } else {
    context.sqlite.prepare(`
      INSERT INTO bank_accounts (
        id, name, account_code, bank_name, account_number_masked, currency_code,
        ledger_account_id, is_cash_account, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.accountCode || null, data.isCashAccount ? null : data.bankName || null,
      data.isCashAccount ? null : data.accountNumberMasked || null, data.currencyCode, data.ledgerAccountId,
      data.isCashAccount ? 1 : 0, data.isActive ? 1 : 0, now, now);
  }
  return id;
}

export function bankAccountToInput(account: BankAccountRow): BankAccountInput {
  return {
    name: account.name,
    accountCode: account.account_code ?? "",
    bankName: account.bank_name ?? "",
    accountNumberMasked: account.account_number_masked ?? "",
    currencyCode: account.currency_code,
    ledgerAccountId: account.ledger_account_id,
    isCashAccount: Boolean(account.is_cash_account),
    isActive: Boolean(account.is_active),
  };
}

export function ensureDefaultDemoBankAccounts(businessId: string, userId: string) {
  assertMutationPermission(businessId, userId, "banking", "create");
  const context = getBusinessDb(businessId, userId);
  const existing = listBankAccounts(businessId, userId);
  const settings = context.sqlite.prepare(`
    SELECT default_bank_account_id FROM business_accounting_settings WHERE id = 'default'
  `).get() as { default_bank_account_id: string };
  let mainBank = existing.find((account) => account.ledger_account_id === settings.default_bank_account_id);
  if (!mainBank) {
    const id = saveBankAccount(businessId, userId, {
      name: "Main Bank", accountCode: "MAIN", bankName: "Emirates NBD",
      accountNumberMasked: "•••• 1010", currencyCode: context.business.currency,
      ledgerAccountId: settings.default_bank_account_id, isCashAccount: false, isActive: true,
    });
    mainBank = getBankAccount(businessId, userId, id);
  }
  const cashLedger = context.sqlite.prepare(`
    SELECT id FROM accounts WHERE subtype = 'cash' AND is_active = 1
      AND id NOT IN (SELECT ledger_account_id FROM bank_accounts) ORDER BY name LIMIT 1
  `).get() as { id: string } | undefined;
  if (cashLedger) {
    saveBankAccount(businessId, userId, {
      name: "Petty Cash", accountCode: "CASH", bankName: "",
      accountNumberMasked: "", currencyCode: context.business.currency,
      ledgerAccountId: cashLedger.id, isCashAccount: true, isActive: true,
    });
  }
  return mainBank;
}
