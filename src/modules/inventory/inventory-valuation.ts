import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const QUANTITY_SCALE = 10_000n;

function toSafeNumber(value: bigint, label: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} is too large.`);
  return result;
}

function divideAndRound(value: bigint, divisor: bigint) {
  if (divisor <= 0n) throw new Error("Inventory divisor must be positive.");
  return (value + divisor / 2n) / divisor;
}

export function receivedValueMinor(quantityMicros: number, unitCostMinor: number) {
  if (!Number.isSafeInteger(quantityMicros) || quantityMicros <= 0) throw new Error("Quantity must be greater than zero.");
  if (!Number.isSafeInteger(unitCostMinor) || unitCostMinor < 0) throw new Error("Unit cost is invalid.");
  return toSafeNumber(divideAndRound(BigInt(quantityMicros) * BigInt(unitCostMinor), QUANTITY_SCALE), "Inventory value");
}

export function unitCostMinorToMicros(unitCostMinor: number) {
  if (!Number.isSafeInteger(unitCostMinor) || unitCostMinor < 0) throw new Error("Unit cost is invalid.");
  return toSafeNumber(BigInt(unitCostMinor) * 10_000n, "Unit cost");
}

export function averageUnitCostMicros(valueMinor: number, quantityMicros: number) {
  if (quantityMicros <= 0 || valueMinor <= 0) return 0;
  return toSafeNumber(divideAndRound(BigInt(valueMinor) * 100_000_000n, BigInt(quantityMicros)), "Average cost");
}

export function formatUnitCostMicros(value: number, currency = "AED") {
  return `${currency} ${(value / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function formatQuantityMicros(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 10_000);
  const fraction = String(absolute % 10_000).padStart(4, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export type StockBalance = { quantityMicros: number; valueMinor: number; averageUnitCostMicros: number };

export function getStockBalance(sqlite: Database.Database, itemId: string, locationId?: string): StockBalance {
  const row = sqlite.prepare(`
    SELECT COALESCE(SUM(quantity_delta_micros), 0) AS quantity_micros,
           COALESCE(SUM(value_delta_minor), 0) AS value_minor
    FROM inventory_movements
    WHERE item_id = ? ${locationId ? "AND location_id = ?" : ""}
  `).get(...(locationId ? [itemId, locationId] : [itemId])) as { quantity_micros: number; value_minor: number };
  return {
    quantityMicros: row.quantity_micros,
    valueMinor: row.value_minor,
    averageUnitCostMicros: averageUnitCostMicros(row.value_minor, row.quantity_micros),
  };
}

export function issueValueMinor(balance: StockBalance, quantityMicros: number) {
  if (quantityMicros > balance.quantityMicros) throw new Error("The inventory movement would create negative stock.");
  if (quantityMicros <= 0) throw new Error("Quantity must be greater than zero.");
  if (quantityMicros === balance.quantityMicros) return balance.valueMinor;
  return toSafeNumber(divideAndRound(BigInt(balance.valueMinor) * BigInt(quantityMicros), BigInt(balance.quantityMicros)), "Issue value");
}

export function valueAtAverageCostMinor(balance: StockBalance, quantityMicros: number) {
  if (balance.quantityMicros <= 0 || balance.valueMinor <= 0) throw new Error("Valued stock is required.");
  if (!Number.isSafeInteger(quantityMicros) || quantityMicros <= 0) throw new Error("Quantity must be greater than zero.");
  return toSafeNumber(divideAndRound(BigInt(balance.valueMinor) * BigInt(quantityMicros), BigInt(balance.quantityMicros)), "Inventory value");
}

export type MovementInput = {
  id?: string;
  date: string;
  itemId: string;
  locationId: string;
  movementType: "goods_receipt" | "delivery" | "adjustment_in" | "adjustment_out" | "opening_balance";
  quantityDeltaMicros: number;
  unitCostMicros: number;
  valueDeltaMinor: number;
  sourceType: string;
  sourceId: string;
  sourceLineId?: string | null;
  projectId?: string | null;
  description?: string | null;
  createdAt?: string;
};

export function insertInventoryMovement(sqlite: Database.Database, input: MovementInput) {
  if (!sqlite.inTransaction) throw new Error("Inventory posting must run inside a database transaction.");
  sqlite.prepare(`
    INSERT INTO inventory_movements (
      id, date, item_id, location_id, movement_type, quantity_delta_micros,
      unit_cost_micros, value_delta_minor, source_type, source_id, source_line_id,
      project_id, description, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id ?? randomUUID(), input.date, input.itemId, input.locationId, input.movementType,
    input.quantityDeltaMicros, input.unitCostMicros, input.valueDeltaMinor,
    input.sourceType, input.sourceId, input.sourceLineId ?? null, input.projectId ?? null,
    input.description ?? null, input.createdAt ?? new Date().toISOString(),
  );
}

export function deleteSourceMovements(sqlite: Database.Database, sourceType: string, sourceId: string) {
  if (!sqlite.inTransaction) throw new Error("Inventory source rebuild must run inside a database transaction.");
  sqlite.prepare("DELETE FROM inventory_movements WHERE source_type = ? AND source_id = ?").run(sourceType, sourceId);
}
