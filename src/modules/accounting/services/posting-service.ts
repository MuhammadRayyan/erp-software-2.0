import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { addMinor } from "../calculations/money";
import { allocateNumber } from "./numbering-service";
import { assertFinancialLock } from "./financial-lock-service";

export type JournalLineInput = {
  accountId: string;
  description: string;
  debitMinor?: number;
  creditMinor?: number;
  customerId?: string | null;
  supplierId?: string | null;
  projectId?: string | null;
  reference?: string | null;
  /**
   * Signed (debit-positive) amount in the account's own currency. Required on
   * every line that posts to a foreign-currency bank ledger and ignored
   * elsewhere: the bank register and reconciliation read it, the GL stays in base.
   */
  currencyAmountMinor?: number | null;
};

type PostTransactionInput = {
  sourceType: string;
  sourceId: string;
  date: string;
  description: string;
  lines: JournalLineInput[];
  replace?: boolean;
};

function validateLines(sqlite: Database.Database, lines: JournalLineInput[]) {
  if (lines.length < 2) throw new Error("A journal entry needs at least two lines.");
  const accountIds = [...new Set(lines.map((line) => line.accountId))];
  const placeholders = accountIds.map(() => "?").join(", ");
  const activeAccounts = sqlite
    .prepare(`SELECT id FROM accounts WHERE is_active = 1 AND id IN (${placeholders})`)
    .all(...accountIds) as { id: string }[];
  if (activeAccounts.length !== accountIds.length) {
    throw new Error("A journal account is missing or inactive. Review the accounting settings.");
  }
  const projectIds = [...new Set(lines.flatMap((line) => line.projectId ? [line.projectId] : []))];
  if (projectIds.length > 0) {
    const projectPlaceholders = projectIds.map(() => "?").join(", ");
    const validProjects = sqlite
      .prepare(`SELECT id FROM projects WHERE id IN (${projectPlaceholders})`)
      .all(...projectIds) as { id: string }[];
    if (validProjects.length !== projectIds.length) throw new Error("A journal project could not be found.");
  }

  for (const line of lines) {
    const debit = line.debitMinor ?? 0;
    const credit = line.creditMinor ?? 0;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0) {
      throw new Error("Journal amounts must be valid non-negative minor-unit values.");
    }
    if ((debit > 0) === (credit > 0)) {
      throw new Error("Each journal line must contain either a debit or a credit, not both.");
    }
  }

  validateForeignBankLines(sqlite, lines, accountIds);

  const debitTotal = addMinor(lines.map((line) => line.debitMinor ?? 0));
  const creditTotal = addMinor(lines.map((line) => line.creditMinor ?? 0));
  if (debitTotal !== creditTotal) throw new Error("Journal entry is not balanced.");
  if (debitTotal <= 0) throw new Error("Journal entry total must be greater than zero.");
}

/** Ledger account id → currency for every bank account kept in a foreign currency. */
export function foreignBankLedgers(sqlite: Database.Database, accountIds?: readonly string[]) {
  const ids = accountIds ? [...new Set(accountIds)] : null;
  if (ids && ids.length === 0) return new Map<string, string>();
  const rows = sqlite.prepare(`
    SELECT ba.ledger_account_id, ba.currency_code FROM bank_accounts ba
    WHERE ba.currency_code <> (SELECT base_currency_code FROM business_currency_settings WHERE id = 'default')
      ${ids ? `AND ba.ledger_account_id IN (${ids.map(() => "?").join(", ")})` : ""}
  `).all(...(ids ?? [])) as { ledger_account_id: string; currency_code: string }[];
  return new Map(rows.map((row) => [row.ledger_account_id, row.currency_code]));
}

function validateForeignBankLines(sqlite: Database.Database, lines: JournalLineInput[], accountIds: string[]) {
  const foreign = foreignBankLedgers(sqlite, accountIds);
  for (const line of lines) {
    const currency = foreign.get(line.accountId);
    if (!currency) continue;
    const amount = line.currencyAmountMinor;
    if (amount === undefined || amount === null) {
      throw new Error(`This ${currency} bank account can only be posted through Banking, Receipts or Supplier Payments in ${currency}.`);
    }
    if (!Number.isSafeInteger(amount)) throw new Error("Bank currency amount is invalid.");
    const direction = (line.debitMinor ?? 0) > 0 ? 1 : -1;
    if (amount !== 0 && Math.sign(amount) !== direction) {
      throw new Error("Bank currency amount must move in the same direction as the ledger line.");
    }
  }
}

/**
 * The bank line of a receipt or supplier payment in the bank account's own
 * currency: the settlement amount itself when the bank is kept in a foreign
 * currency (which must then be the settlement currency), otherwise null.
 */
