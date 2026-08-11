import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getBusinessDb } from "@/core/db/business";
import { minorToInput, quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { PINT_AE_SPECIFICATION_VERSION } from "@/modules/einvoicing/einvoice-types";
import { getPintAeVersion } from "@/modules/einvoicing/pint-ae/registry";
import type { AspInboundEnvelope, NormalizedAspInboundDocument } from "@/modules/einvoicing/providers/asp-provider";
import { getAspProvider } from "@/modules/einvoicing/providers/registry";
import { savePurchaseInvoice } from "@/modules/purchase-invoices/purchase-invoice-service";
import { createSupplier } from "@/modules/suppliers/supplier-service";
import { assertVatDateUnlocked } from "@/modules/tax/tax-lock-service";
import type {
  CanonicalInboundEInvoice,
  CanonicalInboundLine,
  InboundEInvoiceStatus,
  InboundLineMappingInput,
  InboundLineMatchStatus,
  InboundValidationIssue,
  InboundValidationReport,
} from "./inbound-types";
import { assertSafeInboundXml, parseInboundPintAeXml } from "./pint-ae-parser";

type Sqlite = Database.Database;

type InboundDocumentRow = {
  id: string;
  provider_key: string;
  environment: string;
  provider_document_id: string | null;
  document_type: "invoice" | "credit_note";
  specification_version: string;
  document_uuid: string;
  seller_endpoint_id: string | null;
  seller_endpoint_scheme: string | null;
  seller_trn: string | null;
  seller_legal_registration_identifier: string | null;
  seller_legal_name: string;
  buyer_endpoint_id: string | null;
  buyer_endpoint_scheme: string | null;
  buyer_trn: string | null;
  buyer_legal_registration_identifier: string | null;
  buyer_legal_name: string | null;
  document_number: string;
  issue_date: string;
  tax_date: string | null;
  due_date: string | null;
  currency_code: string;
  source_invoice_reference: string | null;
  status: InboundEInvoiceStatus;
  network_status: string | null;
  raw_xml: string;
  raw_hash: string;
  canonical_json: string;
  validation_result_json: string | null;
  subtotal_minor: number;
  allowance_total_minor: number;
  charge_total_minor: number;
  tax_minor: number;
  total_minor: number;
  amount_due_minor: number;
  buyer_identity_verified: number;
  supplier_id: string | null;
  purchase_order_id: string | null;
  goods_receipt_id: string | null;
  purchase_invoice_id: string | null;
  duplicate_of_id: string | null;
  duplicate_kind: "hard" | "likely" | null;
  last_error: string | null;
  rejection_reason: string | null;
  received_at: string;
  validated_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  archived_at: string | null;
};

type InboundLineRow = {
  id: string;
  inbound_document_id: string;
  source_line_id: string;
  order_line_reference: string | null;
  supplier_item_identifier: string | null;
  erp_item_identifier: string | null;
  description: string;
  item_name: string | null;
  quantity_micros: number;
  unit_code: string;
  unit_price_minor: number;
  net_amount_minor: number;
  tax_amount_minor: number;
  gross_amount_minor: number;
  tax_category: string;
  tax_rate_basis_points: number;
  match_status: InboundLineMatchStatus;
  purchase_order_line_id: string | null;
  item_id: string | null;
  expense_account_id: string | null;
  tax_code_id: string | null;
  project_id: string | null;
  position: number;
};

type SupplierIdentityMatch = { supplierId: string | null; ambiguous: boolean; method: string | null };

function normalizeIdentity(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getDocumentRow(sqlite: Sqlite, documentId: string) {
  return sqlite.prepare("SELECT * FROM inbound_einvoice_documents WHERE id = ?").get(documentId) as InboundDocumentRow | undefined;
}

function getLines(sqlite: Sqlite, documentId: string) {
  return sqlite.prepare(`
    SELECT * FROM inbound_einvoice_lines
    WHERE inbound_document_id = ? ORDER BY position
  `).all(documentId) as InboundLineRow[];
}

function appendEvent(
  sqlite: Sqlite,
  documentId: string,
  providerKey: string,
  eventType: string,
  status: string,
  options: { providerEventId?: string | null; rawResponse?: unknown; createdBy?: string | null } = {},
) {
  sqlite.prepare(`
    INSERT INTO inbound_einvoice_events (
      id, inbound_document_id, provider_key, event_type, status, provider_event_id,
      raw_response, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    documentId,
    providerKey,
    eventType,
    status,
    options.providerEventId ?? null,
    options.rawResponse === undefined ? null : JSON.stringify(options.rawResponse),
    options.createdBy ?? null,
    new Date().toISOString(),
  );
}

function validationReport(
  specificationVersion: string,
  groups: {
    security?: InboundValidationIssue[];
    parsing?: InboundValidationIssue[];
    pintUbl?: InboundValidationIssue[];
    pintAe?: InboundValidationIssue[];
    business?: InboundValidationIssue[];
    mapping?: InboundValidationIssue[];
  },
  validatedAt: string,
): InboundValidationReport {
  const security = groups.security ?? [];
  const parsing = groups.parsing ?? [];
  const pintUbl = groups.pintUbl ?? [];
  const pintAe = groups.pintAe ?? [];
  const business = groups.business ?? [];
  const mapping = groups.mapping ?? [];
  const issues = [...security, ...parsing, ...pintUbl, ...pintAe, ...business, ...mapping];
  return {
    valid: issues.length === 0,
    specificationVersion,
    validatedAt,
    layers: {
      security: { valid: security.length === 0, issueCount: security.length },
      parsing: { valid: parsing.length === 0, issueCount: parsing.length },
      pintUbl: { valid: pintUbl.length === 0, issueCount: pintUbl.length },
      pintAe: { valid: pintAe.length === 0, issueCount: pintAe.length },
      business: { valid: business.length === 0, issueCount: business.length },
      mapping: { valid: mapping.length === 0, issueCount: mapping.length },
    },
    issues,
  };
}

function buyerIdentityResult(sqlite: Sqlite, canonical: CanonicalInboundEInvoice) {
  const settings = sqlite.prepare(`
    SELECT eis.endpoint_identifier, eis.endpoint_identifier_scheme,
      eis.legal_registration_identifier, eis.legal_name, ts.trn
    FROM business_einvoice_settings eis
    INNER JOIN business_tax_settings ts ON ts.id = 'default'
    WHERE eis.id = 'default'
  `).get() as {
    endpoint_identifier: string | null;
    endpoint_identifier_scheme: string | null;
    legal_registration_identifier: string | null;
    legal_name: string | null;
    trn: string | null;
  };
  const comparisons = [
    {
      configured: `${normalizeIdentity(settings.endpoint_identifier_scheme)}\u0000${normalizeIdentity(settings.endpoint_identifier)}`,
      incoming: `${normalizeIdentity(canonical.buyer.endpointScheme)}\u0000${normalizeIdentity(canonical.buyer.endpointIdentifier)}`,
      usable: Boolean(settings.endpoint_identifier && canonical.buyer.endpointIdentifier),
    },
    { configured: normalizeIdentity(settings.trn), incoming: normalizeIdentity(canonical.buyer.trn), usable: Boolean(settings.trn && canonical.buyer.trn) },
    {
      configured: normalizeIdentity(settings.legal_registration_identifier),
      incoming: normalizeIdentity(canonical.buyer.legalRegistrationIdentifier),
      usable: Boolean(settings.legal_registration_identifier && canonical.buyer.legalRegistrationIdentifier),
    },
  ];
  if (comparisons.some((entry) => entry.usable && entry.configured === entry.incoming)) {
    return { verified: true, wrongBuyer: false, message: null };
  }
  const hasComparableStrongIdentity = comparisons.some((entry) => entry.usable);
  if (hasComparableStrongIdentity) {
    return {
      verified: false,
      wrongBuyer: true,
      message: "The buyer endpoint, TRN, and legal registration identifiers do not match this business.",
    };
  }
  if (
    settings.legal_name
    && canonical.buyer.legalName
    && normalizeIdentity(settings.legal_name) === normalizeIdentity(canonical.buyer.legalName)
  ) {
    return { verified: true, wrongBuyer: false, message: null };
  }
  return {
    verified: false,
    wrongBuyer: false,
    message: "The buyer identity could not be verified. Configure a business endpoint, TRN, or legal registration identifier.",
  };
}

function candidates(sqlite: Sqlite, sql: string, ...parameters: unknown[]) {
  return (sqlite.prepare(sql).all(...parameters) as { supplier_id: string }[])
    .map((row) => row.supplier_id);
}

function uniqueMatch(ids: string[], method: string): SupplierIdentityMatch | null {
  const unique = [...new Set(ids)];
  if (!unique.length) return null;
  return unique.length === 1
    ? { supplierId: unique[0]!, ambiguous: false, method }
    : { supplierId: null, ambiguous: true, method };
}

function matchSupplier(sqlite: Sqlite, canonical: CanonicalInboundEInvoice): SupplierIdentityMatch {
  const endpoint = canonical.supplier.endpointIdentifier;
  const scheme = canonical.supplier.endpointScheme;
  if (endpoint && scheme) {
    const direct = uniqueMatch(candidates(sqlite, `
      SELECT id AS supplier_id FROM suppliers
      WHERE is_active = 1 AND upper(trim(electronic_address)) = upper(trim(?))
        AND upper(trim(electronic_address_scheme)) = upper(trim(?))
    `, endpoint, scheme), "electronic endpoint");
    if (direct) return direct;
  }
  if (canonical.supplier.trn) {
    const trn = uniqueMatch(candidates(sqlite, `
      SELECT id AS supplier_id FROM suppliers
      WHERE is_active = 1 AND upper(trim(COALESCE(trn, tax_reference))) = upper(trim(?))
    `, canonical.supplier.trn), "TRN");
    if (trn) return trn;
  }
  if (canonical.supplier.legalRegistrationIdentifier) {
    const registration = uniqueMatch(candidates(sqlite, `
      SELECT id AS supplier_id FROM suppliers
      WHERE is_active = 1
        AND upper(trim(legal_registration_identifier)) = upper(trim(?))
    `, canonical.supplier.legalRegistrationIdentifier), "legal registration identifier");
    if (registration) return registration;
  }
  const mappedConditions: string[] = [];
  const parameters: string[] = [];
  if (endpoint && scheme) {
    mappedConditions.push("(identity_type = 'endpoint' AND upper(scheme) = upper(?) AND upper(identifier) = upper(?))");
    parameters.push(scheme, endpoint);
  }
  if (canonical.supplier.trn) {
    mappedConditions.push("(identity_type = 'trn' AND upper(identifier) = upper(?))");
    parameters.push(canonical.supplier.trn);
  }
  if (canonical.supplier.legalRegistrationIdentifier) {
    mappedConditions.push("(identity_type = 'legal_registration' AND upper(identifier) = upper(?))");
    parameters.push(canonical.supplier.legalRegistrationIdentifier);
  }
  if (mappedConditions.length) {
    const mapped = uniqueMatch(candidates(sqlite, `
      SELECT supplier_id FROM supplier_einvoice_identities
      WHERE ${mappedConditions.join(" OR ")}
    `, ...parameters), "confirmed identity mapping");
    if (mapped) return mapped;
  }
  return { supplierId: null, ambiguous: false, method: null };
}

function taxCategoryForInbound(category: string) {
  if (category === "S") return "standard";
  if (category === "Z") return "zero_rated";
  return null;
}

function compatibleTaxCode(sqlite: Sqlite, line: InboundLineRow, preferredTaxCodeId?: string | null) {
  const category = taxCategoryForInbound(line.tax_category);
  if (!category) return null;
  const parameters: unknown[] = [category, line.tax_rate_basis_points];
  let preferred = "";
  if (preferredTaxCodeId) {
    preferred = "AND id = ?";
    parameters.push(preferredTaxCodeId);
  }
  const rows = sqlite.prepare(`
    SELECT id FROM tax_codes
    WHERE is_active = 1 AND direction IN ('purchases', 'both')
      AND vat_category = ? AND rate_basis_points = ? ${preferred}
    ORDER BY id
  `).all(...parameters) as { id: string }[];
  return rows.length === 1 ? rows[0]!.id : null;
}

function findItem(sqlite: Sqlite, identifier: string | null) {
  if (!identifier) return null;
  const rows = sqlite.prepare(`
    SELECT id, inventory_asset_account_id FROM inventory_items
    WHERE is_active = 1 AND (id = ? OR upper(COALESCE(sku, '')) = upper(?))
  `).all(identifier, identifier) as { id: string; inventory_asset_account_id: string }[];
  return rows.length === 1 ? rows[0]! : null;
}

function mapPurchaseOrder(sqlite: Sqlite, document: InboundDocumentRow, canonical: CanonicalInboundEInvoice) {
  if (!document.supplier_id || !canonical.orderReference) return null;
  const rows = sqlite.prepare(`
    SELECT id, supplier_id, status FROM purchase_orders
    WHERE upper(order_number) = upper(?) OR upper(COALESCE(reference, '')) = upper(?)
    ORDER BY created_at
  `).all(canonical.orderReference, canonical.orderReference) as { id: string; supplier_id: string; status: string }[];
  const sameSupplier = rows.filter((row) => row.supplier_id === document.supplier_id && row.status !== "cancelled");
  if (sameSupplier.length === 1) return sameSupplier[0]!.id;
  return null;
}

function mapGoodsReceipt(sqlite: Sqlite, document: InboundDocumentRow, canonical: CanonicalInboundEInvoice) {
  if (!document.supplier_id) return null;
  if (canonical.despatchReference) {
    const rows = sqlite.prepare(`
      SELECT id FROM goods_receipts
      WHERE supplier_id = ? AND document_status = 'posted'
        AND (upper(receipt_number) = upper(?) OR upper(COALESCE(reference, '')) = upper(?))
    `).all(document.supplier_id, canonical.despatchReference, canonical.despatchReference) as { id: string }[];
    if (rows.length === 1) return rows[0]!.id;
  }
  if (document.purchase_order_id) {
    const rows = sqlite.prepare(`
      SELECT id FROM goods_receipts
      WHERE supplier_id = ? AND purchase_order_id = ? AND document_status = 'posted'
      ORDER BY date, created_at
    `).all(document.supplier_id, document.purchase_order_id) as { id: string }[];
    if (rows.length === 1) return rows[0]!.id;
  }
  return null;
}

function autoMapLines(sqlite: Sqlite, document: InboundDocumentRow) {
  const lines = getLines(sqlite, document.id);
  const orderLines = document.purchase_order_id
    ? sqlite.prepare(`
        SELECT pol.*, po.project_id AS header_project_id
        FROM purchase_order_lines pol
        INNER JOIN purchase_orders po ON po.id = pol.purchase_order_id
        WHERE pol.purchase_order_id = ? ORDER BY pol.position
      `).all(document.purchase_order_id) as Array<{
        id: string;
        item_id: string | null;
        description: string;
        quantity_micros: number;
        unit_price_minor: number;
        expense_account_id: string | null;
        tax_code_id: string;
        project_id: string | null;
        header_project_id: string | null;
        position: number;
      }>
    : [];
  for (const line of lines) {
    let orderLine: (typeof orderLines)[number] | null = null;
    let matchStatus: InboundLineMatchStatus = line.match_status;
    if (line.order_line_reference) {
      const exact = orderLines.filter((candidate) => (
        candidate.id === line.order_line_reference
        || String(candidate.position + 1) === line.order_line_reference
      ));
      if (exact.length === 1) {
        orderLine = exact[0]!;
        matchStatus = "Matched";
      }
    }
    let mappedItem: { id: string; inventory_asset_account_id: string } | null = null;
    if (document.supplier_id && line.supplier_item_identifier) {
      mappedItem = sqlite.prepare(`
        SELECT i.id, i.inventory_asset_account_id
        FROM supplier_item_mappings sim
        INNER JOIN inventory_items i ON i.id = sim.item_id AND i.is_active = 1
        WHERE sim.supplier_id = ? AND upper(sim.supplier_item_identifier) = upper(?)
      `).get(document.supplier_id, line.supplier_item_identifier) as typeof mappedItem;
    }
    mappedItem ??= findItem(sqlite, line.erp_item_identifier);
    if (!orderLine && mappedItem && orderLines.length) {
      const byItem = orderLines.filter((candidate) => candidate.item_id === mappedItem!.id);
      if (byItem.length === 1) {
        orderLine = byItem[0]!;
        matchStatus = "Matched";
      }
    }
    if (!orderLine && orderLines.length) {
      const possible = orderLines.filter((candidate) => (
        normalizeIdentity(candidate.description) === normalizeIdentity(line.description)
        && candidate.quantity_micros === line.quantity_micros
        && candidate.unit_price_minor === line.unit_price_minor
      ));
      if (possible.length === 1) {
        orderLine = possible[0]!;
        matchStatus = "Possible Match";
      }
    }
    if (orderLine?.item_id) mappedItem = findItem(sqlite, orderLine.item_id);
    const itemId = orderLine?.item_id ?? mappedItem?.id ?? line.item_id;
    const expenseAccountId = orderLine?.expense_account_id
      ?? mappedItem?.inventory_asset_account_id
      ?? line.expense_account_id;
    const taxCodeId = compatibleTaxCode(sqlite, line, orderLine?.tax_code_id)
      ?? line.tax_code_id
      ?? compatibleTaxCode(sqlite, line);
    sqlite.prepare(`
      UPDATE inbound_einvoice_lines
      SET match_status = ?, purchase_order_line_id = ?, item_id = ?, expense_account_id = ?,
        tax_code_id = ?, project_id = ?
      WHERE id = ?
    `).run(
      matchStatus,
      orderLine?.id ?? line.purchase_order_line_id,
      itemId,
      expenseAccountId,
      taxCodeId,
      orderLine?.project_id ?? orderLine?.header_project_id ?? line.project_id,
      line.id,
    );
  }
}

function likelyDuplicate(sqlite: Sqlite, document: InboundDocumentRow) {
  if (!document.supplier_id) return null;
  const inbound = sqlite.prepare(`
    SELECT id FROM inbound_einvoice_documents
    WHERE id <> ? AND supplier_id = ? AND upper(document_number) = upper(?)
      AND issue_date = ? AND currency_code = ? AND total_minor = ?
    ORDER BY received_at LIMIT 1
  `).get(
    document.id,
    document.supplier_id,
    document.document_number,
    document.issue_date,
    document.currency_code,
    document.total_minor,
  ) as { id: string } | undefined;
  if (inbound) return inbound.id;
  const purchaseInvoice = sqlite.prepare(`
    SELECT id FROM purchase_invoices
    WHERE supplier_id = ? AND upper(supplier_invoice_number) = upper(?)
      AND document_status <> 'void'
    ORDER BY created_at LIMIT 1
  `).get(document.supplier_id, document.document_number) as { id: string } | undefined;
  return purchaseInvoice ? `purchase_invoice:${purchaseInvoice.id}` : null;
}

function refreshReadiness(sqlite: Sqlite, documentId: string, userId?: string) {
  let document = getDocumentRow(sqlite, documentId);
  if (!document) throw new Error("Inbound eInvoice not found.");
  if (["ValidationFailed", "Rejected", "Archived", "DraftCreated", "Processed"].includes(document.status)) {
    return document;
  }
  const duplicateWasResolved = Boolean(sqlite.prepare(`
    SELECT 1 FROM inbound_einvoice_events
    WHERE inbound_document_id = ? AND event_type = 'LikelyDuplicateResolved' LIMIT 1
  `).get(documentId));
  const duplicate = duplicateWasResolved ? null : likelyDuplicate(sqlite, document);
  if (duplicate && !document.duplicate_of_id && !document.duplicate_kind) {
    sqlite.prepare(`
      UPDATE inbound_einvoice_documents
      SET duplicate_of_id = CASE WHEN ? LIKE 'purchase_invoice:%' THEN NULL ELSE ? END,
        duplicate_kind = 'likely', last_error = 'A possible duplicate supplier invoice requires review.'
      WHERE id = ?
    `).run(duplicate, duplicate, documentId);
    document = getDocumentRow(sqlite, documentId)!;
  }
  const lines = getLines(sqlite, documentId);
  let status: InboundEInvoiceStatus;
  let lastError: string | null = null;
  if (!document.supplier_id) {
    status = "NeedsSupplier";
    lastError = "No Supplier matched a strong electronic identity.";
  } else if (!document.buyer_identity_verified) {
    status = "NeedsReview";
    lastError = "Buyer identity must be verified before draft creation.";
  } else if (document.document_type === "credit_note") {
    status = "NeedsReview";
    lastError = "Valid electronic credit note — accounting conversion not yet supported.";
  } else if (document.duplicate_kind) {
    status = "NeedsReview";
    lastError = "A possible duplicate must be resolved before draft creation.";
  } else if (!document.due_date) {
    status = "NeedsReview";
    lastError = "A due date is required by the Purchase Invoice workflow.";
  } else if (document.allowance_total_minor !== 0 || document.charge_total_minor !== 0) {
    status = "NeedsReview";
    lastError = "Allowances or charges cannot be represented by the current Purchase Invoice model.";
  } else if (document.amount_due_minor !== document.total_minor) {
    status = "NeedsReview";
    lastError = "Amount due must equal the invoice total for Phase 8 draft conversion.";
  } else if (lines.some((line) => (
    line.match_status !== "Matched"
    || !line.tax_code_id
    || (!line.item_id && !line.expense_account_id)
  ))) {
    status = "NeedsReview";
    lastError = "Resolve every line's item or expense, VAT code, and deterministic match.";
  } else {
    try {
      assertVatDateUnlocked(sqlite, document.tax_date ?? document.issue_date, lines.map((line) => line.tax_code_id!));
      status = "ReadyForDraft";
    } catch (error) {
      status = "NeedsReview";
      lastError = error instanceof Error ? error.message : "The VAT date is locked.";
    }
  }
  sqlite.prepare(`
    UPDATE inbound_einvoice_documents
    SET status = ?, last_error = ?, reviewed_by = COALESCE(?, reviewed_by),
      reviewed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE reviewed_at END
    WHERE id = ?
  `).run(status, lastError, userId ?? null, userId ?? null, new Date().toISOString(), documentId);
  return getDocumentRow(sqlite, documentId)!;
}

function insertLines(sqlite: Sqlite, documentId: string, lines: CanonicalInboundLine[]) {
  const insert = sqlite.prepare(`
    INSERT INTO inbound_einvoice_lines (
      id, inbound_document_id, source_line_id, order_line_reference,
      supplier_item_identifier, erp_item_identifier, description, item_name,
      quantity_micros, unit_code, unit_price_minor, net_amount_minor, tax_amount_minor,
      gross_amount_minor, tax_category, tax_rate_basis_points, match_status, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unmatched', ?)
  `);
  lines.forEach((line, position) => insert.run(
    randomUUID(), documentId, line.sourceLineId, line.orderLineReference,
    line.supplierItemIdentifier, line.erpItemIdentifier, line.description, line.itemName,
    line.quantityMicros, line.unitCode, line.unitPriceMinor, line.netAmountMinor,
    line.taxAmountMinor, line.grossAmountMinor, line.taxCategory,
    line.taxRateBasisPoints, position,
  ));
}

function hardDuplicate(sqlite: Sqlite, normalized: NormalizedAspInboundDocument, canonical: CanonicalInboundEInvoice, rawHash: string) {
  if (normalized.providerEventId) {
    const event = sqlite.prepare(`
      SELECT inbound_document_id AS id FROM inbound_einvoice_events
      WHERE provider_key = ? AND provider_event_id = ?
    `).get(normalized.providerKey, normalized.providerEventId) as { id: string } | undefined;
    if (event) return event.id;
  }
  if (normalized.providerDocumentId) {
    const provider = sqlite.prepare(`
      SELECT id FROM inbound_einvoice_documents
      WHERE provider_key = ? AND environment = ? AND provider_document_id = ?
    `).get(normalized.providerKey, normalized.environment, normalized.providerDocumentId) as { id: string } | undefined;
    if (provider) return provider.id;
  }
  const hash = sqlite.prepare("SELECT id FROM inbound_einvoice_documents WHERE raw_hash = ?")
    .get(rawHash) as { id: string } | undefined;
  if (hash) return hash.id;
  if (!canonical.documentUuid) return null;
  const identityConditions: string[] = [];
  const parameters: unknown[] = [canonical.documentUuid];
  if (canonical.supplier.endpointIdentifier && canonical.supplier.endpointScheme) {
    identityConditions.push("(upper(seller_endpoint_id) = upper(?) AND upper(seller_endpoint_scheme) = upper(?))");
    parameters.push(canonical.supplier.endpointIdentifier, canonical.supplier.endpointScheme);
  }
  if (canonical.supplier.trn) {
    identityConditions.push("upper(seller_trn) = upper(?)");
    parameters.push(canonical.supplier.trn);
  }
  if (canonical.supplier.legalRegistrationIdentifier) {
    identityConditions.push("upper(seller_legal_registration_identifier) = upper(?)");
    parameters.push(canonical.supplier.legalRegistrationIdentifier);
  }
  if (!identityConditions.length) {
    identityConditions.push("upper(seller_legal_name) = upper(?)");
    parameters.push(canonical.supplier.legalName);
  }
  const uuid = sqlite.prepare(`
    SELECT id FROM inbound_einvoice_documents
    WHERE document_uuid = ? AND (${identityConditions.join(" OR ")}) LIMIT 1
  `).get(...parameters) as { id: string } | undefined;
  return uuid?.id ?? null;
}

function normalizeInbound(
  providerKey: string,
  environment: string,
  envelope: AspInboundEnvelope,
) {
  if (providerKey !== "mock" || environment !== "mock") {
    throw new Error("Only the Mock inbound ASP is executable in Phase 8.");
  }
  const provider = getAspProvider(providerKey);
  if (!provider.normalizeInbound) throw new Error(`ASP provider '${providerKey}' does not support inbound documents.`);
  return provider.normalizeInbound(envelope, environment);
}

export function receiveInboundDocument(
  businessId: string,
  userId: string,
  envelope: AspInboundEnvelope,
  providerKey = "mock",
  environment = "mock",
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const settings = sqlite.prepare(`
    SELECT enabled, asp_provider_key, asp_environment
    FROM business_einvoice_settings WHERE id = 'default'
  `).get() as { enabled: number; asp_provider_key: string | null; asp_environment: string };
  if (!settings.enabled || settings.asp_provider_key !== providerKey || settings.asp_environment !== environment) {
    throw new Error("Configure and enable the Mock ASP before receiving inbound eInvoices.");
  }
  const normalized = normalizeInbound(providerKey, environment, envelope);
  if (normalized.specificationVersion !== PINT_AE_SPECIFICATION_VERSION) {
    throw new Error(`PINT-AE specification version ${normalized.specificationVersion} is not installed.`);
  }
  assertSafeInboundXml(normalized.xml);
  const implementation = getPintAeVersion(normalized.specificationVersion);
  let official: ReturnType<typeof implementation.validateXml>;
  try {
    official = implementation.validateXml(normalized.xml);
  } catch {
    throw new Error("Inbound eInvoice XML is malformed and could not be parsed safely.");
  }
  const parsed = parseInboundPintAeXml(normalized.xml, normalized.specificationVersion);
  const canonical = parsed.canonical;
  const rawHash = createHash("sha256").update(normalized.xml, "utf8").digest("hex");
  const duplicateId = hardDuplicate(sqlite, normalized, canonical, rawHash);
  if (duplicateId) {
    if (normalized.providerEventId && !sqlite.prepare(`
      SELECT 1 FROM inbound_einvoice_events WHERE provider_key = ? AND provider_event_id = ?
    `).get(normalized.providerKey, normalized.providerEventId)) {
      appendEvent(sqlite, duplicateId, normalized.providerKey, "DuplicateReceived", "Duplicate", {
        providerEventId: normalized.providerEventId,
        rawResponse: normalized.rawProviderEvent,
        createdBy: userId,
      });
    }
    return { ...hydrateDocument(getDocumentRow(sqlite, duplicateId)!), duplicateReceived: true };
  }
  const buyer = buyerIdentityResult(sqlite, canonical);
  const supplierMatch = matchSupplier(sqlite, canonical);
  const businessIssues: InboundValidationIssue[] = [];
  const mappingIssues: InboundValidationIssue[] = [];
  if (canonical.currencyCode !== "AED") {
    businessIssues.push({ layer: "business", ruleId: "UNSUPPORTED-CURRENCY", message: "Needs Review / Unsupported Currency Scenario. The source is archived without silent AED conversion." });
  }
  if (!buyer.verified) {
    businessIssues.push({ layer: "business", ruleId: buyer.wrongBuyer ? "WRONG-BUYER" : "BUYER-IDENTITY", message: buyer.message! });
  }
  if (supplierMatch.ambiguous) {
    mappingIssues.push({ layer: "mapping", ruleId: "AMBIGUOUS-SUPPLIER", message: `Multiple Suppliers match the ${supplierMatch.method}.` });
  }
  for (const [position, line] of canonical.lines.entries()) {
    const category = taxCategoryForInbound(line.taxCategory);
    if (!category || (category === "standard" && line.taxRateBasisPoints !== 500) || (category === "zero_rated" && line.taxRateBasisPoints !== 0)) {
      mappingIssues.push({ layer: "mapping", ruleId: "UNSUPPORTED-VAT", message: `Line ${position + 1} VAT category/rate cannot be mapped safely.` });
    }
  }
  const pintUblIssues = official.pintUblIssues.map((issue) => ({ ...issue, layer: "pint-ubl" as const }));
  const pintAeIssues = official.pintAeIssues.map((issue) => ({ ...issue, layer: "pint-ae" as const }));
  const parsingIssues = parsed.issues.filter((issue) => issue.layer === "parsing");
  const parserMappingIssues = parsed.issues.filter((issue) => issue.layer === "mapping");
  const now = new Date().toISOString();
  const report = validationReport(normalized.specificationVersion, {
    parsing: parsingIssues,
    pintUbl: pintUblIssues,
    pintAe: pintAeIssues,
    business: businessIssues,
    mapping: [...parserMappingIssues, ...mappingIssues],
  }, now);
  const structurallyInvalid = parsingIssues.length > 0 || pintUblIssues.length > 0 || pintAeIssues.length > 0;
  const initialStatus: InboundEInvoiceStatus = structurallyInvalid
    ? "ValidationFailed"
    : buyer.wrongBuyer
      ? "Rejected"
      : supplierMatch.supplierId
        ? "Validated"
        : "NeedsSupplier";
  const id = randomUUID();
  sqlite.transaction(() => {
    sqlite.prepare(`
      INSERT INTO inbound_einvoice_documents (
        id, provider_key, environment, provider_document_id, document_type,
        specification_version, document_uuid, seller_endpoint_id, seller_endpoint_scheme,
        seller_trn, seller_legal_registration_identifier, seller_legal_name,
        buyer_endpoint_id, buyer_endpoint_scheme, buyer_trn,
        buyer_legal_registration_identifier, buyer_legal_name, document_number,
        issue_date, tax_date, due_date, currency_code, source_invoice_reference,
        status, network_status, raw_xml, raw_hash, canonical_json, validation_result_json,
        subtotal_minor, allowance_total_minor, charge_total_minor, tax_minor, total_minor,
        amount_due_minor, buyer_identity_verified, supplier_id, last_error, rejection_reason,
        received_at, validated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      id, normalized.providerKey, normalized.environment, normalized.providerDocumentId,
      canonical.documentType, normalized.specificationVersion, canonical.documentUuid || `invalid-${rawHash}`,
      canonical.supplier.endpointIdentifier, canonical.supplier.endpointScheme,
      canonical.supplier.trn, canonical.supplier.legalRegistrationIdentifier,
      canonical.supplier.legalName, canonical.buyer.endpointIdentifier,
      canonical.buyer.endpointScheme, canonical.buyer.trn,
      canonical.buyer.legalRegistrationIdentifier, canonical.buyer.legalName,
      canonical.documentNumber, canonical.issueDate, canonical.taxDate, canonical.dueDate,
      canonical.currencyCode, canonical.sourceInvoiceReference, initialStatus,
      normalized.networkStatus, normalized.xml, rawHash, JSON.stringify(canonical),
      JSON.stringify(report), canonical.subtotalMinor, canonical.allowanceTotalMinor,
      canonical.chargeTotalMinor, canonical.taxMinor, canonical.totalMinor,
      canonical.amountDueMinor, buyer.verified ? 1 : 0, supplierMatch.supplierId,
      report.issues[0]?.message ?? null, buyer.wrongBuyer ? buyer.message : null,
      normalized.receivedAt, now,
    );
    insertLines(sqlite, id, canonical.lines);
    appendEvent(sqlite, id, normalized.providerKey, "Received", "Received", {
      providerEventId: normalized.providerEventId,
      rawResponse: normalized.rawProviderEvent,
      createdBy: userId,
    });
    appendEvent(sqlite, id, normalized.providerKey, "ValidationCompleted", initialStatus, {
      rawResponse: { mock: true, valid: report.valid, issueCount: report.issues.length },
      createdBy: userId,
    });
    if (buyer.wrongBuyer) {
      appendEvent(sqlite, id, normalized.providerKey, "BuyerRejected", "Rejected", {
        rawResponse: { mock: true, reason: buyer.message },
        createdBy: userId,
      });
      return;
    }
    if (structurallyInvalid) return;
    let document = getDocumentRow(sqlite, id)!;
    const purchaseOrderId = mapPurchaseOrder(sqlite, document, canonical);
    sqlite.prepare("UPDATE inbound_einvoice_documents SET purchase_order_id = ? WHERE id = ?")
      .run(purchaseOrderId, id);
    document = getDocumentRow(sqlite, id)!;
    const goodsReceiptId = mapGoodsReceipt(sqlite, document, canonical);
    sqlite.prepare("UPDATE inbound_einvoice_documents SET goods_receipt_id = ? WHERE id = ?")
      .run(goodsReceiptId, id);
    document = getDocumentRow(sqlite, id)!;
    autoMapLines(sqlite, document);
    const refreshed = refreshReadiness(sqlite, id);
    appendEvent(sqlite, id, normalized.providerKey, "ReviewClassified", refreshed.status, {
      rawResponse: { mock: true, supplierMatch: supplierMatch.method, purchaseOrderId, goodsReceiptId },
      createdBy: userId,
    });
  }).immediate();
  return { ...hydrateDocument(getDocumentRow(sqlite, id)!), duplicateReceived: false };
}

function hydrateDocument(row: InboundDocumentRow) {
  return {
    id: row.id,
    providerKey: row.provider_key,
    environment: row.environment,
    providerDocumentId: row.provider_document_id,
    documentType: row.document_type,
    specificationVersion: row.specification_version,
    documentUuid: row.document_uuid,
    sellerEndpointId: row.seller_endpoint_id,
    sellerEndpointScheme: row.seller_endpoint_scheme,
    sellerTrn: row.seller_trn,
    sellerLegalRegistrationIdentifier: row.seller_legal_registration_identifier,
    sellerLegalName: row.seller_legal_name,
    buyerEndpointId: row.buyer_endpoint_id,
    buyerEndpointScheme: row.buyer_endpoint_scheme,
    buyerTrn: row.buyer_trn,
    buyerLegalRegistrationIdentifier: row.buyer_legal_registration_identifier,
    buyerLegalName: row.buyer_legal_name,
    documentNumber: row.document_number,
    issueDate: row.issue_date,
    taxDate: row.tax_date,
    dueDate: row.due_date,
    currencyCode: row.currency_code,
    sourceInvoiceReference: row.source_invoice_reference,
    status: row.status,
    networkStatus: row.network_status,
    rawHash: row.raw_hash,
    canonical: parseJson<CanonicalInboundEInvoice>(row.canonical_json),
    validation: parseJson<InboundValidationReport>(row.validation_result_json),
    subtotalMinor: row.subtotal_minor,
    allowanceTotalMinor: row.allowance_total_minor,
    chargeTotalMinor: row.charge_total_minor,
    taxMinor: row.tax_minor,
    totalMinor: row.total_minor,
    amountDueMinor: row.amount_due_minor,
    buyerIdentityVerified: Boolean(row.buyer_identity_verified),
    supplierId: row.supplier_id,
    purchaseOrderId: row.purchase_order_id,
    goodsReceiptId: row.goods_receipt_id,
    purchaseInvoiceId: row.purchase_invoice_id,
    duplicateOfId: row.duplicate_of_id,
    duplicateKind: row.duplicate_kind,
    lastError: row.last_error,
    rejectionReason: row.rejection_reason,
    receivedAt: row.received_at,
    validatedAt: row.validated_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    archivedAt: row.archived_at,
  };
}

export function listInboundEInvoices(
  businessId: string,
  userId: string,
  filters: { status?: string; search?: string; supplierId?: string; dateFrom?: string; dateTo?: string } = {},
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const clauses: string[] = [];
  const parameters: unknown[] = [];
  if (filters.status) {
    clauses.push("ied.status = ?");
    parameters.push(filters.status);
  }
  if (filters.search) {
    clauses.push("(ied.document_number LIKE ? OR ied.document_uuid LIKE ? OR ied.seller_legal_name LIKE ? OR s.name LIKE ?)");
    const term = `%${filters.search.trim()}%`;
    parameters.push(term, term, term, term);
  }
  if (filters.supplierId) {
    clauses.push("ied.supplier_id = ?");
    parameters.push(filters.supplierId);
  }
  if (filters.dateFrom) {
    clauses.push("ied.received_at >= ?");
    parameters.push(`${filters.dateFrom}T00:00:00.000Z`);
  }
  if (filters.dateTo) {
    clauses.push("ied.received_at <= ?");
    parameters.push(`${filters.dateTo}T23:59:59.999Z`);
  }
  return sqlite.prepare(`
    SELECT ied.id, ied.document_type, ied.document_number, ied.document_uuid,
      ied.seller_legal_name, ied.issue_date, ied.currency_code, ied.total_minor,
      ied.status, ied.provider_key, ied.environment, ied.received_at,
      ied.supplier_id, s.name AS supplier_name, ied.purchase_invoice_id,
      pi.internal_number AS purchase_invoice_number
    FROM inbound_einvoice_documents ied
    LEFT JOIN suppliers s ON s.id = ied.supplier_id
    LEFT JOIN purchase_invoices pi ON pi.id = ied.purchase_invoice_id
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY ied.received_at DESC
  `).all(...parameters) as Array<Record<string, string | number | null>>;
}

export function getInboundEInvoice(businessId: string, userId: string, documentId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = getDocumentRow(sqlite, documentId);
  if (!row) return null;
  const lines = sqlite.prepare(`
    SELECT iel.*, i.sku, i.name AS mapped_item_name, a.code AS account_code,
      a.name AS account_name, tc.name AS tax_code_name, p.code AS project_code,
      pol.description AS order_line_description
    FROM inbound_einvoice_lines iel
    LEFT JOIN inventory_items i ON i.id = iel.item_id
    LEFT JOIN accounts a ON a.id = iel.expense_account_id
    LEFT JOIN tax_codes tc ON tc.id = iel.tax_code_id
    LEFT JOIN projects p ON p.id = iel.project_id
    LEFT JOIN purchase_order_lines pol ON pol.id = iel.purchase_order_line_id
    WHERE iel.inbound_document_id = ? ORDER BY iel.position
  `).all(documentId) as Array<InboundLineRow & Record<string, string | number | null>>;
  const events = sqlite.prepare(`
    SELECT * FROM inbound_einvoice_events
    WHERE inbound_document_id = ? ORDER BY created_at DESC
  `).all(documentId) as Array<Record<string, string | null>>;
  const supplier = row.supplier_id
    ? sqlite.prepare("SELECT * FROM suppliers WHERE id = ?").get(row.supplier_id) as Record<string, string | number | null>
    : null;
  const purchaseOrder = row.purchase_order_id
    ? sqlite.prepare("SELECT id, order_number, status, total_minor FROM purchase_orders WHERE id = ?").get(row.purchase_order_id) as Record<string, string | number | null>
    : null;
  const goodsReceipt = row.goods_receipt_id
    ? sqlite.prepare("SELECT id, receipt_number, date, document_status FROM goods_receipts WHERE id = ?").get(row.goods_receipt_id) as Record<string, string | number | null>
    : null;
  const purchaseInvoice = row.purchase_invoice_id
    ? sqlite.prepare("SELECT id, internal_number, document_status, total_minor FROM purchase_invoices WHERE id = ?").get(row.purchase_invoice_id) as Record<string, string | number | null>
    : null;
  const duplicatePurchaseInvoice = row.duplicate_kind === "likely" && row.supplier_id
    ? sqlite.prepare(`
        SELECT id, internal_number, document_status, total_minor FROM purchase_invoices
        WHERE supplier_id = ? AND upper(supplier_invoice_number) = upper(?)
          AND document_status <> 'void' ORDER BY created_at LIMIT 1
      `).get(row.supplier_id, row.document_number) as Record<string, string | number | null> | undefined
    : undefined;
  const comparison = row.purchase_order_id
    ? sqlite.prepare(`
        SELECT pol.id AS purchase_order_line_id, pol.position, pol.description,
          pol.quantity_micros AS ordered_micros,
          COALESCE((
            SELECT SUM(grl.quantity_micros) FROM goods_receipt_lines grl
            INNER JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
            WHERE gr.document_status = 'posted' AND grl.purchase_order_line_id = pol.id
          ), 0) AS received_micros,
          COALESCE((
            SELECT SUM(pil.quantity_micros) FROM purchase_invoice_lines pil
            INNER JOIN purchase_invoices pi ON pi.id = pil.purchase_invoice_id
            WHERE pi.purchase_order_id = pol.purchase_order_id AND pi.document_status <> 'void'
              AND (pi.inbound_einvoice_document_id IS NULL OR pi.inbound_einvoice_document_id <> ?)
              AND pil.position = pol.position
          ), 0) AS previously_invoiced_micros,
          COALESCE((
            SELECT SUM(iel.quantity_micros) FROM inbound_einvoice_lines iel
            WHERE iel.inbound_document_id = ? AND iel.purchase_order_line_id = pol.id
          ), 0) AS current_invoice_micros
        FROM purchase_order_lines pol
        WHERE pol.purchase_order_id = ? ORDER BY pol.position
      `).all(documentId, documentId, row.purchase_order_id) as Array<Record<string, string | number | null>>
    : [];
  const options = {
    suppliers: sqlite.prepare("SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name").all() as Array<{ id: string; name: string }>,
    purchaseOrders: sqlite.prepare(`
      SELECT id, order_number, supplier_id, status FROM purchase_orders
      WHERE status <> 'cancelled' ORDER BY date DESC
    `).all() as Array<Record<string, string>>,
    goodsReceipts: sqlite.prepare(`
      SELECT id, receipt_number, supplier_id, purchase_order_id FROM goods_receipts
      WHERE document_status = 'posted' ORDER BY date DESC
    `).all() as Array<Record<string, string | null>>,
    items: sqlite.prepare("SELECT id, sku, name, inventory_asset_account_id FROM inventory_items WHERE is_active = 1 ORDER BY name").all() as Array<Record<string, string | null>>,
    expenseAccounts: sqlite.prepare("SELECT id, code, name FROM accounts WHERE type = 'expense' AND is_active = 1 ORDER BY code").all() as Array<Record<string, string>>,
    taxCodes: sqlite.prepare(`
      SELECT id, name, vat_category, rate_basis_points FROM tax_codes
      WHERE is_active = 1 AND direction IN ('purchases', 'both') ORDER BY name
    `).all() as Array<Record<string, string | number | null>>,
    projects: sqlite.prepare("SELECT id, code, name FROM projects WHERE is_active = 1 ORDER BY code").all() as Array<Record<string, string>>,
  };
  return {
    ...hydrateDocument(row),
    lines,
    events,
    supplier,
    purchaseOrder,
    goodsReceipt,
    purchaseInvoice,
    duplicatePurchaseInvoice: duplicatePurchaseInvoice ?? null,
    comparison,
    options,
  };
}

export function getInboundEInvoiceXml(businessId: string, userId: string, documentId: string) {
  const row = getDocumentRow(getBusinessDb(businessId, userId).sqlite, documentId);
  if (!row) return null;
  return {
    xml: row.raw_xml,
    hash: row.raw_hash,
    uuid: row.document_uuid,
    specificationVersion: row.specification_version,
  };
}

function saveConfirmedIdentities(sqlite: Sqlite, document: InboundDocumentRow, supplierId: string, userId: string) {
  const identities = [
    document.seller_endpoint_id && document.seller_endpoint_scheme
      ? { type: "endpoint", identifier: document.seller_endpoint_id, scheme: document.seller_endpoint_scheme }
      : null,
    document.seller_trn ? { type: "trn", identifier: document.seller_trn, scheme: "" } : null,
    document.seller_legal_registration_identifier
      ? { type: "legal_registration", identifier: document.seller_legal_registration_identifier, scheme: "" }
      : null,
  ].filter((entry): entry is { type: string; identifier: string; scheme: string } => Boolean(entry));
  const now = new Date().toISOString();
  for (const identity of identities) {
    const existing = sqlite.prepare(`
      SELECT supplier_id FROM supplier_einvoice_identities
      WHERE identity_type = ? AND scheme = ? AND upper(identifier) = upper(?)
    `).get(identity.type, identity.scheme, identity.identifier) as { supplier_id: string } | undefined;
    if (existing && existing.supplier_id !== supplierId) {
      throw new Error(`This ${identity.type.replace("_", " ")} is already confirmed for another Supplier.`);
    }
    sqlite.prepare(`
      INSERT OR IGNORE INTO supplier_einvoice_identities (
        id, supplier_id, identity_type, identifier, scheme, confirmed_by, confirmed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), supplierId, identity.type, identity.identifier, identity.scheme, userId, now, now);
  }
}

export function selectInboundSupplier(
  businessId: string,
  userId: string,
  documentId: string,
  supplierId: string,
  saveIdentityMapping = true,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    const document = getDocumentRow(sqlite, documentId);
    if (!document) throw new Error("Inbound eInvoice not found.");
    if (["Rejected", "Archived", "Processed"].includes(document.status)) throw new Error("This inbound document can no longer be remapped.");
    const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE id = ? AND is_active = 1").get(supplierId);
    if (!supplier) throw new Error("Choose an active Supplier.");
    if (saveIdentityMapping) saveConfirmedIdentities(sqlite, document, supplierId, userId);
    sqlite.prepare(`
      UPDATE inbound_einvoice_documents
      SET supplier_id = ?, purchase_order_id = NULL, goods_receipt_id = NULL,
        reviewed_by = ?, reviewed_at = ? WHERE id = ?
    `).run(supplierId, userId, new Date().toISOString(), documentId);
    const canonical = parseJson<CanonicalInboundEInvoice>(document.canonical_json)!;
    let updated = getDocumentRow(sqlite, documentId)!;
    const purchaseOrderId = mapPurchaseOrder(sqlite, updated, canonical);
    sqlite.prepare("UPDATE inbound_einvoice_documents SET purchase_order_id = ? WHERE id = ?")
      .run(purchaseOrderId, documentId);
    updated = getDocumentRow(sqlite, documentId)!;
    const goodsReceiptId = mapGoodsReceipt(sqlite, updated, canonical);
    sqlite.prepare("UPDATE inbound_einvoice_documents SET goods_receipt_id = ? WHERE id = ?")
      .run(goodsReceiptId, documentId);
    autoMapLines(sqlite, getDocumentRow(sqlite, documentId)!);
    const refreshed = refreshReadiness(sqlite, documentId, userId);
    appendEvent(sqlite, documentId, document.provider_key, "SupplierConfirmed", refreshed.status, {
      rawResponse: { mock: document.provider_key === "mock", supplierId, identityMappingSaved: saveIdentityMapping },
      createdBy: userId,
    });
  }).immediate();
  return hydrateDocument(getDocumentRow(sqlite, documentId)!);
}

export function createSupplierFromInbound(businessId: string, userId: string, documentId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const document = getDocumentRow(sqlite, documentId);
  if (!document) throw new Error("Inbound eInvoice not found.");
  const supplierId = createSupplier(businessId, userId, {
    name: document.seller_legal_name,
    email: "",
    phone: "",
    taxReference: document.seller_trn ?? "",
    address: "",
    legalName: document.seller_legal_name,
    trn: document.seller_trn ?? "",
    legalRegistrationIdentifier: document.seller_legal_registration_identifier ?? "",
    electronicAddress: document.seller_endpoint_id ?? "",
    electronicAddressScheme: document.seller_endpoint_scheme ?? "",
    registeredAddress: "",
    countryCode: "AE",
    notes: `Created from inbound electronic invoice ${document.document_number}.`,
    isActive: true,
  });
  return selectInboundSupplier(businessId, userId, documentId, supplierId, true);
}

export function updateInboundDocumentMatch(
  businessId: string,
  userId: string,
  documentId: string,
  purchaseOrderId: string | null,
  goodsReceiptId: string | null,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    const document = getDocumentRow(sqlite, documentId);
    if (!document?.supplier_id) throw new Error("Confirm the Supplier before matching procurement documents.");
    if (purchaseOrderId) {
      const order = sqlite.prepare("SELECT supplier_id, status FROM purchase_orders WHERE id = ?")
        .get(purchaseOrderId) as { supplier_id: string; status: string } | undefined;
      if (!order || order.supplier_id !== document.supplier_id) throw new Error("The Purchase Order belongs to another Supplier.");
      if (order.status === "cancelled") throw new Error("A cancelled Purchase Order cannot be matched.");
    }
    if (goodsReceiptId) {
      const receipt = sqlite.prepare(`
        SELECT supplier_id, purchase_order_id, document_status FROM goods_receipts WHERE id = ?
      `).get(goodsReceiptId) as { supplier_id: string; purchase_order_id: string | null; document_status: string } | undefined;
      if (!receipt || receipt.supplier_id !== document.supplier_id) throw new Error("The Goods Receipt belongs to another Supplier.");
      if (receipt.document_status !== "posted") throw new Error("Only a posted Goods Receipt can be matched.");
      if (purchaseOrderId && receipt.purchase_order_id && receipt.purchase_order_id !== purchaseOrderId) {
        throw new Error("The Goods Receipt does not belong to the selected Purchase Order.");
      }
    }
    sqlite.prepare(`
      UPDATE inbound_einvoice_documents
      SET purchase_order_id = ?, goods_receipt_id = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).run(purchaseOrderId, goodsReceiptId, userId, new Date().toISOString(), documentId);
    sqlite.prepare(`
      UPDATE inbound_einvoice_lines SET purchase_order_line_id = NULL
      WHERE inbound_document_id = ? AND match_status <> 'Matched'
    `).run(documentId);
    autoMapLines(sqlite, getDocumentRow(sqlite, documentId)!);
    const refreshed = refreshReadiness(sqlite, documentId, userId);
    appendEvent(sqlite, documentId, document.provider_key, "ProcurementMatchUpdated", refreshed.status, {
      rawResponse: { mock: document.provider_key === "mock", purchaseOrderId, goodsReceiptId },
      createdBy: userId,
    });
  }).immediate();
  return hydrateDocument(getDocumentRow(sqlite, documentId)!);
}

export function updateInboundLineMapping(
  businessId: string,
  userId: string,
  documentId: string,
  input: InboundLineMappingInput,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    const document = getDocumentRow(sqlite, documentId);
    if (!document?.supplier_id) throw new Error("Confirm the Supplier before mapping lines.");
    const line = sqlite.prepare(`
      SELECT * FROM inbound_einvoice_lines WHERE id = ? AND inbound_document_id = ?
    `).get(input.lineId, documentId) as InboundLineRow | undefined;
    if (!line) throw new Error("Inbound invoice line not found.");
    const itemId = input.itemId || null;
    let expenseAccountId = input.expenseAccountId || null;
    if (itemId) {
      const item = sqlite.prepare(`
        SELECT inventory_asset_account_id FROM inventory_items WHERE id = ? AND is_active = 1
      `).get(itemId) as { inventory_asset_account_id: string } | undefined;
      if (!item) throw new Error("Choose an active Inventory Item.");
      expenseAccountId = item.inventory_asset_account_id;
    } else if (expenseAccountId) {
      const account = sqlite.prepare("SELECT id FROM accounts WHERE id = ? AND type = 'expense' AND is_active = 1")
        .get(expenseAccountId);
      if (!account) throw new Error("Choose an active expense account.");
    } else {
      throw new Error("Map the line to an Inventory Item or expense account.");
    }
    if (!input.taxCodeId || compatibleTaxCode(sqlite, line, input.taxCodeId) !== input.taxCodeId) {
      throw new Error("Choose a Purchase VAT code matching the supplier's category and rate.");
    }
    if (input.projectId && !sqlite.prepare("SELECT 1 FROM projects WHERE id = ? AND is_active = 1").get(input.projectId)) {
      throw new Error("Choose an active Project.");
    }
    const purchaseOrderLineId = input.purchaseOrderLineId || null;
    if (purchaseOrderLineId) {
      const orderLine = sqlite.prepare(`
        SELECT pol.id FROM purchase_order_lines pol
        INNER JOIN purchase_orders po ON po.id = pol.purchase_order_id
        WHERE pol.id = ? AND po.id = ? AND po.supplier_id = ?
      `).get(purchaseOrderLineId, document.purchase_order_id, document.supplier_id);
      if (!orderLine) throw new Error("Choose a line from the matched Purchase Order.");
    }
    sqlite.prepare(`
      UPDATE inbound_einvoice_lines
      SET purchase_order_line_id = ?, item_id = ?, expense_account_id = ?, tax_code_id = ?,
        project_id = ?, match_status = 'Matched'
      WHERE id = ?
    `).run(purchaseOrderLineId, itemId, expenseAccountId, input.taxCodeId, input.projectId || null, line.id);
    if (input.saveSupplierItemMapping && itemId && line.supplier_item_identifier) {
      const existing = sqlite.prepare(`
        SELECT item_id FROM supplier_item_mappings
        WHERE supplier_id = ? AND upper(supplier_item_identifier) = upper(?)
      `).get(document.supplier_id, line.supplier_item_identifier) as { item_id: string } | undefined;
      if (existing && existing.item_id !== itemId) throw new Error("This supplier item identifier is mapped to another Inventory Item.");
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT OR IGNORE INTO supplier_item_mappings (
          id, supplier_id, supplier_item_identifier, item_id, unit_code, confirmed_by, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), document.supplier_id, line.supplier_item_identifier, itemId, line.unit_code, userId, now);
    }
    const refreshed = refreshReadiness(sqlite, documentId, userId);
    appendEvent(sqlite, documentId, document.provider_key, "LineMappingConfirmed", refreshed.status, {
      rawResponse: { mock: document.provider_key === "mock", lineId: line.id },
      createdBy: userId,
    });
  }).immediate();
  return hydrateDocument(getDocumentRow(sqlite, documentId)!);
}

