import { getBusinessDb } from "@/core/db/business";
import type { ProjectStatus } from "./project-input";
import { convertToBase } from "@/modules/currency/conversion";

export type ProjectDocumentRow = {
  id: string;
  number: string;
  date: string;
  party: string;
  status: string;
  netMinor: number;
  totalMinor: number;
  foreignNetMinor: number;
  foreignTotalMinor: number;
  currencyCode: string;
};

function salesInvoices(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], projectId: string) {
  return sqlite.prepare(`
    SELECT i.id, i.invoice_number AS number, i.invoice_date AS date, c.name AS party,
      i.document_status AS status, i.total_minor, i.base_total_minor, i.currency_code,
      i.exchange_rate_to_base, ccy.minor_unit,
      SUM(CASE WHEN COALESCE(l.project_id, i.project_id) = ? THEN l.net_amount_minor ELSE 0 END) AS net_minor
    FROM sales_invoices i
    INNER JOIN customers c ON c.id = i.customer_id
    INNER JOIN currencies ccy ON ccy.code = i.currency_code
    INNER JOIN sales_invoice_lines l ON l.invoice_id = i.id
    GROUP BY i.id
    HAVING net_minor <> 0 OR i.project_id = ?
    ORDER BY i.invoice_date DESC, i.created_at DESC
  `).all(projectId, projectId) as Record<string, string | number>[];
}

function creditNotes(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], projectId: string) {
  return sqlite.prepare(`
    SELECT n.id, n.credit_note_number AS number, n.date, c.name AS party,
      n.document_status AS status, n.total_minor, n.base_total_minor, n.currency_code,
      n.exchange_rate_to_base, ccy.minor_unit,
      SUM(CASE WHEN COALESCE(l.project_id, n.project_id) = ? THEN l.net_amount_minor ELSE 0 END) AS net_minor
    FROM sales_credit_notes n
    INNER JOIN customers c ON c.id = n.customer_id
    INNER JOIN currencies ccy ON ccy.code = n.currency_code
    INNER JOIN sales_credit_note_lines l ON l.credit_note_id = n.id
    GROUP BY n.id
    HAVING net_minor <> 0 OR n.project_id = ?
    ORDER BY n.date DESC, n.created_at DESC
  `).all(projectId, projectId) as Record<string, string | number>[];
}

function purchaseOrders(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], projectId: string) {
  return sqlite.prepare(`
    SELECT o.id, o.order_number AS number, o.date, s.name AS party, o.status,
      o.total_minor, o.base_total_minor, o.currency_code, o.exchange_rate_to_base, ccy.minor_unit,
      SUM(CASE WHEN COALESCE(l.project_id, o.project_id) = ? THEN l.net_amount_minor ELSE 0 END) AS net_minor
    FROM purchase_orders o
    INNER JOIN suppliers s ON s.id = o.supplier_id
    INNER JOIN currencies ccy ON ccy.code = o.currency_code
    INNER JOIN purchase_order_lines l ON l.purchase_order_id = o.id
    GROUP BY o.id
    HAVING net_minor <> 0 OR o.project_id = ?
    ORDER BY o.date DESC, o.created_at DESC
  `).all(projectId, projectId) as Record<string, string | number>[];
}

function purchaseInvoices(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], projectId: string) {
  return sqlite.prepare(`
    SELECT i.id, i.internal_number AS number, i.invoice_date AS date, s.name AS party,
      i.document_status AS status, i.total_minor, i.base_total_minor, i.currency_code,
      i.exchange_rate_to_base, ccy.minor_unit,
      SUM(CASE WHEN COALESCE(l.project_id, i.project_id) = ? THEN l.net_amount_minor ELSE 0 END) AS net_minor
    FROM purchase_invoices i
    INNER JOIN suppliers s ON s.id = i.supplier_id
    INNER JOIN currencies ccy ON ccy.code = i.currency_code
    INNER JOIN purchase_invoice_lines l ON l.purchase_invoice_id = i.id
    GROUP BY i.id
    HAVING net_minor <> 0 OR i.project_id = ?
    ORDER BY i.invoice_date DESC, i.created_at DESC
  `).all(projectId, projectId) as Record<string, string | number>[];
}

function normalizeDocuments(rows: Record<string, string | number>[], baseMinorUnit: number): ProjectDocumentRow[] {
  return rows.map((row) => ({
    id: String(row.id), number: String(row.number), date: String(row.date), party: String(row.party),
    status: String(row.status),
    netMinor: convertToBase(Number(row.net_minor), Number(row.minor_unit), baseMinorUnit, String(row.exchange_rate_to_base)),
    totalMinor: Number(row.base_total_minor),
    foreignNetMinor: Number(row.net_minor), foreignTotalMinor: Number(row.total_minor),
    currencyCode: String(row.currency_code),
  }));
}

