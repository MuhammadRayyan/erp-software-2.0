import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type RevisionEngineConfig = {
  headerTable: string;
  lineTable: string;
  headerIdColumn: string;
  lineHeaderIdColumn: string;
  documentNumberColumn: string;
  statusColumn?: string;
};

const ALLOWED_HEADER_TABLES = new Set([
  "sales_quotes",
  "purchase_quotes",
  "sales_orders",
  "purchase_orders",
]);

const ALLOWED_LINE_TABLES = new Set([
  "sales_quote_lines",
  "purchase_quote_lines",
  "sales_order_lines",
  "purchase_order_lines",
]);

const ALLOWED_ID_COLUMNS = new Set([
  "id",
  "quote_id",
  "order_id",
  "sales_quote_id",
  "purchase_quote_id",
  "sales_order_id",
  "purchase_order_id",
]);

const ALLOWED_DOC_NUM_COLUMNS = new Set(["quote_number", "order_number"]);
const ALLOWED_STATUS_COLUMNS = new Set(["status", "document_status"]);

function validateRevisionConfig(config: RevisionEngineConfig): void {
  if (!ALLOWED_HEADER_TABLES.has(config.headerTable)) {
    throw new Error(`Unauthorized revision header table: ${config.headerTable}`);
  }
  if (!ALLOWED_LINE_TABLES.has(config.lineTable)) {
    throw new Error(`Unauthorized revision line table: ${config.lineTable}`);
  }
  if (!ALLOWED_ID_COLUMNS.has(config.headerIdColumn)) {
    throw new Error(`Unauthorized revision header ID column: ${config.headerIdColumn}`);
  }
  if (!ALLOWED_ID_COLUMNS.has(config.lineHeaderIdColumn)) {
    throw new Error(`Unauthorized revision line header ID column: ${config.lineHeaderIdColumn}`);
  }
  if (!ALLOWED_DOC_NUM_COLUMNS.has(config.documentNumberColumn)) {
    throw new Error(`Unauthorized document number column: ${config.documentNumberColumn}`);
  }
  if (config.statusColumn && !ALLOWED_STATUS_COLUMNS.has(config.statusColumn)) {
    throw new Error(`Unauthorized status column: ${config.statusColumn}`);
  }
}

function sanitizeColumnList(columns: string[]): string[] {
  return columns.filter((col) => /^[a-zA-Z0-9_]+$/.test(col));
}

