import { getBusinessDb } from "@/core/db/business";
import { getBaseCurrency } from "@/modules/currency/currency";

export type CashFlowHorizon = 30 | 60 | 90;

export type ForecastLiquidAccount = {
  id: string;
  name: string;
  subtype: "bank" | "cash";
  bank_name: string | null;
  account_number_masked: string | null;
  currency_code: string;
  balance_minor: number;
};

export type ForecastInflowItem = {
  documentId: string;
  documentNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  foreignOpenMinor: number;
  baseCarryingMinor: number;
  daysFromAsOf: number;
  isOverdue: boolean;
  ageBucket: "Overdue" | "1–7 Days" | "8–30 Days" | "31–60 Days" | "61–90 Days" | "Beyond 90 Days";
};

export type ForecastOutflowItem = {
  documentId: string;
  documentNumber: string;
  supplierInvoiceNumber: string;
  supplierId: string;
  supplierName: string;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  foreignOpenMinor: number;
  baseCarryingMinor: number;
  daysFromAsOf: number;
  isOverdue: boolean;
  ageBucket: "Overdue" | "1–7 Days" | "8–30 Days" | "31–60 Days" | "61–90 Days" | "Beyond 90 Days";
};

export type ForecastDayLedger = {
  date: string;
  dayOffset: number;
  isToday: boolean;
  openingBalanceMinor: number;
  inflowsMinor: number;
  outflowsMinor: number;
  netChangeMinor: number;
  closingBalanceMinor: number;
  isDeficit: boolean;
  inflowCount: number;
  outflowCount: number;
};

export type CashFlowForecastSummary = {
  asOfDate: string;
  horizonDays: CashFlowHorizon;
  baseCurrency: string;
  startingCashMinor: number;
  totalInflowsMinor: number;
  totalOutflowsMinor: number;
  netCashFlowMinor: number;
  projectedClosingCashMinor: number;
  minimumProjectedCashMinor: number;
  minimumProjectedDate: string;
  deficitDaysCount: number;
  firstDeficitDate: string | null;
  runwayStatus: "healthy" | "caution" | "deficit";
  overdueInflowsMinor: number;
  overdueOutflowsMinor: number;
  bucketSummaries: {
    overdue: { inflowsMinor: number; outflowsMinor: number; netMinor: number };
    days1To7: { inflowsMinor: number; outflowsMinor: number; netMinor: number };
    days8To30: { inflowsMinor: number; outflowsMinor: number; netMinor: number };
    days31To60: { inflowsMinor: number; outflowsMinor: number; netMinor: number };
    days61To90: { inflowsMinor: number; outflowsMinor: number; netMinor: number };
  };
};

export type CashFlowForecastData = {
  summary: CashFlowForecastSummary;
  accounts: ForecastLiquidAccount[];
  dailyLedger: ForecastDayLedger[];
  inflows: ForecastInflowItem[];
  outflows: ForecastOutflowItem[];
};

export type CashFlowForecastOptions = {
  horizonDays?: CashFlowHorizon;
  asOfDate?: string;
};

