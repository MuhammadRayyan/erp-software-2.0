import type Database from "better-sqlite3";

export type InventoryMovementKey = {
  itemId: string;
  locationId: string;
};

export const BACKDATED_INVENTORY_ERROR =
  "This inventory transaction cannot be backdated because later stock movements already exist for this item and location.";

export const EDIT_INVENTORY_CHRONOLOGY_ERROR =
  "This posted inventory transaction cannot be edited because later stock movements depend on its valuation.";

export const VOID_INVENTORY_CHRONOLOGY_ERROR =
  "This inventory transaction cannot be voided because later stock movements exist.";

function uniqueKeys(keys: readonly InventoryMovementKey[]) {
  return Array.from(
    new Map(keys.map((key) => [`${key.itemId}\u0000${key.locationId}`, key])).values(),
  );
}

export function assertInventoryPostingOrder(
  sqlite: Database.Database,
  date: string,
  keys: readonly InventoryMovementKey[],
  excludedSource?: { sourceType: string; sourceId: string },
) {
  if (!sqlite.inTransaction) {
    throw new Error("Inventory chronology validation must run inside a database transaction.");
  }

  const sourceCondition = excludedSource
    ? "AND NOT (source_type = ? AND source_id = ?)"
    : "";
  const statement = sqlite.prepare(`
    SELECT 1
    FROM inventory_movements
    WHERE item_id = ?
      AND location_id = ?
      AND date > ?
      ${sourceCondition}
    LIMIT 1
  `);

  for (const key of uniqueKeys(keys)) {
    const values = excludedSource
      ? [key.itemId, key.locationId, date, excludedSource.sourceType, excludedSource.sourceId]
      : [key.itemId, key.locationId, date];
    if (statement.get(...values)) throw new Error(BACKDATED_INVENTORY_ERROR);
  }
}

export function assertInventorySourceIsLatest(
  sqlite: Database.Database,
  sourceType: string,
  sourceId: string,
  message: string,
) {
  if (!sqlite.inTransaction) {
    throw new Error("Inventory chronology validation must run inside a database transaction.");
  }

  const later = sqlite.prepare(`
    SELECT 1
    FROM inventory_movements original
    INNER JOIN inventory_movements candidate
      ON candidate.item_id = original.item_id
      AND candidate.location_id = original.location_id
      AND NOT (candidate.source_type = original.source_type AND candidate.source_id = original.source_id)
      AND (
        candidate.date > original.date
        OR (candidate.date = original.date AND candidate.created_at > original.created_at)
        OR (
          candidate.date = original.date
          AND candidate.created_at = original.created_at
          AND candidate.id > original.id
        )
      )
    WHERE original.source_type = ? AND original.source_id = ?
    LIMIT 1
  `).get(sourceType, sourceId);

  if (later) throw new Error(message);
}
