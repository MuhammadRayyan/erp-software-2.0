import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "erp-hardening-")),
  NODE_ENV: "test", BETTER_AUTH_SECRET: "isolated-hardening-tests-not-a-production-secret",
});
const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb, closeAllBusinessConnections } = await import("../src/core/db/business");
const { getSystemSqlite } = await import("../src/core/db/system");
const { assertMutationPermission, assertSavePermission } = await import("../src/core/permissions/mutation-permissions");
const { getDocumentPdfAccess } = await import("../src/core/permissions/document-pdf-access");
const { createInvoice, updateInvoice, postInvoice, duplicateInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { savePurchaseInvoice, paidForPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { saveDebitNote, voidDebitNote } = await import("../src/modules/debit-notes/debit-note-service");
const { getAccountsPayable } = await import("../src/modules/reports/report-service");
const { saveEmployee, savePayslip, postPayslipToLedger, voidPayslip, getPayslipWithLines } = await import("../src/modules/payroll/services/payroll-service");
const { calculateUaeEosb } = await import("../src/modules/payroll/services/eosb-calculator");
const { reconcileBusinessDatabase } = await import("../src/core/db/reconciliation");
const { addMinor, roundMinorRatio, sumMinorRatios } = await import("../src/modules/accounting/calculations/money");
const { getTrustedOrigins } = await import("../src/core/config/app-url");
const { resolveBetterAuthSecret } = await import("../src/core/auth/auth-config");
const { saveEmailTemplate } = await import("../src/modules/email/email-template-service");
const { createPaymentTerm } = await import("../src/modules/payment-terms/payment-terms-service");
const { createAccount } = await import("../src/modules/accounting/services/account-service");
const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
const { saveBankAccount } = await import("../src/modules/banking/bank-account-service");
const { createProject } = await import("../src/modules/projects/project-service");
const { saveInventoryItem } = await import("../src/modules/inventory/inventory-item-service");
const { saveFormDefaults } = await import("../src/modules/form-defaults/form-defaults-service");
const { sendEmail, listSentEmails, getSentEmail } = await import("../src/modules/email/email-service");
const { getEmailDriver } = await import("../src/modules/email/email-driver");

test("Production hardening: permissions, financial state, recovery and startup", async suite => {
  const seeded = await seedDemoData(), businessId = seeded.business.id, admin = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, admin), system = getSystemSqlite();
  function member(capabilities: Record<string, string[]>) {
    const id = randomUUID(), now = Date.now();
    system.prepare('INSERT INTO user (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (?,?,?,1,?,?)')
      .run(id, "Synthetic member", `${id}@example.invalid`, now, now);
    system.prepare('INSERT INTO business_memberships (id,business_id,user_id,role,modules_json,created_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), businessId, id, "standard", JSON.stringify(capabilities), new Date().toISOString());
    return id;
  }
  const viewer = member(Object.fromEntries(["sales", "purchases", "accounting", "banking", "projects", "inventory", "payroll", "settings", "reports"].map(m => [m, ["view"]])));
  const creator = member({ sales: ["view", "create"] });
  const customer = (sqlite.prepare("SELECT id FROM customers LIMIT 1").get() as { id: string }).id;
  const supplier = (sqlite.prepare("SELECT id FROM suppliers LIMIT 1").get() as { id: string }).id;
  const tax = (sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category='out_of_scope' AND direction='both' LIMIT 1").get() as { id: string }).id;
  const income = (sqlite.prepare("SELECT id FROM accounts WHERE type='income' AND is_active=1 LIMIT 1").get() as { id: string }).id;
  const expense = (sqlite.prepare("SELECT id FROM accounts WHERE type='expense' AND is_active=1 LIMIT 1").get() as { id: string }).id;
  const invoiceInput = { currencyCode: "AED", customerId: customer, invoiceDate: "2026-10-25", dueDate: "2026-10-25", lines: [{ description: "Synthetic invoice", quantity: "1", unitPrice: "100", salesAccountId: income, taxCodeId: tax }] };

  await suite.test("view access never authorizes writes or exports in any module", () => {
    for (const requiredModule of ["sales", "purchases", "accounting", "banking", "projects", "inventory", "payroll", "settings"] as const) {
      for (const action of ["create", "edit", "delete", "post", "export"]) assert.throws(() => assertMutationPermission(businessId, viewer, requiredModule, action), /PERMISSION_DENIED/);
    }
    const denied = [
      () => createInvoice(businessId, viewer, invoiceInput, "post"),
      () => createCustomer(businessId, viewer, {} as never),
      () => createSupplier(businessId, viewer, {} as never),
      () => createAccount(businessId, viewer, {} as never),
      () => saveBankAccount(businessId, viewer, {} as never),
      () => createProject(businessId, viewer, {} as never),
      () => saveInventoryItem(businessId, viewer, {} as never),
      () => saveEmployee(businessId, viewer, { name: "Denied" }),
      () => saveFormDefaults(businessId, viewer, "sales-invoice", {}),
      () => createPaymentTerm(businessId, viewer, { name: "Denied" }),
      () => saveEmailTemplate(businessId, viewer, "sales-invoice", { subject: "Denied", body: "Denied" }),
    ];
    for (const command of denied) assert.throws(command, /PERMISSION_DENIED/);
    assert.equal(getDocumentPdfAccess(businessId, viewer, "sales-invoice"), null);
  });

  await suite.test("create-only users can save drafts but cannot edit, duplicate-post or post", () => {
    const id = createInvoice(businessId, creator, invoiceInput, "draft");
    assert.throws(() => createInvoice(businessId, creator, invoiceInput, "post"), /PERMISSION_DENIED/);
    assert.throws(() => updateInvoice(businessId, creator, id, invoiceInput, "draft"), /PERMISSION_DENIED/);
    assert.throws(() => postInvoice(businessId, creator, id), /PERMISSION_DENIED/);
    assert.ok(duplicateInvoice(businessId, creator, id));
    assert.throws(() => assertSavePermission(businessId, admin, "sales", undefined, "posted"), /Invalid/);
  });

  await suite.test("cross-business actors, suspended users and suspended businesses cannot mutate", () => {
    assert.throws(() => createInvoice(randomUUID(), admin, invoiceInput, "draft"), /PERMISSION_DENIED/);
    system.prepare("UPDATE user SET status='suspended' WHERE id=?").run(creator);
    assert.throws(() => createInvoice(businessId, creator, invoiceInput, "draft"), /PERMISSION_DENIED/);
    system.prepare("UPDATE user SET status='active' WHERE id=?").run(creator);
    system.prepare("UPDATE businesses SET status='suspended' WHERE id=?").run(businessId);
    // A super-admin can intentionally inspect suspended businesses; regular members cannot write.
    assert.throws(() => createInvoice(businessId, creator, invoiceInput, "draft"), /PERMISSION_DENIED/);
    system.prepare("UPDATE businesses SET status='active' WHERE id=?").run(businessId);
  });

  await suite.test("editing a posted document requires posting permission even with draft intent", () => {
    const editor = member({ sales: ["view", "edit"] });
    const id = createInvoice(businessId, admin, invoiceInput, "post");
    const before = sqlite.prepare("SELECT total_minor, updated_at FROM sales_invoices WHERE id=?").get(id);
    assert.throws(() => updateInvoice(businessId, editor, id, { ...invoiceInput, lines: [{ ...invoiceInput.lines[0], unitPrice: "200" }] }, "draft"), /PERMISSION_DENIED/);
    assert.deepEqual(sqlite.prepare("SELECT total_minor, updated_at FROM sales_invoices WHERE id=?").get(id), before);
  });

  await suite.test("reconciliation detects a posted document without its journal", () => {
    const id = createInvoice(businessId, admin, invoiceInput, "draft");
    sqlite.prepare("UPDATE sales_invoices SET document_status='posted' WHERE id=?").run(id);
    try { assert.throws(() => reconcileBusinessDatabase(sqlite), /missingDocumentJournals/); }
    finally { sqlite.prepare("UPDATE sales_invoices SET document_status='draft' WHERE id=?").run(id); }
    reconcileBusinessDatabase(sqlite);
  });

  await suite.test("payroll status cannot be forged; posted payroll is immutable and posting is idempotent", () => {
    const employeeId = saveEmployee(businessId, admin, { name: "Synthetic employee", isActive: true });
    const input = { employeeId, date: "2026-10-25", lines: [{ type: "earnings" as const, description: "Salary", accountId: expense, amountMinor: 100000 }] };
    assert.throws(() => savePayslip(businessId, admin, { ...input, documentStatus: "posted", autoPost: false }), /status is controlled/);
    const id = savePayslip(businessId, admin, { ...input, autoPost: true });
    assert.equal(getPayslipWithLines(businessId, admin, id)?.payslip.documentStatus, "posted");
    assert.ok(getPayslipWithLines(businessId, admin, id)?.payslip.journalEntryId);
    const count = () => (sqlite.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE source_id=?").get(id) as { n: number }).n;
    assert.equal(count(), 1);
    postPayslipToLedger(businessId, admin, id);
    assert.equal(count(), 1);
    assert.throws(() => savePayslip(businessId, admin, { ...input, id, autoPost: false }), /Posted payslips cannot be edited/);
    assert.throws(() => savePayslip(businessId, admin, { ...input, id: randomUUID() }), /not found/);
    reconcileBusinessDatabase(sqlite);
    voidPayslip(businessId, admin, id);
    assert.equal(getPayslipWithLines(businessId, admin, id)?.payslip.documentStatus, "void");
    reconcileBusinessDatabase(sqlite);
    assert.throws(() => savePayslip(businessId, admin, { ...input, lines: [{ ...input.lines[0], amountMinor: Number.MAX_SAFE_INTEGER + 1 }] }), /non-negative/);
  });

  await suite.test("AP aging and invoice detail both include posted debit notes and their reversals", () => {
    const bill = savePurchaseInvoice(businessId, admin, { supplierId: supplier, currencyCode: "AED", supplierInvoiceNumber: "HARDENING-AP", invoiceDate: "2026-10-25", dueDate: "2026-10-25", lines: [{ description: "Synthetic bill", quantity: "1", unitPrice: "100", expenseAccountId: expense, taxCodeId: tax }] }, "post");
    const note = saveDebitNote(businessId, admin, { supplierId: supplier, purchaseInvoiceId: bill, date: "2026-10-25", currencyCode: "AED", lines: [{ description: "Synthetic debit", quantity: "1", unitPrice: "20", expenseAccountId: expense, taxCodeId: tax }] }, "post");
    assert.equal(paidForPurchaseInvoice(sqlite, bill), 2000);
    assert.equal(getAccountsPayable(businessId, admin).find(r => r.document_id === bill)?.total_minor, 8000);
    voidDebitNote(businessId, admin, note);
    assert.equal(paidForPurchaseInvoice(sqlite, bill), 0);
    assert.equal(getAccountsPayable(businessId, admin).find(r => r.document_id === bill)?.total_minor, 10000);
    reconcileBusinessDatabase(sqlite);
  });

  await suite.test("email history respects document-module access", async () => {
    const salesReader = member({ sales: ["view"] });
    const email = await sendEmail(businessId, admin, { from: { email: "synthetic@example.invalid" }, to: [{ email: "synthetic@example.invalid" }], subject: "Synthetic purchase", bodyHtml: "<p>Synthetic fixture</p>", relatedEntityType: "purchase_invoice" });
    assert.ok(getSentEmail(businessId, admin, email.id));
    assert.equal(getSentEmail(businessId, salesReader, email.id), null);
    assert.ok(!listSentEmails(businessId, salesReader).some(row => row.id === email.id));
  });

  await suite.test("production cannot report a simulated email as sent", async () => {
    const priorMode = process.env.NODE_ENV, priorHost = process.env.SMTP_HOST;
    try {
      Object.assign(process.env, { NODE_ENV: "production" }); delete process.env.SMTP_HOST;
      const driver = getEmailDriver();
      assert.equal(driver.name, "disabled");
      const result = await driver.send({ from: { email: "synthetic@example.invalid" }, to: [{ email: "synthetic@example.invalid" }], subject: "Synthetic", bodyHtml: "<p>Fixture</p>" });
      assert.equal(result.ok, false);
    } finally {
      Object.assign(process.env, { NODE_ENV: priorMode });
      if (priorHost === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = priorHost;
    }
  });

  await suite.test("EOSB rounds exact ratios at the boundary and rejects impossible dates", () => {
    const result = calculateUaeEosb({ joiningDate: "2025-01-01", terminationDate: "2025-12-31", basicSalaryMinor: 100000, unusedLeaveDays: 3 });
    assert.equal(result.gratuityMinor, 70000);
    assert.equal(result.leaveEncashmentMinor, 10000);
    assert.equal(result.totalSettlementMinor, 80000);
    for (const joiningDate of ["2025-02-31", "2025-13-01", "2025-01-01suffix"]) assert.throws(() => calculateUaeEosb({ joiningDate, terminationDate: "2026-10-25", basicSalaryMinor: 100000 }), /valid calendar/);
    assert.equal(roundMinorRatio(-1n, 2n), -1);
    assert.throws(() => addMinor([Number.MAX_SAFE_INTEGER, 1]), /too large/);
    assert.throws(() => addMinor([1.2]), /safe integers/);
    assert.equal(sumMinorRatios([{ amountMinor: 1, allocatedMinor: 1, totalMinor: 2 }, { amountMinor: 1, allocatedMinor: 1, totalMinor: 2 }]), 1);
    for (const amountMinor of [1, 99, 1000001, Number.MAX_SAFE_INTEGER]) {
      assert.equal(sumMinorRatios([{ amountMinor, allocatedMinor: 17, totalMinor: 31 }]), roundMinorRatio(BigInt(amountMinor) * 17n, 31n));
    }
  });

  await suite.test("production origins cannot be granted by attacker-controlled headers", () => {
    const prior = { NODE_ENV: process.env.NODE_ENV, APP_DOMAIN: process.env.APP_DOMAIN, BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS };
    try {
      Object.assign(process.env, { NODE_ENV: "production", APP_DOMAIN: "erp.example.invalid" });
      process.env.BETTER_AUTH_TRUSTED_ORIGINS = "https://erp.example.invalid";
      const origins = getTrustedOrigins(new Request("https://erp.example.invalid", { headers: { origin: "https://evil.invalid", "x-forwarded-host": "evil.invalid", "x-forwarded-proto": "http" } }));
      assert.deepEqual(origins, ["https://erp.example.invalid"]);
      process.env.BETTER_AUTH_TRUSTED_ORIGINS = "http://public.example.invalid";
      assert.throws(() => getTrustedOrigins(), /HTTPS/);
    } finally {
      for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
    for (const secret of [
      "short",
      "ledgerly-secret-change-in-production-random-key-64chars",
      "uae-manager-secret-change-in-production-random-key-64chars",
      "replace-with-a-long-random-secret",
    ]) {
      assert.throws(() => resolveBetterAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: secret }), /32 random characters/);
    }
    assert.equal(resolveBetterAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: "a-random-test-only-secret-with-at-least-thirty-two-characters" }).length > 32, true);
  });

  closeAllBusinessConnections();
});

test("failed system initialization never publishes a cached healthy handle", () => {
  const root = mkdtempSync(path.join(tmpdir(), "erp-failed-migration-"));
  const moduleUrl = pathToFileURL(path.resolve("src/core/db/system.ts")).href;
  const code = `import Database from 'better-sqlite3'; import {mkdirSync} from 'node:fs';
    const {getSystemSqlite,migrateSystemDatabase}=await import(${JSON.stringify(moduleUrl)});
    mkdirSync(process.env.ERP_DATA_DIR+'/system',{recursive:true});
    const db=new Database(process.env.ERP_DATA_DIR+'/system/system.sqlite'); migrateSystemDatabase(db);
    db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES (999,?,?)').run('future','now'); db.close();
    let rejected=0;for(let i=0;i<2;i++){try{getSystemSqlite()}catch{rejected++}}if(rejected!==2)process.exit(1);`;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], { env: { ...process.env, ERP_DATA_DIR: root }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
});