function attributableReceipts(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], projectId: string) {
  return sqlite.prepare(`
    WITH invoice_projects AS (
      SELECT i.id,
        COUNT(DISTINCT COALESCE(l.project_id, i.project_id)) AS project_count,
        MAX(COALESCE(l.project_id, i.project_id)) AS project_id,
        SUM(CASE WHEN COALESCE(l.project_id, i.project_id) IS NULL THEN 1 ELSE 0 END) AS unassigned_count
      FROM sales_invoices i
      INNER JOIN sales_invoice_lines l ON l.invoice_id = i.id
      GROUP BY i.id
    )
    SELECT r.id, r.receipt_number AS number, r.date, r.base_amount_minor AS amount_minor,
      ra.base_carrying_amount_released AS allocated_minor, i.id AS invoice_id, i.invoice_number
    FROM receipt_allocations ra
    INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
    INNER JOIN sales_invoices i ON i.id = ra.sales_invoice_id
    INNER JOIN invoice_projects ip ON ip.id = i.id AND ip.project_count = 1 AND ip.unassigned_count = 0 AND ip.project_id = ?
    ORDER BY r.date DESC, r.created_at DESC
  `).all(projectId) as {
    id: string; number: string; date: string; amount_minor: number; allocated_minor: number;
    invoice_id: string; invoice_number: string;
  }[];
}

function attributablePayments(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], projectId: string) {
  return sqlite.prepare(`
    WITH invoice_projects AS (
      SELECT i.id,
        COUNT(DISTINCT COALESCE(l.project_id, i.project_id)) AS project_count,
        MAX(COALESCE(l.project_id, i.project_id)) AS project_id,
        SUM(CASE WHEN COALESCE(l.project_id, i.project_id) IS NULL THEN 1 ELSE 0 END) AS unassigned_count
      FROM purchase_invoices i
      INNER JOIN purchase_invoice_lines l ON l.purchase_invoice_id = i.id
      GROUP BY i.id
    )
    SELECT p.id, p.payment_number AS number, p.date, p.base_amount_minor AS amount_minor,
      pa.base_carrying_amount_released AS allocated_minor, i.id AS invoice_id, i.internal_number AS invoice_number
    FROM supplier_payment_allocations pa
    INNER JOIN supplier_payments p ON p.id = pa.payment_id AND p.document_status = 'posted'
    INNER JOIN purchase_invoices i ON i.id = pa.purchase_invoice_id
    INNER JOIN invoice_projects ip ON ip.id = i.id AND ip.project_count = 1 AND ip.unassigned_count = 0 AND ip.project_id = ?
    ORDER BY p.date DESC, p.created_at DESC
  `).all(projectId) as {
    id: string; number: string; date: string; amount_minor: number; allocated_minor: number;
    invoice_id: string; invoice_number: string;
  }[];
}

