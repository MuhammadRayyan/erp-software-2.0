import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  inspectManagerBackup,
  importManagerBackupToNewBusiness,
  computeImportedDocumentLines,
  convertManagerJournalLines,
  managerAmountToMinor,
  managerQuantityToScaled,
} from "../../src/modules/migration/manager-importer";
import { MANAGER_CONTENT_TYPES, extractManagerData } from "../../src/modules/migration/manager-extractor";
import { getBusinessDb } from "../../src/core/db/business";
import { getSystemDb, getSystemSqlite } from "../../src/core/db/system";
import { reconcileBusinessDatabase } from "../../src/core/db/reconciliation";
import { users } from "../../src/core/db/system-schema";
import { exportBusinessBackup, importBusinessBackup } from "../../src/core/businesses/backup-service";


type Sqlite = Database.Database;

function scalar(sqlite: Sqlite, sql: string, ...params: unknown[]) {
  const row = sqlite.prepare(sql).get(...params) as { v: number | null } | undefined;
  return Number(row?.v ?? 0);
}

/**
 * Ledger invariants every posted Manager.io import must satisfy: balanced trial
 * balance, every posted document journaled, AR/AP control accounts equal to the
 * open subledger net of unallocated receipts/payments, and VAT detail matching
 * the posted documents and the GL VAT accounts.
 */
function assertImportedLedgerConsistent(sqlite: Sqlite) {
  const postedLines = `FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'`;
  assert.equal(
    scalar(sqlite, `SELECT SUM(jl.debit_minor) AS v ${postedLines}`),
    scalar(sqlite, `SELECT SUM(jl.credit_minor) AS v ${postedLines}`),
    "Trial balance debits must equal credits",
  );

  for (const [table, source] of [
    ["sales_invoices", "sales_invoice"], ["purchase_invoices", "purchase_invoice"],
    ["receipts", "receipt"], ["supplier_payments", "supplier_payment"], ["bank_transfers", "bank_transfer"],
  ]) {
    assert.equal(scalar(sqlite, `SELECT COUNT(*) AS v FROM ${table} d WHERE d.document_status = 'posted'
      AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = ? AND je.source_id = d.id AND je.status = 'posted')`, source),
    0, `Every posted ${table} row must have a posted journal`);
  }
  assert.equal(scalar(sqlite, `SELECT COUNT(*) AS v FROM payslips p LEFT JOIN journal_entries je ON je.id = p.journal_entry_id
    WHERE p.document_status = 'posted' AND (je.id IS NULL OR je.source_type <> 'payslip' OR je.source_id <> p.id)`), 0,
  "Every posted payslip must link its payroll journal");

  const settings = sqlite.prepare(`SELECT accounts_receivable_account_id AS ar, accounts_payable_account_id AS ap,
    vat_output_account_id AS vatOut, input_vat_account_id AS vatIn FROM business_accounting_settings WHERE id = 'default'`).get() as
    { ar: string; ap: string; vatOut: string; vatIn: string };

  const glAr = scalar(sqlite, `SELECT SUM(jl.debit_minor - jl.credit_minor) AS v ${postedLines} WHERE jl.account_id = ?`, settings.ar);
  const openInvoices = scalar(sqlite, `SELECT SUM(i.total_minor - COALESCE((SELECT SUM(ra.amount_minor) FROM receipt_allocations ra
    JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted' WHERE ra.sales_invoice_id = i.id), 0)) AS v
    FROM sales_invoices i WHERE i.document_status = 'posted'`);
  const unallocatedReceipts = scalar(sqlite, `SELECT SUM(r.amount_minor - COALESCE((SELECT SUM(ra.amount_minor) FROM receipt_allocations ra
    WHERE ra.receipt_id = r.id), 0)) AS v FROM receipts r WHERE r.document_status = 'posted'`);
  assert.equal(glAr, openInvoices - unallocatedReceipts, "GL AR must equal open customer invoices minus unallocated receipts");

  const glAp = scalar(sqlite, `SELECT SUM(jl.credit_minor - jl.debit_minor) AS v ${postedLines} WHERE jl.account_id = ?`, settings.ap);
  const openBills = scalar(sqlite, `SELECT SUM(b.total_minor - COALESCE((SELECT SUM(pa.amount_minor) FROM supplier_payment_allocations pa
    JOIN supplier_payments p ON p.id = pa.payment_id AND p.document_status = 'posted' WHERE pa.purchase_invoice_id = b.id), 0)) AS v
    FROM purchase_invoices b WHERE b.document_status = 'posted'`);
  const unallocatedPayments = scalar(sqlite, `SELECT SUM(p.amount_minor - COALESCE((SELECT SUM(pa.amount_minor) FROM supplier_payment_allocations pa
    WHERE pa.payment_id = p.id), 0)) AS v FROM supplier_payments p WHERE p.document_status = 'posted'`);
  assert.equal(glAp, openBills - unallocatedPayments, "GL AP must equal open supplier bills minus unallocated payments");

  for (const [table, source] of [["sales_invoices", "sales_invoice"], ["purchase_invoices", "purchase_invoice"]]) {
    assert.equal(scalar(sqlite, `SELECT COUNT(*) AS v FROM ${table} d WHERE d.document_status = 'posted'
      AND NOT EXISTS (SELECT 1 FROM tax_entries te WHERE te.source_type = ? AND te.source_id = d.id)`, source),
    0, `Every posted ${table} row must have VAT tax_entries`);
  }
  const outputVat = scalar(sqlite, "SELECT SUM(output_vat_minor) AS v FROM tax_entries WHERE source_type = 'sales_invoice'");
  assert.equal(outputVat, scalar(sqlite, "SELECT SUM(tax_minor) AS v FROM sales_invoices WHERE document_status = 'posted'"),
    "Output VAT detail must equal posted invoice VAT");
  assert.equal(outputVat, scalar(sqlite, `SELECT SUM(jl.credit_minor - jl.debit_minor) AS v ${postedLines} WHERE jl.account_id = ?`, settings.vatOut),
    "Output VAT detail must equal the GL output VAT account");
  const inputVat = scalar(sqlite, "SELECT SUM(recoverable_vat_minor) AS v FROM tax_entries WHERE source_type = 'purchase_invoice'");
  assert.equal(inputVat, scalar(sqlite, "SELECT SUM(tax_minor) AS v FROM purchase_invoices WHERE document_status = 'posted'"),
    "Recoverable VAT detail must equal posted bill VAT");
  assert.equal(inputVat, scalar(sqlite, `SELECT SUM(jl.debit_minor - jl.credit_minor) AS v ${postedLines} WHERE jl.account_id = ?`, settings.vatIn),
    "Recoverable VAT detail must equal the GL input VAT account");

  reconcileBusinessDatabase(sqlite);
}

