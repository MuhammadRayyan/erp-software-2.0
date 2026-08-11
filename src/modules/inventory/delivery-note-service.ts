import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import {
  addMinor,
  parseQuantityToMicros,
  quantityMicrosToInput,
} from "@/modules/accounting/calculations/money";
import { allocateNumber } from "@/modules/accounting/services/numbering-service";
import {
  postTransaction,
  reverseTransaction,
  type JournalLineInput,
} from "@/modules/accounting/services/posting-service";
import {
  effectiveProjectId,
  validateProjectReferences,
} from "@/modules/projects/project-validation";
import { deliveryNoteInputSchema, type DeliveryNoteInput } from "./delivery-note-input";
import { validateDeliveryNoteSource } from "./delivery-note-validation";
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
import {
  averageUnitCostMicros,
  deleteSourceMovements,
  getStockBalance,
  insertInventoryMovement,
  issueValueMinor,
} from "./inventory-valuation";

export type { InventoryDocumentIntent, InventoryDocumentStatus } from "./inventory-document";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];

type StoredLine = {
  id: string;
  itemId: string;
  description: string;
  quantityMicros: number;
  projectId: string | null;
  salesInvoiceLineId: string | null;
  position: number;
};

type ItemAccounts = {
  name: string;
  unit_name: string;
  inventory_asset_account_id: string;
  cost_of_sales_account_id: string;
};

function validateHeader(
  sqlite: Sqlite,
  data: ReturnType<typeof deliveryNoteInputSchema.parse>,
) {
  const customer = sqlite.prepare("SELECT id FROM customers WHERE id = ?").get(data.customerId);
  if (!customer) throw new Error("Choose a customer.");
  const location = sqlite
    .prepare("SELECT id FROM inventory_locations WHERE id = ? AND is_active = 1")
    .get(data.locationId);
  if (!location) throw new Error("Choose an active inventory location.");
  validateProjectReferences(sqlite, {
    headerProjectId: data.projectId,
    lineProjectIds: data.lines.map((line) => line.projectId),
    customerId: data.customerId,
    customerFacing: true,
  });
}

function prepareLines(
  sqlite: Sqlite,
  data: ReturnType<typeof deliveryNoteInputSchema.parse>,
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
      projectId: line.projectId || null,
      salesInvoiceLineId: line.salesInvoiceLineId || null,
      position,
    };
  });
}

