import { randomUUID } from "node:crypto";
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import type { MatchCandidate, MatchSourceRef, MatchSourceType } from "./matching-types";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];

/** SQL predicate: the aliased movement is not yet matched to any statement line. */
const MOVEMENT_UNMATCHED = `NOT EXISTS (
  SELECT 1 FROM bank_statement_match_items mi
  WHERE mi.bank_account_id = movements.bank_account_id
    AND mi.source_type = movements.source_type AND mi.source_id = movements.source_id
)`;

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
  sqlite: Sqlite,
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
      AND ${MOVEMENT_UNMATCHED}
    ORDER BY reference_match DESC, date_distance ASC, movements.date DESC
    LIMIT 12
  `).all(line.transaction_date, line.reference ?? "", line.reference ?? "", line.bank_account_id,
    line.amount_minor) as {
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

/**
 * Every unmatched book movement in a bank account up to `throughDate`, for the
 * reconciliation workspace. Positive amounts are money in.
 */
export function listUnmatchedMovements(businessId: string, userId: string, bankAccountId: string, throughDate?: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT movements.* FROM (${movementSql()}) movements
    WHERE movements.bank_account_id = ? AND (? = '' OR movements.date <= ?)
      AND ${MOVEMENT_UNMATCHED}
    ORDER BY movements.date DESC, movements.source_number DESC
    LIMIT 500
  `).all(bankAccountId, throughDate ?? "", throughDate ?? "") as {
    source_type: MatchSourceType; source_id: string; source_number: string; date: string;
    amount_minor: number; party: string | null; description: string | null;
    reference: string | null; journal_entry_id: string;
  }[];
  return rows.map((row): MatchCandidate => ({
    sourceType: row.source_type, sourceId: row.source_id, sourceNumber: row.source_number,
    date: row.date, amountMinor: row.amount_minor, party: row.party,
    description: row.description, reference: row.reference, journalEntryId: row.journal_entry_id,
    dateDistance: 0, referenceMatch: false,
  }));
}

/**
 * Matches one statement line to one or more book movements whose amounts sum
 * exactly to the line (e.g. one deposit covering several receipts).
 */
export function confirmStatementMatches(
  businessId: string,
  userId: string,
  statementLineId: string,
  sources: readonly MatchSourceRef[],
) {
  assertMutationPermission(businessId, userId, "banking", "edit");
  const unique = [...new Map(sources.map((source) => [`${source.sourceType}:${source.sourceId}`, source])).values()];
  if (unique.length === 0) throw new Error("Select at least one transaction to match.");
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    const line = context.sqlite.prepare(`
      SELECT bank_account_id, amount_minor, match_status FROM bank_statement_lines WHERE id = ?
    `).get(statementLineId) as { bank_account_id: string; amount_minor: number; match_status: string } | undefined;
    if (!line) throw new Error("Statement line not found.");
    if (line.match_status !== "unmatched") throw new Error("Statement line is no longer unmatched.");
    let total = 0;
    for (const source of unique) {
      const movement = getMovement(context.sqlite, source.sourceType, source.sourceId, line.bank_account_id);
      if (!movement) throw new Error("A selected transaction no longer exists, is void, or uses another Bank Account.");
      const taken = context.sqlite.prepare(`
        SELECT 1 FROM bank_statement_match_items
        WHERE bank_account_id = ? AND source_type = ? AND source_id = ? LIMIT 1
      `).get(line.bank_account_id, source.sourceType, source.sourceId);
      if (taken) throw new Error(`${movement.source_number} is already matched to another statement line.`);
      total += movement.amount_minor;
    }
    if (total !== line.amount_minor) {
      throw new Error(unique.length === 1
        ? "The selected transaction amount or direction does not match this statement line."
        : "The selected transactions must add up exactly to the statement line amount.");
    }
    const single = unique.length === 1 ? unique[0] : null;
    const result = context.sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'matched', matched_source_type = ?,
        matched_source_id = ? WHERE id = ? AND match_status = 'unmatched'
    `).run(single ? single.sourceType : "multiple", single ? single.sourceId : statementLineId, statementLineId);
    if (result.changes !== 1) throw new Error("Statement line changed before the match could be confirmed.");
    recordMatchItems(context.sqlite, statementLineId, line.bank_account_id, unique);
  }).immediate();
}

export function confirmStatementMatch(
  businessId: string,
  userId: string,
  statementLineId: string,
  sourceType: MatchSourceType,
  sourceId: string,
) {
  assertMutationPermission(businessId, userId, "banking", "edit");
  confirmStatementMatches(businessId, userId, statementLineId, [{ sourceType, sourceId }]);
}

/** Records which book entries a statement line clears. */
export function recordMatchItems(sqlite: Sqlite, statementLineId: string, bankAccountId: string, sources: readonly MatchSourceRef[]) {
  const insert = sqlite.prepare(`
    INSERT INTO bank_statement_match_items (id, statement_line_id, bank_account_id, source_type, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const source of sources) insert.run(randomUUID(), statementLineId, bankAccountId, source.sourceType, source.sourceId, now);
}

/**
 * Called when a matched book document is voided: blocks if any statement line
 * it clears is in a completed reconciliation, otherwise returns those lines to
 * unmatched (a split line releases all of its other entries too).
 */
export function releaseStatementMatchesForSource(sqlite: Sqlite, sourceType: MatchSourceType, sourceId: string, reconciledMessage: string) {
  // Match items are the source of truth; the legacy columns are also read so
  // rows written outside the services (imports, manual fixes) are still found.
  const lines = sqlite.prepare(`
    SELECT statement_line_id AS id FROM bank_statement_match_items WHERE source_type = ? AND source_id = ?
    UNION
    SELECT id FROM bank_statement_lines
    WHERE match_status IN ('matched', 'created') AND matched_source_type = ? AND matched_source_id = ?
  `).all(sourceType, sourceId, sourceType, sourceId) as { id: string }[];
  for (const line of lines) {
    if (isReconciled(sqlite, line.id)) throw new Error(reconciledMessage);
  }
  for (const line of lines) unmatchLine(sqlite, line.id);
}

function isReconciled(sqlite: Sqlite, statementLineId: string) {
  return Boolean(sqlite.prepare(`
    SELECT 1 FROM bank_reconciliation_items bri
    INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
    WHERE bri.statement_line_id = ? LIMIT 1
  `).get(statementLineId));
}

function unmatchLine(sqlite: Sqlite, statementLineId: string) {
  sqlite.prepare("DELETE FROM bank_statement_match_items WHERE statement_line_id = ?").run(statementLineId);
  sqlite.prepare(`
    UPDATE bank_statement_lines SET match_status = 'unmatched', matched_source_type = NULL,
      matched_source_id = NULL WHERE id = ?
  `).run(statementLineId);
}

function ensureNotReconciled(sqlite: Sqlite, statementLineId: string) {
  if (isReconciled(sqlite, statementLineId)) throw new Error("Completed reconciliation lines cannot be changed.");
}

export function ignoreStatementLine(businessId: string, userId: string, statementLineId: string) {
  assertMutationPermission(businessId, userId, "banking", "edit");
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
  assertMutationPermission(businessId, userId, "banking", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    ensureNotReconciled(sqlite, statementLineId);
    const line = sqlite.prepare("SELECT match_status FROM bank_statement_lines WHERE id = ?").get(statementLineId) as { match_status: string } | undefined;
    if (!line) throw new Error("Statement line not found.");
    if (line.match_status === "created") throw new Error("Void the created Bank Transaction before resetting this line.");
    unmatchLine(sqlite, statementLineId);
  }).immediate();
}
