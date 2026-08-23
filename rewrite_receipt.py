file_path = "src/modules/receipts/receipt-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

import re

# We will just rewrite the entire file since it's cleaner.

new_content = """import { getBusinessDb } from "@/core/db/business";
import { postReceipt } from "@/modules/accounting/services/receipt-posting-service";
import { receiptInputSchema, type ReceiptInput } from "./receipt-input";
import { createSettlement, voidSettlement, type SettlementConfig } from "@/modules/settlement/settlement-service";

const receiptConfig: SettlementConfig = {
  partyType: "customer",
  partyTable: "customers",
  partyIdColumn: "customer_id",
  documentTable: "sales_invoices",
  documentIdColumn: "sales_invoice_id",
  documentNumberColumn: "invoice_number",
  openAmountExpr: `
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
    WHERE i.id = ? GROUP BY i.id
  `,
  paymentTable: "receipts",
  paymentNumberColumn: "receipt_number",
  allocationTable: "receipt_allocations",
  allocationPaymentIdColumn: "receipt_id",
  postSettlement: postReceipt,
};

export function createReceipt(businessId: string, userId: string, input: ReceiptInput) {
  const data = receiptInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  let result: any;
  context.sqlite.transaction(() => {
    result = createSettlement(context.sqlite, receiptConfig, data, userId);
  }).immediate();
  return result;
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
  `).all() as any[];
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
  `).get(receiptId) as any;
  if (!receipt) return null;
  const allocations = sqlite.prepare(`
    SELECT ra.id, ra.amount_minor, ra.base_carrying_amount_released,
      i.id AS invoice_id, i.invoice_number
    FROM receipt_allocations ra
    INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
    WHERE ra.receipt_id = ?
    ORDER BY i.invoice_number
  `).all(receiptId) as any[];
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date
    FROM journal_entries
    WHERE source_id = ? AND source_type IN ('receipt', 'receipt_void')
    ORDER BY CASE source_type WHEN 'receipt' THEN 0 ELSE 1 END
  `).all(receiptId) as any[];
  return { receipt, allocations, journals };
}

export function voidReceipt(businessId: string, userId: string, receiptId: string) {
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    voidSettlement(context.sqlite, receiptConfig, receiptId);
  }).immediate();
}

export function listReceiptsForCustomer(businessId: string, userId: string, customerId: string) {
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
  `).all(customerId) as any[];
}
"""

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
