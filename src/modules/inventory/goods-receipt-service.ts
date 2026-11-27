import type { BaseStoredLine } from "@/modules/documents/document-types";
import { getBusinessDb } from "@/core/db/business";
import {
  minorToInput,
  parseMoneyToMinor,
  quantityMicrosToInput,
} from "@/modules/accounting/calculations/money";
import {
  effectiveProjectId,
  validateProjectReferences,
} from "@/modules/projects/project-validation";
import { buildDocumentListWhere } from "@/modules/documents/engine/document-sql";
import {
  deleteStockDocument,
  saveStockDocument,
  voidStockDocument,
  type StockDocumentConfig,
  type StockDocumentHeader,
} from "@/modules/documents/engine/stock-document-engine";
import type { InventoryDocumentIntent } from "./inventory-document";
import { goodsReceiptInputSchema, type GoodsReceiptInput } from "./goods-receipt-input";
import { validateGoodsReceiptSources } from "./goods-receipt-validation";
import {
  getStockBalance,
  insertInventoryMovement,
  averageUnitCostMicros,
  proportionalValueMinor,
  receivedValueMinor,
  unitCostMinorForValue,
  unitCostMinorToMicros,
} from "./inventory-valuation";
import { convertToBase } from "@/modules/currency/conversion";
import { getBaseCurrency } from "@/modules/currency/currency";

export type { InventoryDocumentIntent, InventoryDocumentStatus } from "./inventory-document";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];

export type StoredLine = BaseStoredLine & {
  purchaseInvoiceLineId: string | null;
  itemId: string;
  unitCostMinor: number;
  purchaseOrderLineId: string | null;
  /** Exact base-currency value when costed from a Purchase Invoice line. */
  valueMinor?: number;
};

type GoodsReceiptData = ReturnType<typeof goodsReceiptInputSchema.parse>;

/**
 * The Purchase Invoice debits Inventory with each item line's base-currency
 * net amount plus any non-recoverable VAT. Stock received against that line
 * must carry the same value, or Cost of Sales and the GL Inventory balance
 * drift from the stock subledger (foreign currency, discounts, rounding).
 */
function applyPurchaseInvoiceCosts(sqlite: Sqlite, lines: StoredLine[]) {
  const baseMinorUnit = getBaseCurrency(sqlite).minor_unit;
  const invoiceLine = sqlite.prepare(`
    SELECT pil.quantity_micros, pil.net_amount_minor, pil.tax_amount_minor,
      pi.currency_code, pi.exchange_rate_to_base, c.minor_unit AS currency_minor_unit,
      COALESCE(tc.is_recoverable, 1) AS is_recoverable
    FROM purchase_invoice_lines pil
    INNER JOIN purchase_invoices pi ON pi.id = pil.purchase_invoice_id
    LEFT JOIN currencies c ON c.code = pi.currency_code
    LEFT JOIN tax_codes tc ON tc.id = pil.tax_code_id
    WHERE pil.id = ?
  `);
  return lines.map((line) => {
    if (!line.purchaseInvoiceLineId) return line;
    const source = invoiceLine.get(line.purchaseInvoiceLineId) as {
      quantity_micros: number;
      net_amount_minor: number;
      tax_amount_minor: number;
      exchange_rate_to_base: string;
      currency_minor_unit: number | null;
      is_recoverable: number;
    } | undefined;
    if (!source || source.quantity_micros <= 0) return line;
    const currencyMinorUnit = source.currency_minor_unit ?? baseMinorUnit;
    const rate = source.exchange_rate_to_base || "1";
    const baseNet = convertToBase(source.net_amount_minor, currencyMinorUnit, baseMinorUnit, rate);
    const baseNonRecoverableTax = source.is_recoverable
      ? 0
      : convertToBase(source.tax_amount_minor, currencyMinorUnit, baseMinorUnit, rate);
    const valueMinor = proportionalValueMinor(baseNet + baseNonRecoverableTax, line.quantityMicros, source.quantity_micros);
    return { ...line, valueMinor, unitCostMinor: unitCostMinorForValue(valueMinor, line.quantityMicros) };
  });
}

function postMovements(
  sqlite: Sqlite,
  receipt: StockDocumentHeader,
  lines: readonly StoredLine[],
) {
  for (const line of lines) {
    const valueMinor = line.valueMinor ?? receivedValueMinor(line.quantityMicros, line.unitCostMinor);
    insertInventoryMovement(sqlite, {
      date: receipt.date,
      itemId: line.itemId,
      locationId: receipt.locationId,
      movementType: "goods_receipt",
      quantityDeltaMicros: line.quantityMicros,
      unitCostMicros: line.valueMinor === undefined
        ? unitCostMinorToMicros(line.unitCostMinor)
        : averageUnitCostMicros(valueMinor, line.quantityMicros),
      valueDeltaMinor: valueMinor,
      sourceType: "goods_receipt",
      sourceId: receipt.id,
      sourceLineId: line.id,
      projectId: effectiveProjectId(line.projectId, receipt.projectId),
      description: receipt.number,
      createdAt: new Date(Date.parse(receipt.createdAt) + line.lineIndex).toISOString(),
    });
  }
}

