import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import {
  minorToInput,
  parseMoneyToMinor,
  quantityMicrosToInput,
} from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import {
  postTransaction,
  reverseTransaction,
} from "@/modules/accounting/services/posting-service";
import { validateProjectReferences } from "@/modules/projects/project-validation";
import {
  assertInventoryPostingOrder,
  assertInventorySourceIsLatest,
  EDIT_INVENTORY_CHRONOLOGY_ERROR,
  VOID_INVENTORY_CHRONOLOGY_ERROR,
} from "./inventory-chronology";
import type {
  InventoryDocumentIntent,
  InventoryDocumentStatus,
} from "./inventory-document";
import { stockAdjustmentInputSchema, type StockAdjustmentInput } from "./stock-adjustment-input";
import {
  averageUnitCostMicros,
  deleteSourceMovements,
  getStockBalance,
  insertInventoryMovement,
  issueValueMinor,
  receivedValueMinor,
  unitCostMinorToMicros,
  valueAtAverageCostMinor,
} from "./inventory-valuation";

export type { InventoryDocumentIntent, InventoryDocumentStatus } from "./inventory-document";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];

function parseSignedQuantity(value: string) {
  const sign = value.startsWith("-") ? -1 : 1;
  const normalized = value.replace(/^[+-]/, "");
  const [whole, fraction = ""] = normalized.split(".");
  const micros = Number(BigInt(`${whole}${fraction.padEnd(4, "0")}`));
  if (!Number.isSafeInteger(micros)) throw new Error("Quantity is too large.");
  return sign * micros;
}

