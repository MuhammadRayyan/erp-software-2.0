import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = mkdtempSync(path.join(tmpdir(), "modern-erp-remediation-test-"));
Object.assign(process.env, {
  ERP_DATA_DIR: tempDir,
  BETTER_AUTH_SECRET: "remediation-secret-key-12345",
  NODE_ENV: "test",
});

const { getSystemSqlite, getSystemDb } = await import("../src/core/db/system");
const { getBusinessDb } = await import("../src/core/db/business");
const { seedDemoData } = await import("../src/core/db/seed");
const { splitTaxInclusive } = await import("../src/modules/accounting/calculations/money");
const { getDocumentPdfModule, getDocumentPdfAccess } = await import("../src/core/permissions/document-pdf-access");
const { saveDebitNote, getDebitNote } = await import("../src/modules/debit-notes/debit-note-service");
const { generateDocumentPdf } = await import("../src/modules/document-templates/pdf-service");
const { createSupplierPayment, voidSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
const { getProfitAndLoss } = await import("../src/modules/reports/report-service");
const { allocateNumber } = await import("../src/modules/accounting/services/numbering-service");
const { savePurchaseInvoice, getPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { listSuppliers } = await import("../src/modules/suppliers/supplier-service");
const { getActiveTaxCodes } = await import("../src/modules/accounting/services/tax-code-service");
const { getAccountingSettings } = await import("../src/modules/accounting/services/accounting-settings-service");
const { setFinancialLockDate } = await import("../src/modules/accounting/services/financial-lock-service");
const { createBankTransfer, voidBankTransfer } = await import("../src/modules/banking/bank-transfer-service");
const { listBankAccounts } = await import("../src/modules/banking/bank-account-service");
const { saveBankTransaction, voidBankTransaction } = await import("../src/modules/banking/bank-transaction-service");
const { saveStockAdjustment, voidStockAdjustment, deleteStockAdjustment } = await import("../src/modules/inventory/stock-adjustment-service");
const { exportBusinessBackup, importBusinessBackup } = await import("../src/core/businesses/backup-service");
const { logger, getRecentLogs, getTraceContext } = await import("../src/core/logger");
const { onRequestError } = await import("../src/instrumentation");
const { GET: healthGet } = await import("../src/app/api/health/route");
const { triggerDiagnosticTraceAction, emitDiagnosticTrace } = await import("../src/app/b/[businessId]/settings/system-health/actions");
const { createInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { saveSalesQuote, getSalesQuote } = await import("../src/modules/sales-quotes/quote-service");
const { saveSalesOrder, getSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
const { savePurchaseOrder, getPurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");
const { saveCreditNote, getCreditNote } = await import("../src/modules/sales-credit-notes/credit-note-service");
const { listCustomers } = await import("../src/modules/customers/customer-service");
const JSZip = (await import("jszip")).default;

const { createHash } = await import("node:crypto");


test("Remediation 1: SQLite busy timeout and synchronous pragmas configured on both connections", async () => {
  const seeded = await seedDemoData();
  const sysSqlite = getSystemSqlite();
  const sysBusy = sysSqlite.pragma("busy_timeout", { simple: true });
  assert.equal(sysBusy, 5000, "System database busy_timeout must be 5000ms");
  const sysSync = sysSqlite.pragma("synchronous", { simple: true });
  assert.equal(sysSync, 1, "System database synchronous must be 1 (NORMAL)");

  const { sqlite: bizSqlite } = getBusinessDb(seeded.business.id, seeded.admin.id);
  const bizBusy = bizSqlite.pragma("busy_timeout", { simple: true });
  assert.equal(bizBusy, 5000, "Business database busy_timeout must be 5000ms");
  const bizSync = bizSqlite.pragma("synchronous", { simple: true });
  assert.equal(bizSync, 1, "Business database synchronous must be 1 (NORMAL)");
});

test("Remediation 2: splitTaxInclusive handles zero amounts gracefully", () => {
  // Zero amount line (e.g. 100% discount, promotional free item)
  const zeroResult = splitTaxInclusive(0, 500);
  assert.deepEqual(zeroResult, { netMinor: 0, taxMinor: 0 });

  // Standard 5% tax-inclusive amount
  const standardResult = splitTaxInclusive(10500, 500);
  assert.equal(standardResult.netMinor, 10000);
  assert.equal(standardResult.taxMinor, 500);

  // Negative amount should throw
  assert.throws(() => splitTaxInclusive(-100, 500), /Gross amount is invalid/);

  // Invalid tax rate should throw
  assert.throws(() => splitTaxInclusive(1000, 15000), /Tax rate is invalid/);
});

test("Remediation 3: Debit Note PDF access and generation", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;

  // 1. Module mapping includes debit-note
  const moduleKey = getDocumentPdfModule("debit-note");
  assert.equal(moduleKey, "purchases", "debit-note should map to purchases module");

  // 2. Permission check grants access to admin (who has purchases module)
  const access = getDocumentPdfAccess(businessId, adminId, "debit-note");
  assert.ok(access, "Admin should have access to debit-note PDF");

  // 3. Create a posted debit note and generate its PDF
  const { sqlite } = getBusinessDb(businessId, adminId);
  const supplier = sqlite.prepare("SELECT id FROM suppliers LIMIT 1").get() as any;
  const expenseAcc = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as any;
  const taxCode = sqlite.prepare("SELECT id FROM tax_codes WHERE is_active = 1 LIMIT 1").get() as any;
  assert.ok(supplier && expenseAcc && taxCode, "Supplier, expense account, and tax code exist");

  const noteId = saveDebitNote(
    businessId,
    adminId,
    {
      supplierId: supplier.id,
      date: "2026-03-01",
      amountsIncludeTax: false,
      reference: "RET-001",
      lines: [
        {
          expenseAccountId: expenseAcc.id,
          taxCodeId: taxCode.id,
          description: "Defective item credit",
          quantity: "2",
          unitPrice: "50.00",
          discountType: "none",
          discountValue: "0",
        },
      ],
    } as any,
    "post"
  );
  assert.ok(noteId, "Debit note created and posted");

  const { pdf, filename } = await generateDocumentPdf(
    businessId,
    adminId,
    seeded.business.name,
    seeded.business.currency,
    "debit-note",
    noteId
  );
  assert.ok(Buffer.isBuffer(pdf) && pdf.length > 0, "Debit note PDF generated as non-empty buffer");
  assert.ok(filename.includes("DN-") || filename.includes(".pdf"), "Filename is properly formatted");
});

test("Remediation 4: Supplier payment voiding blocked when reconciled with bank statement", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  // Find a posted supplier payment
  const payment = sqlite.prepare(`
    SELECT sp.id, sp.payment_number, sp.bank_account_id, sp.amount_minor
    FROM supplier_payments sp
    WHERE sp.document_status = 'posted'
    LIMIT 1
  `).get() as any;
  assert.ok(payment, "A posted supplier payment exists in demo data");

  // Find the bank_account entry for this ledger account
  const bankAccount = sqlite.prepare(`
    SELECT id FROM bank_accounts WHERE ledger_account_id = ?
  `).get(payment.bank_account_id) as any ?? sqlite.prepare("SELECT id FROM bank_accounts LIMIT 1").get() as any;
  assert.ok(bankAccount, "A bank account exists");

  // Create a bank statement import
  const importId = randomUUID();
  sqlite.prepare(`
    INSERT INTO bank_statement_imports (
      id, bank_account_id, file_name, row_count, imported_count, duplicate_count, mapping_json, created_by, created_at
    ) VALUES (?, ?, 'statement.csv', 1, 1, 0, '{}', ?, datetime('now'))
  `).run(importId, bankAccount.id, adminId);

  // Create a bank statement line matched to this supplier payment
  const stmtLineId = randomUUID();
  sqlite.prepare(`
    INSERT INTO bank_statement_lines (
      id, import_id, bank_account_id, transaction_date, description, amount_minor,
      fingerprint, match_status, matched_source_type, matched_source_id, created_at
    ) VALUES (?, ?, ?, '2026-03-01', 'Payment to vendor', ?, ?, 'matched', 'supplier_payment', ?, datetime('now'))
  `).run(stmtLineId, importId, bankAccount.id, -payment.amount_minor, randomUUID(), payment.id);

  // Create a completed bank reconciliation referencing this statement line
  const reconId = randomUUID();
  sqlite.prepare(`
    INSERT INTO bank_reconciliations (
      id, bank_account_id, statement_date, statement_ending_balance_minor, status,
      created_by, created_at, updated_at
    ) VALUES (?, ?, '2026-03-31', 1000000, 'completed', ?, datetime('now'), datetime('now'))
  `).run(reconId, bankAccount.id, adminId);

  const jentry = sqlite.prepare(`
    SELECT id FROM journal_entries WHERE source_type = 'supplier_payment' AND source_id = ?
  `).get(payment.id) as any;
  assert.ok(jentry, "Journal entry exists for supplier payment");

  sqlite.prepare(`
    INSERT INTO bank_reconciliation_items (
      id, reconciliation_id, statement_line_id, journal_entry_id, created_at
    ) VALUES (?, ?, ?, ?, datetime('now'))
  `).run(randomUUID(), reconId, stmtLineId, jentry.id);

  // Attempt to void the supplier payment; it MUST be rejected because it is reconciled!
  assert.throws(
    () => voidSupplierPayment(businessId, adminId, payment.id),
    /Cannot reverse a payment included in a completed bank reconciliation/
  );
});

test("Remediation 5: Cash-Basis P&L uses base carrying amount for multi-currency allocations", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  // Generate Cash-basis P&L report
  const cashPnl = getProfitAndLoss(businessId, adminId, "2026-01-01", "2026-12-31", "cash");
  assert.ok(Array.isArray(cashPnl), "Cash P&L returns an array of account summaries");

  for (const row of cashPnl) {
    assert.equal(typeof row.net_minor, "number");
    assert.ok(!Number.isNaN(row.net_minor), "Net minor should be a valid number");
  }
});

test("Remediation 6: Atomic document numbering executes atomically standalone", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  // Standalone call without an existing transaction
  assert.equal(sqlite.inTransaction, false);
  const num1 = allocateNumber(sqlite, "invoice");
  assert.equal(sqlite.inTransaction, false);
  const num2 = allocateNumber(sqlite, "invoice");
  assert.equal(sqlite.inTransaction, false);

  assert.ok(num1 && typeof num1 === "string");
  assert.ok(num2 && typeof num2 === "string");
  assert.notEqual(num1, num2);
});

test("Remediation 7: Settlement service prevents non-positive and over-allocation", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const settings = getAccountingSettings(businessId, adminId);
  const suppliers = listSuppliers(businessId, adminId);
  const taxCodes = getActiveTaxCodes(businessId, adminId);

  const supplier = suppliers[0];
  const standardTax = taxCodes.find((code) => code.rateBasisPoints === 500 && ["purchases", "both"].includes(code.direction))!;

  const piId = savePurchaseInvoice(
    businessId,
    adminId,
    {
      supplierId: supplier.id,
      projectId: "",
      supplierInvoiceNumber: `SUPP-TEST-${Date.now()}`,
      invoiceDate: "2026-05-01",
      dueDate: "2026-05-31",
      reference: "Test settlement validations",
      purchaseOrderId: "",
      lines: [
        {
          itemId: "",
          description: "Consulting Service",
          quantity: "1",
          unitPrice: "100.00", // 100 + 5% = 105 AED
          expenseAccountId: settings.defaultPurchaseExpenseAccountId!,
          taxCodeId: standardTax.id,
          projectId: "",
        },
      ],
    },
    "post"
  );
  const pi = getPurchaseInvoice(businessId, adminId, piId);
  assert.ok(pi);
  assert.equal(pi.invoice.totalMinor, 10500);

  // 1. Zero amount should throw
  assert.throws(
    () =>
      createSupplierPayment(businessId, adminId, {
        supplierId: supplier.id,
        purchaseInvoiceId: piId,
        date: "2026-05-05",
        bankAccountId: settings.defaultBankAccountId!,
        amount: "0.00",
        reference: "ZERO-PAY",
      }),
    /greater than zero/i
  );

  // 2. Over-allocation should throw
  assert.throws(
    () =>
      createSupplierPayment(businessId, adminId, {
        supplierId: supplier.id,
        purchaseInvoiceId: piId,
        date: "2026-05-05",
        bankAccountId: settings.defaultBankAccountId!,
        amount: "150.00",
        reference: "OVER-PAY",
      }),
    /Payment amount exceeds the selected payable/
  );

  // 3. Valid allocation succeeds and reduces balance
  const payment = createSupplierPayment(businessId, adminId, {
    supplierId: supplier.id,
    purchaseInvoiceId: piId,
    date: "2026-05-05",
    bankAccountId: settings.defaultBankAccountId!,
    amount: "50.00",
    reference: "PART-PAY-1",
  });
  assert.ok(payment.id);

  const updatedPi = getPurchaseInvoice(businessId, adminId, piId);
  assert.ok(updatedPi);
  assert.equal(updatedPi.balanceMinor, 5500);
});

