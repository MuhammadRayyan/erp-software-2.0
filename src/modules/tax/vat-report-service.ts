import { getBusinessDb } from "@/core/db/business";
import { addMinor } from "@/modules/accounting/calculations/money";
import { emirateLabels, emirates, type Emirate, type VatReportBucket } from "./uae-vat-config";

export type VatDetailRow = {
  id: string;
  tax_date: string;
  source_type: string;
  source_id: string;
  source_number: string;
  party_name: string | null;
  tax_code_name: string;
  vat_category: string;
  direction: "sales" | "purchases";
  supply_emirate: Emirate | null;
  net_amount_minor: number;
  vat_amount_minor: number;
  output_vat_minor: number;
  recoverable_vat_minor: number;
};

function matchesBucket(row: VatDetailRow, bucket: string) {
  if (bucket === "standard_sales") return row.direction === "sales" && row.vat_category === "standard";
  if (bucket === "zero_rated_sales") return row.direction === "sales" && row.vat_category === "zero_rated";
  if (bucket === "exempt_sales") return row.direction === "sales" && row.vat_category === "exempt";
  if (bucket === "reverse_charge_output") return row.vat_category === "reverse_charge" && row.output_vat_minor !== 0;
  if (bucket === "import_output") return row.vat_category === "import" && row.output_vat_minor !== 0;
  if (bucket === "standard_purchases") return row.direction === "purchases" && row.vat_category === "standard";
  if (bucket === "import_purchases") return row.direction === "purchases" && row.vat_category === "import";
  if (bucket === "reverse_charge_purchases") return row.direction === "purchases" && row.vat_category === "reverse_charge";
  return false;
}

export type Vat201Box = { box: string; label: string; amountMinor: number; vatMinor: number; adjustmentMinor?: number };

/**
 * FTA VAT201 return boxes derived from tax entries. Self-assessed purchases
 * appear twice: their output VAT in Box 3 (reverse charge) or Box 6 (imported
 * goods), and the recoverable part again as input in Box 10. Manual working-paper
 * adjustments are carried into the Box 8 / Box 11 totals.
 */
