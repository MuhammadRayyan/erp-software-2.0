import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import { postReceipt } from "@/modules/accounting/services/receipt-posting-service";
import { reverseTransaction } from "@/modules/accounting/services/posting-service";
import { receiptInputSchema, type ReceiptInput } from "./receipt-input";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { calculateSettlementAllocation } from "@/modules/currency/settlement";
import { resolveRateSnapshot } from "@/modules/currency/validation";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];

function invoiceOpenState(sqlite: Sqlite, invoiceId: string) {
  const row = sqlite.prepare(`
    SELECT i.total_minor - COALESCE(SUM(
      CASE WHEN r.document_status = 'posted' THEN ra.foreign_amount_allocated ELSE 0 END
    ), 0) - COALESCE((
      SELECT SUM(scna.foreign_amount_allocated)
      FROM sales_credit_note_allocations scna
      INNER JOIN sales_credit_notes scn
        ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
      WHERE scna.sales_invoice_id = i.id
    ), 0) AS foreign_open_minor,
    i.base_total_minor - COALESCE(SUM(
      CASE WHEN r.document_status = 'posted' THEN ra.base_carrying_amount_released ELSE 0 END
    ), 0) - COALESCE((
      SELECT SUM(scna.base_carrying_amount_released)
      FROM sales_credit_note_allocations scna
      INNER JOIN sales_credit_notes scn
        ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
      WHERE scna.sales_invoice_id = i.id
    ), 0) AS base_carrying_minor
    FROM sales_invoices i
    LEFT JOIN receipt_allocations ra ON ra.sales_invoice_id = i.id
    LEFT JOIN receipts r ON r.id = ra.receipt_id
    WHERE i.id = ?
    GROUP BY i.id
  `).get(invoiceId) as { foreign_open_minor: number; base_carrying_minor: number } | undefined;
  return row ?? { foreign_open_minor: 0, base_carrying_minor: 0 };
}

