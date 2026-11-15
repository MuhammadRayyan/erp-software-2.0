export function getRelatedDocumentPath(
  businessId: string,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string | null {
  if (!entityType || !entityId) return null;
  const normalized = entityType.trim().toLowerCase().replace(/-/g, "_");
  switch (normalized) {
    case "sales_invoice":
      return `/b/${businessId}/sales/invoices/${entityId}`;
    case "sales_quote":
      return `/b/${businessId}/sales/quotes/${entityId}`;
    case "sales_order":
      return `/b/${businessId}/sales/orders/${entityId}`;
    case "sales_receipt":
    case "receipt":
      return `/b/${businessId}/sales/receipts/${entityId}`;
    case "sales_credit_note":
    case "credit_note":
      return `/b/${businessId}/sales/credit-notes/${entityId}`;
    case "delivery_note":
      return `/b/${businessId}/sales/delivery-notes/${entityId}`;
    case "purchase_invoice":
      return `/b/${businessId}/purchases/invoices/${entityId}`;
    case "purchase_order":
      return `/b/${businessId}/purchases/orders/${entityId}`;
    case "purchase_quote":
      return `/b/${businessId}/purchases/quotes/${entityId}`;
    case "debit_note":
      return `/b/${businessId}/purchases/debit-notes/${entityId}`;
    case "goods_receipt":
      return `/b/${businessId}/purchases/goods-receipts/${entityId}`;
    case "supplier_payment":
    case "purchase_payment":
    case "payment":
      return `/b/${businessId}/purchases/payments/${entityId}`;
    default:
      return null;
  }
}
