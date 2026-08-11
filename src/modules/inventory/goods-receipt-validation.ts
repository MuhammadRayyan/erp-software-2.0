import type Database from "better-sqlite3";

export type GoodsReceiptLineForValidation = {
  itemId: string;
  quantityMicros: number;
  purchaseOrderLineId: string | null;
  purchaseInvoiceLineId: string | null;
};

type GoodsReceiptSourceInput = {
  supplierId: string;
  purchaseOrderId: string | null;
  purchaseInvoiceId: string | null;
  lines: readonly GoodsReceiptLineForValidation[];
};

function totalsBySourceLine(
  lines: readonly GoodsReceiptLineForValidation[],
  key: "purchaseOrderLineId" | "purchaseInvoiceLineId",
) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const sourceLineId = line[key];
    if (!sourceLineId) continue;
    totals.set(sourceLineId, (totals.get(sourceLineId) ?? 0) + line.quantityMicros);
  }
  return totals;
}

export function validateGoodsReceiptSources(
  sqlite: Database.Database,
  input: GoodsReceiptSourceInput,
  receiptId?: string,
) {
  if (!sqlite.inTransaction) {
    throw new Error("Goods Receipt source validation must run inside a database transaction.");
  }

  if (input.purchaseOrderId) {
    const order = sqlite.prepare(`
      SELECT supplier_id, status
      FROM purchase_orders
      WHERE id = ?
    `).get(input.purchaseOrderId) as { supplier_id: string; status: string } | undefined;
    if (!order || order.supplier_id !== input.supplierId) {
      throw new Error("Choose a Purchase Order for the selected supplier.");
    }
    if (order.status !== "issued") {
      throw new Error("Only an issued Purchase Order can be received.");
    }

    const totals = totalsBySourceLine(input.lines, "purchaseOrderLineId");
    if (totals.size !== input.lines.length && input.lines.some((line) => !line.purchaseOrderLineId)) {
      throw new Error("Every Goods Receipt line must link to a line on the selected Purchase Order.");
    }
    for (const [sourceLineId, nextQuantity] of totals) {
      const orderLine = sqlite.prepare(`
        SELECT pol.item_id, pol.quantity_micros, pol.purchase_order_id,
          COALESCE((
            SELECT SUM(grl.quantity_micros)
            FROM goods_receipt_lines grl
            INNER JOIN goods_receipts gr
              ON gr.id = grl.goods_receipt_id AND gr.document_status = 'posted'
            WHERE grl.purchase_order_line_id = pol.id AND gr.id <> ?
          ), 0) AS received_micros
        FROM purchase_order_lines pol
        WHERE pol.id = ?
      `).get(receiptId ?? "", sourceLineId) as {
        item_id: string | null;
        quantity_micros: number;
        purchase_order_id: string;
        received_micros: number;
      } | undefined;
      const items = new Set(
        input.lines
          .filter((line) => line.purchaseOrderLineId === sourceLineId)
          .map((line) => line.itemId),
      );
      if (
        !orderLine
        || orderLine.purchase_order_id !== input.purchaseOrderId
        || items.size !== 1
        || !items.has(orderLine.item_id ?? "")
      ) {
        throw new Error("A Goods Receipt line does not match the linked Purchase Order.");
      }
      if (orderLine.received_micros + nextQuantity > orderLine.quantity_micros) {
        throw new Error("This Goods Receipt exceeds the remaining Purchase Order quantity.");
      }
    }
  } else if (input.lines.some((line) => line.purchaseOrderLineId)) {
    throw new Error("Remove Purchase Order line links or choose the matching Purchase Order.");
  }

  if (input.purchaseInvoiceId) {
    const invoice = sqlite.prepare(`
      SELECT supplier_id, document_status
      FROM purchase_invoices
      WHERE id = ?
    `).get(input.purchaseInvoiceId) as {
      supplier_id: string;
      document_status: string;
    } | undefined;
    if (!invoice || invoice.supplier_id !== input.supplierId) {
      throw new Error("Choose a Purchase Invoice for the selected supplier.");
    }
    if (invoice.document_status !== "posted") {
      throw new Error("Only a posted Purchase Invoice can be received.");
    }

    if (input.lines.some((line) => !line.purchaseInvoiceLineId)) {
      throw new Error("Every Goods Receipt line must link to a line on the selected Purchase Invoice.");
    }
    for (const [sourceLineId] of totalsBySourceLine(input.lines, "purchaseInvoiceLineId")) {
      const invoiceLine = sqlite.prepare(`
        SELECT item_id, purchase_invoice_id
        FROM purchase_invoice_lines
        WHERE id = ?
      `).get(sourceLineId) as {
        item_id: string | null;
        purchase_invoice_id: string;
      } | undefined;
      const items = new Set(
        input.lines
          .filter((line) => line.purchaseInvoiceLineId === sourceLineId)
          .map((line) => line.itemId),
      );
      if (
        !invoiceLine
        || invoiceLine.purchase_invoice_id !== input.purchaseInvoiceId
        || items.size !== 1
        || !items.has(invoiceLine.item_id ?? "")
      ) {
        throw new Error("A Goods Receipt line does not match the linked Purchase Invoice.");
      }
    }
  } else if (input.lines.some((line) => line.purchaseInvoiceLineId)) {
    throw new Error("Remove Purchase Invoice line links or choose the matching Purchase Invoice.");
  }
}