export function resolveLikelyDuplicate(
  businessId: string,
  userId: string,
  documentId: string,
  reason: string,
) {
  if (reason.trim().length < 3) throw new Error("Enter a reason for treating this invoice as distinct.");
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    const document = getDocumentRow(sqlite, documentId);
    if (!document || document.duplicate_kind !== "likely") throw new Error("No likely duplicate is awaiting resolution.");
    sqlite.prepare(`
      UPDATE inbound_einvoice_documents
      SET duplicate_of_id = NULL, duplicate_kind = NULL, last_error = NULL,
        reviewed_by = ?, reviewed_at = ? WHERE id = ?
    `).run(userId, new Date().toISOString(), documentId);
    appendEvent(sqlite, documentId, document.provider_key, "LikelyDuplicateResolved", "NeedsReview", {
      rawResponse: { mock: document.provider_key === "mock", reason },
      createdBy: userId,
    });
    const refreshed = refreshReadiness(sqlite, documentId, userId);
    appendEvent(sqlite, documentId, document.provider_key, "ReviewClassified", refreshed.status, {
      rawResponse: { mock: document.provider_key === "mock", afterDuplicateResolution: true },
      createdBy: userId,
    });
  }).immediate();
  return hydrateDocument(getDocumentRow(sqlite, documentId)!);
}

