/**
 * Characterization ("golden master") test for the six non-invoice trade
 * documents: sales quotes, sales orders, purchase quotes, purchase orders,
 * delivery notes and goods receipts.
 *
 * It drives every service command (create, edit, issue, close, cancel, delete,
 * revise, convert via source links, post, void) including the error paths, and
 * after each step records:
 *   - the command's return value or error message,
 *   - every business-database row the step inserted, changed or deleted
 *     (documents, lines, numbering, stock movements, journals, activity log,
 *     approvals, custom field values ...).
 *
 * UUIDs are replaced by stable tokens (#1, #2 ... in order of first
 * appearance), ISO timestamps by <ts> and the business "today" by <today>, so
 * the transcript is deterministic. The transcript is compared with the
 * committed snapshot; any change in validation messages, DB writes, journals,
 * stock movements or activity entries fails the test.
 *
 * Regenerate (only when a behaviour change is intended):
 *   UPDATE_SNAPSHOTS=1 node --import tsx --import ./scripts/test-isolation.mjs \
 *     --test tests/integration/document-engine-characterization.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-doc-engine-")),
  BETTER_AUTH_SECRET: "document-engine-characterization-secret",
  NODE_ENV: "test",
});

const SNAPSHOT = path.join(import.meta.dirname, "fixtures", "document-engine-characterization.snapshot.txt");

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { getBusinessTodayIso } = await import("../../src/core/format");
const { createCustomer } = await import("../../src/modules/customers/customer-service");
const { createSupplier } = await import("../../src/modules/suppliers/supplier-service");
const { createProject } = await import("../../src/modules/projects/project-service");
const { saveInventoryItem } = await import("../../src/modules/inventory/inventory-item-service");
const { saveInventoryLocation } = await import("../../src/modules/inventory/inventory-location-service");
const { createCustomFieldDefinition } = await import("../../src/modules/custom-fields/custom-field-service");
const { createInvoice } = await import("../../src/modules/sales-invoices/invoice-service");
const { savePurchaseInvoice } = await import("../../src/modules/purchase-invoices/purchase-invoice-service");
const sq = await import("../../src/modules/sales-quotes/quote-service");
const so = await import("../../src/modules/sales-orders/sales-order-service");
const pq = await import("../../src/modules/purchase-quotes/purchase-quote-service");
const po = await import("../../src/modules/purchase-orders/purchase-order-service");
const dn = await import("../../src/modules/inventory/delivery-note-service");
const gr = await import("../../src/modules/inventory/goods-receipt-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const standardId = seeded.standard.id;
const { sqlite } = getBusinessDb(businessId, adminId);

// ---------------------------------------------------------------------------
// Fixture data (created before recording starts; not part of the transcript)
// ---------------------------------------------------------------------------
const settings = sqlite.prepare(`
  SELECT default_sales_account_id AS sales, default_purchase_expense_account_id AS expense
  FROM business_accounting_settings WHERE id = 'default'
`).get() as { sales: string; expense: string };
const salesVat = (sqlite.prepare("SELECT id FROM tax_codes WHERE direction IN ('sales','both') AND rate_basis_points = 500 AND is_active = 1 ORDER BY id LIMIT 1").get() as { id: string }).id;
const purchaseVat = (sqlite.prepare("SELECT id FROM tax_codes WHERE direction IN ('purchases','both') AND rate_basis_points = 500 AND is_active = 1 ORDER BY id LIMIT 1").get() as { id: string }).id;
const seedItem = sqlite.prepare("SELECT sales_account_id, inventory_asset_account_id, cost_of_sales_account_id FROM inventory_items WHERE is_active = 1 ORDER BY name LIMIT 1").get() as {
  sales_account_id: string; inventory_asset_account_id: string; cost_of_sales_account_id: string;
};
const customerId = createCustomer(businessId, adminId, { name: "Characterization Customer LLC", defaultCurrencyCode: "AED", isActive: true });
const customer2Id = createCustomer(businessId, adminId, { name: "Characterization Other Customer", defaultCurrencyCode: "AED", isActive: true });
const supplierId = createSupplier(businessId, adminId, { name: "Characterization Supplier FZE", defaultCurrencyCode: "AED", isActive: true });
const projectId = createProject(businessId, adminId, { code: "CHAR-PRJ", name: "Characterization Project", customerId, status: "active" });
const itemA = saveInventoryItem(businessId, adminId, {
  sku: "CHAR-A", name: "Characterization Widget A", unitName: "pcs", salesPrice: "50.00", purchasePrice: "20.00",
  salesAccountId: seedItem.sales_account_id, inventoryAssetAccountId: seedItem.inventory_asset_account_id, costOfSalesAccountId: seedItem.cost_of_sales_account_id,
});
const itemB = saveInventoryItem(businessId, adminId, {
  sku: "CHAR-B", name: "Characterization Widget B", unitName: "box", salesPrice: "80.00", purchasePrice: "30.00",
  salesAccountId: seedItem.sales_account_id, inventoryAssetAccountId: seedItem.inventory_asset_account_id, costOfSalesAccountId: seedItem.cost_of_sales_account_id,
});
const itemC = saveInventoryItem(businessId, adminId, {
  sku: "CHAR-C", name: "Characterization Widget C", unitName: "kg", salesPrice: "", purchasePrice: "",
  salesAccountId: seedItem.sales_account_id, inventoryAssetAccountId: seedItem.inventory_asset_account_id, costOfSalesAccountId: seedItem.cost_of_sales_account_id,
});
const locationId = saveInventoryLocation(businessId, adminId, { code: "CHAR", name: "Characterization Store", isActive: true });
const sqLineField = createCustomFieldDefinition(businessId, adminId, { entityType: "sales_quote_line", name: "Char Serial", fieldType: "text" });
const soLineField = createCustomFieldDefinition(businessId, adminId, { entityType: "sales_order_line", name: "Char Serial", fieldType: "text" });
const pqLineField = createCustomFieldDefinition(businessId, adminId, { entityType: "purchase_quote_line", name: "Char Serial", fieldType: "text" });
const poLineField = createCustomFieldDefinition(businessId, adminId, { entityType: "purchase_order_line", name: "Char Serial", fieldType: "text" });

const D = (day: number) => `2035-03-${String(day).padStart(2, "0")}`;
const rate = (date: string) => ({ currencyCode: "AED", exchangeRateToBase: "1", exchangeRateDate: date, exchangeRateSource: "Base" as const });

// A posted sales invoice for itemA (delivery-note source) and a posted
// purchase invoice for itemB with a discount (goods-receipt costing source).
const salesInvoiceId = createInvoice(businessId, adminId, {
  ...rate(D(1)), customerId, invoiceDate: D(1), taxDate: D(1), dueDate: D(28), supplyEmirate: "dubai", reference: "CHAR-SI",
  lines: [{ itemId: itemA, description: "Widget A invoiced", quantity: "4", unitPrice: "50.00", salesAccountId: settings.sales, taxCodeId: salesVat }],
}, "post");
const salesInvoiceLineId = (sqlite.prepare("SELECT id FROM sales_invoice_lines WHERE invoice_id = ?").get(salesInvoiceId) as { id: string }).id;
const purchaseInvoiceId = savePurchaseInvoice(businessId, adminId, {
  ...rate(D(1)), supplierId, supplierInvoiceNumber: "CHAR-PI", invoiceDate: D(1), taxDate: D(1), dueDate: D(28),
  lines: [{ itemId: itemB, description: "Widget B invoiced", quantity: "3", unitPrice: "33.33", discountType: "percentage", discountValue: "10", expenseAccountId: seedItem.inventory_asset_account_id, taxCodeId: purchaseVat }],
}, "post");
const purchaseInvoiceLineId = (sqlite.prepare("SELECT id FROM purchase_invoice_lines WHERE purchase_invoice_id = ?").get(purchaseInvoiceId) as { id: string }).id;

// ---------------------------------------------------------------------------
// Transcript machinery
// ---------------------------------------------------------------------------
const today = getBusinessTodayIso();
const tokens = new Map<string, string>();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
function normalize(text: string) {
  return text
    .replaceAll(adminId, "<admin>")
    .replaceAll(standardId, "<standard>")
    .replace(UUID, (id) => {
      const key = id.toLowerCase();
      if (!tokens.has(key)) tokens.set(key, `#${tokens.size + 1}`);
      return tokens.get(key)!;
    })
    .replace(ISO_TS, "<ts>")
    .replaceAll(today, "<today>");
}

type Dump = Map<string, Map<number, string>>;
const tableNames = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
  .map((row) => row.name)
  // FTS shadow tables mirror activity_logs; the base table is enough.
  .filter((name) => !/_fts(_|$)/.test(name));
function dump(): Dump {
  const result: Dump = new Map();
  for (const table of tableNames) {
    let rows: Record<string, unknown>[];
    try {
      rows = sqlite.prepare(`SELECT rowid AS __rowid, * FROM "${table}" ORDER BY rowid`).all() as Record<string, unknown>[];
    } catch {
      continue;
    }
    const byRowid = new Map<number, string>();
    for (const row of rows) {
      const rowid = Number(row.__rowid);
      delete row.__rowid;
      byRowid.set(rowid, JSON.stringify(row));
    }
    result.set(table, byRowid);
  }
  return result;
}

const baseline = dump();
const baselineMaxRowid = new Map([...baseline].map(([table, rows]) => [table, Math.max(0, ...rows.keys())]));
let previous = baseline;
const transcript: string[] = [];

function rowLabel(table: string, rowid: number) {
  const max = baselineMaxRowid.get(table) ?? 0;
  return rowid > max ? `${table}[+${rowid - max}]` : `${table}[seed]`;
}

function record(name: string, outcome: { result?: unknown; error?: string }) {
  const current = dump();
  transcript.push(`## ${name}`);
  if (outcome.error !== undefined) transcript.push(`error: ${normalize(outcome.error)}`);
  else transcript.push(`result: ${normalize(JSON.stringify(outcome.result) ?? "undefined")}`);
  for (const table of tableNames) {
    const before = previous.get(table) ?? new Map();
    const after = current.get(table) ?? new Map();
    for (const [rowid, json] of after) {
      const old = before.get(rowid);
      if (old === undefined) transcript.push(`+ ${rowLabel(table, rowid)} ${normalize(json)}`);
      else if (old !== json) transcript.push(`~ ${rowLabel(table, rowid)} ${normalize(json)}`);
    }
    for (const rowid of before.keys()) {
      if (!after.has(rowid)) transcript.push(`- ${rowLabel(table, rowid)}`);
    }
  }
  previous = current;
}

function step<T>(name: string, fn: () => T): T | undefined {
  try {
    const result = fn();
    record(name, { result });
    return result;
  } catch (error) {
    record(name, { error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
function salesLines(variant: number, field: string) {
  return [
    { itemId: itemA, description: `Widget A v${variant}`, quantity: `${variant + 1}`, unitPrice: "50.00", discountType: "percentage" as const, discountValue: "5", salesAccountId: "", taxCodeId: salesVat, projectId: "", customFields: { [field]: `SER-${variant}` } },
    { itemId: "", description: `Installation v${variant}`, quantity: "1.5", unitPrice: "120.25", discountType: "fixed" as const, discountValue: "10.00", salesAccountId: settings.sales, taxCodeId: salesVat, projectId },
  ];
}
function purchaseLines(variant: number, field: string) {
  return [
    { itemId: itemB, description: `Widget B v${variant}`, quantity: `${variant + 2}`, unitPrice: "30.00", discountType: "none" as const, discountValue: "0", expenseAccountId: "", taxCodeId: purchaseVat, projectId, customFields: { [field]: `PSER-${variant}` } },
    { itemId: "", description: `Freight v${variant}`, quantity: "1", unitPrice: "75.50", discountType: "percentage" as const, discountValue: "2.5", expenseAccountId: settings.expense, taxCodeId: purchaseVat, projectId: "" },
  ];
}
const salesQuoteInput = (variant: number, extra: Record<string, unknown> = {}) => ({
  ...rate(D(2)), customerId, projectId, amountsIncludeTax: variant % 2 === 0, date: D(2), expectedDate: D(20),
  reference: `SQ-REF-${variant}`, notes: `Quote notes ${variant}`, terms: "Net 30", lines: salesLines(variant, sqLineField), ...extra,
});
const salesOrderInput = (variant: number, extra: Record<string, unknown> = {}) => ({
  ...rate(D(3)), customerId, projectId: "", amountsIncludeTax: false, date: D(3), expectedDate: variant % 2 ? D(15) : "",
  reference: `SO-REF-${variant}`, notes: `Order notes ${variant}`, terms: "", lines: salesLines(variant, soLineField), ...extra,
});
const purchaseQuoteInput = (variant: number, extra: Record<string, unknown> = {}) => ({
  ...rate(D(2)), supplierId, projectId: "", amountsIncludeTax: variant % 2 === 1, date: D(2), expiryDate: D(25),
  reference: `PQ-REF-${variant}`, notes: `PQ notes ${variant}`, terms: "COD", lines: purchaseLines(variant, pqLineField), ...extra,
});
const purchaseOrderInput = (variant: number, extra: Record<string, unknown> = {}) => ({
  ...rate(D(3)), supplierId, projectId, amountsIncludeTax: false, date: D(3), expectedDate: variant % 2 ? D(12) : "",
  reference: `PO-REF-${variant}`, notes: `PO notes ${variant}`, terms: "Net 45", lines: purchaseLines(variant, poLineField), ...extra,
});

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
function runScenario() {
  // ---- Sales quotes -------------------------------------------------------
  const sq1 = step("SQ create draft", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(1), "draft"))!;
  step("SQ edit draft", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(2), "draft", sq1));
  step("SQ edit draft and issue", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(3), "issue", sq1));
  step("SQ edit sent stays sent", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(4), "draft", sq1));
  step("SQ issue non-draft rejected", () => sq.issueSalesQuote(businessId, adminId, sq1));
  const sq2 = step("SQ create draft 2", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(5), "draft"))!;
  step("SQ close draft rejected", () => sq.closeSalesQuote(businessId, adminId, sq2));
  step("SQ issue draft", () => sq.issueSalesQuote(businessId, adminId, sq2));
  step("SQ close sent", () => sq.closeSalesQuote(businessId, adminId, sq2));
  step("SQ edit accepted rejected", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(6), "draft", sq2));
  step("SQ cancel accepted rejected", () => sq.cancelSalesQuote(businessId, adminId, sq2));
  const sq3 = step("SQ create issued directly", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(7), "issue"))!;
  step("SQ cancel sent", () => sq.cancelSalesQuote(businessId, adminId, sq3));
  step("SQ cancel twice rejected", () => sq.cancelSalesQuote(businessId, adminId, sq3));
  step("SQ create with inactive customer rejected", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(8, { customerId: "00000000-0000-4000-8000-000000000000" }), "draft"));
  step("SQ create invalid schema rejected", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(8, { lines: [] }), "draft"));
  step("SQ standard user cannot issue", () => sq.saveSalesQuote(businessId, standardId, salesQuoteInput(8), "issue"));
  step("SQ revision of sent quote", () => sq.createSalesQuoteRevision(businessId, adminId, sq1));
  const sq1r1 = (sqlite.prepare("SELECT id FROM sales_quotes WHERE root_quote_id = ? AND revision_number = 1").get(sq1) as { id: string }).id;
  step("SQ second draft revision rejected", () => sq.createSalesQuoteRevision(businessId, adminId, sq1r1));
  step("SQ edit superseded rejected", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(9), "draft", sq1));
  step("SQ delete sent rejected", () => sq.deleteSalesQuote(businessId, adminId, sq3));
  step("SQ delete draft revision restores parent", () => sq.deleteSalesQuote(businessId, adminId, sq1r1));
  step("SQ delete missing rejected", () => sq.deleteSalesQuote(businessId, adminId, "00000000-0000-4000-8000-000000000001"));
  const sq4 = step("SQ create draft to delete", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(10), "draft"))!;
  step("SQ delete draft", () => sq.deleteSalesQuote(businessId, adminId, sq4));
  step("SQ revision R1 then issue it", () => {
    const id = sq.createSalesQuoteRevision(businessId, adminId, sq1);
    sq.saveSalesQuote(businessId, adminId, salesQuoteInput(11), "issue", id);
    return id;
  });
  step("SQ list all", () => sq.listSalesQuotes(businessId, adminId));
  step("SQ list filtered latest", () => sq.listSalesQuotes(businessId, adminId, { customerId, from: D(1), to: D(3), onlyLatest: true }));
  step("SQ get", () => sq.getSalesQuote(businessId, adminId, sq1));
  step("SQ get missing", () => sq.getSalesQuote(businessId, adminId, "00000000-0000-4000-8000-000000000002"));
  step("SQ list revisions", () => sq.listSalesQuoteRevisions(businessId, adminId, sq1));

  // ---- Sales orders -------------------------------------------------------
  const sq5 = step("SQ create issued for conversion", () => sq.saveSalesQuote(businessId, adminId, salesQuoteInput(12), "issue"))!;
  const so1 = step("SO convert from quote (draft)", () => so.saveSalesOrder(businessId, adminId, salesOrderInput(1, { reference: "Q", salesQuoteId: sq5 }), "draft"))!;
  step("SO from accepted quote rejected", () => so.saveSalesOrder(businessId, adminId, salesOrderInput(2, { salesQuoteId: sq5 }), "draft"));
  step("SO edit draft keeps quote link", () => {
    const { salesQuoteId: _drop, ...input } = salesOrderInput(3) as Record<string, unknown>;
    return so.saveSalesOrder(businessId, adminId, input as never, "draft", so1);
  });
  step("SO edit draft clears quote link", () => so.saveSalesOrder(businessId, adminId, salesOrderInput(4, { salesQuoteId: "" }), "draft", so1));
  step("SO delete draft restores quote", () => {
    so.saveSalesOrder(businessId, adminId, salesOrderInput(4, { salesQuoteId: sq5 }), "draft", so1);
    return so.deleteSalesOrder(businessId, adminId, so1);
  });
  const sq5Number = (sqlite.prepare("SELECT quote_number FROM sales_quotes WHERE id = ?").get(sq5) as { quote_number: string }).quote_number;
  const so2 = step("SO resolves quote from reference", () => so.saveSalesOrder(businessId, adminId, salesOrderInput(5, { reference: `Ref ${sq5Number} please` }), "draft"))!;
  step("SO issue draft", () => so.issueSalesOrder(businessId, adminId, so2));
  step("SO issue twice rejected", () => so.issueSalesOrder(businessId, adminId, so2));
  step("SO edit active stays active", () => so.saveSalesOrder(businessId, adminId, salesOrderInput(6), "draft", so2));
  step("SO revision of active order", () => so.createSalesOrderRevision(businessId, adminId, so2));
  const so2r1 = (sqlite.prepare("SELECT id FROM sales_orders WHERE root_order_id = ? AND revision_number = 1").get(so2) as { id: string }).id;
  step("SO edit superseded allowed", () => so.saveSalesOrder(businessId, adminId, salesOrderInput(7), "draft", so2));
  step("SO delete draft revision", () => so.deleteSalesOrder(businessId, adminId, so2r1));
  step("SO close active", () => so.closeSalesOrder(businessId, adminId, so2));
  step("SO close twice rejected", () => so.closeSalesOrder(businessId, adminId, so2));
  step("SO cancel completed rejected", () => so.cancelSalesOrder(businessId, adminId, so2));
  step("SO edit completed rejected", () => so.saveSalesOrder(businessId, adminId, salesOrderInput(8), "draft", so2));
  const so3 = step("SO create issued directly", () => so.saveSalesOrder(businessId, adminId, salesOrderInput(9), "issue"))!;
  step("SO cancel active", () => so.cancelSalesOrder(businessId, adminId, so3));
  step("SO cancel twice rejected", () => so.cancelSalesOrder(businessId, adminId, so3));
  step("SO delete cancelled rejected", () => so.deleteSalesOrder(businessId, adminId, so3));
  step("SO standard user create draft", () => so.saveSalesOrder(businessId, standardId, salesOrderInput(10), "draft"));
  step("SO list", () => so.listSalesOrders(businessId, adminId));
  step("SO list filtered", () => so.listSalesOrders(businessId, adminId, { customerId: customer2Id, onlyLatest: true }));
  step("SO get", () => so.getSalesOrder(businessId, adminId, so2));
  step("SO list revisions", () => so.listSalesOrderRevisions(businessId, adminId, so2));
  step("SQ get with linked orders", () => sq.getSalesQuote(businessId, adminId, sq5));

  // ---- Purchase quotes ----------------------------------------------------
  const pq1 = step("PQ create draft", () => pq.savePurchaseQuote(businessId, adminId, purchaseQuoteInput(1), "draft"))!;
  step("PQ edit draft", () => pq.savePurchaseQuote(businessId, adminId, purchaseQuoteInput(2), "draft", pq1));
  step("PQ issue draft", () => pq.issuePurchaseQuote(businessId, adminId, pq1));
  step("PQ issue twice rejected", () => pq.issuePurchaseQuote(businessId, adminId, pq1));
  step("PQ edit sent stays sent", () => pq.savePurchaseQuote(businessId, adminId, purchaseQuoteInput(3), "draft", pq1));
  step("PQ revision", () => pq.createPurchaseQuoteRevision(businessId, adminId, pq1));
  const pq1r1 = (sqlite.prepare("SELECT id FROM purchase_quotes WHERE root_quote_id = ? AND revision_number = 1").get(pq1) as { id: string }).id;
  step("PQ second draft revision rejected", () => pq.createPurchaseQuoteRevision(businessId, adminId, pq1r1));
  step("PQ delete draft revision", () => pq.deletePurchaseQuote(businessId, adminId, pq1r1));
  step("PQ close sent", () => pq.closePurchaseQuote(businessId, adminId, pq1));
  step("PQ close twice rejected", () => pq.closePurchaseQuote(businessId, adminId, pq1));
  step("PQ cancel accepted rejected", () => pq.cancelPurchaseQuote(businessId, adminId, pq1));
  step("PQ edit accepted rejected", () => pq.savePurchaseQuote(businessId, adminId, purchaseQuoteInput(4), "draft", pq1));
  const pq2 = step("PQ create issued", () => pq.savePurchaseQuote(businessId, adminId, purchaseQuoteInput(5), "issue"))!;
  step("PQ cancel sent", () => pq.cancelPurchaseQuote(businessId, adminId, pq2));
  step("PQ cancel twice rejected", () => pq.cancelPurchaseQuote(businessId, adminId, pq2));
  step("PQ inactive supplier rejected", () => pq.savePurchaseQuote(businessId, adminId, purchaseQuoteInput(6, { supplierId: "00000000-0000-4000-8000-000000000003" }), "draft"));
  step("PQ standard user denied", () => pq.savePurchaseQuote(businessId, standardId, purchaseQuoteInput(6), "draft"));
  const pq3 = step("PQ create draft to delete", () => pq.savePurchaseQuote(businessId, adminId, purchaseQuoteInput(7), "draft"))!;
  step("PQ delete draft", () => pq.deletePurchaseQuote(businessId, adminId, pq3));
  step("PQ list", () => pq.listPurchaseQuotes(businessId, adminId));
  step("PQ list filtered", () => pq.listPurchaseQuotes(businessId, adminId, { supplierId, from: D(2), to: D(2), onlyLatest: true }));
  step("PQ get", () => pq.getPurchaseQuote(businessId, adminId, pq1));
  step("PQ list revisions", () => pq.listPurchaseQuoteRevisions(businessId, adminId, pq1));

  // ---- Purchase orders ----------------------------------------------------
  const pq4 = step("PQ create issued for conversion", () => pq.savePurchaseQuote(businessId, adminId, purchaseQuoteInput(8), "issue"))!;
  const po1 = step("PO convert from quote (draft)", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(1, { reference: "PQ", purchaseQuoteId: pq4 }), "draft"))!;
  step("PO from accepted quote rejected", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(2, { purchaseQuoteId: pq4 }), "draft"));
  step("PO edit draft keeps quote link", () => {
    const { purchaseQuoteId: _drop, ...input } = purchaseOrderInput(3) as Record<string, unknown>;
    return po.savePurchaseOrder(businessId, adminId, input as never, "draft", po1);
  });
  step("PO delete draft restores quote", () => {
    po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(4, { purchaseQuoteId: pq4 }), "draft", po1);
    return po.deletePurchaseOrder(businessId, adminId, po1);
  });
  const pq4Number = (sqlite.prepare("SELECT quote_number FROM purchase_quotes WHERE id = ?").get(pq4) as { quote_number: string }).quote_number;
  const po2 = step("PO resolves quote from reference", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(5, { reference: pq4Number }), "draft"))!;
  step("PO submit for approval on edit", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(6), "submit_approval", po2));
  step("PO edit pending rejected", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(7), "draft", po2));
  step("PO revision of pending rejected", () => po.createPurchaseOrderRevision(businessId, adminId, po2));
  step("PO bypass approval edit of pending", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(8), "issue", po2, { bypassApprovalPolicy: true }));
  const po3 = step("PO create draft", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(9), "draft"))!;
  step("PO issue via submit_approval", () => po.issuePurchaseOrder(businessId, adminId, po3, "submit_approval"));
  step("PO revert pending to draft", () => po.revertPurchaseOrderToDraft(businessId, adminId, po3));
  step("PO revert draft rejected", () => po.revertPurchaseOrderToDraft(businessId, adminId, po3));
  step("PO issue draft", () => po.issuePurchaseOrder(businessId, adminId, po3));
  step("PO issue twice rejected", () => po.issuePurchaseOrder(businessId, adminId, po3));
  step("PO issue pending already issued is no-op", () => po.issuePendingPurchaseOrder(businessId, adminId, po3));
  const po4 = step("PO create submit_approval", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(10), "submit_approval"))!;
  step("PO issue pending", () => po.issuePendingPurchaseOrder(businessId, adminId, po4));
  step("PO close issued", () => po.closePurchaseOrder(businessId, adminId, po4));
  step("PO close twice rejected", () => po.closePurchaseOrder(businessId, adminId, po4));
  step("PO cancel closed rejected", () => po.cancelPurchaseOrder(businessId, adminId, po4));
  step("PO edit closed rejected", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(11), "draft", po4));
  step("PO issue pending closed rejected", () => po.issuePendingPurchaseOrder(businessId, adminId, po4));
  const po5 = step("PO create issued", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(12), "issue"))!;
  step("PO edit issued stays issued", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(13), "draft", po5));
  step("PO revision of issued", () => po.createPurchaseOrderRevision(businessId, adminId, po5));
  const po5r1 = (sqlite.prepare("SELECT id FROM purchase_orders WHERE root_order_id = ? AND revision_number = 1").get(po5) as { id: string }).id;
  step("PO delete draft revision", () => po.deletePurchaseOrder(businessId, adminId, po5r1));
  step("PO cancel issued", () => po.cancelPurchaseOrder(businessId, adminId, po5));
  step("PO cancel twice rejected", () => po.cancelPurchaseOrder(businessId, adminId, po5));
  step("PO standard user denied", () => po.savePurchaseOrder(businessId, standardId, purchaseOrderInput(14), "draft"));
  step("PO list", () => po.listPurchaseOrders(businessId, adminId));
  step("PO list filtered", () => po.listPurchaseOrders(businessId, adminId, { supplierId, from: D(3), to: D(3) }));
  step("PO list revisions", () => po.listPurchaseOrderRevisions(businessId, adminId, po5));

  // ---- Goods receipts -----------------------------------------------------
  const po6 = step("PO create issued for receipt", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(15), "issue"))!;
  const po6Lines = sqlite.prepare("SELECT id, item_id FROM purchase_order_lines WHERE purchase_order_id = ? AND item_id IS NOT NULL ORDER BY position").all(po6) as { id: string; item_id: string }[];
  const grInput = (quantity: string, extra: Record<string, unknown> = {}) => ({
    supplierId, purchaseOrderId: po6, purchaseInvoiceId: "", date: D(5), locationId, reference: "GR-REF", projectId, notes: "Receipt notes",
    lines: [{ itemId: po6Lines[0].item_id, description: "Received B", quantity, unitCost: "30.00", projectId: "", purchaseOrderLineId: po6Lines[0].id, purchaseInvoiceLineId: "" }],
    ...extra,
  });
  step("GR source lines for PO", () => gr.getReceiptSourceLines(businessId, adminId, { orderId: po6 }));
  step("GR source lines for PI", () => gr.getReceiptSourceLines(businessId, adminId, { invoiceId: purchaseInvoiceId }));
  step("GR source lines none", () => gr.getReceiptSourceLines(businessId, adminId, {}));
  const gr1 = step("GR create draft against PO", () => gr.saveGoodsReceipt(businessId, adminId, grInput("5"), "draft"))!;
  step("GR edit draft", () => gr.saveGoodsReceipt(businessId, adminId, grInput("6"), "draft", gr1));
  step("PO edit after receipt rejected", () => po.savePurchaseOrder(businessId, adminId, purchaseOrderInput(16), "draft", po6));
  step("GR void draft rejected", () => gr.voidGoodsReceipt(businessId, adminId, gr1));
  step("GR post draft", () => gr.saveGoodsReceipt(businessId, adminId, grInput("6"), "post", gr1));
  step("GR over-receipt rejected", () => gr.saveGoodsReceipt(businessId, adminId, grInput("100"), "draft"));
  step("GR edit posted reposts", () => gr.saveGoodsReceipt(businessId, adminId, grInput("4", { date: D(6) }), "draft", gr1));
  step("GR delete posted rejected", () => gr.deleteGoodsReceipt(businessId, adminId, gr1));
  step("PO get with receipts", () => po.getPurchaseOrder(businessId, adminId, po6));
  const gr2 = step("GR post against purchase invoice", () => gr.saveGoodsReceipt(businessId, adminId, {
    supplierId, purchaseOrderId: "", purchaseInvoiceId, date: D(7), locationId, reference: "", projectId: "", notes: "",
    lines: [{ itemId: itemB, description: "Invoiced B", quantity: "2", unitCost: "0.01", projectId: "", purchaseOrderLineId: "", purchaseInvoiceLineId }],
  }, "post"))!;
  step("GR manual receipt of A", () => gr.saveGoodsReceipt(businessId, adminId, {
    supplierId, purchaseOrderId: "", purchaseInvoiceId: "", date: D(7), locationId, reference: "Manual", projectId: "", notes: "",
    lines: [
      { itemId: itemA, description: "Widget A lot 1", quantity: "3", unitCost: "21.10", projectId: "", purchaseOrderLineId: "", purchaseInvoiceLineId: "" },
      { itemId: itemA, description: "Widget A lot 2", quantity: "2.5", unitCost: "19.95", projectId, purchaseOrderLineId: "", purchaseInvoiceLineId: "" },
    ],
  }, "post"));
  step("GR inactive item rejected", () => gr.saveGoodsReceipt(businessId, adminId, grInput("1", { lines: [{ itemId: "00000000-0000-4000-8000-000000000004", description: "x", quantity: "1", unitCost: "1.00" }] }), "draft"));
  step("GR inactive location rejected", () => gr.saveGoodsReceipt(businessId, adminId, grInput("1", { locationId: "missing-location" }), "draft"));
  step("GR standard user denied", () => gr.saveGoodsReceipt(businessId, standardId, grInput("1"), "draft"));
  const gr3 = step("GR create draft to delete", () => gr.saveGoodsReceipt(businessId, adminId, grInput("1", { purchaseOrderId: "", lines: [{ itemId: itemB, description: "Loose", quantity: "1", unitCost: "1.00" }] }), "draft"))!;
  step("GR delete draft", () => gr.deleteGoodsReceipt(businessId, adminId, gr3));
  step("GR delete missing rejected", () => gr.deleteGoodsReceipt(businessId, adminId, gr3));

  // ---- Delivery notes -----------------------------------------------------
  const dnInput = (quantity: string, extra: Record<string, unknown> = {}) => ({
    customerId, salesInvoiceId, date: D(8), locationId, reference: "DN-REF", projectId: "", notes: "Delivery notes",
    lines: [{ itemId: itemA, description: "Deliver A", quantity, projectId: "", salesInvoiceLineId }],
    ...extra,
  });
  step("DN source lines", () => dn.getDeliverySourceLines(businessId, adminId, salesInvoiceId));
  const dn1 = step("DN create draft against invoice", () => dn.saveDeliveryNote(businessId, adminId, dnInput("1"), "draft"))!;
  step("DN edit draft", () => dn.saveDeliveryNote(businessId, adminId, dnInput("2"), "draft", dn1));
  step("DN void draft rejected", () => dn.voidDeliveryNote(businessId, adminId, dn1));
  step("DN post", () => dn.saveDeliveryNote(businessId, adminId, dnInput("2"), "post", dn1));
  step("DN over invoiced quantity rejected", () => dn.saveDeliveryNote(businessId, adminId, dnInput("3"), "post"));
  step("DN wrong customer for invoice rejected", () => dn.saveDeliveryNote(businessId, adminId, dnInput("1", { customerId: customer2Id }), "draft"));
  step("DN line link without invoice rejected", () => dn.saveDeliveryNote(businessId, adminId, dnInput("1", { salesInvoiceId: "" }), "draft"));
  step("DN edit posted reposts", () => dn.saveDeliveryNote(businessId, adminId, dnInput("1.5", { date: D(9) }), "draft", dn1));
  step("DN get", () => dn.getDeliveryNote(businessId, adminId, dn1));
  step("DN to input", () => dn.deliveryNoteToInput(dn.getDeliveryNote(businessId, adminId, dn1)!));
  const dn2 = step("DN manual post with project", () => dn.saveDeliveryNote(businessId, adminId, {
    customerId: customer2Id, salesInvoiceId: "", date: D(10), locationId, reference: "", projectId, notes: "",
    lines: [{ itemId: itemA, description: "Deliver more A", quantity: "1.25", projectId: "", salesInvoiceLineId: "" }, { itemId: itemB, description: "Deliver B", quantity: "1", projectId: "", salesInvoiceLineId: "" }],
  }, "post"))!;
  step("DN insufficient stock rejected", () => dn.saveDeliveryNote(businessId, adminId, {
    customerId: customer2Id, salesInvoiceId: "", date: D(11), locationId, reference: "", projectId: "", notes: "",
    lines: [{ itemId: itemA, description: "Too many", quantity: "999", projectId: "", salesInvoiceLineId: "" }],
  }, "post"));
  step("DN void earlier delivery blocked by chronology", () => dn.voidDeliveryNote(businessId, adminId, dn1));
  step("GR void consumed stock rejected", () => gr.voidGoodsReceipt(businessId, adminId, gr2));
  step("DN void latest", () => dn.voidDeliveryNote(businessId, adminId, dn2));
  step("DN void twice rejected", () => dn.voidDeliveryNote(businessId, adminId, dn2));
  step("DN edit void rejected", () => dn.saveDeliveryNote(businessId, adminId, dnInput("1"), "draft", dn2));
  step("DN delete posted rejected", () => dn.deleteDeliveryNote(businessId, adminId, dn1));
  step("DN standard user denied", () => dn.saveDeliveryNote(businessId, standardId, dnInput("1"), "draft"));
  const dn3 = step("DN create draft to delete", () => dn.saveDeliveryNote(businessId, adminId, dnInput("0.5"), "draft"))!;
  step("DN delete draft", () => dn.deleteDeliveryNote(businessId, adminId, dn3));
  step("DN delete missing rejected", () => dn.deleteDeliveryNote(businessId, adminId, dn3));
  step("DN void latest posted", () => dn.voidDeliveryNote(businessId, adminId, dn1));
  step("DN list", () => dn.listDeliveryNotes(businessId, adminId));
  step("DN list filtered", () => dn.listDeliveryNotes(businessId, adminId, { customerId, from: D(9), to: D(9) }));
  step("GR void latest", () => {
    const latest = sqlite.prepare("SELECT id FROM goods_receipts WHERE reference = 'Manual'").get() as { id: string };
    return gr.voidGoodsReceipt(businessId, adminId, latest.id);
  });
  step("GR void twice rejected", () => {
    const latest = sqlite.prepare("SELECT id FROM goods_receipts WHERE reference = 'Manual'").get() as { id: string };
    return gr.voidGoodsReceipt(businessId, adminId, latest.id);
  });
  step("GR edit void rejected", () => {
    const latest = sqlite.prepare("SELECT id FROM goods_receipts WHERE reference = 'Manual'").get() as { id: string };
    return gr.saveGoodsReceipt(businessId, adminId, grInput("1"), "draft", latest.id);
  });
  const gr4 = step("GR post item C", () => gr.saveGoodsReceipt(businessId, adminId, {
    supplierId, purchaseOrderId: "", purchaseInvoiceId: "", date: D(12), locationId, reference: "C", projectId, notes: "",
    lines: [{ itemId: itemC, description: "Widget C", quantity: "7.125", unitCost: "3.33", projectId: "", purchaseOrderLineId: "", purchaseInvoiceLineId: "" }],
  }, "post"))!;
  step("GR void item C", () => gr.voidGoodsReceipt(businessId, adminId, gr4));
  step("GR get void", () => gr.getGoodsReceipt(businessId, adminId, gr4));
  step("GR get", () => gr.getGoodsReceipt(businessId, adminId, gr1));
  step("GR to input", () => gr.goodsReceiptToInput(gr.getGoodsReceipt(businessId, adminId, gr1)!));
  step("GR list", () => gr.listGoodsReceipts(businessId, adminId));
  step("GR list filtered", () => gr.listGoodsReceipts(businessId, adminId, { supplierId, from: D(6), to: D(6) }));
}

test("non-invoice trade documents keep their exact behaviour (characterization)", () => {
  runScenario();
  const actual = transcript.join("\n") + "\n";
  if (process.env.UPDATE_SNAPSHOTS === "1" || !existsSync(SNAPSHOT)) {
    writeFileSync(SNAPSHOT, actual);
    if (process.env.UPDATE_SNAPSHOTS !== "1") assert.fail(`Snapshot was missing and has been written to ${SNAPSHOT}; rerun the test.`);
    return;
  }
  const expected = readFileSync(SNAPSHOT, "utf8");
  if (actual !== expected) {
    const a = actual.split("\n"), e = expected.split("\n");
    let index = 0;
    while (index < Math.max(a.length, e.length) && a[index] === e[index]) index++;
    const heading = [...e.slice(0, index + 1)].reverse().find((line) => line.startsWith("## "));
    const out = SNAPSHOT.replace(/\.snapshot\.txt$/, ".actual.txt");
    writeFileSync(out, actual);
    assert.fail(`Transcript differs at line ${index + 1} (step ${heading ?? "?"}).\nexpected: ${e[index]}\nactual:   ${a[index]}\nFull actual transcript: ${out}`);
  }
});
