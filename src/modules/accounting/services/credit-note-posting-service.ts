import type Database from "better-sqlite3";
import { addMinor } from "../calculations/money";
import { convertDocumentLinesToBase } from "@/modules/currency/conversion";
import type { RateSnapshot } from "@/modules/currency/validation";
import { postTransaction, type JournalLineInput } from "./posting-service";

type PostedCreditNote = { id: string; creditNoteNumber: string; customerId: string; date: string; totalMinor: number; rate: RateSnapshot; baseCarryingAmountReleased: number };
type PostedCreditLine = { salesAccountId: string; taxCodeId: string; projectId?: string | null; netAmountMinor: number; taxAmountMinor: number };
type ProjectAmount = { accountId: string; projectId: string | null; amountMinor: number };
function addProjectAmount(group: Map<string, ProjectAmount>, accountId: string, projectId: string | null, amount: number) { const key = `${accountId}\u0000${projectId ?? ""}`; const current = group.get(key); group.set(key, { accountId, projectId, amountMinor: addMinor([current?.amountMinor ?? 0, amount]) }); }
function addAmount(group: Map<string, number>, accountId: string, amount: number) { group.set(accountId, addMinor([group.get(accountId) ?? 0, amount])); }

export function buildJournalForCreditNote(sqlite: Database.Database, note: PostedCreditNote, noteLines: PostedCreditLine[]) {
  const convertedLines = convertDocumentLinesToBase(noteLines.map((line) => ({ ...line, grossAmountMinor: line.netAmountMinor + line.taxAmountMinor })), note.rate).lines;
  const settings = sqlite.prepare("SELECT accounts_receivable_account_id, vat_output_account_id FROM business_accounting_settings WHERE id = 'default'").get() as { accounts_receivable_account_id: string; vat_output_account_id: string } | undefined;
  if (!settings?.accounts_receivable_account_id) throw new Error("Accounts Receivable account is not configured.");
  const taxes = sqlite.prepare("SELECT id, sales_tax_account_id FROM tax_codes").all() as { id: string; sales_tax_account_id: string | null }[]; const taxById = new Map(taxes.map((row) => [row.id, row]));
  const salesDebits = new Map<string, ProjectAmount>(); const taxDebits = new Map<string, number>();
  for (const line of convertedLines) { if (!line.salesAccountId) throw new Error("Credit note line has no sales account."); addProjectAmount(salesDebits, line.salesAccountId, line.projectId ?? null, line.baseNetAmountMinor); if (line.baseTaxAmountMinor > 0) { const accountId = taxById.get(line.taxCodeId)?.sales_tax_account_id ?? settings.vat_output_account_id; if (!accountId) throw new Error("Output VAT account is not configured."); addAmount(taxDebits, accountId, line.baseTaxAmountMinor); } }
  const lines: JournalLineInput[] = [];
  for (const { accountId, projectId, amountMinor: debitMinor } of salesDebits.values()) if (debitMinor > 0) lines.push({ accountId, description: `Sales reversal for ${note.creditNoteNumber}`, debitMinor, customerId: note.customerId, projectId, reference: note.creditNoteNumber });
  for (const [accountId, debitMinor] of taxDebits) if (debitMinor > 0) lines.push({ accountId, description: `Output VAT reversal for ${note.creditNoteNumber}`, debitMinor, customerId: note.customerId, reference: note.creditNoteNumber });
  const debitTotal = lines.reduce((sum, line) => sum + (line.debitMinor ?? 0), 0);
  const adjustment = note.baseCarryingAmountReleased - debitTotal;
  if (adjustment !== 0 && lines[0]?.debitMinor) lines[0].debitMinor += adjustment;
  lines.push({ accountId: settings.accounts_receivable_account_id, description: `Receivable credit for ${note.creditNoteNumber}`, creditMinor: note.baseCarryingAmountReleased, customerId: note.customerId, reference: note.creditNoteNumber });
  return lines;
}

export function postCreditNote(sqlite: Database.Database, note: PostedCreditNote, noteLines: PostedCreditLine[], replace = false) {
  const lineTotal = addMinor(noteLines.map((line) => line.netAmountMinor + line.taxAmountMinor)); if (lineTotal !== note.totalMinor) throw new Error("Credit note total does not match its lines.");
  return postTransaction(sqlite, { sourceType: "sales_credit_note", sourceId: note.id, date: note.date, description: `Sales Credit Note ${note.creditNoteNumber}`, lines: buildJournalForCreditNote(sqlite, note, noteLines), replace });
}
