import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-phase-8-")),
  BETTER_AUTH_SECRET: "phase-8-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { businessMigrations } = await import("../src/core/db/business-migrations");
const { runMigrations } = await import("../src/core/db/migrations/runner");
const { exportBusinessBackup, importBusinessBackup } = await import("../src/core/businesses/backup-service");
const { canAccessModule } = await import("../src/core/permissions/permissions");
const {
  createPurchaseInvoiceDraftFromInbound,
  getInboundEInvoice,
  getInboundEInvoiceXml,
  receiveInboundDocument,
  updateInboundDocumentMatch,
} = await import("../src/modules/inbound-einvoicing/inbound-service");
const { buildMockInboundEnvelope } = await import("../src/modules/inbound-einvoicing/mock-fixtures");
const { getPurchaseInvoice, savePurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { createVatPeriod, finalizeVatPeriod, reopenVatPeriod } = await import("../src/modules/tax/vat-period-service");

test("Phase 8 migration preserves Phase 7 data and installs immutable inbound storage", () => {
  const legacy = new Database(":memory:");
  runMigrations(legacy, {
    label: "Phase 8 migration fixture",
    migrations: businessMigrations.filter((migration) => migration.version <= 7),
  });
  const now = new Date().toISOString();
  legacy.prepare(`INSERT INTO suppliers (id, name, tax_reference, is_active, created_at, updated_at)
    VALUES ('phase8-supplier', 'Preserved Supplier', '123', 1, ?, ?)`
  ).run(now, now);
  runMigrations(legacy, { label: "Phase 8 migration fixture", migrations: businessMigrations });
  assert.equal((legacy.prepare("SELECT name FROM suppliers WHERE id = 'phase8-supplier'").get() as { name: string }).name, "Preserved Supplier");
  assert.equal((legacy.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version, 9);
  assert.ok(legacy.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'inbound_einvoice_original_immutable'").get());
  legacy.close();
});

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const standardId = seeded.standard.id;
const { sqlite } = getBusinessDb(businessId, adminId);

function accountingSnapshot() {
  return {
    journals: (sqlite.prepare("SELECT COUNT(*) AS value FROM journal_entries").get() as { value: number }).value,
    taxEntries: (sqlite.prepare("SELECT COUNT(*) AS value FROM tax_entries").get() as { value: number }).value,
    inventoryMovements: (sqlite.prepare("SELECT COUNT(*) AS value FROM inventory_movements").get() as { value: number }).value,
    purchaseInvoices: (sqlite.prepare("SELECT COUNT(*) AS value FROM purchase_invoices").get() as { value: number }).value,
  };
}

function purchaseInput(invoiceId: string) {
  const record = getPurchaseInvoice(businessId, adminId, invoiceId)!;
  return {
    supplierId: record.invoice.supplierId,
    projectId: record.invoice.projectId ?? "",
    supplierInvoiceNumber: record.invoice.supplierInvoiceNumber,
    invoiceDate: record.invoice.invoiceDate,
    taxDate: record.invoice.taxDate,
    dueDate: record.invoice.dueDate,
    reference: record.invoice.reference ?? "",
    purchaseOrderId: record.invoice.purchaseOrderId ?? "",
    lines: record.lines.map((line) => ({
      itemId: line.itemId ?? "",
      description: line.description,
      quantity: String(line.quantityMicros / 10_000),
      unitPrice: (line.unitPriceMinor / 100).toFixed(2),
      expenseAccountId: line.expenseAccountId,
      taxCodeId: line.taxCodeId,
      projectId: line.projectId ?? "",
    })),
  };
}

test("Phase 8 inbound Supplier eInvoices", async (suite) => {
  await suite.test("valid intake archives XML/hash/validation without creating AP, VAT, journal, or stock effects", () => {
    const before = accountingSnapshot();
    const envelope = buildMockInboundEnvelope(businessId, adminId, "valid_invoice");
    const received = receiveInboundDocument(businessId, adminId, envelope);
    assert.equal(received.providerKey, "mock");
    assert.equal(received.environment, "mock");
    assert.equal(received.validation?.layers.pintUbl.valid, true, JSON.stringify(received.validation?.issues, null, 2));
    assert.equal(received.validation?.layers.pintAe.valid, true, JSON.stringify(received.validation?.issues, null, 2));
    const source = getInboundEInvoiceXml(businessId, adminId, received.id)!;
    assert.equal(source.hash, createHash("sha256").update(source.xml).digest("hex"));
    assert.deepEqual(accountingSnapshot(), before);
    assert.throws(() => sqlite.prepare("UPDATE inbound_einvoice_documents SET raw_xml = '<Invoice />' WHERE id = ?").run(received.id), /immutable/i);
    const invalid = receiveInboundDocument(businessId, adminId, buildMockInboundEnvelope(businessId, adminId, "invalid_invoice"));
    assert.equal(invalid.status, "ValidationFailed");
    assert.ok(getInboundEInvoiceXml(businessId, adminId, invalid.id));
    assert.deepEqual(accountingSnapshot(), before);
  });

  await suite.test("unsafe XML and unsupported specification versions are rejected before archival", () => {
    const safe = buildMockInboundEnvelope(businessId, adminId, "valid_invoice");
    const count = (sqlite.prepare("SELECT COUNT(*) AS value FROM inbound_einvoice_documents").get() as { value: number }).value;
    assert.throws(() => receiveInboundDocument(businessId, adminId, {
      ...safe,
      providerDocumentId: "MOCK-UNSAFE",
      providerEventId: "MOCK-UNSAFE-EVENT",
      payload: String(safe.payload).replace(/<\?xml[^?]*\?>/, "$&<!DOCTYPE Invoice [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]>")
    }), /prohibited/i);
    assert.throws(() => receiveInboundDocument(businessId, adminId, {
      ...safe,
      providerDocumentId: "MOCK-UNSUPPORTED",
      providerEventId: "MOCK-UNSUPPORTED-EVENT",
      specificationVersion: "9.9.9",
    }), /not installed/i);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS value FROM inbound_einvoice_documents").get() as { value: number }).value, count);
  });

  await suite.test("supplier matching uses endpoint then TRN and never confirms a name-only match", () => {
    const endpoint = receiveInboundDocument(businessId, adminId, buildMockInboundEnvelope(businessId, adminId, "valid_invoice"));
    assert.ok(endpoint.supplierId);

    const trnEnvelope = buildMockInboundEnvelope(businessId, adminId, "valid_invoice");
    trnEnvelope.providerDocumentId = `MOCK-TRN-${Date.now()}`;
    trnEnvelope.providerEventId = `MOCK-TRN-EVENT-${Date.now()}`;
    trnEnvelope.payload = String(trnEnvelope.payload).replace(/<cbc:EndpointID[^>]*>[^<]+<\/cbc:EndpointID>/, "<cbc:EndpointID schemeID=\"0235\">1888888888</cbc:EndpointID>");
    const trn = receiveInboundDocument(businessId, adminId, trnEnvelope);
    assert.ok(trn.supplierId, "TRN fallback should match the Supplier");

    const nameOnly = buildMockInboundEnvelope(businessId, adminId, "unknown_supplier");
    const knownName = (sqlite.prepare("SELECT legal_name FROM suppliers WHERE id = ?").get(endpoint.supplierId) as { legal_name: string }).legal_name;
    nameOnly.payload = String(nameOnly.payload).replace("Unknown Mock Supplier LLC", knownName);
    const unmatched = receiveInboundDocument(businessId, adminId, nameOnly);
    assert.equal(unmatched.supplierId, null);
    assert.equal(unmatched.status, "NeedsSupplier");
  });

  await suite.test("wrong buyer is quarantined and cannot become a Purchase Invoice", () => {
    const envelope = buildMockInboundEnvelope(businessId, adminId, "valid_invoice");
    envelope.payload = String(envelope.payload)
      .replaceAll("1357902468", "1777777777")
      .replaceAll("135790246801003", "177777777777777")
      .replaceAll("112345678900003", "WRONG-BUYER-TL");
    const received = receiveInboundDocument(businessId, adminId, envelope);
    assert.equal(received.status, "Rejected");
    assert.equal(received.buyerIdentityVerified, false);
    assert.throws(() => createPurchaseInvoiceDraftFromInbound(businessId, adminId, received.id), /resolve validation/i);
  });

  await suite.test("hard duplicate UUID/provider payload returns the existing archive and cannot create a second payable", () => {
    const envelope = buildMockInboundEnvelope(businessId, adminId, "duplicate_invoice");
    const first = receiveInboundDocument(businessId, adminId, envelope);
    const count = (sqlite.prepare("SELECT COUNT(*) AS value FROM inbound_einvoice_documents").get() as { value: number }).value;
    const duplicate = receiveInboundDocument(businessId, adminId, envelope);
    assert.equal(duplicate.id, first.id);
    assert.equal(duplicate.duplicateReceived, true);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS value FROM inbound_einvoice_documents").get() as { value: number }).value, count);
  });

  await suite.test("explicit PO and Goods Receipt references produce deterministic quantities and variance", () => {
    const po = receiveInboundDocument(businessId, adminId, buildMockInboundEnvelope(businessId, adminId, "po_matched_invoice"));
    const poRecord = getInboundEInvoice(businessId, adminId, po.id)!;
    assert.ok(poRecord.purchaseOrderId);
    assert.ok(poRecord.lines.every((line) => line.purchase_order_line_id && line.match_status === "Matched"));
    const wrongSupplierOrder = sqlite.prepare(`
      SELECT id FROM purchase_orders WHERE supplier_id <> ? AND status <> 'cancelled' LIMIT 1
    `).get(poRecord.supplierId) as { id: string };
    assert.throws(() => updateInboundDocumentMatch(businessId, adminId, po.id, wrongSupplierOrder.id, null), /another Supplier/i);
    const gr = receiveInboundDocument(businessId, adminId, buildMockInboundEnvelope(businessId, adminId, "goods_receipt_matched_invoice"));
    const grRecord = getInboundEInvoice(businessId, adminId, gr.id)!;
    assert.ok(grRecord.goodsReceiptId);
    assert.ok(grRecord.comparison.some((line) => Number(line.received_micros) > 0));
  });

  await suite.test("reviewed inbound Invoice creates a Draft only; final post uses the existing Purchase Invoice service", () => {
    const received = receiveInboundDocument(businessId, adminId, buildMockInboundEnvelope(businessId, adminId, "po_matched_invoice"));
    assert.equal(received.status, "ReadyForDraft", JSON.stringify(received.validation?.issues, null, 2));
    const before = accountingSnapshot();
    const invoiceId = createPurchaseInvoiceDraftFromInbound(businessId, adminId, received.id);
    const draft = getPurchaseInvoice(businessId, adminId, invoiceId)!;
    assert.equal(draft.invoice.documentStatus, "draft");
    assert.equal(draft.invoice.inboundEInvoiceDocumentId, received.id);
    assert.ok(draft.inboundSource?.totalsMatch);
    assert.deepEqual({ ...accountingSnapshot(), purchaseInvoices: before.purchaseInvoices }, before);
    assert.equal(accountingSnapshot().purchaseInvoices, before.purchaseInvoices + 1);

    savePurchaseInvoice(businessId, adminId, purchaseInput(invoiceId), "post", invoiceId);
    const posted = getPurchaseInvoice(businessId, adminId, invoiceId)!;
    assert.equal(posted.invoice.documentStatus, "posted");
    assert.ok(posted.journal);
    assert.ok((sqlite.prepare("SELECT 1 FROM tax_entries WHERE source_type = 'purchase_invoice' AND source_id = ?").get(invoiceId)));
    assert.equal(getInboundEInvoice(businessId, adminId, received.id)!.status, "Processed");
    assert.equal(accountingSnapshot().inventoryMovements, before.inventoryMovements, "Purchase Invoice posting does not move physical stock");
  });

  await suite.test("supplier invoice number duplicate and unsupported VAT both block payable creation", () => {
    const postedInbound = sqlite.prepare(`
      SELECT inbound_einvoice_document_id AS id FROM purchase_invoices
      WHERE inbound_einvoice_document_id IS NOT NULL AND document_status = 'posted' LIMIT 1
    `).get() as { id: string };
    const posted = getInboundEInvoice(businessId, adminId, postedInbound.id)!;
    assert.throws(() => savePurchaseInvoice(businessId, adminId, {
      supplierId: posted.supplierId!, projectId: "", supplierInvoiceNumber: posted.documentNumber,
      invoiceDate: posted.issueDate, taxDate: posted.taxDate ?? posted.issueDate,
      dueDate: posted.dueDate!, reference: "duplicate check", purchaseOrderId: "",
      lines: [{ itemId: "", description: "Duplicate", quantity: "1", unitPrice: "1.00", expenseAccountId: "acct-purchases-6100", taxCodeId: "tax-no-vat", projectId: "" }],
    }, "draft"), /already exists/i);
    const vat = receiveInboundDocument(businessId, adminId, buildMockInboundEnvelope(businessId, adminId, "vat_mismatch"));
    assert.notEqual(vat.status, "ReadyForDraft");
    assert.throws(() => createPurchaseInvoiceDraftFromInbound(businessId, adminId, vat.id), /resolve validation/i);
  });

  await suite.test("a finalized VAT period still blocks final posting of an inbound-created draft", () => {
    const envelope = buildMockInboundEnvelope(businessId, adminId, "po_matched_invoice");
    const currentIssueDate = String(envelope.payload).match(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/)?.[1];
    const currentDueDate = String(envelope.payload).match(/<cbc:DueDate>([^<]+)<\/cbc:DueDate>/)?.[1];
    envelope.payload = String(envelope.payload)
      .replaceAll(currentIssueDate!, "2035-01-15")
      .replaceAll(currentDueDate!, "2035-02-15");
    const received = receiveInboundDocument(businessId, adminId, envelope);
    const invoiceId = createPurchaseInvoiceDraftFromInbound(businessId, adminId, received.id);
    const periodId = createVatPeriod(businessId, adminId, {
      periodReference: "PH8-Jan-2035", startDate: "2035-01-01", endDate: "2035-01-31",
      filingDueDate: "2035-02-28", notes: "Phase 8 lock regression",
    });
    finalizeVatPeriod(businessId, adminId, periodId);
    assert.throws(() => savePurchaseInvoice(businessId, adminId, purchaseInput(invoiceId), "post", invoiceId), /finalized|locked/i);
    reopenVatPeriod(businessId, adminId, periodId, { reason: "Phase 8 regression cleanup" });
  });

  await suite.test("inbound Credit Note stays archived and honestly non-convertible", () => {
    const credit = receiveInboundDocument(businessId, adminId, buildMockInboundEnvelope(businessId, adminId, "unsupported_credit_note"));
    assert.equal(credit.documentType, "credit_note");
    assert.match(credit.lastError ?? "", /conversion not yet supported/i);
    assert.throws(() => createPurchaseInvoiceDraftFromInbound(businessId, adminId, credit.id), /resolve validation/i);
  });

  await suite.test("permissions, business isolation, and backup preserve archives without replay", async () => {
    assert.equal(canAccessModule(businessId, standardId, "purchases"), false);
    assert.throws(() => getInboundEInvoiceXml("00000000-0000-4000-8000-000000000000", adminId, "missing"), /BUSINESS_ACCESS_DENIED/);
    const sourceDocuments = (sqlite.prepare("SELECT COUNT(*) AS value FROM inbound_einvoice_documents").get() as { value: number }).value;
    const sourceEvents = (sqlite.prepare("SELECT COUNT(*) AS value FROM inbound_einvoice_events").get() as { value: number }).value;
    const backup = await exportBusinessBackup(businessId, adminId);
    const buffer = backup.buffer.slice(backup.byteOffset, backup.byteOffset + backup.byteLength) as ArrayBuffer;
    const restoredBusinessId = await importBusinessBackup(buffer, adminId);
    const restored = getBusinessDb(restoredBusinessId, adminId).sqlite;
    assert.equal((restored.prepare("SELECT COUNT(*) AS value FROM inbound_einvoice_documents").get() as { value: number }).value, sourceDocuments);
    assert.equal((restored.prepare("SELECT COUNT(*) AS value FROM inbound_einvoice_events").get() as { value: number }).value, sourceEvents);
    assert.equal((restored.prepare("SELECT COUNT(*) AS value FROM journal_entries WHERE source_type = 'purchase_invoice'").get() as { value: number }).value,
      (sqlite.prepare("SELECT COUNT(*) AS value FROM journal_entries WHERE source_type = 'purchase_invoice'").get() as { value: number }).value);
    assert.deepEqual(restored.prepare("SELECT asp_provider_key, asp_environment FROM business_einvoice_settings WHERE id = 'default'").get(), { asp_provider_key: null, asp_environment: "disabled" });
  });
});
