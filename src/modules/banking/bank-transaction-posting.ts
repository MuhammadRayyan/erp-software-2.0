import type Database from "better-sqlite3";
import { postTransaction, type JournalLineInput } from "@/modules/accounting/services/posting-service";
import { convertDocumentLinesToBase } from "@/modules/currency/conversion";
import { storedRateSnapshot, type RateSnapshot } from "@/modules/currency/validation";
import { getBaseCurrency } from "@/modules/currency/currency";

type PostingLine = {
  accountId: string;
  taxCodeId: string;
  projectId: string | null;
  description: string;
  netAmountMinor: number;
  taxAmountMinor: number;
};

/**
 * Rate snapshot stored on a bank transaction kept in a foreign-currency bank
 * account, or null for a base-currency account (amounts are already base).
 */
export function bankTransactionRate(sqlite: Database.Database, transactionId: string): RateSnapshot | null {
  const row = sqlite.prepare(`
    SELECT ba.currency_code, bt.exchange_rate_to_base, bt.exchange_rate_date, bt.exchange_rate_source, bt.date
    FROM bank_transactions bt INNER JOIN bank_accounts ba ON ba.id = bt.bank_account_id
    WHERE bt.id = ?
  `).get(transactionId) as {
    currency_code: string; exchange_rate_to_base: string; exchange_rate_date: string | null;
    exchange_rate_source: string; date: string;
  } | undefined;
  if (!row || row.currency_code === getBaseCurrency(sqlite).code) return null;
  return storedRateSnapshot(sqlite, {
    currencyCode: row.currency_code,
    exchangeRateToBase: row.exchange_rate_to_base,
    exchangeRateDate: row.exchange_rate_date ?? row.date,
    exchangeRateSource: row.exchange_rate_source,
  });
}

/**
 * Posts a bank transaction. Amounts are in the bank account's currency; for a
 * foreign-currency account each line is converted at the transaction's stored
 * rate, the bank line carries the base total plus the bank-currency amount,
 * and the transaction's base_total_minor is kept in step with the journal.
 */
export function postBankTransaction(
  sqlite: Database.Database,
  transaction: {
    id: string;
    transactionNumber: string;
    bankLedgerAccountId: string;
    date: string;
    type: "money_in" | "money_out";
    totalMinor: number;
    description: string;
  },
  lines: PostingLine[],
  replace = false,
) {
  const taxRows = sqlite.prepare(`
    SELECT id, sales_tax_account_id, purchase_tax_account_id, is_recoverable
    FROM tax_codes WHERE id IN (${lines.map(() => "?").join(", ")})
  `).all(...lines.map((line) => line.taxCodeId)) as {
    id: string; sales_tax_account_id: string | null; purchase_tax_account_id: string | null; is_recoverable: number;
  }[];
  const taxById = new Map(taxRows.map((row) => [row.id, row]));

  const rate = bankTransactionRate(sqlite, transaction.id);
  const converted = rate
    ? convertDocumentLinesToBase(lines.map((line) => ({
      ...line,
      grossAmountMinor: line.netAmountMinor + line.taxAmountMinor,
    })), rate)
    : null;
  const baseLines = converted
    ? converted.lines.map((line) => ({ ...line, netAmountMinor: line.baseNetAmountMinor, taxAmountMinor: line.baseTaxAmountMinor }))
    : lines;
  const baseTotalMinor = converted ? converted.baseTotalMinor : transaction.totalMinor;
  if (converted) {
    if (baseTotalMinor <= 0) throw new Error("The base-currency equivalent of this transaction is zero.");
    sqlite.prepare("UPDATE bank_transactions SET base_total_minor = ? WHERE id = ?").run(baseTotalMinor, transaction.id);
  }
  const bankCurrencyAmount = rate ? transaction.totalMinor : null;

  const journalLines: JournalLineInput[] = [];
  if (transaction.type === "money_in") {
    journalLines.push({
      accountId: transaction.bankLedgerAccountId,
      description: transaction.description,
      debitMinor: baseTotalMinor,
      reference: transaction.transactionNumber,
      currencyAmountMinor: bankCurrencyAmount,
    });
    for (const line of baseLines) {
      journalLines.push({
        accountId: line.accountId,
        description: line.description,
        creditMinor: line.netAmountMinor,
        projectId: line.projectId,
        reference: transaction.transactionNumber,
      });
      if (line.taxAmountMinor > 0) {
        const taxAccountId = taxById.get(line.taxCodeId)?.sales_tax_account_id;
        if (!taxAccountId) throw new Error("Output VAT account is not configured for the selected tax code.");
        journalLines.push({
          accountId: taxAccountId,
          description: `${line.description} · Output VAT`,
          creditMinor: line.taxAmountMinor,
          reference: transaction.transactionNumber,
        });
      }
    }
  } else {
    for (const line of baseLines) {
      const taxCode = taxById.get(line.taxCodeId);
      journalLines.push({
        accountId: line.accountId,
        description: line.description,
        debitMinor: line.netAmountMinor + (taxCode?.is_recoverable ? 0 : line.taxAmountMinor),
        projectId: line.projectId,
        reference: transaction.transactionNumber,
      });
      if (line.taxAmountMinor > 0 && taxCode?.is_recoverable) {
        const taxAccountId = taxCode.purchase_tax_account_id;
        if (!taxAccountId) throw new Error("Input VAT account is not configured for the selected tax code.");
        journalLines.push({
          accountId: taxAccountId,
          description: `${line.description} · Input VAT`,
          debitMinor: line.taxAmountMinor,
          reference: transaction.transactionNumber,
        });
      }
    }
    journalLines.push({
      accountId: transaction.bankLedgerAccountId,
      description: transaction.description,
      creditMinor: baseTotalMinor,
      reference: transaction.transactionNumber,
      currencyAmountMinor: bankCurrencyAmount === null ? null : -bankCurrencyAmount,
    });
  }
  return postTransaction(sqlite, {
    sourceType: "bank_transaction",
    sourceId: transaction.id,
    date: transaction.date,
    description: `Bank Transaction ${transaction.transactionNumber}`,
    lines: journalLines,
    replace,
  });
}
