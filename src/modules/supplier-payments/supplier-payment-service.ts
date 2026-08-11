import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { postSupplierPayment } from "@/modules/accounting/services/supplier-payment-posting-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { supplierPaymentInputSchema, type SupplierPaymentInput } from "./supplier-payment-input";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { calculateSettlementAllocation } from "@/modules/currency/settlement";
import { resolveRateSnapshot } from "@/modules/currency/validation";

function payableOpenState(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], invoiceId: string) {
  return sqlite.prepare(`
    SELECT pi.total_minor - COALESCE(SUM(
      CASE WHEN sp.document_status = 'posted' THEN spa.foreign_amount_allocated ELSE 0 END
    ), 0) AS foreign_open_minor,
    pi.base_total_minor - COALESCE(SUM(
      CASE WHEN sp.document_status = 'posted' THEN spa.base_carrying_amount_released ELSE 0 END
    ), 0) AS base_carrying_minor
    FROM purchase_invoices pi
    LEFT JOIN supplier_payment_allocations spa ON spa.purchase_invoice_id = pi.id
    LEFT JOIN supplier_payments sp ON sp.id = spa.payment_id
    WHERE pi.id = ? GROUP BY pi.id
  `).get(invoiceId) as { foreign_open_minor: number; base_carrying_minor: number };
}