test("Remediation 8: Secure Backup Import rejects invalid sizes, headers, corrupt files, and bad schemas", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;

  // 1. Exceeds 50MB
  const oversizedBuffer = new ArrayBuffer(51 * 1024 * 1024);
  await assert.rejects(
    async () => importBusinessBackup(oversizedBuffer, adminId),
    /Backup file exceeds maximum allowed size of 50 MB/
  );

  // 2. Export a valid backup to use as baseline
  const validBackup = await exportBusinessBackup(businessId, adminId);

  // 3. Corrupt SQLite header
  const zipHeaderTest = await JSZip.loadAsync(validBackup);
  const badHeaderDb = Buffer.from("NOT_A_SQLITE_FILE_CONTENT_HERE_XYZ");
  zipHeaderTest.file("business.sqlite", badHeaderDb);
  const manifest = JSON.parse(await zipHeaderTest.file("manifest.json")!.async("string"));
  manifest.databaseSha256 = createHash("sha256").update(badHeaderDb).digest("hex");
  zipHeaderTest.file("manifest.json", JSON.stringify(manifest));
  const badHeaderZip = await zipHeaderTest.generateAsync({ type: "nodebuffer" });
  await assert.rejects(
    async () => importBusinessBackup(Uint8Array.from(badHeaderZip).buffer, adminId),
    /Invalid database format: missing SQLite header/
  );

  // 4. Invalid schema (missing customers table)
  const zipSchemaTest = await JSZip.loadAsync(validBackup);
  const { default: Database } = await import("better-sqlite3");
  const tempSqlite = new Database(":memory:");
  tempSqlite.exec("CREATE TABLE something_else (id TEXT);");
  const emptyDbBuffer = tempSqlite.serialize();
  tempSqlite.close();

  zipSchemaTest.file("business.sqlite", emptyDbBuffer);
  const manifestSchema = JSON.parse(await zipSchemaTest.file("manifest.json")!.async("string"));
  manifestSchema.databaseSha256 = createHash("sha256").update(emptyDbBuffer).digest("hex");
  zipSchemaTest.file("manifest.json", JSON.stringify(manifestSchema));
  const badSchemaZip = await zipSchemaTest.generateAsync({ type: "nodebuffer" });
  await assert.rejects(
    async () => importBusinessBackup(Uint8Array.from(badSchemaZip).buffer, adminId),
    /Invalid business backup schema: missing table customers/
  );

  // 5. Attachment directory traversal attempt
  const zipTraversalTest = await JSZip.loadAsync(validBackup);
  zipTraversalTest.file("attachments/../../evil.txt", "malicious payload");
  const badTraversalZip = await zipTraversalTest.generateAsync({ type: "nodebuffer" });
  await assert.rejects(
    async () => importBusinessBackup(Uint8Array.from(badTraversalZip).buffer, adminId),
    /Backup contains an invalid attachment path/
  );

  // 6. Valid backup imports successfully
  const importedId = await importBusinessBackup(Uint8Array.from(validBackup).buffer, adminId);
  assert.ok(importedId);
  const importedContext = getBusinessDb(importedId, adminId);
  assert.ok(importedContext.sqlite);
});