export function buildVat201Boxes(
  details: VatDetailRow[],
  emirateBreakdown: { emirate: Emirate; netMinor: number; vatMinor: number }[],
  outputAdjustmentMinor: number,
  inputAdjustmentMinor: number,
) {
  const sum = (rows: VatDetailRow[], pick: (row: VatDetailRow) => number) => addMinor(rows.map(pick));
  const purchases = (category: string) => details.filter((row) => row.direction === "purchases" && row.vat_category === category);
  const sales = (category: string) => details.filter((row) => row.direction === "sales" && row.vat_category === category);
  const box1Prefix = ["1a", "1b", "1c", "1d", "1e", "1f", "1g"];
  const box1: Vat201Box[] = emirateBreakdown.map((row, index) => ({
    box: box1Prefix[index] ?? "1",
    label: `Standard rated supplies in ${emirateLabels[row.emirate]}`,
    amountMinor: row.netMinor,
    vatMinor: row.vatMinor,
  }));
  const standardSales = sales("standard");
  const unassigned = standardSales.filter((row) => !row.supply_emirate);
  if (unassigned.length) {
    box1.push({ box: "1", label: "Standard rated supplies with no Emirate (review)", amountMinor: sum(unassigned, (row) => row.net_amount_minor), vatMinor: sum(unassigned, (row) => row.output_vat_minor) });
  }
  const reverseCharge = purchases("reverse_charge");
  const imports = purchases("import");
  const box3: Vat201Box = { box: "3", label: "Supplies subject to the reverse charge provisions", amountMinor: sum(reverseCharge, (row) => row.net_amount_minor), vatMinor: sum(reverseCharge, (row) => row.output_vat_minor) };
  const box4: Vat201Box = { box: "4", label: "Zero rated supplies", amountMinor: sum(sales("zero_rated"), (row) => row.net_amount_minor), vatMinor: 0 };
  const box5: Vat201Box = { box: "5", label: "Supplies of goods and services which are exempt", amountMinor: sum(sales("exempt"), (row) => row.net_amount_minor), vatMinor: 0 };
  const box6: Vat201Box = { box: "6", label: "Goods imported into the UAE", amountMinor: sum(imports, (row) => row.net_amount_minor), vatMinor: sum(imports, (row) => row.output_vat_minor) };
  const box7: Vat201Box = { box: "7", label: "Adjustments to goods imported into the UAE", amountMinor: 0, vatMinor: 0 };
  const outputBoxes = [...box1, box3, box4, box5, box6, box7];
  const box8: Vat201Box = {
    box: "8", label: "Totals (output)",
    amountMinor: addMinor(outputBoxes.map((box) => box.amountMinor)),
    vatMinor: addMinor([...outputBoxes.map((box) => box.vatMinor), outputAdjustmentMinor]),
    adjustmentMinor: outputAdjustmentMinor,
  };
  const recoverableStandard = purchases("standard").filter((row) => row.recoverable_vat_minor !== 0);
  const recoverableSelfAssessed = [...reverseCharge, ...imports].filter((row) => row.recoverable_vat_minor !== 0);
  const box9: Vat201Box = { box: "9", label: "Standard rated expenses", amountMinor: sum(recoverableStandard, (row) => row.net_amount_minor), vatMinor: sum(recoverableStandard, (row) => row.recoverable_vat_minor) };
  const box10: Vat201Box = { box: "10", label: "Supplies subject to the reverse charge provisions (incl. imports)", amountMinor: sum(recoverableSelfAssessed, (row) => row.net_amount_minor), vatMinor: sum(recoverableSelfAssessed, (row) => row.recoverable_vat_minor) };
  const box11: Vat201Box = {
    box: "11", label: "Totals (input)",
    amountMinor: addMinor([box9.amountMinor, box10.amountMinor]),
    vatMinor: addMinor([box9.vatMinor, box10.vatMinor, inputAdjustmentMinor]),
    adjustmentMinor: inputAdjustmentMinor,
  };
  return {
    outputs: [...outputBoxes, box8],
    inputs: [box9, box10, box11],
    box12TotalDueMinor: box8.vatMinor,
    box13RecoverableMinor: box11.vatMinor,
    box14PayableMinor: box8.vatMinor - box11.vatMinor,
  };
}

function periodRow(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], periodId: string) {
  return sqlite.prepare("SELECT * FROM vat_periods WHERE id = ?").get(periodId) as {
    id: string; period_reference: string; start_date: string; end_date: string;
    filing_due_date: string; status: string; notes: string | null;
  } | undefined;
}

export function getVatTransactionDetail(
  businessId: string,
  userId: string,
  filters: {
    periodId?: string;
    dateFrom?: string;
    dateTo?: string;
    bucket?: string;
    category?: string;
    direction?: string;
    emirate?: string;
    taxCodeId?: string;
    sourceType?: string;
    party?: string;
  } = {},
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  let dateFrom = filters.dateFrom ?? "0000-01-01";
  let dateTo = filters.dateTo ?? "9999-12-31";
  if (filters.periodId) {
    const period = periodRow(sqlite, filters.periodId);
    if (!period) throw new Error("VAT period not found.");
    dateFrom = period.start_date;
    dateTo = period.end_date;
  }
  const rows = sqlite.prepare(`
    SELECT te.* FROM tax_entries te
    WHERE te.tax_date BETWEEN ? AND ?
      AND (? = '' OR te.vat_category = ?)
      AND (? = '' OR te.direction = ?)
      AND (? = '' OR te.supply_emirate = ?)
      AND (? = '' OR te.tax_code_id = ?)
      AND (? = '' OR te.source_type = ? OR te.source_type IN (? || '_void', ? || '_superseded', ? || '_amendment'))
      AND (? = '' OR lower(COALESCE(te.party_name, '')) LIKE '%' || lower(?) || '%')
    ORDER BY te.tax_date, te.source_number, te.source_line_id
  `).all(dateFrom, dateTo, filters.category ?? "", filters.category ?? "",
    filters.direction ?? "", filters.direction ?? "", filters.emirate ?? "", filters.emirate ?? "",
    filters.taxCodeId ?? "", filters.taxCodeId ?? "", filters.sourceType ?? "", filters.sourceType ?? "", filters.sourceType ?? "",
    filters.sourceType ?? "", filters.sourceType ?? "",
    filters.party ?? "", filters.party ?? "") as VatDetailRow[];
  return filters.bucket ? rows.filter((row) => matchesBucket(row, filters.bucket!)) : rows;
}