export function createSupplierPayment(
  businessId: string,
  userId: string,
  input: SupplierPaymentInput,
) {
  const data = supplierPaymentInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const id = randomUUID();
  const now = new Date().toISOString();

  context.sqlite.transaction(() => {
    const supplier = context.sqlite
      .prepare("SELECT id FROM suppliers WHERE id = ?")
      .get(data.supplierId);
    if (!supplier) throw new Error("Supplier not found.");
    const invoice = context.sqlite.prepare(`
      SELECT id, supplier_id, total_minor, base_total_minor, currency_code, document_status
      FROM purchase_invoices
      WHERE id = ?
    `).get(data.purchaseInvoiceId) as {
      id: string;
      supplier_id: string;
      total_minor: number;
      base_total_minor: number;
      currency_code: string;
      document_status: string;
    } | undefined;
    if (!invoice || invoice.supplier_id !== data.supplierId) {
      throw new Error("Choose a posted purchase invoice belonging to this supplier.");
    }
    if (invoice.document_status !== "posted") {
      throw new Error("Payments can only be allocated to posted purchase invoices.");
    }
    if (input.currencyCode && input.currencyCode.toUpperCase() !== invoice.currency_code) {
      throw new Error(`This ${input.currencyCode.toUpperCase()} Supplier Payment can only allocate ${input.currencyCode.toUpperCase()} invoices.`);
    }
    const rate = resolveRateSnapshot(context.sqlite, {
      currencyCode: invoice.currency_code,
      exchangeRateToBase: data.exchangeRateToBase,
      exchangeRateDate: data.exchangeRateDate,
      exchangeRateSource: data.exchangeRateSource,
      relevantDate: data.date,
      enforceVatPolicy: false,
    });
    const amountMinor = parseCurrencyAmountToMinor(data.amount, rate.currencyMinorUnit);
    const open = payableOpenState(context.sqlite, invoice.id);
    if (amountMinor > open.foreign_open_minor) {
      throw new Error("Supplier payment exceeds the selected payable amount.");
    }
    const allocation = calculateSettlementAllocation({
      foreignAmountAllocated: amountMinor,
      foreignOpenBefore: open.foreign_open_minor,
      baseCarryingBefore: open.base_carrying_minor,
      rate,
    });

    const paymentNumber = allocateNumber(context.sqlite, "supplierPayment");
    context.sqlite.prepare(`
      INSERT INTO supplier_payments (
        id, payment_number, supplier_id, date, bank_account_id, amount_minor,
        currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
        base_amount_minor, released_carrying_amount_minor, realized_fx_amount_minor,
        reference, description, document_status, created_by, created_at,
        posted_at, voided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, NULL)
    `).run(
      id,
      paymentNumber,
      data.supplierId,
      data.date,
      data.bankAccountId,
      amountMinor,
      rate.currencyCode,
      rate.exchangeRateToBase,
      rate.exchangeRateDate,
      rate.exchangeRateSource,
      allocation.settlementBaseAmount,
      allocation.baseCarryingAmountReleased,
      allocation.realizedFxAmount,
      data.reference || null,
      data.description || null,
      userId,
      now,
      now,
    );
    context.sqlite.prepare(`
      INSERT INTO supplier_payment_allocations (
        id, payment_id, purchase_invoice_id, amount_minor, foreign_amount_allocated,
        base_carrying_amount_released, settlement_base_amount, realized_fx_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, invoice.id, amountMinor, allocation.foreignAmountAllocated,
      allocation.baseCarryingAmountReleased, allocation.settlementBaseAmount,
      allocation.realizedFxAmount);
    postSupplierPayment(context.sqlite, {
      id,
      paymentNumber,
      supplierId: data.supplierId,
      date: data.date,
      bankAccountId: data.bankAccountId,
      baseAmountMinor: allocation.settlementBaseAmount,
      releasedCarryingAmountMinor: allocation.baseCarryingAmountReleased,
      realizedFxAmountMinor: allocation.realizedFxAmount,
    });
  }).immediate();
  return { id, invoiceId: data.purchaseInvoiceId, supplierId: data.supplierId };
}

export function listAllSupplierPayments(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT sp.id, sp.payment_number, sp.date, sp.amount_minor, sp.base_amount_minor,
      sp.currency_code, cur.minor_unit AS currency_minor_unit, sp.reference,
      sp.document_status, sp.created_at, s.id AS supplier_id, s.name AS supplier_name,
      a.id AS bank_account_id, a.code AS bank_account_code, a.name AS bank_account_name
    FROM supplier_payments sp
    INNER JOIN suppliers s ON s.id = sp.supplier_id
    INNER JOIN accounts a ON a.id = sp.bank_account_id
    INNER JOIN currencies cur ON cur.code = sp.currency_code
    ORDER BY sp.date DESC, sp.created_at DESC
  `).all() as {
    id: string;
    payment_number: string;
    date: string;
    amount_minor: number;
    base_amount_minor: number;
    currency_code: string;
    currency_minor_unit: number;
    reference: string | null;
    document_status: "posted" | "void";
    created_at: string;
    supplier_id: string;
    supplier_name: string;
    bank_account_id: string;
    bank_account_code: string;
    bank_account_name: string;
  }[];
}

export function getSupplierPayment(
  businessId: string,
  userId: string,
  paymentId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const payment = sqlite.prepare(`
    SELECT sp.*, s.name AS supplier_name, s.email AS supplier_email,
      a.code AS bank_account_code, a.name AS bank_account_name
    FROM supplier_payments sp
    INNER JOIN suppliers s ON s.id = sp.supplier_id
    INNER JOIN accounts a ON a.id = sp.bank_account_id
    WHERE sp.id = ?
  `).get(paymentId) as Record<string, unknown> | undefined;
  if (!payment) return null;
  const allocations = sqlite.prepare(`
    SELECT spa.id, spa.amount_minor, spa.base_carrying_amount_released,
      pi.id AS invoice_id, pi.internal_number
    FROM supplier_payment_allocations spa
    INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
    WHERE spa.payment_id = ?
    ORDER BY pi.internal_number
  `).all(paymentId) as {
    id: string;
    amount_minor: number;
    base_carrying_amount_released: number;
    invoice_id: string;
    internal_number: string;
  }[];
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date
    FROM journal_entries
    WHERE source_id = ? AND source_type IN ('supplier_payment', 'supplier_payment_void')
    ORDER BY CASE source_type WHEN 'supplier_payment' THEN 0 ELSE 1 END
  `).all(paymentId) as {
    id: string;
    entry_number: string;
    source_type: "supplier_payment" | "supplier_payment_void";
    date: string;
  }[];
  return { payment, allocations, journals };
}

export function voidSupplierPayment(
  businessId: string,
  userId: string,
  paymentId: string,
) {
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    const payment = context.sqlite.prepare(`
      SELECT payment_number, document_status
      FROM supplier_payments
      WHERE id = ?
    `).get(paymentId) as {
      payment_number: string;
      document_status: "posted" | "void";
    } | undefined;
    if (!payment) throw new Error("Supplier Payment not found.");
    if (payment.document_status !== "posted") {
      throw new Error("Only a posted Supplier Payment can be reversed.");
    }
    const statementLine = context.sqlite.prepare(`
      SELECT id FROM bank_statement_lines
      WHERE matched_source_type = 'supplier_payment' AND matched_source_id = ?
    `).get(paymentId) as { id: string } | undefined;
    if (statementLine && context.sqlite.prepare(`
      SELECT 1 FROM bank_reconciliation_items bri
      INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
      WHERE bri.statement_line_id = ?
    `).get(statementLine.id)) {
      throw new Error("Cannot reverse a Supplier Payment included in a completed bank reconciliation.");
    }
    reverseTransaction(context.sqlite, {
      originalSourceType: "supplier_payment",
      originalSourceId: paymentId,
      reversalSourceType: "supplier_payment_void",
      reversalSourceId: paymentId,
      date: now.slice(0, 10),
      description: `Reverse Supplier Payment ${payment.payment_number}`,
    });
    context.sqlite.prepare(`
      UPDATE supplier_payments
      SET document_status = 'void', voided_at = ?
      WHERE id = ?
    `).run(now, paymentId);
    if (statementLine) context.sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'unmatched', matched_source_type = NULL,
        matched_source_id = NULL WHERE id = ?
    `).run(statementLine.id);
  }).immediate();
}

export function listSupplierPayments(
  businessId: string,
  userId: string,
  supplierId: string,
) {
  return getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT sp.id, sp.payment_number, sp.date, sp.amount_minor, sp.currency_code,
      cur.minor_unit AS currency_minor_unit, sp.reference,
      pi.id AS invoice_id, pi.internal_number
    FROM supplier_payments sp
    INNER JOIN supplier_payment_allocations spa ON spa.payment_id = sp.id
    INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
    INNER JOIN currencies cur ON cur.code = sp.currency_code
    WHERE sp.supplier_id = ? AND sp.document_status = 'posted'
    ORDER BY sp.date DESC, sp.created_at DESC
  `).all(supplierId) as {
    id: string;
    payment_number: string;
    date: string;
    amount_minor: number;
    currency_code: string;
    currency_minor_unit: number;
    reference: string | null;
    invoice_id: string;
    internal_number: string;
  }[];
}
