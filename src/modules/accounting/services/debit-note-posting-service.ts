import type Database from "better-sqlite3";
import { addMinor } from "../calculations/money";
import { addAmount, addProjectAmount, ProjectAmount } from "./posting-helpers";
import { convertDocumentLinesToBase } from "@/modules/currency/conversion";
import type { RateSnapshot } from "@/modules/currency/validation";
import { postTransaction, type JournalLineInput } from "./posting-service";

type PostedDebitNote = { id: string; debitNoteNumber: string; supplierId: string; date: string; totalMinor: number; rate: RateSnapshot };
type PostedDebitNoteLine = { expenseAccountId: string; taxCodeId: string; projectId?: string | null; itemId?: string | null; netAmountMinor: number; taxAmountMinor: number; grossAmountMinor: number };

export function buildJournalForDebitNote(sqlite: Database.Database, note: PostedDebitNote, noteLines: PostedDebitNoteLine[]) {
  const convertedLines = convertDocumentLinesToBase(noteLines, note.rate).lines;
  const settings = sqlite.prepare(`SELECT accounts_payable_account_id, input_vat_account_id FROM business_accounting_settings WHERE id = 'default'`).get() as { accounts_payable_account_id: string; input_vat_account_id: string } | undefined;
  if (!settings?.accounts_payable_account_id) throw new Error("Accounts Payable account is not configured.");
  if (!settings.input_vat_account_id) throw new Error("Input VAT account is not configured.");
  const taxRows = sqlite.prepare("SELECT id, vat_category, is_recoverable, sales_tax_account_id, purchase_tax_account_id FROM tax_codes").all() as { id: string; vat_category: string | null; is_recoverable: number; sales_tax_account_id: string | null; purchase_tax_account_id: string | null }[];
  const taxById = new Map(taxRows.map((row) => [row.id, row]));
  const expenseCredits = new Map<string, ProjectAmount>();
  const taxCredits = new Map<string, number>();
  const taxDebits = new Map<string, number>(); // For reverse-charge
  for (const line of convertedLines) {
    if (!line.expenseAccountId) throw new Error("Debit note line has no expense account.");
    const taxCode = taxById.get(line.taxCodeId);
    const nonRecoverableTax = taxCode?.is_recoverable ? 0 : line.baseTaxAmountMinor;
    addProjectAmount(expenseCredits, line.expenseAccountId, line.itemId ? null : line.projectId ?? null, line.baseNetAmountMinor + nonRecoverableTax);
    if (line.baseTaxAmountMinor > 0) {
      if (taxCode?.is_recoverable) {
        const accountId = taxCode.purchase_tax_account_id ?? settings.input_vat_account_id;
        if (!accountId) throw new Error("Input VAT account is not configured.");
        addAmount(taxCredits, accountId, line.baseTaxAmountMinor);
      }
      if (taxCode?.vat_category === "reverse_charge") {
        if (!taxCode.sales_tax_account_id) throw new Error("Output VAT account is not configured for Reverse Charge.");
        addAmount(taxDebits, taxCode.sales_tax_account_id, line.baseTaxAmountMinor);
      }
    }
  }
  const lines: JournalLineInput[] = [];
  
  lines.push({ accountId: settings.accounts_payable_account_id, description: `Debit Note ${note.debitNoteNumber}`, debitMinor: convertedLines.reduce((sum, line) => sum + line.baseGrossAmountMinor, 0), supplierId: note.supplierId, reference: note.debitNoteNumber });
  
  for (const { accountId, projectId, amountMinor: creditMinor } of expenseCredits.values()) if (creditMinor > 0) lines.push({ accountId, description: `Refund/Return for ${note.debitNoteNumber}`, creditMinor, supplierId: note.supplierId, projectId, reference: note.debitNoteNumber });
  for (const [accountId, creditMinor] of taxCredits) if (creditMinor > 0) lines.push({ accountId, description: `Input VAT Reversed for ${note.debitNoteNumber}`, creditMinor, supplierId: note.supplierId, reference: note.debitNoteNumber });
  for (const [accountId, debitMinor] of taxDebits) if (debitMinor > 0) lines.push({ accountId, description: `Reverse-Charge Output VAT Reversed for ${note.debitNoteNumber}`, debitMinor, supplierId: note.supplierId, reference: note.debitNoteNumber });
  
  return lines;
}

export function postDebitNote(sqlite: Database.Database, note: PostedDebitNote, noteLines: PostedDebitNoteLine[], replace = false) {
  const lineTotal = addMinor(noteLines.map((line) => line.grossAmountMinor));
  if (lineTotal !== note.totalMinor) throw new Error("Debit note total does not match its lines.");
  return postTransaction(sqlite, { sourceType: "debit_note", sourceId: note.id, date: note.date, description: `Debit Note ${note.debitNoteNumber}`, lines: buildJournalForDebitNote(sqlite, note, noteLines), replace });
}