export function getVatDetailFilterOptions(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return {
    periods: sqlite.prepare(`
      SELECT id, period_reference, start_date, end_date
      FROM vat_periods ORDER BY start_date DESC
    `).all() as { id: string; period_reference: string; start_date: string; end_date: string }[],
    taxCodes: sqlite.prepare(`
      SELECT id, name FROM tax_codes WHERE is_active = 1 AND vat_category IS NOT NULL
      ORDER BY name
    `).all() as { id: string; name: string }[],
  };
}

export function getVatWorkingPaper(businessId: string, userId: string, periodId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const period = periodRow(sqlite, periodId);
  if (!period) throw new Error("VAT period not found.");
  const details = getVatTransactionDetail(businessId, userId, { periodId });
  const bucketIds: VatReportBucket[] = ["standard_sales", "zero_rated_sales", "exempt_sales", "reverse_charge_output", "import_output", "standard_purchases", "import_purchases", "reverse_charge_purchases"];
  const buckets = Object.fromEntries(bucketIds.map((id) => {
    const rows = details.filter((row) => matchesBucket(row, id));
    return [id, {
      netMinor: addMinor(rows.map((row) => row.net_amount_minor)),
      vatMinor: addMinor(rows.map((row) => row.vat_amount_minor)),
      outputVatMinor: addMinor(rows.map((row) => row.output_vat_minor)),
      recoverableVatMinor: addMinor(rows.map((row) => row.recoverable_vat_minor)),
      count: rows.length,
    }];
  })) as Record<VatReportBucket, { netMinor: number; vatMinor: number; outputVatMinor: number; recoverableVatMinor: number; count: number }>;
  const emirateBreakdown = emirates.map((emirate) => {
    const rows = details.filter((row) => row.direction === "sales" && row.vat_category === "standard" && row.supply_emirate === emirate);
    return { emirate, netMinor: addMinor(rows.map((row) => row.net_amount_minor)), vatMinor: addMinor(rows.map((row) => row.output_vat_minor)), count: rows.length };
  });
  const calculatedOutputVatMinor = addMinor(details.map((row) => row.output_vat_minor));
  const calculatedRecoverableVatMinor = addMinor(details.map((row) => row.recoverable_vat_minor));
  const adjustments = sqlite.prepare(`
    SELECT * FROM vat_adjustments WHERE period_id = ? ORDER BY created_at
  `).all(periodId) as { id: string; report_bucket: string; amount_minor: number; vat_amount_minor: number; reason: string; reference: string | null; created_by: string; created_at: string }[];
  const outputAdjustmentMinor = addMinor(adjustments.filter((row) => row.report_bucket === "output_vat_adjustment").map((row) => row.vat_amount_minor));
  const inputAdjustmentMinor = addMinor(adjustments.filter((row) => row.report_bucket === "input_vat_adjustment").map((row) => row.vat_amount_minor));
  const totalOutputVatMinor = addMinor([calculatedOutputVatMinor, outputAdjustmentMinor]);
  const totalRecoverableVatMinor = addMinor([calculatedRecoverableVatMinor, inputAdjustmentMinor]);
  const reviewCount = (sqlite.prepare(`
    SELECT COUNT(*) AS count FROM vat_data_review
    WHERE status = 'open' AND tax_date BETWEEN ? AND ?
  `).get(period.start_date, period.end_date) as { count: number }).count;
  const settings = sqlite.prepare(`
    SELECT vat_output_account_id, input_vat_account_id FROM business_accounting_settings WHERE id = 'default'
  `).get() as { vat_output_account_id: string; input_vat_account_id: string };
  const movement = (accountId: string, normal: "credit" | "debit") => {
    const row = sqlite.prepare(`
      SELECT COALESCE(SUM(CASE WHEN ? = 'credit' THEN jl.credit_minor - jl.debit_minor ELSE jl.debit_minor - jl.credit_minor END), 0) AS amount
      FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.account_id = ? AND EXISTS (
        SELECT 1 FROM tax_entries te
        WHERE te.source_type = je.source_type AND te.source_id = je.source_id
          AND te.tax_date BETWEEN ? AND ?
      )
    `).get(normal, accountId, period.start_date, period.end_date) as { amount: number };
    return row.amount;
  };
  const vat201 = buildVat201Boxes(details, emirateBreakdown, outputAdjustmentMinor, inputAdjustmentMinor);
  const outputGlMinor = movement(settings.vat_output_account_id, "credit");
  const inputGlMinor = movement(settings.input_vat_account_id, "debit");
  return {
    period,
    details,
    buckets,
    emirateBreakdown,
    vat201,
    adjustments,
    reviewCount,
    calculatedOutputVatMinor,
    calculatedRecoverableVatMinor,
    outputAdjustmentMinor,
    inputAdjustmentMinor,
    totalOutputVatMinor,
    totalRecoverableVatMinor,
    netVatMinor: totalOutputVatMinor - totalRecoverableVatMinor,
    reconciliation: {
      outputGlMinor,
      inputGlMinor,
      outputDifferenceMinor: calculatedOutputVatMinor - outputGlMinor,
      inputDifferenceMinor: calculatedRecoverableVatMinor - inputGlMinor,
    },
  };
}

