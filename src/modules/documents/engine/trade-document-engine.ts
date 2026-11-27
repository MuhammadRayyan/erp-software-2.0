import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { z } from "zod";
import { getBusinessDb, runImmediateTransaction } from "@/core/db/business";
import { assertMutationPermission, assertSavePermission } from "@/core/permissions/mutation-permissions";
import type { ModuleKey } from "@/core/permissions/permissions";
import { createDocumentRevision, deleteDraftRevision, type RevisionEngineConfig } from "@/core/versioning/revision-engine";
import { allocateNumber, type NumberKind } from "@/modules/accounting/services/numbering-service";
import { calculateLines, totalsForLines, type StoredLine } from "@/modules/accounting/services/document-line-calculator";
import { evaluateApprovalRequirement, recordPendingApprovalInTransaction } from "@/modules/approvals/approval-policy";
import { convertDocumentLinesToBase } from "@/modules/currency/conversion";
import { resolveRateSnapshot } from "@/modules/currency/validation";
import { saveLineCustomFieldValuesInTransaction } from "@/modules/custom-fields/custom-field-service";
import type { CustomFieldEntityType } from "@/modules/custom-fields/custom-field-input";
import { validateProjectReferences } from "@/modules/projects/project-validation";
import { insertLineRows, insertRow, logDocumentActivity, updateRow, type ColumnValues } from "./document-sql";

/**
 * Config-driven engine for priced, revisable trade documents: sales quotes,
 * sales orders, purchase quotes and purchase orders.
 *
 * The engine owns the shared lifecycle — draft create/update, line
 * calculation, numbering, status transitions, source-quote linking, revision
 * and draft deletion, activity logging. Each document supplies a
 * {@link TradeDocumentConfig}: its tables/columns, status vocabulary, messages
 * and a few hooks for document-specific rules.
 *
 * Every exported command asserts its own permission against `config.module`
 * (create/edit on save, approve to issue, edit to close, delete to cancel or
 * delete, create to revise), plus the in-flight `approve` check when a save
 * leaves the document issued. Document services delegate to these commands;
 * `npm run check:permissions` verifies the delegation.
 */

type Sqlite = Database.Database;
type Row = Record<string, unknown>;
type Data = Record<string, unknown> & {
  projectId: string;
  amountsIncludeTax: boolean;
  date: string;
  reference: string;
  notes: string;
  terms: string;
  currencyCode?: string;
  exchangeRateToBase?: string;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  lines: { projectId: string }[];
};

export type TradeSaveIntent = "draft" | "issue" | "submit_approval";
export type TradeSaveOptions = { bypassApprovalPolicy?: boolean };

export type TradeDocumentConfig = {
  entityType: "sales_quote" | "sales_order" | "purchase_quote" | "purchase_order";
  /** Lower-case document name used in messages, e.g. "sales quote". */
  label: string;
  module: Extract<ModuleKey, "sales" | "purchases">;
  numbering: NumberKind;
  schema: z.ZodType<Data, unknown>;
  table: string;
  numberColumn: string;
  statusColumn: "document_status" | "status";
  dateColumn: string;
  /** Column holding the expiry/expected date, the input field feeding it, and how an empty value is stored. */
  expected: { column: string; field: string; empty: "" | null };
  /** Key used for the document number in activity details ("quoteNumber" / "orderNumber"). */
  numberDetailKey: string;
  party: {
    table: "customers" | "suppliers";
    column: "customer_id" | "supplier_id";
    field: "customerId" | "supplierId";
    inactiveMessage: string;
  };
  lines: {
    table: string;
    parentColumn: string;
    accountColumn: "sales_account_id" | "expense_account_id";
    accountField: "salesAccountId" | "expenseAccountId";
    calculation: { accountTypeFilter: "income" | "expense"; taxDirection: "sales" | "purchases" };
    customFieldEntity: CustomFieldEntityType;
  };
  statuses: { open: string; closed: string };
  messages: {
    notEditable: string;
    /** Statuses that block editing with `notEditable`. */
    lockedStatuses: readonly string[];
    issueOnlyDraft: string;
    closeOnlyOpen: string;
    cancelClosed: string;
  };
  activity: {
    /** Verb for an issuing save, e.g. "Issued" / "Confirmed". */
    saveIssueVerb: string;
    /** Summary verb for {@link issueTradeDocument}, e.g. "Issued" / "Activated". */
    issueVerb: string;
    /** Summary verb for close, e.g. "Accepted / closed" / "Completed" / "Closed". */
    closeVerb: string;
    /** Suffix for revision summaries: "Created revision N (X) from <revisionSource>". */
    revisionSource: string;
    revisionSourceIdKey: "sourceQuoteId" | "sourceOrderId";
  };
  revision: RevisionEngineConfig;
  /** Revision columns written when a document is created (quotes start their own revision family). */
  newRevisionFamily?: boolean;
  /** Timestamp columns stamped on status transitions (purchase orders). */
  timestamps?: { issued: string; closed: string; cancelled: string };
  /** Maker-checker approval policy (purchase orders). */
  approval?: { entityType: "purchase_order"; pendingStatus: string };
  /** Upstream quote an order converts from. */
  source?: {
    table: "sales_quotes" | "purchase_quotes";
    column: "sales_quote_id" | "purchase_quote_id";
    field: "salesQuoteId" | "purchaseQuoteId";
    invalidParentMessage: string;
  };
  /** Extra edit guards run after the locked-status check (purchase orders). */
  assertEditable?: (sqlite: Sqlite, current: Row, documentId: string, options?: TradeSaveOptions) => void;
  /** Extra guard before a revision is created. */
  assertRevisable?: (sqlite: Sqlite, documentId: string) => void;
};