export function rejectInboundEInvoice(
  businessId: string,
  userId: string,
  documentId: string,
  reason: string,
) {
  if (reason.trim().length < 3) throw new Error("A rejection reason is required.");
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    const document = getDocumentRow(sqlite, documentId);
    if (!document) throw new Error("Inbound eInvoice not found.");
    if (document.purchase_invoice_id) throw new Error("An inbound document linked to a Purchase Invoice cannot be rejected.");
    sqlite.prepare(`
      UPDATE inbound_einvoice_documents
      SET status = 'Rejected', rejection_reason = ?, last_error = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).run(reason.trim(), reason.trim(), userId, new Date().toISOString(), documentId);
    appendEvent(sqlite, documentId, document.provider_key, "ManuallyRejected", "Rejected", {
      rawResponse: { mock: document.provider_key === "mock", reason: reason.trim() },
      createdBy: userId,
    });
  }).immediate();
}

export function archiveInboundEInvoice(businessId: string, userId: string, documentId: string, reason: string) {
  if (reason.trim().length < 3) throw new Error("An archive reason is required.");
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    const document = getDocumentRow(sqlite, documentId);
    if (!document) throw new Error("Inbound eInvoice not found.");
    if (document.purchase_invoice_id) throw new Error("An inbound document linked to a Purchase Invoice cannot be archived.");
    sqlite.prepare(`
      UPDATE inbound_einvoice_documents
      SET status = 'Archived', archived_at = ?, reviewed_by = ?, reviewed_at = ?, last_error = ?
      WHERE id = ?
    `).run(new Date().toISOString(), userId, new Date().toISOString(), reason.trim(), documentId);
    appendEvent(sqlite, documentId, document.provider_key, "Archived", "Archived", {
      rawResponse: { mock: document.provider_key === "mock", reason: reason.trim() },
      createdBy: userId,
    });
  }).immediate();
}

export function createPurchaseInvoiceDraftFromInbound(businessId: string, userId: string, documentId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const document = getDocumentRow(sqlite, documentId);
  if (!document) throw new Error("Inbound eInvoice not found.");
  if (document.status !== "ReadyForDraft") throw new Error("Resolve validation, duplicate, Supplier, line, and VAT review items first.");
  if (!document.supplier_id || !document.due_date) throw new Error("Supplier and due date are required.");
  const lines = getLines(sqlite, documentId);
  const invoiceId = savePurchaseInvoice(businessId, userId, {
    supplierId: document.supplier_id,
    projectId: "",
    supplierInvoiceNumber: document.document_number,
    invoiceDate: document.issue_date,
    taxDate: document.tax_date ?? document.issue_date,
    dueDate: document.due_date,
    reference: `Electronic source ${document.document_uuid}`,
    purchaseOrderId: document.purchase_order_id ?? "",
    lines: lines.map((line) => ({
      itemId: line.item_id ?? "",
      description: line.description,
      quantity: quantityMicrosToInput(line.quantity_micros),
      unitPrice: minorToInput(line.unit_price_minor),
      expenseAccountId: line.expense_account_id!,
      taxCodeId: line.tax_code_id!,
      projectId: line.project_id ?? "",
    })),
  }, "draft", undefined, { inboundDocumentId: documentId });
  return invoiceId;
}
