import { getBusinessDb } from "@/core/db/business";

export function listJournalEntries(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite
    .prepare(`
      SELECT je.id, je.entry_number, je.date, je.source_type, je.source_id,
             je.description, SUM(jl.debit_minor) AS debit_minor,
             SUM(jl.credit_minor) AS credit_minor
      FROM journal_entries je
      INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.status = 'posted'
      GROUP BY je.id
      ORDER BY je.date DESC, je.entry_number DESC
    `)
    .all() as {
      id: string;
      entry_number: string;
      date: string;
      source_type: string;
      source_id: string;
      description: string;
      debit_minor: number;
      credit_minor: number;
    }[];
}

export function getJournalEntry(
  businessId: string,
  userId: string,
  journalEntryId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const entry = sqlite
    .prepare("SELECT * FROM journal_entries WHERE id = ?")
    .get(journalEntryId) as
    | {
        id: string;
        entry_number: string;
        date: string;
        source_type: string;
        source_id: string;
        description: string;
        posted_at: string;
      }
    | undefined;
  if (!entry) return null;
  const lines = sqlite
    .prepare(`
      SELECT jl.id, jl.description, jl.debit_minor, jl.credit_minor,
             jl.customer_id, jl.project_id, jl.reference, a.id AS account_id, a.code, a.name,
             p.code AS project_code, p.name AS project_name
      FROM journal_lines jl
      INNER JOIN accounts a ON a.id = jl.account_id
      LEFT JOIN projects p ON p.id = jl.project_id
      WHERE jl.journal_entry_id = ?
      ORDER BY jl.position
    `)
    .all(journalEntryId) as {
      id: string;
      description: string;
      debit_minor: number;
      credit_minor: number;
      customer_id: string | null;
      project_id: string | null;
      project_code: string | null;
      project_name: string | null;
      reference: string | null;
      account_id: string;
      code: string;
      name: string;
    }[];
  return {
    entry,
    lines,
    debitMinor: lines.reduce((sum, line) => sum + line.debit_minor, 0),
    creditMinor: lines.reduce((sum, line) => sum + line.credit_minor, 0),
  };
}
