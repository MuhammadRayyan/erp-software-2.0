import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import Decimal from "decimal.js";
import { getBusinessTodayIso } from "@/core/format";
import { convertToBase, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { bankAccountCurrency, type BankCurrency } from "./bank-currency";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { postTransaction, reverseTransaction, type JournalLineInput } from "@/modules/accounting/services/posting-service";
import { assertDateNotLocked } from "@/modules/accounting/services/financial-lock-service";
import { bankTransferInputSchema, type BankTransferInput } from "./bank-transfer-input";
import { releaseStatementMatchesForSource } from "./matching-service";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];

type TransferSide = { currency: BankCurrency; amountMinor: number };

function spotRate(sqlite: Sqlite, currency: BankCurrency, date: string) {
  if (currency.isBase) return "1";
  try {
    return resolveRateSnapshot(sqlite, { currencyCode: currency.code, relevantDate: date, enforceVatPolicy: false }).exchangeRateToBase;
  } catch {
    return null;
  }
}

function impliedRate(baseMinor: number, baseMinorUnit: number, foreignMinor: number, foreignMinorUnit: number) {
  return new Decimal(baseMinor).div(new Decimal(10).pow(baseMinorUnit))
    .div(new Decimal(foreignMinor).div(new Decimal(10).pow(foreignMinorUnit)))
    .toDecimalPlaces(8).toString();
}

/**
 * Values both legs of a transfer in base currency. A base leg is its own base
 * value; a foreign leg is valued at the stored spot rate for the date, or, when
 * no rate is stored and the other leg is in base, at the transfer's implied
 * rate. Any difference between the two base values is realized FX on the
 * conversion (e.g. the bank's spread).
 */
export function valueTransferLegs(sqlite: Sqlite, date: string, from: TransferSide, to: TransferSide) {
  const value = (side: TransferSide, rate: string | null) => rate === null
    ? null
    : convertToBase(side.amountMinor, side.currency.minorUnit, side.currency.baseMinorUnit, rate);
  let fromRate = spotRate(sqlite, from.currency, date);
  let fromBaseMinor = value(from, fromRate);
  // The same currency on both sides moves at one rate: no FX difference.
  let toRate = from.currency.code === to.currency.code ? fromRate : spotRate(sqlite, to.currency, date);
  let toBaseMinor = value(to, toRate);
  if (fromBaseMinor === null && toBaseMinor === null) {
    throw new Error(`An exchange rate is required for ${from.currency.code} on ${date}.`);
  }
  if (fromBaseMinor === null) {
    fromBaseMinor = toBaseMinor!;
    fromRate = impliedRate(fromBaseMinor, from.currency.baseMinorUnit, from.amountMinor, from.currency.minorUnit);
  }
  if (toBaseMinor === null) {
    toBaseMinor = fromBaseMinor;
    toRate = impliedRate(toBaseMinor, to.currency.baseMinorUnit, to.amountMinor, to.currency.minorUnit);
  }
  if (fromBaseMinor <= 0 || toBaseMinor <= 0) throw new Error("The base-currency value of this transfer is zero.");
  return { fromBaseMinor, toBaseMinor, fromRate: fromRate!, toRate: toRate! };
}

