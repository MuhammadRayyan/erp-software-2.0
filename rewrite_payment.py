file_path = "src/modules/supplier-payments/supplier-payment-service.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

new_content = """import { getBusinessDb } from "@/core/db/business";
import { postSupplierPayment } from "@/modules/accounting/services/supplier-payment-posting-service";
import { supplierPaymentInputSchema, type SupplierPaymentInput } from "./supplier-payment-input";
import { createSettlement, voidSettlement, type SettlementConfig } from "@/modules/settlement/settlement-service";

const paymentConfig: SettlementConfig = {
  partyType: "supplier",
  partyTable: "suppliers",
  partyIdColumn: "supplier_id",
  documentTable: "purchase_invoices",
  documentIdColumn: "purchase_invoice_id",
  documentNumberColumn: "internal_number",
  openAmountExpr: `
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
  `,
  paymentTable: "supplier_payments",
  paymentNumberColumn: "payment_number",
  allocationTable: "supplier_payment_allocations",
  allocationPaymentIdColumn: "payment_id",
  postSettlement: postSupplierPayment,
};

export function createSupplierPayment(businessId: string, userId: string, input: SupplierPaymentInput) {
  const data = supplierPaymentInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  let result: any;
  context.sqlite.transaction(() => {
    result = createSettlement(context.sqlite, paymentConfig, data, userId);
  }).immediate();
  return result;
}

export function listSupplierPayments(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT sp.id, sp.payment_number, sp.date, sp.amount_minor, sp.base_amount_minor, sp.currency_code,
      cur.minor_unit AS currency_minor_unit, sp.reference,
      sp.document_status, sp.created_at, s.id AS supplier_id, s.name AS supplier_name,
      a.id AS bank_account_id, a.code AS bank_account_code, a.name AS bank_account_name
    FROM supplier_payments sp
    INNER JOIN suppliers s ON s.id = sp.supplier_id
    INNER JOIN accounts a ON a.id = sp.bank_account_id
    INNER JOIN currencies cur ON cur.code = sp.currency_code
    ORDER BY sp.date DESC, sp.created_at DESC
  `).all() as any[];
}

export function getSupplierPayment(businessId: string, userId: string, paymentId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const payment = sqlite.prepare(`
    SELECT sp.*, s.name AS supplier_name, s.email AS supplier_email,
      a.code AS bank_account_code, a.name AS bank_account_name
    FROM supplier_payments sp
    INNER JOIN suppliers s ON s.id = sp.supplier_id
    INNER JOIN accounts a ON a.id = sp.bank_account_id
    WHERE sp.id = ?
  `).get(paymentId) as any;
  if (!payment) return null;
  const allocations = sqlite.prepare(`
    SELECT spa.id, spa.amount_minor, spa.base_carrying_amount_released,
      pi.id AS invoice_id, pi.internal_number
    FROM supplier_payment_allocations spa
    INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
    WHERE spa.payment_id = ?
    ORDER BY pi.internal_number
  `).all(paymentId) as any[];
  const journals = sqlite.prepare(`
    SELECT id, entry_number, source_type, date
    FROM journal_entries
    WHERE source_id = ? AND source_type IN ('supplier_payment', 'supplier_payment_void')
    ORDER BY CASE source_type WHEN 'supplier_payment' THEN 0 ELSE 1 END
  `).all(paymentId) as any[];
  return { payment, allocations, journals };
}

export function voidSupplierPayment(businessId: string, userId: string, paymentId: string) {
  const context = getBusinessDb(businessId, userId);
  context.sqlite.transaction(() => {
    voidSettlement(context.sqlite, paymentConfig, paymentId);
  }).immediate();
}

export function listPaymentsForSupplier(businessId: string, userId: string, supplierId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT sp.id, sp.payment_number, sp.date, sp.amount_minor, sp.currency_code,
      cur.minor_unit AS currency_minor_unit, sp.reference,
      pi.id AS invoice_id, pi.internal_number
    FROM supplier_payments sp
    INNER JOIN supplier_payment_allocations spa ON spa.payment_id = sp.id
    INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
    INNER JOIN currencies cur ON cur.code = sp.currency_code
    WHERE sp.supplier_id = ? AND sp.document_status = 'posted'
    ORDER BY sp.date DESC, sp.created_at DESC
  `).all(supplierId) as any[];
}
"""

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