export function getProjectOperationalView(businessId: string, userId: string, projectId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const baseMinorUnit = (sqlite.prepare(`SELECT c.minor_unit FROM currencies c INNER JOIN business_currency_settings bcs ON bcs.base_currency_code = c.code WHERE bcs.id = 'default'`).get() as { minor_unit: number }).minor_unit;
  const invoices = normalizeDocuments(salesInvoices(sqlite, projectId), baseMinorUnit);
  const notes = normalizeDocuments(creditNotes(sqlite, projectId), baseMinorUnit);
  const orders = normalizeDocuments(purchaseOrders(sqlite, projectId), baseMinorUnit);
  const bills = normalizeDocuments(purchaseInvoices(sqlite, projectId), baseMinorUnit);
  const receipts = attributableReceipts(sqlite, projectId);
  const payments = attributablePayments(sqlite, projectId);
  const postedInvoices = invoices.filter((row) => row.status === "posted");
  const postedBills = bills.filter((row) => row.status === "posted");
  const nonCancelledOrders = orders.filter((row) => row.status !== "cancelled");

  const outstanding = sqlite.prepare(`
    WITH invoice_projects AS (
      SELECT i.id,
        COUNT(DISTINCT COALESCE(l.project_id, i.project_id)) AS project_count,
        MAX(COALESCE(l.project_id, i.project_id)) AS project_id,
        SUM(CASE WHEN COALESCE(l.project_id, i.project_id) IS NULL THEN 1 ELSE 0 END) AS unassigned_count
      FROM sales_invoices i
      INNER JOIN sales_invoice_lines l ON l.invoice_id = i.id
      WHERE i.document_status = 'posted'
      GROUP BY i.id
    )
    SELECT COALESCE(SUM(MAX(0, i.base_total_minor
      - COALESCE((SELECT SUM(ra.base_carrying_amount_released) FROM receipt_allocations ra INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted' WHERE ra.sales_invoice_id = i.id), 0)
      - COALESCE((SELECT SUM(ca.base_carrying_amount_released) FROM sales_credit_note_allocations ca INNER JOIN sales_credit_notes n ON n.id = ca.credit_note_id AND n.document_status = 'posted' WHERE ca.sales_invoice_id = i.id), 0)
    )), 0) AS amount_minor
    FROM sales_invoices i
    INNER JOIN invoice_projects ip ON ip.id = i.id AND ip.project_count = 1 AND ip.unassigned_count = 0 AND ip.project_id = ?
  `).get(projectId) as { amount_minor: number };

  const projectNotes = sqlite.prepare(`SELECT id, body, created_by, created_at, updated_at FROM project_notes WHERE project_id = ? ORDER BY created_at DESC`).all(projectId) as {
    id: string; body: string; created_by: string; created_at: string; updated_at: string | null;
  }[];
  const attachments = sqlite.prepare(`SELECT id, original_name, mime_type, size_bytes, created_at FROM project_attachments WHERE project_id = ? ORDER BY created_at DESC`).all(projectId) as {
    id: string; original_name: string; mime_type: string; size_bytes: number; created_at: string;
  }[];

  const activity = [
    ...invoices.map((row) => ({ id: `invoice-${row.id}`, at: row.date, label: `Sales Invoice ${row.number} ${row.status}`, amountMinor: row.totalMinor, href: `/sales/invoices/${row.id}` })),
    ...notes.map((row) => ({ id: `credit-${row.id}`, at: row.date, label: `Sales Credit Note ${row.number} ${row.status}`, amountMinor: -row.totalMinor, href: `/sales/credit-notes/${row.id}` })),
    ...orders.map((row) => ({ id: `order-${row.id}`, at: row.date, label: `Purchase Order ${row.number} ${row.status}`, amountMinor: row.totalMinor, href: `/purchases/orders/${row.id}` })),
    ...bills.map((row) => ({ id: `bill-${row.id}`, at: row.date, label: `Purchase Invoice ${row.number} ${row.status}`, amountMinor: row.totalMinor, href: `/purchases/invoices/${row.id}` })),
    ...projectNotes.map((row) => ({ id: `note-${row.id}`, at: row.created_at, label: "Project note added", amountMinor: null, href: null })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);

  return {
    salesInvoices: invoices,
    creditNotes: notes,
    purchaseOrders: orders,
    purchaseInvoices: bills,
    receipts,
    payments,
    notes: projectNotes,
    attachments,
    activity,
    metrics: {
      quotedMinor: null,
      invoicedMinor: postedInvoices.reduce((sum, row) => sum + row.netMinor, 0),
      collectedMinor: receipts.reduce((sum, row) => sum + row.allocated_minor, 0),
      outstandingMinor: outstanding.amount_minor,
      committedMinor: nonCancelledOrders.reduce((sum, row) => sum + row.netMinor, 0),
      purchasedMinor: postedBills.reduce((sum, row) => sum + row.netMinor, 0),
      paidMinor: payments.reduce((sum, row) => sum + row.allocated_minor, 0),
    },
  };
}

export function getProjectProfitability(
  businessId: string,
  userId: string,
  filters: { dateFrom?: string; dateTo?: string; status?: string; customerId?: string },
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions = ["je.status = 'posted'", "a.type IN ('income', 'expense')"];
  const values: string[] = [];
  if (filters.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom)) { conditions.push("je.date >= ?"); values.push(filters.dateFrom); }
  if (filters.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)) { conditions.push("je.date <= ?"); values.push(filters.dateTo); }
  const outerConditions: string[] = [];
  if (filters.status && ["draft", "active", "on_hold", "completed", "cancelled"].includes(filters.status)) { outerConditions.push("p.status = ?"); values.push(filters.status); }
  if (filters.customerId) { outerConditions.push("p.customer_id = ?"); values.push(filters.customerId); }
  return sqlite.prepare(`
    WITH actuals AS (
      SELECT jl.project_id,
        SUM(CASE WHEN a.type = 'income' THEN jl.credit_minor - jl.debit_minor ELSE 0 END) AS revenue_minor,
        SUM(CASE WHEN a.type = 'expense' THEN jl.debit_minor - jl.credit_minor ELSE 0 END) AS cost_minor
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id
      WHERE jl.project_id IS NOT NULL AND ${conditions.join(" AND ")}
      GROUP BY jl.project_id
    )
    SELECT p.id, p.code, p.name, p.status, p.customer_id, c.name AS customer_name,
      COALESCE(actuals.revenue_minor, 0) AS revenue_minor,
      COALESCE(actuals.cost_minor, 0) AS cost_minor
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN actuals ON actuals.project_id = p.id
    ${outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : ""}
    ORDER BY p.code
  `).all(...values) as {
    id: string; code: string; name: string; status: ProjectStatus; customer_id: string | null;
    customer_name: string | null; revenue_minor: number; cost_minor: number;
  }[];
}
