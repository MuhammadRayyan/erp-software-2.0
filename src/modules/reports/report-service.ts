import { getBusinessDb } from "@/core/db/business";

export type LedgerFilters = {
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  customerId?: string;
};

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function getGeneralLedger(
  businessId: string,
  userId: string,
  filters: LedgerFilters,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions = ["je.status = 'posted'"];
  const values: string[] = [];
  const dateFrom = validDate(filters.dateFrom);
  const dateTo = validDate(filters.dateTo);
  if (dateFrom) {
    conditions.push("je.date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("je.date <= ?");
    values.push(dateTo);
  }
  if (filters.accountId) {
    conditions.push("a.id = ?");
    values.push(filters.accountId);
  }
  if (filters.customerId) {
    conditions.push("jl.customer_id = ?");
    values.push(filters.customerId);
  }
  const opening = new Map<string, number>();
  if (dateFrom) {
    const openingConditions = ["je.status = 'posted'", "je.date < ?"];
    const openingValues = [dateFrom];
    if (filters.accountId) {
      openingConditions.push("a.id = ?");
      openingValues.push(filters.accountId);
    }
    if (filters.customerId) {
      openingConditions.push("jl.customer_id = ?");
      openingValues.push(filters.customerId);
    }
    const openingRows = sqlite.prepare(`
      SELECT a.id AS account_id, a.type AS account_type,
        COALESCE(SUM(jl.debit_minor), 0) AS debit_minor,
        COALESCE(SUM(jl.credit_minor), 0) AS credit_minor
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id
      WHERE ${openingConditions.join(" AND ")}
      GROUP BY a.id
    `).all(...openingValues) as {
      account_id: string;
      account_type: "asset" | "liability" | "equity" | "income" | "expense";
      debit_minor: number;
      credit_minor: number;
    }[];
    for (const row of openingRows) {
      const naturalDebit = row.account_type === "asset" || row.account_type === "expense";
      opening.set(
        row.account_id,
        naturalDebit
          ? row.debit_minor - row.credit_minor
          : row.credit_minor - row.debit_minor,
      );
    }
  }
  const rows = sqlite
    .prepare(`
      SELECT je.id AS journal_entry_id, je.entry_number, je.date, je.source_type,
             je.source_id, jl.position, jl.description, jl.debit_minor,
             jl.credit_minor, jl.reference, a.id AS account_id, a.code,
             a.name AS account_name, a.type AS account_type
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.code, je.date, je.entry_number, jl.position
    `)
    .all(...values) as {
      journal_entry_id: string;
      entry_number: string;
      date: string;
      source_type: string;
      source_id: string;
      position: number;
      description: string;
      debit_minor: number;
      credit_minor: number;
      reference: string | null;
      account_id: string;
      code: string;
      account_name: string;
      account_type: "asset" | "liability" | "equity" | "income" | "expense";
    }[];
  const running = new Map(opening);
  return rows.map((row) => {
    const naturalDebit = row.account_type === "asset" || row.account_type === "expense";
    const movement = naturalDebit
      ? row.debit_minor - row.credit_minor
      : row.credit_minor - row.debit_minor;
    const balanceMinor = (running.get(row.account_id) ?? 0) + movement;
    running.set(row.account_id, balanceMinor);
    return {
      ...row,
      openingBalanceMinor: opening.get(row.account_id) ?? 0,
      balanceMinor,
    };
  });
}

export function getTrialBalance(businessId: string, userId: string, throughDate?: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const date = validDate(throughDate) ?? "9999-12-31";
  const rows = sqlite
    .prepare(`
      SELECT a.id, a.code, a.name, a.type,
             COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_minor ELSE 0 END), 0)
               AS debit_total,
             COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_minor ELSE 0 END), 0)
               AS credit_total
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je
        ON je.id = jl.journal_entry_id AND je.status = 'posted' AND je.date <= ?
      GROUP BY a.id
      ORDER BY a.code
    `)
    .all(date) as {
      id: string;
      code: string;
      name: string;
      type: string;
      debit_total: number;
      credit_total: number;
    }[];
  const accounts = rows
    .map((row) => {
      const net = row.debit_total - row.credit_total;
      return {
        ...row,
        debitMinor: net > 0 ? net : 0,
        creditMinor: net < 0 ? -net : 0,
      };
    })
    .filter((row) => row.debitMinor !== 0 || row.creditMinor !== 0);
  return {
    accounts,
    debitMinor: accounts.reduce((sum, row) => sum + row.debitMinor, 0),
    creditMinor: accounts.reduce((sum, row) => sum + row.creditMinor, 0),
  };
}

export function getAccountsReceivable(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const today = new Date().toISOString().slice(0, 10);
  const rows = sqlite.prepare(`
    SELECT c.id AS customer_id, c.name AS customer_name, i.id AS document_id,
      i.invoice_number AS document_number, i.due_date, i.currency_code,
      i.total_minor
        - COALESCE((SELECT SUM(ra.foreign_amount_allocated) FROM receipt_allocations ra
            INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
            WHERE ra.sales_invoice_id = i.id), 0)
        - COALESCE((SELECT SUM(scna.foreign_amount_allocated) FROM sales_credit_note_allocations scna
            INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
            WHERE scna.sales_invoice_id = i.id), 0) AS foreign_open_minor,
      i.base_total_minor
        - COALESCE((SELECT SUM(ra.base_carrying_amount_released) FROM receipt_allocations ra
            INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
            WHERE ra.sales_invoice_id = i.id), 0)
        - COALESCE((SELECT SUM(scna.base_carrying_amount_released) FROM sales_credit_note_allocations scna
            INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
            WHERE scna.sales_invoice_id = i.id), 0) AS base_carrying_minor
    FROM sales_invoices i INNER JOIN customers c ON c.id = i.customer_id
    WHERE i.document_status = 'posted'
    ORDER BY i.due_date, i.invoice_number
  `).all() as Array<{
    customer_id: string; customer_name: string; document_id: string; document_number: string;
    due_date: string; currency_code: string; foreign_open_minor: number; base_carrying_minor: number;
  }>;
  return rows.filter((row) => row.foreign_open_minor > 0).map((row) => {
    const ageDays = Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.due_date}T00:00:00Z`)) / 86_400_000));
    return {
      ...row,
      age_bucket: row.due_date >= today ? "Current" : ageDays <= 30 ? "1–30" : ageDays <= 60 ? "31–60" : ageDays <= 90 ? "61–90" : "90+",
      unpaid_minor: row.due_date >= today ? row.base_carrying_minor : 0,
      overdue_minor: row.due_date < today ? row.base_carrying_minor : 0,
      total_minor: row.base_carrying_minor,
    };
  });
}

export function getAccountsPayable(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const today = new Date().toISOString().slice(0, 10);
  const rows = sqlite.prepare(`
    SELECT s.id AS supplier_id, s.name AS supplier_name, pi.id AS document_id,
      pi.internal_number AS document_number, pi.due_date, pi.currency_code,
      pi.total_minor - COALESCE((SELECT SUM(spa.foreign_amount_allocated)
        FROM supplier_payment_allocations spa
        INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
        WHERE spa.purchase_invoice_id = pi.id), 0) AS foreign_open_minor,
      pi.base_total_minor - COALESCE((SELECT SUM(spa.base_carrying_amount_released)
        FROM supplier_payment_allocations spa
        INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
        WHERE spa.purchase_invoice_id = pi.id), 0) AS base_carrying_minor
    FROM purchase_invoices pi INNER JOIN suppliers s ON s.id = pi.supplier_id
    WHERE pi.document_status = 'posted'
    ORDER BY pi.due_date, pi.internal_number
  `).all() as Array<{
    supplier_id: string; supplier_name: string; document_id: string; document_number: string;
    due_date: string; currency_code: string; foreign_open_minor: number; base_carrying_minor: number;
  }>;
  return rows.filter((row) => row.foreign_open_minor > 0).map((row) => {
    const ageDays = Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.due_date}T00:00:00Z`)) / 86_400_000));
    return {
      ...row,
      age_bucket: row.due_date >= today ? "Current" : ageDays <= 30 ? "1–30" : ageDays <= 60 ? "31–60" : ageDays <= 90 ? "61–90" : "90+",
      unpaid_minor: row.due_date >= today ? row.base_carrying_minor : 0,
      overdue_minor: row.due_date < today ? row.base_carrying_minor : 0,
      total_minor: row.base_carrying_minor,
    };
  });
}

export function getBankBalance(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare(`
      SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance_minor
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      INNER JOIN accounts a ON a.id = jl.account_id
      WHERE a.subtype IN ('bank', 'cash')
    `)
    .get() as { balance_minor: number };
  return row.balance_minor;
}
