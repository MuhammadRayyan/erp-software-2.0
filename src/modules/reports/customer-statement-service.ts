import { getBusinessDb } from "@/core/db/business";

export type CustomerStatementRow = {
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
  balanceMinor: number;
};

export type StatementOptions = {
  fromDate?: string | null;
  toDate?: string | null;
  currencyCode?: string | null;
};

export type AgingBuckets = {
  asOfDate: string;
  currencyCode: string;
  currentMinor: number;
  days30Minor: number;
  days60Minor: number;
  days90Minor: number;
  days90PlusMinor: number;
  totalMinor: number;
};

function parseDateUtc(dateStr: string): number {
  const parts = dateStr.slice(0, 10).split("-");
  const y = parseInt(parts[0], 10) || 1970;
  const m = parseInt(parts[1], 10) || 1;
  const d = parseInt(parts[2], 10) || 1;
  return Date.UTC(y, m - 1, d);
}

function getDaysDifference(asOfDateStr: string, dueDateStr: string): number {
  const asOf = parseDateUtc(asOfDateStr);
  const due = parseDateUtc(dueDateStr);
  return Math.floor((asOf - due) / (1000 * 60 * 60 * 24));
}

export function getCustomerStatement(
  businessId: string,
  userId: string,
  customerId: string,
  optionsOrCurrency?: string | StatementOptions,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const options: StatementOptions =
    typeof optionsOrCurrency === "string"
      ? { currencyCode: optionsOrCurrency }
      : optionsOrCurrency ?? {};

  const rows = sqlite.prepare(`
    SELECT i.invoice_date AS date, i.invoice_number AS entry_number,
      'sales_invoice' AS source_type, i.id AS source_id,
      'Sales Invoice ' || i.invoice_number AS description, i.reference,
      i.currency_code, i.total_minor AS debit_minor, 0 AS credit_minor,
      i.base_total_minor AS base_debit_minor, 0 AS base_credit_minor
    FROM sales_invoices i
    WHERE i.customer_id = ? AND i.document_status = 'posted'
    UNION ALL
    SELECT r.date, r.receipt_number AS entry_number,
      'receipt' AS source_type, r.id AS source_id,
      'Customer Receipt ' || r.receipt_number AS description, r.reference,
      r.currency_code, 0 AS debit_minor, r.amount_minor AS credit_minor,
      0 AS base_debit_minor, r.base_amount_minor AS base_credit_minor
    FROM receipts r
    WHERE r.customer_id = ? AND r.document_status = 'posted'
    UNION ALL
    SELECT scn.date, scn.credit_note_number AS entry_number,
      'sales_credit_note' AS source_type, scn.id AS source_id,
      'Sales Credit Note ' || scn.credit_note_number AS description, scn.reference,
      scn.currency_code, 0 AS debit_minor, scn.total_minor AS credit_minor,
      0 AS base_debit_minor, scn.base_total_minor AS base_credit_minor
    FROM sales_credit_notes scn
    WHERE scn.customer_id = ? AND scn.document_status = 'posted'
    ORDER BY date, entry_number
  `).all(customerId, customerId, customerId) as Omit<CustomerStatementRow, "balanceMinor">[];

  const filtered = options.currencyCode
    ? rows.filter((row) => row.currency_code === options.currencyCode!.toUpperCase())
    : rows;

  const { fromDate, toDate } = options;

  // Case 1: Date range with starting fromDate -> compute Balance Brought Forward
  if (fromDate) {
    const openingBalances = new Map<string, { balanceMinor: number; baseBalanceMinor: number }>();
    for (const row of filtered) {
      if (row.date < fromDate) {
        const cur = openingBalances.get(row.currency_code) ?? { balanceMinor: 0, baseBalanceMinor: 0 };
        cur.balanceMinor += row.debit_minor - row.credit_minor;
        cur.baseBalanceMinor += row.base_debit_minor - row.base_credit_minor;
        openingBalances.set(row.currency_code, cur);
      }
    }

    const openingRows: CustomerStatementRow[] = [];
    if (options.currencyCode) {
      const cur = options.currencyCode.toUpperCase();
      const bal = openingBalances.get(cur) ?? { balanceMinor: 0, baseBalanceMinor: 0 };
      openingRows.push({
        date: fromDate,
        entry_number: "OPENING",
        source_type: "opening_balance",
        source_id: "opening",
        description: "Balance Brought Forward",
        reference: null,
        currency_code: cur,
        debit_minor: 0,
        credit_minor: 0,
        base_debit_minor: 0,
        base_credit_minor: 0,
        balanceMinor: bal.balanceMinor,
      });
    } else {
      const presentCurrencies = Array.from(new Set(filtered.map((r) => r.currency_code)));
      if (presentCurrencies.length === 0) {
        const cust = sqlite.prepare("SELECT default_currency_code FROM customers WHERE id = ?").get(customerId) as { default_currency_code?: string } | undefined;
        const defaultCur = cust?.default_currency_code || "AED";
        openingRows.push({
          date: fromDate,
          entry_number: "OPENING",
          source_type: "opening_balance",
          source_id: "opening",
          description: "Balance Brought Forward",
          reference: null,
          currency_code: defaultCur,
          debit_minor: 0,
          credit_minor: 0,
          base_debit_minor: 0,
          base_credit_minor: 0,
          balanceMinor: 0,
        });
      } else {
        for (const cur of presentCurrencies) {
          const bal = openingBalances.get(cur) ?? { balanceMinor: 0, baseBalanceMinor: 0 };
          openingRows.push({
            date: fromDate,
            entry_number: "OPENING",
            source_type: "opening_balance",
            source_id: "opening",
            description: "Balance Brought Forward",
            reference: null,
            currency_code: cur,
            debit_minor: 0,
            credit_minor: 0,
            base_debit_minor: 0,
            base_credit_minor: 0,
            balanceMinor: bal.balanceMinor,
          });
        }
      }
    }

    const runningBalances = new Map<string, number>();
    for (const [cur, val] of openingBalances.entries()) {
      runningBalances.set(cur, val.balanceMinor);
    }

    const periodRows = filtered
      .filter((row) => row.date >= fromDate && (!toDate || row.date <= toDate))
      .map((row) => {
        const balanceMinor = (runningBalances.get(row.currency_code) ?? 0) + row.debit_minor - row.credit_minor;
        runningBalances.set(row.currency_code, balanceMinor);
        return { ...row, balanceMinor };
      });

    return [...openingRows, ...periodRows];
  }

  // Case 2: Only toDate or unbounded
  const periodRows = toDate ? filtered.filter((row) => row.date <= toDate) : filtered;
  const balances = new Map<string, number>();
  return periodRows.map((row) => {
    const balanceMinor = (balances.get(row.currency_code) ?? 0) + row.debit_minor - row.credit_minor;
    balances.set(row.currency_code, balanceMinor);
    return { ...row, balanceMinor };
  });
}

