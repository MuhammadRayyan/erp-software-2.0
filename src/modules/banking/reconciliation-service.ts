import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { parseMoneyToMinor } from "@/modules/accounting/calculations/money";
import { reconciliationInputSchema, type ReconciliationInput } from "./reconciliation-input";

function parseSignedMoney(value: string) {
  const sign = value.trim().startsWith("-") ? -1 : 1;
  return sign * parseMoneyToMinor(value.trim().replace(/^-/, ""), "Statement ending balance");
}

export function startReconciliation(
  businessId: string,
  userId: string,
  bankAccountId: string,
  input: ReconciliationInput,
) {
  const data = reconciliationInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const account = sqlite.prepare("SELECT id, is_cash_account FROM bank_accounts WHERE id = ? AND is_active = 1")
    .get(bankAccountId) as { id: string; is_cash_account: number } | undefined;
  if (!account) throw new Error("Bank Account not found or inactive.");
  if (account.is_cash_account) throw new Error("Statement reconciliation is not available for Cash accounts.");
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO bank_reconciliations (
      id, bank_account_id, statement_date, statement_ending_balance_minor,
      status, created_by, created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, NULL)
  `).run(id, bankAccountId, data.statementDate, parseSignedMoney(data.statementEndingBalance),
    userId, now, now);
  return id;
}

export type ReconciliationSnapshot = {
  reconciliation: {
    id: string; bank_account_id: string; statement_date: string;
    statement_ending_balance_minor: number; status: "draft" | "completed";
    created_at: string; completed_at: string | null; bank_account_name: string;
    ledger_account_id: string;
  };
  bookBalanceMinor: number;
  outstandingNetMinor: number;
  clearedBookBalanceMinor: number;
  differenceMinor: number;
  cleared: {
    statement_line_id: string; transaction_date: string; description: string;
    amount_minor: number; match_status: string; matched_source_type: string;
    matched_source_id: string; entry_number: string; journal_entry_id: string;
  }[];
  outstanding: {
    journal_entry_id: string; entry_number: string; date: string; source_type: string;
    source_id: string; description: string; amount_minor: number;
  }[];
  unmatched: {
    id: string; transaction_date: string; description: string; reference: string | null;
    amount_minor: number; match_status: string;
  }[];
};

function reconciliationRow(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], reconciliationId: string, bankAccountId?: string) {
  return sqlite.prepare(`
    SELECT br.*, ba.name AS bank_account_name, ba.ledger_account_id
    FROM bank_reconciliations br
    INNER JOIN bank_accounts ba ON ba.id = br.bank_account_id
    WHERE br.id = ?${bankAccountId ? " AND br.bank_account_id = ?" : ""}
  `).get(...(bankAccountId ? [reconciliationId, bankAccountId] : [reconciliationId])) as ReconciliationSnapshot["reconciliation"] | undefined;
}

export function getReconciliationSnapshot(
  businessId: string,
  userId: string,
  reconciliationId: string,
  bankAccountId?: string,
): ReconciliationSnapshot | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const reconciliation = reconciliationRow(sqlite, reconciliationId, bankAccountId);
  if (!reconciliation) return null;
  const book = sqlite.prepare(`
    SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance_minor
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
    WHERE jl.account_id = ? AND je.date <= ?
  `).get(reconciliation.ledger_account_id, reconciliation.statement_date) as { balance_minor: number };
  const cleared = sqlite.prepare(`
    SELECT bsl.id AS statement_line_id, bsl.transaction_date, bsl.description,
      bsl.amount_minor, bsl.match_status, bsl.matched_source_type,
      bsl.matched_source_id, je.entry_number, je.id AS journal_entry_id
    FROM bank_statement_lines bsl
    INNER JOIN journal_entries je
      ON je.source_type = bsl.matched_source_type AND je.source_id = bsl.matched_source_id
    WHERE bsl.bank_account_id = ? AND bsl.transaction_date <= ?
      AND bsl.match_status IN ('matched', 'created')
    ORDER BY bsl.transaction_date, bsl.created_at
  `).all(reconciliation.bank_account_id, reconciliation.statement_date) as ReconciliationSnapshot["cleared"];
  const outstanding = sqlite.prepare(`
    SELECT je.id AS journal_entry_id, je.entry_number, je.date, je.source_type,
      je.source_id, je.description, SUM(jl.debit_minor - jl.credit_minor) AS amount_minor
    FROM journal_entries je
    INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.status = 'posted' AND je.date <= ? AND jl.account_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement_lines bsl
        WHERE bsl.bank_account_id = ? AND bsl.match_status IN ('matched', 'created')
          AND bsl.matched_source_type = je.source_type AND bsl.matched_source_id = je.source_id
      )
    GROUP BY je.id
    HAVING amount_minor <> 0
    ORDER BY je.date, je.entry_number
  `).all(reconciliation.statement_date, reconciliation.ledger_account_id,
    reconciliation.bank_account_id) as ReconciliationSnapshot["outstanding"];
  const unmatched = sqlite.prepare(`
    SELECT id, transaction_date, description, reference, amount_minor, match_status
    FROM bank_statement_lines WHERE bank_account_id = ? AND transaction_date <= ?
      AND match_status = 'unmatched'
    ORDER BY transaction_date, created_at
  `).all(reconciliation.bank_account_id, reconciliation.statement_date) as ReconciliationSnapshot["unmatched"];
  const outstandingNetMinor = outstanding.reduce((sum, row) => sum + row.amount_minor, 0);
  const clearedBookBalanceMinor = book.balance_minor - outstandingNetMinor;
  return {
    reconciliation,
    bookBalanceMinor: book.balance_minor,
    outstandingNetMinor,
    clearedBookBalanceMinor,
    differenceMinor: reconciliation.statement_ending_balance_minor - clearedBookBalanceMinor,
    cleared, outstanding, unmatched,
  };
}

export function completeReconciliation(
  businessId: string,
  userId: string,
  bankAccountId: string,
  reconciliationId: string,
) {
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    const snapshot = getReconciliationSnapshot(businessId, userId, reconciliationId, bankAccountId);
    if (!snapshot) throw new Error("Reconciliation not found.");
    if (snapshot.reconciliation.status !== "draft") throw new Error("Only a draft reconciliation can be completed.");
    if (snapshot.differenceMinor !== 0) throw new Error("Reconciliation can only be completed when Difference is zero.");
    const now = new Date().toISOString();
    const insert = context.sqlite.prepare(`
      INSERT OR IGNORE INTO bank_reconciliation_items (
        id, reconciliation_id, statement_line_id, journal_entry_id, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const line of snapshot.cleared) {
      insert.run(randomUUID(), reconciliationId, line.statement_line_id, line.journal_entry_id, now);
    }
    context.sqlite.prepare(`
      UPDATE bank_reconciliations SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'draft'
    `).run(now, now, reconciliationId);
  }).immediate();
}

export function listReconciliations(businessId: string, userId: string, bankAccountId: string) {
  return getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT br.*, COUNT(bri.id) AS item_count
    FROM bank_reconciliations br
    LEFT JOIN bank_reconciliation_items bri ON bri.reconciliation_id = br.id
    WHERE br.bank_account_id = ?
    GROUP BY br.id ORDER BY br.statement_date DESC, br.created_at DESC
  `).all(bankAccountId) as {
    id: string; statement_date: string; statement_ending_balance_minor: number;
    status: "draft" | "completed"; created_at: string; completed_at: string | null; item_count: number;
  }[];
}
