import type Database from "better-sqlite3";
import { effectiveProjectId } from "@/modules/projects/project-validation";
import { recordActivity, type RecordActivityInput } from "@/modules/activity-log/activity-log-service";

/**
 * Small SQL building blocks shared by the document engines. Table and column
 * names always come from engine configuration constants, never from user
 * input; values are always bound parameters.
 */

type Sqlite = Database.Database;

/** A raw SQL expression for an UPDATE assignment, e.g. `COALESCE(issued_at, ?)`. */
export type SqlExpression = { sql: string; params: unknown[] };
export type ColumnValues = Record<string, unknown>;

function isExpression(value: unknown): value is SqlExpression {
  return typeof value === "object" && value !== null && "sql" in value && "params" in value;
}

export function insertRow(sqlite: Sqlite, table: string, values: ColumnValues) {
  const columns = Object.keys(values);
  sqlite
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .run(...columns.map((column) => values[column]));
}

export function updateRow(sqlite: Sqlite, table: string, id: string, values: ColumnValues) {
  const assignments: string[] = [];
  const params: unknown[] = [];
  for (const [column, value] of Object.entries(values)) {
    if (isExpression(value)) {
      assignments.push(`${column} = ${value.sql}`);
      params.push(...value.params);
    } else {
      assignments.push(`${column} = ?`);
      params.push(value);
    }
  }
  sqlite.prepare(`UPDATE ${table} SET ${assignments.join(", ")} WHERE id = ?`).run(...params, id);
}

/** Inserts document lines with one prepared statement; `columns` maps each column to its value. */
export function insertLineRows<Line>(
  sqlite: Sqlite,
  table: string,
  lines: readonly Line[],
  columns: Record<string, (line: Line) => unknown>,
) {
  if (lines.length === 0) return;
  const names = Object.keys(columns);
  const statement = sqlite.prepare(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`);
  for (const line of lines) statement.run(...names.map((name) => columns[name](line)));
}

export type DocumentListFilters = { partyId?: string; from?: string; to?: string; onlyLatest?: boolean };

/** WHERE clause for the standard document list filters (party, date range, latest revision). */
export function buildDocumentListWhere(
  alias: string,
  filters: DocumentListFilters | undefined,
  columns: { party: string; date: string },
) {
  const where: string[] = [];
  const params: string[] = [];
  if (filters?.onlyLatest) where.push(`${alias}.is_latest_revision = 1`);
  if (filters?.partyId) {
    where.push(`${alias}.${columns.party} = ?`);
    params.push(filters.partyId);
  }
  if (filters?.from) {
    where.push(`${alias}.${columns.date} >= ?`);
    params.push(filters.from);
  }
  if (filters?.to) {
    where.push(`${alias}.${columns.date} <= ?`);
    params.push(filters.to);
  }
  return { whereClause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

/** Adds `projectIds` / `projectNames` from a `project_ids` GROUP_CONCAT column. */
export function withProjectNames<Row extends { project_ids: string | null }>(sqlite: Sqlite, rows: Row[]) {
  const projects = sqlite.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
  const projectById = new Map(projects.map((project) => [project.id, project.name]));
  return rows.map((row) => {
    const projectIds = row.project_ids?.split(",").filter(Boolean) ?? [];
    return { ...row, projectIds, projectNames: projectIds.map((id) => projectById.get(id) ?? id) };
  });
}

type NamedRef = { id: string; name: string };
type TaxRef = { id: string; name: string; rate_basis_points: number };
type ProjectRef = { id: string; code: string; name: string };
type ItemRef = { id: string; sku: string | null; name: string; unit_name: string };

/** Reference data used to decorate priced document lines for display. */
export function loadLineLookups(sqlite: Sqlite) {
  const accounts = sqlite.prepare("SELECT id, name FROM accounts").all() as NamedRef[];
  const taxes = sqlite.prepare("SELECT id, name, rate_basis_points FROM tax_codes").all() as TaxRef[];
  return {
    accountById: new Map(accounts.map((row) => [row.id, row])),
    taxById: new Map(taxes.map((row) => [row.id, row])),
    projectById: new Map((sqlite.prepare("SELECT id, code, name FROM projects").all() as ProjectRef[]).map((project) => [project.id, project])),
    itemById: new Map((sqlite.prepare("SELECT id, sku, name, unit_name FROM inventory_items").all() as ItemRef[]).map((item) => [item.id, item])),
  };
}
export type LineLookups = ReturnType<typeof loadLineLookups>;

type PricedLine = { id: string; itemId: string | null; taxCodeId: string; projectId: string | null };

/**
 * Decorates a priced line with its item, ledger account, tax code, effective
 * project and custom field values. `extra` fields sit between the item and
 * the account, matching the historical object shape.
 */
export function decoratePricedLine<Line extends PricedLine, AccountKey extends string, Extra extends object = object>(
  line: Line,
  lookups: LineLookups,
  options: {
    headerProjectId: string | null;
    customFields: Map<string, Record<string, string>>;
    accountKey: AccountKey;
    accountId: string | null;
    extra?: Extra;
  },
) {
  const projectId = effectiveProjectId(line.projectId, options.headerProjectId);
  return {
    ...line,
    item: line.itemId ? lookups.itemById.get(line.itemId) ?? null : null,
    ...options.extra,
    [options.accountKey]: options.accountId ? lookups.accountById.get(options.accountId) ?? null : null,
    taxCode: lookups.taxById.get(line.taxCodeId) ?? null,
    project: projectId ? lookups.projectById.get(projectId) ?? null : null,
    customFields: options.customFields.get(line.id) ?? {},
  } as Line & { item: ItemRef | null } & Extra & { [K in AccountKey]: NamedRef | null } & {
    taxCode: TaxRef | null;
    project: ProjectRef | null;
    customFields: Record<string, string>;
  };
}

/**
 * Activity logging never blocks a committed document change; failures are
 * reported as `[ActivityLog] <entity> <operation> failed:`.
 */
export function logDocumentActivity(
  businessId: string,
  operation: string,
  input: RecordActivityInput & { sqlite: Sqlite },
) {
  try {
    recordActivity(businessId, input);
  } catch (e) {
    console.error(`[ActivityLog] ${input.entityType} ${operation} failed:`, e);
  }
}
