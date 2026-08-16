import { cache } from "react";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import { minorToInput, parseMoneyToMinor } from "@/modules/accounting/calculations/money";
import { inventoryItemInputSchema, type InventoryItemInput } from "./inventory-item-input";
import { averageUnitCostMicros } from "./inventory-valuation";

function validateAccounts(sqlite: ReturnType<typeof getBusinessDb>["sqlite"], data: ReturnType<typeof inventoryItemInputSchema.parse>) {
  const rows = sqlite.prepare("SELECT id, type FROM accounts WHERE id IN (?, ?, ?) AND is_active = 1")
    .all(data.salesAccountId, data.inventoryAssetAccountId, data.costOfSalesAccountId) as { id: string; type: string }[];
  const byId = new Map(rows.map((row) => [row.id, row.type]));
  if (byId.get(data.salesAccountId) !== "income") throw new Error("Choose an active Income account for sales.");
  if (byId.get(data.inventoryAssetAccountId) !== "asset") throw new Error("Choose an active Asset account for inventory.");
  if (byId.get(data.costOfSalesAccountId) !== "expense") throw new Error("Choose an active Expense account for Cost of Sales.");
}

function price(value: string | undefined, label: string) {
  return value ? parseMoneyToMinor(value, label) : null;
}

export function listInventoryItems(businessId: string, userId: string, options?: { activeOnly?: boolean; search?: string }) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions: string[] = [];
  const values: string[] = [];
  if (options?.activeOnly) conditions.push("i.is_active = 1");
  if (options?.search?.trim()) {
    conditions.push("(i.name LIKE ? OR i.sku LIKE ?)");
    values.push(`%${options.search.trim()}%`, `%${options.search.trim()}%`);
  }
  const rows = sqlite.prepare(`
    SELECT i.*,
      COALESCE(SUM(m.quantity_delta_micros), 0) AS quantity_micros,
      COALESCE(SUM(m.value_delta_minor), 0) AS value_minor,
      COALESCE((SELECT SUM(pol.quantity_micros - COALESCE((SELECT SUM(grl.quantity_micros)
        FROM goods_receipt_lines grl INNER JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
        WHERE grl.purchase_order_line_id = pol.id AND gr.document_status = 'posted'), 0))
        FROM purchase_order_lines pol INNER JOIN purchase_orders po ON po.id = pol.purchase_order_id
        WHERE pol.item_id = i.id AND po.status NOT IN ('cancelled', 'closed')), 0) AS to_receive_micros,
      COALESCE((SELECT SUM(sil.quantity_micros - COALESCE((SELECT SUM(dnl.quantity_micros)
        FROM delivery_note_lines dnl INNER JOIN delivery_notes dn ON dn.id = dnl.delivery_note_id
        WHERE dnl.sales_invoice_line_id = sil.id AND dn.document_status = 'posted'), 0))
        FROM sales_invoice_lines sil INNER JOIN sales_invoices si ON si.id = sil.invoice_id
        WHERE sil.item_id = i.id AND si.document_status = 'posted'), 0) AS to_deliver_micros
    FROM inventory_items i
    LEFT JOIN inventory_movements m ON m.item_id = i.id
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    GROUP BY i.id
    ORDER BY i.name, i.sku
  `).all(...values) as Array<Record<string, unknown> & { quantity_micros: number; value_minor: number }>;
  return rows.map((row) => ({
    ...row,
    average_unit_cost_micros: averageUnitCostMicros(row.value_minor, row.quantity_micros),
  })) as Array<Record<string, unknown> & {
    quantity_micros: number;
    value_minor: number;
    average_unit_cost_micros: number;
  }>;
}

export const listInventoryItemOptions = cache((businessId: string, userId: string) => {
  return listInventoryItems(businessId, userId, { activeOnly: true }).map((row) => ({
    id: String(row.id), sku: row.sku as string | null, name: String(row.name), unitName: String(row.unit_name),
    salesPriceMinor: row.sales_price_minor as number | null, purchasePriceMinor: row.purchase_price_minor as number | null,
    salesAccountId: String(row.sales_account_id), inventoryAssetAccountId: String(row.inventory_asset_account_id),
    costOfSalesAccountId: String(row.cost_of_sales_account_id),
  }));
});

