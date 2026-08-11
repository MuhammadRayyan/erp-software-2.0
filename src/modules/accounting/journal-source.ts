export function journalSourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    sales_invoice: "Sales Invoice",
    sales_invoice_void: "Sales Invoice Void",
    receipt: "Receipt",
    receipt_void: "Receipt Reversal",
    sales_credit_note: "Sales Credit Note",
    sales_credit_note_void: "Sales Credit Note Void",
    purchase_invoice: "Purchase Invoice",
    purchase_invoice_void: "Purchase Invoice Void",
    supplier_payment: "Supplier Payment",
    supplier_payment_void: "Supplier Payment Reversal",
    delivery_note: "Delivery Note",
    delivery_note_void: "Delivery Note Void",
    stock_adjustment: "Stock Adjustment",
    stock_adjustment_void: "Stock Adjustment Void",
    bank_transaction: "Bank Transaction",
    bank_transaction_void: "Bank Transaction Void",
    bank_transfer: "Bank Transfer",
    bank_transfer_void: "Bank Transfer Void",
  };
  return labels[sourceType] ?? sourceType.replaceAll("_", " ");
}

export function journalSourceHref(businessId: string, sourceType: string, sourceId: string) {
  if (sourceType === "sales_invoice" || sourceType === "sales_invoice_void") {
    return `/b/${businessId}/sales/invoices/${sourceId}`;
  }
  if (sourceType === "receipt" || sourceType === "receipt_void") {
    return `/b/${businessId}/sales/receipts/${sourceId}`;
  }
  if (sourceType === "sales_credit_note" || sourceType === "sales_credit_note_void") {
    return `/b/${businessId}/sales/credit-notes/${sourceId}`;
  }
  if (sourceType === "purchase_invoice" || sourceType === "purchase_invoice_void") {
    return `/b/${businessId}/purchases/invoices/${sourceId}`;
  }
  if (sourceType === "supplier_payment" || sourceType === "supplier_payment_void") {
    return `/b/${businessId}/purchases/payments/${sourceId}`;
  }
  if (sourceType === "delivery_note" || sourceType === "delivery_note_void") {
    return `/b/${businessId}/sales/delivery-notes/${sourceId}`;
  }
  if (sourceType === "stock_adjustment" || sourceType === "stock_adjustment_void") {
    return `/b/${businessId}/inventory/adjustments/${sourceId}`;
  }
  if (sourceType === "bank_transaction" || sourceType === "bank_transaction_void") {
    return `/b/${businessId}/banking/transactions/${sourceId}`;
  }
  if (sourceType === "bank_transfer" || sourceType === "bank_transfer_void") {
    return `/b/${businessId}/banking/transfers/${sourceId}`;
  }
  return null;
}
