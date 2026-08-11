import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-phase-7-")),
  BETTER_AUTH_SECRET: "phase-7-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { businessMigrations } = await import("../src/core/db/business-migrations");
const { runMigrations } = await import("../src/core/db/migrations/runner");
const { createInvoice, getInvoice, updateInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const {
  getEInvoiceDocument,
  getEInvoiceForSource,
  prepareEInvoice,
  submitEInvoice,
} = await import("../src/modules/einvoicing/einvoice-service");
const { exportBusinessBackup, importBusinessBackup } = await import("../src/core/businesses/backup-service");
const { canAccessModule } = await import("../src/core/permissions/permissions");

test("Phase 7 migration preserves Phase 6 data and creates a disabled provider boundary", () => {
  const legacy = new Database(":memory:");
  runMigrations(legacy, {
    label: "Phase 7 migration fixture",
    migrations: businessMigrations.filter((migration) => migration.version <= 6),
  });
  const now = new Date().toISOString();
  legacy.prepare(`INSERT INTO customers (id, name, status, created_at, updated_at)
    VALUES ('phase7-customer', 'Preserved Customer', 'active', ?, ?)`
  ).run(now, now);
  runMigrations(legacy, { label: "Phase 7 migration fixture", migrations: businessMigrations.filter((migration) => migration.version <= 7) });
  assert.equal((legacy.prepare("SELECT name FROM customers WHERE id = 'phase7-customer'").get() as { name: string }).name, "Preserved Customer");
  const settings = legacy.prepare("SELECT asp_environment, specification_version FROM business_einvoice_settings WHERE id = 'default'").get() as { asp_environment: string; specification_version: string };
  assert.deepEqual(settings, { asp_environment: "disabled", specification_version: "1.0.4" });
  assert.equal((legacy.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version, 7);
  legacy.close();
});

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const standardId = seeded.standard.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const accounting = sqlite.prepare("SELECT default_sales_account_id FROM business_accounting_settings WHERE id = 'default'").get() as { default_sales_account_id: string };
const vatSales = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'standard' AND rate_basis_points = 500 AND direction IN ('sales', 'both') LIMIT 1").get() as { id: string };
const zeroSales = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'zero_rated' AND rate_basis_points = 0 AND direction IN ('sales', 'both') LIMIT 1").get() as { id: string };
const outOfScope = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'out_of_scope' AND direction IN ('sales', 'both') LIMIT 1").get() as { id: string };
const readyCustomer = sqlite.prepare("SELECT id FROM customers WHERE name = 'Emberline Trading LLC'").get() as { id: string };
const incompleteCustomer = sqlite.prepare("SELECT id FROM customers WHERE name = 'Dune Facilities Management'").get() as { id: string };
const demoInvoice = sqlite.prepare("SELECT id FROM sales_invoices WHERE reference = 'DEMO-EINVOICE-INVOICE'").get() as { id: string };
const demoCredit = sqlite.prepare("SELECT id FROM sales_credit_notes WHERE reference = 'DEMO-EINVOICE-CREDIT'").get() as { id: string };

function saleInput(customerId: string, reference: string, taxCodeId: string, amount = "100.00") {
  return {
    customerId,
    projectId: "",
    invoiceDate: "2032-01-15",
    taxDate: "2032-01-15",
    supplyEmirate: "dubai" as const,
    dueDate: "2032-02-15",
    reference,
    lines: [{ itemId: "", description: reference, quantity: "1", unitPrice: amount, salesAccountId: accounting.default_sales_account_id, taxCodeId, projectId: "" }],
  };
}

function accountingSnapshot() {
  return {
    journals: (sqlite.prepare("SELECT COUNT(*) AS value FROM journal_entries").get() as { value: number }).value,
    journalLines: (sqlite.prepare("SELECT COUNT(*) AS value FROM journal_lines").get() as { value: number }).value,
    taxEntries: (sqlite.prepare("SELECT COUNT(*) AS value FROM tax_entries").get() as { value: number }).value,
    taxNet: (sqlite.prepare("SELECT COALESCE(SUM(net_amount_minor), 0) AS value FROM tax_entries").get() as { value: number }).value,
    taxVat: (sqlite.prepare("SELECT COALESCE(SUM(vat_amount_minor), 0) AS value FROM tax_entries").get() as { value: number }).value,
  };
}

test("Phase 7 outbound Electronic Invoicing", async (suite) => {
  await suite.test("valid posted invoice maps to a stable canonical snapshot and passes both official validators", () => {
    const prepared = prepareEInvoice(businessId, adminId, "sales_invoice", demoInvoice.id);
    assert.equal(prepared.status, "Ready", JSON.stringify(prepared.validation?.issues, null, 2));
    assert.match(prepared.uuid, /^[0-9a-f-]{36}$/);
    assert.equal(prepared.specificationVersion, "1.0.4");
    assert.ok(prepared.xmlPayload?.startsWith("<?xml"));
    assert.notEqual(prepared.xmlPayload?.slice(0, 4), "%PDF");
    assert.match(prepared.xmlPayload!, /<Invoice xmlns=/);
    assert.equal(prepared.payloadHash, createHash("sha256").update(prepared.xmlPayload!).digest("hex"));
    assert.equal(prepared.validation?.layers.pintUbl.valid, true);
    assert.equal(prepared.validation?.layers.pintAe.valid, true);
    const canonical = prepared.canonical as { subtotalMinor: number; taxMinor: number; totalMinor: number; profileExecutionId: string };
    const source = getInvoice(businessId, adminId, demoInvoice.id)!;
    assert.deepEqual(
      [canonical.subtotalMinor, canonical.taxMinor, canonical.totalMinor, canonical.profileExecutionId],
      [source.invoice.subtotalMinor, source.invoice.taxMinor, source.invoice.totalMinor, "00000000"],
    );
    const repeated = prepareEInvoice(businessId, adminId, "sales_invoice", demoInvoice.id);
    assert.equal(repeated.uuid, prepared.uuid);
    assert.equal(repeated.payloadHash, prepared.payloadHash);
  });

  await suite.test("missing buyer data and unsupported VAT scenarios fail with actionable readiness errors", () => {
    const incompleteId = createInvoice(businessId, adminId, saleInput(incompleteCustomer.id, "PH7-MISSING-BUYER", vatSales.id), "post");
    const incomplete = prepareEInvoice(businessId, adminId, "sales_invoice", incompleteId);
    assert.equal(incomplete.status, "NeedsData");
    assert.ok(incomplete.validation?.issues.some((entry) => entry.ruleId === "BUYER-ENDPOINT"));
    assert.equal(incomplete.xmlPayload, null);

    const unsupportedId = createInvoice(businessId, adminId, saleInput(readyCustomer.id, "PH7-UNSUPPORTED-VAT", outOfScope.id), "post");
    const unsupported = prepareEInvoice(businessId, adminId, "sales_invoice", unsupportedId);
    assert.equal(unsupported.status, "NeedsData");
    assert.ok(unsupported.validation?.issues.some((entry) => entry.ruleId === "UNSUPPORTED-VAT-CATEGORY"));
  });

  await suite.test("zero-rated outbound invoices use the Phase 6 classification and pass genuine validation", () => {
    const invoiceId = createInvoice(businessId, adminId, saleInput(readyCustomer.id, "PH7-ZERO-RATED", zeroSales.id), "post");
    const prepared = prepareEInvoice(businessId, adminId, "sales_invoice", invoiceId);
    assert.equal(prepared.status, "Ready", JSON.stringify(prepared.validation?.issues, null, 2));
    assert.match(prepared.xmlPayload!, /<cbc:ID>Z<\/cbc:ID>/);
    assert.equal(prepared.validation?.layers.pintUbl.valid, true);
    assert.equal(prepared.validation?.layers.pintAe.valid, true);
  });

  await suite.test("credit note carries the explicit reason and source invoice reference through genuine validation", () => {
    const prepared = prepareEInvoice(businessId, adminId, "sales_credit_note", demoCredit.id);
    assert.equal(prepared.status, "Ready", JSON.stringify(prepared.validation?.issues, null, 2));
    assert.match(prepared.xmlPayload!, /<cbc:ResponseCode>DL8\.61\.1\.D<\/cbc:ResponseCode>/);
    assert.match(prepared.xmlPayload!, /<cac:BillingReference>/);
    const sourceNumber = (sqlite.prepare("SELECT invoice_number FROM sales_invoices WHERE id = ?").get(demoInvoice.id) as { invoice_number: string }).invoice_number;
    assert.match(prepared.xmlPayload!, new RegExp(`<cbc:ID>${sourceNumber}<\\/cbc:ID>`));
    assert.equal(prepared.validation?.layers.pintUbl.valid, true);
    assert.equal(prepared.validation?.layers.pintAe.valid, true);
  });

  await suite.test("financial edits invalidate an unsubmitted Ready snapshot and preserve its UUID for explicit regeneration", () => {
    const invoiceId = createInvoice(businessId, adminId, saleInput(readyCustomer.id, "PH7-EDIT-BEFORE-SUBMIT", vatSales.id), "post");
    const first = prepareEInvoice(businessId, adminId, "sales_invoice", invoiceId);
    assert.equal(first.status, "Ready");
    updateInvoice(businessId, adminId, invoiceId, saleInput(readyCustomer.id, "PH7-EDIT-BEFORE-SUBMIT", vatSales.id, "200.00"), "post");
    const invalidated = getEInvoiceForSource(businessId, adminId, "sales_invoice", invoiceId)!;
    assert.equal(invalidated.status, "NotPrepared");
    assert.equal(invalidated.xmlPayload, null);
    assert.equal(invalidated.payloadHash, null);
    const regenerated = prepareEInvoice(businessId, adminId, "sales_invoice", invoiceId);
    assert.equal(regenerated.status, "Ready");
    assert.equal(regenerated.uuid, first.uuid);
    assert.notEqual(regenerated.payloadHash, first.payloadHash);
  });

  await suite.test("Mock acceptance leaves accounting unchanged and locks the accepted source", async () => {
    const before = accountingSnapshot();
    const prepared = getEInvoiceForSource(businessId, adminId, "sales_invoice", demoInvoice.id)!;
    const accepted = await submitEInvoice(businessId, adminId, prepared.id, "accepted");
    assert.equal(accepted.status, "Accepted");
    assert.equal(accepted.exchangeStatus, "accepted");
    assert.equal(accepted.reportingStatus, "accepted");
    assert.deepEqual(accountingSnapshot(), before);
    assert.equal(accepted.uuid, prepared.uuid);
    assert.equal(accepted.payloadHash, prepared.payloadHash);
    const source = getInvoice(businessId, adminId, demoInvoice.id)!;
    assert.throws(() => updateInvoice(businessId, adminId, demoInvoice.id, {
      customerId: source.invoice.customerId,
      projectId: source.invoice.projectId ?? "",
      invoiceDate: source.invoice.invoiceDate,
      taxDate: source.invoice.taxDate,
      supplyEmirate: source.invoice.supplyEmirate ?? "",
      dueDate: source.invoice.dueDate,
      reference: source.invoice.reference ?? "",
      lines: source.lines.map((line) => ({ itemId: line.itemId ?? "", description: line.description, quantity: String(line.quantityMicros / 10_000), unitPrice: (line.unitPriceMinor / 100).toFixed(2), salesAccountId: line.salesAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })),
    }, "post"), /accepted eInvoice snapshot/i);
  });

  await suite.test("Mock rejection and retry append history without rewriting XML or accounting", async () => {
    const before = accountingSnapshot();
    const prepared = getEInvoiceForSource(businessId, adminId, "sales_credit_note", demoCredit.id)!;
    const rejected = await submitEInvoice(businessId, adminId, prepared.id, "reporting_rejected");
    assert.equal(rejected.status, "Rejected");
    assert.equal(rejected.exchangeStatus, "accepted");
    assert.equal(rejected.reportingStatus, "rejected");
    assert.deepEqual(accountingSnapshot(), before);
    const retried = await submitEInvoice(businessId, adminId, prepared.id, "accepted");
    assert.equal(retried.status, "Accepted");
    assert.equal(retried.payloadHash, prepared.payloadHash);
    assert.equal(retried.uuid, prepared.uuid);
    assert.deepEqual(accountingSnapshot(), before);
    const detail = getEInvoiceDocument(businessId, adminId, prepared.id)!;
    assert.equal(detail.submissions.length, 2);
    assert.deepEqual(detail.submissions.map((row) => row.attempt_number).sort(), [1, 2]);
  });

  await suite.test("provider transport failure is archived without accounting side effects", async () => {
    const invoiceId = createInvoice(businessId, adminId, saleInput(readyCustomer.id, "PH7-PROVIDER-FAILURE", vatSales.id), "post");
    const prepared = prepareEInvoice(businessId, adminId, "sales_invoice", invoiceId);
    const before = accountingSnapshot();
    const failed = await submitEInvoice(businessId, adminId, prepared.id, "provider_error");
    assert.equal(failed.status, "Rejected");
    assert.match(failed.lastError ?? "", /Mock ASP transport failure/);
    assert.equal(failed.payloadHash, prepared.payloadHash);
    assert.deepEqual(accountingSnapshot(), before);
    const detail = getEInvoiceDocument(businessId, adminId, prepared.id)!;
    assert.equal(detail.submissions[0].status, "Failed");
  });

  await suite.test("backup restore preserves the archive, disables provider execution, and never resubmits", async () => {
    const sourceDocuments = (sqlite.prepare("SELECT COUNT(*) AS value FROM einvoice_documents").get() as { value: number }).value;
    const sourceAttempts = (sqlite.prepare("SELECT COUNT(*) AS value FROM einvoice_submissions").get() as { value: number }).value;
    const backup = await exportBusinessBackup(businessId, adminId);
    const backupBuffer = backup.buffer.slice(backup.byteOffset, backup.byteOffset + backup.byteLength) as ArrayBuffer;
    const restoredBusinessId = await importBusinessBackup(backupBuffer, adminId);
    const restored = getBusinessDb(restoredBusinessId, adminId).sqlite;
    assert.equal((restored.prepare("SELECT COUNT(*) AS value FROM einvoice_documents").get() as { value: number }).value, sourceDocuments);
    assert.equal((restored.prepare("SELECT COUNT(*) AS value FROM einvoice_submissions").get() as { value: number }).value, sourceAttempts);
    assert.deepEqual(restored.prepare("SELECT asp_provider_key, asp_environment FROM business_einvoice_settings WHERE id = 'default'").get(), { asp_provider_key: null, asp_environment: "disabled" });
  });

  await suite.test("business and module permissions remain authoritative", () => {
    assert.equal(canAccessModule(businessId, standardId, "sales"), true);
    assert.equal(canAccessModule(businessId, standardId, "settings"), false);
  });
});