export function getInventoryItem(businessId: string, userId: string, itemId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const item = sqlite.prepare(`
    SELECT i.*, sa.code AS sales_account_code, sa.name AS sales_account_name,
      ia.code AS asset_account_code, ia.name AS asset_account_name,
      cs.code AS cogs_account_code, cs.name AS cogs_account_name
    FROM inventory_items i
    INNER JOIN accounts sa ON sa.id = i.sales_account_id
    INNER JOIN accounts ia ON ia.id = i.inventory_asset_account_id
    INNER JOIN accounts cs ON cs.id = i.cost_of_sales_account_id
    WHERE i.id = ?
  `).get(itemId) as Record<string, unknown> | undefined;
  if (!item) return null;
  const locations = sqlite.prepare(`
    SELECT l.id, l.code, l.name,
      COALESCE(SUM(m.quantity_delta_micros), 0) AS quantity_micros,
      COALESCE(SUM(m.value_delta_minor), 0) AS value_minor
    FROM inventory_locations l
    LEFT JOIN inventory_movements m ON m.location_id = l.id AND m.item_id = ?
    GROUP BY l.id HAVING quantity_micros <> 0 OR value_minor <> 0 OR l.is_active = 1
    ORDER BY l.is_default DESC, l.code
  `).all(itemId) as { id: string; code: string; name: string; quantity_micros: number; value_minor: number }[];
  const movements = sqlite.prepare(`
    SELECT m.*, l.code AS location_code, l.name AS location_name
    FROM inventory_movements m INNER JOIN inventory_locations l ON l.id = m.location_id
    WHERE m.item_id = ? ORDER BY m.date DESC, m.created_at DESC LIMIT 100
  `).all(itemId) as Record<string, unknown>[];
  const purchases = sqlite.prepare(`
    SELECT po.id, po.order_number, po.date, po.expected_date, po.status, s.name AS supplier_name,
      pol.quantity_micros AS ordered_micros,
      COALESCE(SUM(CASE WHEN gr.document_status = 'posted' THEN grl.quantity_micros ELSE 0 END), 0) AS received_micros
    FROM purchase_order_lines pol
    INNER JOIN purchase_orders po ON po.id = pol.purchase_order_id
    INNER JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN goods_receipt_lines grl ON grl.purchase_order_line_id = pol.id
    LEFT JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
    WHERE pol.item_id = ? GROUP BY pol.id ORDER BY po.date DESC, po.created_at DESC
  `).all(itemId) as { id: string; order_number: string; date: string; expected_date: string | null; status: string; supplier_name: string; ordered_micros: number; received_micros: number }[];
  const sales = sqlite.prepare(`
    SELECT si.id, si.invoice_number, si.invoice_date, si.due_date, si.document_status, c.name AS customer_name,
      sil.quantity_micros AS required_micros,
      COALESCE(SUM(CASE WHEN dn.document_status = 'posted' THEN dnl.quantity_micros ELSE 0 END), 0) AS delivered_micros
    FROM sales_invoice_lines sil
    INNER JOIN sales_invoices si ON si.id = sil.invoice_id
    INNER JOIN customers c ON c.id = si.customer_id
    LEFT JOIN delivery_note_lines dnl ON dnl.sales_invoice_line_id = sil.id
    LEFT JOIN delivery_notes dn ON dn.id = dnl.delivery_note_id
    WHERE sil.item_id = ? GROUP BY sil.id ORDER BY si.invoice_date DESC, si.created_at DESC
  `).all(itemId) as { id: string; invoice_number: string; invoice_date: string; due_date: string; document_status: string; customer_name: string; required_micros: number; delivered_micros: number }[];
  const totalQuantity = locations.reduce((sum, row) => sum + row.quantity_micros, 0);
  const totalValue = locations.reduce((sum, row) => sum + row.value_minor, 0);
  return {
    item,
    locations: locations.map((row) => ({ ...row, average_unit_cost_micros: averageUnitCostMicros(row.value_minor, row.quantity_micros) })),
    movements,
    quantityMicros: totalQuantity,
    valueMinor: totalValue,
    averageUnitCostMicros: averageUnitCostMicros(totalValue, totalQuantity),
    toReceiveMicros: purchases.filter((row) => !["cancelled", "closed"].includes(row.status)).reduce((sum, row) => sum + Math.max(0, row.ordered_micros - row.received_micros), 0),
    toDeliverMicros: sales.filter((row) => row.document_status === "posted").reduce((sum, row) => sum + Math.max(0, row.required_micros - row.delivered_micros), 0),
    purchases,
    sales,
  };
}

export function saveInventoryItem(businessId: string, userId: string, input: InventoryItemInput, itemId?: string) {
  const data = inventoryItemInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  validateAccounts(sqlite, data);
  const duplicate = sqlite.prepare("SELECT id FROM inventory_items WHERE sku = ? COLLATE NOCASE AND id <> ?")
    .get(data.sku || null, itemId ?? "") as { id: string } | undefined;
  if (data.sku && duplicate) throw new Error("SKU already exists.");
  const now = new Date().toISOString();
  const id = itemId ?? randomUUID();
  if (itemId) {
    const current = sqlite.prepare("SELECT id FROM inventory_items WHERE id = ?").get(itemId);
    if (!current) throw new Error("Inventory item not found.");
    sqlite.prepare(`UPDATE inventory_items SET sku = ?, name = ?, description = ?, unit_name = ?,
      sales_price_minor = ?, purchase_price_minor = ?, sales_account_id = ?, inventory_asset_account_id = ?,
      cost_of_sales_account_id = ?, is_active = ?, updated_at = ? WHERE id = ?`)
      .run(data.sku || null, data.name, data.description || null, data.unitName, price(data.salesPrice, "Sales price"),
        price(data.purchasePrice, "Purchase price"), data.salesAccountId, data.inventoryAssetAccountId,
        data.costOfSalesAccountId, data.isActive ? 1 : 0, now, itemId);
  } else {
    sqlite.prepare(`INSERT INTO inventory_items (id, sku, name, description, unit_name, sales_price_minor,
      purchase_price_minor, sales_account_id, inventory_asset_account_id, cost_of_sales_account_id,
      is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, data.sku || null, data.name, data.description || null, data.unitName, price(data.salesPrice, "Sales price"),
        price(data.purchasePrice, "Purchase price"), data.salesAccountId, data.inventoryAssetAccountId,
        data.costOfSalesAccountId, data.isActive ? 1 : 0, now, now);
  }
  return id;
}

export function inventoryItemToInput(item: Record<string, unknown>): InventoryItemInput {
  return {
    sku: (item.sku as string | null) ?? "", name: String(item.name), description: (item.description as string | null) ?? "",
    unitName: String(item.unit_name), salesPrice: item.sales_price_minor == null ? "" : minorToInput(Number(item.sales_price_minor)),
    purchasePrice: item.purchase_price_minor == null ? "" : minorToInput(Number(item.purchase_price_minor)),
    salesAccountId: String(item.sales_account_id), inventoryAssetAccountId: String(item.inventory_asset_account_id),
    costOfSalesAccountId: String(item.cost_of_sales_account_id), isActive: Boolean(item.is_active),
  };
}