export function settlementBankCurrencyAmount(
  sqlite: Database.Database,
  table: "receipts" | "supplier_payments",
  settlementId: string,
  bankLedgerAccountId: string,
  sign: 1 | -1,
) {
  const bankCurrency = foreignBankLedgers(sqlite, [bankLedgerAccountId]).get(bankLedgerAccountId);
  if (!bankCurrency) return null;
  const row = sqlite.prepare(`SELECT amount_minor, currency_code FROM ${table} WHERE id = ?`)
    .get(settlementId) as { amount_minor: number; currency_code: string } | undefined;
  if (!row) throw new Error("Settlement record not found.");
  if (row.currency_code !== bankCurrency) {
    throw new Error(`A ${bankCurrency} bank account can only settle ${bankCurrency} documents.`);
  }
  return sign * row.amount_minor;
}

export function postTransaction(sqlite: Database.Database, input: PostTransactionInput) {
  const execute = () => {
    assertFinancialLock(sqlite, input.date, "Transactions");
    validateLines(sqlite, input.lines);
    const existing = sqlite
      .prepare(
        "SELECT id, entry_number FROM journal_entries WHERE source_type = ? AND source_id = ?",
      )
      .get(input.sourceType, input.sourceId) as { id: string; entry_number: string } | undefined;
    if (existing && !input.replace) throw new Error("This transaction has already been posted.");

    const now = new Date().toISOString();
    const journalEntryId = existing?.id ?? randomUUID();
    const entryNumber = existing?.entry_number ?? allocateNumber(sqlite, "journal");
    if (existing) {
      sqlite.prepare("DELETE FROM journal_lines WHERE journal_entry_id = ?").run(journalEntryId);
      sqlite
        .prepare(`
          UPDATE journal_entries
          SET date = ?, description = ?, status = 'posted', posted_at = ?
          WHERE id = ?
        `)
        .run(input.date, input.description, now, journalEntryId);
    } else {
      sqlite
        .prepare(`
          INSERT INTO journal_entries (
            id, entry_number, date, source_type, source_id, description, status, created_at, posted_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?)
        `)
        .run(
          journalEntryId,
          entryNumber,
          input.date,
          input.sourceType,
          input.sourceId,
          input.description,
          now,
          now,
        );
    }

    const insertLine = sqlite.prepare(`
      INSERT INTO journal_lines (
        id, journal_entry_id, account_id, description, debit_minor, credit_minor,
        customer_id, supplier_id, project_id, reference, position, currency_amount_minor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    input.lines.forEach((line, position) => {
      insertLine.run(
        randomUUID(),
        journalEntryId,
        line.accountId,
        line.description,
        line.debitMinor ?? 0,
        line.creditMinor ?? 0,
        line.customerId ?? null,
        line.supplierId ?? null,
        line.projectId ?? null,
        line.reference ?? null,
        position,
        line.currencyAmountMinor ?? null,
      );
    });
    return { id: journalEntryId, entryNumber };
  };

  if (sqlite.inTransaction) {
    return execute();
  }
  return sqlite.transaction(execute)();
}

export function reverseTransaction(
  sqlite: Database.Database,
  input: {
    originalSourceType: string;
    originalSourceId: string;
    reversalSourceType: string;
    reversalSourceId: string;
    date: string;
    description: string;
  },
) {
  const original = sqlite
    .prepare("SELECT id, date FROM journal_entries WHERE source_type = ? AND source_id = ?")
    .get(input.originalSourceType, input.originalSourceId) as { id: string; date: string } | undefined;
  if (!original) throw new Error("The original journal entry could not be found.");
  // A reversal never predates what it reverses: voiding a future-dated document
  // reverses it on its own date, so both land in the same period.
  const reversalDate = input.date < original.date ? original.date : input.date;
  const lines = sqlite
    .prepare(`
      SELECT account_id, description, debit_minor, credit_minor, customer_id, supplier_id,
             project_id, reference, currency_amount_minor
      FROM journal_lines WHERE journal_entry_id = ? ORDER BY position
    `)
    .all(original.id) as {
      account_id: string;
      description: string;
      debit_minor: number;
      credit_minor: number;
      customer_id: string | null;
      supplier_id: string | null;
      project_id: string | null;
      reference: string | null;
      currency_amount_minor: number | null;
    }[];
  return postTransaction(sqlite, {
    sourceType: input.reversalSourceType,
    sourceId: input.reversalSourceId,
    date: reversalDate,
    description: input.description,
    lines: lines.map((line) => ({
      accountId: line.account_id,
      description: `Reversal: ${line.description}`,
      debitMinor: line.credit_minor,
      creditMinor: line.debit_minor,
      customerId: line.customer_id,
      supplierId: line.supplier_id,
      projectId: line.project_id,
      reference: line.reference,
      currencyAmountMinor: line.currency_amount_minor === null ? null : -line.currency_amount_minor,
    })),
  });
}