function insertLines(sqlite: Sqlite, deliveryId: string, lines: readonly StoredLine[]) {
  const insert = sqlite.prepare(`
    INSERT INTO delivery_note_lines (
      id, delivery_note_id, item_id, description, quantity_micros,
      project_id, sales_invoice_line_id, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of lines) {
    insert.run(
      line.id,
      deliveryId,
      line.itemId,
      line.description,
      line.quantityMicros,
      line.projectId,
      line.salesInvoiceLineId,
      line.position,
    );
  }
}

function postDelivery(
  sqlite: Sqlite,
  delivery: {
    id: string;
    number: string;
    date: string;
    locationId: string;
    projectId: string | null;
    createdAt: string;
  },
  lines: readonly StoredLine[],
  replace: boolean,
) {
  const location = sqlite
    .prepare("SELECT name FROM inventory_locations WHERE id = ?")
    .get(delivery.locationId) as { name: string } | undefined;
  const cogs = new Map<string, { accountId: string; projectId: string | null; amount: number }>();
  const assets = new Map<string, number>();

  for (const line of lines) {
    const item = sqlite.prepare(`
      SELECT name, unit_name, inventory_asset_account_id, cost_of_sales_account_id
      FROM inventory_items
      WHERE id = ?
    `).get(line.itemId) as ItemAccounts | undefined;
    if (!item?.inventory_asset_account_id) {
      throw new Error("Inventory Asset account is not configured.");
    }
    if (!item.cost_of_sales_account_id) {
      throw new Error(`Cost of Sales account is not configured for ${item.name}.`);
    }

    const balance = getStockBalance(sqlite, line.itemId, delivery.locationId);
    if (line.quantityMicros > balance.quantityMicros) {
      throw new Error(
        `Cannot deliver ${quantityMicrosToInput(line.quantityMicros)} ${item.unit_name}. `
        + `Only ${quantityMicrosToInput(balance.quantityMicros)} ${item.unit_name} are available `
        + `at ${location?.name ?? "the selected location"}.`,
      );
    }
    const value = issueValueMinor(balance, line.quantityMicros);
    const projectId = effectiveProjectId(line.projectId, delivery.projectId);
    insertInventoryMovement(sqlite, {
      date: delivery.date,
      itemId: line.itemId,
      locationId: delivery.locationId,
      movementType: "delivery",
      quantityDeltaMicros: -line.quantityMicros,
      unitCostMicros: averageUnitCostMicros(value, line.quantityMicros),
      valueDeltaMinor: -value,
      sourceType: "delivery_note",
      sourceId: delivery.id,
      sourceLineId: line.id,
      projectId,
      description: delivery.number,
      createdAt: new Date(Date.parse(delivery.createdAt) + line.position).toISOString(),
    });

    const cogsKey = `${item.cost_of_sales_account_id}\u0000${projectId ?? ""}`;
    const currentCogs = cogs.get(cogsKey);
    cogs.set(cogsKey, {
      accountId: item.cost_of_sales_account_id,
      projectId,
      amount: addMinor([currentCogs?.amount ?? 0, value]),
    });
    assets.set(
      item.inventory_asset_account_id,
      addMinor([assets.get(item.inventory_asset_account_id) ?? 0, value]),
    );
  }

  const journalLines: JournalLineInput[] = [];
  for (const group of cogs.values()) {
    if (group.amount > 0) {
      journalLines.push({
        accountId: group.accountId,
        description: `Cost of Sales for ${delivery.number}`,
        debitMinor: group.amount,
        projectId: group.projectId,
        reference: delivery.number,
      });
    }
  }
  for (const [accountId, amount] of assets) {
    if (amount > 0) {
      journalLines.push({
        accountId,
        description: `Inventory issued for ${delivery.number}`,
        creditMinor: amount,
        reference: delivery.number,
      });
    }
  }
  if (!journalLines.length) {
    throw new Error("Delivery value is zero. Receive valued stock before delivery.");
  }
  postTransaction(sqlite, {
    sourceType: "delivery_note",
    sourceId: delivery.id,
    date: delivery.date,
    description: `Delivery Note ${delivery.number}`,
    lines: journalLines,
    replace,
  });
}

export function listDeliveryNotes(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT dn.*, c.name AS customer_name, l.code AS location_code,
      COALESCE((
        SELECT SUM(dnl.quantity_micros)
        FROM delivery_note_lines dnl
        WHERE dnl.delivery_note_id = dn.id
      ), 0) AS quantity_micros,
      COALESCE(-(
        SELECT SUM(im.value_delta_minor)
        FROM inventory_movements im
        WHERE im.source_type = 'delivery_note' AND im.source_id = dn.id
      ), 0) AS value_minor
    FROM delivery_notes dn
    INNER JOIN customers c ON c.id = dn.customer_id
    INNER JOIN inventory_locations l ON l.id = dn.location_id
    ORDER BY dn.date DESC, dn.created_at DESC
  `).all() as Record<string, unknown>[];
}

export function getDeliveryNote(businessId: string, userId: string, deliveryId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const delivery = sqlite.prepare(`
    SELECT dn.*, c.name AS customer_name, l.code AS location_code, l.name AS location_name,
      si.invoice_number
    FROM delivery_notes dn
    INNER JOIN customers c ON c.id = dn.customer_id
    INNER JOIN inventory_locations l ON l.id = dn.location_id
    LEFT JOIN sales_invoices si ON si.id = dn.sales_invoice_id
    WHERE dn.id = ?
  `).get(deliveryId) as (Record<string, unknown> & { notes: string | null }) | undefined;
  if (!delivery) return null;
  const lines = sqlite.prepare(`
    SELECT dnl.*, i.sku, i.name AS item_name, i.unit_name,
      COALESCE(-(
        SELECT value_delta_minor
        FROM inventory_movements im
        WHERE im.source_type = 'delivery_note' AND im.source_line_id = dnl.id
      ), 0) AS value_minor
    FROM delivery_note_lines dnl
    INNER JOIN inventory_items i ON i.id = dnl.item_id
    WHERE dnl.delivery_note_id = ?
    ORDER BY dnl.position
  `).all(deliveryId) as Record<string, unknown>[];
  const journal = sqlite.prepare(`
    SELECT id, entry_number
    FROM journal_entries
    WHERE source_type = 'delivery_note' AND source_id = ?
  `).get(deliveryId) as { id: string; entry_number: string } | undefined;
  return { delivery, lines, journal: journal ?? null };
}

