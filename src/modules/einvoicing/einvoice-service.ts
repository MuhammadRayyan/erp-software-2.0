import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getBusinessDb } from "@/core/db/business";
import { mapSourceToCanonical } from "./canonical-mapper";
import {
  PINT_AE_SPECIFICATION_VERSION,
  type EInvoiceSourceType,
  type EInvoiceStatus,
  type EInvoiceValidationIssue,
  type EInvoiceValidationReport,
} from "./einvoice-types";
import { getPintAeVersion } from "./pint-ae/registry";
import { getAspProvider } from "./providers/registry";

type DocumentRow = {
  id: string;
  source_type: EInvoiceSourceType;
  source_id: string;
  document_type: "invoice" | "credit_note";
  uuid: string;
  specification_version: string;
  status: EInvoiceStatus;
  canonical_json: string | null;
  xml_payload: string | null;
  payload_hash: string | null;
  validation_json: string | null;
  provider_key: string | null;
  provider_environment: string | null;
  exchange_status: string | null;
  reporting_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  validated_at: string | null;
  submitted_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
};

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function hydrateDocument(row: DocumentRow) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    documentType: row.document_type,
    uuid: row.uuid,
    specificationVersion: row.specification_version,
    status: row.status,
    canonical: parseJson<unknown>(row.canonical_json),
    xmlPayload: row.xml_payload,
    payloadHash: row.payload_hash,
    validation: parseJson<EInvoiceValidationReport>(row.validation_json),
    providerKey: row.provider_key,
    providerEnvironment: row.provider_environment,
    exchangeStatus: row.exchange_status,
    reportingStatus: row.reporting_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    validatedAt: row.validated_at,
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
  };
}

function getDocumentRow(sqlite: Database.Database, documentId: string) {
  return sqlite.prepare("SELECT * FROM einvoice_documents WHERE id = ?").get(documentId) as DocumentRow | undefined;
}

function getDocumentForSourceRow(sqlite: Database.Database, sourceType: EInvoiceSourceType, sourceId: string) {
  return sqlite.prepare("SELECT * FROM einvoice_documents WHERE source_type = ? AND source_id = ?")
    .get(sourceType, sourceId) as DocumentRow | undefined;
}

function sourceStatus(sqlite: Database.Database, sourceType: EInvoiceSourceType, sourceId: string) {
  const table = sourceType === "sales_invoice" ? "sales_invoices" : "sales_credit_notes";
  return sqlite.prepare(`SELECT document_status FROM ${table} WHERE id = ?`).get(sourceId) as { document_status: string } | undefined;
}

function ensureDocument(sqlite: Database.Database, sourceType: EInvoiceSourceType, sourceId: string) {
  const current = getDocumentForSourceRow(sqlite, sourceType, sourceId);
  if (current) return current;
  const source = sourceStatus(sqlite, sourceType, sourceId);
  if (!source) throw new Error("The source document was not found.");
  if (source.document_status !== "posted") throw new Error("Only posted documents can be prepared as eInvoices.");
  const settings = sqlite.prepare("SELECT specification_version FROM business_einvoice_settings WHERE id = 'default'")
    .get() as { specification_version: string } | undefined;
  const now = new Date().toISOString();
  const id = randomUUID();
  sqlite.prepare(`
    INSERT INTO einvoice_documents (
      id, source_type, source_id, document_type, uuid, specification_version, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'NotPrepared', ?, ?)
  `).run(
    id,
    sourceType,
    sourceId,
    sourceType === "sales_invoice" ? "invoice" : "credit_note",
    randomUUID(),
    settings?.specification_version ?? PINT_AE_SPECIFICATION_VERSION,
    now,
    now,
  );
  return getDocumentRow(sqlite, id)!;
}

