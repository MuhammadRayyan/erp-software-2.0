import type { BaseStoredLine } from "@/modules/documents/document-types";
import { getBusinessDb } from "@/core/db/business";
import {
  addMinor,
  quantityMicrosToInput,
} from "@/modules/accounting/calculations/money";
import {
  postTransaction,
  reverseTransaction,
  type JournalLineInput,
} from "@/modules/accounting/services/posting-service";
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
import { deliveryNoteInputSchema, type DeliveryNoteInput } from "./delivery-note-input";
import { validateDeliveryNoteSource } from "./delivery-note-validation";
import type { InventoryDocumentIntent } from "./inventory-document";
import {
  averageUnitCostMicros,
  getStockBalance,
  insertInventoryMovement,
  issueValueMinor,
} from "./inventory-valuation";
import { getBusinessTodayIso } from "@/core/format";

export type { InventoryDocumentIntent, InventoryDocumentStatus } from "./inventory-document";

type Sqlite = ReturnType<typeof getBusinessDb>["sqlite"];

export type StoredLine = BaseStoredLine & {
  id: string;
  itemId: string;
  description: string;
  quantityMicros: number;
  projectId: string | null;
  salesInvoiceLineId: string | null;
  lineIndex: number;
};

type ItemAccounts = {
  name: string;
  unit_name: string;
  inventory_asset_account_id: string;
  cost_of_sales_account_id: string;
};

type DeliveryNoteData = ReturnType<typeof deliveryNoteInputSchema.parse>;

function postDelivery(
  sqlite: Sqlite,
  delivery: StockDocumentHeader,
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
      createdAt: new Date(Date.parse(delivery.createdAt) + line.lineIndex).toISOString(),
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

export const deliveryNoteDocument: StockDocumentConfig<DeliveryNoteData, StoredLine> = {
  sourceType: "delivery_note",
  label: "Delivery Note",
  pluralLabel: "Delivery Notes",
  lockLabel: "Delivery note",
  schema: deliveryNoteInputSchema,
  table: "delivery_notes",
  numberColumn: "delivery_number",
  numbering: "deliveryNote",
  lines: {
    table: "delivery_note_lines",
    parentColumn: "delivery_note_id",
    columns: {
      item_id: (line) => line.itemId,
      description: (line) => line.description,
      quantity_micros: (line) => line.quantityMicros,
      project_id: (line) => line.projectId,
      sales_invoice_line_id: (line) => line.salesInvoiceLineId,
      position: (line) => line.lineIndex,
    },
  },
  direction: "out",
  movementType: "delivery",
  missingMovementMessage: "The original Delivery movement could not be found.",
  headerColumns: (data) => ({
    customer_id: data.customerId,
    sales_invoice_id: data.salesInvoiceId || null,
    date: data.date,
    location_id: data.locationId,
    reference: data.reference || null,
    project_id: data.projectId || null,
    notes: data.notes || null,
  }),
  validateHeader(sqlite, data) {
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
  },
  prepareLine: (line, base) => ({
    ...base,
    unitPriceMinor: 0,
    netAmountMinor: 0,
    taxCodeId: "",
    taxAmountMinor: 0,
    grossAmountMinor: 0,
    salesInvoiceLineId: line.salesInvoiceLineId || null,
  }),
  validateSources(sqlite, data, lines, deliveryId) {
    validateDeliveryNoteSource(sqlite, {
      customerId: data.customerId,
      salesInvoiceId: data.salesInvoiceId || null,
      lines,
    }, deliveryId);
  },
  post: (sqlite, header, lines, replace) => postDelivery(sqlite, header, lines, replace),
  afterVoidMovements(sqlite, delivery) {
    reverseTransaction(sqlite, {
      originalSourceType: "delivery_note",
      originalSourceId: delivery.id,
      reversalSourceType: "delivery_note_void",
      reversalSourceId: delivery.id,
      date: getBusinessTodayIso(),
      description: `Void Delivery Note ${delivery.number}`,
    });
  },
};

export function listDeliveryNotes(
  businessId: string, 
  userId: string, 
  filters?: { customerId?: string; from?: string; to?: string }
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const { whereClause, params } = buildDocumentListWhere("dn", { partyId: filters?.customerId, from: filters?.from, to: filters?.to }, { party: "customer_id", date: "date" });

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
    ${whereClause}
    ORDER BY dn.date DESC, dn.created_at DESC
  `).all(...params) as Record<string, unknown>[];
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
  return saveStockDocument(deliveryNoteDocument, businessId, userId, input, intent, deliveryId);
}

export function voidDeliveryNote(businessId: string, userId: string, deliveryId: string) {
  voidStockDocument(deliveryNoteDocument, businessId, userId, deliveryId);
}

export function deleteDeliveryNote(businessId: string, userId: string, deliveryId: string) {
  deleteStockDocument(deliveryNoteDocument, businessId, userId, deliveryId);
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