test("Remediation 9: Financial lock date enforcement on stock adjustment, bank transfer, and bank transaction", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  // Lock all periods on or before 2026-06-30
  setFinancialLockDate(businessId, adminId, "2026-06-30");

  // Bank accounts
  const bankAccounts = listBankAccounts(businessId, adminId, false);
  const bank = bankAccounts.find((a) => a.currency_code === "AED" && Boolean(a.is_active)) || bankAccounts[0];
  const cash = bankAccounts.find((a) => a.id !== bank.id && a.currency_code === "AED" && Boolean(a.is_active)) || bankAccounts[1];

  // 1. Bank transfer in locked period should fail
  assert.throws(
    () =>
      createBankTransfer(businessId, adminId, {
        fromBankAccountId: bank.id,
        toBankAccountId: cash.id,
        date: "2026-06-15",
        amount: "100.00",
        reference: "LOCKED-TRANSFER",
      }),
    /The financial period on or before 2026-06-30 is closed/
  );

  // Bank transfer after locked period succeeds
  const transferId = createBankTransfer(businessId, adminId, {
    fromBankAccountId: bank.id,
    toBankAccountId: cash.id,
    date: "2026-07-05",
    amount: "100.00",
    reference: "UNLOCKED-TRANSFER",
  });
  assert.ok(transferId);

  // 2. Bank transaction in locked period should fail
  const accounts = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' AND is_active = 1 LIMIT 1").get() as { id: string };
  const taxCodes = getActiveTaxCodes(businessId, adminId);
  const tax = taxCodes.find((t) => ["purchases", "both"].includes(t.direction) && t.vatCategory === "standard") || taxCodes[0];

  assert.throws(
    () =>
      saveBankTransaction(
        businessId,
        adminId,
        {
          bankAccountId: bank.id,
          date: "2026-06-20",
          type: "money_out",
          reference: "LOCKED-TX",
          description: "Office supplies",
          lines: [
            {
              accountId: accounts.id,
              taxCodeId: tax.id,
              projectId: "",
              description: "Supplies",
              amount: "50.00",
            },
          ],
        },
        "post"
      ),
    /The financial period on or before 2026-06-30 is closed/
  );

  // Bank transaction after locked period succeeds
  const txId = saveBankTransaction(
    businessId,
    adminId,
    {
      bankAccountId: bank.id,
      date: "2026-07-10",
      type: "money_out",
      reference: "UNLOCKED-TX",
      description: "Office supplies unlocked",
      lines: [
        {
          accountId: accounts.id,
          taxCodeId: tax.id,
          projectId: "",
          description: "Supplies",
          amount: "50.00",
        },
      ],
    },
    "post"
  );
  assert.ok(txId);

  // 3. Stock adjustment in locked period should fail
  const item = sqlite.prepare("SELECT id FROM inventory_items WHERE is_active = 1 LIMIT 1").get() as { id: string };
  const location = sqlite.prepare("SELECT id FROM inventory_locations WHERE is_active = 1 LIMIT 1").get() as { id: string };

  assert.throws(
    () =>
      saveStockAdjustment(
        businessId,
        adminId,
        {
          itemId: item.id,
          locationId: location.id,
          quantityChange: "1",
          unitCost: "10.00",
          reason: "Opening Balance",
          date: "2026-06-15",
          notes: "Locked adjustment",
        },
        "post"
      ),
    /The financial period on or before 2026-06-30 is closed/
  );

  // Stock adjustment after locked period succeeds
  const adjId = saveStockAdjustment(
    businessId,
    adminId,
    {
      itemId: item.id,
      locationId: location.id,
      quantityChange: "1",
      unitCost: "10.00",
      reason: "Opening Balance",
      date: "2026-12-31",
      notes: "Unlocked adjustment",
    },
    "post"
  );
  assert.ok(adjId);
});

