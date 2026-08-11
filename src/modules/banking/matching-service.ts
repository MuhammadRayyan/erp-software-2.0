import { getBusinessDb } from "@/core/db/business";
import type { MatchCandidate, MatchSourceType } from "./matching-types";

function movementSql() {
  return `
    SELECT 'receipt' AS source_type, r.id AS source_id, r.receipt_number AS source_number,
      r.date, r.amount_minor AS amount_minor, c.name AS party, r.description,
      r.reference, je.id AS journal_entry_id, ba.id AS bank_account_id
    FROM receipts r
    INNER JOIN customers c ON c.id = r.customer_id
    INNER JOIN bank_accounts ba ON ba.ledger_account_id = r.bank_account_id
    INNER JOIN journal_entries je ON je.source_type = 'receipt' AND je.source_id = r.id
    WHERE r.document_status = 'posted'
    UNION ALL
    SELECT 'supplier_payment', sp.id, sp.payment_number, sp.date, -sp.amount_minor,
      s.name, sp.description, sp.reference, je.id, ba.id
    FROM supplier_payments sp
    INNER JOIN suppliers s ON s.id = sp.supplier_id
    INNER JOIN bank_accounts ba ON ba.ledger_account_id = sp.bank_account_id
    INNER JOIN journal_entries je ON je.source_type = 'supplier_payment' AND je.source_id = sp.id
    WHERE sp.document_status = 'posted'
    UNION ALL
    SELECT 'bank_transaction', bt.id, bt.transaction_number, bt.date,
      CASE bt.type WHEN 'money_in' THEN bt.total_minor ELSE -bt.total_minor END,
      NULL, bt.description, bt.reference, je.id, bt.bank_account_id
    FROM bank_transactions bt
    INNER JOIN journal_entries je ON je.source_type = 'bank_transaction' AND je.source_id = bt.id
    WHERE bt.document_status = 'posted'
    UNION ALL
    SELECT 'bank_transfer', bt.id, bt.transfer_number, bt.date, -bt.amount_minor,
      destination.name, bt.description, bt.reference, je.id, bt.from_bank_account_id
    FROM bank_transfers bt
    INNER JOIN bank_accounts destination ON destination.id = bt.to_bank_account_id
    INNER JOIN journal_entries je ON je.source_type = 'bank_transfer' AND je.source_id = bt.id
    WHERE bt.document_status = 'posted'
    UNION ALL
    SELECT 'bank_transfer', bt.id, bt.transfer_number, bt.date, bt.amount_minor,
      source.name, bt.description, bt.reference, je.id, bt.to_bank_account_id
    FROM bank_transfers bt
    INNER JOIN bank_accounts source ON source.id = bt.from_bank_account_id
    INNER JOIN journal_entries je ON je.source_type = 'bank_transfer' AND je.source_id = bt.id
    WHERE bt.document_status = 'posted'
  `;
}

function getMovement(
  sqlite: ReturnType<typeof getBusinessDb>["sqlite"],
  sourceType: string,
  sourceId: string,
  bankAccountId: string,
) {
  return sqlite.prepare(`
    SELECT * FROM (${movementSql()}) movements
    WHERE source_type = ? AND source_id = ? AND bank_account_id = ?
  `).get(sourceType, sourceId, bankAccountId) as {
    source_type: MatchSourceType; source_id: string; source_number: string; date: string;
    amount_minor: number; party: string | null; description: string | null;
    reference: string | null; journal_entry_id: string; bank_account_id: string;
  } | undefined;
}

