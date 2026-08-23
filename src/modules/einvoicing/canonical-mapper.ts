import type Database from "better-sqlite3";
import type { CanonicalEInvoice, CanonicalEInvoiceLine, CanonicalParty, CanonicalTaxBreakdown, CanonicalTaxCategory } from "./canonical-model";
import {
  PINT_AE_CUSTOMIZATION_ID,
  PINT_AE_PROFILE_ID,
  creditNoteReasonCodes,
  parseTransactionFlags,
  profileExecutionId,
  type EInvoiceSourceType,
  type ValidationIssue,
} from "./einvoice-types";

type MappingResult = { canonical: CanonicalEInvoice | null; issues: ValidationIssue[] };

type SourceRow = {
  id: string;
  document_number: string;
  document_status: string;
  issue_date: string;
  due_date: string | null;
  reference: string | null;
  reason: string | null;
  einvoice_reason_code: string | null;
  source_invoice_number: string | null;
  source_invoice_date: string | null;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency_code: string;
  flags_json: string;
  customer_name: string;
  buyer_legal_name: string | null;
  buyer_trn: string | null;
  buyer_legal_registration_identifier: string | null;
  buyer_endpoint: string | null;
  buyer_endpoint_scheme: string | null;
  buyer_address_line_1: string | null;
  buyer_city: string | null;
  buyer_country_subdivision: string | null;
  buyer_country_code: string | null;
  buyer_reference: string | null;
};

type LineRow = {
  id: string;
  description: string;
  quantity_micros: number;
  unit_price_minor: number;
  net_amount_minor: number;
  tax_amount_minor: number;
  gross_amount_minor: number;
  item_name: string | null;
  unit_name: string | null;
  rate_basis_points: number | null;
  vat_category: string | null;
  tax_entry_net_minor: number | null;
  tax_entry_vat_minor: number | null;
};

type SettingsRow = {
  enabled: number;
  legal_name: string | null;
  legal_registration_identifier: string | null;
  address_line_1: string | null;
  city: string | null;
  country_subdivision: string | null;
  country_code: string;
  participant_identifier: string | null;
  participant_identifier_scheme: string | null;
  endpoint_identifier: string | null;
  endpoint_identifier_scheme: string | null;
  specification_version: string;
  vat_registered: number;
  trn: string | null;
};

const UAE_SUBDIVISIONS = new Set(["AUH", "DXB", "SHJ", "AJ", "UAQ", "RAK", "FUJ"]);

function issue(ruleId: string, message: string, path?: string): ValidationIssue {
  return { layer: "readiness", ruleId, message, path };
}

function required(
  issues: ValidationIssue[],
  value: string | null | undefined,
  ruleId: string,
  label: string,
  path: string,
) {
  if (!value?.trim()) issues.push(issue(ruleId, `${label} is required for PINT-AE.`, path));
}

function validateParty(
  issues: ValidationIssue[],
  party: CanonicalParty,
  prefix: "seller" | "buyer",
) {
  required(issues, party.legalName, `${prefix.toUpperCase()}-LEGAL-NAME`, `${prefix === "seller" ? "Seller" : "Buyer"} legal name`, `${prefix}.legalName`);
  required(issues, party.trn, `${prefix.toUpperCase()}-TRN`, `${prefix === "seller" ? "Seller" : "Buyer"} TRN`, `${prefix}.trn`);
  required(issues, party.legalRegistrationIdentifier, `${prefix.toUpperCase()}-LEGAL-ID`, `${prefix === "seller" ? "Seller" : "Buyer"} legal registration identifier`, `${prefix}.legalRegistrationIdentifier`);
  required(issues, party.endpointIdentifier, `${prefix.toUpperCase()}-ENDPOINT`, `${prefix === "seller" ? "Seller" : "Buyer"} electronic address`, `${prefix}.endpointIdentifier`);
  required(issues, party.endpointScheme, `${prefix.toUpperCase()}-ENDPOINT-SCHEME`, `${prefix === "seller" ? "Seller" : "Buyer"} electronic address scheme`, `${prefix}.endpointScheme`);
  required(issues, party.addressLine1, `${prefix.toUpperCase()}-STREET`, `${prefix === "seller" ? "Seller" : "Buyer"} street address`, `${prefix}.addressLine1`);
  required(issues, party.city, `${prefix.toUpperCase()}-CITY`, `${prefix === "seller" ? "Seller" : "Buyer"} city`, `${prefix}.city`);
  required(issues, party.countrySubdivision, `${prefix.toUpperCase()}-SUBDIVISION`, `${prefix === "seller" ? "Seller" : "Buyer"} Emirate code`, `${prefix}.countrySubdivision`);
  if (party.trn && !/^1\d{12}03$/.test(party.trn)) {
    issues.push(issue(`${prefix.toUpperCase()}-TRN-FORMAT`, `${prefix === "seller" ? "Seller" : "Buyer"} TRN must be 15 digits, begin with 1, and end with 03.`, `${prefix}.trn`));
  }
  if (party.endpointScheme === "0235" && party.endpointIdentifier && !/^1\d{9}$/.test(party.endpointIdentifier)) {
    issues.push(issue(`${prefix.toUpperCase()}-ENDPOINT-FORMAT`, "A UAE 0235 electronic address must be 10 digits beginning with 1.", `${prefix}.endpointIdentifier`));
  }
  if (party.countryCode !== "AE") {
    issues.push(issue(`${prefix.toUpperCase()}-COUNTRY`, "The current supported PINT-AE subset requires an AE party address.", `${prefix}.countryCode`));
  }
  if (party.countrySubdivision && !UAE_SUBDIVISIONS.has(party.countrySubdivision)) {
    issues.push(issue(`${prefix.toUpperCase()}-SUBDIVISION-CODE`, "Use AUH, DXB, SHJ, AJ, UAQ, RAK, or FUJ for the Emirate code.", `${prefix}.countrySubdivision`));
  }
}

