import type Database from "better-sqlite3";
import { addMinor } from "../calculations/money";
import { convertDocumentLinesToBase } from "@/modules/currency/conversion";
import type { RateSnapshot } from "@/modules/currency/validation";
import { postTransaction, type JournalLineInput } from "./posting-service";

type PostedInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  invoiceDate: string;
  totalMinor: number;
  rate: RateSnapshot;
};

type PostedInvoiceLine = {
  salesAccountId: string;
  taxCodeId: string;
  projectId?: string | null;
  netAmountMinor: number;
  taxAmountMinor: number;
};

function requiredSettings(sqlite: Database.Database) {
  const settings = sqlite
    .prepare(`
      SELECT accounts_receivable_account_id, default_sales_account_id,
             default_bank_account_id, vat_output_account_id
      FROM business_accounting_settings WHERE id = 'default'
    `)
    .get() as
    | {
        accounts_receivable_account_id: string;
        default_sales_account_id: string;
        default_bank_account_id: string;
        vat_output_account_id: string;
      }
    | undefined;
  if (!settings) {
    throw new Error("Cannot post invoice because Accounts Receivable is not configured.");
  }
  return settings;
}

type ProjectAmount = { accountId: string; projectId: string | null; amountMinor: number };

function addCredit(
  group: Map<string, ProjectAmount>,
  accountId: string,
  projectId: string | null,
  amountMinor: number,
) {
  const key = `${accountId}\u0000${projectId ?? ""}`;
  const current = group.get(key);
  group.set(key, {
    accountId,
    projectId,
    amountMinor: addMinor([current?.amountMinor ?? 0, amountMinor]),
  });
}

export function buildJournalForSalesInvoice(
  sqlite: Database.Database,
  invoice: PostedInvoice,
  invoiceLines: PostedInvoiceLine[],
) {
  const converted = convertDocumentLinesToBase(invoiceLines.map((line) => ({
    ...line,
    grossAmountMinor: line.netAmountMinor + line.taxAmountMinor,
  })), invoice.rate).lines;
  const settings = requiredSettings(sqlite);
  const taxCodes = sqlite
    .prepare("SELECT id, rate_basis_points, sales_tax_account_id FROM tax_codes")
    .all() as { id: string; rate_basis_points: number; sales_tax_account_id: string | null }[];
  const taxCodeById = new Map(taxCodes.map((code) => [code.id, code]));
  const salesCredits = new Map<string, ProjectAmount>();
  const taxCredits = new Map<string, number>();

  for (const line of converted) {
    if (!line.salesAccountId) throw new Error("Cannot post invoice because a line has no sales account.");
    addCredit(salesCredits, line.salesAccountId, line.projectId ?? null, line.baseNetAmountMinor);
    if (line.baseTaxAmountMinor > 0) {
      const taxCode = taxCodeById.get(line.taxCodeId);
      const taxAccountId = taxCode?.sales_tax_account_id ?? settings.vat_output_account_id;
      if (!taxAccountId) throw new Error("Cannot post invoice because output VAT is not configured.");
      taxCredits.set(taxAccountId, addMinor([taxCredits.get(taxAccountId) ?? 0, line.baseTaxAmountMinor]));
    }
  }

  const lines: JournalLineInput[] = [
    {
      accountId: settings.accounts_receivable_account_id,
      description: `Receivable for ${invoice.invoiceNumber}`,
      debitMinor: converted.reduce((sum, line) => sum + line.baseGrossAmountMinor, 0),
      customerId: invoice.customerId,
      reference: invoice.invoiceNumber,
    },
  ];
  for (const { accountId, projectId, amountMinor: creditMinor } of salesCredits.values()) {
    if (creditMinor > 0) {
      lines.push({
        accountId,
        description: `Sales for ${invoice.invoiceNumber}`,
        creditMinor,
        projectId,
        reference: invoice.invoiceNumber,
      });
    }
  }
  for (const [accountId, creditMinor] of taxCredits) {
    if (creditMinor > 0) {
      lines.push({
        accountId,
        description: `Output VAT for ${invoice.invoiceNumber}`,
        creditMinor,
        reference: invoice.invoiceNumber,
      });
    }
  }
  return lines;
}

export function postSalesInvoice(
  sqlite: Database.Database,
  invoice: PostedInvoice,
  invoiceLines: PostedInvoiceLine[],
  replace = false,
) {
  const lineTotal = addMinor(invoiceLines.map((line) => line.netAmountMinor + line.taxAmountMinor));
  if (lineTotal !== invoice.totalMinor) throw new Error("Invoice total does not match its lines.");
  return postTransaction(sqlite, {
    sourceType: "sales_invoice",
    sourceId: invoice.id,
    date: invoice.invoiceDate,
    description: `Sales Invoice ${invoice.invoiceNumber}`,
    lines: buildJournalForSalesInvoice(sqlite, invoice, invoiceLines),
    replace,
  });
}