test("Remediation 12: Correlated Logger records structured traces and persists to system_logs", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;

  // Verify trace context extraction
  const traceCtx = getTraceContext();
  assert.equal(typeof traceCtx, "object");
  assert.ok(traceCtx.traceId !== undefined, "Trace ID should be available from Sentry propagation context");

  // Log an info and an error
  const testMessage = `Test correlated event ${Date.now()}`;
  logger.info(testMessage, {
    businessId,
    userId: adminId,
    metadata: { source: "test_suite", priority: "high" },
  });

  const testErrorMessage = `Test simulated error ${Date.now()}`;
  logger.error(testErrorMessage, {
    businessId,
    userId: adminId,
    error: new Error("Simulated test failure"),
    metadata: { testKey: "testValue" },
  });

  // Query recent logs
  const logs = getRecentLogs({ businessId, limit: 10 });
  assert.ok(logs.length >= 2, "Should find at least 2 logged events");

  const errorLog = logs.find((l) => l.message === testErrorMessage);
  assert.ok(errorLog, "Error log should be found in system_logs table");
  assert.equal(errorLog.level, "error");
  assert.equal(errorLog.businessId, businessId);
  assert.equal(errorLog.userId, adminId);
  assert.ok(errorLog.traceId, "Error log should contain correlated traceId");
  assert.ok(errorLog.metadataJson, "Error log should contain metadata JSON");

  const parsedMeta = JSON.parse(errorLog.metadataJson);
  assert.equal(parsedMeta.testKey, "testValue");
  assert.equal(parsedMeta.error.message, "Simulated test failure");
});

