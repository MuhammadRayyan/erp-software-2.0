import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { z } from "zod";
import { getBusinessDb } from "@/core/db/business";
import { getBusinessTodayIso } from "@/core/format";
import { assertMutationPermission, assertSavePermission } from "@/core/permissions/mutation-permissions";
import { parseQuantityToMicros } from "@/modules/accounting/calculations/money";
import { allocateNumber, type NumberKind } from "@/modules/accounting/services/numbering-service";
import { assertDateNotLocked } from "@/modules/accounting/services/financial-lock-service";
import {
  assertInventoryPostingOrder,
  assertInventorySourceIsLatest,
  EDIT_INVENTORY_CHRONOLOGY_ERROR,
  VOID_INVENTORY_CHRONOLOGY_ERROR,
} from "@/modules/inventory/inventory-chronology";
import type { InventoryDocumentIntent, InventoryDocumentStatus } from "@/modules/inventory/inventory-document";
import { deleteSourceMovements, insertInventoryMovement } from "@/modules/inventory/inventory-valuation";
import { insertLineRows, insertRow, updateRow, type ColumnValues } from "./document-sql";

/**
 * Config-driven engine for stock documents that move inventory at one
 * location: delivery notes (stock out) and goods receipts (stock in).
 *
 * The engine owns the shared lifecycle — draft create/update, posting with
 * period-lock and stock-chronology checks, re-posting an edited posted
 * document, void with reversing movements, and draft deletion. Document
 * specifics (header columns, source-document validation, valuation, the
 * stock-movement / journal posting itself) are hooks on {@link StockDocumentConfig}.
 *
 * Every exported command asserts its own inventory permission: create/edit
 * (plus post) on save and `post` whenever a save actually posts; delete to
 * void or delete. Document services delegate to these commands.
 */

type Sqlite = Database.Database;

export type StockDocumentHeader = {
  id: string;
  number: string;
  date: string;
  locationId: string;
  projectId: string | null;
  createdAt: string;
};

type StockInputLine = { itemId: string; description: string; quantity: string; projectId: string };
type StockInput = { date: string; locationId: string; projectId: string; lines: StockInputLine[] };
export type StockLineBase = { id: string; itemId: string; quantityMicros: number; lineIndex: number };

export type StockDocumentConfig<Data extends StockInput, Line extends StockLineBase, State = void> = {
  sourceType: "delivery_note" | "goods_receipt";
  /** Title-case name used in messages, e.g. "Delivery Note". */
  label: string;
  pluralLabel: string;
  /** Sentence-case name used for period-lock messages, e.g. "Delivery note". */
  lockLabel: string;
  schema: z.ZodType<Data, unknown>;
  table: string;
  numberColumn: string;
  numbering: NumberKind;
  lines: { table: string; parentColumn: string; columns: Record<string, (line: Line) => unknown> };
  /** "out" issues stock (delivery), "in" receives it (goods receipt). */
  direction: "out" | "in";
  movementType: "delivery" | "goods_receipt";
  /** Raised on void when a line's original movement is missing. */
  missingMovementMessage: string;
  /** Document-specific header columns written on insert and update. */
  headerColumns: (data: Data) => ColumnValues;
  validateHeader: (sqlite: Sqlite, data: Data) => void;
  /** Builds a stored line from an input line (the item is already known to be active). */
  prepareLine: (line: Data["lines"][number], base: StockLineBase & { description: string; projectId: string | null }) => Line;
  validateSources: (sqlite: Sqlite, data: Data, lines: Line[], documentId?: string) => void;
  /** Re-values lines before posting (goods receipts costed from a purchase invoice). */
  valueLines?: (sqlite: Sqlite, lines: Line[]) => Line[];
  /** Reads what a re-post needs to know about the posted version. */
  loadPostedState?: (sqlite: Sqlite, documentId: string) => State;
  /** Runs after a posted document's movements are removed, before it is re-posted. */
  afterMovementsRemoved?: (sqlite: Sqlite, state: State, lines: Line[], data: Data) => void;
  /** Writes stock movements (and any journal) for a posting. */
  post: (sqlite: Sqlite, header: StockDocumentHeader, lines: readonly Line[], replace: boolean) => void;
  /** Extra check per line before its reversing movement is written. */
  beforeVoidLine?: (sqlite: Sqlite, line: VoidLine, header: VoidHeader) => void;
  /** Runs after the reversing movements (e.g. reverse the journal). */
  afterVoidMovements?: (sqlite: Sqlite, header: VoidHeader & { id: string }) => void;
};