function label(config: TradeDocumentConfig) {
  return config.label.charAt(0).toUpperCase() + config.label.slice(1);
}

function loadHeader(sqlite: Sqlite, config: TradeDocumentConfig, documentId: string) {
  return sqlite.prepare(`SELECT * FROM ${config.table} WHERE id = ?`).get(documentId) as Row | undefined;
}

function requireHeader(sqlite: Sqlite, config: TradeDocumentConfig, documentId: string) {
  const header = loadHeader(sqlite, config, documentId);
  if (!header) throw new Error(`${label(config)} not found.`);
  return header;
}

/** Finds an upstream quote by exact number, or by an embedded code such as "Ref SQ-0007 please". */
function resolveSourceFromReference(sqlite: Sqlite, config: TradeDocumentConfig, reference: string, partyId: string) {
  const source = config.source!;
  if (!reference) return null;
  const lookup = sqlite.prepare(`SELECT id FROM ${source.table} WHERE quote_number = ? AND (? IS NULL OR ${config.party.column} = ?) LIMIT 1`);
  const trimmed = reference.trim();
  const direct = lookup.get(trimmed, partyId ?? null, partyId ?? null) as { id: string } | undefined;
  if (direct) return direct.id;
  const match = trimmed.match(/\b([A-Za-z]{1,5}-\d+)\b/);
  if (match) {
    const coded = lookup.get(match[1], partyId ?? null, partyId ?? null) as { id: string } | undefined;
    if (coded) return coded.id;
  }
  return null;
}

/** Status a save leaves the document in, from its current status and the effective intent. */
function nextStatus(config: TradeDocumentConfig, currentStatus: string | null, intent: TradeSaveIntent) {
  if (currentStatus === config.statuses.open || intent === "issue") return config.statuses.open;
  if (config.approval && intent === "submit_approval") return config.approval.pendingStatus;
  return "draft";
}

function insertTradeLines(sqlite: Sqlite, config: TradeDocumentConfig, documentId: string, lines: StoredLine[]) {
  insertLineRows(sqlite, config.lines.table, lines, {
    id: (line) => line.id,
    [config.lines.parentColumn]: () => documentId,
    item_id: (line) => line.itemId || null,
    description: (line) => line.description,
    quantity_micros: (line) => line.quantityMicros,
    unit_price_minor: (line) => line.unitPriceMinor,
    discount_type: (line) => line.discountType || "none",
    discount_value: (line) => line.discountValue || "0",
    [config.lines.accountColumn]: (line) => line[config.lines.accountField],
    tax_code_id: (line) => line.taxCodeId,
    project_id: (line) => line.projectId || null,
    net_amount_minor: (line) => line.netAmountMinor,
    tax_amount_minor: (line) => line.taxAmountMinor,
    gross_amount_minor: (line) => line.grossAmountMinor,
    position: (line) => line.lineIndex,
  });
}

