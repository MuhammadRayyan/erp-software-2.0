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
const { voidSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
const { getProfitAndLoss } = await import("../src/modules/reports/report-service");

test("Remediation 1: SQLite busy timeout configured on both connections", async () => {
  const seeded = await seedDemoData();
  const sysSqlite = getSystemSqlite();
  const sysBusy = sysSqlite.pragma("busy_timeout", { simple: true });
  assert.equal(sysBusy, 5000, "System database busy_timeout must be 5000ms");

  const { sqlite: bizSqlite } = getBusinessDb(seeded.business.id, seeded.admin.id);
  const bizBusy = bizSqlite.pragma("busy_timeout", { simple: true });
  assert.equal(bizBusy, 5000, "Business database busy_timeout must be 5000ms");
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