function unitCode(unitName: string | null) {
  if (!unitName) return "C62";
  const normalized = unitName.trim().toLowerCase();
  const units: Record<string, string> = {
    pc: "H87", pcs: "H87", piece: "H87", pieces: "H87", each: "H87", unit: "H87", units: "H87",
    m: "MTR", metre: "MTR", metres: "MTR", meter: "MTR", meters: "MTR",
    kg: "KGM", kilogram: "KGM", kilograms: "KGM",
    hour: "HUR", hours: "HUR", hr: "HUR", hrs: "HUR",
    service: "C62",
  };
  return units[normalized] ?? null;
}

function taxCategoryFor(row: LineRow): CanonicalTaxCategory | null {
  if (row.vat_category === "standard" && row.rate_basis_points === 500) return "S";
  if (row.vat_category === "zero_rated" && row.rate_basis_points === 0) return "Z";
  return null;
}

function readSource(sqlite: Database.Database, sourceType: EInvoiceSourceType, sourceId: string): SourceRow | undefined {
  if (sourceType === "sales_invoice") {
    return sqlite.prepare(`
      SELECT si.id, si.invoice_number AS document_number, si.document_status,
        si.invoice_date AS issue_date, si.due_date, si.reference, NULL AS reason,
        NULL AS einvoice_reason_code, NULL AS source_invoice_number, NULL AS source_invoice_date,
        si.subtotal_minor, si.tax_minor, si.total_minor, si.currency_code,
        si.einvoice_transaction_flags_json AS flags_json, c.name AS customer_name,
        c.legal_name AS buyer_legal_name, c.trn AS buyer_trn,
        c.legal_registration_identifier AS buyer_legal_registration_identifier,
        c.electronic_address AS buyer_endpoint, c.electronic_address_scheme AS buyer_endpoint_scheme,
        c.address_line_1 AS buyer_address_line_1, c.city AS buyer_city,
        c.country_subdivision AS buyer_country_subdivision, c.country_code AS buyer_country_code,
        c.buyer_reference
      FROM sales_invoices si INNER JOIN customers c ON c.id = si.customer_id
      WHERE si.id = ?
    `).get(sourceId) as SourceRow | undefined;
  }
  return sqlite.prepare(`
    SELECT scn.id, scn.credit_note_number AS document_number, scn.document_status,
      scn.date AS issue_date, NULL AS due_date, scn.reference, scn.reason,
      scn.einvoice_reason_code, si.invoice_number AS source_invoice_number,
      si.invoice_date AS source_invoice_date, scn.subtotal_minor, scn.tax_minor, scn.total_minor, scn.currency_code,
      scn.einvoice_transaction_flags_json AS flags_json, c.name AS customer_name,
      c.legal_name AS buyer_legal_name, c.trn AS buyer_trn,
      c.legal_registration_identifier AS buyer_legal_registration_identifier,
      c.electronic_address AS buyer_endpoint, c.electronic_address_scheme AS buyer_endpoint_scheme,
      c.address_line_1 AS buyer_address_line_1, c.city AS buyer_city,
      c.country_subdivision AS buyer_country_subdivision, c.country_code AS buyer_country_code,
      c.buyer_reference
    FROM sales_credit_notes scn
    INNER JOIN customers c ON c.id = scn.customer_id
    INNER JOIN sales_invoices si ON si.id = scn.source_invoice_id
    WHERE scn.id = ?
  `).get(sourceId) as SourceRow | undefined;
}

