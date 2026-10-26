import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import { randomUUID } from "node:crypto";

export type UnitOfMeasure = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listUnitsOfMeasure(businessId: string, userId: string): UnitOfMeasure[] {
  const { sqlite } = getBusinessDb(businessId, userId);
  try {
    const rows = sqlite
      .prepare("SELECT id, code, name, is_active as isActive, created_at as createdAt, updated_at as updatedAt FROM units_of_measure ORDER BY name ASC")
      .all() as { id: string; code: string; name: string; isActive: number; createdAt: string; updatedAt: string }[];
    return rows.map((r) => ({
      ...r,
      isActive: Boolean(r.isActive),
    }));
  } catch {
    return [
      { id: "uom_pcs", code: "pcs", name: "Pieces", isActive: true, createdAt: "", updatedAt: "" },
      { id: "uom_hrs", code: "hrs", name: "Hours", isActive: true, createdAt: "", updatedAt: "" },
      { id: "uom_days", code: "days", name: "Days", isActive: true, createdAt: "", updatedAt: "" },
      { id: "uom_kg", code: "kg", name: "Kilograms", isActive: true, createdAt: "", updatedAt: "" },
      { id: "uom_m", code: "m", name: "Meters", isActive: true, createdAt: "", updatedAt: "" },
      { id: "uom_box", code: "box", name: "Boxes", isActive: true, createdAt: "", updatedAt: "" },
    ];
  }
}

export function createUnitOfMeasure(businessId: string, userId: string, code: string, name: string): void {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const trimmedCode = code.trim().toLowerCase();
  const trimmedName = name.trim();
  if (!trimmedCode) throw new Error("Unit code is required.");
  if (!trimmedName) throw new Error("Unit name is required.");

  sqlite
    .prepare("INSERT INTO units_of_measure (id, code, name, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
    .run(randomUUID(), trimmedCode, trimmedName, now, now);
}

export function deleteUnitOfMeasure(businessId: string, userId: string, id: string): void {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.prepare("DELETE FROM units_of_measure WHERE id = ?").run(id);
}

export function toggleUnitOfMeasure(businessId: string, userId: string, id: string, isActive: boolean): void {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  sqlite.prepare("UPDATE units_of_measure SET is_active = ?, updated_at = ? WHERE id = ?").run(isActive ? 1 : 0, now, id);
}