export function createReceipt(
  businessId: string,
  userId: string,
  input: ReceiptInput,
) {
  const data = receiptInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const id = randomUUID();
  const now = new Date().toISOString();

  context.sqlite.transaction(() => {
    const customer = context.sqlite
      .prepare("SELECT id FROM customers WHERE id = ?")
      .get(data.customerId);
    if (!customer) throw new Error("Customer not found.");
    const invoice = context.sqlite.prepare(`
      SELECT id, customer_id, document_status, currency_code, base_total_minor
      FROM sales_invoices
      WHERE id = ?
    `).get(data.invoiceId) as {
      id: string;
      customer_id: string;
      document_status: string;
      currency_code: string;
      base_total_minor: number;
    } | undefined;
    if (!invoice || invoice.customer_id !== data.customerId) {
      throw new Error("Choose a posted invoice belonging to this customer.");
    }
    if (invoice.document_status !== "posted") {
      throw new Error("Receipts can only be allocated to posted invoices.");
    }
    if (input.currencyCode && input.currencyCode.toUpperCase() !== invoice.currency_code) {
      throw new Error(`This ${input.currencyCode.toUpperCase()} Receipt can only allocate ${input.currencyCode.toUpperCase()} invoices.`);
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
    const open = invoiceOpenState(context.sqlite, invoice.id);
    if (amountMinor > open.foreign_open_minor) {
      throw new Error("Receipt amount cannot exceed the invoice balance.");
    }
    const allocation = calculateSettlementAllocation({
      foreignAmountAllocated: amountMinor,
      foreignOpenBefore: open.foreign_open_minor,
      baseCarryingBefore: open.base_carrying_minor,
      rate,
    });

    const receiptNumber = allocateNumber(context.sqlite, "receipt");
    context.sqlite.prepare(`
      INSERT INTO receipts (
        id, receipt_number, customer_id, date, bank_account_id, amount_minor,
        currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
        base_amount_minor, released_carrying_amount_minor, realized_fx_amount_minor,
        reference, description, document_status, created_by, created_at,
        posted_at, voided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, NULL)
    `).run(
      id,
      receiptNumber,
      data.customerId,
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
      INSERT INTO receipt_allocations (
        id, receipt_id, sales_invoice_id, amount_minor, foreign_amount_allocated,
        base_carrying_amount_released, settlement_base_amount, realized_fx_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, invoice.id, amountMinor, allocation.foreignAmountAllocated,
      allocation.baseCarryingAmountReleased, allocation.settlementBaseAmount,
      allocation.realizedFxAmount);
    postReceipt(context.sqlite, {
      id,
      receiptNumber,
      customerId: data.customerId,
      date: data.date,
      bankAccountId: data.bankAccountId,
      baseAmountMinor: allocation.settlementBaseAmount,
      releasedCarryingAmountMinor: allocation.baseCarryingAmountReleased,
      realizedFxAmountMinor: allocation.realizedFxAmount,
    });
  }).immediate();
  return { id, invoiceId: data.invoiceId, customerId: data.customerId };
}

export function listReceipts(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT r.id, r.receipt_number, r.date, r.amount_minor, r.base_amount_minor, r.currency_code,
      cur.minor_unit AS currency_minor_unit, r.reference,
      r.document_status, r.created_at, c.id AS customer_id, c.name AS customer_name,
      a.id AS bank_account_id, a.code AS bank_account_code, a.name AS bank_account_name
    FROM receipts r
    INNER JOIN customers c ON c.id = r.customer_id
    INNER JOIN accounts a ON a.id = r.bank_account_id
    INNER JOIN currencies cur ON cur.code = r.currency_code
    ORDER BY r.date DESC, r.created_at DESC
  `).all() as {
    id: string;
    receipt_number: string;
    date: string;
    amount_minor: number;
    base_amount_minor: number;
    currency_code: string;
    currency_minor_unit: number;
    reference: string | null;
    document_status: "posted" | "void";
    created_at: string;
    customer_id: string;
    customer_name: string;
    bank_account_id: string;
    bank_account_code: string;
    bank_account_name: string;
  }[];
}

export function getReceipt(businessId: string, userId: string, receiptId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const receipt = sqlite.prepare(`
    SELECT r.*, c.name AS customer_name, c.email AS customer_email,
      a.code AS bank_account_code, a.name AS bank_account_name
    FROM receipts r
    INNER JOIN customers c ON c.id = r.customer_id
    INNER JOIN accounts a ON a.id = r.bank_account_id
    WHERE r.id = ?
  `).get(receiptId) as Record<string, unknown> | undefined;
  if (!receipt) return null;
  const allocations = sqlite.prepare(`
    SELECT ra.id, ra.amount_minor, ra.base_carrying_amount_released,
      i.id AS invoice_id, i.invoice_number
    FROM receipt_allocations ra
    INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
    WHERE ra.receipt_id = ?
    ORDER BY i.invoice_number
  `).all(receiptId) as {
    id: string;
    amount_minor: number;
    base_carrying_amount_released: number;
    invoice_id: string;
    invoice_number: string;
  }[];
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date
    FROM journal_entries
    WHERE source_id = ? AND source_type IN ('receipt', 'receipt_void')
    ORDER BY CASE source_type WHEN 'receipt' THEN 0 ELSE 1 END
  `).all(receiptId) as {
    id: string;
    entry_number: string;
    source_type: "receipt" | "receipt_void";
    date: string;
  }[];
  return { receipt, allocations, journals };
}

export function voidReceipt(businessId: string, userId: string, receiptId: string) {
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  context.sqlite.transaction(() => {
    const receipt = context.sqlite.prepare(`
      SELECT receipt_number, document_status
      FROM receipts
      WHERE id = ?
    `).get(receiptId) as {
      receipt_number: string;
      document_status: "posted" | "void";
    } | undefined;
    if (!receipt) throw new Error("Receipt not found.");
    if (receipt.document_status !== "posted") {
      throw new Error("Only a posted Receipt can be reversed.");
    }
    const statementLine = context.sqlite.prepare(`
      SELECT id FROM bank_statement_lines
      WHERE matched_source_type = 'receipt' AND matched_source_id = ?
    `).get(receiptId) as { id: string } | undefined;
    if (statementLine && context.sqlite.prepare(`
      SELECT 1 FROM bank_reconciliation_items bri
      INNER JOIN bank_reconciliations br ON br.id = bri.reconciliation_id AND br.status = 'completed'
      WHERE bri.statement_line_id = ?
    `).get(statementLine.id)) {
      throw new Error("Cannot reverse a Receipt included in a completed bank reconciliation.");
    }
    reverseTransaction(context.sqlite, {
      originalSourceType: "receipt",
      originalSourceId: receiptId,
      reversalSourceType: "receipt_void",
      reversalSourceId: receiptId,
      date: now.slice(0, 10),
      description: `Reverse Receipt ${receipt.receipt_number}`,
    });
    context.sqlite.prepare(`
      UPDATE receipts
      SET document_status = 'void', voided_at = ?
      WHERE id = ?
    `).run(now, receiptId);
    if (statementLine) context.sqlite.prepare(`
      UPDATE bank_statement_lines SET match_status = 'unmatched', matched_source_type = NULL,
        matched_source_id = NULL WHERE id = ?
    `).run(statementLine.id);
  }).immediate();
}

export function listReceiptsForCustomer(
  businessId: string,
  userId: string,
  customerId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT r.id, r.receipt_number, r.date, r.amount_minor, r.currency_code,
      cur.minor_unit AS currency_minor_unit, r.reference,
      i.id AS invoice_id, i.invoice_number
    FROM receipts r
    INNER JOIN receipt_allocations ra ON ra.receipt_id = r.id
    INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
    INNER JOIN currencies cur ON cur.code = r.currency_code
    WHERE r.customer_id = ? AND r.document_status = 'posted'
    ORDER BY r.date DESC, r.created_at DESC
  `).all(customerId) as {
    id: string;
    receipt_number: string;
    date: string;
    amount_minor: number;
    currency_code: string;
    currency_minor_unit: number;
    reference: string | null;
    invoice_id: string;
    invoice_number: string;
  }[];
}
