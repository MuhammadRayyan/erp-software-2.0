import type { ColumnVisibility } from "@/components/use-column-visibility";

/**
 * Decode the flat `Record<string,string>` returned by the preferences
 * service into one `ColumnVisibility` map per storage key. Stored values
 * are JSON strings (`{"dueDate":false,...}`); we tolerate malformed
 * payloads by falling back to `undefined` so the caller's component
 * defaults take over.
 *
 * The `cols.` prefix groups every column-visibility preference under one
 * family; future preference families (e.g. `range.` for date ranges) can
 * sit alongside without colliding.
 */
export function decodeColumnSnapshots(
  preferences: Record<string, string>,
): Record<string, ColumnVisibility> {
  const out: Record<string, ColumnVisibility> = {};
  for (const [key, value] of Object.entries(preferences)) {
    if (!key.startsWith("cols.")) continue;
    const storageKey = key.slice("cols.".length);
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
      const visibility: ColumnVisibility = {};
      for (const [column, flag] of Object.entries(parsed)) {
        if (typeof flag === "boolean") visibility[column] = flag;
      }
      out[storageKey] = visibility;
    } catch {
      // Skip malformed entries — caller falls back to component defaults.
    }
  }
  return out;
}

export type ServerColumnSnapshots = Record<string, ColumnVisibility>;

export type { ColumnVisibility };
