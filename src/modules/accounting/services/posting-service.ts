import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { addMinor } from "../calculations/money";
import { allocateNumber } from "./numbering-service";

export type JournalLineInput = {
  accountId: string;
  description: string;
  debitMinor?: number;
  creditMinor?: number;
  customerId?: string | null;
  supplierId?: string | null;
  projectId?: string | null;
  reference?: string | null;
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

  const debitTotal = addMinor(lines.map((line) => line.debitMinor ?? 0));
  const creditTotal = addMinor(lines.map((line) => line.creditMinor ?? 0));
  if (debitTotal !== creditTotal) throw new Error("Journal entry is not balanced.");
  if (debitTotal <= 0) throw new Error("Journal entry total must be greater than zero.");
}

export function postTransaction(sqlite: Database.Database, input: PostTransactionInput) {
  if (!sqlite.inTransaction) throw new Error("Ledger posting must run inside a database transaction.");
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
      customer_id, supplier_id, project_id, reference, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    );
  });
  return { id: journalEntryId, entryNumber };
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
    .prepare("SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ?")
    .get(input.originalSourceType, input.originalSourceId) as { id: string } | undefined;
  if (!original) throw new Error("The original journal entry could not be found.");
  const lines = sqlite
    .prepare(`
      SELECT account_id, description, debit_minor, credit_minor, customer_id, supplier_id,
             project_id, reference
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
    }[];
  return postTransaction(sqlite, {
    sourceType: input.reversalSourceType,
    sourceId: input.reversalSourceId,
    date: input.date,
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
    })),
  });
}