export const goodsReceiptDocument: StockDocumentConfig<GoodsReceiptData, StoredLine, { item_id: string; location_id: string }[]> = {
  sourceType: "goods_receipt",
  label: "Goods Receipt",
  pluralLabel: "Goods Receipts",
  lockLabel: "Goods receipt",
  schema: goodsReceiptInputSchema,
  table: "goods_receipts",
  numberColumn: "receipt_number",
  numbering: "goodsReceipt",
  lines: {
    table: "goods_receipt_lines",
    parentColumn: "goods_receipt_id",
    columns: {
      item_id: (line) => line.itemId,
      description: (line) => line.description,
      quantity_micros: (line) => line.quantityMicros,
      unit_cost_minor: (line) => line.unitCostMinor,
      project_id: (line) => line.projectId,
      purchase_order_line_id: (line) => line.purchaseOrderLineId,
      purchase_invoice_line_id: (line) => line.purchaseInvoiceLineId,
      position: (line) => line.lineIndex,
    },
  },
  direction: "in",
  movementType: "goods_receipt",
  missingMovementMessage: "The original Goods Receipt movement could not be found.",
  headerColumns: (data) => ({
    supplier_id: data.supplierId,
    purchase_order_id: data.purchaseOrderId || null,
    purchase_invoice_id: data.purchaseInvoiceId || null,
    date: data.date,
    location_id: data.locationId,
    reference: data.reference || null,
    project_id: data.projectId || null,
    notes: data.notes || null,
  }),
  validateHeader(sqlite, data) {
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
  },
  prepareLine: (line, base) => ({
    ...base,
    unitPriceMinor: 0,
    netAmountMinor: 0,
    taxCodeId: "",
    taxAmountMinor: 0,
    grossAmountMinor: 0,
    unitCostMinor: parseMoneyToMinor(line.unitCost, "Unit cost"),
    purchaseOrderLineId: line.purchaseOrderLineId || null,
    purchaseInvoiceLineId: line.purchaseInvoiceLineId || null,
  }),
  validateSources(sqlite, data, lines, receiptId) {
    validateGoodsReceiptSources(sqlite, {
      supplierId: data.supplierId,
      purchaseOrderId: data.purchaseOrderId || null,
      purchaseInvoiceId: data.purchaseInvoiceId || null,
      lines,
    }, receiptId);
  },
  valueLines: applyPurchaseInvoiceCosts,
  loadPostedState(sqlite, receiptId) {
    const oldMovements = sqlite.prepare(`
      SELECT item_id, location_id
      FROM inventory_movements
      WHERE source_type = 'goods_receipt' AND source_id = ?
    `).all(receiptId) as { item_id: string; location_id: string }[];
    if (!oldMovements.length) {
      throw new Error("The posted Goods Receipt movements could not be found.");
    }
    return oldMovements;
  },
  /** Re-posting must not leave any item/location the receipt touched with negative stock. */
  afterMovementsRemoved(sqlite, oldMovements, lines, data) {
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
      const nextQuantity = getStockBalance(sqlite, itemId, locationId).quantityMicros
        + (incoming.get(key) ?? 0);
      if (nextQuantity < 0) {
        throw new Error("Cannot edit this Goods Receipt because some received stock has already been consumed.");
      }
    }
  },
  post: (sqlite, header, lines) => postMovements(sqlite, header, lines),
  beforeVoidLine(sqlite, line, receipt) {
    const balance = getStockBalance(sqlite, line.item_id, receipt.location_id);
    if (balance.quantityMicros < line.quantity_micros) {
      throw new Error("Cannot void this Goods Receipt because the stock has already been consumed.");
    }
  },
};

export function listGoodsReceipts(
  businessId: string,
  userId: string,
  filters?: { supplierId?: string; from?: string; to?: string }
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const { whereClause, params } = buildDocumentListWhere("gr", { partyId: filters?.supplierId, from: filters?.from, to: filters?.to }, { party: "supplier_id", date: "date" });

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
    ${whereClause}
    ORDER BY gr.date DESC, gr.created_at DESC
  `).all(...params) as Record<string, unknown>[];
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
  return saveStockDocument(goodsReceiptDocument, businessId, userId, input, intent, receiptId);
}

export function voidGoodsReceipt(businessId: string, userId: string, receiptId: string) {
  voidStockDocument(goodsReceiptDocument, businessId, userId, receiptId);
}

export function deleteGoodsReceipt(businessId: string, userId: string, receiptId: string) {
  deleteStockDocument(goodsReceiptDocument, businessId, userId, receiptId);
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