function validationReport(
  specificationVersion: string,
  readinessIssues: EInvoiceValidationIssue[],
  mappingIssues: EInvoiceValidationIssue[],
  pintUblIssues: EInvoiceValidationIssue[],
  pintAeIssues: EInvoiceValidationIssue[],
  validatedAt: string,
): EInvoiceValidationReport {
  const issues = [...readinessIssues, ...mappingIssues, ...pintUblIssues, ...pintAeIssues];
  return {
    valid: issues.length === 0,
    specificationVersion,
    validatedAt,
    layers: {
      readiness: { valid: readinessIssues.length === 0, issueCount: readinessIssues.length },
      mapping: { valid: mappingIssues.length === 0, issueCount: mappingIssues.length },
      pintUbl: { valid: pintUblIssues.length === 0, issueCount: pintUblIssues.length },
      pintAe: { valid: pintAeIssues.length === 0, issueCount: pintAeIssues.length },
    },
    issues,
  };
}

export function assertEInvoiceSourceEditable(sqlite: Database.Database, sourceType: EInvoiceSourceType, sourceId: string) {
  const document = getDocumentForSourceRow(sqlite, sourceType, sourceId);
  if (!document || !["Submitted", "Accepted", "Rejected"].includes(document.status)) return;
  if (sourceType === "sales_invoice") {
    throw new Error(
      document.status === "Accepted"
        ? "This invoice has an accepted eInvoice snapshot. Create a Sales Credit Note for corrections."
        : "This invoice has already been submitted as an eInvoice and its source snapshot is immutable.",
    );
  }
  throw new Error(
    document.status === "Accepted"
      ? "This credit note has an accepted eInvoice snapshot and cannot be rewritten. Use a new correction document."
      : "This credit note has already been submitted as an eInvoice and its source snapshot is immutable.",
  );
}