export function listStockAdjustments(businessId: string, userId: string) {
  return getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT sa.*, i.name AS item_name, i.sku, i.unit_name, l.code AS location_code,
      COALESCE((
        SELECT ABS(value_delta_minor)
        FROM inventory_movements m
        WHERE m.source_type = 'stock_adjustment' AND m.source_id = sa.id
      ), 0) AS value_minor
    FROM stock_adjustments sa
    INNER JOIN inventory_items i ON i.id = sa.item_id
    INNER JOIN inventory_locations l ON l.id = sa.location_id
    ORDER BY sa.date DESC, sa.created_at DESC
  `).all() as Record<string, unknown>[];
}

export function getStockAdjustment(
  businessId: string,
  userId: string,
  adjustmentId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const adjustment = sqlite.prepare(`
    SELECT sa.*, i.name AS item_name, i.sku, i.unit_name,
      i.inventory_asset_account_id, l.code AS location_code, l.name AS location_name,
      COALESCE((
        SELECT ABS(value_delta_minor)
        FROM inventory_movements m
        WHERE m.source_type = 'stock_adjustment' AND m.source_id = sa.id
      ), 0) AS value_minor
    FROM stock_adjustments sa
    INNER JOIN inventory_items i ON i.id = sa.item_id
    INNER JOIN inventory_locations l ON l.id = sa.location_id
    WHERE sa.id = ?
  `).get(adjustmentId) as Record<string, unknown> | undefined;
  if (!adjustment) return null;
  const journal = sqlite.prepare(`
    SELECT id, entry_number
    FROM journal_entries
    WHERE source_type = 'stock_adjustment' AND source_id = ?
  `).get(adjustmentId) as { id: string; entry_number: string } | undefined;
  return { adjustment, journal: journal ?? null };
}

function postAdjustment(
  sqlite: Sqlite,
  adjustment: {
    id: string;
    number: string;
    date: string;
    locationId: string;
    itemId: string;
    quantityDelta: number;
    reason: string;
    projectId: string | null;
    unitCostMinor: number | null;
    createdAt: string;
  },
  replace: boolean,
) {
  const item = sqlite.prepare(`
    SELECT name, unit_name, inventory_asset_account_id
    FROM inventory_items
    WHERE id = ?
  `).get(adjustment.itemId) as {
    name: string;
    unit_name: string;
    inventory_asset_account_id: string;
  } | undefined;
  if (!item?.inventory_asset_account_id) {
    throw new Error("Inventory Asset account is not configured.");
  }
  const settings = sqlite.prepare(`
    SELECT inventory_adjustment_account_id
    FROM business_accounting_settings
    WHERE id = 'default'
  `).get() as { inventory_adjustment_account_id: string } | undefined;
  if (!settings?.inventory_adjustment_account_id) {
    throw new Error("Inventory Adjustment account is not configured.");
  }

  const balance = getStockBalance(sqlite, adjustment.itemId, adjustment.locationId);
  const opening = adjustment.reason.toLowerCase() === "opening balance";
  let value: number;
  let unitCostMicros: number;
  if (adjustment.quantityDelta > 0) {
    if (opening) {
      if (adjustment.unitCostMinor == null || adjustment.unitCostMinor <= 0) {
        throw new Error("Opening Balance requires a unit cost greater than zero.");
      }
      value = receivedValueMinor(adjustment.quantityDelta, adjustment.unitCostMinor);
      unitCostMicros = unitCostMinorToMicros(adjustment.unitCostMinor);
    } else {
      if (balance.quantityMicros <= 0 || balance.valueMinor <= 0) {
        throw new Error("Use Opening Balance with a unit cost when no valued stock exists.");
      }
      value = valueAtAverageCostMinor(balance, adjustment.quantityDelta);
      unitCostMicros = averageUnitCostMicros(balance.valueMinor, balance.quantityMicros);
    }
  } else {
    const quantity = -adjustment.quantityDelta;
    if (quantity > balance.quantityMicros) {
      throw new Error(
        `Cannot adjust out ${quantityMicrosToInput(quantity)} ${item.unit_name}. `
        + `Only ${quantityMicrosToInput(balance.quantityMicros)} ${item.unit_name} are available.`,
      );
    }
    value = issueValueMinor(balance, quantity);
    unitCostMicros = averageUnitCostMicros(value, quantity);
  }

  const positive = adjustment.quantityDelta > 0;
  insertInventoryMovement(sqlite, {
    date: adjustment.date,
    itemId: adjustment.itemId,
    locationId: adjustment.locationId,
    movementType: opening ? "opening_balance" : positive ? "adjustment_in" : "adjustment_out",
    quantityDeltaMicros: adjustment.quantityDelta,
    unitCostMicros,
    valueDeltaMinor: positive ? value : -value,
    sourceType: "stock_adjustment",
    sourceId: adjustment.id,
    projectId: adjustment.projectId,
    description: `${adjustment.number} · ${adjustment.reason}`,
    createdAt: adjustment.createdAt,
  });

  const lines = positive
    ? [
        {
          accountId: item.inventory_asset_account_id,
          description: `Inventory adjustment ${adjustment.number}`,
          debitMinor: value,
          reference: adjustment.number,
        },
        {
          accountId: settings.inventory_adjustment_account_id,
          description: adjustment.reason,
          creditMinor: value,
          projectId: adjustment.projectId,
          reference: adjustment.number,
        },
      ]
    : [
        {
          accountId: settings.inventory_adjustment_account_id,
          description: adjustment.reason,
          debitMinor: value,
          projectId: adjustment.projectId,
          reference: adjustment.number,
        },
        {
          accountId: item.inventory_asset_account_id,
          description: `Inventory adjustment ${adjustment.number}`,
          creditMinor: value,
          reference: adjustment.number,
        },
      ];
  postTransaction(sqlite, {
    sourceType: "stock_adjustment",
    sourceId: adjustment.id,
    date: adjustment.date,
    description: `Stock Adjustment ${adjustment.number}`,
    lines,
    replace,
  });
}

export function saveStockAdjustment(
  businessId: string,
  userId: string,
  input: StockAdjustmentInput,
  intent: InventoryDocumentIntent,
  adjustmentId?: string,
) {
  const data = stockAdjustmentInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const quantityDelta = parseSignedQuantity(data.quantityChange);
  const unitCostMinor = data.unitCost
    ? parseMoneyToMinor(data.unitCost, "Unit cost")
    : null;
  const now = new Date().toISOString();
  const id = adjustmentId ?? randomUUID();

  context.sqlite.transaction(() => {
    const item = context.sqlite
      .prepare("SELECT id FROM inventory_items WHERE id = ? AND is_active = 1")
      .get(data.itemId);
    if (!item) throw new Error("Choose an active inventory item.");
    const location = context.sqlite
      .prepare("SELECT id FROM inventory_locations WHERE id = ? AND is_active = 1")
      .get(data.locationId);
    if (!location) throw new Error("Choose an active inventory location.");
    validateProjectReferences(context.sqlite, {
      headerProjectId: data.projectId,
      lineProjectIds: [],
    });

    let number: string;
    let wasPosted = false;
    let shouldPost = intent === "post";
    let oldMovement: { item_id: string; location_id: string } | undefined;
    if (adjustmentId) {
      const current = context.sqlite.prepare(`
        SELECT adjustment_number, document_status
        FROM stock_adjustments
        WHERE id = ?
      `).get(adjustmentId) as {
        adjustment_number: string;
        document_status: InventoryDocumentStatus;
      } | undefined;
      if (!current) throw new Error("Stock Adjustment not found.");
      if (current.document_status === "void") {
        throw new Error("A void Stock Adjustment cannot be edited.");
      }
      number = current.adjustment_number;
      wasPosted = current.document_status === "posted";
      shouldPost = wasPosted || intent === "post";
      if (wasPosted) {
        assertInventorySourceIsLatest(
          context.sqlite,
          "stock_adjustment",
          adjustmentId,
          EDIT_INVENTORY_CHRONOLOGY_ERROR,
        );
        oldMovement = context.sqlite.prepare(`
          SELECT item_id, location_id
          FROM inventory_movements
          WHERE source_type = 'stock_adjustment' AND source_id = ?
        `).get(adjustmentId) as { item_id: string; location_id: string } | undefined;
        if (!oldMovement) {
          throw new Error("The posted Stock Adjustment movement could not be found.");
        }
      }
    } else {
      number = allocateNumber(context.sqlite, "stockAdjustment");
    }

    if (shouldPost) {
      assertInventoryPostingOrder(
        context.sqlite,
        data.date,
        [{ itemId: data.itemId, locationId: data.locationId }],
        wasPosted ? { sourceType: "stock_adjustment", sourceId: id } : undefined,
      );
    }
    if (wasPosted && oldMovement) {
      deleteSourceMovements(context.sqlite, "stock_adjustment", id);
      const replacementQuantity = oldMovement.item_id === data.itemId
        && oldMovement.location_id === data.locationId
        ? quantityDelta
        : 0;
      const nextOldBalance = getStockBalance(
        context.sqlite,
        oldMovement.item_id,
        oldMovement.location_id,
      ).quantityMicros + replacementQuantity;
      if (nextOldBalance < 0) {
        throw new Error("Cannot edit this Stock Adjustment because the stock has already been consumed.");
      }
    }

    if (adjustmentId) {
      context.sqlite.prepare(`
        UPDATE stock_adjustments
        SET date = ?, location_id = ?, item_id = ?, quantity_delta_micros = ?,
          unit_cost_minor = ?, reason = ?, project_id = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.date,
        data.locationId,
        data.itemId,
        quantityDelta,
        unitCostMinor,
        data.reason,
        data.projectId || null,
        data.notes || null,
        now,
        adjustmentId,
      );
    } else {
      context.sqlite.prepare(`
        INSERT INTO stock_adjustments (
          id, adjustment_number, date, location_id, item_id, quantity_delta_micros,
          unit_cost_minor, reason, project_id, notes, document_status, created_by,
          created_at, updated_at, posted_at, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL, NULL)
      `).run(
        id,
        number,
        data.date,
        data.locationId,
        data.itemId,
        quantityDelta,
        unitCostMinor,
        data.reason,
        data.projectId || null,
        data.notes || null,
        userId,
        now,
        now,
      );
    }

    if (shouldPost) {
      postAdjustment(context.sqlite, {
        id,
        number,
        date: data.date,
        locationId: data.locationId,
        itemId: data.itemId,
        quantityDelta,
        reason: data.reason,
        projectId: data.projectId || null,
        unitCostMinor,
        createdAt: now,
      }, wasPosted);
      context.sqlite.prepare(`
        UPDATE stock_adjustments
        SET document_status = 'posted', posted_at = COALESCE(posted_at, ?)
        WHERE id = ?
      `).run(now, id);
    }
  }).immediate();

  return id;
}

