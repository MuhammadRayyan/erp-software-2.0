export function journalSourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    sales_invoice: "Sales Invoice",
    sales_invoice_void: "Sales Invoice Void",
    sales_invoice_superseded: "Sales Invoice (superseded version)",
    sales_invoice_amendment: "Sales Invoice Amendment Reversal",
    receipt: "Receipt",
    receipt_void: "Receipt Reversal",
    sales_credit_note: "Sales Credit Note",
    sales_credit_note_void: "Sales Credit Note Void",
    purchase_invoice: "Purchase Invoice",
    purchase_invoice_void: "Purchase Invoice Void",
    purchase_invoice_superseded: "Purchase Invoice (superseded version)",
    purchase_invoice_amendment: "Purchase Invoice Amendment Reversal",
    sales_credit_note_allocation: "Credit Note Applied",
    debit_note_allocation: "Debit Note Applied",
    customer_refund: "Customer Refund",
    customer_refund_void: "Customer Refund Void",
    supplier_refund: "Supplier Refund",
    supplier_refund_void: "Supplier Refund Void",
    supplier_payment: "Supplier Payment",
    supplier_payment_void: "Supplier Payment Reversal",
    delivery_note: "Delivery Note",
    delivery_note_void: "Delivery Note Void",
    debit_note: "Debit Note",
    debit_note_void: "Debit Note Void",
    stock_adjustment: "Stock Adjustment",
    stock_adjustment_void: "Stock Adjustment Void",
    bank_transaction: "Bank Transaction",
    bank_transaction_void: "Bank Transaction Void",
    bank_transfer: "Bank Transfer",
    bank_transfer_void: "Bank Transfer Void",
    payslip: "Payslip",
    payslip_void: "Payslip Void",
    gratuity_accrual: "Gratuity Accrual",
    gratuity_accrual_reversal: "Gratuity Accrual Reversal",
    goods_receipt: "Goods Receipt",
    goods_receipt_void: "Goods Receipt Void",
    pdc_receive: "PDC Received / Issued",
    pdc_clear: "PDC Cleared",
    pdc_bounce: "PDC Bounced",
    pdc_cancel: "PDC Cancelled",
    opening_balance: "Opening Balance",
    fx_revaluation: "FX Revaluation",
    fx_revaluation_reversal: "FX Revaluation Reversal",
    fx_revaluation_void: "FX Revaluation Void",
    fx_revaluation_reversal_void: "FX Revaluation Reversal Void",
  };
  return labels[sourceType] ?? sourceType.replaceAll("_", " ");
}

export function journalSourceHref(businessId: string, sourceType: string, sourceId: string) {
  if (sourceType === "sales_invoice" || sourceType === "sales_invoice_void") {
    return `/b/${businessId}/sales/invoices/${sourceId}`;
  }
  // Amendment entries use `<documentId>:<revision>` as their source id.
  if (sourceType === "sales_invoice_superseded" || sourceType === "sales_invoice_amendment") {
    return `/b/${businessId}/sales/invoices/${sourceId.split(":")[0]}`;
  }
  if (sourceType === "purchase_invoice_superseded" || sourceType === "purchase_invoice_amendment") {
    return `/b/${businessId}/purchases/invoices/${sourceId.split(":")[0]}`;
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
  if (sourceType === "debit_note" || sourceType === "debit_note_void") {
    return `/b/${businessId}/purchases/debit-notes/${sourceId}`;
  }
  if (sourceType === "supplier_payment" || sourceType === "supplier_payment_void") {
    return `/b/${businessId}/purchases/payments/${sourceId}`;
  }
  if (sourceType === "delivery_note" || sourceType === "delivery_note_void") {
    return `/b/${businessId}/sales/delivery-notes/${sourceId}`;
  }
  if (sourceType === "goods_receipt" || sourceType === "goods_receipt_void") {
    return `/b/${businessId}/purchases/goods-receipts/${sourceId}`;
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
  if (sourceType === "payslip" || sourceType === "payslip_void") {
    return `/b/${businessId}/payroll/payslips/${sourceId}`;
  }
  if (sourceType.startsWith("fx_revaluation")) {
    return `/b/${businessId}/accounting/fx-revaluation?run=${sourceId}`;
  }
  if (sourceType === "gratuity_accrual" || sourceType === "gratuity_accrual_reversal") {
    return `/b/${businessId}/payroll/gratuity`;
  }
  if (sourceType === "customer_refund" || sourceType === "customer_refund_void") {
    return `/b/${businessId}/sales/credit-notes`;
  }
  if (sourceType === "supplier_refund" || sourceType === "supplier_refund_void") {
    return `/b/${businessId}/purchases/debit-notes`;
  }
  if (sourceType.startsWith("pdc_")) {
    return `/b/${businessId}/banking/pdcs`;
  }
  return null;
}
