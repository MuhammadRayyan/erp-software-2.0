import type Database from "better-sqlite3";
import { postTransaction, type JournalLineInput } from "./posting-service";

export function postSupplierPayment(
  sqlite: Database.Database,
  payment: {
    id: string;
    paymentNumber: string;
    supplierId: string;
    date: string;
    bankAccountId: string;
    baseAmountMinor: number;
    releasedCarryingAmountMinor: number;
    realizedFxAmountMinor: number;
  },
) {
  const settings = sqlite.prepare(`
    SELECT accounts_payable_account_id, realized_fx_gain_account_id, realized_fx_loss_account_id
    FROM business_accounting_settings WHERE id = 'default'
  `).get() as {
    accounts_payable_account_id: string;
    realized_fx_gain_account_id: string | null;
    realized_fx_loss_account_id: string | null;
  } | undefined;
  if (!settings?.accounts_payable_account_id) throw new Error("Accounts Payable account is not configured.");
  const bank = sqlite.prepare(`
    SELECT id FROM accounts WHERE id = ? AND is_active = 1 AND subtype IN ('bank', 'cash')
  `).get(payment.bankAccountId);
  if (!bank) throw new Error("Choose an active Bank or Cash account.");
  if (payment.realizedFxAmountMinor !== 0
    && (!settings.realized_fx_gain_account_id || !settings.realized_fx_loss_account_id)) {
    throw new Error("Realized FX Gain/Loss accounts are not configured.");
  }

  const lines: JournalLineInput[] = [
    {
      accountId: settings.accounts_payable_account_id,
      description: `Payment ${payment.paymentNumber}`,
      debitMinor: payment.releasedCarryingAmountMinor,
      supplierId: payment.supplierId,
      reference: payment.paymentNumber,
    },
    {
      accountId: payment.bankAccountId,
      description: `Payment ${payment.paymentNumber}`,
      creditMinor: payment.baseAmountMinor,
      supplierId: payment.supplierId,
      reference: payment.paymentNumber,
    },
  ];
  if (payment.realizedFxAmountMinor > 0) {
    lines.push({
      accountId: settings.realized_fx_loss_account_id!,
      description: `Realized FX loss on ${payment.paymentNumber}`,
      debitMinor: payment.realizedFxAmountMinor,
      reference: payment.paymentNumber,
    });
  } else if (payment.realizedFxAmountMinor < 0) {
    lines.push({
      accountId: settings.realized_fx_gain_account_id!,
      description: `Realized FX gain on ${payment.paymentNumber}`,
      creditMinor: -payment.realizedFxAmountMinor,
      reference: payment.paymentNumber,
    });
  }
  return postTransaction(sqlite, {
    sourceType: "supplier_payment",
    sourceId: payment.id,
    date: payment.date,
    description: `Supplier Payment ${payment.paymentNumber}`,
    lines,
  });
}

