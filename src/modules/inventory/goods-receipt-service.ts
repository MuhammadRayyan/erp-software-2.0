import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import {
  minorToInput,
  parseMoneyToMinor,
  parseQuantityToMicros,
  quantityMicrosToInput,
} from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import {
  effectiveProjectId,
  validateProjectReferences,
} from "@/modules/projects/project-validation";
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
import { goodsReceiptInputSchema, type GoodsReceiptInput } from "./goods-receipt-input";
import { validateGoodsReceiptSources } from "./goods-receipt-validation";
import {
  deleteSourceMovements,
  getStockBalance,
  insertInventoryMovement,
  receivedValueMinor,
  unitCostMinorToMicros,
} from "./inventory-valuation";

export type { InventoryDocumentIntent, InventoryDocumentStatus } from "./inventory-document";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];

type StoredLine = {
  id: string;
  itemId: string;
  description: string;
  quantityMicros: number;
  unitCostMinor: number;
  projectId: string | null;
  purchaseOrderLineId: string | null;
  purchaseInvoiceLineId: string | null;
  position: number;
};

function prepareLines(
  sqlite: Sqlite,
  data: ReturnType<typeof goodsReceiptInputSchema.parse>,
) {
  const itemIds = new Set(
    (sqlite.prepare("SELECT id FROM inventory_items WHERE is_active = 1").all() as { id: string }[])
      .map((item) => item.id),
  );
  return data.lines.map((line, position): StoredLine => {
    if (!itemIds.has(line.itemId)) throw new Error("Choose an active inventory item.");
    return {
      id: randomUUID(),
      itemId: line.itemId,
      description: line.description,
      quantityMicros: parseQuantityToMicros(line.quantity),
      unitCostMinor: parseMoneyToMinor(line.unitCost, "Unit cost"),
      projectId: line.projectId || null,
      purchaseOrderLineId: line.purchaseOrderLineId || null,
      purchaseInvoiceLineId: line.purchaseInvoiceLineId || null,
      position,
    };
  });
}

function validateHeader(
  sqlite: Sqlite,
  data: ReturnType<typeof goodsReceiptInputSchema.parse>,
) {
  const supplier = sqlite
    .prepare("SELECT id FROM suppliers WHERE id = ? AND is_active = 1")
    .get(data.supplierId);
  if (!supplier) throw new Error("Choose an active supplier.");

  const location = sqlite
    .prepare("SELECT id FROM inventory_locations WHERE id = ? AND is_active = 1")
    .get(data.locationId);
  if (!location) throw new Error("Choose an active inventory location.");

  validateProjectReferences(sqlite, {
    headerProjectId: data.projectId,
    lineProjectIds: data.lines.map((line) => line.projectId),
  });
}

function insertLines(sqlite: Sqlite, receiptId: string, lines: readonly StoredLine[]) {
  const insert = sqlite.prepare(`
    INSERT INTO goods_receipt_lines (
      id, goods_receipt_id, item_id, description, quantity_micros, unit_cost_minor,
      project_id, purchase_order_line_id, purchase_invoice_line_id, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of lines) {
    insert.run(
      line.id,
      receiptId,
      line.itemId,
      line.description,
      line.quantityMicros,
      line.unitCostMinor,
      line.projectId,
      line.purchaseOrderLineId,
      line.purchaseInvoiceLineId,
      line.position,
    );
  }
}

function postMovements(
  sqlite: Sqlite,
  receipt: {
    id: string;
    receiptNumber: string;
    date: string;
    locationId: string;
    projectId: string | null;
    createdAt: string;
  },
  lines: readonly StoredLine[],
) {
  for (const line of lines) {
    const valueMinor = receivedValueMinor(line.quantityMicros, line.unitCostMinor);
    insertInventoryMovement(sqlite, {
      date: receipt.date,
      itemId: line.itemId,
      locationId: receipt.locationId,
      movementType: "goods_receipt",
      quantityDeltaMicros: line.quantityMicros,
      unitCostMicros: unitCostMinorToMicros(line.unitCostMinor),
      valueDeltaMinor: valueMinor,
      sourceType: "goods_receipt",
      sourceId: receipt.id,
      sourceLineId: line.id,
      projectId: effectiveProjectId(line.projectId, receipt.projectId),
      description: receipt.receiptNumber,
      createdAt: new Date(Date.parse(receipt.createdAt) + line.position).toISOString(),
    });
  }
}

export function listGoodsReceipts(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT gr.*, s.name AS supplier_name, l.code AS location_code,
      COALESCE((
        SELECT SUM(grl.quantity_micros)
        FROM goods_receipt_lines grl
        WHERE grl.goods_receipt_id = gr.id
      ), 0) AS quantity_micros,
      COALESCE((
        SELECT SUM(im.value_delta_minor)
        FROM inventory_movements im
        WHERE im.source_type = 'goods_receipt' AND im.source_id = gr.id
      ), 0) AS value_minor
    FROM goods_receipts gr
    INNER JOIN suppliers s ON s.id = gr.supplier_id
    INNER JOIN inventory_locations l ON l.id = gr.location_id
    ORDER BY gr.date DESC, gr.created_at DESC
  `).all() as Record<string, unknown>[];
}

