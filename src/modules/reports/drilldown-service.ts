import { getBusinessDb } from "@/core/db/business";
import { journalSourceHref, journalSourceLabel } from "@/modules/accounting/journal-source";
import { sumMinorRatios } from "@/modules/accounting/calculations/money";
import { getGeneralLedger } from "./report-service";
import { getVatTransactionDetail } from "@/modules/tax/vat-report-service";
import { emirateLabels, type Emirate } from "@/modules/tax/uae-vat-config";

export type DrilldownRow = {
  id: string;
  date: string;
  documentNumber: string;
  sourceType: string;
  sourceLabel: string;
  sourceHref: string | null;
  journalHref: string | null;
  partyOrAccount: string;
  description: string;
  debitMinor: number;
  creditMinor: number;
  netMinor: number;
  runningBalanceMinor?: number;
};

export type DrilldownResult = {
  title: string;
  subtitle: string;
  fullReportHref: string;
  fullReportLabel: string;
  openingBalanceMinor?: number;
  totalNetMinor: number;
  rows: DrilldownRow[];
};

function validDate(value?: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function getReportDrilldown(
  businessId: string,
  userId: string,
  params: {
    kind: "account" | "cash_pnl" | "retained_earnings" | "vat_bucket";
    accountId?: string;
    dateFrom?: string;
    dateTo?: string;
    periodId?: string;
    bucket?: string;
    emirate?: string;
  },
): DrilldownResult {
  const { sqlite } = getBusinessDb(businessId, userId);
  const dateFrom = validDate(params.dateFrom);
  const dateTo = validDate(params.dateTo);

  if (params.kind === "account" && params.accountId) {
    const account = sqlite
      .prepare("SELECT id, name, type, subtype FROM accounts WHERE id = ?")
      .get(params.accountId) as { id: string; name: string; type: string; subtype: string } | undefined;
    if (!account) throw new Error("Account not found.");

    const glRows = getGeneralLedger(businessId, userId, {
      accountId: params.accountId,
      dateFrom,
      dateTo,
    });

    const naturalDebit = account.type === "asset" || account.type === "expense";
    const openingBalanceMinor = glRows[0]?.openingBalanceMinor ?? 0;

    const rows: DrilldownRow[] = glRows.map((row) => {
      const netMinor = naturalDebit
        ? row.debit_minor - row.credit_minor
        : row.credit_minor - row.debit_minor;
      return {
        id: `${row.journal_entry_id}-${row.position}`,
        date: row.date,
        documentNumber: row.entry_number,
        sourceType: row.source_type,
        sourceLabel: journalSourceLabel(row.source_type),
        sourceHref: journalSourceHref(businessId, row.source_type, row.source_id),
        journalHref: `/b/${businessId}/accounting/journal/${row.journal_entry_id}`,
        partyOrAccount: row.reference || account.name,
        description: row.description,
        debitMinor: row.debit_minor,
        creditMinor: row.credit_minor,
        netMinor,
        runningBalanceMinor: row.balanceMinor,
      };
    });

    const qs = new URLSearchParams();
    qs.set("accountId", params.accountId);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);

    return {
      title: `${account.name} — Ledger Drill-Down`,
      subtitle: `${dateFrom || "Beginning"} to ${dateTo || "Present"} · Accrual GL`,
      fullReportHref: `/b/${businessId}/reports/general-ledger?${qs.toString()}`,
      fullReportLabel: "Open in General Ledger",
      openingBalanceMinor,
      totalNetMinor: rows.reduce((sum, r) => sum + r.netMinor, 0),
      rows,
    };
  }

  if (params.kind === "cash_pnl" && params.accountId) {
    const account = sqlite
      .prepare("SELECT id, name, type, subtype FROM accounts WHERE id = ?")
      .get(params.accountId) as { id: string; name: string; type: string; subtype: string } | undefined;
    if (!account) throw new Error("Account not found.");

    const from = dateFrom ?? "0000-01-01";
    const to = dateTo ?? "9999-12-31";
    const rows: DrilldownRow[] = [];

    // 1. Direct cash/bank entries touching this P&L account
    const directRows = sqlite
      .prepare(`
        SELECT je.id AS journal_entry_id, je.entry_number, je.date, je.source_type, je.source_id,
               jl.position, jl.description, jl.debit_minor, jl.credit_minor, jl.reference
        FROM journal_lines jl
        INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
          AND je.status = 'posted'
          AND je.date >= ? AND je.date <= ?
          AND je.source_type NOT IN ('sales_invoice', 'purchase_invoice')
          AND EXISTS (
            SELECT 1 FROM journal_lines jl_cash
            INNER JOIN accounts a_cash ON a_cash.id = jl_cash.account_id
            WHERE jl_cash.journal_entry_id = je.id AND a_cash.subtype IN ('bank', 'cash')
          )
        WHERE jl.account_id = ?
        ORDER BY je.date, je.entry_number, jl.position
      `)
      .all(from, to, params.accountId) as Array<{
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
      }>;

    for (const r of directRows) {
      const netMinor = account.type === "income" ? r.credit_minor - r.debit_minor : r.debit_minor - r.credit_minor;
      rows.push({
        id: `direct-${r.journal_entry_id}-${r.position}`,
        date: r.date,
        documentNumber: r.entry_number,
        sourceType: r.source_type,
        sourceLabel: journalSourceLabel(r.source_type),
        sourceHref: journalSourceHref(businessId, r.source_type, r.source_id),
        journalHref: `/b/${businessId}/accounting/journal/${r.journal_entry_id}`,
        partyOrAccount: r.reference || "Direct Cash Entry",
        description: r.description,
        debitMinor: r.debit_minor,
        creditMinor: r.credit_minor,
        netMinor,
      });
    }

    // 2. Receipt allocations against sales invoices for this income account
    if (account.type === "income") {
      const receiptAllocs = sqlite
        .prepare(`
          SELECT r.id AS receipt_id, r.receipt_number, r.date, c.name AS customer_name,
                 si.invoice_number, sil.net_amount_minor AS amountMinor,
                 COALESCE(ra.base_carrying_amount_released, ra.amount_minor) AS allocatedMinor,
                 si.total_minor AS totalMinor, sil.description AS line_description
          FROM receipt_allocations ra
          INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
            AND r.date >= ? AND r.date <= ?
          INNER JOIN customers c ON c.id = r.customer_id
          INNER JOIN sales_invoices si ON si.id = ra.sales_invoice_id
          INNER JOIN sales_invoice_lines sil ON sil.invoice_id = si.id AND sil.sales_account_id = ?
          WHERE si.total_minor > 0
          ORDER BY r.date, r.receipt_number
        `)
        .all(from, to, params.accountId) as Array<{
          receipt_id: string;
          receipt_number: string;
          date: string;
          customer_name: string;
          invoice_number: string;
          amountMinor: number;
          allocatedMinor: number;
          totalMinor: number;
          line_description: string;
        }>;

      // Group by receipt + invoice to compute exact pro-rata cash recognized
      const grouped = new Map<string, typeof receiptAllocs>();
      for (const item of receiptAllocs) {
        const key = `${item.receipt_id}:${item.invoice_number}`;
        const list = grouped.get(key);
        if (list) list.push(item);
        else grouped.set(key, [item]);
      }
      for (const [key, group] of grouped.entries()) {
        const recognizedMinor = sumMinorRatios(group);
        if (recognizedMinor === 0) continue;
        const first = group[0];
        rows.push({
          id: `rcp-${key}`,
          date: first.date,
          documentNumber: first.receipt_number,
          sourceType: "receipt",
          sourceLabel: "Receipt Allocation",
          sourceHref: `/b/${businessId}/sales/receipts/${first.receipt_id}`,
          journalHref: null,
          partyOrAccount: first.customer_name,
          description: `${first.invoice_number}: ${group.map((g) => g.line_description).join(", ")}`,
          debitMinor: 0,
          creditMinor: recognizedMinor,
          netMinor: recognizedMinor,
        });
      }
    }

    // 3. Supplier payment allocations against purchase invoices for this expense account
    if (account.type === "expense") {
      const paymentAllocs = sqlite
        .prepare(`
          SELECT sp.id AS payment_id, sp.payment_number, sp.date, s.name AS supplier_name,
                 pi.internal_number, pil.net_amount_minor AS amountMinor,
                 COALESCE(spa.base_carrying_amount_released, spa.amount_minor) AS allocatedMinor,
                 pi.total_minor AS totalMinor, pil.description AS line_description
          FROM supplier_payment_allocations spa
          INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
            AND sp.date >= ? AND sp.date <= ?
          INNER JOIN suppliers s ON s.id = sp.supplier_id
          INNER JOIN purchase_invoices pi ON pi.id = spa.purchase_invoice_id
          INNER JOIN purchase_invoice_lines pil ON pil.purchase_invoice_id = pi.id AND pil.expense_account_id = ?
          WHERE pi.total_minor > 0
          ORDER BY sp.date, sp.payment_number
        `)
        .all(from, to, params.accountId) as Array<{
          payment_id: string;
          payment_number: string;
          date: string;
          supplier_name: string;
          internal_number: string;
          amountMinor: number;
          allocatedMinor: number;
          totalMinor: number;
          line_description: string;
        }>;

      const grouped = new Map<string, typeof paymentAllocs>();
      for (const item of paymentAllocs) {
        const key = `${item.payment_id}:${item.internal_number}`;
        const list = grouped.get(key);
        if (list) list.push(item);
        else grouped.set(key, [item]);
      }
      for (const [key, group] of grouped.entries()) {
        const recognizedMinor = sumMinorRatios(group);
        if (recognizedMinor === 0) continue;
        const first = group[0];
        rows.push({
          id: `pay-${key}`,
          date: first.date,
          documentNumber: first.payment_number,
          sourceType: "supplier_payment",
          sourceLabel: "Supplier Payment Allocation",
          sourceHref: `/b/${businessId}/purchases/payments/${first.payment_id}`,
          journalHref: null,
          partyOrAccount: first.supplier_name,
          description: `${first.internal_number}: ${group.map((g) => g.line_description).join(", ")}`,
          debitMinor: recognizedMinor,
          creditMinor: 0,
          netMinor: recognizedMinor,
        });
      }
    }

    rows.sort((a, b) => a.date.localeCompare(b.date) || a.documentNumber.localeCompare(b.documentNumber));

    const qs = new URLSearchParams();
    qs.set("accountId", params.accountId);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);

    return {
      title: `${account.name} — Cash Basis Drill-Down`,
      subtitle: `${dateFrom || "Beginning"} to ${dateTo || "Present"} · Recognized upon payment`,
      fullReportHref: `/b/${businessId}/reports/general-ledger?${qs.toString()}`,
      fullReportLabel: "Open in General Ledger",
      totalNetMinor: rows.reduce((sum, r) => sum + r.netMinor, 0),
      rows,
    };
  }

  if (params.kind === "retained_earnings") {
    const to = dateTo ?? "9999-12-31";
    const glRows = sqlite
      .prepare(`
        SELECT je.id AS journal_entry_id, je.entry_number, je.date, je.source_type,
               je.source_id, jl.position, jl.description, jl.debit_minor,
               jl.credit_minor, a.name AS account_name, a.type AS account_type
        FROM journal_lines jl
        INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' AND je.date <= ?
        INNER JOIN accounts a ON a.id = jl.account_id
        WHERE a.type IN ('income', 'expense')
        ORDER BY je.date, je.entry_number, jl.position
      `)
      .all(to) as Array<{
        journal_entry_id: string;
        entry_number: string;
        date: string;
        source_type: string;
        source_id: string;
        position: number;
        description: string;
        debit_minor: number;
        credit_minor: number;
        account_name: string;
        account_type: string;
      }>;

    const rows: DrilldownRow[] = glRows.map((row) => ({
      id: `${row.journal_entry_id}-${row.position}`,
      date: row.date,
      documentNumber: row.entry_number,
      sourceType: row.source_type,
      sourceLabel: journalSourceLabel(row.source_type),
      sourceHref: journalSourceHref(businessId, row.source_type, row.source_id),
      journalHref: `/b/${businessId}/accounting/journal/${row.journal_entry_id}`,
      partyOrAccount: row.account_name,
      description: row.description,
      debitMinor: row.debit_minor,
      creditMinor: row.credit_minor,
      netMinor: row.credit_minor - row.debit_minor,
    }));

    return {
      title: "Retained Earnings (Current Period Net Income)",
      subtitle: `Posted Income & Expense activity through ${to === "9999-12-31" ? "Present" : to}`,
      fullReportHref: `/b/${businessId}/reports/profit-loss${dateTo ? `?dateTo=${dateTo}` : ""}`,
      fullReportLabel: "Open Profit & Loss",
      totalNetMinor: rows.reduce((sum, r) => sum + r.netMinor, 0),
      rows,
    };
  }

  if (params.kind === "vat_bucket") {
    const detailRows = getVatTransactionDetail(businessId, userId, {
      periodId: params.periodId,
      bucket: params.bucket,
      emirate: params.emirate,
      direction: params.emirate ? "sales" : undefined,
      category: params.emirate ? "standard" : undefined,
    });

    const rows: DrilldownRow[] = detailRows.map((row) => {
      const vatMinor = row.direction === "sales" ? row.output_vat_minor : row.recoverable_vat_minor;
      return {
        id: row.id,
        date: row.tax_date,
        documentNumber: row.source_number,
        sourceType: row.source_type,
        sourceLabel: journalSourceLabel(row.source_type),
        sourceHref: journalSourceHref(businessId, row.source_type, row.source_id),
        journalHref: null,
        partyOrAccount: row.party_name ?? "—",
        description: `${row.tax_code_name}${row.supply_emirate ? ` · ${emirateLabels[row.supply_emirate as Emirate] ?? row.supply_emirate}` : ""}`,
        debitMinor: row.net_amount_minor,
        creditMinor: vatMinor,
        netMinor: vatMinor,
      };
    });

    const qs = new URLSearchParams();
    if (params.periodId) qs.set("periodId", params.periodId);
    if (params.bucket) qs.set("bucket", params.bucket);
    if (params.emirate) {
      qs.set("emirate", params.emirate);
      qs.set("direction", "sales");
      qs.set("category", "standard");
    }

    const label = params.emirate
      ? `Standard Sales — ${emirateLabels[params.emirate as Emirate] ?? params.emirate}`
      : params.bucket
      ? `VAT Box — ${params.bucket.replaceAll("_", " ")}`
      : "VAT Transactions";

    return {
      title: label,
      subtitle: `${rows.length} posted tax entry line(s)`,
      fullReportHref: `/b/${businessId}/reports/vat-transactions?${qs.toString()}`,
      fullReportLabel: "Open VAT Transaction Detail",
      totalNetMinor: rows.reduce((sum, r) => sum + r.netMinor, 0),
      rows,
    };
  }

  throw new Error("Invalid drill-down parameters.");
}