export function getCustomerAging(
  businessId: string,
  userId: string,
  customerId: string,
  asOfDate?: string,
  currencyCode?: string,
): AgingBuckets {
  const { sqlite } = getBusinessDb(businessId, userId);
  const targetAsOf = asOfDate || new Date().toISOString().slice(0, 10);

  let targetCurrency = currencyCode?.toUpperCase();
  if (!targetCurrency) {
    const recentInv = sqlite.prepare(`
      SELECT currency_code FROM sales_invoices
      WHERE customer_id = ? AND document_status = 'posted'
      ORDER BY invoice_date DESC LIMIT 1
    `).get(customerId) as { currency_code?: string } | undefined;

    targetCurrency = recentInv?.currency_code;
    if (!targetCurrency) {
      const cust = sqlite.prepare("SELECT default_currency_code FROM customers WHERE id = ?").get(customerId) as { default_currency_code?: string } | undefined;
      targetCurrency = cust?.default_currency_code;
    }
    if (!targetCurrency) {
      const biz = sqlite.prepare("SELECT currency FROM business_settings LIMIT 1").get() as { currency?: string } | undefined;
      targetCurrency = biz?.currency || "AED";
    }
  }

  // 1. Fetch posted invoices on or before targetAsOf
  const invoices = sqlite.prepare(`
    SELECT id, invoice_number, invoice_date, due_date, total_minor, currency_code
    FROM sales_invoices
    WHERE customer_id = ? AND document_status = 'posted' AND invoice_date <= ? AND currency_code = ?
    ORDER BY due_date ASC, invoice_date ASC
  `).all(customerId, targetAsOf, targetCurrency) as Array<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    total_minor: number;
    currency_code: string;
  }>;

  // 2. Fetch receipt allocations on or before targetAsOf
  const receiptAllocs = sqlite.prepare(`
    SELECT ra.sales_invoice_id, COALESCE(SUM(ra.amount_minor), 0) AS allocated_minor
    FROM receipt_allocations ra
    JOIN receipts r ON r.id = ra.receipt_id
    WHERE r.customer_id = ? AND r.document_status = 'posted' AND r.date <= ?
    GROUP BY ra.sales_invoice_id
  `).all(customerId, targetAsOf) as Array<{ sales_invoice_id: string; allocated_minor: number }>;
  const receiptAllocMap = new Map(receiptAllocs.map((a) => [a.sales_invoice_id, a.allocated_minor]));

  // 3. Fetch credit note allocations on or before targetAsOf
  const creditAllocs = sqlite.prepare(`
    SELECT ca.sales_invoice_id, COALESCE(SUM(ca.amount_minor), 0) AS allocated_minor
    FROM sales_credit_note_allocations ca
    JOIN sales_credit_notes cn ON cn.id = ca.credit_note_id
    WHERE cn.customer_id = ? AND cn.document_status = 'posted' AND cn.date <= ?
    GROUP BY ca.sales_invoice_id
  `).all(customerId, targetAsOf) as Array<{ sales_invoice_id: string; allocated_minor: number }>;
  const creditAllocMap = new Map(creditAllocs.map((a) => [a.sales_invoice_id, a.allocated_minor]));

  let currentMinor = 0;
  let days30Minor = 0;
  let days60Minor = 0;
  let days90Minor = 0;
  let days90PlusMinor = 0;
  let sumInvoiceRemaining = 0;

  for (const inv of invoices) {
    const paidMinor = receiptAllocMap.get(inv.id) ?? 0;
    const creditedMinor = creditAllocMap.get(inv.id) ?? 0;
    const remaining = Math.max(0, inv.total_minor - paidMinor - creditedMinor);
    if (remaining <= 0) continue;

    sumInvoiceRemaining += remaining;
    const effectiveDueDate = inv.due_date || inv.invoice_date;
    const daysOverdue = getDaysDifference(targetAsOf, effectiveDueDate);

    if (daysOverdue <= 0) {
      currentMinor += remaining;
    } else if (daysOverdue <= 30) {
      days30Minor += remaining;
    } else if (daysOverdue <= 60) {
      days60Minor += remaining;
    } else if (daysOverdue <= 90) {
      days90Minor += remaining;
    } else {
      days90PlusMinor += remaining;
    }
  }

  // 4. Calculate total net customer balance as of targetAsOf
  const totalInvoiced = sqlite.prepare(`
    SELECT COALESCE(SUM(total_minor), 0) AS total
    FROM sales_invoices
    WHERE customer_id = ? AND document_status = 'posted' AND invoice_date <= ? AND currency_code = ?
  `).get(customerId, targetAsOf, targetCurrency) as { total: number };

  const totalReceipts = sqlite.prepare(`
    SELECT COALESCE(SUM(amount_minor), 0) AS total
    FROM receipts
    WHERE customer_id = ? AND document_status = 'posted' AND date <= ? AND currency_code = ?
  `).get(customerId, targetAsOf, targetCurrency) as { total: number };

  const totalCredits = sqlite.prepare(`
    SELECT COALESCE(SUM(total_minor), 0) AS total
    FROM sales_credit_notes
    WHERE customer_id = ? AND document_status = 'posted' AND date <= ? AND currency_code = ?
  `).get(customerId, targetAsOf, targetCurrency) as { total: number };

  const totalCustomerBalance = totalInvoiced.total - totalReceipts.total - totalCredits.total;

  if (totalCustomerBalance < sumInvoiceRemaining) {
    let unallocated = sumInvoiceRemaining - totalCustomerBalance;
    const dedCurrent = Math.min(currentMinor, unallocated);
    currentMinor -= dedCurrent;
    unallocated -= dedCurrent;

    if (unallocated > 0) {
      const ded30 = Math.min(days30Minor, unallocated);
      days30Minor -= ded30;
      unallocated -= ded30;
    }
    if (unallocated > 0) {
      const ded60 = Math.min(days60Minor, unallocated);
      days60Minor -= ded60;
      unallocated -= ded60;
    }
    if (unallocated > 0) {
      const ded90 = Math.min(days90Minor, unallocated);
      days90Minor -= ded90;
      unallocated -= ded90;
    }
    if (unallocated > 0) {
      const ded90p = Math.min(days90PlusMinor, unallocated);
      days90PlusMinor -= ded90p;
      unallocated -= ded90p;
    }
    if (unallocated > 0) {
      currentMinor -= unallocated;
    }
  } else if (totalCustomerBalance > sumInvoiceRemaining) {
    const diff = totalCustomerBalance - sumInvoiceRemaining;
    currentMinor += diff;
  }

  return {
    asOfDate: targetAsOf,
    currencyCode: targetCurrency,
    currentMinor,
    days30Minor,
    days60Minor,
    days90Minor,
    days90PlusMinor,
    totalMinor: totalCustomerBalance,
  };
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
    SELECT COALESCE(SUM(base_amount_minor), 0) AS total FROM receipts
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
