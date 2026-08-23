import { randomUUID } from "node:crypto";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { calculateSettlementAllocation } from "@/modules/currency/settlement";
import { resolveRateSnapshot } from "@/modules/currency/validation";

export type SettlementConfig = {
  partyType: "customer" | "supplier";
  partyTable: string;
  partyIdColumn: string;
  documentTable: string;
  documentIdColumn: string;
  documentNumberColumn: string;
  openAmountExpr: string;
  paymentTable: string;
  paymentNumberColumn: string;
  allocationTable: string;
  allocationPaymentIdColumn: string;
  postSettlement: (sqlite: any, payload: any) => void;
};

export function getOpenState(sqlite: any, config: SettlementConfig, invoiceId: string) {
  return sqlite.prepare(config.openAmountExpr).get(invoiceId) as {
    foreign_open_minor: number;
    base_carrying_minor: number;
  };
}

export function createSettlement(
  sqlite: any,
  config: SettlementConfig,
  data: any,
  userId: string
) {
  const id = randomUUID();
  const now = new Date().toISOString();

  const partyId = data.customerId || data.supplierId;

  const party = sqlite.prepare(`SELECT id FROM ${config.partyTable} WHERE id = ?`).get(partyId);
  if (!party) throw new Error("Invalid party ID.");

  const invoiceId = data.invoiceId || data.purchaseInvoiceId;
  const invoice = sqlite.prepare(`
    SELECT id, currency_code
    FROM ${config.documentTable}
    WHERE id = ? AND ${config.partyIdColumn} = ? AND document_status = 'posted'
  `).get(invoiceId, partyId) as any;
  if (!invoice) throw new Error("Invoice not found or not posted.");

  const rate = resolveRateSnapshot(sqlite, {
    currencyCode: invoice.currency_code,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: data.date,
    enforceVatPolicy: false,
  });

  const amountMinor = parseCurrencyAmountToMinor(data.amount, rate.currencyMinorUnit);
  const open = getOpenState(sqlite, config, invoice.id);

  if (amountMinor > open.foreign_open_minor) {
    throw new Error("Amount cannot exceed the balance.");
  }

  const allocation = calculateSettlementAllocation({
    foreignAmountAllocated: amountMinor,
    foreignOpenBefore: open.foreign_open_minor,
    baseCarryingBefore: open.base_carrying_minor,
    rate,
  });

  const paymentNumber = allocateNumber(sqlite, config.partyType === "customer" ? "receipt" : "supplierPayment");

  sqlite.prepare(`
    INSERT INTO ${config.paymentTable} (
      id, ${config.paymentNumberColumn}, ${config.partyIdColumn}, date, bank_account_id, amount_minor,
      currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
      base_amount_minor, released_carrying_amount_minor, realized_fx_amount_minor,
      reference, description, document_status, created_by, created_at,
      posted_at, voided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, NULL)
  `).run(
    id, paymentNumber, partyId, data.date, data.bankAccountId, amountMinor,
    rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource,
    allocation.settlementBaseAmount, allocation.baseCarryingAmountReleased, allocation.realizedFxAmount,
    data.reference || null, data.description || null, userId, now, now
  );

  sqlite.prepare(`
    INSERT INTO ${config.allocationTable} (
      id, ${config.allocationPaymentIdColumn}, ${config.documentIdColumn}, amount_minor, foreign_amount_allocated,
      base_carrying_amount_released, settlement_base_amount, realized_fx_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), id, invoice.id, amountMinor, allocation.foreignAmountAllocated,
    allocation.baseCarryingAmountReleased, allocation.settlementBaseAmount, allocation.realizedFxAmount);

  config.postSettlement(sqlite, {
    id,
    [config.paymentNumberColumn]: paymentNumber,
    [config.partyIdColumn]: partyId,
    date: data.date,
    bankAccountId: data.bankAccountId,
    baseAmountMinor: allocation.settlementBaseAmount,
    releasedCarryingAmountMinor: allocation.baseCarryingAmountReleased,
    realizedFxAmountMinor: allocation.realizedFxAmount,
  });

  return { id, invoiceId, partyId };
}

export function voidSettlement(
  sqlite: any,
  config: SettlementConfig,
  paymentId: string
) {
  const now = new Date().toISOString();
  
  const payment = sqlite.prepare(`
    SELECT ${config.paymentNumberColumn} AS payment_number, document_status
    FROM ${config.paymentTable}
    WHERE id = ?
  `).get(paymentId) as any;
  if (!payment) throw new Error("Payment not found.");
  if (payment.document_status !== "posted") {
    throw new Error("Only a posted payment can be reversed.");
  }

  const statementLine = sqlite.prepare(`
    SELECT id FROM bank_statement_lines
    WHERE matched_source_type = ? AND matched_source_id = ?
  `).get(config.partyType === "customer" ? "receipt" : "supplierPayment", paymentId) as any;

  if (statementLine && sqlite.prepare(`
    SELECT 1 FROM bank_reconciliation_items bri
    INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
    WHERE bri.statement_line_id = ?
  `).get(statementLine.id)) {
    throw new Error("Cannot reverse a payment included in a completed bank reconciliation.");
  }

  reverseTransaction(sqlite, {
    originalSourceType: config.partyType === "customer" ? "receipt" : "supplierPayment",
    originalSourceId: paymentId,
    reversalSourceType: config.partyType === "customer" ? "receipt_void" : "supplier_payment_void",
    reversalSourceId: paymentId,
    date: now.slice(0, 10),
    description: `Reverse ${config.partyType === "customer" ? "Receipt" : "Payment"} ${payment.payment_number}`,
  });

  sqlite.prepare(`
    UPDATE ${config.paymentTable}
    SET document_status = 'void', voided_at = ?
    WHERE id = ?
  `).run(now, paymentId);

  if (statementLine) {
    sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'unmatched', matched_source_type = NULL,
        matched_source_id = NULL WHERE id = ?
    `).run(statementLine.id);
  }
}
