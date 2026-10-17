import { randomUUID } from "node:crypto";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { parseCurrencyAmountToMinor, convertToBase } from "@/modules/currency/conversion";
import { calculateSettlementAllocation } from "@/modules/currency/settlement";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { getBaseCurrency } from "@/modules/currency/currency";

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
  const execute = () => {
    const id = randomUUID();
    const now = new Date().toISOString();

    const partyId = data.customerId || data.supplierId;

    const party = sqlite.prepare(`SELECT * FROM ${config.partyTable} WHERE id = ?`).get(partyId) as any;
    if (!party) throw new Error("Invalid party ID.");

    // Support both multi-allocation array and single invoiceId
    const rawAllocations: Array<{ invoiceId: string; amount: string }> =
      Array.isArray(data.allocations) && data.allocations.length > 0
        ? data.allocations
        : (data.invoiceId || data.purchaseInvoiceId)
        ? [{ invoiceId: data.invoiceId || data.purchaseInvoiceId, amount: data.amount }]
        : [];

    const baseCur = getBaseCurrency(sqlite);

    // Determine settlement currency
    let currencyCode = data.currencyCode ? String(data.currencyCode).toUpperCase() : "";
    if (!currencyCode && rawAllocations.length > 0) {
      const firstDoc = sqlite.prepare(
        `SELECT currency_code FROM ${config.documentTable} WHERE id = ?`
      ).get(rawAllocations[0].invoiceId) as { currency_code: string } | undefined;
      currencyCode = firstDoc ? firstDoc.currency_code : baseCur.code;
    } else if (!currencyCode) {
      currencyCode = party.default_currency_code || baseCur.code;
    }

    const rate = resolveRateSnapshot(sqlite, {
      currencyCode,
      exchangeRateToBase: data.exchangeRateToBase,
      exchangeRateDate: data.exchangeRateDate,
      exchangeRateSource: data.exchangeRateSource,
      relevantDate: data.date,
      enforceVatPolicy: false,
    });

    const totalAmountMinor = parseCurrencyAmountToMinor(data.amount, rate.currencyMinorUnit);
    if (totalAmountMinor <= 0) {
      throw new Error("Settlement amount must be greater than zero.");
    }

    let sumAllocatedForeign = 0;
    let sumBaseCarryingReleased = 0;
    let sumSettlementBase = 0;
    let sumRealizedFx = 0;

    const allocationsToInsert: Array<{
      documentId: string;
      amountMinor: number;
      foreignAmountAllocated: number;
      baseCarryingAmountReleased: number;
      settlementBaseAmount: number;
      realizedFxAmount: number;
    }> = [];

    for (const alloc of rawAllocations) {
      const docId = alloc.invoiceId;
      const invoice = sqlite.prepare(`
        SELECT id, currency_code, ${config.documentNumberColumn} AS doc_number
        FROM ${config.documentTable}
        WHERE id = ? AND ${config.partyIdColumn} = ? AND document_status = 'posted'
      `).get(docId, partyId) as any;
      if (!invoice) throw new Error("Invoice not found or not posted.");

      if (invoice.currency_code !== rate.currencyCode) {
        const typeLabel = config.partyType === "customer" ? "Receipt" : "Payment";
        throw new Error(`This ${rate.currencyCode} ${typeLabel} can only allocate ${rate.currencyCode} invoices.`);
      }

      const open = getOpenState(sqlite, config, invoice.id);
      if (!open || open.foreign_open_minor <= 0) {
        throw new Error(
          config.partyType === "customer"
            ? `Invoice ${invoice.doc_number} is already fully settled.`
            : `Payable ${invoice.doc_number} is already fully settled.`
        );
      }

      const allocAmountMinor = parseCurrencyAmountToMinor(alloc.amount, rate.currencyMinorUnit);
      if (allocAmountMinor <= 0) {
        throw new Error("Allocation amount must be greater than zero.");
      }

      if (allocAmountMinor > open.foreign_open_minor) {
        throw new Error(
          config.partyType === "customer"
            ? `Receipt allocation cannot exceed the invoice balance.`
            : `Payment amount exceeds the selected payable.`
        );
      }

      const allocationCalc = calculateSettlementAllocation({
        foreignAmountAllocated: allocAmountMinor,
        foreignOpenBefore: open.foreign_open_minor,
        baseCarryingBefore: open.base_carrying_minor,
        rate,
      });

      sumAllocatedForeign += allocAmountMinor;
      sumBaseCarryingReleased += allocationCalc.baseCarryingAmountReleased;
      sumSettlementBase += allocationCalc.settlementBaseAmount;
      sumRealizedFx += allocationCalc.realizedFxAmount;

      allocationsToInsert.push({
        documentId: invoice.id,
        amountMinor: allocAmountMinor,
        foreignAmountAllocated: allocationCalc.foreignAmountAllocated,
        baseCarryingAmountReleased: allocationCalc.baseCarryingAmountReleased,
        settlementBaseAmount: allocationCalc.settlementBaseAmount,
        realizedFxAmount: allocationCalc.realizedFxAmount,
      });
    }

    if (sumAllocatedForeign > totalAmountMinor) {
      throw new Error(
        config.partyType === "customer"
          ? "Total allocated to invoices exceeds the receipt amount."
          : "Total allocated to payables exceeds the payment amount."
      );
    }

    const unallocatedForeign = totalAmountMinor - sumAllocatedForeign;
    if (unallocatedForeign > 0) {
      const unallocatedBase = convertToBase(
        unallocatedForeign,
        rate.currencyMinorUnit,
        baseCur.minor_unit,
        rate.exchangeRateToBase,
      );
      sumSettlementBase += unallocatedBase;
      sumBaseCarryingReleased += unallocatedBase;
    }

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
      id, paymentNumber, partyId, data.date, data.bankAccountId, totalAmountMinor,
      rate.currencyCode, rate.exchangeRateToBase, rate.exchangeRateDate, rate.exchangeRateSource,
      sumSettlementBase, sumBaseCarryingReleased, sumRealizedFx,
      data.reference || null, data.description || null, userId, now, now
    );

    for (const item of allocationsToInsert) {
      sqlite.prepare(`
        INSERT INTO ${config.allocationTable} (
          id, ${config.allocationPaymentIdColumn}, ${config.documentIdColumn}, amount_minor, foreign_amount_allocated,
          base_carrying_amount_released, settlement_base_amount, realized_fx_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(), id, item.documentId, item.amountMinor, item.foreignAmountAllocated,
        item.baseCarryingAmountReleased, item.settlementBaseAmount, item.realizedFxAmount
      );
    }

    config.postSettlement(sqlite, {
      id,
      [config.paymentNumberColumn]: paymentNumber,
      [config.partyIdColumn]: partyId,
      date: data.date,
      bankAccountId: data.bankAccountId,
      baseAmountMinor: sumSettlementBase,
      releasedCarryingAmountMinor: sumBaseCarryingReleased,
      realizedFxAmountMinor: sumRealizedFx,
    });

    const firstInvoiceId = allocationsToInsert[0]?.documentId || data.invoiceId || data.purchaseInvoiceId;
    return { id, invoiceId: firstInvoiceId, partyId, unallocatedMinor: unallocatedForeign };
  };

  if (sqlite.inTransaction) {
    return execute();
  }
  return sqlite.transaction(execute)();
}

export function applySettlementCredit(
  sqlite: any,
  config: SettlementConfig,
  data: {
    paymentId: string;
    documentId: string;
    amount: string | number;
  },
) {
  const execute = () => {
    const payment = sqlite.prepare(`
      SELECT id, ${config.paymentNumberColumn} AS payment_number, ${config.partyIdColumn} AS party_id,
        amount_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
        document_status, date
      FROM ${config.paymentTable}
      WHERE id = ?
    `).get(data.paymentId) as any;
    if (!payment) throw new Error("Payment record not found.");
    if (payment.document_status !== "posted") throw new Error("Only posted payments can be allocated.");

    // Calculate current allocated total for this payment
    const currentAllocated = sqlite.prepare(`
      SELECT COALESCE(SUM(foreign_amount_allocated), 0) AS total_allocated
      FROM ${config.allocationTable}
      WHERE ${config.allocationPaymentIdColumn} = ?
    `).get(data.paymentId) as { total_allocated: number };

    const availableCredit = payment.amount_minor - currentAllocated.total_allocated;
    if (availableCredit <= 0) throw new Error("No unallocated credit available on this payment.");

    const rate = resolveRateSnapshot(sqlite, {
      currencyCode: payment.currency_code,
      exchangeRateToBase: payment.exchange_rate_to_base,
      exchangeRateDate: payment.exchange_rate_date,
      exchangeRateSource: payment.exchange_rate_source,
      relevantDate: payment.date,
      enforceVatPolicy: false,
    });

    const allocAmountMinor =
      typeof data.amount === "number"
        ? Math.round(data.amount)
        : parseCurrencyAmountToMinor(data.amount, rate.currencyMinorUnit);
    if (allocAmountMinor <= 0) throw new Error("Allocation amount must be greater than zero.");
    if (allocAmountMinor > availableCredit) {
      throw new Error("Allocation amount exceeds available unallocated credit.");
    }

    const invoice = sqlite.prepare(`
      SELECT id, currency_code, ${config.documentNumberColumn} AS doc_number
      FROM ${config.documentTable}
      WHERE id = ? AND ${config.partyIdColumn} = ? AND document_status = 'posted'
    `).get(data.documentId, payment.party_id) as any;
    if (!invoice) throw new Error("Invoice not found or not posted.");

    if (invoice.currency_code !== payment.currency_code) {
      throw new Error(`Cannot allocate ${payment.currency_code} credit to a ${invoice.currency_code} invoice.`);
    }

    const open = getOpenState(sqlite, config, invoice.id);
    if (!open || open.foreign_open_minor <= 0) {
      throw new Error(`Invoice ${invoice.doc_number} is already fully settled.`);
    }
    if (allocAmountMinor > open.foreign_open_minor) {
      throw new Error(`Allocation amount exceeds invoice ${invoice.doc_number} balance.`);
    }

    const allocationCalc = calculateSettlementAllocation({
      foreignAmountAllocated: allocAmountMinor,
      foreignOpenBefore: open.foreign_open_minor,
      baseCarryingBefore: open.base_carrying_minor,
      rate,
    });

    const allocId = randomUUID();
    sqlite.prepare(`
      INSERT INTO ${config.allocationTable} (
        id, ${config.allocationPaymentIdColumn}, ${config.documentIdColumn}, amount_minor, foreign_amount_allocated,
        base_carrying_amount_released, settlement_base_amount, realized_fx_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      allocId, payment.id, invoice.id, allocAmountMinor, allocationCalc.foreignAmountAllocated,
      allocationCalc.baseCarryingAmountReleased, allocationCalc.settlementBaseAmount, allocationCalc.realizedFxAmount
    );

    return { ok: true, allocationId: allocId, allocatedMinor: allocAmountMinor };
  };

  if (sqlite.inTransaction) {
    return execute();
  }
  return sqlite.transaction(execute)();
}

export function voidSettlement(
  sqlite: any,
  config: SettlementConfig,
  paymentId: string
) {
  const execute = () => {
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
    `).get(config.partyType === "customer" ? "receipt" : "supplier_payment", paymentId) as any;

    if (statementLine && sqlite.prepare(`
      SELECT 1 FROM bank_reconciliation_items bri
      INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
      WHERE bri.statement_line_id = ?
    `).get(statementLine.id)) {
      throw new Error("Cannot reverse a payment included in a completed bank reconciliation.");
    }

    reverseTransaction(sqlite, {
      originalSourceType: config.partyType === "customer" ? "receipt" : "supplier_payment",
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
  };

  if (sqlite.inTransaction) {
    return execute();
  }
  return sqlite.transaction(execute)();
}