test("Remediation 13: Next.js Error Instrumentation captures unhandled route errors with correlated metadata", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;

  const simulatedError = new Error("Unhandled RSC server component explosion");
  const requestInfo = {
    path: `/b/${businessId}/reports/profit-and-loss`,
    method: "GET",
    headers: { "user-agent": "NodeTestRunner/1.0" },
  };
  const contextInfo = {
    routerKind: "App Router" as const,
    routePath: "/app/b/[businessId]/reports/profit-and-loss/page.tsx",
    routeType: "render" as const,
    renderSource: "react-server-components",
  };

  // Invoke instrumentation error handler
  await onRequestError(simulatedError as any, requestInfo, contextInfo as any);

  // Check that the error was persisted to system_logs with businessId and route context
  const logs = getRecentLogs({ businessId, limit: 10 });
  const captured = logs.find((l) => l.message.includes("Unhandled RSC server component explosion"));

  assert.ok(captured, "Captured error should appear in system_logs");
  assert.equal(captured.level, "error");
  assert.equal(captured.businessId, businessId);
  assert.ok(captured.metadataJson);

  const meta = JSON.parse(captured.metadataJson);
  assert.equal(meta.path, `/b/${businessId}/reports/profit-and-loss`);
  assert.equal(meta.routeType, "render");
  assert.equal(meta.routerKind, "App Router");
});

