import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-aging-tieout-")),
  BETTER_AUTH_SECRET: "aging-as-of-tieout-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { saveExchangeRate } = await import("../../src/modules/currency/exchange-rate");
const { createInvoice } = await import("../../src/modules/sales-invoices/invoice-service");
const { createReceipt, applyReceiptCredit, voidReceipt } = await import("../../src/modules/receipts/receipt-service");
const { saveCreditNote } = await import("../../src/modules/sales-credit-notes/credit-note-service");
const { savePurchaseInvoice } = await import("../../src/modules/purchase-invoices/purchase-invoice-service");
const { createSupplierPayment } = await import("../../src/modules/supplier-payments/supplier-payment-service");
const { saveDebitNote } = await import("../../src/modules/debit-notes/debit-note-service");
const { getReceivablesAging, getPayablesAging } = await import("../../src/modules/reports/aging-service");
const { getBusinessTodayIso } = await import("../../src/core/format");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const accounting = sqlite.prepare(`
  SELECT default_sales_account_id AS sales, default_purchase_expense_account_id AS expense, default_bank_account_id AS bank
  FROM business_accounting_settings WHERE id = 'default'
`).get() as { sales: string; expense: string; bank: string };
const aedCustomer = sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = 'AED' AND is_active = 1 ORDER BY name LIMIT 1").get() as { id: string };
const usdCustomer = sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };
const aedSupplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'AED' AND is_active = 1 ORDER BY name LIMIT 1").get() as { id: string };
const usdSupplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };
const noVat = "tax-out-of-scope";

for (const [rateDate, rateToBase] of [["2035-01-01", "3.600000"], ["2035-02-01", "3.700000"], ["2035-03-01", "3.650000"]]) {
  saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate, rateToBase, source: "Manual", sourceReference: `aging ${rateDate}` });
}
const usd = (rate: string, date: string) => ({ currencyCode: "USD", exchangeRateToBase: rate, exchangeRateDate: date, exchangeRateSource: "Manual" as const });

function assertTiesOut(asOf: string) {
  const ar = getReceivablesAging(businessId, adminId, asOf);
  const ap = getPayablesAging(businessId, adminId, asOf);
  assert.equal(ar.tieOut.differenceMinor, 0, `AR aging ties to GL at ${asOf} (subledger ${ar.tieOut.subledgerMinor}, GL ${ar.tieOut.glMinor})`);
  assert.equal(ap.tieOut.differenceMinor, 0, `AP aging ties to GL at ${asOf} (subledger ${ap.tieOut.subledgerMinor}, GL ${ap.tieOut.glMinor})`);
  const bucketSum = Object.values(ar.bucketTotals).reduce((sum, value) => sum + value, 0);
  assert.equal(bucketSum, ar.tieOut.subledgerMinor, "bucket totals add up to the aging total");
  return { ar, ap };
}

test("the demo data ties out today and as-of defaults to business today", () => {
  const today = getBusinessTodayIso();
  assert.equal(getReceivablesAging(businessId, adminId).asOfDate, today);
  assert.equal(getPayablesAging(businessId, adminId, "not-a-date").asOfDate, today);
  assertTiesOut(today);
});

