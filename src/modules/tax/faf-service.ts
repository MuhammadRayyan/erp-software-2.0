import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { formatCsv } from "@/lib/csv-utils";
import { validateUaeTrn, type TrnValidationResult } from "./trn-validation";
import { emirateLabels, type Emirate } from "./uae-vat-config";

export interface FafAuditOptions {
  periodId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface FafAuditReport {
  filename: string;
  mimeType: string;
  csvContent: string;
  periodStart: string;
  periodEnd: string;
  baseCurrency: string;
  trnAudit: {
    companyTrn: TrnValidationResult;
    suppliersWithInvalidTrn: { name: string; trn: string; message: string }[];
    customersWithInvalidTrn: { name: string; trn: string; message: string }[];
  };
  totals: {
    purchasesCount: number;
    purchasesNetAedMinor: number;
    purchasesVatAedMinor: number;
    suppliesCount: number;
    suppliesNetAedMinor: number;
    suppliesVatAedMinor: number;
    glLinesCount: number;
    glDebitMinor: number;
    glCreditMinor: number;
  };
}

function fmtAmount(minor: number, currencyCode = "AED", minorUnitMap?: Map<string, number>): string {
  const minorUnit = minorUnitMap?.get(currencyCode) ?? 2;
  return minorToCurrencyInput(minor, minorUnit);
}

export function generateFtaAuditFile(
  businessId: string,
  userId: string,
  options: FafAuditOptions = {},
): FafAuditReport {
  assertMutationPermission(businessId, userId, "reports", "export");
  const { sqlite } = getBusinessDb(businessId, userId);
  const sysAccess = getBusinessForUser(businessId, userId);
  const profile = getBusinessProfile(businessId, userId);

  let periodStart = options.dateFrom ?? "";
  let periodEnd = options.dateTo ?? "";
  let periodRef = "custom";

  if (options.periodId) {
    const period = sqlite
      .prepare("SELECT id, period_reference, start_date, end_date FROM vat_periods WHERE id = ?")
      .get(options.periodId) as
      | { id: string; period_reference: string; start_date: string; end_date: string }
      | undefined;
    if (!period) throw new Error("VAT period not found.");
    periodStart = period.start_date;
    periodEnd = period.end_date;
    periodRef = period.period_reference;
  }

  if (!periodStart) periodStart = `${new Date().getUTCFullYear()}-01-01`;
  if (!periodEnd) periodEnd = new Date().toISOString().slice(0, 10);
  if (periodStart > periodEnd) throw new Error("Period start date cannot exceed period end date.");

  const taxSettings = sqlite
    .prepare("SELECT trn FROM business_tax_settings WHERE id = 'default'")
    .get() as { trn: string | null } | undefined;

  const companyTrnValue = (taxSettings?.trn || profile.taxId || "").trim();
  const companyTrn = validateUaeTrn(companyTrnValue);
  const baseCurrency = sysAccess?.business.currency ?? profile.baseCurrency ?? "AED";
  const fafCreatedDate = new Date().toISOString().slice(0, 10);

  const currencyRows = sqlite.prepare("SELECT code, minor_unit FROM currencies").all() as {
    code: string;
    minor_unit: number;
  }[];
  const minorUnitMap = new Map(currencyRows.map((c) => [c.code, c.minor_unit]));

  // Suppliers master
  const supplierRows = sqlite
    .prepare(`SELECT id, name, COALESCE(trn, tax_reference) AS trn, country_code FROM suppliers WHERE is_active = 1 ORDER BY name`)
    .all() as { id: string; name: string; trn: string | null; country_code: string | null }[];

  // Customers master
  const customerRows = sqlite
    .prepare(`SELECT id, name, COALESCE(trn, tax_reference) AS trn, country_code FROM customers WHERE is_active = 1 ORDER BY name`)
    .all() as { id: string; name: string; trn: string | null; country_code: string | null }[];

  const suppliersWithInvalidTrn = supplierRows
    .filter((s) => Boolean(s.trn))
    .map((s) => ({ s, check: validateUaeTrn(s.trn) }))
    .filter(({ check }) => !check.validChecksum)
    .map(({ s, check }) => ({ name: s.name, trn: s.trn ?? "", message: check.message }));

  const customersWithInvalidTrn = customerRows
    .filter((c) => Boolean(c.trn))
    .map((c) => ({ c, check: validateUaeTrn(c.trn) }))
    .filter(({ check }) => !check.validChecksum)
    .map(({ c, check }) => ({ name: c.name, trn: c.trn ?? "", message: check.message }));

  // Tax entries within period, joined with invoice/credit/debit party TRNs and descriptions
  const taxEntryRows = sqlite
    .prepare(`
      SELECT
        te.id,
        te.tax_date,
        te.source_type,
        te.source_id,
        te.source_line_id,
        te.source_number,
        te.party_name,
        te.tax_code_name,
        te.vat_category,
        te.direction,
        te.net_amount_minor,
        te.vat_amount_minor,
        te.document_currency,
        te.foreign_net_minor,
        te.foreign_vat_minor,
        te.base_net_minor,
        te.base_vat_minor,
        te.supply_emirate,
        COALESCE(
          si.customer_trn,
          scn.customer_trn,
          cust.trn,
          cust.tax_reference,
          sup.trn,
          sup.tax_reference,
          ''
        ) AS party_trn,
        COALESCE(
          cust.country_code,
          sup.country_code,
          'AE'
        ) AS party_country,
        COALESCE(
          sil.description,
          pil.description,
          scnl.description,
          dnl.description,
          te.tax_code_name
        ) AS line_description
      FROM tax_entries te
      LEFT JOIN sales_invoices si ON te.source_type IN ('sales_invoice', 'sales_invoice_void') AND te.source_id = si.id
      LEFT JOIN sales_invoice_lines sil ON te.source_type IN ('sales_invoice', 'sales_invoice_void') AND te.source_line_id = sil.id
      LEFT JOIN customers cust ON si.customer_id = cust.id
      LEFT JOIN sales_credit_notes scn ON te.source_type IN ('sales_credit_note', 'sales_credit_note_void') AND te.source_id = scn.id
      LEFT JOIN sales_credit_note_lines scnl ON te.source_type IN ('sales_credit_note', 'sales_credit_note_void') AND te.source_line_id = scnl.id
      LEFT JOIN purchase_invoices pi ON te.source_type IN ('purchase_invoice', 'purchase_invoice_void') AND te.source_id = pi.id
      LEFT JOIN purchase_invoice_lines pil ON te.source_type IN ('purchase_invoice', 'purchase_invoice_void') AND te.source_line_id = pil.id
      LEFT JOIN suppliers sup ON pi.supplier_id = sup.id
      LEFT JOIN debit_notes dn ON te.source_type IN ('debit_note', 'debit_note_void') AND te.source_id = dn.id
      LEFT JOIN debit_note_lines dnl ON te.source_type IN ('debit_note', 'debit_note_void') AND te.source_line_id = dnl.id
      WHERE te.tax_date BETWEEN ? AND ?
      ORDER BY te.tax_date ASC, te.source_number ASC, te.id ASC
    `)
    .all(periodStart, periodEnd) as {
    id: string;
    tax_date: string;
    source_type: string;
    source_id: string;
    source_line_id: string;
    source_number: string;
    party_name: string | null;
    tax_code_name: string;
    vat_category: string;
    direction: "sales" | "purchases";
    net_amount_minor: number;
    vat_amount_minor: number;
    document_currency: string;
    foreign_net_minor: number;
    foreign_vat_minor: number;
    base_net_minor: number;
    base_vat_minor: number;
    supply_emirate: Emirate | null;
    party_trn: string;
    party_country: string;
    line_description: string;
  }[];

  const purchaseEntries = taxEntryRows.filter((row) => row.direction === "purchases");
  const supplyEntries = taxEntryRows.filter((row) => row.direction === "sales");

  let purchasesNetAedMinor = 0;
  let purchasesVatAedMinor = 0;
  for (const r of purchaseEntries) {
    purchasesNetAedMinor += r.base_net_minor;
    purchasesVatAedMinor += r.base_vat_minor;
  }

  let suppliesNetAedMinor = 0;
  let suppliesVatAedMinor = 0;
  for (const r of supplyEntries) {
    suppliesNetAedMinor += r.base_net_minor;
    suppliesVatAedMinor += r.base_vat_minor;
  }

  // GL Data within period
  const glRows = sqlite
    .prepare(`
      SELECT
        je.date AS transaction_date,
        a.id AS account_code,
        a.name AS account_name,
        COALESCE(NULLIF(jl.description, ''), je.description) AS description,
        COALESCE(c.name, s.name, '') AS party_name,
        je.entry_number AS transaction_id,
        je.source_id AS source_document_id,
        je.source_type AS source_type,
        jl.debit_minor,
        jl.credit_minor
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      INNER JOIN accounts a ON a.id = jl.account_id
      LEFT JOIN customers c ON c.id = jl.customer_id
      LEFT JOIN suppliers s ON s.id = jl.supplier_id
      WHERE je.status = 'posted'
        AND je.date BETWEEN ? AND ?
      ORDER BY je.date ASC, je.entry_number ASC, jl.position ASC
    `)
    .all(periodStart, periodEnd) as {
    transaction_date: string;
    account_code: string;
    account_name: string;
    description: string;
    party_name: string;
    transaction_id: string;
    source_document_id: string;
    source_type: string;
    debit_minor: number;
    credit_minor: number;
  }[];

  let glDebitMinor = 0;
  let glCreditMinor = 0;
  const runningByAccount = new Map<string, number>();

  const rows: (string | number)[][] = [];

  // Section 1: CompInfo
  rows.push(["CompInfoStart"]);
  rows.push([
    "CompanyName",
    "TRN",
    "TaxAgencyName",
    "TAN",
    "TaxAgentName",
    "TAAN",
    "PeriodStart",
    "PeriodEnd",
    "FAFCreationDate",
    "ProductName",
    "ProductVersion",
  ]);
  rows.push([
    profile.legalName || sysAccess?.business.name || "",
    companyTrn.normalized,
    "",
    "",
    "",
    "",
    periodStart,
    periodEnd,
    fafCreatedDate,
    "UAE Manager ERP",
    "2.7.0",
  ]);
  rows.push(["CompInfoEnd"]);
  rows.push([]);

  // Section 2: SuppInfo
  rows.push(["SuppInfoStart"]);
  rows.push(["SupplierName", "SupplierCountry", "SupplierTRN"]);
  for (const s of supplierRows) {
    rows.push([s.name, s.country_code || "AE", s.trn || ""]);
  }
  rows.push(["SuppInfoEnd"]);
  rows.push([]);

  // Section 3: CustInfo
  rows.push(["CustInfoStart"]);
  rows.push(["CustomerName", "CustomerCountry", "CustomerTRN"]);
  for (const c of customerRows) {
    rows.push([c.name, c.country_code || "AE", c.trn || ""]);
  }
  rows.push(["CustInfoEnd"]);
  rows.push([]);

  // Section 4: PurData & PurTotals
  rows.push(["PurDataStart"]);
  rows.push([
    "SupplierName",
    "SupplierTRN",
    "InvoiceDate",
    "InvoiceNo",
    "PermitNo",
    "LineNo",
    "ProductDescription",
    "PurchaseValueAED",
    "VATValueAED",
    "TaxCode",
    "FCYCode",
    "PurchaseFCY",
    "VATFCY",
  ]);
  purchaseEntries.forEach((entry, idx) => {
    const isFcy = entry.document_currency && entry.document_currency !== baseCurrency;
    rows.push([
      entry.party_name || "Unknown Supplier",
      entry.party_trn || "",
      entry.tax_date,
      entry.source_number,
      "",
      idx + 1,
      entry.line_description,
      fmtAmount(entry.base_net_minor, baseCurrency, minorUnitMap),
      fmtAmount(entry.base_vat_minor, baseCurrency, minorUnitMap),
      entry.tax_code_name,
      isFcy ? entry.document_currency : "XXX",
      isFcy ? fmtAmount(entry.foreign_net_minor, entry.document_currency, minorUnitMap) : "0.00",
      isFcy ? fmtAmount(entry.foreign_vat_minor, entry.document_currency, minorUnitMap) : "0.00",
    ]);
  });
  rows.push(["PurDataEnd"]);
  rows.push([
    "PurTotals",
    fmtAmount(purchasesNetAedMinor, baseCurrency, minorUnitMap),
    fmtAmount(purchasesVatAedMinor, baseCurrency, minorUnitMap),
    purchaseEntries.length,
  ]);
  rows.push([]);

  // Section 5: SupData & SupTotals
  rows.push(["SupDataStart"]);
  rows.push([
    "CustomerName",
    "CustomerTRN",
    "InvoiceDate",
    "InvoiceNo",
    "LineNo",
    "ProductDescription",
    "SupplyValueAED",
    "VATValueAED",
    "TaxCode",
    "Country",
    "Emirate",
    "FCYCode",
    "SupplyFCY",
    "VATFCY",
  ]);
  supplyEntries.forEach((entry, idx) => {
    const isFcy = entry.document_currency && entry.document_currency !== baseCurrency;
    rows.push([
      entry.party_name || "Walk-in / Customer",
      entry.party_trn || "",
      entry.tax_date,
      entry.source_number,
      idx + 1,
      entry.line_description,
      fmtAmount(entry.base_net_minor, baseCurrency, minorUnitMap),
      fmtAmount(entry.base_vat_minor, baseCurrency, minorUnitMap),
      entry.tax_code_name,
      entry.party_country || "United Arab Emirates",
      entry.supply_emirate ? emirateLabels[entry.supply_emirate] : "",
      isFcy ? entry.document_currency : "XXX",
      isFcy ? fmtAmount(entry.foreign_net_minor, entry.document_currency, minorUnitMap) : "0.00",
      isFcy ? fmtAmount(entry.foreign_vat_minor, entry.document_currency, minorUnitMap) : "0.00",
    ]);
  });
  rows.push(["SupDataEnd"]);
  rows.push([
    "SupTotals",
    fmtAmount(suppliesNetAedMinor, baseCurrency, minorUnitMap),
    fmtAmount(suppliesVatAedMinor, baseCurrency, minorUnitMap),
    supplyEntries.length,
  ]);
  rows.push([]);

  // Section 6: GLData & GLTotals
  rows.push(["GLDataStart"]);
  rows.push([
    "TransactionDate",
    "AccountID",
    "AccountName",
    "TransactionDescription",
    "Name",
    "TransactionID",
    "SourceDocumentID",
    "SourceType",
    "Debit",
    "Credit",
    "Balance",
  ]);
  for (const row of glRows) {
    glDebitMinor += row.debit_minor;
    glCreditMinor += row.credit_minor;
    const prev = runningByAccount.get(row.account_code) ?? 0;
    const next = prev + row.debit_minor - row.credit_minor;
    runningByAccount.set(row.account_code, next);
    rows.push([
      row.transaction_date,
      row.account_code,
      row.account_name,
      row.description,
      row.party_name,
      row.transaction_id,
      row.source_document_id,
      row.source_type,
      fmtAmount(row.debit_minor, baseCurrency, minorUnitMap),
      fmtAmount(row.credit_minor, baseCurrency, minorUnitMap),
      fmtAmount(next, baseCurrency, minorUnitMap),
    ]);
  }
  rows.push(["GLDataEnd"]);
  rows.push([
    "GLTotals",
    fmtAmount(glDebitMinor, baseCurrency, minorUnitMap),
    fmtAmount(glCreditMinor, baseCurrency, minorUnitMap),
    glRows.length,
    baseCurrency,
  ]);

  const slug = periodRef.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `uae-fta-faf-${slug}-${periodStart}-to-${periodEnd}.csv`;

  return {
    filename,
    mimeType: "text/csv; charset=utf-8",
    csvContent: formatCsv(rows),
    periodStart,
    periodEnd,
    baseCurrency,
    trnAudit: {
      companyTrn,
      suppliersWithInvalidTrn,
      customersWithInvalidTrn,
    },
    totals: {
      purchasesCount: purchaseEntries.length,
      purchasesNetAedMinor,
      purchasesVatAedMinor,
      suppliesCount: supplyEntries.length,
      suppliesNetAedMinor,
      suppliesVatAedMinor,
      glLinesCount: glRows.length,
      glDebitMinor,
      glCreditMinor,
    },
  };
}