export type VoidLine = {
  id: string;
  item_id: string;
  quantity_micros: number;
  project_id: string | null;
  unit_cost_micros: number | null;
  value_delta_minor: number | null;
};
export type VoidHeader = {
  number: string;
  date: string;
  location_id: string;
  project_id: string | null;
  document_status: InventoryDocumentStatus;
};

function prepareStockLines<Data extends StockInput, Line extends StockLineBase, State>(
  config: StockDocumentConfig<Data, Line, State>,
  sqlite: Sqlite,
  data: Data,
) {
  const itemIds = new Set(
    (sqlite.prepare("SELECT id FROM inventory_items WHERE is_active = 1").all() as { id: string }[]).map((item) => item.id),
  );
  return data.lines.map((line, position): Line => {
    if (!itemIds.has(line.itemId)) throw new Error("Choose an active inventory item.");
    return config.prepareLine(line, {
      id: randomUUID(),
      itemId: line.itemId,
      description: line.description,
      quantityMicros: parseQuantityToMicros(line.quantity),
      projectId: line.projectId || null,
      lineIndex: position,
    });
  });
}

/**
 * Creates or updates a stock document; `post` (or editing a posted document)
 * writes its stock movements. Requires inventory create/edit (plus post).
 */
export function saveStockDocument<Data extends StockInput, Line extends StockLineBase, State>(
  config: StockDocumentConfig<Data, Line, State>,
  businessId: string,
  userId: string,
  input: unknown,
  intent: InventoryDocumentIntent,
  documentId?: string,
) {
  assertSavePermission(businessId, userId, "inventory", documentId, intent);
  const data = config.schema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const id = documentId ?? randomUUID();

  sqlite.transaction(() => {
    config.validateHeader(sqlite, data);
    const enteredLines = prepareStockLines(config, sqlite, data);
    config.validateSources(sqlite, data, enteredLines, documentId);
    const lines = config.valueLines ? config.valueLines(sqlite, enteredLines) : enteredLines;

    let number: string;
    let wasPosted = false;
    let shouldPost = intent === "post";
    let postedState: State | undefined;
    if (documentId) {
      const current = sqlite.prepare(`SELECT ${config.numberColumn} AS number, document_status, date FROM ${config.table} WHERE id = ?`).get(documentId) as
        | { number: string; document_status: InventoryDocumentStatus; date: string }
        | undefined;
      if (!current) throw new Error(`${config.label} not found.`);
      if (current.document_status === "void") throw new Error(`A void ${config.label} cannot be edited.`);
      number = current.number;
      wasPosted = current.document_status === "posted";
      shouldPost = wasPosted || intent === "post";
      if (wasPosted) {
        assertDateNotLocked(sqlite, current.date, config.lockLabel);
        assertInventorySourceIsLatest(sqlite, config.sourceType, documentId, EDIT_INVENTORY_CHRONOLOGY_ERROR);
        postedState = config.loadPostedState?.(sqlite, documentId);
      }
    } else {
      number = allocateNumber(sqlite, config.numbering);
    }

    if (shouldPost) {
      assertMutationPermission(businessId, userId, "inventory", "post");
      assertDateNotLocked(sqlite, data.date, config.lockLabel);
      assertInventoryPostingOrder(
        sqlite,
        data.date,
        lines.map((line) => ({ itemId: line.itemId, locationId: data.locationId })),
        wasPosted ? { sourceType: config.sourceType, sourceId: id } : undefined,
      );
    }
    if (wasPosted) {
      deleteSourceMovements(sqlite, config.sourceType, id);
      config.afterMovementsRemoved?.(sqlite, postedState as State, lines, data);
    }

    if (documentId) {
      updateRow(sqlite, config.table, documentId, { ...config.headerColumns(data), updated_at: now });
      sqlite.prepare(`DELETE FROM ${config.lines.table} WHERE ${config.lines.parentColumn} = ?`).run(documentId);
    } else {
      insertRow(sqlite, config.table, {
        id,
        [config.numberColumn]: number,
        ...config.headerColumns(data),
        document_status: "draft",
        created_by: userId,
        created_at: now,
        updated_at: now,
        posted_at: null,
        voided_at: null,
      });
    }

    insertLineRows(sqlite, config.lines.table, lines, {
      id: (line) => line.id,
      [config.lines.parentColumn]: () => id,
      ...config.lines.columns,
    });
    if (shouldPost) {
      config.post(sqlite, { id, number, date: data.date, locationId: data.locationId, projectId: data.projectId || null, createdAt: now }, lines, wasPosted);
      sqlite.prepare(`UPDATE ${config.table} SET document_status = 'posted', posted_at = COALESCE(posted_at, ?) WHERE id = ?`).run(now, id);
    }
  }).immediate();

  return id;
}