/**
 * Creates (no `documentId`) or updates a document with freshly calculated
 * lines. Requires create/edit (plus approve when saving with "issue"); a
 * maker-checker document checks only create/edit up front because the
 * approval policy decides whether the save issues, and an approval-bypassing
 * save (an approver acting on a pending request) requires approve.
 */
export function saveTradeDocument(
  config: TradeDocumentConfig,
  businessId: string,
  userId: string,
  input: Record<string, unknown>,
  intent: TradeSaveIntent,
  documentId?: string,
  options?: TradeSaveOptions,
) {
  if (options?.bypassApprovalPolicy) {
    assertMutationPermission(businessId, userId, config.module, "approve");
  } else {
    assertSavePermission(businessId, userId, config.module, documentId, config.approval ? "draft" : intent);
  }
  const data = config.schema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const { sqlite } = context;
  const partyId = data[config.party.field] as string;
  const party = sqlite.prepare(`SELECT is_active, default_currency_code FROM ${config.party.table} WHERE id = ?`).get(partyId) as
    | { is_active: number; default_currency_code: string | null }
    | undefined;
  if (!party || !party.is_active) throw new Error(config.party.inactiveMessage);
  const rate = resolveRateSnapshot(sqlite, {
    currencyCode: (input.currencyCode as string | undefined) ?? party.default_currency_code ?? data.currencyCode!,
    exchangeRateToBase: data.exchangeRateToBase,
    exchangeRateDate: data.exchangeRateDate,
    exchangeRateSource: data.exchangeRateSource,
    relevantDate: data.date,
    enforceVatPolicy: false,
  });
  validateProjectReferences(sqlite, { headerProjectId: data.projectId, lineProjectIds: data.lines.map((line) => line.projectId) });
  const lines = calculateLines(sqlite, data.lines as never, rate.currencyMinorUnit, {
    ...config.lines.calculation,
    supportItems: true,
    accountFieldOnLine: config.lines.accountField,
    amountsIncludeTax: data.amountsIncludeTax,
  });
  const amounts = totalsForLines(lines);
  const base = convertDocumentLinesToBase(lines, rate);
  const now = new Date().toISOString();
  const id = documentId ?? randomUUID();
  let number = "";
  const source = config.source;
  const resolvedSourceId = source
    ? (data[source.field] as string) || resolveSourceFromReference(sqlite, config, data.reference, partyId)
    : null;
  const approvalRequired =
    config.approval && intent !== "draft" && !options?.bypassApprovalPolicy
      ? evaluateApprovalRequirement(businessId, userId, config.approval.entityType, base.baseTotalMinor, sqlite).requiresApproval
      : false;
  const effectiveIntent: TradeSaveIntent =
    !config.approval || intent === "draft" ? intent : intent === "submit_approval" || approvalRequired ? "submit_approval" : "issue";
  let finalStatus = "draft";

  const header: ColumnValues = {
    [config.party.column]: partyId,
    project_id: data.projectId || null,
    [config.dateColumn]: data.date,
    [config.expected.column]: (data[config.expected.field] as string) || config.expected.empty,
    reference: data.reference || null,
    amounts_include_tax: data.amountsIncludeTax ? 1 : 0,
    subtotal_minor: amounts.subtotalMinor,
    tax_minor: amounts.taxMinor,
    total_minor: amounts.totalMinor,
    currency_code: rate.currencyCode,
    exchange_rate_to_base: rate.exchangeRateToBase,
    exchange_rate_date: rate.exchangeRateDate,
    exchange_rate_source: rate.exchangeRateSource,
    base_subtotal_minor: base.baseSubtotalMinor,
    base_tax_minor: base.baseTaxMinor,
    base_total_minor: base.baseTotalMinor,
    notes: data.notes || null,
    terms: data.terms || null,
  };

  runImmediateTransaction(sqlite, () => {
    let oldLineIds: string[] = [];
    if (documentId) {
      oldLineIds = (sqlite.prepare(`SELECT id FROM ${config.lines.table} WHERE ${config.lines.parentColumn} = ?`).all(documentId) as { id: string }[]).map((row) => row.id);
      const current = requireHeader(sqlite, config, documentId);
      if (config.messages.lockedStatuses.includes(current[config.statusColumn] as string)) throw new Error(config.messages.notEditable);
      config.assertEditable?.(sqlite, current, documentId, options);
      number = current[config.numberColumn] as string;
      finalStatus = nextStatus(config, current[config.statusColumn] as string, effectiveIntent);
      if (finalStatus === config.statuses.open) assertMutationPermission(businessId, userId, config.module, "approve");
      const values: ColumnValues = { ...header, [config.statusColumn]: finalStatus, updated_at: now };
      if (source) values[source.column] = resolvedSourceId || (source.field in input ? null : current[source.column]) || null;
      if (config.timestamps) {
        values[config.timestamps.issued] = { sql: `CASE WHEN ? = '${config.statuses.open}' THEN COALESCE(${config.timestamps.issued}, ?) ELSE ${config.timestamps.issued} END`, params: [finalStatus, now] };
      }
      updateRow(sqlite, config.table, documentId, values);
      sqlite.prepare(`DELETE FROM ${config.lines.table} WHERE ${config.lines.parentColumn} = ?`).run(documentId);
    } else {
      number = allocateNumber(sqlite, config.numbering);
      finalStatus = nextStatus(config, null, effectiveIntent);
      if (config.approval && finalStatus === config.statuses.open) assertMutationPermission(businessId, userId, config.module, "approve");
      if (source && resolvedSourceId) {
        const parent = sqlite.prepare(`SELECT document_status FROM ${source.table} WHERE id = ?`).get(resolvedSourceId) as { document_status: string } | undefined;
        if (parent && (parent.document_status === "accepted" || parent.document_status === "cancelled")) throw new Error(source.invalidParentMessage);
      }
      const values: ColumnValues = { id, [config.numberColumn]: number };
      if (config.newRevisionFamily) Object.assign(values, { base_quote_number: number, root_quote_id: id, revision_number: 0, is_latest_revision: 1 });
      Object.assign(values, header, { [config.statusColumn]: finalStatus, created_by: userId, created_at: now, updated_at: now });
      if (source) values[source.column] = resolvedSourceId || null;
      if (config.timestamps) {
        Object.assign(values, {
          [config.timestamps.issued]: finalStatus === config.statuses.open ? now : null,
          [config.timestamps.closed]: null,
          [config.timestamps.cancelled]: null,
        });
      }
      insertRow(sqlite, config.table, values);
    }
    insertTradeLines(sqlite, config, id, lines);
    saveLineCustomFieldValuesInTransaction(sqlite, config.lines.customFieldEntity, lines.map((line) => ({ lineId: line.id, customFields: line.customFields })), oldLineIds);

    if (config.approval && finalStatus === config.approval.pendingStatus) {
      recordPendingApprovalInTransaction(sqlite, {
        businessId,
        userId,
        entityType: config.approval.entityType,
        entityId: id,
        entityNumber: number,
        amountMinor: amounts.totalMinor,
        baseAmountMinor: base.baseTotalMinor,
        currencyCode: rate.currencyCode,
        targetIntent: "issue",
      });
    }
    if (source && resolvedSourceId) {
      sqlite.prepare(`UPDATE ${source.table} SET document_status = 'accepted' WHERE id = ? AND document_status = 'sent'`).run(resolvedSourceId);
    }
  });

  const details: Record<string, unknown> = { [config.numberDetailKey]: number, totalMinor: amounts.totalMinor, currency: rate.currencyCode, [config.party.field]: partyId };
  let action: string;
  let verb: string;
  if (config.approval) {
    const issued = finalStatus === config.statuses.open;
    action = issued ? "posted" : documentId ? "updated" : "created";
    verb = issued ? "Issued" : finalStatus === config.approval.pendingStatus ? "Submitted for approval" : documentId ? "Updated" : "Created draft";
    details.status = finalStatus;
  } else {
    action = intent === "issue" ? "posted" : documentId ? "updated" : "created";
    verb = intent === "issue" ? config.activity.saveIssueVerb : documentId ? "Updated" : "Created";
  }
  logDocumentActivity(businessId, "save", {
    userId,
    action,
    entityType: config.entityType,
    entityId: id,
    entityNumber: number,
    summary: `${verb} ${config.label} ${number}`,
    details,
    sqlite,
  });
  return id;
}

