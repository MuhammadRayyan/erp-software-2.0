import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getBusinessDb } from "@/core/db/business";
import {
  customFieldDefinitionSchema,
  type CustomFieldDefinitionData,
  type CustomFieldEntityType,
} from "./custom-field-input";
import { formatCustomFieldValue } from "./custom-field-display";

export type CustomFieldDefinitionRow = {
  id: string;
  entityType: CustomFieldEntityType;
  name: string;
  fieldType: "text" | "number" | "date" | "select" | "checkbox";
  selectOptions: string[];
  position: number;
  isRequired: boolean;
  showInList: boolean;
  createdAt: string;
  updatedAt: string;
};

type DefinitionSqlRow = {
  id: string;
  entity_type: string;
  name: string;
  field_type: string;
  select_options: string;
  position: number;
  is_required: number;
  show_in_list: number;
  created_at: string;
  updated_at: string;
};

function parseDefinitionRow(row: DefinitionSqlRow): CustomFieldDefinitionRow {
  let options: string[] = [];
  try {
    const parsed = JSON.parse(row.select_options) as unknown;
    if (Array.isArray(parsed)) options = parsed.map((option) => String(option));
  } catch {
    options = [];
  }
  return {
    id: row.id,
    entityType: row.entity_type as CustomFieldDefinitionRow["entityType"],
    name: row.name,
    fieldType: row.field_type as CustomFieldDefinitionRow["fieldType"],
    selectOptions: options,
    position: row.position,
    isRequired: row.is_required === 1,
    showInList: row.show_in_list === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listDefinitionRows(
  sqlite: Database.Database,
  entityType?: CustomFieldEntityType,
): CustomFieldDefinitionRow[] {
  const rows = entityType
    ? (sqlite
        .prepare(
          "SELECT * FROM custom_field_definitions WHERE entity_type = ? ORDER BY position, created_at, id",
        )
        .all(entityType) as DefinitionSqlRow[])
    : (sqlite
        .prepare("SELECT * FROM custom_field_definitions ORDER BY entity_type, position, created_at, id")
        .all() as DefinitionSqlRow[]);
  return rows.map(parseDefinitionRow);
}

export function listCustomFieldDefinitions(
  businessId: string,
  userId: string,
  entityType?: CustomFieldEntityType,
): CustomFieldDefinitionRow[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  return listDefinitionRows(sqlite, entityType);
}

export function getCustomFieldDefinition(
  businessId: string,
  userId: string,
  definitionId: string,
): CustomFieldDefinitionRow | null {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare("SELECT * FROM custom_field_definitions WHERE id = ?")
    .get(definitionId) as DefinitionSqlRow | undefined;
  return row ? parseDefinitionRow(row) : null;
}

// New definitions are appended to the end of their entity-type group; the
// caller never assigns positions directly (ordering is managed by move).
function nextPosition(sqlite: Database.Database, entityType: CustomFieldEntityType) {
  const row = sqlite
    .prepare("SELECT COALESCE(MAX(position), -1) AS max_position FROM custom_field_definitions WHERE entity_type = ?")
    .get(entityType) as { max_position: number };
  return row.max_position + 1;
}

export function createCustomFieldDefinition(
  businessId: string,
  userId: string,
  input: unknown,
): string {
  const data: CustomFieldDefinitionData = customFieldDefinitionSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO custom_field_definitions
        (id, entity_type, name, field_type, select_options, position, is_required, show_in_list, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      data.entityType,
      data.name,
      data.fieldType,
      JSON.stringify(data.selectOptions),
      nextPosition(sqlite, data.entityType),
      data.isRequired ? 1 : 0,
      data.showInList ? 1 : 0,
      now,
      now,
    );
  return id;
}

// Existing values are kept as-is even when the type or options change — the
// value pipeline only writes through saveCustomFieldValues, which validates
// against the definition at write time.
export function updateCustomFieldDefinition(
  businessId: string,
  userId: string,
  definitionId: string,
  input: unknown,
): void {
  const data: CustomFieldDefinitionData = customFieldDefinitionSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const current = sqlite
    .prepare("SELECT id FROM custom_field_definitions WHERE id = ?")
    .get(definitionId) as { id: string } | undefined;
  if (!current) throw new Error("Custom field not found.");
  sqlite
    .prepare(
      `UPDATE custom_field_definitions
       SET entity_type = ?, name = ?, field_type = ?, select_options = ?, is_required = ?, show_in_list = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      data.entityType,
      data.name,
      data.fieldType,
      JSON.stringify(data.selectOptions),
      data.isRequired ? 1 : 0,
      data.showInList ? 1 : 0,
      new Date().toISOString(),
      definitionId,
    );
}

// Deleting a definition cascades to its stored values (ON DELETE CASCADE).
export function deleteCustomFieldDefinition(
  businessId: string,
  userId: string,
  definitionId: string,
): void {
  const { sqlite } = getBusinessDb(businessId, userId);
  const result = sqlite
    .prepare("DELETE FROM custom_field_definitions WHERE id = ?")
    .run(definitionId);
  if (result.changes === 0) throw new Error("Custom field not found.");
}

// Swap positions with the adjacent definition in the same entity-type group.
// Positions are re-normalized 0..n-1 afterwards so ties cannot accumulate.
export function moveCustomFieldDefinition(
  businessId: string,
  userId: string,
  definitionId: string,
  direction: "up" | "down",
): void {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare("SELECT entity_type FROM custom_field_definitions WHERE id = ?")
    .get(definitionId) as { entity_type: string } | undefined;
  if (!row) throw new Error("Custom field not found.");
  const group = listDefinitionRows(sqlite, row.entity_type as CustomFieldEntityType);
  const index = group.findIndex((definition) => definition.id === definitionId);
  if (index === -1) throw new Error("Custom field not found.");
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= group.length) return;
  [group[index], group[target]] = [group[target], group[index]];
  sqlite.transaction(() => {
    const update = sqlite.prepare("UPDATE custom_field_definitions SET position = ? WHERE id = ?");
    group.forEach((definition, position) => update.run(position, definition.id));
  }).immediate();
}

// Single query returning Map<entityId, Record<definitionId, value>> for list
// views. Only definitions of the requested entity type are included.
export function getCustomFieldValuesForEntities(
  businessId: string,
  userId: string,
  entityType: CustomFieldEntityType,
  entityIds: string[],
): Map<string, Record<string, string>> {
  const result = new Map<string, Record<string, string>>();
  if (entityIds.length === 0) return result;
  const { sqlite } = getBusinessDb(businessId, userId);
  const placeholders = entityIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `SELECT v.entity_id, v.definition_id, v.value
       FROM custom_field_values v
       JOIN custom_field_definitions d ON d.id = v.definition_id
       WHERE d.entity_type = ? AND v.entity_id IN (${placeholders})`,
    )
    .all(entityType, ...entityIds) as { entity_id: string; definition_id: string; value: string }[];
  for (const row of rows) {
    let entity = result.get(row.entity_id);
    if (!entity) {
      entity = {};
      result.set(row.entity_id, entity);
    }
    entity[row.definition_id] = row.value;
  }
  return result;
}

const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Normalize + validate one value against its definition. Throws with a
// human-readable message when the value cannot be stored.
function normalizeValue(definition: CustomFieldDefinitionRow, raw: string): string {
  const value = raw ?? "";
  switch (definition.fieldType) {
    case "checkbox":
      return value === "true" ? "true" : "false";
    case "number": {
      const trimmed = value.trim();
      if (trimmed === "") return "";
      if (!NUMBER_PATTERN.test(trimmed)) {
        throw new Error(`"${definition.name}" must be a number.`);
      }
      return trimmed;
    }
    case "date": {
      const trimmed = value.trim();
      if (trimmed === "") return "";
      if (!DATE_PATTERN.test(trimmed) || !isRealDate(trimmed)) {
        throw new Error(`"${definition.name}" must be a valid date (YYYY-MM-DD).`);
      }
      return trimmed;
    }
    case "select": {
      if (value === "") return "";
      if (!definition.selectOptions.includes(value)) {
        throw new Error(`"${value}" is not an option of "${definition.name}".`);
      }
      return value;
    }
    default:
      return value;
  }
}

// Upsert custom field values using an existing sqlite handle so callers can
// run it inside their own transaction (e.g. saving a customer atomically in
// E1b). Does NOT open or begin its own transaction.
export function saveCustomFieldValuesInTransaction(
  sqlite: Database.Database,
  entityType: CustomFieldEntityType,
  entityId: string,
  values: Record<string, string>,
): void {
  const definitions = listDefinitionRows(sqlite, entityType);
  const upsert = sqlite.prepare(
    `INSERT INTO custom_field_values (id, definition_id, entity_id, value, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(definition_id, entity_id)
     DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const now = new Date().toISOString();
  for (const definition of definitions) {
    const raw = Object.prototype.hasOwnProperty.call(values, definition.id) ? values[definition.id] : "";
    if (definition.isRequired && (raw ?? "").trim() === "") {
      throw new Error(`"${definition.name}" is required.`);
    }
    upsert.run(randomUUID(), definition.id, entityId, normalizeValue(definition, raw ?? ""), now);
  }
}

export function saveCustomFieldValues(
  businessId: string,
  userId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
  values: Record<string, string>,
): void {
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.transaction(() => {
    saveCustomFieldValuesInTransaction(sqlite, entityType, entityId, values);
  }).immediate();
}

// Pair a single entity's custom field values with their definition metadata,
// returning a name/value array suitable for printing on PDFs and statements.
// Definitions are returned in their stored position order; only values that
// match a real definition are included. Missing values are rendered using
// formatCustomFieldValue (which shows "—" for empty text/number/date/select
// fields and "No" for unchecked checkboxes).
export function getCustomFieldPairsForEntity(
  businessId: string,
  userId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
): Array<{ name: string; value: string }> {
  const { sqlite } = getBusinessDb(businessId, userId);
  const definitions = listDefinitionRows(sqlite, entityType);
  if (definitions.length === 0) return [];
  const rows = sqlite
    .prepare(
      "SELECT definition_id, value FROM custom_field_values WHERE entity_id = ?",
    )
    .all(entityId) as { definition_id: string; value: string }[];
  const valueByDefinition = new Map<string, string>();
  for (const row of rows) valueByDefinition.set(row.definition_id, row.value);
  return definitions.map((definition) => ({
    name: definition.name,
    value: formatCustomFieldValue(
      definition.fieldType,
      valueByDefinition.get(definition.id),
    ),
  }));
}