function readLines(sqlite: Database.Database, sourceType: EInvoiceSourceType, sourceId: string) {
  const lineTable = sourceType === "sales_invoice" ? "sales_invoice_lines" : "sales_credit_note_lines";
  const parentColumn = sourceType === "sales_invoice" ? "invoice_id" : "credit_note_id";
  const itemJoin = sourceType === "sales_invoice"
    ? "LEFT JOIN inventory_items item ON item.id = line.item_id"
    : "LEFT JOIN inventory_items item ON 1 = 0";
  return sqlite.prepare(`
    SELECT line.id, line.description, line.quantity_micros, line.unit_price_minor,
      line.net_amount_minor, line.tax_amount_minor, line.gross_amount_minor,
      item.name AS item_name, item.unit_name,
      te.rate_basis_points, te.vat_category,
      te.net_amount_minor AS tax_entry_net_minor, te.vat_amount_minor AS tax_entry_vat_minor
    FROM ${lineTable} line
    ${itemJoin}
    LEFT JOIN tax_entries te ON te.source_type = ? AND te.source_id = ? AND te.source_line_id = line.id
    WHERE line.${parentColumn} = ?
    ORDER BY line.position
  `).all(sourceType, sourceId, sourceId) as LineRow[];
}

export function mapSourceToCanonical(
  sqlite: Database.Database,
  sourceType: EInvoiceSourceType,
  sourceId: string,
  uuid: string,
  specificationVersion: string,
): MappingResult {
  const issues: ValidationIssue[] = [];
  const source = readSource(sqlite, sourceType, sourceId);
  if (!source) return { canonical: null, issues: [issue("SOURCE-NOT-FOUND", "The source document no longer exists.")] };
  if (source.document_status !== "posted") {
    issues.push(issue("SOURCE-NOT-POSTED", "Only posted Sales Invoices and Sales Credit Notes can be prepared."));
  }
  if (source.currency_code !== "AED") {
    issues.push(issue(
      "UNSUPPORTED-FOREIGN-CURRENCY",
      "Electronic Invoice: Unsupported in current PINT-AE ERP subset",
      "currencyCode",
    ));
  }
  const settings = sqlite.prepare(`
    SELECT eis.*, ts.vat_registered, ts.trn
    FROM business_einvoice_settings eis
    INNER JOIN business_tax_settings ts ON ts.id = 'default'
    WHERE eis.id = 'default'
  `).get() as SettingsRow;
  if (!settings.enabled) issues.push(issue("EINVOICE-DISABLED", "Enable Electronic Invoicing in Settings before preparing documents.", "settings.enabled"));
  if (!settings.vat_registered) issues.push(issue("VAT-NOT-REGISTERED", "The Phase 6 VAT settings must mark this business as VAT registered.", "vatSettings.vatRegistered"));

  const supplier: CanonicalParty = {
    legalName: settings.legal_name ?? "",
    trn: settings.trn ?? "",
    legalRegistrationIdentifier: settings.legal_registration_identifier ?? "",
    endpointIdentifier: settings.endpoint_identifier ?? "",
    endpointScheme: settings.endpoint_identifier_scheme ?? "",
    addressLine1: settings.address_line_1 ?? "",
    city: settings.city ?? "",
    countrySubdivision: settings.country_subdivision ?? "",
    countryCode: settings.country_code,
  };
  const buyer: CanonicalParty = {
    legalName: source.buyer_legal_name ?? "",
    trn: source.buyer_trn ?? "",
    legalRegistrationIdentifier: source.buyer_legal_registration_identifier ?? "",
    endpointIdentifier: source.buyer_endpoint ?? "",
    endpointScheme: source.buyer_endpoint_scheme ?? "",
    addressLine1: source.buyer_address_line_1 ?? "",
    city: source.buyer_city ?? "",
    countrySubdivision: source.buyer_country_subdivision ?? "",
    countryCode: source.buyer_country_code ?? "",
  };
  validateParty(issues, supplier, "seller");
  validateParty(issues, buyer, "buyer");

  const transactionFlags = parseTransactionFlags(source.flags_json);
  const enabledFlags = Object.entries(transactionFlags).filter(([, enabled]) => enabled).map(([name]) => name);
  if (enabledFlags.length) {
    issues.push(issue(
      "UNSUPPORTED-TRANSACTION-FLAGS",
      `The current supported subset does not yet map these transaction types: ${enabledFlags.join(", ")}.`,
      "transactionFlags",
    ));
  }

  const allowedReasonCodes = new Set<string>(creditNoteReasonCodes.map((entry) => entry.value));
  if (sourceType === "sales_credit_note" && !allowedReasonCodes.has(source.einvoice_reason_code ?? "")) {
    issues.push(issue("CREDIT-NOTE-REASON", "Choose a PINT-AE credit-note reason code.", "creditNoteReasonCode"));
  }

  const lineRows = readLines(sqlite, sourceType, sourceId);
  if (!lineRows.length) issues.push(issue("LINES-MISSING", "At least one source line is required.", "lines"));
  const lines: CanonicalEInvoiceLine[] = [];
  lineRows.forEach((row, index) => {
    const path = `lines.${index}`;
    if (row.rate_basis_points == null || row.vat_category == null) {
      issues.push(issue("VAT-SNAPSHOT-MISSING", "The posted line has no Phase 6 tax-entry snapshot.", path));
      return;
    }
    if (Math.abs(row.tax_entry_net_minor ?? 0) !== row.net_amount_minor || Math.abs(row.tax_entry_vat_minor ?? 0) !== row.tax_amount_minor) {
      issues.push(issue("VAT-SNAPSHOT-MISMATCH", "The Phase 6 tax-entry snapshot does not match the posted line totals.", path));
      return;
    }
    const category = taxCategoryFor(row);
    if (!category) {
      issues.push(issue(
        "UNSUPPORTED-VAT-CATEGORY",
        `VAT category '${row.vat_category}' at ${row.rate_basis_points / 100}% is outside the current standard/zero-rated subset.`,
        path,
      ));
      return;
    }
    const mappedUnit = unitCode(row.unit_name);
    if (!mappedUnit) {
      issues.push(issue("UNIT-CODE", `Map inventory unit '${row.unit_name}' to a UN/ECE Recommendation 20 code before preparing.`, `${path}.unitCode`));
      return;
    }
    lines.push({
      id: String(index + 1),
      description: row.description,
      itemName: row.item_name ?? row.description,
      quantityMicros: row.quantity_micros,
      unitCode: mappedUnit,
      unitPriceMinor: row.unit_price_minor,
      netAmountMinor: row.net_amount_minor,
      taxAmountMinor: row.tax_amount_minor,
      grossAmountMinor: row.gross_amount_minor,
      taxCategory: category,
      taxRateBasisPoints: row.rate_basis_points,
    });
  });

  const grouped = new Map<string, CanonicalTaxBreakdown>();
  for (const line of lines) {
    const key = `${line.taxCategory}:${line.taxRateBasisPoints}`;
    const current = grouped.get(key) ?? {
      taxCategory: line.taxCategory,
      taxRateBasisPoints: line.taxRateBasisPoints,
      taxableAmountMinor: 0,
      taxAmountMinor: 0,
    };
    current.taxableAmountMinor += line.netAmountMinor;
    current.taxAmountMinor += line.taxAmountMinor;
    grouped.set(key, current);
  }
  const calculatedSubtotal = lines.reduce((sum, line) => sum + line.netAmountMinor, 0);
  const calculatedTax = lines.reduce((sum, line) => sum + line.taxAmountMinor, 0);
  const calculatedTotal = lines.reduce((sum, line) => sum + line.grossAmountMinor, 0);
  if (lines.length === lineRows.length && (
    calculatedSubtotal !== source.subtotal_minor || calculatedTax !== source.tax_minor || calculatedTotal !== source.total_minor
  )) {
    issues.push(issue("TOTALS-MISMATCH", "Canonical line totals do not match the posted accounting document.", "totals"));
  }

  if (issues.length) return { canonical: null, issues };
  return {
    canonical: {
      specificationVersion,
      customizationId: PINT_AE_CUSTOMIZATION_ID,
      profileId: PINT_AE_PROFILE_ID,
      profileExecutionId: profileExecutionId(transactionFlags),
      uuid,
      sourceType,
      sourceId,
      documentType: sourceType === "sales_invoice" ? "invoice" : "credit_note",
      documentNumber: source.document_number,
      issueDate: source.issue_date,
      dueDate: source.due_date,
      currencyCode: "AED",
      supplier,
      buyer,
      buyerReference: source.buyer_reference || null,
      billingReference: source.source_invoice_number && source.source_invoice_date
        ? { documentNumber: source.source_invoice_number, issueDate: source.source_invoice_date }
        : null,
      creditNoteReasonCode: source.einvoice_reason_code as CanonicalEInvoice["creditNoteReasonCode"],
      note: source.reason || null,
      transactionFlags,
      lines,
      taxBreakdowns: [...grouped.values()],
      subtotalMinor: source.subtotal_minor,
      taxMinor: source.tax_minor,
      totalMinor: source.total_minor,
    },
    issues: [],
  };
}
