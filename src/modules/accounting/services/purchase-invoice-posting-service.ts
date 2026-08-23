import type Database from "better-sqlite3";
import { addMinor } from "../calculations/money";
import { addAmount, addProjectAmount, ProjectAmount } from "./posting-helpers";
import { convertDocumentLinesToBase } from "@/modules/currency/conversion";
import type { RateSnapshot } from "@/modules/currency/validation";
import { postTransaction, type JournalLineInput } from "./posting-service";

type PostedPurchaseInvoice = { id: string; internalNumber: string; supplierId: string; invoiceDate: string; totalMinor: number; rate: RateSnapshot };
type PostedPurchaseInvoiceLine = { expenseAccountId: string; taxCodeId: string; projectId?: string | null; itemId?: string | null; netAmountMinor: number; taxAmountMinor: number; grossAmountMinor: number };


type ProjectAmount = { accountId: string; projectId: string | null; amountMinor: number };
function addProjectAmount(group: Map<string, ProjectAmount>, accountId: string, projectId: string | null, amountMinor: number) {
  const key = `${accountId}\u0000${projectId ?? ""}`;
  const current = group.get(key);
  group.set(key, { accountId, projectId, amountMinor: addMinor([current?.amountMinor ?? 0, amountMinor]) });
}

export function buildJournalForPurchaseInvoice(sqlite: Database.Database, invoice: PostedPurchaseInvoice, invoiceLines: PostedPurchaseInvoiceLine[]) {
  const convertedLines = convertDocumentLinesToBase(invoiceLines, invoice.rate).lines;
  const settings = sqlite.prepare(`SELECT accounts_payable_account_id, input_vat_account_id FROM business_accounting_settings WHERE id = 'default'`).get() as { accounts_payable_account_id: string; input_vat_account_id: string } | undefined;
  if (!settings?.accounts_payable_account_id) throw new Error("Accounts Payable account is not configured.");
  if (!settings.input_vat_account_id) throw new Error("Input VAT account is not configured.");
  const taxRows = sqlite.prepare("SELECT id, vat_category, is_recoverable, sales_tax_account_id, purchase_tax_account_id FROM tax_codes").all() as { id: string; vat_category: string | null; is_recoverable: number; sales_tax_account_id: string | null; purchase_tax_account_id: string | null }[];
  const taxById = new Map(taxRows.map((row) => [row.id, row]));
  const expenseDebits = new Map<string, ProjectAmount>();
  const taxDebits = new Map<string, number>();
  const taxCredits = new Map<string, number>();
  for (const line of convertedLines) {
    if (!line.expenseAccountId) throw new Error("Purchase invoice line has no expense or Inventory Asset account.");
    const taxCode = taxById.get(line.taxCodeId);
    const nonRecoverableTax = taxCode?.is_recoverable ? 0 : line.baseTaxAmountMinor;
    addProjectAmount(expenseDebits, line.expenseAccountId, line.itemId ? null : line.projectId ?? null, line.baseNetAmountMinor + nonRecoverableTax);
    if (line.baseTaxAmountMinor > 0) {
      if (taxCode?.is_recoverable) {
        const accountId = taxCode.purchase_tax_account_id ?? settings.input_vat_account_id;
        if (!accountId) throw new Error("Input VAT account is not configured.");
        addAmount(taxDebits, accountId, line.baseTaxAmountMinor);
      }
      if (taxCode?.vat_category === "reverse_charge") {
        if (!taxCode.sales_tax_account_id) throw new Error("Output VAT account is not configured for Reverse Charge.");
        addAmount(taxCredits, taxCode.sales_tax_account_id, line.baseTaxAmountMinor);
      }
    }
  }
  const lines: JournalLineInput[] = [];
  for (const { accountId, projectId, amountMinor: debitMinor } of expenseDebits.values()) if (debitMinor > 0) lines.push({ accountId, description: `Purchases for ${invoice.internalNumber}`, debitMinor, supplierId: invoice.supplierId, projectId, reference: invoice.internalNumber });
  for (const [accountId, debitMinor] of taxDebits) if (debitMinor > 0) lines.push({ accountId, description: `Input VAT for ${invoice.internalNumber}`, debitMinor, supplierId: invoice.supplierId, reference: invoice.internalNumber });
  for (const [accountId, creditMinor] of taxCredits) if (creditMinor > 0) lines.push({ accountId, description: `Reverse-Charge Output VAT for ${invoice.internalNumber}`, creditMinor, supplierId: invoice.supplierId, reference: invoice.internalNumber });
  lines.push({ accountId: settings.accounts_payable_account_id, description: `Payable for ${invoice.internalNumber}`, creditMinor: convertedLines.reduce((sum, line) => sum + line.baseGrossAmountMinor, 0), supplierId: invoice.supplierId, reference: invoice.internalNumber });
  return lines;
}

export function postPurchaseInvoice(sqlite: Database.Database, invoice: PostedPurchaseInvoice, invoiceLines: PostedPurchaseInvoiceLine[], replace = false) {
  const lineTotal = addMinor(invoiceLines.map((line) => line.grossAmountMinor));
  if (lineTotal !== invoice.totalMinor) throw new Error("Purchase invoice total does not match its lines.");
  return postTransaction(sqlite, { sourceType: "purchase_invoice", sourceId: invoice.id, date: invoice.invoiceDate, description: `Purchase Invoice ${invoice.internalNumber}`, lines: buildJournalForPurchaseInvoice(sqlite, invoice, invoiceLines), replace });
}