export function createDocumentRevision(
  sqlite: Database.Database,
  config: RevisionEngineConfig,
  userId: string,
  sourceDocumentId: string
): string {
  validateRevisionConfig(config);
  const source = sqlite
    .prepare(`SELECT * FROM ${config.headerTable} WHERE ${config.headerIdColumn} = ?`)
    .get(sourceDocumentId) as any;

  if (!source) {
    throw new Error("Document not found.");
  }

  const rootId = source.root_quote_id || source.root_order_id || source[config.headerIdColumn];
  const originalBaseNumber = source.base_quote_number || source.base_order_number;
  const baseNumber = originalBaseNumber || source[config.documentNumberColumn].replace(/-R\d+$/, "");

  // Find all revisions in this family to determine next revision number
  // Also check if there is an active draft revision to prevent concurrent drafts.
  const rootCol = config.headerTable.includes("quote") ? "root_quote_id" : "root_order_id";
  const familyRevisions = sqlite
    .prepare(
      `SELECT ${config.headerIdColumn}, revision_number, ${config.statusColumn || 'document_status'} as status, is_latest_revision 
       FROM ${config.headerTable} 
       WHERE ${rootCol} = ? OR ${config.headerIdColumn} = ?`
    )
    .all(rootId, rootId) as any[];

  const statusCol = config.statusColumn || "document_status";
  const draftRevision = familyRevisions.find(
    (r) => Boolean(r.is_latest_revision) && (r.status === "draft" || r[statusCol] === "draft")
  );
  if (draftRevision) {
    throw new Error("A draft revision already exists for this document.");
  }

  const maxRevision = familyRevisions.reduce((max, r) => Math.max(max, r.revision_number ?? 0), 0);
  const nextRevision = maxRevision + 1;
  const newDocumentNumber = `${baseNumber}-R${nextRevision}`;
  const newDocumentId = randomUUID();
  const now = new Date().toISOString();

  sqlite.transaction(() => {
    // 1. Mark existing latest revision(s) in this family:
    // If it was "sent", "accepted", "rejected", or "active", mark as "superseded".
    // Set is_latest_revision = 0 for all family members.
    sqlite
      .prepare(`
        UPDATE ${config.headerTable}
        SET is_latest_revision = 0,
            ${config.statusColumn || 'document_status'} = CASE 
              WHEN ${config.statusColumn || 'document_status'} IN ('sent', 'accepted', 'rejected', 'active', 'issued') THEN 'superseded' 
              ELSE ${config.statusColumn || 'document_status'} 
            END,
            updated_at = ?
        WHERE ${rootCol} = ? OR ${config.headerIdColumn} = ?
      `)
      .run(now, rootId, rootId);

    // 2. Insert new revision header
    // We get all columns from the source document, update the relevant ones, and insert.
    const columns = sanitizeColumnList(Object.keys(source));
    
    const newDoc = { ...source };
    newDoc[config.headerIdColumn] = newDocumentId;
    newDoc[config.documentNumberColumn] = newDocumentNumber;
    newDoc[rootCol] = rootId;
    newDoc[config.headerTable.includes("quote") ? "base_quote_number" : "base_order_number"] = baseNumber;
    newDoc.revision_number = nextRevision;
    newDoc.is_latest_revision = 1;
    newDoc[config.statusColumn || "document_status"] = "draft";
    
    // reset dates and creator
    newDoc.created_by = userId;
    newDoc.created_at = now;
    newDoc.updated_at = now;

    // Build dynamic insert
    const insertCols = columns.join(", ");
    const insertPlaceholders = columns.map(() => "?").join(", ");
    const insertValues = columns.map((col) => newDoc[col]);

    sqlite
      .prepare(`INSERT INTO ${config.headerTable} (${insertCols}) VALUES (${insertPlaceholders})`)
      .run(...insertValues);

    // 3. Duplicate lines
    const lines = sqlite
      .prepare(`SELECT * FROM ${config.lineTable} WHERE ${config.lineHeaderIdColumn} = ?`)
      .all(sourceDocumentId) as any[];

    if (lines.length > 0) {
      const lineColumns = sanitizeColumnList(Object.keys(lines[0]));
      const lineInsertCols = lineColumns.join(", ");
      const lineInsertPlaceholders = lineColumns.map(() => "?").join(", ");
      const insertLineStmt = sqlite.prepare(
        `INSERT INTO ${config.lineTable} (${lineInsertCols}) VALUES (${lineInsertPlaceholders})`
      );

      for (const line of lines) {
        const newLine = { ...line };
        newLine.id = randomUUID();
        newLine[config.lineHeaderIdColumn] = newDocumentId;
        const lineValues = lineColumns.map((col) => newLine[col]);
        insertLineStmt.run(...lineValues);
      }
    }

    // 4. Duplicate custom fields
    const customFields = sqlite
      .prepare(`SELECT * FROM custom_field_values WHERE entity_id = ?`)
      .all(sourceDocumentId) as any[];

    if (customFields.length > 0) {
      const cfCols = sanitizeColumnList(Object.keys(customFields[0]));
      const cfInsertCols = cfCols.join(", ");
      const cfInsertPlaceholders = cfCols.map(() => "?").join(", ");
      const insertCfStmt = sqlite.prepare(
        `INSERT INTO custom_field_values (${cfInsertCols}) VALUES (${cfInsertPlaceholders})`
      );

      for (const cf of customFields) {
        const newCf = { ...cf };
        newCf.id = randomUUID();
        newCf.entity_id = newDocumentId;
        newCf.created_at = now;
        const cfValues = cfCols.map((col) => newCf[col]);
        insertCfStmt.run(...cfValues);
      }
    }
  }).immediate();

  return newDocumentId;
}

export function deleteDraftRevision(
  sqlite: Database.Database,
  config: RevisionEngineConfig,
  documentId: string
): void {
  validateRevisionConfig(config);
  const doc = sqlite
    .prepare(`SELECT * FROM ${config.headerTable} WHERE ${config.headerIdColumn} = ?`)
    .get(documentId) as any;

  if (!doc) throw new Error("Document not found.");
  if (doc[config.statusColumn || "document_status"] !== "draft") {
    throw new Error("Only draft revisions can be deleted.");
  }
  
  const rootCol = config.headerTable.includes("quote") ? "root_quote_id" : "root_order_id";
  const rootId = doc[rootCol] || doc[config.headerIdColumn];

  sqlite.transaction(() => {
    // 1. Delete the draft
    sqlite.prepare(`DELETE FROM ${config.headerTable} WHERE ${config.headerIdColumn} = ?`).run(documentId);

    // 2. If it had a previous revision, restore it
    const previous = sqlite
      .prepare(
        `SELECT * FROM ${config.headerTable} WHERE ${rootCol} = ? OR ${config.headerIdColumn} = ? ORDER BY revision_number DESC LIMIT 1`
      )
      .get(rootId, rootId) as any;

    if (previous) {
      // Best guess for reverting status from "superseded". 
      // If purchase order, the old status was "issued". For sales, "sent".
      const statusCol = config.statusColumn || "document_status";
      const restoredStatus = config.headerTable.includes("order") ? (config.headerTable === "purchase_orders" ? "issued" : "active") : "sent";
      const now = new Date().toISOString();
      sqlite
        .prepare(`
          UPDATE ${config.headerTable}
          SET is_latest_revision = 1,
              ${statusCol} = CASE 
                WHEN ${statusCol} = 'superseded' THEN ? 
                ELSE ${statusCol} 
              END,
              updated_at = ?
          WHERE ${config.headerIdColumn} = ?
        `)
        .run(restoredStatus, now, previous[config.headerIdColumn]);
    }
  }).immediate();
}
