import type Database from "better-sqlite3";

export type NumberKind =
  | "invoice"
  | "receipt"
  | "creditNote"
  | "purchaseOrder"
  | "purchaseInvoice"
  | "supplierPayment"
  | "salesQuote"
  | "salesOrder"
  | "project"
  | "goodsReceipt"
  | "deliveryNote"
  | "stockAdjustment"
  | "bankTransaction"
  | "bankTransfer"
  | "journal";

const columns: Record<NumberKind, { prefix: string; next: string; padding?: string }> = {
  invoice: { prefix: "invoice_prefix", next: "invoice_next_number", padding: "invoice_padding" },
  receipt: { prefix: "receipt_prefix", next: "receipt_next_number" },
  creditNote: { prefix: "credit_note_prefix", next: "credit_note_next_number" },
  purchaseOrder: { prefix: "purchase_order_prefix", next: "purchase_order_next_number" },
  purchaseInvoice: { prefix: "purchase_invoice_prefix", next: "purchase_invoice_next_number" },
  supplierPayment: { prefix: "supplier_payment_prefix", next: "supplier_payment_next_number" },
  salesQuote: { prefix: "sales_quote_prefix", next: "sales_quote_next_number", padding: "sales_quote_padding" },
  salesOrder: { prefix: "sales_order_prefix", next: "sales_order_next_number", padding: "sales_order_padding" },
  project: { prefix: "project_prefix", next: "project_next_number", padding: "project_padding" },
  goodsReceipt: { prefix: "goods_receipt_prefix", next: "goods_receipt_next_number", padding: "goods_receipt_padding" },
  deliveryNote: { prefix: "delivery_note_prefix", next: "delivery_note_next_number", padding: "delivery_note_padding" },
  stockAdjustment: { prefix: "stock_adjustment_prefix", next: "stock_adjustment_next_number", padding: "stock_adjustment_padding" },
  bankTransaction: { prefix: "bank_transaction_prefix", next: "bank_transaction_next_number", padding: "bank_transaction_padding" },
  bankTransfer: { prefix: "bank_transfer_prefix", next: "bank_transfer_next_number", padding: "bank_transfer_padding" },
  journal: { prefix: "journal_prefix", next: "journal_next_number" },
};

export function allocateNumber(sqlite: Database.Database, kind: NumberKind) {
  if (!sqlite.inTransaction) throw new Error("Number allocation must run inside a database transaction.");
  const config = columns[kind];
  const row = sqlite
    .prepare(
      `SELECT ${config.prefix} AS prefix, ${config.next} AS next_number${
        config.padding ? `, ${config.padding} AS padding` : ""
      } FROM business_accounting_settings WHERE id = 'default'`,
    )
    .get() as { prefix: string; next_number: number; padding?: number } | undefined;
  if (!row) throw new Error("Accounting numbering is not configured for this business.");

  const padding = row.padding ?? 5;
  const uniqueness = {
    invoice: { table: "sales_invoices", column: "invoice_number" },
    receipt: { table: "receipts", column: "receipt_number" },
    creditNote: { table: "sales_credit_notes", column: "credit_note_number" },
    purchaseOrder: { table: "purchase_orders", column: "order_number" },
    purchaseInvoice: { table: "purchase_invoices", column: "internal_number" },
    supplierPayment: { table: "supplier_payments", column: "payment_number" },
    salesQuote: { table: "sales_quotes", column: "quote_number" },
    salesOrder: { table: "sales_orders", column: "order_number" },
    project: { table: "projects", column: "code" },
    goodsReceipt: { table: "goods_receipts", column: "receipt_number" },
    deliveryNote: { table: "delivery_notes", column: "delivery_number" },
    stockAdjustment: { table: "stock_adjustments", column: "adjustment_number" },
    bankTransaction: { table: "bank_transactions", column: "transaction_number" },
    bankTransfer: { table: "bank_transfers", column: "transfer_number" },
    journal: { table: "journal_entries", column: "entry_number" },
  }[kind];
  let nextNumber = row.next_number;
  let number = `${row.prefix}${String(nextNumber).padStart(padding, "0")}`;
  while (
    sqlite
      .prepare(`SELECT 1 FROM ${uniqueness.table} WHERE ${uniqueness.column} = ? LIMIT 1`)
      .get(number)
  ) {
    nextNumber += 1;
    number = `${row.prefix}${String(nextNumber).padStart(padding, "0")}`;
  }
  sqlite
    .prepare(
      `UPDATE business_accounting_settings SET ${config.next} = ?, updated_at = ? WHERE id = 'default'`,
    )
    .run(nextNumber + 1, new Date().toISOString());
  return number;
}