test("Manager.io Universal Migration & Contracting Architecture Suite", { skip: !existsSync(path.resolve(process.cwd(), "manager_backup_file.manager")) && "private Manager.io fixture not present" }, async (t) => {
  const legacyFilePath = path.resolve(process.cwd(), "manager_backup_file.manager");
  const contractingFilePath1 = path.resolve(process.cwd(), "Al Qamar Al Muneer Tech. Cont.  (2026-10-19).manager");
  const contractingFilePath2 = path.resolve(process.cwd(), "AQAMTC_(Saleem) (2026-10-19).manager");

  // Setup test user
  const systemDb = getSystemDb();
  const testUserId = "manager-migration-test-user";
  systemDb.insert(users).values({
    id: testUserId,
    name: "Migration Test Admin",
    email: "migration-test@uaemanager.internal",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing().run();

  let importedLegacyBusinessId: string | undefined;
  let importedContractingBusinessId: string | undefined;

  // -------------------------------------------------------------
  // PART 1: LEGACY BENCHMARK (MASS AUTO REPARING)
  // -------------------------------------------------------------
  await t.test("1. Inspect Legacy Manager.io backup metadata (MASS AUTO REPARING)", () => {
    const fileBuffer = readFileSync(legacyFilePath);
    const start = Date.now();
    const inspection = inspectManagerBackup(fileBuffer);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 100, `Inspection took ${elapsed}ms; should be < 100ms`);
    assert.equal(inspection.businessName, "MASS AUTO REPARING");
    assert.equal(inspection.trn, "100565644000003");
    assert.equal(inspection.country, "United Arab Emirates");
    assert.equal(inspection.currency, "AED");
    assert.equal(inspection.customersCount, 307);
    assert.equal(inspection.suppliersCount, 148);
    assert.equal(inspection.inventoryItemsCount, 645);
    assert.equal(inspection.fixedAssetsCount, 251);
    assert.equal(inspection.projectsCount, 955);
    assert.equal(inspection.salesInvoicesCount, 68);
    assert.equal(inspection.purchaseInvoicesCount, 105);
    assert.equal(inspection.salesQuotesCount, 183);
    assert.equal(inspection.salesOrdersCount, 1);
    assert.equal(inspection.bankTransfersCount, 24);
    assert.equal(inspection.bankAccountsCount, 7);
    assert.equal(inspection.accountsCount, 61);
  });

  await t.test("2. Migrate Legacy Manager.io backup with Active Ledger Mode", () => {
    const fileBuffer = readFileSync(legacyFilePath);
    const result = importManagerBackupToNewBusiness(fileBuffer, testUserId, {
      overrideBusinessName: "MASS AUTO REPARING (Migrated)",
      documentStatus: "posted",
    });
    assert.ok(result.businessId);
    importedLegacyBusinessId = result.businessId;

    const context = getBusinessDb(result.businessId, testUserId);
    const customersCount = (context.sqlite.prepare("SELECT count(*) as c FROM customers").get() as any).c;
    assert.equal(customersCount, 307);

    const suppliersCount = (context.sqlite.prepare("SELECT count(*) as c FROM suppliers").get() as any).c;
    assert.equal(suppliersCount, 148);

    const projectsCount = (context.sqlite.prepare("SELECT count(*) as c FROM projects").get() as any).c;
    assert.equal(projectsCount, 955);

    const itemsCount = (context.sqlite.prepare("SELECT count(*) as c FROM inventory_items").get() as any).c;
    assert.equal(itemsCount, 645 + 251);

    // All documents are still imported, but only those the app's posting services can
    // actually post (positive total, known party) become 'posted' with GL + VAT entries.
    // Zero-value documents (no price decoded from the legacy Manager format) are kept as
    // drafts for review instead of posted documents with no ledger effect.
    const invoices = context.sqlite.prepare("SELECT count(*) as c, sum(CASE WHEN document_status = 'posted' THEN 1 ELSE 0 END) as p FROM sales_invoices").get() as any;
    assert.equal(invoices.c, 68);
    assert.equal(invoices.p, result.ledger.invoicesPosted);
    assert.equal(invoices.c - invoices.p, result.ledger.invoicesLeftAsDraft);
    assert.equal(scalar(context.sqlite, "SELECT COUNT(*) AS v FROM sales_invoices WHERE document_status = 'draft' AND total_minor > 0"), 0,
      "Only zero-value invoices may be left as drafts for this backup");

    const bills = context.sqlite.prepare("SELECT count(*) as c, sum(CASE WHEN document_status = 'posted' THEN 1 ELSE 0 END) as p FROM purchase_invoices").get() as any;
    assert.equal(bills.c, 105);
    assert.equal(bills.p, result.ledger.billsPosted);
    assert.ok(bills.p > 0, "Valued purchase invoices must be posted");
    assert.equal(scalar(context.sqlite, "SELECT COUNT(*) AS v FROM purchase_invoices WHERE document_status = 'draft' AND total_minor > 0"), 0,
      "Only zero-value bills may be left as drafts for this backup");

    // Quantities use the app's 4-decimal scale (1 unit = 10,000), never micro-units.
    const sourceDb = new Database(legacyFilePath, { readonly: true, fileMustExist: true });
    let expectedQuantityUnits = 0;
    try {
      const extracted = extractManagerData(sourceDb);
      expectedQuantityUnits = extracted.salesInvoices.flatMap((inv) => inv.lines)
        .filter((line) => line.quantity * line.unitPrice >= 0)
        .reduce((sum, line) => sum + managerQuantityToScaled(line.quantity), 0);
    } finally {
      sourceDb.close();
    }
    assert.equal(scalar(context.sqlite, "SELECT SUM(quantity_micros) AS v FROM sales_invoice_lines"), expectedQuantityUnits);
    // Manager line tax codes are mapped (modern lines reference the Manager 5% VAT code).
    assert.ok(result.ledger.taxLinesMapped > 0, "Modern Manager lines must map their tax code");

    assertImportedLedgerConsistent(context.sqlite);
  });

  // -------------------------------------------------------------
  // PART 2: MODERN CONTRACTING (AL QAMAR AL MUNEER TECH. CONT. - 31MB)
  // -------------------------------------------------------------
  if (existsSync(contractingFilePath1)) {
    await t.test("3. Inspect Modern Contracting Backup (Al Qamar - 31.2 MB) with optional performance budget", () => {
      const fileBuffer = readFileSync(contractingFilePath1);
      const start = Date.now();
      const inspection = inspectManagerBackup(fileBuffer);
      const elapsed = Date.now() - start;

      if (process.env.ERP_RUN_PERF === "1") assert.ok(elapsed < 500, `Inspection exceeded the controlled performance budget: ${elapsed}ms`);
      assert.equal(inspection.businessName, "Al Qamar Al Muneer Tech. Cont.");
      assert.equal(inspection.trn, "104959072000003");
      assert.equal(inspection.customersCount, 89);
      assert.equal(inspection.suppliersCount, 490);
      assert.equal(inspection.projectsCount, 70);
      assert.equal(inspection.inventoryItemsCount, 71);
      assert.equal(inspection.bankAccountsCount, 7);
      assert.equal(inspection.bankTransfersCount, 416);
      assert.equal(inspection.salesInvoicesCount, 169);
      assert.equal(inspection.purchaseInvoicesCount, 3545);
      assert.equal(inspection.salesQuotesCount, 244);
      assert.equal(inspection.salesOrdersCount, 124);
      assert.equal(inspection.receiptsCount, 172);
      assert.equal(inspection.paymentsCount, 3881);
      assert.equal(inspection.employeesCount, 19);
      assert.equal(inspection.payslipsCount, 205);
      assert.equal(inspection.journalEntriesCount, 6);
    });

    await t.test("4. Full High-Speed Migration of Al Qamar Contracting Ledger (8,500+ Transactions)", () => {
      const fileBuffer = readFileSync(contractingFilePath1);
      const start = Date.now();
      const result = importManagerBackupToNewBusiness(fileBuffer, testUserId, {
        overrideBusinessName: "Al Qamar Al Muneer Tech. Cont. (Active Ledger)",
        documentStatus: "posted",
      });
      const elapsed = Date.now() - start;
      console.log(`[TEST INFO] 31MB Al Qamar ingestion completed in ${elapsed}ms`);

      assert.ok(result.businessId);
      importedContractingBusinessId = result.businessId;

      const context = getBusinessDb(result.businessId, testUserId);

      // Verify Customers & Suppliers
      const custCount = (context.sqlite.prepare("SELECT count(*) as c FROM customers").get() as any).c;
      assert.equal(custCount, 89);
      const suppCount = (context.sqlite.prepare("SELECT count(*) as c FROM suppliers").get() as any).c;
      assert.equal(suppCount, 490);

      // Verify Contracting Sites / Projects
      const prjCount = (context.sqlite.prepare("SELECT count(*) as c FROM projects").get() as any).c;
      assert.equal(prjCount, 70);

      // Verify Sales Orders
      const orderCount = (context.sqlite.prepare("SELECT count(*) as c FROM sales_orders").get() as any).c;
      assert.equal(orderCount, 124);

      // Verify Sales Invoices & Line Projects
      const invCount = (context.sqlite.prepare("SELECT count(*) as c FROM sales_invoices WHERE document_status = 'posted'").get() as any).c;
      assert.equal(invCount, 169);

      // Verify Purchase Bills & Line Projects
      const billCount = (context.sqlite.prepare("SELECT count(*) as c FROM purchase_invoices WHERE document_status = 'posted'").get() as any).c;
      assert.equal(billCount, 3545);

      // Verify Customer Receipts & Allocations
      const rcvCount = (context.sqlite.prepare("SELECT count(*) as c FROM receipts WHERE document_status = 'posted'").get() as any).c;
      assert.equal(rcvCount, 172);
      const rcvAllocCount = (context.sqlite.prepare("SELECT count(*) as c FROM receipt_allocations").get() as any).c;
      assert.ok(rcvAllocCount > 0, "Receipt allocations must be populated for customer payments");

      // Verify Supplier Payments & Allocations
      const payCount = (context.sqlite.prepare("SELECT count(*) as c FROM supplier_payments WHERE document_status = 'posted'").get() as any).c;
      assert.equal(payCount, 3881);
      const payAllocCount = (context.sqlite.prepare("SELECT count(*) as c FROM supplier_payment_allocations").get() as any).c;
      assert.ok(payAllocCount > 0, "Supplier payment allocations must be populated for bill payments");

      // Verify Employees (Migration 33)
      const empCount = (context.sqlite.prepare("SELECT count(*) as c FROM employees").get() as any).c;
      assert.equal(empCount, 19);

      // Verify Payslips (Migration 33)
      const slipCount = (context.sqlite.prepare("SELECT count(*) as c FROM payslips WHERE document_status = 'posted'").get() as any).c;
      assert.equal(slipCount, 205);

      // Verify Journal Entries
      const jeCount = (context.sqlite.prepare("SELECT count(*) as c FROM journal_entries").get() as any).c;
      assert.equal(jeCount, 6);
    });
  }

  // -------------------------------------------------------------
  // PART 3: SECOND BACKUP VERIFICATION (AQAMTC SALIM - 4.58MB)
  // -------------------------------------------------------------
  if (existsSync(contractingFilePath2)) {
    await t.test("5. Migrate AQAMTC Salim in Draft Review Mode", () => {
      const fileBuffer = readFileSync(contractingFilePath2);
      const result = importManagerBackupToNewBusiness(fileBuffer, testUserId, {
        overrideBusinessName: "AQAMTC Saleem (Draft Review)",
        documentStatus: "draft",
      });
      assert.ok(result.businessId);

      const context = getBusinessDb(result.businessId, testUserId);
      const invDrafts = (context.sqlite.prepare("SELECT count(*) as c FROM sales_invoices WHERE document_status = 'draft'").get() as any).c;
      assert.equal(invDrafts, 139);

      const billDrafts = (context.sqlite.prepare("SELECT count(*) as c FROM purchase_invoices WHERE document_status = 'draft'").get() as any).c;
      assert.equal(billDrafts, 3110);

      const empCount = (context.sqlite.prepare("SELECT count(*) as c FROM employees").get() as any).c;
      assert.equal(empCount, 18);

      const slipCount = (context.sqlite.prepare("SELECT count(*) as c FROM payslips WHERE document_status = 'draft'").get() as any).c;
      assert.equal(slipCount, 176);
    });
  }

  // -------------------------------------------------------------
  // PART 4: NATIVE .ERPBACKUP ROUNDTRIP PRESERVATION
  // -------------------------------------------------------------
  await t.test("6. Native .erpbackup export and restore preserves contracting entities (Employees, Payslips)", async () => {
    const targetBusinessId = importedContractingBusinessId || importedLegacyBusinessId;
    assert.ok(targetBusinessId);

    // Export .erpbackup
    const backupBuffer = await exportBusinessBackup(targetBusinessId, testUserId);
    assert.ok(backupBuffer.byteLength > 1000);

    // Re-import .erpbackup into fresh workspace
    const reimportedId = await importBusinessBackup(backupBuffer, testUserId);
    assert.ok(reimportedId);

    // Verify database contents in re-imported business
    const reimportedContext = getBusinessDb(reimportedId, testUserId);
    if (importedContractingBusinessId) {
      const empCount = (reimportedContext.sqlite.prepare("SELECT count(*) as c FROM employees").get() as any).c;
      assert.equal(empCount, 19, "Employees must be 100% preserved in .erpbackup roundtrip");
      const slipCount = (reimportedContext.sqlite.prepare("SELECT count(*) as c FROM payslips").get() as any).c;
      assert.equal(slipCount, 205, "Payslips must be 100% preserved in .erpbackup roundtrip");
    } else {
      const custCount = (reimportedContext.sqlite.prepare("SELECT count(*) as c FROM customers").get() as any).c;
      assert.equal(custCount, 307);
    }
  });
});

// -------------------------------------------------------------
// SYNTHETIC COVERAGE (no private customer backup required)
// -------------------------------------------------------------

test("Manager.io import conversion helpers use exact decimal math and the app quantity scale", () => {
  // Quantity scale is QUANTITY_SCALE = 10,000 (4 decimals), not micro-units.
  assert.equal(managerQuantityToScaled(1), 10_000);
  assert.equal(managerQuantityToScaled(2.5), 25_000);
  assert.equal(managerQuantityToScaled(0.12345), 1_235);

  // HALF_UP rounding at the currency's real minor unit, immune to float artefacts.
  assert.equal(managerAmountToMinor(0.1 + 0.2, 2), 30);
  assert.equal(managerAmountToMinor(1.005, 2), 101);
  assert.equal(managerAmountToMinor(1.2345, 3), 1_235);
  assert.equal(managerAmountToMinor(-2.5, 0), -3);

  // 3-decimal currency (e.g. KWD): 3 x 1.2345 = 3.7035 -> 3.704; VAT 5% of 3.704 = 0.1852 -> 0.185.
  const kwd = computeImportedDocumentLines(
    [{ quantity: 3, unitPrice: 1.2345, taxCode: { id: "std", rateBasisPoints: 500 } }],
    3,
  );
  assert.equal(kwd.lines[0].quantityMicros, 30_000);
  assert.equal(kwd.lines[0].unitPriceMinor, 1_235);
  assert.equal(kwd.lines[0].netAmountMinor, 3_704);
  assert.equal(kwd.lines[0].taxAmountMinor, 185);
  assert.equal(kwd.totalMinor, 3_889);

  // Negative (discount) lines become fixed discounts on same-tax-code lines; 0% lines carry no VAT.
  const doc = computeImportedDocumentLines([
    { quantity: 1.5, unitPrice: 10.01, taxCode: { id: "std", rateBasisPoints: 500 } },
    { quantity: 1, unitPrice: 200, taxCode: { id: "zero", rateBasisPoints: 0 } },
    { quantity: 1, unitPrice: -2, taxCode: { id: "std", rateBasisPoints: 500 } },
  ], 2);
  assert.equal(doc.lines.length, 2);
  assert.equal(doc.lines[0].discountMinor, 200);
  assert.equal(doc.lines[0].netAmountMinor, 1_302); // 15.015 -> 15.02, less 2.00
  assert.equal(doc.lines[0].taxAmountMinor, 65); // 5% of 13.02 = 0.651 -> 0.65
  assert.equal(doc.lines[1].taxAmountMinor, 0);
  assert.equal(doc.totalMinor, 21_367);
  assert.equal(doc.unappliedDiscountMinor, 0);

  // A credit larger than the document cannot be absorbed and is reported.
  const overCredit = computeImportedDocumentLines([
    { quantity: 1, unitPrice: 5, taxCode: { id: "std", rateBasisPoints: 500 } },
    { quantity: 1, unitPrice: -7, taxCode: { id: "std", rateBasisPoints: 500 } },
  ], 2);
  assert.equal(overCredit.unappliedDiscountMinor, 200);

  // Journals: two-sided lines are netted (not dropped); unbalanced entries are rejected by number.
  const balanced = convertManagerJournalLines("JE-7", [
    { debit: 10.1, credit: 0.1 },
    { debit: 0, credit: 10 },
    { debit: 0, credit: 0 },
  ], 2);
  assert.deepEqual(balanced.lines.map((l) => [l.debitMinor, l.creditMinor]), [[1_000, 0], [0, 1_000]]);
  assert.throws(
    () => convertManagerJournalLines("JE-9", [{ debit: 10, credit: 0 }, { debit: 0, credit: 9.99 }], 2),
    /JE-9.*not balanced/,
  );
});

// --- Minimal protobuf-net writer to synthesise a Manager.io backup ---------------------------

type PbValue = number | string | Buffer | PbField[];
type PbField = [number, PbValue];

function pbVarint(value: number) {
  const bytes: number[] = [];
  let v = BigInt(value);
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (v > 0n);
  return Buffer.from(bytes);
}

function pbEncode(fields: PbField[]): Buffer {
  const parts: Buffer[] = [];
  for (const [field, value] of fields) {
    if (typeof value === "number") {
      parts.push(pbVarint(field << 3), pbVarint(value));
      continue;
    }
    const payload = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.isBuffer(value) ? value : pbEncode(value);
    parts.push(pbVarint((field << 3) | 2), pbVarint(payload.length), payload);
  }
  return Buffer.concat(parts);
}

/** .NET Guid -> protobuf-net bcl.Guid sub-message (two fixed64 halves of Guid.ToByteArray()). */
function pbGuid(guid: string): Buffer {
  const hex = guid.replace(/-/g, "");
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(parseInt(hex.slice(0, 8), 16), 0);
  bytes.writeUInt16LE(parseInt(hex.slice(8, 12), 16), 4);
  bytes.writeUInt16LE(parseInt(hex.slice(12, 16), 16), 6);
  Buffer.from(hex.slice(16), "hex").copy(bytes, 8);
  return Buffer.concat([Buffer.from([0x09]), bytes.subarray(0, 8), Buffer.from([0x11]), bytes.subarray(8, 16)]);
}

/** protobuf-net bcl.Decimal: field 1 = low bits, field 3 = (scale << 1) | sign. */
function pbDecimal(value: string): PbField[] {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const low = Number(`${whole}${fraction}`);
  const fields: PbField[] = [];
  if (low !== 0) fields.push([1, low]);
  if (fraction.length || negative) fields.push([3, (fraction.length << 1) | (negative ? 1 : 0)]);
  return fields;
}

function pbDate(iso: string): PbField[] {
  const days = Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  return [[1, days * 2]]; // zigzag of a positive day count
}

const synthId = (n: number) => `000000${n.toString(16).padStart(2, "0")}-0000-0000-0000-000000000000`;

function buildSyntheticManagerBackup(options: { unbalancedJournal?: boolean } = {}) {
  const M = MANAGER_CONTENT_TYPES;
  const ids = {
    incomeGroup: synthId(1), expenseGroup: synthId(2), salesAcct: synthId(3), expenseAcct: synthId(4),
    bank: synthId(5), customer: synthId(6), supplier: synthId(7), vat5: synthId(8), vat0: synthId(9),
    invoice: synthId(10), bill: synthId(11), receipt: synthId(12), payment: synthId(13), journal: synthId(14),
  };
  const rows: Array<[string, string, Buffer]> = [
    [synthId(99), M.BUSINESS_DETAILS, pbEncode([[1, "Synthetic Trading LLC"], [2, "Dubai"]])],
    [ids.incomeGroup, M.ACCOUNT_GROUPS, pbEncode([[1, "Income"]])],
    [ids.expenseGroup, M.ACCOUNT_GROUPS, pbEncode([[1, "Expenses"]])],
    [ids.salesAcct, M.CHART_OF_ACCOUNTS, pbEncode([[1, "Workshop Sales"], [3, pbGuid(ids.incomeGroup)]])],
    [ids.expenseAcct, M.CHART_OF_ACCOUNTS, pbEncode([[1, "Spare Parts"], [3, pbGuid(ids.expenseGroup)]])],
    [ids.bank, M.BANK_AND_CASH_ACCOUNTS, pbEncode([[1, "Main Bank"]])],
    [ids.customer, M.CUSTOMERS, pbEncode([[1, "Synthetic Customer"]])],
    [ids.supplier, M.SUPPLIERS, pbEncode([[1, "Synthetic Supplier"]])],
    [ids.vat5, M.TAX_CODES, pbEncode([[1, "VAT"], [4, pbDecimal("5")]])],
    [ids.vat0, M.TAX_CODES, pbEncode([[1, "Zero rated"], [4, pbDecimal("0")]])],
    [ids.invoice, M.SALES_INVOICES_MODERN, pbEncode([
      [1, pbDate("2026-01-10")], [2, "SI-001"], [3, pbGuid(ids.customer)],
      [49, [[2, pbGuid(ids.salesAcct)], [17, "Labour"], [18, pbDecimal("1.5")], [19, pbDecimal("10.01")], [21, pbGuid(ids.vat5)]]],
      [49, [[2, pbGuid(ids.salesAcct)], [17, "Export parts"], [18, pbDecimal("1")], [19, pbDecimal("200")], [21, pbGuid(ids.vat0)]]],
      [49, [[2, pbGuid(ids.salesAcct)], [17, "Discount"], [18, pbDecimal("1")], [19, pbDecimal("-2.00")], [21, pbGuid(ids.vat5)]]],
    ])],
    [ids.bill, M.PURCHASE_INVOICES_MODERN, pbEncode([
      [1, pbDate("2026-01-05")], [2, "PI-001"], [3, pbGuid(ids.supplier)],
      [23, [[2, pbGuid(ids.expenseAcct)], [17, "Filters"], [18, pbDecimal("3")], [19, pbDecimal("33.333")], [21, pbGuid(ids.vat5)]]],
    ])],
    [ids.receipt, M.RECEIPTS_MODERN, pbEncode([
      [1, pbDate("2026-01-15")], [2, "RC-001"], [4, pbGuid(ids.customer)], [7, pbGuid(ids.bank)], [10, "Part payment"],
      [11, [[4, pbGuid(ids.invoice)], [18, pbDecimal("100")]]],
      [11, [[18, pbDecimal("50")]]],
    ])],
    [ids.payment, M.PAYMENTS_MODERN, pbEncode([
      [1, pbDate("2026-01-20")], [2, "PY-001"], [7, pbGuid(ids.bank)], [10, "Bill settlement"],
      [11, [[7, pbGuid(ids.supplier)], [8, pbGuid(ids.bill)], [18, pbDecimal("105")]]],
    ])],
    [ids.journal, M.JOURNAL_ENTRIES, pbEncode([
      [1, pbDate("2026-01-25")], [2, "MJ-001"], [3, "Reclass"],
      [14, [[1, pbGuid(ids.expenseAcct)], [12, "Expense"], [13, pbDecimal("10")]]],
      [14, [[1, pbGuid(ids.bank)], [12, "Bank"], [14, pbDecimal(options.unbalancedJournal ? "9.99" : "10")]]],
    ])],
  ];

  const dir = mkdtempSync(path.join(tmpdir(), "synthetic-manager-"));
  const file = path.join(dir, "synthetic.manager");
  const db = new Database(file);
  try {
    db.exec('CREATE TABLE "Objects" (Key TEXT PRIMARY KEY, ContentType TEXT NOT NULL, Content BLOB NOT NULL)');
    const insert = db.prepare('INSERT INTO "Objects" (Key, ContentType, Content) VALUES (?, ?, ?)');
    for (const row of rows) insert.run(...row);
  } finally {
    db.close();
  }
  const buffer = readFileSync(file);
  rmSync(dir, { recursive: true, force: true });
  return { buffer, ids };
}

test("Manager.io import posts synthetic documents through the real posting services", () => {
  const userId = "manager-migration-synthetic-user";
  getSystemDb().insert(users).values({
    id: userId,
    name: "Synthetic Migration Admin",
    email: "synthetic-migration@uaemanager.internal",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing().run();

  const { buffer, ids } = buildSyntheticManagerBackup();
  const result = importManagerBackupToNewBusiness(buffer, userId, { documentStatus: "posted" });
  const { sqlite } = getBusinessDb(result.businessId, userId);

  assert.deepEqual(
    {
      invoicesPosted: result.ledger.invoicesPosted, billsPosted: result.ledger.billsPosted,
      receiptsPosted: result.ledger.receiptsPosted, paymentsPosted: result.ledger.paymentsPosted,
      journalsPosted: result.ledger.journalsPosted, taxLinesMapped: result.ledger.taxLinesMapped,
      taxLinesDefaulted: result.ledger.taxLinesDefaulted,
    },
    { invoicesPosted: 1, billsPosted: 1, receiptsPosted: 1, paymentsPosted: 1, journalsPosted: 1, taxLinesMapped: 4, taxLinesDefaulted: 0 },
  );

  const invoice = sqlite.prepare("SELECT document_status, subtotal_minor, tax_minor, total_minor FROM sales_invoices WHERE id = ?").get(ids.invoice);
  assert.deepEqual(invoice, { document_status: "posted", subtotal_minor: 21_302, tax_minor: 65, total_minor: 21_367 });
  const invoiceLines = sqlite.prepare(`SELECT quantity_micros, unit_price_minor, discount_type, discount_value, tax_code_id,
    net_amount_minor, tax_amount_minor, sales_account_id FROM sales_invoice_lines WHERE invoice_id = ? ORDER BY position`).all(ids.invoice);
  assert.deepEqual(invoiceLines, [
    { quantity_micros: 15_000, unit_price_minor: 1_001, discount_type: "fixed", discount_value: "2.00", tax_code_id: "tax-uae-vat-5-sales", net_amount_minor: 1_302, tax_amount_minor: 65, sales_account_id: ids.salesAcct },
    { quantity_micros: 10_000, unit_price_minor: 20_000, discount_type: "none", discount_value: "0", tax_code_id: "tax-zero-rated-sales", net_amount_minor: 20_000, tax_amount_minor: 0, sales_account_id: ids.salesAcct },
  ]);

  // 3 x 33.333 = 99.999 -> 100.00 exactly once; recoverable purchase VAT code.
  const bill = sqlite.prepare("SELECT document_status, subtotal_minor, tax_minor, total_minor FROM purchase_invoices WHERE id = ?").get(ids.bill);
  assert.deepEqual(bill, { document_status: "posted", subtotal_minor: 10_000, tax_minor: 500, total_minor: 10_500 });
  assert.equal(scalar(sqlite, "SELECT COUNT(*) AS v FROM purchase_invoice_lines WHERE tax_code_id = 'tax-uae-vat-5-purchases'"), 1);

  // Receipt of 150 pays 100 against the invoice; 50 stays unallocated customer credit.
  assert.equal(scalar(sqlite, "SELECT SUM(amount_minor) AS v FROM receipt_allocations WHERE receipt_id = ?", ids.receipt), 10_000);
  assert.equal(scalar(sqlite, "SELECT amount_minor AS v FROM receipts WHERE id = ?", ids.receipt), 15_000);
  // Supplier payment fully settles the bill.
  assert.equal(scalar(sqlite, "SELECT SUM(amount_minor) AS v FROM supplier_payment_allocations WHERE payment_id = ?", ids.payment), 10_500);

  // GL: AR 213.67 - 150.00 = 63.67; AP 105.00 - 105.00 = 0; VAT 201 boxes come from tax_entries.
  const settings = sqlite.prepare("SELECT accounts_receivable_account_id AS ar, accounts_payable_account_id AS ap FROM business_accounting_settings").get() as { ar: string; ap: string };
  const balance = (accountId: string) => scalar(sqlite, `SELECT SUM(jl.debit_minor - jl.credit_minor) AS v FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' WHERE jl.account_id = ?`, accountId);
  assert.equal(balance(settings.ar), 6_367);
  assert.equal(balance(settings.ap), 0);
  assert.equal(scalar(sqlite, "SELECT SUM(output_vat_minor) AS v FROM tax_entries WHERE source_type = 'sales_invoice'"), 65);
  assert.equal(scalar(sqlite, "SELECT COUNT(*) AS v FROM tax_entries WHERE source_type = 'sales_invoice' AND vat_category = 'zero_rated'"), 1);
  assert.equal(scalar(sqlite, "SELECT SUM(recoverable_vat_minor) AS v FROM tax_entries WHERE source_type = 'purchase_invoice'"), 500);
  // Bank: +150.00 receipt, -105.00 payment, -10.00 manual journal.
  assert.equal(balance(ids.bank), 3_500);

  assertImportedLedgerConsistent(sqlite);
});

test("Manager.io import rejects an unbalanced manual journal before creating a business", () => {
  const userId = "manager-migration-synthetic-user";
  const businessCount = () => (getSystemSqlite().prepare("SELECT COUNT(*) AS c FROM businesses").get() as { c: number }).c;
  const before = businessCount();
  const { buffer } = buildSyntheticManagerBackup({ unbalancedJournal: true });
  assert.throws(
    () => importManagerBackupToNewBusiness(buffer, userId, { documentStatus: "posted" }),
    /MJ-001 is not balanced/,
  );
  assert.equal(businessCount(), before, "No business workspace may be left behind by a rejected import");
});

test("Manager.io draft-mode import leaves documents unposted and the ledger balanced", () => {
  const userId = "manager-migration-synthetic-user";
  const { buffer } = buildSyntheticManagerBackup();
  const result = importManagerBackupToNewBusiness(buffer, userId, { documentStatus: "draft" });
  const { sqlite } = getBusinessDb(result.businessId, userId);
  for (const table of ["sales_invoices", "purchase_invoices", "receipts", "supplier_payments"]) {
    assert.equal(scalar(sqlite, `SELECT COUNT(*) AS v FROM ${table} WHERE document_status <> 'draft'`), 0, `${table} must stay draft`);
  }
  assert.equal(scalar(sqlite, "SELECT COUNT(*) AS v FROM tax_entries"), 0);
  assertImportedLedgerConsistent(sqlite);
});
