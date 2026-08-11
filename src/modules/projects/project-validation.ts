import type Database from "better-sqlite3";

export function effectiveProjectId(lineProjectId: string | null | undefined, headerProjectId: string | null | undefined) {
  return lineProjectId || headerProjectId || null;
}

export function validateProjectReferences(
  sqlite: Database.Database,
  input: {
    headerProjectId?: string | null;
    lineProjectIds?: (string | null | undefined)[];
    customerId?: string | null;
    customerFacing?: boolean;
  },
) {
  const ids = [...new Set([
    input.headerProjectId,
    ...(input.lineProjectIds ?? []),
  ].filter((value): value is string => Boolean(value)))];
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(`SELECT id, customer_id, status, is_active FROM projects WHERE id IN (${placeholders})`)
    .all(...ids) as {
      id: string;
      customer_id: string | null;
      status: string;
      is_active: number;
    }[];
  if (rows.length !== ids.length) throw new Error("Selected project could not be found.");
  for (const project of rows) {
    if (!project.is_active || project.status === "cancelled") throw new Error("Project is cancelled.");
    if (
      input.customerFacing &&
      project.customer_id &&
      input.customerId &&
      project.customer_id !== input.customerId
    ) {
      throw new Error("Selected project belongs to a different customer.");
    }
  }
}