export function getCashFlowForecast(
  businessId: string,
  userId: string,
  options: CashFlowForecastOptions = {},
): CashFlowForecastData {
  const { sqlite } = getBusinessDb(businessId, userId);
  const baseCurrency = getBaseCurrency(sqlite);
  const horizonDays: CashFlowHorizon =
    options.horizonDays === 60 ? 60 : options.horizonDays === 90 ? 90 : 30;
  const asOfDate =
    options.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(options.asOfDate)
      ? options.asOfDate
      : new Date().toISOString().slice(0, 10);

  // 1. Fetch liquid accounts (cash and bank) with balances as of asOfDate
  const rawAccounts = sqlite
    .prepare(`
      SELECT 
        a.id,
        a.name,
        a.subtype,
        ba.bank_name,
        ba.account_number_masked,
        COALESCE(ba.currency_code, ?) AS currency_code,
        COALESCE(
          (SELECT SUM(jl.debit_minor - jl.credit_minor)
           FROM journal_lines jl
           INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
           WHERE jl.account_id = a.id AND je.date <= ?),
          0
        ) AS balance_minor
      FROM accounts a
      LEFT JOIN bank_accounts ba ON ba.ledger_account_id = a.id
      WHERE a.subtype IN ('bank', 'cash') AND a.is_active = 1
      ORDER BY a.name
    `)
    .all(baseCurrency.code, asOfDate) as Array<{
    id: string;
    name: string;
    subtype: "bank" | "cash";
    bank_name: string | null;
    account_number_masked: string | null;
    currency_code: string;
    balance_minor: number;
  }>;

  const accounts: ForecastLiquidAccount[] = rawAccounts.map((a) => ({
    ...a,
    balance_minor: Number(a.balance_minor),
  }));

  const startingCashMinor = accounts.reduce((sum, a) => sum + a.balance_minor, 0);

  // 2. Fetch posted open sales invoices (Inflows)
  const rawInflows = sqlite
    .prepare(`
      SELECT 
        i.id AS document_id,
        i.invoice_number AS document_number,
        i.invoice_date,
        i.due_date,
        i.customer_id,
        c.name AS customer_name,
        i.currency_code,
        i.total_minor 
          - COALESCE((SELECT SUM(ra.foreign_amount_allocated) FROM receipt_allocations ra INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted' WHERE ra.sales_invoice_id = i.id), 0)
          - COALESCE((SELECT SUM(scna.foreign_amount_allocated) FROM sales_credit_note_allocations scna INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted' WHERE scna.sales_invoice_id = i.id), 0) AS foreign_open_minor,
        i.base_total_minor
          - COALESCE((SELECT SUM(ra.base_carrying_amount_released) FROM receipt_allocations ra INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted' WHERE ra.sales_invoice_id = i.id), 0)
          - COALESCE((SELECT SUM(scna.base_carrying_amount_released) FROM sales_credit_note_allocations scna INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted' WHERE scna.sales_invoice_id = i.id), 0) AS base_carrying_minor
      FROM sales_invoices i
      INNER JOIN customers c ON c.id = i.customer_id
      WHERE i.document_status = 'posted'
      ORDER BY i.due_date, i.invoice_number
    `)
    .all() as Array<{
    document_id: string;
    document_number: string;
    invoice_date: string;
    due_date: string;
    customer_id: string;
    customer_name: string;
    currency_code: string;
    foreign_open_minor: number;
    base_carrying_minor: number;
  }>;

  const asOfTs = Date.parse(`${asOfDate}T00:00:00Z`);

  const inflows: ForecastInflowItem[] = rawInflows
    .filter((row) => row.foreign_open_minor > 0 && row.base_carrying_minor > 0)
    .map((row) => {
      const dueTs = Date.parse(`${row.due_date}T00:00:00Z`);
      const daysFromAsOf = Math.floor((dueTs - asOfTs) / 86_400_000);
      const isOverdue = daysFromAsOf < 0;
      let ageBucket: ForecastInflowItem["ageBucket"];
      if (isOverdue) ageBucket = "Overdue";
      else if (daysFromAsOf <= 7) ageBucket = "1–7 Days";
      else if (daysFromAsOf <= 30) ageBucket = "8–30 Days";
      else if (daysFromAsOf <= 60) ageBucket = "31–60 Days";
      else if (daysFromAsOf <= 90) ageBucket = "61–90 Days";
      else ageBucket = "Beyond 90 Days";

      return {
        documentId: row.document_id,
        documentNumber: row.document_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        invoiceDate: row.invoice_date,
        dueDate: row.due_date,
        currencyCode: row.currency_code,
        foreignOpenMinor: Number(row.foreign_open_minor),
        baseCarryingMinor: Number(row.base_carrying_minor),
        daysFromAsOf,
        isOverdue,
        ageBucket,
      };
    });

  // 3. Fetch posted open purchase invoices (Outflows)
  const rawOutflows = sqlite
    .prepare(`
      SELECT 
        pi.id AS document_id,
        pi.internal_number AS document_number,
        pi.supplier_invoice_number,
        pi.invoice_date,
        pi.due_date,
        pi.supplier_id,
        s.name AS supplier_name,
        pi.currency_code,
        pi.total_minor - COALESCE((SELECT SUM(spa.foreign_amount_allocated)
          FROM supplier_payment_allocations spa
          INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
          WHERE spa.purchase_invoice_id = pi.id), 0) AS foreign_open_minor,
        pi.base_total_minor - COALESCE((SELECT SUM(spa.base_carrying_amount_released)
          FROM supplier_payment_allocations spa
          INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
          WHERE spa.purchase_invoice_id = pi.id), 0) AS base_carrying_minor
      FROM purchase_invoices pi
      INNER JOIN suppliers s ON s.id = pi.supplier_id
      WHERE pi.document_status = 'posted'
      ORDER BY pi.due_date, pi.internal_number
    `)
    .all() as Array<{
    document_id: string;
    document_number: string;
    supplier_invoice_number: string;
    invoice_date: string;
    due_date: string;
    supplier_id: string;
    supplier_name: string;
    currency_code: string;
    foreign_open_minor: number;
    base_carrying_minor: number;
  }>;

  const outflows: ForecastOutflowItem[] = rawOutflows
    .filter((row) => row.foreign_open_minor > 0 && row.base_carrying_minor > 0)
    .map((row) => {
      const dueTs = Date.parse(`${row.due_date}T00:00:00Z`);
      const daysFromAsOf = Math.floor((dueTs - asOfTs) / 86_400_000);
      const isOverdue = daysFromAsOf < 0;
      let ageBucket: ForecastOutflowItem["ageBucket"];
      if (isOverdue) ageBucket = "Overdue";
      else if (daysFromAsOf <= 7) ageBucket = "1–7 Days";
      else if (daysFromAsOf <= 30) ageBucket = "8–30 Days";
      else if (daysFromAsOf <= 60) ageBucket = "31–60 Days";
      else if (daysFromAsOf <= 90) ageBucket = "61–90 Days";
      else ageBucket = "Beyond 90 Days";

      return {
        documentId: row.document_id,
        documentNumber: row.document_number,
        supplierInvoiceNumber: row.supplier_invoice_number,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        invoiceDate: row.invoice_date,
        dueDate: row.due_date,
        currencyCode: row.currency_code,
        foreignOpenMinor: Number(row.foreign_open_minor),
        baseCarryingMinor: Number(row.base_carrying_minor),
        daysFromAsOf,
        isOverdue,
        ageBucket,
      };
    });

  // 4. Construct Day-by-Day Timeline Ledger for the horizon
  // Day 0 captures overdue items + items due on asOfDate
  const dailyLedger: ForecastDayLedger[] = [];
  let runningCash = startingCashMinor;
  let minProjectedCash = startingCashMinor;
  let minProjectedDate = asOfDate;
  let firstDeficitDate: string | null = null;
  let deficitDaysCount = 0;

  for (let offset = 0; offset <= horizonDays; offset++) {
    const curDateTs = asOfTs + offset * 86_400_000;
    const curDateStr = new Date(curDateTs).toISOString().slice(0, 10);
    const isToday = offset === 0;

    let dayInflowsMinor = 0;
    let dayInflowCount = 0;
    let dayOutflowsMinor = 0;
    let dayOutflowCount = 0;

    if (isToday) {
      // Overdue items + items due on or before asOfDate
      for (const inf of inflows) {
        if (inf.daysFromAsOf <= 0) {
          dayInflowsMinor += inf.baseCarryingMinor;
          dayInflowCount += 1;
        }
      }
      for (const out of outflows) {
        if (out.daysFromAsOf <= 0) {
          dayOutflowsMinor += out.baseCarryingMinor;
          dayOutflowCount += 1;
        }
      }
    } else {
      // Items due specifically on this date
      for (const inf of inflows) {
        if (inf.dueDate === curDateStr) {
          dayInflowsMinor += inf.baseCarryingMinor;
          dayInflowCount += 1;
        }
      }
      for (const out of outflows) {
        if (out.dueDate === curDateStr) {
          dayOutflowsMinor += out.baseCarryingMinor;
          dayOutflowCount += 1;
        }
      }
    }

    const openingBalanceMinor = runningCash;
    const netChangeMinor = dayInflowsMinor - dayOutflowsMinor;
    const closingBalanceMinor = openingBalanceMinor + netChangeMinor;
    runningCash = closingBalanceMinor;

    const isDeficit = closingBalanceMinor < 0;
    if (isDeficit) {
      deficitDaysCount += 1;
      if (!firstDeficitDate) firstDeficitDate = curDateStr;
    }

    if (closingBalanceMinor < minProjectedCash) {
      minProjectedCash = closingBalanceMinor;
      minProjectedDate = curDateStr;
    }

    dailyLedger.push({
      date: curDateStr,
      dayOffset: offset,
      isToday,
      openingBalanceMinor,
      inflowsMinor: dayInflowsMinor,
      outflowsMinor: dayOutflowsMinor,
      netChangeMinor,
      closingBalanceMinor,
      isDeficit,
      inflowCount: dayInflowCount,
      outflowCount: dayOutflowCount,
    });
  }

  // 5. Bucket summaries
  const bucketSummaries = {
    overdue: { inflowsMinor: 0, outflowsMinor: 0, netMinor: 0 },
    days1To7: { inflowsMinor: 0, outflowsMinor: 0, netMinor: 0 },
    days8To30: { inflowsMinor: 0, outflowsMinor: 0, netMinor: 0 },
    days31To60: { inflowsMinor: 0, outflowsMinor: 0, netMinor: 0 },
    days61To90: { inflowsMinor: 0, outflowsMinor: 0, netMinor: 0 },
  };

  for (const inf of inflows) {
    if (inf.ageBucket === "Overdue") bucketSummaries.overdue.inflowsMinor += inf.baseCarryingMinor;
    else if (inf.ageBucket === "1–7 Days") bucketSummaries.days1To7.inflowsMinor += inf.baseCarryingMinor;
    else if (inf.ageBucket === "8–30 Days") bucketSummaries.days8To30.inflowsMinor += inf.baseCarryingMinor;
    else if (inf.ageBucket === "31–60 Days") bucketSummaries.days31To60.inflowsMinor += inf.baseCarryingMinor;
    else if (inf.ageBucket === "61–90 Days") bucketSummaries.days61To90.inflowsMinor += inf.baseCarryingMinor;
  }

  for (const out of outflows) {
    if (out.ageBucket === "Overdue") bucketSummaries.overdue.outflowsMinor += out.baseCarryingMinor;
    else if (out.ageBucket === "1–7 Days") bucketSummaries.days1To7.outflowsMinor += out.baseCarryingMinor;
    else if (out.ageBucket === "8–30 Days") bucketSummaries.days8To30.outflowsMinor += out.baseCarryingMinor;
    else if (out.ageBucket === "31–60 Days") bucketSummaries.days31To60.outflowsMinor += out.baseCarryingMinor;
    else if (out.ageBucket === "61–90 Days") bucketSummaries.days61To90.outflowsMinor += out.baseCarryingMinor;
  }

  bucketSummaries.overdue.netMinor = bucketSummaries.overdue.inflowsMinor - bucketSummaries.overdue.outflowsMinor;
  bucketSummaries.days1To7.netMinor = bucketSummaries.days1To7.inflowsMinor - bucketSummaries.days1To7.outflowsMinor;
  bucketSummaries.days8To30.netMinor = bucketSummaries.days8To30.inflowsMinor - bucketSummaries.days8To30.outflowsMinor;
  bucketSummaries.days31To60.netMinor = bucketSummaries.days31To60.inflowsMinor - bucketSummaries.days31To60.outflowsMinor;
  bucketSummaries.days61To90.netMinor = bucketSummaries.days61To90.inflowsMinor - bucketSummaries.days61To90.outflowsMinor;

  // Horizon-filtered totals
  const inHorizonInflows = inflows.filter((inf) => inf.daysFromAsOf <= horizonDays);
  const inHorizonOutflows = outflows.filter((out) => out.daysFromAsOf <= horizonDays);

  const totalInflowsMinor = inHorizonInflows.reduce((sum, inf) => sum + inf.baseCarryingMinor, 0);
  const totalOutflowsMinor = inHorizonOutflows.reduce((sum, out) => sum + out.baseCarryingMinor, 0);
  const netCashFlowMinor = totalInflowsMinor - totalOutflowsMinor;
  const projectedClosingCashMinor = startingCashMinor + netCashFlowMinor;

  let runwayStatus: "healthy" | "caution" | "deficit" = "healthy";
  if (minProjectedCash < 0) {
    runwayStatus = "deficit";
  } else if (minProjectedCash < startingCashMinor * 0.25 || minProjectedCash < 500_000) {
    // Under 25% of starting cash or under 5,000 in base currency
    runwayStatus = "caution";
  }

  const summary: CashFlowForecastSummary = {
    asOfDate,
    horizonDays,
    baseCurrency: baseCurrency.code,
    startingCashMinor,
    totalInflowsMinor,
    totalOutflowsMinor,
    netCashFlowMinor,
    projectedClosingCashMinor,
    minimumProjectedCashMinor: minProjectedCash,
    minimumProjectedDate: minProjectedDate,
    deficitDaysCount,
    firstDeficitDate,
    runwayStatus,
    overdueInflowsMinor: bucketSummaries.overdue.inflowsMinor,
    overdueOutflowsMinor: bucketSummaries.overdue.outflowsMinor,
    bucketSummaries,
  };

  return {
    summary,
    accounts,
    dailyLedger,
    inflows,
    outflows,
  };
}
