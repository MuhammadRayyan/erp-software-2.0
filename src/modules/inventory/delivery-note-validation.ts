import type Database from "better-sqlite3";

export type DeliveryLineForValidation = {
  itemId: string;
  quantityMicros: number;
  salesInvoiceLineId: string | null;
};

export function validateDeliveryNoteSource(
  sqlite: Database.Database,
  input: {
    customerId: string;
    salesInvoiceId: string | null;
    lines: readonly DeliveryLineForValidation[];
  },
  deliveryId?: string,
) {
  if (!sqlite.inTransaction) {
    throw new Error("Delivery Note source validation must run inside a database transaction.");
  }

  if (!input.salesInvoiceId) {
    if (input.lines.some((line) => line.salesInvoiceLineId)) {
      throw new Error("Remove Sales Invoice line links or choose the matching Sales Invoice.");
    }
    return;
  }

  const invoice = sqlite.prepare(`
    SELECT customer_id, document_status
    FROM sales_invoices
    WHERE id = ?
  `).get(input.salesInvoiceId) as {
    customer_id: string;
    document_status: string;
  } | undefined;
  if (!invoice || invoice.customer_id !== input.customerId) {
    throw new Error("Choose a Sales Invoice for the selected customer.");
  }
  if (invoice.document_status !== "posted") {
    throw new Error("Only a posted Sales Invoice can be delivered.");
  }
  if (input.lines.some((line) => !line.salesInvoiceLineId)) {
    throw new Error("Every Delivery Note line must link to a line on the selected Sales Invoice.");
  }

  const totals = new Map<string, number>();
  for (const line of input.lines) {
    const sourceLineId = line.salesInvoiceLineId!;
    totals.set(sourceLineId, (totals.get(sourceLineId) ?? 0) + line.quantityMicros);
  }

  for (const [sourceLineId, nextQuantity] of totals) {
    const invoiceLine = sqlite.prepare(`
      SELECT sil.item_id, sil.quantity_micros, sil.invoice_id,
        COALESCE((
          SELECT SUM(dnl.quantity_micros)
          FROM delivery_note_lines dnl
          INNER JOIN delivery_notes dn
            ON dn.id = dnl.delivery_note_id AND dn.document_status = 'posted'
          WHERE dnl.sales_invoice_line_id = sil.id AND dn.id <> ?
        ), 0) AS delivered_micros
      FROM sales_invoice_lines sil
      WHERE sil.id = ?
    `).get(deliveryId ?? "", sourceLineId) as {
      item_id: string | null;
      quantity_micros: number;
      invoice_id: string;
      delivered_micros: number;
    } | undefined;
    const items = new Set(
      input.lines
        .filter((line) => line.salesInvoiceLineId === sourceLineId)
        .map((line) => line.itemId),
    );
    if (
      !invoiceLine
      || invoiceLine.invoice_id !== input.salesInvoiceId
      || items.size !== 1
      || !items.has(invoiceLine.item_id ?? "")
    ) {
      throw new Error("A Delivery Note line does not match the linked Sales Invoice.");
    }
    if (invoiceLine.delivered_micros + nextQuantity > invoiceLine.quantity_micros) {
      throw new Error("This Delivery exceeds the remaining invoiced quantity.");
    }
  }
}