export function invalidatePreparedEInvoice(sqlite: Database.Database, sourceType: EInvoiceSourceType, sourceId: string) {
  const document = getDocumentForSourceRow(sqlite, sourceType, sourceId);
  if (!document) return;
  assertEInvoiceSourceEditable(sqlite, sourceType, sourceId);
  sqlite.prepare(`
    UPDATE einvoice_documents
    SET status = 'NotPrepared', canonical_json = NULL, xml_payload = NULL, payload_hash = NULL,
        validation_json = NULL, provider_key = NULL, provider_environment = NULL,
        exchange_status = NULL, reporting_status = NULL, last_error = NULL,
        validated_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), document.id);
}

export function getEInvoiceForSource(businessId: string, userId: string, sourceType: EInvoiceSourceType, sourceId: string) {
  const row = getDocumentForSourceRow(getBusinessDb(businessId, userId).sqlite, sourceType, sourceId);
  return row ? hydrateDocument(row) : null;
}

export function prepareEInvoice(businessId: string, userId: string, sourceType: EInvoiceSourceType, sourceId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = ensureDocument(sqlite, sourceType, sourceId);
  if (["Submitted", "Accepted", "Rejected"].includes(row.status)) return hydrateDocument(row);
  const mapped = mapSourceToCanonical(sqlite, sourceType, sourceId, row.uuid, row.specification_version);
  const now = new Date().toISOString();
  const readinessIssues = mapped.issues.filter((entry) => entry.layer === "readiness");
  const mappingIssues = mapped.issues.filter((entry) => entry.layer === "mapping");
  if (!mapped.canonical) {
    const report = validationReport(row.specification_version, readinessIssues, mappingIssues, [], [], now);
    sqlite.prepare(`
      UPDATE einvoice_documents
      SET status = 'NeedsData', canonical_json = NULL, xml_payload = NULL, payload_hash = NULL,
          validation_json = ?, last_error = ?, validated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(report), report.issues[0]?.message ?? null, now, now, row.id);
    return hydrateDocument(getDocumentRow(sqlite, row.id)!);
  }
  const implementation = getPintAeVersion(row.specification_version);
  const xml = implementation.generateXml(mapped.canonical);
  const official = implementation.validateXml(xml);
  const report = validationReport(
    row.specification_version,
    readinessIssues,
    mappingIssues,
    official.pintUblIssues,
    official.pintAeIssues,
    now,
  );
  const status: EInvoiceStatus = report.valid ? "Ready" : "ValidationFailed";
  const hash = createHash("sha256").update(xml, "utf8").digest("hex");
  sqlite.prepare(`
    UPDATE einvoice_documents
    SET status = ?, canonical_json = ?, xml_payload = ?, payload_hash = ?, validation_json = ?,
        last_error = ?, validated_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    status,
    JSON.stringify(mapped.canonical),
    xml,
    hash,
    JSON.stringify(report),
    report.issues[0]?.message ?? null,
    now,
    now,
    row.id,
  );
  return hydrateDocument(getDocumentRow(sqlite, row.id)!);
}

export async function submitEInvoice(
  businessId: string,
  userId: string,
  documentId: string,
  scenario = "accepted",
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const document = getDocumentRow(sqlite, documentId);
  if (!document) throw new Error("eInvoice document not found.");
  if (document.status === "Accepted") return hydrateDocument(document);
  if (!["Ready", "Rejected"].includes(document.status) || !document.xml_payload || !document.payload_hash) {
    throw new Error("Validate the eInvoice successfully before submitting it.");
  }
  const settings = sqlite.prepare(`
    SELECT enabled, asp_provider_key, asp_environment
    FROM business_einvoice_settings WHERE id = 'default'
  `).get() as { enabled: number; asp_provider_key: string | null; asp_environment: string };
  if (!settings.enabled) throw new Error("Electronic Invoicing is disabled.");
  if (settings.asp_provider_key !== "mock" || settings.asp_environment !== "mock") {
    throw new Error("Submission requires the Mock ASP in the current build.");
  }
  const provider = getAspProvider(settings.asp_provider_key);
  const attempt = (sqlite.prepare("SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next FROM einvoice_submissions WHERE document_id = ?")
    .get(document.id) as { next: number }).next;
  const submissionId = randomUUID();
  const submittedAt = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite.prepare(`
      INSERT INTO einvoice_submissions (
        id, document_id, provider_key, provider_environment, attempt_number, status,
        submitted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'Submitted', ?, ?)
    `).run(submissionId, document.id, provider.key, settings.asp_environment, attempt, submittedAt, submittedAt);
    sqlite.prepare(`
      UPDATE einvoice_documents
      SET status = 'Submitted', provider_key = ?, provider_environment = ?, submitted_at = ?,
          last_error = NULL, updated_at = ? WHERE id = ?
    `).run(provider.key, settings.asp_environment, submittedAt, submittedAt, document.id);
  }).immediate();
  try {
    const result = await provider.submit({
      documentId: document.id,
      documentUuid: document.uuid,
      specificationVersion: document.specification_version,
      payloadHash: document.payload_hash,
      xml: document.xml_payload,
    }, scenario);
    const respondedAt = new Date().toISOString();
    const status = result.accepted ? "Accepted" : "Rejected";
    sqlite.transaction(() => {
      sqlite.prepare(`
        UPDATE einvoice_submissions
        SET status = ?, provider_request_id = ?, exchange_status = ?, reporting_status = ?,
            response_code = ?, response_payload = ?, responded_at = ? WHERE id = ?
      `).run(
        status,
        result.providerRequestId,
        result.exchangeStatus,
        result.reportingStatus,
        result.responseCode,
        JSON.stringify(result.rawResponse),
        respondedAt,
        submissionId,
      );
      sqlite.prepare(`
        UPDATE einvoice_documents
        SET status = ?, exchange_status = ?, reporting_status = ?, last_error = ?, updated_at = ?,
            accepted_at = CASE WHEN ? = 'Accepted' THEN ? ELSE accepted_at END,
            rejected_at = CASE WHEN ? = 'Rejected' THEN ? ELSE rejected_at END
        WHERE id = ?
      `).run(
        status,
        result.exchangeStatus,
        result.reportingStatus,
        result.accepted ? null : result.responseCode,
        respondedAt,
        status,
        respondedAt,
        status,
        respondedAt,
        document.id,
      );
    }).immediate();
  } catch (error) {
    const respondedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "ASP submission failed.";
    sqlite.transaction(() => {
      sqlite.prepare(`
        UPDATE einvoice_submissions
        SET status = 'Failed', error_message = ?, responded_at = ? WHERE id = ?
      `).run(message, respondedAt, submissionId);
      sqlite.prepare(`
        UPDATE einvoice_documents
        SET status = 'Rejected', exchange_status = 'failed', reporting_status = 'not_submitted',
            last_error = ?, rejected_at = ?, updated_at = ? WHERE id = ?
      `).run(message, respondedAt, respondedAt, document.id);
    }).immediate();
  }
  return hydrateDocument(getDocumentRow(sqlite, document.id)!);
}

export function getEInvoiceDocument(businessId: string, userId: string, documentId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = getDocumentRow(sqlite, documentId);
  if (!row) return null;
  const source = row.source_type === "sales_invoice"
    ? sqlite.prepare(`SELECT si.invoice_number AS number, si.invoice_date AS date, c.name AS customer_name
        FROM sales_invoices si INNER JOIN customers c ON c.id = si.customer_id WHERE si.id = ?`).get(row.source_id)
    : sqlite.prepare(`SELECT scn.credit_note_number AS number, scn.date, c.name AS customer_name
        FROM sales_credit_notes scn INNER JOIN customers c ON c.id = scn.customer_id WHERE scn.id = ?`).get(row.source_id);
  const submissions = sqlite.prepare(`
    SELECT * FROM einvoice_submissions WHERE document_id = ? ORDER BY attempt_number DESC
  `).all(documentId) as Array<Record<string, string | number | null>>;
  return { ...hydrateDocument(row), source, submissions };
}

export function listEInvoices(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT source_type, source_id, document_number, document_date, customer_name, total_minor,
      document_id, uuid, specification_version, COALESCE(status, 'NotPrepared') AS status,
      exchange_status, reporting_status, provider_key, provider_environment, updated_at
    FROM (
      SELECT 'sales_invoice' AS source_type, si.id AS source_id, si.invoice_number AS document_number,
        si.invoice_date AS document_date, c.name AS customer_name, si.total_minor,
        ed.id AS document_id, ed.uuid, ed.specification_version, ed.status,
        ed.exchange_status, ed.reporting_status, ed.provider_key, ed.provider_environment,
        COALESCE(ed.updated_at, si.updated_at) AS updated_at
      FROM sales_invoices si INNER JOIN customers c ON c.id = si.customer_id
      LEFT JOIN einvoice_documents ed ON ed.source_type = 'sales_invoice' AND ed.source_id = si.id
      WHERE si.document_status = 'posted'
      UNION ALL
      SELECT 'sales_credit_note', scn.id, scn.credit_note_number, scn.date, c.name,
        scn.total_minor, ed.id, ed.uuid, ed.specification_version, ed.status,
        ed.exchange_status, ed.reporting_status, ed.provider_key, ed.provider_environment,
        COALESCE(ed.updated_at, scn.updated_at)
      FROM sales_credit_notes scn INNER JOIN customers c ON c.id = scn.customer_id
      LEFT JOIN einvoice_documents ed ON ed.source_type = 'sales_credit_note' AND ed.source_id = scn.id
      WHERE scn.document_status = 'posted'
    ) ORDER BY document_date DESC, updated_at DESC
  `).all() as Array<Record<string, string | number | null>>;
}

export function getEInvoiceXml(businessId: string, userId: string, documentId: string) {
  const row = getDocumentRow(getBusinessDb(businessId, userId).sqlite, documentId);
  if (!row?.xml_payload || !row.payload_hash) return null;
  return { xml: row.xml_payload, hash: row.payload_hash, uuid: row.uuid, specificationVersion: row.specification_version };
}