export function createBankTransfer(businessId: string, userId: string, input: BankTransferInput) {
  assertMutationPermission(businessId, userId, "banking", "create", "post");
  const data = bankTransferInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    assertDateNotLocked(context.sqlite, data.date, "Bank transfer");
    const accounts = context.sqlite.prepare(`
      SELECT ba.id, ba.currency_code, ba.ledger_account_id, ba.is_active, a.is_active AS ledger_active
      FROM bank_accounts ba INNER JOIN accounts a ON a.id = ba.ledger_account_id
      WHERE ba.id IN (?, ?)
    `).all(data.fromBankAccountId, data.toBankAccountId) as {
      id: string; currency_code: string; ledger_account_id: string; is_active: number; ledger_active: number;
    }[];
    if (accounts.length !== 2 || accounts.some((account) => !account.is_active || !account.ledger_active)) {
      throw new Error("Choose two active Bank or Cash accounts.");
    }
    const source = accounts.find((account) => account.id === data.fromBankAccountId)!;
    const destination = accounts.find((account) => account.id === data.toBankAccountId)!;
    const fromCurrency = bankAccountCurrency(context.sqlite, source.id);
    const toCurrency = bankAccountCurrency(context.sqlite, destination.id);
    const amountMinor = parseCurrencyAmountToMinor(data.amount, fromCurrency.minorUnit, "Amount");
    let toAmountMinor = amountMinor;
    if (fromCurrency.code !== toCurrency.code) {
      if (!data.toAmount) throw new Error(`Enter the ${toCurrency.code} amount received.`);
      toAmountMinor = parseCurrencyAmountToMinor(data.toAmount, toCurrency.minorUnit, "Amount received");
    }
    const legs = valueTransferLegs(context.sqlite, data.date,
      { currency: fromCurrency, amountMinor },
      { currency: toCurrency, amountMinor: toAmountMinor });
    const realizedFxMinor = legs.toBaseMinor - legs.fromBaseMinor;
    const transferNumber = allocateNumber(context.sqlite, "bankTransfer");
    context.sqlite.prepare(`
      INSERT INTO bank_transfers (
        id, transfer_number, from_bank_account_id, to_bank_account_id, date,
        amount_minor, to_amount_minor, from_rate_to_base, to_rate_to_base,
        from_base_amount_minor, to_base_amount_minor, realized_fx_amount_minor,
        reference, description, document_status, created_by,
        created_at, posted_at, voided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, NULL)
    `).run(id, transferNumber, data.fromBankAccountId, data.toBankAccountId, data.date,
      amountMinor, toAmountMinor, legs.fromRate, legs.toRate, legs.fromBaseMinor, legs.toBaseMinor, realizedFxMinor,
      data.reference || null, data.description || null, userId, now, now);
    const lines: JournalLineInput[] = [
      {
        accountId: destination.ledger_account_id, description: data.description || `Transfer from ${transferNumber}`,
        debitMinor: legs.toBaseMinor, reference: transferNumber,
        currencyAmountMinor: toCurrency.isBase ? null : toAmountMinor,
      },
      {
        accountId: source.ledger_account_id, description: data.description || `Transfer to ${transferNumber}`,
        creditMinor: legs.fromBaseMinor, reference: transferNumber,
        currencyAmountMinor: fromCurrency.isBase ? null : -amountMinor,
      },
    ];
    if (realizedFxMinor !== 0) {
      const fx = context.sqlite.prepare(`
        SELECT realized_fx_gain_account_id AS gain, realized_fx_loss_account_id AS loss
        FROM business_accounting_settings WHERE id = 'default'
      `).get() as { gain: string | null; loss: string | null } | undefined;
      if (!fx?.gain || !fx.loss) throw new Error("Realized FX Gain/Loss accounts are not configured.");
      lines.push(realizedFxMinor > 0
        ? { accountId: fx.gain, description: `Realized FX gain on transfer ${transferNumber}`, creditMinor: realizedFxMinor, reference: transferNumber }
        : { accountId: fx.loss, description: `Realized FX loss on transfer ${transferNumber}`, debitMinor: -realizedFxMinor, reference: transferNumber });
    }
    postTransaction(context.sqlite, {
      sourceType: "bank_transfer", sourceId: id, date: data.date,
      description: `Bank Transfer ${transferNumber}`,
      lines,
    });
  }).immediate();
  return id;
}

export function getBankTransfer(businessId: string, userId: string, transferId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const transfer = sqlite.prepare(`
    SELECT bt.*, source.name AS from_account_name, destination.name AS to_account_name,
      source.currency_code AS from_currency_code, destination.currency_code AS to_currency_code
    FROM bank_transfers bt
    INNER JOIN bank_accounts source ON source.id = bt.from_bank_account_id
    INNER JOIN bank_accounts destination ON destination.id = bt.to_bank_account_id
    WHERE bt.id = ?
  `).get(transferId) as Record<string, unknown> | undefined;
  if (!transfer) return null;
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date FROM journal_entries
    WHERE source_id = ? AND source_type IN ('bank_transfer', 'bank_transfer_void')
    ORDER BY CASE source_type WHEN 'bank_transfer' THEN 0 ELSE 1 END
  `).all(transferId) as { id: string; entry_number: string; source_type: string; date: string }[];
  return { transfer, journals };
}

export function voidBankTransfer(businessId: string, userId: string, transferId: string) {
  assertMutationPermission(businessId, userId, "banking", "delete");
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    const transfer = context.sqlite.prepare(`
      SELECT transfer_number, document_status, date FROM bank_transfers WHERE id = ?
    `).get(transferId) as { transfer_number: string; document_status: string; date: string } | undefined;
    if (!transfer) throw new Error("Bank Transfer not found.");
    if (transfer.document_status !== "posted") throw new Error("Only a posted Bank Transfer can be voided.");
    assertDateNotLocked(context.sqlite, transfer.date, "Bank transfer");
    assertDateNotLocked(context.sqlite, getBusinessTodayIso(), "Bank transfer void");
    releaseStatementMatchesForSource(context.sqlite, "bank_transfer", transferId,
      "Cannot void a Bank Transfer included in a completed reconciliation.");
    reverseTransaction(context.sqlite, {
      originalSourceType: "bank_transfer", originalSourceId: transferId,
      reversalSourceType: "bank_transfer_void", reversalSourceId: transferId,
      date: getBusinessTodayIso(), description: `Reverse Bank Transfer ${transfer.transfer_number}`,
    });
    context.sqlite.prepare("UPDATE bank_transfers SET document_status = 'void', voided_at = ? WHERE id = ?")
      .run(now, transferId);
  }).immediate();
}
