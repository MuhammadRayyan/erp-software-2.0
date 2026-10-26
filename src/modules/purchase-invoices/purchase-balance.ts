import type Database from "better-sqlite3";

/** Shared by invoice detail, aging and reconciliation. Aliases are code constants, never user input. */
export function purchaseSettlementSql(alias = "pi") {
  if (!/^[a-z_]+$/i.test(alias)) throw new Error("Invalid invoice alias.");
  return {
    foreign: `COALESCE((SELECT SUM(COALESCE(spa.foreign_amount_allocated, spa.amount_minor))
      FROM supplier_payment_allocations spa JOIN supplier_payments sp ON sp.id = spa.payment_id
      WHERE spa.purchase_invoice_id = ${alias}.id AND sp.document_status = 'posted'), 0)
      + COALESCE((SELECT SUM(dn.total_minor) FROM debit_notes dn
        WHERE dn.purchase_invoice_id = ${alias}.id AND dn.document_status = 'posted'), 0)`,
    base: `COALESCE((SELECT SUM(COALESCE(spa.base_carrying_amount_released, spa.amount_minor))
      FROM supplier_payment_allocations spa JOIN supplier_payments sp ON sp.id = spa.payment_id
      WHERE spa.purchase_invoice_id = ${alias}.id AND sp.document_status = 'posted'), 0)
      + COALESCE((SELECT SUM(dn.base_total_minor) FROM debit_notes dn
        WHERE dn.purchase_invoice_id = ${alias}.id AND dn.document_status = 'posted'), 0)`,
  };
}

export function getPurchaseSettlement(sqlite: Database.Database, invoiceId: string) {
  const expressions = purchaseSettlementSql();
  return sqlite.prepare(`SELECT (${expressions.foreign}) AS foreignMinor, (${expressions.base}) AS baseMinor
    FROM purchase_invoices pi WHERE pi.id = ?`).get(invoiceId) as { foreignMinor: number; baseMinor: number } | undefined;
}
