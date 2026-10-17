import { getBusinessDb } from "@/core/db/business";
import type { StatementOptions, AgingBuckets } from "./customer-statement-service";

export type { StatementOptions, AgingBuckets };

export type SupplierStatementRow = {
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

export function getSupplierStatement(
  businessId: string,
  userId: string,
  supplierId: string,
  optionsOrCurrency?: string | StatementOptions,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const options: StatementOptions =
    typeof optionsOrCurrency === "string"
      ? { currencyCode: optionsOrCurrency }
      : optionsOrCurrency ?? {};

  const rows = sqlite.prepare(`
    SELECT pi.invoice_date AS date, pi.internal_number AS entry_number,
      'purchase_invoice' AS source_type, pi.id AS source_id,
      'Purchase Invoice ' || pi.internal_number AS description, pi.reference,
      pi.currency_code, 0 AS debit_minor, pi.total_minor AS credit_minor,
      0 AS base_debit_minor, pi.base_total_minor AS base_credit_minor
    FROM purchase_invoices pi
    WHERE pi.supplier_id = ? AND pi.document_status = 'posted'
    UNION ALL
    SELECT sp.date, sp.payment_number AS entry_number,
      'supplier_payment' AS source_type, sp.id AS source_id,
      'Supplier Payment ' || sp.payment_number AS description, sp.reference,
      sp.currency_code, sp.amount_minor AS debit_minor, 0 AS credit_minor,
      sp.base_amount_minor AS base_debit_minor, 0 AS base_credit_minor
    FROM supplier_payments sp
    WHERE sp.supplier_id = ? AND sp.document_status = 'posted'
    UNION ALL
    SELECT dn.debit_note_date AS date, dn.debit_note_number AS entry_number,
      'debit_note' AS source_type, dn.id AS source_id,
      'Debit Note ' || dn.debit_note_number AS description, dn.reference,
      dn.currency_code, dn.total_minor AS debit_minor, 0 AS credit_minor,
      dn.base_total_minor AS base_debit_minor, 0 AS base_credit_minor
    FROM debit_notes dn
    WHERE dn.supplier_id = ? AND dn.document_status = 'posted'
    ORDER BY date, entry_number
  `).all(supplierId, supplierId, supplierId) as Omit<SupplierStatementRow, "balanceMinor">[];

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
        cur.balanceMinor += row.credit_minor - row.debit_minor;
        cur.baseBalanceMinor += row.base_credit_minor - row.base_debit_minor;
        openingBalances.set(row.currency_code, cur);
      }
    }

    const openingRows: SupplierStatementRow[] = [];
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
        const supp = sqlite.prepare("SELECT default_currency_code FROM suppliers WHERE id = ?").get(supplierId) as { default_currency_code?: string } | undefined;
        const defaultCur = supp?.default_currency_code || "AED";
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
        const balanceMinor = (runningBalances.get(row.currency_code) ?? 0) + row.credit_minor - row.debit_minor;
        runningBalances.set(row.currency_code, balanceMinor);
        return { ...row, balanceMinor };
      });

    return [...openingRows, ...periodRows];
  }

  // Case 2: Only toDate or unbounded
  const periodRows = toDate ? filtered.filter((row) => row.date <= toDate) : filtered;
  const balances = new Map<string, number>();
  return periodRows.map((row) => {
    const balanceMinor = (balances.get(row.currency_code) ?? 0) + row.credit_minor - row.debit_minor;
    balances.set(row.currency_code, balanceMinor);
    return { ...row, balanceMinor };
  });
}