export function getGoodsReceipt(businessId: string, userId: string, receiptId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const receipt = sqlite.prepare(`
    SELECT gr.*, s.name AS supplier_name, l.code AS location_code, l.name AS location_name,
      po.order_number, pi.internal_number
    FROM goods_receipts gr
    INNER JOIN suppliers s ON s.id = gr.supplier_id
    INNER JOIN inventory_locations l ON l.id = gr.location_id
    LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
    LEFT JOIN purchase_invoices pi ON pi.id = gr.purchase_invoice_id
    WHERE gr.id = ?
  `).get(receiptId) as (Record<string, unknown> & { notes: string | null }) | undefined;
  if (!receipt) return null;
  const lines = sqlite.prepare(`
    SELECT grl.*, i.sku, i.name AS item_name, i.unit_name,
      COALESCE((
        SELECT value_delta_minor
        FROM inventory_movements im
        WHERE im.source_type = 'goods_receipt' AND im.source_line_id = grl.id
      ), 0) AS value_minor
    FROM goods_receipt_lines grl
    INNER JOIN inventory_items i ON i.id = grl.item_id
    WHERE grl.goods_receipt_id = ?
    ORDER BY grl.position
  `).all(receiptId) as Record<string, unknown>[];
  return { receipt, lines };
}