export function voidStockAdjustment(
  businessId: string,
  userId: string,
  adjustmentId: string,
) {
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  context.sqlite.transaction(() => {
    const adjustment = context.sqlite.prepare(`
      SELECT adjustment_number, date, location_id, item_id, project_id, document_status
      FROM stock_adjustments
      WHERE id = ?
    `).get(adjustmentId) as {
      adjustment_number: string;
      date: string;
      location_id: string;
      item_id: string;
      project_id: string | null;
      document_status: InventoryDocumentStatus;
    } | undefined;
    if (!adjustment) throw new Error("Stock Adjustment not found.");
    if (adjustment.document_status !== "posted") {
      throw new Error("Only a posted Stock Adjustment can be voided.");
    }
    assertInventorySourceIsLatest(
      context.sqlite,
      "stock_adjustment",
      adjustmentId,
      VOID_INVENTORY_CHRONOLOGY_ERROR,
    );

    const movement = context.sqlite.prepare(`
      SELECT quantity_delta_micros, unit_cost_micros, value_delta_minor
      FROM inventory_movements
      WHERE source_type = 'stock_adjustment' AND source_id = ?
    `).get(adjustmentId) as {
      quantity_delta_micros: number;
      unit_cost_micros: number;
      value_delta_minor: number;
    } | undefined;
    if (!movement) throw new Error("The original stock movement could not be found.");

    const reverseQuantity = -movement.quantity_delta_micros;
    if (
      reverseQuantity < 0
      && getStockBalance(context.sqlite, adjustment.item_id, adjustment.location_id).quantityMicros
        < -reverseQuantity
    ) {
      throw new Error("Cannot void this Stock Adjustment because the stock has already been consumed.");
    }
    insertInventoryMovement(context.sqlite, {
      date: adjustment.date,
      itemId: adjustment.item_id,
      locationId: adjustment.location_id,
      movementType: reverseQuantity > 0 ? "adjustment_in" : "adjustment_out",
      quantityDeltaMicros: reverseQuantity,
      unitCostMicros: movement.unit_cost_micros,
      valueDeltaMinor: -movement.value_delta_minor,
      sourceType: "stock_adjustment_void",
      sourceId: adjustmentId,
      projectId: adjustment.project_id,
      description: `Void ${adjustment.adjustment_number}`,
      createdAt: now,
    });
    reverseTransaction(context.sqlite, {
      originalSourceType: "stock_adjustment",
      originalSourceId: adjustmentId,
      reversalSourceType: "stock_adjustment_void",
      reversalSourceId: adjustmentId,
      date: now.slice(0, 10),
      description: `Void Stock Adjustment ${adjustment.adjustment_number}`,
    });
    context.sqlite.prepare(`
      UPDATE stock_adjustments
      SET document_status = 'void', voided_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, adjustmentId);
  }).immediate();
}

export function deleteStockAdjustment(
  businessId: string,
  userId: string,
  adjustmentId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const adjustment = sqlite
    .prepare("SELECT document_status FROM stock_adjustments WHERE id = ?")
    .get(adjustmentId) as { document_status: string } | undefined;
  if (!adjustment) throw new Error("Stock Adjustment not found.");
  if (adjustment.document_status !== "draft") {
    throw new Error("Only draft Stock Adjustments can be deleted.");
  }
  sqlite.prepare("DELETE FROM stock_adjustments WHERE id = ?").run(adjustmentId);
}

export function stockAdjustmentToInput(
  record: NonNullable<ReturnType<typeof getStockAdjustment>>,
): StockAdjustmentInput {
  const adjustment = record.adjustment;
  return {
    date: String(adjustment.date),
    locationId: String(adjustment.location_id),
    itemId: String(adjustment.item_id),
    quantityChange: quantityMicrosToInput(Number(adjustment.quantity_delta_micros)),
    unitCost: adjustment.unit_cost_minor == null
      ? ""
      : minorToInput(Number(adjustment.unit_cost_minor)),
    reason: String(adjustment.reason),
    projectId: String(adjustment.project_id ?? ""),
    notes: String(adjustment.notes ?? ""),
  };
}
