import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-import-vat-")),
  BETTER_AUTH_SECRET: "import-vat-box-6-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { saveExchangeRate } = await import("../../src/modules/currency/exchange-rate");
const { savePurchaseInvoice, voidPurchaseInvoice } = await import("../../src/modules/purchase-invoices/purchase-invoice-service");
const { saveDebitNote } = await import("../../src/modules/debit-notes/debit-note-service");
const { saveBankTransaction } = await import("../../src/modules/banking/bank-transaction-service");
const { createVatPeriod } = await import("../../src/modules/tax/vat-period-service");
const { getVatWorkingPaper } = await import("../../src/modules/tax/vat-report-service");
const { generateFtaAuditFile } = await import("../../src/modules/tax/faf-service");
const { createTaxCode } = await import("../../src/modules/accounting/services/tax-code-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const settings = sqlite.prepare(`
  SELECT accounts_payable_account_id AS ap, input_vat_account_id AS inputVat, vat_output_account_id AS outputVat,
    default_purchase_expense_account_id AS expense, default_bank_account_id AS bank
  FROM business_accounting_settings WHERE id = 'default'
`).get() as { ap: string; inputVat: string; outputVat: string; expense: string; bank: string };
const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };
const aedSupplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'AED' AND is_active = 1 ORDER BY name LIMIT 1").get() as { id: string };
const bankAccount = sqlite.prepare("SELECT id FROM bank_accounts WHERE ledger_account_id = ?").get(settings.bank) as { id: string };
saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2036-02-15", rateToBase: "3.672500", source: "CBUAE", sourceReference: "import VAT" });
const periodId = createVatPeriod(businessId, adminId, {
  periodReference: "Q1 2036", startDate: "2036-01-01", endDate: "2036-03-31", filingDueDate: "2036-04-28", notes: "Import VAT fixture",
});

function journalLines(sourceType: string, sourceId: string) {
  return sqlite.prepare(`
    SELECT jl.account_id, jl.debit_minor, jl.credit_minor FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_type = ? AND je.source_id = ? ORDER BY jl.position
  `).all(sourceType, sourceId) as { account_id: string; debit_minor: number; credit_minor: number }[];
}
const net = (lines: ReturnType<typeof journalLines>, accountId: string) =>
  lines.filter((line) => line.account_id === accountId).reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0);

function importBill(reference: string, amount: string, taxCodeId = "tax-import-vat-purchases", amountsIncludeTax = false) {
  return savePurchaseInvoice(businessId, adminId, {
    supplierId: aedSupplier.id, supplierInvoiceNumber: reference, invoiceDate: "2036-02-10", taxDate: "2036-02-10", dueDate: "2036-03-10", reference,
    amountsIncludeTax,
    lines: [{ description: "Imported goods", quantity: "1", unitPrice: amount, expenseAccountId: settings.expense, taxCodeId }],
  }, "post");
}

let box6Net = 0;
let box6Vat = 0;
let box10Vat = 0;

test("an import purchase self-assesses output VAT and recovers input VAT; the supplier is owed the net only", () => {
  const billId = importBill("IMPORT-1", "10000.00");
  const bill = sqlite.prepare("SELECT total_minor, tax_minor FROM purchase_invoices WHERE id = ?").get(billId) as { total_minor: number; tax_minor: number };
  assert.equal(bill.total_minor, 1_000_000, "the foreign supplier charges no UAE VAT");
  assert.equal(bill.tax_minor, 50_000);

  const lines = journalLines("purchase_invoice", billId);
  assert.equal(net(lines, settings.expense), 1_000_000);
  assert.equal(net(lines, settings.inputVat), 50_000, "recoverable import VAT is input VAT (Box 10)");
  assert.equal(net(lines, settings.outputVat), -50_000, "import VAT is self-assessed as output VAT (Box 6)");
  assert.equal(net(lines, settings.ap), -1_000_000);
  assert.equal(lines.reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0), 0);

  const entry = sqlite.prepare("SELECT base_net_minor, output_vat_minor, recoverable_vat_minor FROM tax_entries WHERE source_id = ?").get(billId);
  assert.deepEqual(entry, { base_net_minor: 1_000_000, output_vat_minor: 50_000, recoverable_vat_minor: 50_000 });
  box6Net += 1_000_000; box6Vat += 50_000; box10Vat += 50_000;
});

test("tax-inclusive entry and foreign currency are handled like reverse charge", () => {
  const inclusive = importBill("IMPORT-INCL", "2000.00", "tax-import-vat-purchases", true);
  assert.deepEqual(sqlite.prepare("SELECT total_minor, tax_minor FROM purchase_invoices WHERE id = ?").get(inclusive), { total_minor: 200_000, tax_minor: 10_000 });
  box6Net += 200_000; box6Vat += 10_000; box10Vat += 10_000;

  const usdBill = savePurchaseInvoice(businessId, adminId, {
    currencyCode: "USD", exchangeRateToBase: "3.672500", exchangeRateDate: "2036-02-15", exchangeRateSource: "CBUAE",
    supplierId: supplier.id, supplierInvoiceNumber: "IMPORT-USD", invoiceDate: "2036-02-15", taxDate: "2036-02-15", dueDate: "2036-03-15", reference: "IMPORT-USD",
    lines: [{ description: "Imported goods", quantity: "1", unitPrice: "1000.00", expenseAccountId: settings.expense, taxCodeId: "tax-import-vat-purchases" }],
  }, "post");
  const lines = journalLines("purchase_invoice", usdBill);
  assert.equal(net(lines, settings.ap), -367_250);
  assert.equal(net(lines, settings.outputVat), -18_363);
  assert.equal(net(lines, settings.inputVat), 18_363);
  box6Net += 367_250; box6Vat += 18_363; box10Vat += 18_363;
});

test("a non-recoverable import code expenses the VAT and still reports Box 6 output, not Box 10", () => {
  const code = createTaxCode(businessId, adminId, {
    name: "Import VAT 5% (non-recoverable)", rate: "5", direction: "purchases", vatCategory: "import", isRecoverable: false,
    salesTaxAccountId: "", purchaseTaxAccountId: "",
  });
  const codeId = typeof code === "string" ? code : (sqlite.prepare("SELECT id FROM tax_codes WHERE name = ?").get("Import VAT 5% (non-recoverable)") as { id: string }).id;
  const billId = importBill("IMPORT-NR", "400.00", codeId);
  const lines = journalLines("purchase_invoice", billId);
  assert.equal(net(lines, settings.expense), 42_000, "irrecoverable VAT is a cost");
  assert.equal(net(lines, settings.outputVat), -2_000);
  assert.equal(net(lines, settings.inputVat), 0);
  assert.equal(net(lines, settings.ap), -40_000);
  box6Net += 40_000; box6Vat += 2_000;
});

test("a debit note against an import reverses the output and input sides", () => {
  const billId = importBill("IMPORT-RETURN", "1000.00");
  const noteId = saveDebitNote(businessId, adminId, {
    supplierId: aedSupplier.id, purchaseInvoiceId: billId, date: "2036-02-20", taxDate: "2036-02-20", currencyCode: "AED", reference: "IMPORT-DN",
    lines: [{ description: "Returned goods", quantity: "1", unitPrice: "200.00", expenseAccountId: settings.expense, taxCodeId: "tax-import-vat-purchases" }],
  }, "post");
  const lines = journalLines("debit_note", noteId);
  assert.equal(net(lines, settings.ap), 20_000);
  assert.equal(net(lines, settings.outputVat), 1_000);
  assert.equal(net(lines, settings.inputVat), -1_000);
  assert.equal(lines.reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0), 0);
  box6Net += 100_000 - 20_000; box6Vat += 5_000 - 1_000; box10Vat += 5_000 - 1_000;

  // Voiding reverses on the void date (business today), i.e. in a later VAT period.
  const voided = importBill("IMPORT-VOID", "300.00");
  voidPurchaseInvoice(businessId, adminId, voided);
});

test("VAT201 shows Box 6 amount and VAT, Box 10 includes the recoverable import VAT, and the GL reconciles", () => {
  const report = getVatWorkingPaper(businessId, adminId, periodId);
  const box = (id: string) => [...report.vat201.outputs, ...report.vat201.inputs].find((row) => row.box === id)!;
  // The voided bill stays in this period; its reversal is dated on the void date (business today), outside it.
  const voidedNet = 30_000;
  const voidedVat = 1_500;

  assert.deepEqual({ amount: box("6").amountMinor, vat: box("6").vatMinor }, { amount: box6Net + voidedNet, vat: box6Vat + voidedVat });
  assert.equal(report.buckets.import_output.outputVatMinor, box6Vat + voidedVat);
  assert.equal(report.buckets.import_purchases.recoverableVatMinor, box10Vat + voidedVat);
  assert.equal(box("10").vatMinor, box10Vat + voidedVat + report.buckets.reverse_charge_purchases.recoverableVatMinor);
  assert.equal(box("8").vatMinor, report.totalOutputVatMinor);
  assert.equal(box("11").vatMinor, report.totalRecoverableVatMinor);
  assert.equal(report.vat201.box14PayableMinor, report.netVatMinor);
  assert.equal(report.reconciliation.outputDifferenceMinor, 0, "output VAT tax entries match the GL output VAT account");
  assert.equal(report.reconciliation.inputDifferenceMinor, 0, "input VAT tax entries match the GL input VAT account");

  // Recoverable imports net to zero in the VAT accounts; only the non-recoverable code leaves output VAT due.
  assert.equal(report.calculatedOutputVatMinor - report.calculatedRecoverableVatMinor, 2_000);
});

test("bank transactions refuse import codes so import VAT is never paid as part of the cash amount", () => {
  assert.throws(() => saveBankTransaction(businessId, adminId, {
    bankAccountId: bankAccount.id, date: "2036-02-25", taxDate: "2036-02-25", supplyEmirate: "", type: "money_out",
    reference: "IMPORT-BANK", description: "Import by bank", statementLineId: "",
    lines: [{ accountId: settings.expense, taxCodeId: "tax-import-vat-purchases", projectId: "", description: "Import", amount: "105.00" }],
  }, "post"), /Purchase Invoice for imported goods/);
});

test("the FTA Audit File purchase data carries the import VAT and its GL section balances", () => {
  const faf = generateFtaAuditFile(businessId, adminId, { periodId });
  const importVat = sqlite.prepare(`
    SELECT COALESCE(SUM(base_vat_minor), 0) AS vat FROM tax_entries
    WHERE direction = 'purchases' AND tax_date BETWEEN '2036-01-01' AND '2036-03-31'
  `).get() as { vat: number };
  assert.equal(faf.totals.purchasesVatAedMinor, importVat.vat);
  assert.ok(faf.csvContent.includes("Import VAT 5% Purchases"));
  assert.equal(faf.totals.glDebitMinor, faf.totals.glCreditMinor);
  assert.ok(faf.csvContent.includes("Import VAT (self-assessed)"), "the GL section shows the self-assessed output line");
});