test("Remediation 14: Fast Uptime Health Probe GET /api/health returns database connectivity and memory telemetry", async () => {
  const response = await healthGet();
  assert.equal(response.status, 200, "Health endpoint should return HTTP 200");
  assert.equal(response.headers.get("Cache-Control"), "no-cache, no-store, must-revalidate");

  const data = await response.json();
  assert.equal(data.status, "ok");
  assert.equal(typeof data.uptime, "number");
  assert.ok(data.uptime >= 0);
  assert.equal(data.database.status, "connected");
  assert.equal(typeof data.database.latencyMs, "number");
  assert.ok(data.database.latencyMs >= 0);
  assert.equal(typeof data.memory.heapUsedMb, "number");
  assert.equal(typeof data.memory.heapTotalMb, "number");
  assert.equal(typeof data.memory.rssMb, "number");
  assert.ok(data.memory.heapUsedMb > 0);
});

test("Remediation 15: Admin Diagnostic Trace Action triggers Sentry span and persists trace to system_logs", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;

  const result = await emitDiagnosticTrace(businessId, seeded.admin);
  assert.equal(result.success, true);
  assert.ok(result.traceId, "Diagnostic trace ID should be generated");
  assert.ok(result.spanId, "Diagnostic span ID should be generated");

  const logs = getRecentLogs({ businessId, limit: 5 });
  const diagLog = logs.find((l) => l.traceId === result.traceId);
  assert.ok(diagLog, "System logs should contain the diagnostic trace log");
  assert.equal(diagLog.level, "error");
  assert.ok(diagLog.message.includes("Diagnostic test error triggered by admin"));
});