export function getSupplierAging(
  businessId: string,
  userId: string,
  supplierId: string,
  asOfDate?: string,
  currencyCode?: string,
): AgingBuckets {
  const { sqlite } = getBusinessDb(businessId, userId);
  const targetAsOf = asOfDate || new Date().toISOString().slice(0, 10);

  let targetCurrency = currencyCode?.toUpperCase();
  if (!targetCurrency) {
    const recentBill = sqlite.prepare(`
      SELECT currency_code FROM purchase_invoices
      WHERE supplier_id = ? AND document_status = 'posted'
      ORDER BY invoice_date DESC LIMIT 1
    `).get(supplierId) as { currency_code?: string } | undefined;

    targetCurrency = recentBill?.currency_code;
    if (!targetCurrency) {
      const supp = sqlite.prepare("SELECT default_currency_code FROM suppliers WHERE id = ?").get(supplierId) as { default_currency_code?: string } | undefined;
      targetCurrency = supp?.default_currency_code;
    }
    if (!targetCurrency) {
      const biz = sqlite.prepare("SELECT currency FROM business_settings LIMIT 1").get() as { currency?: string } | undefined;
      targetCurrency = biz?.currency || "AED";
    }
  }

  // 1. Fetch posted purchase invoices on or before targetAsOf
  const bills = sqlite.prepare(`
    SELECT id, internal_number, invoice_date, due_date, total_minor, currency_code
    FROM purchase_invoices
    WHERE supplier_id = ? AND document_status = 'posted' AND invoice_date <= ? AND currency_code = ?
    ORDER BY due_date ASC, invoice_date ASC
  `).all(supplierId, targetAsOf, targetCurrency) as Array<{
    id: string;
    internal_number: string;
    invoice_date: string;
    due_date: string;
    total_minor: number;
    currency_code: string;
  }>;

  // 2. Fetch supplier payment allocations on or before targetAsOf
  const paymentAllocs = sqlite.prepare(`
    SELECT spa.purchase_invoice_id, COALESCE(SUM(spa.amount_minor), 0) AS allocated_minor
    FROM supplier_payment_allocations spa
    JOIN supplier_payments sp ON sp.id = spa.payment_id
    WHERE sp.supplier_id = ? AND sp.document_status = 'posted' AND sp.date <= ?
    GROUP BY spa.purchase_invoice_id
  `).all(supplierId, targetAsOf) as Array<{ purchase_invoice_id: string; allocated_minor: number }>;
  const paymentAllocMap = new Map(paymentAllocs.map((a) => [a.purchase_invoice_id, a.allocated_minor]));

  // 3. Fetch debit notes linked to purchase invoices on or before targetAsOf
  const debitNotes = sqlite.prepare(`
    SELECT dn.purchase_invoice_id, COALESCE(SUM(dn.total_minor), 0) AS debited_minor
    FROM debit_notes dn
    WHERE dn.supplier_id = ? AND dn.purchase_invoice_id IS NOT NULL AND dn.document_status = 'posted' AND dn.debit_note_date <= ?
    GROUP BY dn.purchase_invoice_id
  `).all(supplierId, targetAsOf) as Array<{ purchase_invoice_id: string; debited_minor: number }>;
  const debitNoteMap = new Map(debitNotes.map((d) => [d.purchase_invoice_id, d.debited_minor]));

  let currentMinor = 0;
  let days30Minor = 0;
  let days60Minor = 0;
  let days90Minor = 0;
  let days90PlusMinor = 0;
  let sumBillRemaining = 0;

  for (const bill of bills) {
    const paidMinor = paymentAllocMap.get(bill.id) ?? 0;
    const debitedMinor = debitNoteMap.get(bill.id) ?? 0;
    const remaining = Math.max(0, bill.total_minor - paidMinor - debitedMinor);
    if (remaining <= 0) continue;

    sumBillRemaining += remaining;
    const effectiveDueDate = bill.due_date || bill.invoice_date;
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

  // 4. Calculate total net supplier balance as of targetAsOf
  const totalBills = sqlite.prepare(`
    SELECT COALESCE(SUM(total_minor), 0) AS total
    FROM purchase_invoices
    WHERE supplier_id = ? AND document_status = 'posted' AND invoice_date <= ? AND currency_code = ?
  `).get(supplierId, targetAsOf, targetCurrency) as { total: number };

  const totalPayments = sqlite.prepare(`
    SELECT COALESCE(SUM(amount_minor), 0) AS total
    FROM supplier_payments
    WHERE supplier_id = ? AND document_status = 'posted' AND date <= ? AND currency_code = ?
  `).get(supplierId, targetAsOf, targetCurrency) as { total: number };

  const totalDebitNotes = sqlite.prepare(`
    SELECT COALESCE(SUM(total_minor), 0) AS total
    FROM debit_notes
    WHERE supplier_id = ? AND document_status = 'posted' AND debit_note_date <= ? AND currency_code = ?
  `).get(supplierId, targetAsOf, targetCurrency) as { total: number };

  const totalSupplierBalance = totalBills.total - totalPayments.total - totalDebitNotes.total;

  if (totalSupplierBalance < sumBillRemaining) {
    let unallocated = sumBillRemaining - totalSupplierBalance;
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
  } else if (totalSupplierBalance > sumBillRemaining) {
    const diff = totalSupplierBalance - sumBillRemaining;
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
    totalMinor: totalSupplierBalance,
  };
}

export function getSupplierAccountingSummary(businessId: string, userId: string, supplierId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const purchased = sqlite.prepare(`
    SELECT COALESCE(SUM(base_total_minor), 0) AS total FROM purchase_invoices
    WHERE supplier_id = ? AND document_status = 'posted'
  `).get(supplierId) as { total: number };
  const paid = sqlite.prepare(`
    SELECT COALESCE(SUM(base_amount_minor), 0) AS total FROM supplier_payments
    WHERE supplier_id = ? AND document_status = 'posted'
  `).get(supplierId) as { total: number };
  const debited = sqlite.prepare(`
    SELECT COALESCE(SUM(base_total_minor), 0) AS total FROM debit_notes
    WHERE supplier_id = ? AND document_status = 'posted'
  `).get(supplierId) as { total: number };
  return {
    totalPurchasedMinor: purchased.total,
    totalPaidMinor: paid.total,
    totalDebitedMinor: debited.total,
    outstandingMinor: purchased.total - paid.total - debited.total,
  };
}