export function suggestMatches(businessId: string, userId: string, statementLineId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const line = sqlite.prepare(`
    SELECT id, bank_account_id, transaction_date, amount_minor, reference, description, match_status
    FROM bank_statement_lines WHERE id = ?
  `).get(statementLineId) as {
    id: string; bank_account_id: string; transaction_date: string; amount_minor: number;
    reference: string | null; description: string; match_status: string;
  } | undefined;
  if (!line || line.match_status !== "unmatched") return [];
  const rows = sqlite.prepare(`
    SELECT movements.*,
      ABS(julianday(movements.date) - julianday(?)) AS date_distance,
      CASE WHEN ? <> '' AND lower(COALESCE(movements.reference, '')) = lower(?) THEN 1 ELSE 0 END AS reference_match
    FROM (${movementSql()}) movements
    WHERE movements.bank_account_id = ? AND movements.amount_minor = ?
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement_lines existing
        WHERE existing.id <> ? AND existing.match_status IN ('matched', 'created')
          AND existing.matched_source_type = movements.source_type
          AND existing.matched_source_id = movements.source_id
          AND (movements.source_type <> 'bank_transfer' OR existing.bank_account_id = movements.bank_account_id)
      )
    ORDER BY reference_match DESC, date_distance ASC, movements.date DESC
    LIMIT 12
  `).all(line.transaction_date, line.reference ?? "", line.reference ?? "", line.bank_account_id,
    line.amount_minor, line.id) as {
    source_type: MatchSourceType; source_id: string; source_number: string; date: string;
    amount_minor: number; party: string | null; description: string | null;
    reference: string | null; journal_entry_id: string; date_distance: number; reference_match: number;
  }[];
  return rows.map((row): MatchCandidate => ({
    sourceType: row.source_type, sourceId: row.source_id, sourceNumber: row.source_number,
    date: row.date, amountMinor: row.amount_minor, party: row.party,
    description: row.description, reference: row.reference, journalEntryId: row.journal_entry_id,
    dateDistance: row.date_distance, referenceMatch: Boolean(row.reference_match),
  }));
}

export function confirmStatementMatch(
  businessId: string,
  userId: string,
  statementLineId: string,
  sourceType: MatchSourceType,
  sourceId: string,
) {
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    const line = context.sqlite.prepare(`
      SELECT bank_account_id, amount_minor, match_status FROM bank_statement_lines WHERE id = ?
    `).get(statementLineId) as { bank_account_id: string; amount_minor: number; match_status: string } | undefined;
    if (!line) throw new Error("Statement line not found.");
    if (line.match_status !== "unmatched") throw new Error("Statement line is no longer unmatched.");
    const movement = getMovement(context.sqlite, sourceType, sourceId, line.bank_account_id);
    if (!movement) throw new Error("The selected transaction no longer exists, is void, or uses another Bank Account.");
    if (movement.amount_minor !== line.amount_minor) throw new Error("The selected transaction amount or direction does not match this statement line.");
    const incompatible = context.sqlite.prepare(`
      SELECT 1 FROM bank_statement_lines
      WHERE id <> ? AND match_status IN ('matched', 'created')
        AND matched_source_type = ? AND matched_source_id = ?
        AND (? <> 'bank_transfer' OR bank_account_id = ?) LIMIT 1
    `).get(statementLineId, sourceType, sourceId, sourceType, line.bank_account_id);
    if (incompatible) throw new Error("The selected transaction is already matched to another statement line.");
    const result = context.sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'matched', matched_source_type = ?,
        matched_source_id = ? WHERE id = ? AND match_status = 'unmatched'
    `).run(sourceType, sourceId, statementLineId);
    if (result.changes !== 1) throw new Error("Statement line changed before the match could be confirmed.");
  }).immediate();
}

function ensureNotReconciled(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], statementLineId: string) {
  const row = sqlite.prepare(`
    SELECT 1 FROM bank_reconciliation_items bri
    INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
    WHERE bri.statement_line_id = ?
  `).get(statementLineId);
  if (row) throw new Error("Completed reconciliation lines cannot be changed.");
}

export function ignoreStatementLine(businessId: string, userId: string, statementLineId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    ensureNotReconciled(sqlite, statementLineId);
    const result = sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'ignored', matched_source_type = NULL,
        matched_source_id = NULL WHERE id = ? AND match_status = 'unmatched'
    `).run(statementLineId);
    if (result.changes !== 1) throw new Error("Only an unmatched statement line can be ignored.");
  }).immediate();
}

export function resetStatementLine(businessId: string, userId: string, statementLineId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    ensureNotReconciled(sqlite, statementLineId);
    const line = sqlite.prepare("SELECT match_status FROM bank_statement_lines WHERE id = ?").get(statementLineId) as { match_status: string } | undefined;
    if (!line) throw new Error("Statement line not found.");
    if (line.match_status === "created") throw new Error("Void the created Bank Transaction before resetting this line.");
    sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'unmatched', matched_source_type = NULL,
        matched_source_id = NULL WHERE id = ?
    `).run(statementLineId);
  }).immediate();
}