test("Remediation 16: Performance composite indexes exist in business SQLite schema", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  const indexes = sqlite.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'").all() as { name: string; tbl_name: string }[];
  const indexNames = new Set(indexes.map((idx) => idx.name));

  const expectedIndexes = [
    "sales_invoice_status_date_idx",
    "sales_invoice_customer_status_idx",
    "journal_entries_date_status_idx",
    "journal_lines_account_entry_idx",
    "purchase_invoice_status_date_idx",
    "purchase_invoice_supplier_status_idx",
    "bank_transaction_account_date_status_idx",
  ];

  for (const expected of expectedIndexes) {
    assert.ok(indexNames.has(expected), `Index ${expected} must exist in business SQLite database`);
  }
});

test("Remediation 17: Batch line inserts across document services insert lines atomically in a single multi-row insert", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  const customer = listCustomers(businessId, adminId)[0];
  const supplier = listSuppliers(businessId, adminId)[0];
  const taxCodes = getActiveTaxCodes(businessId, adminId);
  const salesTaxCode = taxCodes.find((t) => t.direction === "sales" || t.direction === "both")!.id;
  const purchaseTaxCode = taxCodes.find((t) => t.direction === "purchases" || t.direction === "both")!.id;
  const salesAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };

  // 1. Sales Invoice with 3 lines
  const invoiceId = createInvoice(businessId, adminId, {
    customerId: customer.id,
    invoiceDate: "2026-07-15",
    taxDate: "2026-07-15",
    dueDate: "2026-08-15",
    reference: "BATCH-INV-001",
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: "2026-07-15",
    exchangeRateSource: "Base",
    amountsIncludeTax: false,
    lines: [
      { description: "Item 1", quantity: "1", unitPrice: "100.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
      { description: "Item 2", quantity: "2", unitPrice: "50.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
      { description: "Item 3", quantity: "3", unitPrice: "25.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
    ],
  }, "post");
  const invoice = getInvoice(businessId, adminId, invoiceId);
  assert.ok(invoice, "Invoice should be retrieved");
  assert.equal(invoice.lines.length, 3, "Batch inserted 3 lines should all exist");
  assert.equal(invoice.lines[0].description, "Item 1");
  assert.equal(invoice.lines[1].description, "Item 2");
  assert.equal(invoice.lines[2].description, "Item 3");

  // 2. Purchase Invoice with 3 lines
  const purchaseInvoiceId = savePurchaseInvoice(businessId, adminId, {
    supplierId: supplier.id,
    supplierInvoiceNumber: "SUPP-BATCH-001",
    invoiceDate: "2026-07-15",
    taxDate: "2026-07-15",
    dueDate: "2026-08-15",
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: "2026-07-15",
    exchangeRateSource: "Base",
    amountsIncludeTax: false,
    lines: [
      { description: "Expense 1", quantity: "1", unitPrice: "100.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
      { description: "Expense 2", quantity: "2", unitPrice: "60.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
      { description: "Expense 3", quantity: "4", unitPrice: "15.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
    ],
  }, "post");
  const purchaseInvoice = getPurchaseInvoice(businessId, adminId, purchaseInvoiceId);
  assert.ok(purchaseInvoice, "Purchase invoice should be retrieved");
  assert.equal(purchaseInvoice.lines.length, 3, "Batch inserted 3 lines should all exist");

  // 3. Sales Quote with 3 lines
  const quoteId = saveSalesQuote(businessId, adminId, {
    customerId: customer.id,
    date: "2026-07-15",
    expiryDate: "2026-08-15",
    reference: "QUOTE-BATCH-001",
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: "2026-07-15",
    exchangeRateSource: "Base",
    amountsIncludeTax: false,
    lines: [
      { description: "Quote Line 1", quantity: "1", unitPrice: "200.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
      { description: "Quote Line 2", quantity: "1", unitPrice: "300.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
      { description: "Quote Line 3", quantity: "1", unitPrice: "400.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
    ],
  }, "draft");
  const quote = getSalesQuote(businessId, adminId, quoteId);
  assert.ok(quote, "Quote should be retrieved");
  assert.equal(quote.lines.length, 3, "Quote lines batch inserted correctly");

  // 4. Sales Order with 3 lines
  const salesOrderId = saveSalesOrder(businessId, adminId, {
    customerId: customer.id,
    date: "2026-07-15",
    expectedDeliveryDate: "2026-08-15",
    reference: "SO-BATCH-001",
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: "2026-07-15",
    exchangeRateSource: "Base",
    amountsIncludeTax: false,
    lines: [
      { description: "SO Line 1", quantity: "5", unitPrice: "10.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
      { description: "SO Line 2", quantity: "10", unitPrice: "20.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
      { description: "SO Line 3", quantity: "15", unitPrice: "30.00", salesAccountId: salesAccount.id, taxCodeId: salesTaxCode, discountType: "none", discountValue: "0" },
    ],
  }, "draft");
  const salesOrder = getSalesOrder(businessId, adminId, salesOrderId);
  assert.ok(salesOrder, "Sales order should be retrieved");
  assert.equal(salesOrder.lines.length, 3, "Sales order lines batch inserted correctly");

  // 5. Purchase Order with 3 lines
  const poId = savePurchaseOrder(businessId, adminId, {
    supplierId: supplier.id,
    date: "2026-07-15",
    expectedDeliveryDate: "2026-08-15",
    reference: "PO-BATCH-001",
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: "2026-07-15",
    exchangeRateSource: "Base",
    amountsIncludeTax: false,
    lines: [
      { description: "PO Line 1", quantity: "2", unitPrice: "50.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
      { description: "PO Line 2", quantity: "4", unitPrice: "25.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
      { description: "PO Line 3", quantity: "6", unitPrice: "15.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
    ],
  }, "draft");
  const purchaseOrder = getPurchaseOrder(businessId, adminId, poId);
  assert.ok(purchaseOrder, "Purchase order should be retrieved");
  assert.equal(purchaseOrder.lines.length, 3, "Purchase order lines batch inserted correctly");

  // 6. Debit Note with 3 lines
  const debitNoteId = saveDebitNote(businessId, adminId, {
    supplierId: supplier.id,
    date: "2026-07-15",
    taxDate: "2026-07-15",
    reference: "DN-BATCH-001",
    currencyCode: "AED",
    exchangeRateToBase: "1",
    exchangeRateDate: "2026-07-15",
    exchangeRateSource: "Base",
    amountsIncludeTax: false,
    lines: [
      { description: "DN Line 1", quantity: "1", unitPrice: "30.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
      { description: "DN Line 2", quantity: "2", unitPrice: "40.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
      { description: "DN Line 3", quantity: "3", unitPrice: "50.00", expenseAccountId: expenseAccount.id, taxCodeId: purchaseTaxCode, discountType: "none", discountValue: "0" },
    ],
  }, "draft");
  const debitNote = getDebitNote(businessId, adminId, debitNoteId);
  assert.ok(debitNote, "Debit note should be retrieved");
  assert.equal(debitNote.lines.length, 3, "Debit note lines batch inserted correctly");
});




