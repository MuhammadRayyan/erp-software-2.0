import type Database from "better-sqlite3";
import { reverseTransaction } from "./posting-service";
import { supersedeTaxEntries } from "@/modules/tax/tax-entry-service";

/**
 * Editing a posted invoice/bill never rewrites its ledger history. The live
 * journal entry is re-labelled `<type>_superseded`, an equal-and-opposite
 * `<type>_amendment` entry is posted on the original date, and the caller then
 * posts the new version under the live source type with a new entry number.
 * VAT rows follow the same pattern (see supersedeTaxEntries).
 *
 * Superseded and amendment entries share the source id `<documentId>:<revision>`
 * because journal entries are unique per (source_type, source_id).
 */
export type AmendableSourceType = "sales_invoice" | "purchase_invoice";

export function revisionSourceId(documentId: string, revision: number) {
  return `${documentId}:${revision}`;
}

/** Strips the `:<revision>` suffix of amendment source ids. */
export function documentIdFromRevisionSourceId(sourceId: string) {
  const index = sourceId.lastIndexOf(":");
  return index > 0 ? sourceId.slice(0, index) : sourceId;
}

export function countAmendments(sqlite: Database.Database, sourceType: AmendableSourceType, documentId: string) {
  const row = sqlite.prepare(`
    SELECT COUNT(*) AS count FROM journal_entries
    WHERE source_type = ? AND substr(source_id, 1, ?) = ?
  `).get(`${sourceType}_superseded`, documentId.length + 1, `${documentId}:`) as { count: number };
  return row.count;
}

export function listAmendmentJournals(sqlite: Database.Database, sourceType: AmendableSourceType, documentId: string) {
  return sqlite.prepare(`
    SELECT id, entry_number, date, source_type, source_id, description, posted_at
    FROM journal_entries
    WHERE source_type IN (?, ?) AND substr(source_id, 1, ?) = ?
    ORDER BY posted_at, entry_number
  `).all(`${sourceType}_superseded`, `${sourceType}_amendment`, documentId.length + 1, `${documentId}:`) as {
    id: string;
    entry_number: string;
    date: string;
    source_type: string;
    source_id: string;
    description: string;
    posted_at: string;
  }[];
}

/**
 * Stable description of everything that drives a document's journal and VAT
 * rows. Equal fingerprints mean an edit changed nothing in the ledger (e.g. only
 * notes or a line description), so the existing posting is kept.
 */
export function postingFingerprint(input: {
  partyId: string;
  date: string;
  taxDate: string;
  supplyEmirate?: string | null;
  lines: Array<{ accountId: string; taxCodeId: string; projectId?: string | null; itemId?: string | null; netAmountMinor: number; taxAmountMinor: number }>;
}) {
  const lines = input.lines
    .map((line) => [line.accountId, line.taxCodeId, line.projectId ?? "", line.itemId ?? "", line.netAmountMinor, line.taxAmountMinor].join("|"))
    .sort();
  return JSON.stringify([input.partyId, input.date, input.taxDate, input.supplyEmirate ?? "", lines]);
}

/**
 * Moves the current posting of a document aside and reverses it. Must run inside
 * the caller's transaction; the caller posts the new version afterwards.
 * Lock dates are enforced by postTransaction on the original date.
 */
export function supersedePosting(
  sqlite: Database.Database,
  input: {
    sourceType: AmendableSourceType;
    documentId: string;
    documentLabel: string;
    documentNumber: string;
    taxDate: string;
  },
) {
  if (!sqlite.inTransaction) throw new Error("Amending a posting must run inside a database transaction.");
  const original = sqlite.prepare(`
    SELECT id, entry_number, date, description FROM journal_entries WHERE source_type = ? AND source_id = ?
  `).get(input.sourceType, input.documentId) as { id: string; entry_number: string; date: string; description: string } | undefined;
  if (!original) throw new Error(`The posted journal entry for ${input.documentLabel} ${input.documentNumber} could not be found.`);

  const revision = countAmendments(sqlite, input.sourceType, input.documentId) + 1;
  const revisionId = revisionSourceId(input.documentId, revision);
  const supersededType = `${input.sourceType}_superseded`;
  const amendmentType = `${input.sourceType}_amendment`;

  sqlite.prepare(`
    UPDATE journal_entries SET source_type = ?, source_id = ?, description = ?
    WHERE id = ?
  `).run(supersededType, revisionId, `${original.description} (superseded by amendment ${revision})`, original.id);

  const reversal = reverseTransaction(sqlite, {
    originalSourceType: supersededType,
    originalSourceId: revisionId,
    reversalSourceType: amendmentType,
    reversalSourceId: revisionId,
    date: original.date,
    description: `Amendment ${revision}: reverse ${input.documentLabel} ${input.documentNumber} (${original.entry_number})`,
  });

  supersedeTaxEntries(sqlite, {
    sourceType: input.sourceType,
    sourceId: input.documentId,
    revisionSourceId: revisionId,
    taxDate: input.taxDate,
  });

  return {
    revision,
    supersededEntryNumber: original.entry_number,
    reversalEntryNumber: reversal.entryNumber,
  };
}