/** Sets a document's status (and optional timestamp column) and logs the transition. */
function applyStatusChange(
  config: TradeDocumentConfig,
  businessId: string,
  sqlite: Sqlite,
  userId: string,
  header: Row,
  change: { status: string; timestampColumn?: string; operation: string; action: string; verb: string },
) {
  const documentId = header.id as string;
  const now = new Date().toISOString();
  const values: ColumnValues = { [config.statusColumn]: change.status };
  if (change.timestampColumn) values[change.timestampColumn] = now;
  values.updated_at = now;
  updateRow(sqlite, config.table, documentId, values);
  const number = header[config.numberColumn] as string;
  logDocumentActivity(businessId, change.operation, {
    userId,
    action: change.action,
    entityType: config.entityType,
    entityId: documentId,
    entityNumber: number,
    summary: `${change.verb} ${config.label} ${number}`,
    details: { [config.numberDetailKey]: number, previousStatus: header[config.statusColumn], newStatus: change.status },
    sqlite,
  });
}

/**
 * draft → open. Requires approve; a maker-checker document requires edit and
 * goes to pending approval instead when the policy (or `submit_approval`)
 * asks for it, requiring approve only to issue directly.
 */
export function issueTradeDocument(
  config: TradeDocumentConfig,
  businessId: string,
  userId: string,
  documentId: string,
  intent: "issue" | "submit_approval" = "issue",
): string {
  assertMutationPermission(businessId, userId, config.module, config.approval ? "edit" : "approve");
  const { sqlite } = getBusinessDb(businessId, userId);
  const header = requireHeader(sqlite, config, documentId);
  if (header[config.statusColumn] !== "draft") throw new Error(config.messages.issueOnlyDraft);

  if (config.approval) {
    const approval = config.approval;
    const requiresApproval =
      intent === "submit_approval" ||
      evaluateApprovalRequirement(businessId, userId, approval.entityType, header.base_total_minor as number, sqlite).requiresApproval;
    if (requiresApproval) {
      const now = new Date().toISOString();
      sqlite.transaction(() => {
        updateRow(sqlite, config.table, documentId, { [config.statusColumn]: approval.pendingStatus, updated_at: now });
        recordPendingApprovalInTransaction(sqlite, {
          businessId,
          userId,
          entityType: approval.entityType,
          entityId: documentId,
          entityNumber: header[config.numberColumn] as string,
          amountMinor: header.total_minor as number,
          baseAmountMinor: header.base_total_minor as number,
          currencyCode: header.currency_code as string,
          targetIntent: "issue",
        });
      }).immediate();
      return approval.pendingStatus;
    }
    assertMutationPermission(businessId, userId, config.module, "approve");
  }

  applyStatusChange(config, businessId, sqlite, userId, header, {
    status: config.statuses.open,
    timestampColumn: config.timestamps?.issued,
    operation: "issue",
    action: "posted",
    verb: config.activity.issueVerb,
  });
  return config.statuses.open;
}

