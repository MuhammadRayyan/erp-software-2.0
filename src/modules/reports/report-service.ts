import { getBusinessDb } from "@/core/db/business";
import { listInvoices } from "@/modules/sales-invoices/invoice-service";

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
             jl.credit_minor, jl.reference, a.id AS account_id, a.name AS account_name, a.type AS account_type
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY je.date, je.entry_number, jl.position
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
      SELECT a.id, a.name, a.type, a.subtype,
             COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_minor ELSE 0 END), 0)
               AS debit_total,
             COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_minor ELSE 0 END), 0)
               AS credit_total
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je
        ON je.id = jl.journal_entry_id AND je.status = 'posted' AND je.date <= ?
      GROUP BY a.id
      ORDER BY a.name`)
    .all(date) as {
      id: string;
      name: string;
      type: string;
      subtype: string;
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


export function getDashboardCounts(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  
  const safeCount = (query: string) => {
    try {
      const result = sqlite.prepare(query).get() as { c: number } | undefined;
      return result?.c ?? 0;
    } catch {
      return 0;
    }
  };

  return {
    customers: safeCount("SELECT COUNT(*) as c FROM customers"),
    salesQuotes: safeCount("SELECT COUNT(*) as c FROM sales_quotes"),
    salesOrders: safeCount("SELECT COUNT(*) as c FROM sales_orders"),
    salesInvoices: safeCount("SELECT COUNT(*) as c FROM sales_invoices"),
    salesCreditNotes: safeCount("SELECT COUNT(*) as c FROM sales_credit_notes"),
    deliveryNotes: safeCount("SELECT COUNT(*) as c FROM delivery_notes"),
    suppliers: safeCount("SELECT COUNT(*) as c FROM suppliers"),
    purchaseOrders: safeCount("SELECT COUNT(*) as c FROM purchase_orders"),
    purchaseInvoices: safeCount("SELECT COUNT(*) as c FROM purchase_invoices"),
    supplierPayments: safeCount("SELECT COUNT(*) as c FROM supplier_payments"),
    payments: safeCount("SELECT COUNT(*) as c FROM supplier_payments"),
    debitNotes: safeCount("SELECT COUNT(*) as c FROM debit_notes"),
    goodsReceipts: safeCount("SELECT COUNT(*) as c FROM goods_receipts"),
    inventoryItems: safeCount("SELECT COUNT(*) as c FROM inventory_items"),
    bankAccounts: safeCount("SELECT COUNT(*) as c FROM accounts WHERE subtype IN ('bank', 'cash')"),
    receipts: safeCount("SELECT COUNT(*) as c FROM receipts"),
    journals: safeCount("SELECT COUNT(*) as c FROM journal_entries"),
    chartOfAccounts: safeCount("SELECT COUNT(*) as c FROM accounts"),
    employees: safeCount("SELECT COUNT(*) as c FROM employees WHERE is_active = 1"),
    payslips: safeCount("SELECT COUNT(*) as c FROM payslips"),
    payslipItems: safeCount("SELECT COUNT(*) as c FROM payslip_items"),
    projects: safeCount("SELECT COUNT(*) as c FROM projects"),
    vatPeriods: safeCount("SELECT COUNT(*) as c FROM vat_periods"),
  };
}

export type MonthlyFinancialTrend = {
  month: string;
  label: string;
  revenueMinor: number;
  expensesMinor: number;
  netIncomeMinor: number;
};

export type ReceivablesAgingSummary = {
  currentMinor: number;
  currentCount: number;
  days30Minor: number;
  days30Count: number;
  days60Minor: number;
  days60Count: number;
  days60PlusMinor: number;
  days60PlusCount: number;
  totalMinor: number;
  totalCount: number;
};

export function getMonthlyFinancialTrend(
  businessId: string,
  userId: string,
  monthsCount = 6,
): MonthlyFinancialTrend[] {
  const { sqlite } = getBusinessDb(businessId, userId);

  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    months.push({ key, label });
  }

  const startKey = months[0].key;
  const endKey = months[months.length - 1].key;

  const rows = sqlite
    .prepare(`
      SELECT 
        a.type,
        substr(je.date, 1, 7) AS month,
        COALESCE(SUM(CASE WHEN a.type = 'income' THEN jl.credit_minor - jl.debit_minor ELSE jl.debit_minor - jl.credit_minor END), 0) AS net_minor
      FROM accounts a
      INNER JOIN journal_lines jl ON a.id = jl.account_id
      INNER JOIN journal_entries je ON jl.journal_entry_id = je.id AND je.status = 'posted'
      WHERE a.type IN ('income', 'expense') AND substr(je.date, 1, 7) >= ? AND substr(je.date, 1, 7) <= ?
      GROUP BY a.type, substr(je.date, 1, 7)
    `)
    .all(startKey, endKey) as { type: string; month: string; net_minor: number }[];

  const incomeMap = new Map<string, number>();
  const expenseMap = new Map<string, number>();

  for (const r of rows) {
    if (r.type === "income") incomeMap.set(r.month, r.net_minor);
    else if (r.type === "expense") expenseMap.set(r.month, r.net_minor);
  }

  return months.map((m) => {
    const revenueMinor = Math.max(0, incomeMap.get(m.key) ?? 0);
    const expensesMinor = Math.max(0, expenseMap.get(m.key) ?? 0);
    const netIncomeMinor = revenueMinor - expensesMinor;
    return {
      month: m.key,
      label: m.label,
      revenueMinor,
      expensesMinor,
      netIncomeMinor,
    };
  });
}

export function getReceivablesAgingSummary(businessId: string, userId: string): ReceivablesAgingSummary {
  const today = new Date().toISOString().slice(0, 10);
  const invoices = listInvoices(businessId, userId).filter(
    (inv) => inv.documentStatus === "posted" && inv.baseBalanceMinor > 0,
  );

  let currentMinor = 0, currentCount = 0;
  let days30Minor = 0, days30Count = 0;
  let days60Minor = 0, days60Count = 0;
  let days60PlusMinor = 0, days60PlusCount = 0;

  for (const inv of invoices) {
    const dueDate = inv.dueDate || today;
    if (dueDate >= today) {
      currentMinor += inv.baseBalanceMinor;
      currentCount++;
    } else {
      const ageDays = Math.max(
        0,
        Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000),
      );
      if (ageDays <= 30) {
        days30Minor += inv.baseBalanceMinor;
        days30Count++;
      } else if (ageDays <= 60) {
        days60Minor += inv.baseBalanceMinor;
        days60Count++;
      } else {
        days60PlusMinor += inv.baseBalanceMinor;
        days60PlusCount++;
      }
    }
  }

  const totalMinor = currentMinor + days30Minor + days60Minor + days60PlusMinor;
  const totalCount = currentCount + days30Count + days60Count + days60PlusCount;

  return {
    currentMinor,
    currentCount,
    days30Minor,
    days30Count,
    days60Minor,
    days60Count,
    days60PlusMinor,
    days60PlusCount,
    totalMinor,
    totalCount,
  };
}

export function getProfitAndLoss(
  businessId: string,
  userId: string,
  fromDate?: string,
  toDate?: string,
  basis: "accrual" | "cash" = "accrual",
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const from = validDate(fromDate) ?? "0000-01-01";
  const to = validDate(toDate) ?? "9999-12-31";

  if (basis === "cash") {
    // 1. Direct cash receipts/payments & manual entries touching bank/cash
    const directRows = sqlite
      .prepare(`
        SELECT a.id, a.name, a.type, a.subtype,
               COALESCE(SUM(jl.debit_minor), 0) AS debit_total,
               COALESCE(SUM(jl.credit_minor), 0) AS credit_total
        FROM accounts a
        INNER JOIN journal_lines jl ON a.id = jl.account_id
        INNER JOIN journal_entries je ON jl.journal_entry_id = je.id
          AND je.status = 'posted'
          AND je.date >= ? AND je.date <= ?
          AND je.source_type NOT IN ('sales_invoice', 'purchase_invoice')
          AND EXISTS (
            SELECT 1 FROM journal_lines jl_cash
            INNER JOIN accounts a_cash ON a_cash.id = jl_cash.account_id
            WHERE jl_cash.journal_entry_id = je.id AND a_cash.subtype IN ('bank', 'cash')
          )
        WHERE a.type IN ('income', 'expense')
        GROUP BY a.id
      `)
      .all(from, to) as {
        id: string;
        name: string;
        type: string;
        subtype: string;
        debit_total: number;
        credit_total: number;
      }[];

    // 2. Cash collected on sales invoices via receipts in the date range
    const invoiceReceiptRows = sqlite
      .prepare(`
        SELECT sil.sales_account_id as id, a.name, a.type, a.subtype,
               0 as debit_total,
               ROUND(SUM(sil.net_amount_minor * CAST(COALESCE(ra.base_carrying_amount_released, ra.amount_minor) AS REAL) / CAST(si.total_minor AS REAL))) as credit_total
        FROM receipt_allocations ra
        INNER JOIN receipts r ON r.id = ra.receipt_id
          AND r.document_status = 'posted'
          AND r.date >= ? AND r.date <= ?
        INNER JOIN sales_invoices si ON si.id = ra.sales_invoice_id
        INNER JOIN sales_invoice_lines sil ON sil.invoice_id = si.id
        INNER JOIN accounts a ON a.id = sil.sales_account_id
        WHERE si.total_minor > 0
        GROUP BY sil.sales_account_id
      `)
      .all(from, to) as {
        id: string;
        name: string;
        type: string;
        subtype: string;
        debit_total: number;
        credit_total: number;
      }[];

    // 3. Cash paid on purchase invoices via supplier payments in the date range
    const billPaymentRows = sqlite
      .prepare(`
        SELECT pil.expense_account_id as id, a.name, a.type, a.subtype,
               ROUND(SUM(pil.net_amount_minor * CAST(COALESCE(spa.base_carrying_amount_released, spa.amount_minor) AS REAL) / CAST(pi.total_minor AS REAL))) as debit_total,
               0 as credit_total
        FROM supplier_payment_allocations spa
        INNER JOIN supplier_payments sp ON sp.id = spa.payment_id
          AND sp.document_status = 'posted'
          AND sp.date >= ? AND sp.date <= ?
        INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
        INNER JOIN purchase_invoice_lines pil ON pil.purchase_invoice_id = pi.id
        INNER JOIN accounts a ON a.id = pil.expense_account_id
        WHERE pi.total_minor > 0
        GROUP BY pil.expense_account_id
      `)
      .all(from, to) as {
        id: string;
        name: string;
        type: string;
        subtype: string;
        debit_total: number;
        credit_total: number;
      }[];

    const map = new Map<string, { id: string; name: string; type: string; subtype: string; debit_total: number; credit_total: number }>();
    for (const r of [...directRows, ...invoiceReceiptRows, ...billPaymentRows]) {
      const existing = map.get(r.id);
      if (existing) {
        existing.debit_total += r.debit_total;
        existing.credit_total += r.credit_total;
      } else {
        map.set(r.id, { ...r });
      }
    }

    return Array.from(map.values()).map((r) => {
      const net_minor = r.type === "income"
        ? Math.round(r.credit_total - r.debit_total)
        : Math.round(r.debit_total - r.credit_total);
      return { ...r, net_minor };
    }).filter((r) => r.net_minor !== 0);
  }

  // Accrual basis (default)
  const rows = sqlite
    .prepare(`
      SELECT a.id, a.name, a.type, a.subtype,
             COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit_minor ELSE 0 END), 0)
               AS debit_total,
             COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit_minor ELSE 0 END), 0)
               AS credit_total
      FROM accounts a
      LEFT JOIN journal_lines jl ON a.id = jl.account_id
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
        AND je.status = 'posted'
        AND je.date >= ? AND je.date <= ?
      WHERE a.type IN ('income', 'expense')
      GROUP BY a.id
      ORDER BY a.type DESC, a.name
    `).all(from, to) as {
      id: string;
      name: string;
      type: string;
      subtype: string;
      debit_total: number;
      credit_total: number;
    }[];
    
  return rows.map((r) => {
    const net_minor = r.type === 'income' 
      ? r.credit_total - r.debit_total 
      : r.debit_total - r.credit_total;
    return { ...r, net_minor };
  }).filter(r => r.net_minor !== 0);
}