export function buildVatSnapshot(businessId: string, userId: string, periodId: string) {
  const report = getVatWorkingPaper(businessId, userId, periodId);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    period: report.period,
    buckets: report.buckets,
    emirateBreakdown: report.emirateBreakdown,
    vat201: report.vat201,
    adjustments: report.adjustments,
    totals: {
      calculatedOutputVatMinor: report.calculatedOutputVatMinor,
      calculatedRecoverableVatMinor: report.calculatedRecoverableVatMinor,
      outputAdjustmentMinor: report.outputAdjustmentMinor,
      inputAdjustmentMinor: report.inputAdjustmentMinor,
      totalOutputVatMinor: report.totalOutputVatMinor,
      totalRecoverableVatMinor: report.totalRecoverableVatMinor,
      netVatMinor: report.netVatMinor,
    },
    reconciliation: report.reconciliation,
    reviewCount: report.reviewCount,
  };
}

export function listVatReviewItems(businessId: string, userId: string) {
  return getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT vdr.*, COALESCE(te.source_number,
      CASE vdr.source_type
        WHEN 'sales_invoice' THEN (SELECT invoice_number FROM sales_invoices WHERE id = vdr.source_id)
        WHEN 'sales_credit_note' THEN (SELECT credit_note_number FROM sales_credit_notes WHERE id = vdr.source_id)
        WHEN 'purchase_invoice' THEN (SELECT internal_number FROM purchase_invoices WHERE id = vdr.source_id)
        WHEN 'bank_transaction' THEN (SELECT transaction_number FROM bank_transactions WHERE id = vdr.source_id)
      END
    ) AS source_number
    FROM vat_data_review vdr
    LEFT JOIN tax_entries te ON te.source_type = vdr.source_type
      AND te.source_id = vdr.source_id AND te.source_line_id = vdr.source_line_id
    WHERE vdr.status = 'open'
    ORDER BY vdr.tax_date, vdr.source_type, vdr.source_id
  `).all() as { id: string; source_type: string; source_id: string; source_line_id: string; source_number: string | null; tax_date: string; issue_type: string; details: string }[];
}
