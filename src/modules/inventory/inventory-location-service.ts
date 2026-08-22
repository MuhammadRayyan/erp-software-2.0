import { cache } from "react";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { inventoryLocationInputSchema, type InventoryLocationInput } from "./inventory-location-input";

export const listInventoryLocations = cache((businessId: string, userId: string, activeOnly = false) => {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`SELECT l.*,
    COALESCE((SELECT SUM(quantity_delta_micros) FROM inventory_movements m WHERE m.location_id = l.id), 0) AS quantity_micros,
    COALESCE((SELECT SUM(value_delta_minor) FROM inventory_movements m WHERE m.location_id = l.id), 0) AS value_minor
    FROM inventory_locations l ${activeOnly ? "WHERE l.is_active = 1" : ""}
    ORDER BY l.is_default DESC, l.code`).all() as Array<Record<string, unknown> & { id: string; code: string; name: string }>;
});

export function getDefaultInventoryLocation(businessId: string, userId: string) {
  const locations = listInventoryLocations(businessId, userId, true);
  return locations.find((row) => Boolean(row.is_default)) ?? locations[0] ?? null;
}

export function getInventoryLocation(businessId: string, userId: string, locationId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const location = sqlite.prepare("SELECT * FROM inventory_locations WHERE id = ?").get(locationId) as Record<string, unknown> | undefined;
  if (!location) return null;
  const stock = sqlite.prepare(`SELECT i.id, i.sku, i.name, i.unit_name,
    SUM(m.quantity_delta_micros) AS quantity_micros, SUM(m.value_delta_minor) AS value_minor
    FROM inventory_movements m INNER JOIN inventory_items i ON i.id = m.item_id
    WHERE m.location_id = ? GROUP BY i.id HAVING quantity_micros <> 0 OR value_minor <> 0 ORDER BY i.name`)
    .all(locationId) as Record<string, unknown>[];
  return { location, stock };
}

export function saveInventoryLocation(businessId: string, userId: string, input: InventoryLocationInput, locationId?: string) {
  const data = inventoryLocationInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const duplicate = sqlite.prepare("SELECT id FROM inventory_locations WHERE code = ? COLLATE NOCASE AND id <> ?")
    .get(data.code, locationId ?? "") as { id: string } | undefined;
  if (duplicate) throw new Error("Location code already exists.");
  const now = new Date().toISOString();
  const id = locationId ?? randomUUID();
  sqlite.transaction(() => {
    if (data.isDefault) sqlite.prepare("UPDATE inventory_locations SET is_default = 0, updated_at = ?").run(now);
    if (locationId) {
      const current = sqlite.prepare("SELECT is_default FROM inventory_locations WHERE id = ?").get(locationId) as { is_default: number } | undefined;
      if (!current) throw new Error("Inventory location not found.");
      if (current.is_default && (!data.isDefault || !data.isActive)) throw new Error("Choose another default location before changing Main Warehouse.");
      sqlite.prepare("UPDATE inventory_locations SET code = ?, name = ?, address = ?, is_default = ?, is_active = ?, updated_at = ? WHERE id = ?")
        .run(data.code, data.name, data.address || null, data.isDefault ? 1 : 0, data.isActive ? 1 : 0, now, locationId);
    } else {
      sqlite.prepare("INSERT INTO inventory_locations (id, code, name, address, is_default, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, data.code, data.name, data.address || null, data.isDefault ? 1 : 0, data.isActive ? 1 : 0, now, now);
    }
  }).immediate();
  return id;
}