export function saveDeliveryNote(
  businessId: string,
  userId: string,
  input: DeliveryNoteInput,
  intent: InventoryDocumentIntent,
  deliveryId?: string,
) {
  const data = deliveryNoteInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const id = deliveryId ?? randomUUID();

  context.sqlite.transaction(() => {
    validateHeader(context.sqlite, data);
    const lines = prepareLines(context.sqlite, data);
    validateDeliveryNoteSource(context.sqlite, {
      customerId: data.customerId,
      salesInvoiceId: data.salesInvoiceId || null,
      lines,
    }, deliveryId);

    let number: string;
    let wasPosted = false;
    let shouldPost = intent === "post";
    if (deliveryId) {
      const current = context.sqlite.prepare(`
        SELECT delivery_number, document_status
        FROM delivery_notes
        WHERE id = ?
      `).get(deliveryId) as {
        delivery_number: string;
        document_status: InventoryDocumentStatus;
      } | undefined;
      if (!current) throw new Error("Delivery Note not found.");
      if (current.document_status === "void") {
        throw new Error("A void Delivery Note cannot be edited.");
      }
      number = current.delivery_number;
      wasPosted = current.document_status === "posted";
      shouldPost = wasPosted || intent === "post";
      if (wasPosted) {
        assertInventorySourceIsLatest(
          context.sqlite,
          "delivery_note",
          deliveryId,
          EDIT_INVENTORY_CHRONOLOGY_ERROR,
        );
      }
    } else {
      number = allocateNumber(context.sqlite, "deliveryNote");
    }

    if (shouldPost) {
      assertInventoryPostingOrder(
        context.sqlite,
        data.date,
        lines.map((line) => ({ itemId: line.itemId, locationId: data.locationId })),
        wasPosted ? { sourceType: "delivery_note", sourceId: id } : undefined,
      );
    }
    if (wasPosted) deleteSourceMovements(context.sqlite, "delivery_note", id);

    if (deliveryId) {
      context.sqlite.prepare(`
        UPDATE delivery_notes
        SET customer_id = ?, sales_invoice_id = ?, date = ?, location_id = ?,
          reference = ?, project_id = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.customerId,
        data.salesInvoiceId || null,
        data.date,
        data.locationId,
        data.reference || null,
        data.projectId || null,
        data.notes || null,
        now,
        deliveryId,
      );
      context.sqlite.prepare("DELETE FROM delivery_note_lines WHERE delivery_note_id = ?").run(deliveryId);
    } else {
      context.sqlite.prepare(`
        INSERT INTO delivery_notes (
          id, delivery_number, customer_id, sales_invoice_id, date, location_id,
          reference, project_id, notes, document_status, created_by, created_at,
          updated_at, posted_at, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL, NULL)
      `).run(
        id,
        number,
        data.customerId,
        data.salesInvoiceId || null,
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
      postDelivery(context.sqlite, {
        id,
        number,
        date: data.date,
        locationId: data.locationId,
        projectId: data.projectId || null,
        createdAt: now,
      }, lines, wasPosted);
      context.sqlite.prepare(`
        UPDATE delivery_notes
        SET document_status = 'posted', posted_at = COALESCE(posted_at, ?)
        WHERE id = ?
      `).run(now, id);
    }
  }).immediate();

  return id;
}

export function voidDeliveryNote(businessId: string, userId: string, deliveryId: string) {
  const context = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  context.sqlite.transaction(() => {
    const delivery = context.sqlite.prepare(`
      SELECT delivery_number, date, location_id, project_id, document_status
      FROM delivery_notes
      WHERE id = ?
    `).get(deliveryId) as {
      delivery_number: string;
      date: string;
      location_id: string;
      project_id: string | null;
      document_status: InventoryDocumentStatus;
    } | undefined;
    if (!delivery) throw new Error("Delivery Note not found.");
    if (delivery.document_status !== "posted") {
      throw new Error("Only a posted Delivery Note can be voided.");
    }
    assertInventorySourceIsLatest(
      context.sqlite,
      "delivery_note",
      deliveryId,
      VOID_INVENTORY_CHRONOLOGY_ERROR,
    );

    const lines = context.sqlite.prepare(`
      SELECT dnl.id, dnl.item_id, dnl.quantity_micros, dnl.project_id,
        im.unit_cost_micros, im.value_delta_minor
      FROM delivery_note_lines dnl
      LEFT JOIN inventory_movements im
        ON im.source_type = 'delivery_note' AND im.source_line_id = dnl.id
      WHERE dnl.delivery_note_id = ?
      ORDER BY dnl.position
    `).all(deliveryId) as {
      id: string;
      item_id: string;
      quantity_micros: number;
      project_id: string | null;
      unit_cost_micros: number | null;
      value_delta_minor: number | null;
    }[];

    for (const [position, line] of lines.entries()) {
      if (line.unit_cost_micros == null || line.value_delta_minor == null) {
        throw new Error("The original Delivery movement could not be found.");
      }
      insertInventoryMovement(context.sqlite, {
        date: delivery.date,
        itemId: line.item_id,
        locationId: delivery.location_id,
        movementType: "delivery",
        quantityDeltaMicros: line.quantity_micros,
        unitCostMicros: line.unit_cost_micros,
        valueDeltaMinor: -line.value_delta_minor,
        sourceType: "delivery_note_void",
        sourceId: deliveryId,
        sourceLineId: line.id,
        projectId: line.project_id ?? delivery.project_id,
        description: `Void ${delivery.delivery_number}`,
        createdAt: new Date(Date.parse(now) + position).toISOString(),
      });
    }
    reverseTransaction(context.sqlite, {
      originalSourceType: "delivery_note",
      originalSourceId: deliveryId,
      reversalSourceType: "delivery_note_void",
      reversalSourceId: deliveryId,
      date: now.slice(0, 10),
      description: `Void Delivery Note ${delivery.delivery_number}`,
    });
    context.sqlite.prepare(`
      UPDATE delivery_notes
      SET document_status = 'void', voided_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, deliveryId);
  }).immediate();
}

export function deleteDeliveryNote(businessId: string, userId: string, deliveryId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const row = sqlite
    .prepare("SELECT document_status FROM delivery_notes WHERE id = ?")
    .get(deliveryId) as { document_status: string } | undefined;
  if (!row) throw new Error("Delivery Note not found.");
  if (row.document_status !== "draft") {
    throw new Error("Only draft Delivery Notes can be deleted.");
  }
  sqlite.prepare("DELETE FROM delivery_notes WHERE id = ?").run(deliveryId);
}

export function deliveryNoteToInput(
  record: NonNullable<ReturnType<typeof getDeliveryNote>>,
): DeliveryNoteInput {
  const delivery = record.delivery;
  return {
    customerId: String(delivery.customer_id),
    salesInvoiceId: String(delivery.sales_invoice_id ?? ""),
    date: String(delivery.date),
    locationId: String(delivery.location_id),
    reference: String(delivery.reference ?? ""),
    projectId: String(delivery.project_id ?? ""),
    notes: String(delivery.notes ?? ""),
    lines: record.lines.map((line) => ({
      itemId: String(line.item_id),
      description: String(line.description),
      quantity: quantityMicrosToInput(Number(line.quantity_micros)),
      projectId: String(line.project_id ?? ""),
      salesInvoiceLineId: String(line.sales_invoice_line_id ?? ""),
    })),
  };
}

export function getDeliverySourceLines(
  businessId: string,
  userId: string,
  invoiceId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT sil.id AS source_line_id, sil.item_id, sil.description, sil.quantity_micros,
      sil.project_id, si.customer_id, si.project_id AS header_project_id,
      COALESCE((
        SELECT SUM(dnl.quantity_micros)
        FROM delivery_note_lines dnl
        INNER JOIN delivery_notes dn
          ON dn.id = dnl.delivery_note_id AND dn.document_status = 'posted'
        WHERE dnl.sales_invoice_line_id = sil.id
      ), 0) AS completed_micros
    FROM sales_invoice_lines sil
    INNER JOIN sales_invoices si ON si.id = sil.invoice_id
    WHERE si.id = ? AND si.document_status = 'posted' AND sil.item_id IS NOT NULL
    ORDER BY sil.position
  `).all(invoiceId) as Record<string, unknown>[];
}