/** Reverses a posted document's movements and marks it void. Requires inventory delete. */
export function voidStockDocument<Data extends StockInput, Line extends StockLineBase, State>(
  config: StockDocumentConfig<Data, Line, State>,
  businessId: string,
  userId: string,
  documentId: string,
) {
  assertMutationPermission(businessId, userId, "inventory", "delete");
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  sqlite.transaction(() => {
    const header = sqlite
      .prepare(`SELECT ${config.numberColumn} AS number, date, location_id, project_id, document_status FROM ${config.table} WHERE id = ?`)
      .get(documentId) as VoidHeader | undefined;
    if (!header) throw new Error(`${config.label} not found.`);
    if (header.document_status !== "posted") throw new Error(`Only a posted ${config.label} can be voided.`);
    assertDateNotLocked(sqlite, header.date, `${config.lockLabel} void`);
    assertDateNotLocked(sqlite, getBusinessTodayIso(), `${config.lockLabel} void`);
    assertInventorySourceIsLatest(sqlite, config.sourceType, documentId, VOID_INVENTORY_CHRONOLOGY_ERROR);

    const lines = sqlite.prepare(`
      SELECT l.id, l.item_id, l.quantity_micros, l.project_id,
        im.unit_cost_micros, im.value_delta_minor
      FROM ${config.lines.table} l
      LEFT JOIN inventory_movements im
        ON im.source_type = '${config.sourceType}' AND im.source_line_id = l.id
      WHERE l.${config.lines.parentColumn} = ?
      ORDER BY l.position
    `).all(documentId) as VoidLine[];

    for (const [position, line] of lines.entries()) {
      if (line.unit_cost_micros == null || line.value_delta_minor == null) throw new Error(config.missingMovementMessage);
      config.beforeVoidLine?.(sqlite, line, header);
      insertInventoryMovement(sqlite, {
        date: header.date,
        itemId: line.item_id,
        locationId: header.location_id,
        movementType: config.movementType,
        quantityDeltaMicros: config.direction === "out" ? line.quantity_micros : -line.quantity_micros,
        unitCostMicros: line.unit_cost_micros,
        valueDeltaMinor: -line.value_delta_minor,
        sourceType: `${config.sourceType}_void`,
        sourceId: documentId,
        sourceLineId: line.id,
        projectId: line.project_id ?? header.project_id,
        description: `Void ${header.number}`,
        createdAt: new Date(Date.parse(now) + position).toISOString(),
      });
    }
    config.afterVoidMovements?.(sqlite, { ...header, id: documentId });
    sqlite.prepare(`UPDATE ${config.table} SET document_status = 'void', voided_at = ?, updated_at = ? WHERE id = ?`).run(now, now, documentId);
  }).immediate();
}

/** Deletes a draft. Requires inventory delete. */
export function deleteStockDocument<Data extends StockInput, Line extends StockLineBase, State>(
  config: StockDocumentConfig<Data, Line, State>,
  businessId: string,
  userId: string,
  documentId: string,
) {
  assertMutationPermission(businessId, userId, "inventory", "delete");
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite.prepare(`SELECT document_status FROM ${config.table} WHERE id = ?`).get(documentId) as { document_status: string } | undefined;
  if (!row) throw new Error(`${config.label} not found.`);
  if (row.document_status !== "draft") throw new Error(`Only draft ${config.pluralLabel} can be deleted.`);
  sqlite.prepare(`DELETE FROM ${config.table} WHERE id = ?`).run(documentId);
}
