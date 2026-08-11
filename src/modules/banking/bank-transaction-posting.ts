import type Database from "better-sqlite3";
import { postTransaction } from "@/modules/accounting/services/posting-service";

type PostingLine = {
  accountId: string;
  taxCodeId: string;
  projectId: string | null;
  description: string;
  netAmountMinor: number;
  taxAmountMinor: number;
};

export function postBankTransaction(
  sqlite: Database.Database,
  transaction: {
    id: string;
    transactionNumber: string;
    bankLedgerAccountId: string;
    date: string;
    type: "money_in" | "money_out";
    totalMinor: number;
    description: string;
  },
  lines: PostingLine[],
) {
  const taxRows = sqlite.prepare(`
    SELECT id, sales_tax_account_id, purchase_tax_account_id, is_recoverable
    FROM tax_codes WHERE id IN (${lines.map(() => "?").join(", ")})
  `).all(...lines.map((line) => line.taxCodeId)) as {
    id: string; sales_tax_account_id: string | null; purchase_tax_account_id: string | null; is_recoverable: number;
  }[];
  const taxById = new Map(taxRows.map((row) => [row.id, row]));
  const journalLines = [];
  if (transaction.type === "money_in") {
    journalLines.push({
      accountId: transaction.bankLedgerAccountId,
      description: transaction.description,
      debitMinor: transaction.totalMinor,
      reference: transaction.transactionNumber,
    });
    for (const line of lines) {
      journalLines.push({
        accountId: line.accountId,
        description: line.description,
        creditMinor: line.netAmountMinor,
        projectId: line.projectId,
        reference: transaction.transactionNumber,
      });
      if (line.taxAmountMinor > 0) {
        const taxAccountId = taxById.get(line.taxCodeId)?.sales_tax_account_id;
        if (!taxAccountId) throw new Error("Output VAT account is not configured for the selected tax code.");
        journalLines.push({
          accountId: taxAccountId,
          description: `${line.description} · Output VAT`,
          creditMinor: line.taxAmountMinor,
          reference: transaction.transactionNumber,
        });
      }
    }
  } else {
    for (const line of lines) {
      const taxCode = taxById.get(line.taxCodeId);
      journalLines.push({
        accountId: line.accountId,
        description: line.description,
        debitMinor: line.netAmountMinor + (taxCode?.is_recoverable ? 0 : line.taxAmountMinor),
        projectId: line.projectId,
        reference: transaction.transactionNumber,
      });
      if (line.taxAmountMinor > 0 && taxCode?.is_recoverable) {
        const taxAccountId = taxCode.purchase_tax_account_id;
        if (!taxAccountId) throw new Error("Input VAT account is not configured for the selected tax code.");
        journalLines.push({
          accountId: taxAccountId,
          description: `${line.description} · Input VAT`,
          debitMinor: line.taxAmountMinor,
          reference: transaction.transactionNumber,
        });
      }
    }
    journalLines.push({
      accountId: transaction.bankLedgerAccountId,
      description: transaction.description,
      creditMinor: transaction.totalMinor,
      reference: transaction.transactionNumber,
    });
  }
  return postTransaction(sqlite, {
    sourceType: "bank_transaction",
    sourceId: transaction.id,
    date: transaction.date,
    description: `Bank Transaction ${transaction.transactionNumber}`,
    lines: journalLines,
  });
}