export function saveGoodsReceipt(
  businessId: string,
  userId: string,
  input: GoodsReceiptInput,
  intent: InventoryDocumentIntent,
  receiptId?: string,
) {
  const data = goodsReceiptInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const id = receiptId ?? randomUUID();

  context.sqlite.transaction(() => {
    validateHeader(context.sqlite, data);
    const lines = prepareLines(context.sqlite, data);
    validateGoodsReceiptSources(context.sqlite, {
      supplierId: data.supplierId,
      purchaseOrderId: data.purchaseOrderId || null,
      purchaseInvoiceId: data.purchaseInvoiceId || null,
      lines,
    }, receiptId);

    let receiptNumber: string;
    let wasPosted = false;
    let shouldPost = intent === "post";
    let oldMovements: { item_id: string; location_id: string }[] = [];

    if (receiptId) {
      const current = context.sqlite.prepare(`
        SELECT receipt_number, document_status
        FROM goods_receipts
        WHERE id = ?
      `).get(receiptId) as {
        receipt_number: string;
        document_status: InventoryDocumentStatus;
      } | undefined;
      if (!current) throw new Error("Goods Receipt not found.");
      if (current.document_status === "void") {
        throw new Error("A void Goods Receipt cannot be edited.");
      }

      receiptNumber = current.receipt_number;
      wasPosted = current.document_status === "posted";
      shouldPost = wasPosted || intent === "post";
      if (wasPosted) {
        assertInventorySourceIsLatest(
          context.sqlite,
          "goods_receipt",
          receiptId,
          EDIT_INVENTORY_CHRONOLOGY_ERROR,
        );
        oldMovements = context.sqlite.prepare(`
          SELECT item_id, location_id
          FROM inventory_movements
          WHERE source_type = 'goods_receipt' AND source_id = ?
        `).all(receiptId) as { item_id: string; location_id: string }[];
        if (!oldMovements.length) {
          throw new Error("The posted Goods Receipt movements could not be found.");
        }
      }
    } else {
      receiptNumber = allocateNumber(context.sqlite, "goodsReceipt");
    }

    if (shouldPost) {
      assertInventoryPostingOrder(
        context.sqlite,
        data.date,
        lines.map((line) => ({ itemId: line.itemId, locationId: data.locationId })),
        wasPosted ? { sourceType: "goods_receipt", sourceId: id } : undefined,
      );
    }

    if (wasPosted) {
      deleteSourceMovements(context.sqlite, "goods_receipt", id);
      const affected = new Set(
        oldMovements.map((movement) => `${movement.item_id}\u0000${movement.location_id}`),
      );
      const incoming = new Map<string, number>();
      for (const line of lines) {
        const key = `${line.itemId}\u0000${data.locationId}`;
        incoming.set(key, (incoming.get(key) ?? 0) + line.quantityMicros);
        affected.add(key);
      }
      for (const key of affected) {
        const [itemId, locationId] = key.split("\u0000");
        const nextQuantity = getStockBalance(context.sqlite, itemId, locationId).quantityMicros
          + (incoming.get(key) ?? 0);
        if (nextQuantity < 0) {
          throw new Error("Cannot edit this Goods Receipt because some received stock has already been consumed.");
        }
      }
    }

    if (receiptId) {
      context.sqlite.prepare(`
        UPDATE goods_receipts
        SET supplier_id = ?, purchase_order_id = ?, purchase_invoice_id = ?, date = ?,
          location_id = ?, reference = ?, project_id = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.supplierId,
        data.purchaseOrderId || null,
        data.purchaseInvoiceId || null,
        data.date,
        data.locationId,
        data.reference || null,
        data.projectId || null,
        data.notes || null,
        now,
        receiptId,
      );
      context.sqlite.prepare("DELETE FROM goods_receipt_lines WHERE goods_receipt_id = ?").run(receiptId);
    } else {
      context.sqlite.prepare(`
        INSERT INTO goods_receipts (
          id, receipt_number, supplier_id, purchase_order_id, purchase_invoice_id, date,
          location_id, reference, project_id, notes, document_status, created_by,
          created_at, updated_at, posted_at, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL, NULL)
      `).run(
        id,
        receiptNumber,
        data.supplierId,
        data.purchaseOrderId || null,
        data.purchaseInvoiceId || null,
        data.date,
        data.locationId,
        data.reference || null,
        data.projectId || null,
        data.notes || null,
        userId,
        now,
        now,
      );
    }

    insertLines(context.sqlite, id, lines);
    if (shouldPost) {
      postMovements(context.sqlite, {
        id,
        receiptNumber,
        date: data.date,
        locationId: data.locationId,
        projectId: data.projectId || null,
        createdAt: now,
      }, lines);
      context.sqlite.prepare(`
        UPDATE goods_receipts
        SET document_status = 'posted', posted_at = COALESCE(posted_at, ?)
        WHERE id = ?
      `).run(now, id);
    }
  }).immediate();

  return id;
}

export function voidGoodsReceipt(businessId: string, userId: string, receiptId: string) {
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  context.sqlite.transaction(() => {
    const receipt = context.sqlite.prepare(`
      SELECT receipt_number, date, location_id, project_id, document_status
      FROM goods_receipts
      WHERE id = ?
    `).get(receiptId) as {
      receipt_number: string;
      date: string;
      location_id: string;
      project_id: string | null;
      document_status: InventoryDocumentStatus;
    } | undefined;
    if (!receipt) throw new Error("Goods Receipt not found.");
    if (receipt.document_status !== "posted") {
      throw new Error("Only a posted Goods Receipt can be voided.");
    }
    assertInventorySourceIsLatest(
      context.sqlite,
      "goods_receipt",
      receiptId,
      VOID_INVENTORY_CHRONOLOGY_ERROR,
    );

    const lines = context.sqlite.prepare(`
      SELECT grl.id, grl.item_id, grl.quantity_micros, grl.project_id,
        im.unit_cost_micros, im.value_delta_minor
      FROM goods_receipt_lines grl
      LEFT JOIN inventory_movements im
        ON im.source_type = 'goods_receipt' AND im.source_line_id = grl.id
      WHERE grl.goods_receipt_id = ?
      ORDER BY grl.position
    `).all(receiptId) as {
      id: string;
      item_id: string;
      quantity_micros: number;
      project_id: string | null;
      unit_cost_micros: number | null;
      value_delta_minor: number | null;
    }[];

    for (const [position, line] of lines.entries()) {
      if (line.unit_cost_micros == null || line.value_delta_minor == null) {
        throw new Error("The original Goods Receipt movement could not be found.");
      }
      const balance = getStockBalance(context.sqlite, line.item_id, receipt.location_id);
      if (balance.quantityMicros < line.quantity_micros) {
        throw new Error("Cannot void this Goods Receipt because the stock has already been consumed.");
      }
      insertInventoryMovement(context.sqlite, {
        date: receipt.date,
        itemId: line.item_id,
        locationId: receipt.location_id,
        movementType: "goods_receipt",
        quantityDeltaMicros: -line.quantity_micros,
        unitCostMicros: line.unit_cost_micros,
        valueDeltaMinor: -line.value_delta_minor,
        sourceType: "goods_receipt_void",
        sourceId: receiptId,
        sourceLineId: line.id,
        projectId: line.project_id ?? receipt.project_id,
        description: `Void ${receipt.receipt_number}`,
        createdAt: new Date(Date.parse(now) + position).toISOString(),
      });
    }
    context.sqlite.prepare(`
      UPDATE goods_receipts
      SET document_status = 'void', voided_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, receiptId);
  }).immediate();
}

export function deleteGoodsReceipt(businessId: string, userId: string, receiptId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare("SELECT document_status FROM goods_receipts WHERE id = ?")
    .get(receiptId) as { document_status: string } | undefined;
  if (!row) throw new Error("Goods Receipt not found.");
  if (row.document_status !== "draft") {
    throw new Error("Only draft Goods Receipts can be deleted.");
  }
  sqlite.prepare("DELETE FROM goods_receipts WHERE id = ?").run(receiptId);
}

export function goodsReceiptToInput(
  record: NonNullable<ReturnType<typeof getGoodsReceipt>>,
): GoodsReceiptInput {
  const receipt = record.receipt;
  return {
    supplierId: String(receipt.supplier_id),
    purchaseOrderId: String(receipt.purchase_order_id ?? ""),
    purchaseInvoiceId: String(receipt.purchase_invoice_id ?? ""),
    date: String(receipt.date),
    locationId: String(receipt.location_id),
    reference: String(receipt.reference ?? ""),
    projectId: String(receipt.project_id ?? ""),
    notes: String(receipt.notes ?? ""),
    lines: record.lines.map((line) => ({
      itemId: String(line.item_id),
      description: String(line.description),
      quantity: quantityMicrosToInput(Number(line.quantity_micros)),
      unitCost: minorToInput(Number(line.unit_cost_minor)),
      projectId: String(line.project_id ?? ""),
      purchaseOrderLineId: String(line.purchase_order_line_id ?? ""),
      purchaseInvoiceLineId: String(line.purchase_invoice_line_id ?? ""),
    })),
  };
}

export function getReceiptSourceLines(
  businessId: string,
  userId: string,
  source: { orderId?: string; invoiceId?: string },
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  if (source.orderId) {
    return sqlite.prepare(`
      SELECT pol.id AS source_line_id, pol.item_id, pol.description, pol.quantity_micros,
        pol.unit_price_minor, pol.project_id, po.supplier_id,
        po.project_id AS header_project_id,
        COALESCE((
          SELECT SUM(grl.quantity_micros)
          FROM goods_receipt_lines grl
          INNER JOIN goods_receipts gr
            ON gr.id = grl.goods_receipt_id AND gr.document_status = 'posted'
          WHERE grl.purchase_order_line_id = pol.id
        ), 0) AS completed_micros
      FROM purchase_order_lines pol
      INNER JOIN purchase_orders po ON po.id = pol.purchase_order_id
      WHERE po.id = ? AND po.status = 'issued' AND pol.item_id IS NOT NULL
      ORDER BY pol.position
    `).all(source.orderId) as Record<string, unknown>[];
  }
  if (source.invoiceId) {
    return sqlite.prepare(`
      SELECT pil.id AS source_line_id, pil.item_id, pil.description, pil.quantity_micros,
        pil.unit_price_minor, pil.project_id, pi.supplier_id,
        pi.project_id AS header_project_id, 0 AS completed_micros
      FROM purchase_invoice_lines pil
      INNER JOIN purchase_invoices pi ON pi.id = pil.purchase_invoice_id
      WHERE pi.id = ? AND pi.document_status = 'posted' AND pil.item_id IS NOT NULL
      ORDER BY pil.position
    `).all(source.invoiceId) as Record<string, unknown>[];
  }
  return [];
}