type LineSnapshot = {
  description: string;
  quantityMicros: number;
  unitPriceMinor: number;
  accountId: string;
  taxCodeId: string;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
};

export type DocumentSnapshot = {
  date: string;
  taxDate: string;
  partyId: string;
  currencyCode: string;
  exchangeRateToBase: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  baseTotalMinor: number;
  lines: LineSnapshot[];
};

function sameLine(a: LineSnapshot, b: LineSnapshot) {
  return a.description === b.description
    && a.quantityMicros === b.quantityMicros
    && a.unitPriceMinor === b.unitPriceMinor
    && a.accountId === b.accountId
    && a.taxCodeId === b.taxCodeId
    && a.netAmountMinor === b.netAmountMinor
    && a.taxAmountMinor === b.taxAmountMinor;
}

/**
 * Before/after figures and a positional line diff for the activity log, so the
 * audit trail shows what an amendment changed without opening the journals.
 */
export function describeAmendment(before: DocumentSnapshot, after: DocumentSnapshot) {
  const lineChanges: Array<{
    position: number;
    change: "added" | "removed" | "changed";
    description: string;
    beforeGrossMinor?: number;
    afterGrossMinor?: number;
  }> = [];
  const count = Math.max(before.lines.length, after.lines.length);
  for (let index = 0; index < count; index += 1) {
    const oldLine = before.lines[index];
    const newLine = after.lines[index];
    if (oldLine && !newLine) {
      lineChanges.push({ position: index + 1, change: "removed", description: oldLine.description, beforeGrossMinor: oldLine.grossAmountMinor });
    } else if (!oldLine && newLine) {
      lineChanges.push({ position: index + 1, change: "added", description: newLine.description, afterGrossMinor: newLine.grossAmountMinor });
    } else if (oldLine && newLine && !sameLine(oldLine, newLine)) {
      lineChanges.push({
        position: index + 1,
        change: "changed",
        description: newLine.description,
        beforeGrossMinor: oldLine.grossAmountMinor,
        afterGrossMinor: newLine.grossAmountMinor,
      });
    }
  }
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const change of lineChanges) counts[change.change] += 1;
  const parts = (Object.keys(counts) as Array<keyof typeof counts>)
    .filter((key) => counts[key] > 0)
    .map((key) => `${counts[key]} line${counts[key] === 1 ? "" : "s"} ${key}`);
  const pick = (snapshot: DocumentSnapshot) => ({
    date: snapshot.date,
    taxDate: snapshot.taxDate,
    partyId: snapshot.partyId,
    currency: snapshot.currencyCode,
    exchangeRateToBase: snapshot.exchangeRateToBase,
    netMinor: snapshot.subtotalMinor,
    vatMinor: snapshot.taxMinor,
    totalMinor: snapshot.totalMinor,
    baseTotalMinor: snapshot.baseTotalMinor,
    lineCount: snapshot.lines.length,
  });
  return {
    before: pick(before),
    after: pick(after),
    lineChanges,
    lineChangeSummary: parts.length > 0 ? parts.join(", ") : "no line changes",
    currencyChanged: before.currencyCode !== after.currencyCode || before.exchangeRateToBase !== after.exchangeRateToBase,
  };
}

export function formatMinorAmount(amountMinor: number, minorUnit: number) {
  return (amountMinor / 10 ** minorUnit).toFixed(minorUnit);
}
