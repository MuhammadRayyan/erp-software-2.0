import type Database from "better-sqlite3";
import { postTransaction, type JournalLineInput } from "./posting-service";

export function postReceipt(
  sqlite: Database.Database,
  receipt: {
    id: string;
    receiptNumber: string;
    customerId: string;
    date: string;
    bankAccountId: string;
    baseAmountMinor: number;
    releasedCarryingAmountMinor: number;
    realizedFxAmountMinor: number;
  },
) {
  const settings = sqlite.prepare(`
    SELECT accounts_receivable_account_id, realized_fx_gain_account_id, realized_fx_loss_account_id
    FROM business_accounting_settings WHERE id = 'default'
  `).get() as {
    accounts_receivable_account_id: string;
    realized_fx_gain_account_id: string | null;
    realized_fx_loss_account_id: string | null;
  } | undefined;
  if (!settings?.accounts_receivable_account_id) {
    throw new Error("Cannot post receipt because Accounts Receivable is not configured.");
  }
  const bankAccount = sqlite.prepare(`
    SELECT id FROM accounts WHERE id = ? AND is_active = 1 AND subtype IN ('bank', 'cash')
  `).get(receipt.bankAccountId);
  if (!bankAccount) throw new Error("Choose an active Bank or Cash account.");
  if (receipt.realizedFxAmountMinor !== 0
    && (!settings.realized_fx_gain_account_id || !settings.realized_fx_loss_account_id)) {
    throw new Error("Realized FX Gain/Loss accounts are not configured.");
  }

  const lines: JournalLineInput[] = [
    {
      accountId: receipt.bankAccountId,
      description: `Receipt ${receipt.receiptNumber}`,
      debitMinor: receipt.baseAmountMinor,
      reference: receipt.receiptNumber,
    },
    {
      accountId: settings.accounts_receivable_account_id,
      description: `Receipt ${receipt.receiptNumber}`,
      creditMinor: receipt.releasedCarryingAmountMinor,
      customerId: receipt.customerId,
      reference: receipt.receiptNumber,
    },
  ];
  if (receipt.realizedFxAmountMinor > 0) {
    lines.push({
      accountId: settings.realized_fx_gain_account_id!,
      description: `Realized FX gain on ${receipt.receiptNumber}`,
      creditMinor: receipt.realizedFxAmountMinor,
      reference: receipt.receiptNumber,
    });
  } else if (receipt.realizedFxAmountMinor < 0) {
    lines.push({
      accountId: settings.realized_fx_loss_account_id!,
      description: `Realized FX loss on ${receipt.receiptNumber}`,
      debitMinor: -receipt.realizedFxAmountMinor,
      reference: receipt.receiptNumber,
    });
  }
  return postTransaction(sqlite, {
    sourceType: "receipt",
    sourceId: receipt.id,
    date: receipt.date,
    description: `Customer Receipt ${receipt.receiptNumber}`,
    lines,
  });
}