/** open → closed (accepted / completed / closed). Requires edit. */
export function closeTradeDocument(config: TradeDocumentConfig, businessId: string, userId: string, documentId: string) {
  assertMutationPermission(businessId, userId, config.module, "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  const header = requireHeader(sqlite, config, documentId);
  if (header[config.statusColumn] !== config.statuses.open) throw new Error(config.messages.closeOnlyOpen);
  applyStatusChange(config, businessId, sqlite, userId, header, {
    status: config.statuses.closed,
    timestampColumn: config.timestamps?.closed,
    operation: "close",
    action: "posted",
    verb: config.activity.closeVerb,
  });
}

/** Any non-closed status → cancelled. Requires delete. */
export function cancelTradeDocument(config: TradeDocumentConfig, businessId: string, userId: string, documentId: string) {
  assertMutationPermission(businessId, userId, config.module, "delete");
  const { sqlite } = getBusinessDb(businessId, userId);
  const header = requireHeader(sqlite, config, documentId);
  const status = header[config.statusColumn];
  if (status === "cancelled") throw new Error(`${label(config)} has already been cancelled.`);
  if (status === config.statuses.closed) throw new Error(config.messages.cancelClosed);
  applyStatusChange(config, businessId, sqlite, userId, header, {
    status: "cancelled",
    timestampColumn: config.timestamps?.cancelled,
    operation: "cancel",
    action: "voided",
    verb: "Cancelled",
  });
}

/**
 * Deletes a draft (revision). For orders the source quote returns to "sent"
 * when no other live order still references it. Requires delete.
 */
export function deleteTradeDocument(config: TradeDocumentConfig, businessId: string, userId: string, documentId: string) {
  assertMutationPermission(businessId, userId, config.module, "delete");
  const { sqlite } = getBusinessDb(businessId, userId);
  const source = config.source;
  let number = "";
  const remove = () => {
    const header = sqlite
      .prepare(`SELECT ${config.numberColumn} AS number${source ? `, ${source.column} AS source_id` : ""} FROM ${config.table} WHERE id = ?`)
      .get(documentId) as { number: string; source_id?: string | null } | undefined;
    if (header) number = header.number;
    deleteDraftRevision(sqlite, config.revision, documentId);
    if (source && header?.source_id) {
      const remaining = sqlite
        .prepare(`SELECT COUNT(*) as c FROM ${config.table} WHERE ${source.column} = ? AND id != ? AND ${config.statusColumn} NOT IN ('cancelled', 'superseded')`)
        .get(header.source_id, documentId) as { c: number };
      if (remaining.c === 0) {
        sqlite.prepare(`UPDATE ${source.table} SET document_status = 'sent' WHERE id = ? AND document_status = 'accepted'`).run(header.source_id);
      }
    }
  };
  if (source) sqlite.transaction(remove)();
  else remove();

  if (number) {
    logDocumentActivity(businessId, "delete", {
      userId,
      action: "deleted",
      entityType: config.entityType,
      entityId: documentId,
      entityNumber: number,
      summary: `Deleted draft ${config.label} ${number}`,
      sqlite,
    });
  }
}

/** Copies a document into a new draft revision. Requires create. */
export function createTradeDocumentRevision(config: TradeDocumentConfig, businessId: string, userId: string, sourceDocumentId: string): string {
  assertMutationPermission(businessId, userId, config.module, "create");
  const { sqlite } = getBusinessDb(businessId, userId);
  config.assertRevisable?.(sqlite, sourceDocumentId);
  const newId = createDocumentRevision(sqlite, config.revision, userId, sourceDocumentId);
  const revision = sqlite
    .prepare(`SELECT ${config.numberColumn} AS number, revision_number FROM ${config.table} WHERE id = ?`)
    .get(newId) as { number: string; revision_number: number } | undefined;
  if (revision) {
    logDocumentActivity(businessId, "revision", {
      userId,
      action: "created",
      entityType: config.entityType,
      entityId: newId,
      entityNumber: revision.number,
      summary: `Created revision ${revision.revision_number} (${revision.number}) from ${config.activity.revisionSource}`,
      details: { [config.numberDetailKey]: revision.number, revisionNumber: revision.revision_number, [config.activity.revisionSourceIdKey]: sourceDocumentId },
      sqlite,
    });
  }
  return newId;
}

/** All revisions in a document's family, newest first. */
export function listTradeDocumentRevisions(config: TradeDocumentConfig, businessId: string, userId: string, documentId: string, dateAlias: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const current = loadHeader(sqlite, config, documentId);
  if (!current) return [];
  const rootColumn = config.revision.headerTable.includes("quote") ? "root_quote_id" : "root_order_id";
  const rootId = (current[rootColumn] as string | null) || (current.id as string);
  const status = config.statusColumn === "document_status" ? "document_status" : `${config.statusColumn} as document_status`;
  const date = config.dateColumn === dateAlias ? dateAlias : `${config.dateColumn} as ${dateAlias}`;
  return sqlite.prepare(`
    SELECT id, ${config.numberColumn}, revision_number, is_latest_revision, ${status}, total_minor, currency_code, ${date}, created_at
    FROM ${config.table}
    WHERE ${rootColumn} = ? OR id = ?
    ORDER BY revision_number DESC
  `).all(rootId, rootId);
}
