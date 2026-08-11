import { getBusinessDb } from "@/core/db/business";

type CustomerStatementRow = {
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

export function getCustomerStatement(
  businessId: string,
  userId: string,
  customerId: string,
  currencyCode?: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const rows = sqlite.prepare(`
    SELECT i.invoice_date AS date, i.invoice_number AS entry_number,
      'sales_invoice' AS source_type, i.id AS source_id,
      'Sales Invoice ' || i.invoice_number AS description, i.reference,
      i.currency_code, i.total_minor AS debit_minor, 0 AS credit_minor,
      i.base_total_minor AS base_debit_minor, 0 AS base_credit_minor
    FROM sales_invoices i
    WHERE i.customer_id = ? AND i.document_status = 'posted'
    UNION ALL
    SELECT r.date, r.receipt_number, 'receipt', r.id,
      'Customer Receipt ' || r.receipt_number, r.reference,
      r.currency_code, 0, ra.foreign_amount_allocated,
      0, ra.base_carrying_amount_released
    FROM receipts r INNER JOIN receipt_allocations ra ON ra.receipt_id = r.id
    WHERE r.customer_id = ? AND r.document_status = 'posted'
    UNION ALL
    SELECT scn.date, scn.credit_note_number, 'sales_credit_note', scn.id,
      'Sales Credit Note ' || scn.credit_note_number, scn.reference,
      scn.currency_code, 0, scna.foreign_amount_allocated,
      0, scna.base_carrying_amount_released
    FROM sales_credit_notes scn
    INNER JOIN sales_credit_note_allocations scna ON scna.credit_note_id = scn.id
    WHERE scn.customer_id = ? AND scn.document_status = 'posted'
    ORDER BY date, entry_number
  `).all(customerId, customerId, customerId) as CustomerStatementRow[];
  const filtered = currencyCode
    ? rows.filter((row) => row.currency_code === currencyCode.toUpperCase())
    : rows;
  const balances = new Map<string, number>();
  return filtered.map((row) => {
    const balanceMinor = (balances.get(row.currency_code) ?? 0) + row.debit_minor - row.credit_minor;
    balances.set(row.currency_code, balanceMinor);
    return { ...row, balanceMinor };
  });
}

export function getCustomerAccountingSummary(
  businessId: string,
  userId: string,
  customerId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const invoices = sqlite.prepare(`
    SELECT COALESCE(SUM(base_total_minor), 0) AS total FROM sales_invoices
    WHERE customer_id = ? AND document_status = 'posted'
  `).get(customerId) as { total: number };
  const receipts = sqlite.prepare(`
    SELECT COALESCE(SUM(released_carrying_amount_minor), 0) AS total FROM receipts
    WHERE customer_id = ? AND document_status = 'posted'
  `).get(customerId) as { total: number };
  const credits = sqlite.prepare(`
    SELECT COALESCE(SUM(base_total_minor), 0) AS total FROM sales_credit_notes
    WHERE customer_id = ? AND document_status = 'posted'
  `).get(customerId) as { total: number };
  return {
    totalInvoicedMinor: invoices.total,
    totalReceivedMinor: receipts.total,
    totalCreditedMinor: credits.total,
    outstandingMinor: invoices.total - receipts.total - credits.total,
  };
}