test("receivables: invoices, partial receipts, credit notes and FX tie out at every as-of date", () => {
  const invoiceA = createInvoice(businessId, adminId, {
    customerId: aedCustomer.id, invoiceDate: "2035-01-10", taxDate: "2035-01-10", dueDate: "2035-02-09", reference: "AGING-A",
    lines: [{ description: "Aging A", quantity: "1", unitPrice: "1000.00", salesAccountId: accounting.sales, taxCodeId: noVat }],
  }, "post");
  const invoiceB = createInvoice(businessId, adminId, {
    ...usd("3.600000", "2035-01-01"),
    customerId: usdCustomer.id, invoiceDate: "2035-01-20", taxDate: "2035-01-20", dueDate: "2035-01-31", reference: "AGING-B",
    lines: [{ description: "Aging B", quantity: "1", unitPrice: "100.00", salesAccountId: accounting.sales, taxCodeId: noVat }],
  }, "post");
  createReceipt(businessId, adminId, {
    customerId: aedCustomer.id, invoiceId: invoiceA, date: "2035-02-15", bankAccountId: accounting.bank, amount: "400.00", reference: "AGING-RCPT-A",
  });
  createReceipt(businessId, adminId, {
    ...usd("3.700000", "2035-02-01"),
    customerId: usdCustomer.id, invoiceId: invoiceB, date: "2035-02-20", bankAccountId: accounting.bank, amount: "60.00", reference: "AGING-RCPT-B",
  });
  saveCreditNote(businessId, adminId, {
    customerId: aedCustomer.id, sourceInvoiceId: invoiceA, date: "2035-03-10", taxDate: "2035-03-10", reference: "AGING-CN-A",
    lines: [{ description: "Aging credit", quantity: "1", unitPrice: "100.00", salesAccountId: accounting.sales, taxCodeId: noVat }],
  }, "post");
  const prepayment = createReceipt(businessId, adminId, {
    ...usd("3.650000", "2035-03-01"),
    customerId: usdCustomer.id, date: "2035-03-20", bankAccountId: accounting.bank, amount: "50.00", reference: "AGING-PREPAY",
  });

  for (const asOf of ["2035-01-15", "2035-02-14", "2035-02-28", "2035-03-15", "2035-03-31"]) assertTiesOut(asOf);

  // As-of excludes later documents and later settlement.
  const jan = getReceivablesAging(businessId, adminId, "2035-01-15");
  assert.equal(jan.rows.find((row) => row.document_id === invoiceB), undefined, "invoice dated after as-of is excluded");
  const beforeReceipt = getReceivablesAging(businessId, adminId, "2035-02-14").rows.find((row) => row.document_id === invoiceA)!;
  assert.equal(beforeReceipt.base_carrying_minor, 100_000, "a receipt dated after as-of does not reduce the balance");
  assert.equal(beforeReceipt.age_bucket, "1–30");
  const afterReceipt = getReceivablesAging(businessId, adminId, "2035-02-15").rows.find((row) => row.document_id === invoiceA)!;
  assert.equal(afterReceipt.base_carrying_minor, 60_000);
  const beforeCredit = getReceivablesAging(businessId, adminId, "2035-03-09").rows.find((row) => row.document_id === invoiceA)!;
  assert.equal(beforeCredit.base_carrying_minor, 60_000, "a credit note dated after as-of does not reduce the balance");
  const afterCredit = getReceivablesAging(businessId, adminId, "2035-03-10").rows.find((row) => row.document_id === invoiceA)!;
  assert.equal(afterCredit.base_carrying_minor, 50_000);

  // FX: 60 USD released at the 3.60 carrying rate; 40 USD remains at 3.60.
  const openB = getReceivablesAging(businessId, adminId, "2035-03-15").rows.find((row) => row.document_id === invoiceB)!;
  assert.equal(openB.foreign_open_minor, 4_000);
  assert.equal(openB.base_carrying_minor, 14_400);
  assert.equal(openB.age_bucket, "31–60");

  // An unapplied prepayment is a credit row in the aging until it is applied.
  const withCredit = getReceivablesAging(businessId, adminId, "2035-03-31");
  const credit = withCredit.rows.find((row) => row.document_id === prepayment.id)!;
  assert.equal(credit.age_bucket, "Credit");
  assert.equal(credit.base_carrying_minor, -18_250);
  assert.equal(getReceivablesAging(businessId, adminId, "2035-03-19").rows.some((row) => row.document_id === prepayment.id), false);

  applyReceiptCredit(businessId, adminId, { receiptId: prepayment.id, invoiceId: invoiceB, amount: "40.00" });
  for (const asOf of ["2035-03-15", "2035-03-31", "2035-12-31"]) assertTiesOut(asOf);
  const applied = getReceivablesAging(businessId, adminId, "2035-03-31");
  assert.equal(applied.rows.find((row) => row.document_id === invoiceB), undefined, "fully settled invoice drops out");
  assert.equal(applied.rows.find((row) => row.document_id === prepayment.id)!.foreign_open_minor, -1_000);
});

