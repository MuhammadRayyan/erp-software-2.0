import { getBusinessDb } from "@/core/db/business";
import { averageUnitCostMicros } from "./inventory-valuation";

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export type StockOnHandFilters = { itemId?: string; locationId?: string; activeOnly?: boolean };

export function getStockOnHandReport(businessId: string, userId: string, filters: StockOnHandFilters) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];
  if (filters.itemId) { conditions.push("i.id = ?"); values.push(filters.itemId); }
  if (filters.locationId) { conditions.push("l.id = ?"); values.push(filters.locationId); }
  if (filters.activeOnly) { conditions.push("i.is_active = 1"); }
  const rows = sqlite.prepare(`
    SELECT i.id AS item_id, i.sku, i.name AS item_name, i.unit_name, i.is_active,
           l.id AS location_id, l.code AS location_code, l.name AS location_name,
           COALESCE(SUM(m.quantity_delta_micros), 0) AS quantity_micros,
           COALESCE(SUM(m.value_delta_minor), 0) AS value_minor
    FROM inventory_items i
    CROSS JOIN inventory_locations l
    LEFT JOIN inventory_movements m ON m.item_id = i.id AND m.location_id = l.id
    WHERE ${conditions.join(" AND ")}
    GROUP BY i.id, l.id
    HAVING quantity_micros <> 0 OR value_minor <> 0
    ORDER BY i.name, l.code
  `).all(...values) as Array<{ item_id: string; sku: string | null; item_name: string; unit_name: string; is_active: number; location_id: string; location_code: string; location_name: string; quantity_micros: number; value_minor: number }>;
  return rows.map((row) => ({ ...row, average_unit_cost_micros: averageUnitCostMicros(row.value_minor, row.quantity_micros) }));
}

export type InventoryMovementFilters = { dateFrom?: string; dateTo?: string; itemId?: string; locationId?: string; movementType?: string; projectId?: string };

export function getInventoryMovementReport(businessId: string, userId: string, filters: InventoryMovementFilters) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const innerConditions: string[] = [];
  const innerValues: string[] = [];
  const dateTo = validDate(filters.dateTo);
  if (dateTo) { innerConditions.push("m.date <= ?"); innerValues.push(dateTo); }
  if (filters.itemId) { innerConditions.push("m.item_id = ?"); innerValues.push(filters.itemId); }
  if (filters.locationId) { innerConditions.push("m.location_id = ?"); innerValues.push(filters.locationId); }
  const outerConditions = ["1 = 1"];
  const outerValues: string[] = [];
  const dateFrom = validDate(filters.dateFrom);
  if (dateFrom) { outerConditions.push("movement.date >= ?"); outerValues.push(dateFrom); }
  if (filters.movementType) { outerConditions.push("movement.movement_type = ?"); outerValues.push(filters.movementType); }
  if (filters.projectId) { outerConditions.push("movement.project_id = ?"); outerValues.push(filters.projectId); }
  return sqlite.prepare(`
    SELECT movement.* FROM (
      SELECT m.*, i.sku, i.name AS item_name, i.unit_name,
             l.code AS location_code, l.name AS location_name,
             p.code AS project_code, p.name AS project_name,
             SUM(m.quantity_delta_micros) OVER (
               PARTITION BY m.item_id, m.location_id
               ORDER BY m.date, m.created_at, m.id ROWS UNBOUNDED PRECEDING
             ) AS running_quantity_micros
      FROM inventory_movements m
      INNER JOIN inventory_items i ON i.id = m.item_id
      INNER JOIN inventory_locations l ON l.id = m.location_id
      LEFT JOIN projects p ON p.id = m.project_id
      ${innerConditions.length ? `WHERE ${innerConditions.join(" AND ")}` : ""}
    ) movement
    WHERE ${outerConditions.join(" AND ")}
    ORDER BY movement.date DESC, movement.created_at DESC, movement.id DESC
  `).all(...innerValues, ...outerValues) as Array<Record<string, unknown>>;
}

export function getItemsToReceiveReport(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT pol.id AS purchase_order_line_id, po.id AS purchase_order_id, po.order_number, po.expected_date, s.name AS supplier_name,
           i.id AS item_id, i.sku, i.name AS item_name, i.unit_name,
           pol.quantity_micros AS ordered_micros,
           COALESCE(SUM(CASE WHEN gr.document_status = 'posted' THEN grl.quantity_micros ELSE 0 END), 0) AS received_micros
    FROM purchase_order_lines pol
    INNER JOIN purchase_orders po ON po.id = pol.purchase_order_id
    INNER JOIN suppliers s ON s.id = po.supplier_id
    INNER JOIN inventory_items i ON i.id = pol.item_id
    LEFT JOIN goods_receipt_lines grl ON grl.purchase_order_line_id = pol.id
    LEFT JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
    WHERE po.status = 'issued'
    GROUP BY pol.id
    HAVING received_micros < ordered_micros
    ORDER BY COALESCE(po.expected_date, po.date), po.order_number, pol.position
  `).all() as Array<{ purchase_order_line_id: string; purchase_order_id: string; order_number: string; expected_date: string | null; supplier_name: string; item_id: string; sku: string | null; item_name: string; unit_name: string; ordered_micros: number; received_micros: number }>;
}

export function getItemsToDeliverReport(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT sil.id AS sales_invoice_line_id, si.id AS sales_invoice_id, si.invoice_number, si.due_date, c.name AS customer_name,
           i.id AS item_id, i.sku, i.name AS item_name, i.unit_name,
           sil.quantity_micros AS required_micros,
           COALESCE(SUM(CASE WHEN dn.document_status = 'posted' THEN dnl.quantity_micros ELSE 0 END), 0) AS delivered_micros
    FROM sales_invoice_lines sil
    INNER JOIN sales_invoices si ON si.id = sil.invoice_id
    INNER JOIN customers c ON c.id = si.customer_id
    INNER JOIN inventory_items i ON i.id = sil.item_id
    LEFT JOIN delivery_note_lines dnl ON dnl.sales_invoice_line_id = sil.id
    LEFT JOIN delivery_notes dn ON dn.id = dnl.delivery_note_id
    WHERE si.document_status = 'posted'
    GROUP BY sil.id
    HAVING delivered_micros < required_micros
    ORDER BY si.due_date, si.invoice_number, sil.position
  `).all() as Array<{ sales_invoice_line_id: string; sales_invoice_id: string; invoice_number: string; due_date: string; customer_name: string; item_id: string; sku: string | null; item_name: string; unit_name: string; required_micros: number; delivered_micros: number }>;
}
