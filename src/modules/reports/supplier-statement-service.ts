import { getBusinessDb } from "@/core/db/business";

type SupplierStatementRow = {
  date: string;
  entry_number: string;
  source_type: string;
  source_id: string;
  description: string;
  reference: string | null;
  currency_code: string;
  debit_minor: number;
  credit_minor: number;
  base_debit_minor: number;
  base_credit_minor: number;
};

export function getSupplierStatement(
  businessId: string,
  userId: string,
  supplierId: string,
  currencyCode?: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT pi.invoice_date AS date, pi.internal_number AS entry_number,
      'purchase_invoice' AS source_type, pi.id AS source_id,
      'Purchase Invoice ' || pi.internal_number AS description, pi.reference,
      pi.currency_code, 0 AS debit_minor, pi.total_minor AS credit_minor,
      0 AS base_debit_minor, pi.base_total_minor AS base_credit_minor
    FROM purchase_invoices pi
    WHERE pi.supplier_id = ? AND pi.document_status = 'posted'
    UNION ALL
    SELECT sp.date, sp.payment_number, 'supplier_payment', sp.id,
      'Supplier Payment ' || sp.payment_number, sp.reference,
      sp.currency_code, spa.foreign_amount_allocated, 0,
      spa.base_carrying_amount_released, 0
    FROM supplier_payments sp
    INNER JOIN supplier_payment_allocations spa ON spa.payment_id = sp.id
    WHERE sp.supplier_id = ? AND sp.document_status = 'posted'
    ORDER BY date, entry_number
  `).all(supplierId, supplierId) as SupplierStatementRow[];
  const filtered = currencyCode
    ? rows.filter((row) => row.currency_code === currencyCode.toUpperCase())
    : rows;
  const balances = new Map<string, number>();
  return filtered.map((row) => {
    const balanceMinor = (balances.get(row.currency_code) ?? 0) + row.credit_minor - row.debit_minor;
    balances.set(row.currency_code, balanceMinor);
    return { ...row, balanceMinor };
  });
}

export function getSupplierAccountingSummary(businessId: string, userId: string, supplierId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const purchased = sqlite.prepare(`
    SELECT COALESCE(SUM(base_total_minor), 0) AS total FROM purchase_invoices
    WHERE supplier_id = ? AND document_status = 'posted'
  `).get(supplierId) as { total: number };
  const paid = sqlite.prepare(`
    SELECT COALESCE(SUM(released_carrying_amount_minor), 0) AS total FROM supplier_payments
    WHERE supplier_id = ? AND document_status = 'posted'
  `).get(supplierId) as { total: number };
  return { totalPurchasedMinor: purchased.total, totalPaidMinor: paid.total, outstandingMinor: purchased.total - paid.total };
}