test("payables: bills, partial payments, debit notes and FX tie out at every as-of date", () => {
  const billA = savePurchaseInvoice(businessId, adminId, {
    supplierId: aedSupplier.id, supplierInvoiceNumber: "AGING-BILL-A", invoiceDate: "2035-01-05", taxDate: "2035-01-05", dueDate: "2035-02-04", reference: "AGING-BILL-A",
    lines: [{ description: "Bill A", quantity: "1", unitPrice: "2000.00", expenseAccountId: accounting.expense, taxCodeId: noVat }],
  }, "post");
  const billB = savePurchaseInvoice(businessId, adminId, {
    ...usd("3.600000", "2035-01-01"),
    supplierId: usdSupplier.id, supplierInvoiceNumber: "AGING-BILL-B", invoiceDate: "2035-01-25", taxDate: "2035-01-25", dueDate: "2035-02-24", reference: "AGING-BILL-B",
    lines: [{ description: "Bill B", quantity: "1", unitPrice: "200.00", expenseAccountId: accounting.expense, taxCodeId: noVat }],
  }, "post");
  createSupplierPayment(businessId, adminId, {
    supplierId: aedSupplier.id, purchaseInvoiceId: billA, date: "2035-02-10", bankAccountId: accounting.bank, amount: "500.00", reference: "AGING-PAY-A",
  });
  createSupplierPayment(businessId, adminId, {
    ...usd("3.700000", "2035-02-01"),
    supplierId: usdSupplier.id, purchaseInvoiceId: billB, date: "2035-02-12", bankAccountId: accounting.bank, amount: "150.00", reference: "AGING-PAY-B",
  });
  saveDebitNote(businessId, adminId, {
    supplierId: aedSupplier.id, purchaseInvoiceId: billA, date: "2035-02-20", taxDate: "2035-02-20", currencyCode: "AED", reference: "AGING-DN-A",
    lines: [{ description: "Return", quantity: "1", unitPrice: "100.00", expenseAccountId: accounting.expense, taxCodeId: noVat }],
  }, "post");
  const advance = createSupplierPayment(businessId, adminId, {
    supplierId: aedSupplier.id, date: "2035-03-05", bankAccountId: accounting.bank, amount: "250.00", reference: "AGING-ADVANCE",
  });

  for (const asOf of ["2035-01-10", "2035-02-11", "2035-02-19", "2035-02-28", "2035-03-31"]) assertTiesOut(asOf);

  assert.equal(getPayablesAging(businessId, adminId, "2035-02-09").rows.find((row) => row.document_id === billA)!.base_carrying_minor, 200_000);
  assert.equal(getPayablesAging(businessId, adminId, "2035-02-10").rows.find((row) => row.document_id === billA)!.base_carrying_minor, 150_000);
  assert.equal(getPayablesAging(businessId, adminId, "2035-02-20").rows.find((row) => row.document_id === billA)!.base_carrying_minor, 140_000);
  const openB = getPayablesAging(businessId, adminId, "2035-02-28").rows.find((row) => row.document_id === billB)!;
  assert.equal(openB.foreign_open_minor, 5_000);
  assert.equal(openB.base_carrying_minor, 18_000);
  const march = getPayablesAging(businessId, adminId, "2035-03-31");
  assert.equal(march.rows.find((row) => row.document_id === advance.id)!.base_carrying_minor, -25_000);
  assert.equal(getPayablesAging(businessId, adminId, "2035-03-04").rows.some((row) => row.document_id === advance.id), false);
});

test("a void counts from its reversal date: earlier as-of dates still see the document", () => {
  const today = getBusinessTodayIso();
  const shift = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const invoiceId = createInvoice(businessId, adminId, {
    customerId: aedCustomer.id, invoiceDate: shift(-40), taxDate: shift(-40), dueDate: shift(-10), reference: "AGING-VOID",
    lines: [{ description: "Void fixture", quantity: "1", unitPrice: "300.00", salesAccountId: accounting.sales, taxCodeId: noVat }],
  }, "post");
  const receipt = createReceipt(businessId, adminId, {
    customerId: aedCustomer.id, invoiceId, date: shift(-20), bankAccountId: accounting.bank, amount: "300.00", reference: "AGING-VOID-RCPT",
  });
  voidReceipt(businessId, adminId, receipt.id);
  const before = assertTiesOut(shift(-5)).ar;
  assert.equal(before.rows.some((row) => row.document_id === invoiceId), false, "receipt was still effective before its void date");
  const now = assertTiesOut(today).ar;
  assert.equal(now.rows.find((row) => row.document_id === invoiceId)!.base_carrying_minor, 30_000);
});

test("a difference between the subledger and the control account is reported", () => {
  const asOf = "2035-06-30";
  const before = getReceivablesAging(businessId, adminId, asOf).tieOut;
  assert.equal(before.differenceMinor, 0);
  const ar = sqlite.prepare("SELECT accounts_receivable_account_id AS id FROM business_accounting_settings WHERE id = 'default'").get() as { id: string };
  const journal = sqlite.prepare(`
    SELECT jl.id FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = ? AND je.date <= ? AND jl.debit_minor > 0 LIMIT 1
  `).get(ar.id, asOf) as { id: string };
  sqlite.prepare("UPDATE journal_lines SET debit_minor = debit_minor + 7 WHERE id = ?").run(journal.id);
  try {
    const after = getReceivablesAging(businessId, adminId, asOf).tieOut;
    assert.equal(after.glMinor, before.glMinor + 7);
    assert.equal(after.differenceMinor, -7);
  } finally {
    sqlite.prepare("UPDATE journal_lines SET debit_minor = debit_minor - 7 WHERE id = ?").run(journal.id);
  }
});
