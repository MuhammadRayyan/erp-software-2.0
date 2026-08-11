import { getBusinessDb } from "@/core/db/business";

export type BankHistoryFilters = {
  dateFrom?: string; dateTo?: string; sourceType?: string; reconciled?: "yes" | "no";
};

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function getBankTransactionHistory(
  businessId: string,
  userId: string,
  bankAccountId: string,
  filters: BankHistoryFilters = {},
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const bank = sqlite.prepare("SELECT ledger_account_id FROM bank_accounts WHERE id = ?")
    .get(bankAccountId) as { ledger_account_id: string } | undefined;
  if (!bank) throw new Error("Bank Account not found.");
  const conditions = ["je.status = 'posted'", "jl.account_id = ?"];
  const values: (string | number)[] = [bank.ledger_account_id];
  const dateFrom = validDate(filters.dateFrom);
  const dateTo = validDate(filters.dateTo);
  if (dateFrom) { conditions.push("je.date >= ?"); values.push(dateFrom); }
  if (dateTo) { conditions.push("je.date <= ?"); values.push(dateTo); }
  if (filters.sourceType) { conditions.push("je.source_type = ?"); values.push(filters.sourceType); }
  if (filters.reconciled === "yes") conditions.push(`EXISTS (
    SELECT 1 FROM bank_reconciliation_items bri INNER JOIN bank_reconciliations br
      ON br.id = bri.reconciliation_id AND br.status = 'completed'
    INNER JOIN bank_statement_lines reconciled_line ON reconciled_line.id = bri.statement_line_id
    WHERE bri.journal_entry_id = je.id AND reconciled_line.bank_account_id = ?
  )`);
  if (filters.reconciled === "yes") values.push(bankAccountId);
  if (filters.reconciled === "no") conditions.push(`NOT EXISTS (
    SELECT 1 FROM bank_reconciliation_items bri INNER JOIN bank_reconciliations br
      ON br.id = bri.reconciliation_id AND br.status = 'completed'
    INNER JOIN bank_statement_lines reconciled_line ON reconciled_line.id = bri.statement_line_id
    WHERE bri.journal_entry_id = je.id AND reconciled_line.bank_account_id = ?
  )`);
  if (filters.reconciled === "no") values.push(bankAccountId);
  const opening = dateFrom ? (sqlite.prepare(`
    SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance_minor
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.status = 'posted' AND jl.account_id = ? AND je.date < ?
  `).get(bank.ledger_account_id, dateFrom) as { balance_minor: number }).balance_minor : 0;
  const rows = sqlite.prepare(`
    SELECT je.id AS journal_entry_id, je.entry_number, je.date, je.source_type,
      je.source_id, je.description, jl.reference,
      SUM(jl.debit_minor) AS money_in_minor, SUM(jl.credit_minor) AS money_out_minor,
      CASE WHEN EXISTS (
        SELECT 1 FROM bank_reconciliation_items bri INNER JOIN bank_reconciliations br
          ON br.id = bri.reconciliation_id AND br.status = 'completed'
        INNER JOIN bank_statement_lines reconciled_line ON reconciled_line.id = bri.statement_line_id
        WHERE bri.journal_entry_id = je.id AND reconciled_line.bank_account_id = ?
      ) THEN 1 ELSE 0 END AS reconciled
    FROM journal_entries je INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
    WHERE ${conditions.join(" AND ")}
    GROUP BY je.id ORDER BY je.date, je.entry_number
  `).all(bankAccountId, ...values) as {
    journal_entry_id: string; entry_number: string; date: string; source_type: string;
    source_id: string; description: string; reference: string | null;
    money_in_minor: number; money_out_minor: number; reconciled: number;
  }[];
  let running = opening;
  return rows.map((row) => {
    running += row.money_in_minor - row.money_out_minor;
    return { ...row, opening_balance_minor: opening, balance_minor: running };
  });
}

export function getAllBankTransactionsReport(
  businessId: string,
  userId: string,
  filters: BankHistoryFilters & { bankAccountId?: string },
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const accounts = filters.bankAccountId
    ? [filters.bankAccountId]
    : (sqlite.prepare("SELECT id FROM bank_accounts ORDER BY name").all() as { id: string }[]).map((row) => row.id);
  return accounts.flatMap((accountId) => {
    const account = sqlite.prepare("SELECT name FROM bank_accounts WHERE id = ?").get(accountId) as { name: string } | undefined;
    return getBankTransactionHistory(businessId, userId, accountId, filters)
      .map((row) => ({ ...row, bank_account_id: accountId, bank_account_name: account?.name ?? "" }));
  }).sort((a, b) => b.date.localeCompare(a.date) || b.entry_number.localeCompare(a.entry_number));
}

export function getReconciliationSummary(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT ba.id, ba.name, ba.currency_code,
      br.statement_date AS last_reconciled_date,
      br.statement_ending_balance_minor AS statement_balance_minor,
      COALESCE((
        SELECT SUM(jl.debit_minor - jl.credit_minor)
        FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.account_id = ba.ledger_account_id AND je.status = 'posted'
          AND je.date <= COALESCE(br.statement_date, '9999-12-31')
      ), 0) AS book_balance_minor,
      (SELECT COUNT(*) FROM bank_statement_lines bsl
        WHERE bsl.bank_account_id = ba.id AND bsl.match_status = 'unmatched') AS outstanding_count
    FROM bank_accounts ba
    LEFT JOIN bank_reconciliations br ON br.id = (
      SELECT latest.id FROM bank_reconciliations latest
      WHERE latest.bank_account_id = ba.id AND latest.status = 'completed'
      ORDER BY latest.statement_date DESC, latest.completed_at DESC LIMIT 1
    )
    ORDER BY ba.is_active DESC, ba.name
  `).all() as {
    id: string; name: string; currency_code: string; last_reconciled_date: string | null;
    statement_balance_minor: number | null; book_balance_minor: number; outstanding_count: number;
  }[];
}

export function getSourceBankingStatus(
  businessId: string,
  userId: string,
  sourceType: "receipt" | "supplier_payment",
  sourceId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const sourceTable = sourceType === "receipt" ? "receipts" : "supplier_payments";
  const idColumn = sourceType === "receipt" ? "r.id" : "r.id";
  return sqlite.prepare(`
    SELECT ba.id AS bank_account_id, ba.name AS bank_account_name,
      bsl.id AS statement_line_id, bsl.transaction_date AS statement_date,
      CASE WHEN EXISTS (
        SELECT 1 FROM bank_reconciliation_items bri INNER JOIN bank_reconciliations br
          ON br.id = bri.reconciliation_id AND br.status = 'completed'
        WHERE bri.statement_line_id = bsl.id
      ) THEN 1 ELSE 0 END AS reconciled
    FROM ${sourceTable} r
    LEFT JOIN bank_accounts ba ON ba.ledger_account_id = r.bank_account_id
    LEFT JOIN bank_statement_lines bsl ON bsl.matched_source_type = ?
      AND bsl.matched_source_id = ${idColumn} AND bsl.bank_account_id = ba.id
    WHERE r.id = ?
  `).get(sourceType, sourceId) as {
    bank_account_id: string | null; bank_account_name: string | null;
    statement_line_id: string | null; statement_date: string | null; reconciled: number;
  } | undefined;
}
