import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-phase-9-")),
  BETTER_AUTH_SECRET: "phase-9-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { createBusiness, listBusinessesForUser } = await import("../src/core/businesses/business-service");
const { exportBusinessBackup, importBusinessBackup } = await import("../src/core/businesses/backup-service");
const { getBusinessDb } = await import("../src/core/db/business");
const { businessMigrations } = await import("../src/core/db/business-migrations");
const { runMigrations } = await import("../src/core/db/migrations/runner");
const { changeBaseCurrency, getCurrencySettings, saveCurrency, saveExchangeRate } = await import("../src/modules/currency/exchange-rate");
const { convertFromBase, convertToBase, parseCurrencyAmountToMinor, proportionalCarryingRelease, roundCurrencyAmount, validateExchangeRate } = await import("../src/modules/currency/conversion");
const { mapSourceToCanonical } = await import("../src/modules/einvoicing/canonical-mapper");
const { createInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { createReceipt, voidReceipt } = await import("../src/modules/receipts/receipt-service");
const { savePurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { createSupplierPayment, voidSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
const { saveCreditNote } = await import("../src/modules/sales-credit-notes/credit-note-service");
const { getAccountsPayable, getAccountsReceivable } = await import("../src/modules/reports/report-service");
const { getCustomerStatement } = await import("../src/modules/reports/customer-statement-service");
const { getSupplierStatement } = await import("../src/modules/reports/supplier-statement-service");

test("Phase 9 migration preserves Phase 8 data and installs business-local currency metadata", () => {
  const legacy = new Database(":memory:");
  runMigrations(legacy, { label: "Phase 9 migration fixture", migrations: businessMigrations.filter((migration) => migration.version <= 8) });
  const now = new Date().toISOString();
  legacy.prepare("INSERT INTO customers (id, name, status, created_at, updated_at) VALUES ('legacy-customer', 'Legacy Customer', 'active', ?, ?)").run(now, now);
  runMigrations(legacy, { label: "Phase 9 migration fixture", migrations: businessMigrations });
  assert.equal((legacy.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version, 11);
  assert.deepEqual(legacy.prepare("SELECT base_currency_code, metadata_source FROM business_currency_settings WHERE id = 'default'").get(), { base_currency_code: "AED", metadata_source: "migration_default" });
  assert.deepEqual(legacy.prepare("SELECT code, minor_unit, is_base FROM currencies ORDER BY code").all(), [
    { code: "AED", minor_unit: 2, is_base: 1 },
    { code: "EUR", minor_unit: 2, is_base: 0 },
    { code: "JPY", minor_unit: 0, is_base: 0 },
    { code: "USD", minor_unit: 2, is_base: 0 },
  ]);
  assert.equal((legacy.prepare("SELECT default_currency_code FROM customers WHERE id = 'legacy-customer'").get() as { default_currency_code: string }).default_currency_code, "AED");
  assert.ok(legacy.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'posted_sales_invoice_currency_immutable'").get());
  legacy.close();
});

test("Phase 9 Decimal currency primitives use one precise base-per-foreign convention", () => {
  assert.equal(validateExchangeRate("3.672500"), "3.672500");
  assert.equal(parseCurrencyAmountToMinor("1234.567", 3), 1_234_567);
  assert.equal(roundCurrencyAmount("1234.5", 0), "1235");
  assert.equal(convertToBase(100_000, 2, 2, "3.672500"), 367_250);
  assert.equal(convertFromBase(367_250, 2, 2, "3.672500"), 100_000);
  assert.equal(proportionalCarryingRelease(3_334, 3_334, 12_245), 12_245);
  assert.throws(() => validateExchangeRate("0"), /greater than zero/i);
});

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const standardId = seeded.standard.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const accounting = sqlite.prepare(`
  SELECT default_sales_account_id, default_purchase_expense_account_id, default_bank_account_id,
    default_inventory_asset_account_id, realized_fx_gain_account_id, realized_fx_loss_account_id
  FROM business_accounting_settings WHERE id = 'default'
`).get() as {
  default_sales_account_id: string; default_purchase_expense_account_id: string; default_bank_account_id: string;
  default_inventory_asset_account_id: string; realized_fx_gain_account_id: string; realized_fx_loss_account_id: string;
};
const taxCodes = {
  salesVat: "tax-uae-vat-5-sales",
  purchaseVat: "tax-uae-vat-5-purchases",
  outOfScope: "tax-out-of-scope",
};
const foreignCustomer = sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };
const foreignSupplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };

test("Phase 9 foreign Sales posting, VAT snapshot, settlement, and immutability", async (suite) => {
  const invoice = sqlite.prepare("SELECT * FROM sales_invoices WHERE reference = 'DEMO-FX-USD-SALES'").get() as Record<string, string | number>;
  const receipt = sqlite.prepare("SELECT * FROM receipts WHERE reference = 'DEMO-FX-USD-RECEIPT'").get() as Record<string, string | number>;

  await suite.test("native values post to a balanced base journal and AED VAT snapshot", () => {
    assert.equal(invoice.currency_code, "USD");
    assert.equal(invoice.exchange_rate_to_base, "3.672500");
    assert.equal(invoice.total_minor, 105_000);
    assert.equal(invoice.base_subtotal_minor, 367_250);
    assert.equal(invoice.base_tax_minor, 18_363);
    assert.equal(invoice.base_total_minor, 385_613);
    const journal = sqlite.prepare(`SELECT SUM(jl.debit_minor) AS debit, SUM(jl.credit_minor) AS credit
      FROM journal_entries je INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.source_type = 'sales_invoice' AND je.source_id = ?`).get(invoice.id) as { debit: number; credit: number };
    assert.deepEqual(journal, { debit: 385_613, credit: 385_613 });
    const tax = sqlite.prepare("SELECT document_currency, foreign_net_minor, foreign_vat_minor, base_net_minor, base_vat_minor, exchange_rate_to_base, rate_source FROM tax_entries WHERE source_id = ?").get(invoice.id);
    assert.deepEqual(tax, { document_currency: "USD", foreign_net_minor: 100_000, foreign_vat_minor: 5_000, base_net_minor: 367_250, base_vat_minor: 18_363, exchange_rate_to_base: "3.672500", rate_source: "CBUAE" });
  });

  await suite.test("same-currency receipt uses a base Bank account and realizes the rate difference", () => {
    assert.equal(receipt.currency_code, "USD");
    assert.equal(receipt.base_amount_minor, 386_400);
    assert.equal(receipt.released_carrying_amount_minor, 385_613);
    assert.equal(receipt.realized_fx_amount_minor, 787);
    const gain = sqlite.prepare(`SELECT jl.credit_minor FROM journal_entries je INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.source_type = 'receipt' AND je.source_id = ? AND jl.account_id = ?`).get(receipt.id, accounting.realized_fx_gain_account_id) as { credit_minor: number };
    assert.equal(gain.credit_minor, 787);
    const open = getAccountsReceivable(businessId, adminId).find((row) => row.document_id === invoice.id);
    assert.equal(open, undefined);
  });

  await suite.test("changing the rate table never changes a posted source, tax row, carrying value, or journal", () => {
    const before = JSON.stringify({
      invoice: sqlite.prepare("SELECT exchange_rate_to_base, base_total_minor FROM sales_invoices WHERE id = ?").get(invoice.id),
      tax: sqlite.prepare("SELECT exchange_rate_to_base, base_net_minor, base_vat_minor FROM tax_entries WHERE source_id = ?").get(invoice.id),
      journal: sqlite.prepare("SELECT SUM(debit_minor) AS debit, SUM(credit_minor) AS credit FROM journal_lines WHERE journal_entry_id = (SELECT id FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?)").get(invoice.id),
    });
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: String(invoice.exchange_rate_date), rateToBase: "3.999999", source: "CBUAE", sourceReference: "Phase 9 immutability test" });
    const after = JSON.stringify({
      invoice: sqlite.prepare("SELECT exchange_rate_to_base, base_total_minor FROM sales_invoices WHERE id = ?").get(invoice.id),
      tax: sqlite.prepare("SELECT exchange_rate_to_base, base_net_minor, base_vat_minor FROM tax_entries WHERE source_id = ?").get(invoice.id),
      journal: sqlite.prepare("SELECT SUM(debit_minor) AS debit, SUM(credit_minor) AS credit FROM journal_lines WHERE journal_entry_id = (SELECT id FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?)").get(invoice.id),
    });
    assert.equal(after, before);
  });

  await suite.test("foreign outbound PINT-AE fails honestly at the existing provider-neutral boundary", () => {
    const mapped = mapSourceToCanonical(sqlite, "sales_invoice", String(invoice.id), "00000000-0000-4000-8000-000000000009", "1.0.4");
    assert.equal(mapped.canonical, null);
    assert.ok(mapped.issues.some((issue) => issue.ruleId === "UNSUPPORTED-FOREIGN-CURRENCY" && /Unsupported in current PINT-AE ERP subset/.test(issue.message)));
  });
});

test("Phase 9 VAT policy and exact partial carrying residual", async (suite) => {
  await suite.test("a VAT-relevant foreign document requires an exact-date CBUAE-labelled rate", () => {
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2031-01-10", rateToBase: "3.700000", source: "Manual", sourceReference: "Manual-only VAT rejection fixture" });
    assert.throws(() => createInvoice(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.700000", exchangeRateDate: "2031-01-10", exchangeRateSource: "Manual",
      customerId: foreignCustomer.id, invoiceDate: "2031-01-10", taxDate: "2031-01-10", dueDate: "2031-02-10", reference: "PHASE9-VAT-RATE-FAIL",
      lines: [{ description: "VAT rate rejection", quantity: "1", unitPrice: "100.00", salesAccountId: accounting.default_sales_account_id, taxCodeId: taxCodes.salesVat }],
    }, "post"), /CBUAE.*rate.*tax date/i);
  });

  await suite.test("partial allocations are proportional and the final allocation clears the exact carrying residual", () => {
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2031-02-01", rateToBase: "3.672500", source: "Manual", sourceReference: "Partial invoice fixture" });
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2031-02-02", rateToBase: "3.680000", source: "Manual", sourceReference: "Partial receipt one" });
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2031-02-03", rateToBase: "3.690000", source: "Manual", sourceReference: "Partial receipt final" });
    const invoiceId = createInvoice(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.672500", exchangeRateDate: "2031-02-01", exchangeRateSource: "Manual",
      customerId: foreignCustomer.id, invoiceDate: "2031-02-01", taxDate: "2031-02-01", dueDate: "2031-03-01", reference: "PHASE9-PARTIAL-RESIDUAL",
      lines: [{ description: "Partial settlement fixture", quantity: "1", unitPrice: "100.00", salesAccountId: accounting.default_sales_account_id, taxCodeId: taxCodes.outOfScope }],
    }, "post");
    for (const [index, amount] of ["33.33", "33.33", "33.34"].entries()) {
      const date = index < 2 ? "2031-02-02" : "2031-02-03";
      createReceipt(businessId, adminId, {
        currencyCode: "USD", exchangeRateToBase: index < 2 ? "3.680000" : "3.690000", exchangeRateDate: date, exchangeRateSource: "Manual",
        customerId: foreignCustomer.id, invoiceId, date, bankAccountId: accounting.default_bank_account_id,
        amount, reference: `PHASE9-PARTIAL-${index + 1}`, description: "Partial carrying release test",
      });
    }
    const allocations = sqlite.prepare(`SELECT foreign_amount_allocated, base_carrying_amount_released
      FROM receipt_allocations WHERE sales_invoice_id = ? ORDER BY rowid`).all(invoiceId) as Array<{ foreign_amount_allocated: number; base_carrying_amount_released: number }>;
    assert.equal(allocations.reduce((sum, row) => sum + row.foreign_amount_allocated, 0), 10_000);
    assert.equal(allocations.reduce((sum, row) => sum + row.base_carrying_amount_released, 0), 36_725);
    assert.equal(allocations.at(-1)?.base_carrying_amount_released, 36_725 - allocations.slice(0, -1).reduce((sum, row) => sum + row.base_carrying_amount_released, 0));
    assert.equal(getAccountsReceivable(businessId, adminId).find((row) => row.document_id === invoiceId), undefined);
  });

  await suite.test("a linked foreign Credit Note inherits the invoice snapshot and releases compatible carrying value", () => {
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2031-04-01", rateToBase: "3.672500", source: "CBUAE", sourceReference: "Credit correction fixture" });
    const invoiceId = createInvoice(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.672500", exchangeRateDate: "2031-04-01", exchangeRateSource: "CBUAE",
      customerId: foreignCustomer.id, invoiceDate: "2031-04-01", taxDate: "2031-04-01", dueDate: "2031-05-01", reference: "PHASE9-CREDIT-SOURCE",
      lines: [{ description: "Credit correction source", quantity: "1", unitPrice: "100.00", salesAccountId: accounting.default_sales_account_id, taxCodeId: taxCodes.salesVat }],
    }, "post");
    const noteId = saveCreditNote(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "9.999999", exchangeRateDate: "2031-04-02", exchangeRateSource: "Manual",
      customerId: foreignCustomer.id, sourceInvoiceId: invoiceId, date: "2031-04-02", taxDate: "2031-04-01", reference: "PHASE9-CREDIT-CORRECTION",
      lines: [{ description: "Correct 40 percent", quantity: "1", unitPrice: "40.00", salesAccountId: accounting.default_sales_account_id, taxCodeId: taxCodes.salesVat }],
    }, "post");
    const invoice = sqlite.prepare("SELECT exchange_rate_to_base, base_total_minor FROM sales_invoices WHERE id = ?").get(invoiceId) as { exchange_rate_to_base: string; base_total_minor: number };
    const note = sqlite.prepare("SELECT currency_code, exchange_rate_to_base, base_total_minor FROM sales_credit_notes WHERE id = ?").get(noteId) as { currency_code: string; exchange_rate_to_base: string; base_total_minor: number };
    assert.equal(note.currency_code, "USD");
    assert.equal(note.exchange_rate_to_base, invoice.exchange_rate_to_base);
    assert.equal(note.base_total_minor, 15_424);
    const open = getAccountsReceivable(businessId, adminId).find((row) => row.document_id === invoiceId)!;
    assert.equal(open.foreign_open_minor, 6_300);
    assert.equal(open.base_carrying_minor, invoice.base_total_minor - note.base_total_minor);
  });
});

test("Phase 9 settlement loss, gain, reversal, and currency guardrails", async (suite) => {
  await suite.test("a lower-rate Receipt posts realized loss, and reversal restores exact AR carrying value", () => {
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2033-01-01", rateToBase: "3.680000", source: "Manual", sourceReference: "Receipt loss invoice" });
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2033-01-02", rateToBase: "3.670000", source: "Manual", sourceReference: "Receipt loss settlement" });
    const invoiceId = createInvoice(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.680000", exchangeRateDate: "2033-01-01", exchangeRateSource: "Manual",
      customerId: foreignCustomer.id, invoiceDate: "2033-01-01", taxDate: "2033-01-01", dueDate: "2033-02-01", reference: "PHASE9-RECEIPT-LOSS",
      lines: [{ description: "Receipt loss fixture", quantity: "1", unitPrice: "10.00", salesAccountId: accounting.default_sales_account_id, taxCodeId: taxCodes.outOfScope }],
    }, "post");
    const receipt = createReceipt(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.670000", exchangeRateDate: "2033-01-02", exchangeRateSource: "Manual",
      customerId: foreignCustomer.id, invoiceId, date: "2033-01-02", bankAccountId: accounting.default_bank_account_id,
      amount: "10.00", reference: "PHASE9-RECEIPT-LOSS", description: "Lower-rate settlement",
    });
    const stored = sqlite.prepare("SELECT realized_fx_amount_minor FROM receipts WHERE id = ?").get(receipt.id) as { realized_fx_amount_minor: number };
    assert.equal(stored.realized_fx_amount_minor, -10);
    assert.deepEqual(sqlite.prepare(`SELECT debit_minor, credit_minor FROM journal_lines
      WHERE journal_entry_id = (SELECT id FROM journal_entries WHERE source_type = 'receipt' AND source_id = ?)
      AND account_id = ?`).get(receipt.id, accounting.realized_fx_loss_account_id), { debit_minor: 10, credit_minor: 0 });
    voidReceipt(businessId, adminId, receipt.id);
    const restored = getAccountsReceivable(businessId, adminId).find((row) => row.document_id === invoiceId)!;
    assert.equal(restored.foreign_open_minor, 1_000);
    assert.equal(restored.base_carrying_minor, 3_680);
    assert.equal((sqlite.prepare("SELECT document_status FROM receipts WHERE id = ?").get(receipt.id) as { document_status: string }).document_status, "void");
  });

  await suite.test("a lower-rate Supplier Payment posts realized gain, and reversal restores AP", () => {
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2033-02-01", rateToBase: "3.680000", source: "Manual", sourceReference: "Payment gain invoice" });
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2033-02-02", rateToBase: "3.670000", source: "Manual", sourceReference: "Payment gain settlement" });
    const invoiceId = savePurchaseInvoice(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.680000", exchangeRateDate: "2033-02-01", exchangeRateSource: "Manual",
      supplierId: foreignSupplier.id, supplierInvoiceNumber: "PHASE9-PAYMENT-GAIN", invoiceDate: "2033-02-01", taxDate: "2033-02-01", dueDate: "2033-03-01", reference: "PHASE9-PAYMENT-GAIN",
      lines: [{ description: "Payment gain fixture", quantity: "1", unitPrice: "10.00", expenseAccountId: accounting.default_purchase_expense_account_id, taxCodeId: taxCodes.outOfScope }],
    }, "post");
    const payment = createSupplierPayment(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.670000", exchangeRateDate: "2033-02-02", exchangeRateSource: "Manual",
      supplierId: foreignSupplier.id, purchaseInvoiceId: invoiceId, date: "2033-02-02", bankAccountId: accounting.default_bank_account_id,
      amount: "10.00", reference: "PHASE9-PAYMENT-GAIN", description: "Lower-rate payment",
    });
    assert.deepEqual(sqlite.prepare(`SELECT debit_minor, credit_minor FROM journal_lines
      WHERE journal_entry_id = (SELECT id FROM journal_entries WHERE source_type = 'supplier_payment' AND source_id = ?)
      AND account_id = ?`).get(payment.id, accounting.realized_fx_gain_account_id), { debit_minor: 0, credit_minor: 10 });
    voidSupplierPayment(businessId, adminId, payment.id);
    const restored = getAccountsPayable(businessId, adminId).find((row) => row.document_id === invoiceId)!;
    assert.equal(restored.foreign_open_minor, 1_000);
    assert.equal(restored.base_carrying_minor, 3_680);
  });

  await suite.test("cross-currency allocation is rejected before posting", () => {
    const openInvoice = sqlite.prepare("SELECT id FROM sales_invoices WHERE reference = 'PHASE9-RECEIPT-LOSS'").get() as { id: string };
    assert.throws(() => createReceipt(businessId, adminId, {
      currencyCode: "EUR", exchangeRateToBase: "4.000000", exchangeRateDate: "2033-01-03", exchangeRateSource: "Manual",
      customerId: foreignCustomer.id, invoiceId: openInvoice.id, date: "2033-01-03", bankAccountId: accounting.default_bank_account_id,
      amount: "1.00", reference: "PHASE9-CROSS-CURRENCY", description: "Must fail",
    }), /EUR Receipt can only allocate EUR invoices/);
  });
});

test("Phase 9 Purchases, inventory valuation, reports, and isolation", async (suite) => {
  await suite.test("foreign AP settles in the same currency with realized FX", () => {
    const invoice = sqlite.prepare("SELECT * FROM purchase_invoices WHERE reference = 'DEMO-FX-USD-PURCHASE'").get() as Record<string, string | number>;
    const payment = sqlite.prepare("SELECT * FROM supplier_payments WHERE reference = 'DEMO-FX-USD-PAYMENT'").get() as Record<string, string | number>;
    assert.equal(invoice.base_total_minor, 385_613);
    assert.equal(payment.base_amount_minor, 386_400);
    assert.equal(payment.released_carrying_amount_minor, 385_613);
    assert.equal(payment.realized_fx_amount_minor, 787);
    const loss = sqlite.prepare(`SELECT jl.debit_minor FROM journal_entries je INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.source_type = 'supplier_payment' AND je.source_id = ? AND jl.account_id = ?`).get(payment.id, accounting.realized_fx_loss_account_id) as { debit_minor: number };
    assert.equal(loss.debit_minor, 787);
    assert.equal(getAccountsPayable(businessId, adminId).find((row) => row.document_id === invoice.id), undefined);
  });

  await suite.test("a foreign inventory Purchase Invoice posts base historical cost without moving stock", () => {
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2032-03-01", rateToBase: "3.672500", source: "CBUAE", sourceReference: "Inventory purchase fixture" });
    const item = sqlite.prepare("SELECT id, inventory_asset_account_id FROM inventory_items WHERE is_active = 1 ORDER BY sku LIMIT 1").get() as { id: string; inventory_asset_account_id: string };
    const movementsBefore = (sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_movements").get() as { count: number }).count;
    const invoiceId = savePurchaseInvoice(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.672500", exchangeRateDate: "2032-03-01", exchangeRateSource: "CBUAE",
      supplierId: foreignSupplier.id, supplierInvoiceNumber: "PHASE9-INVENTORY-USD", invoiceDate: "2032-03-01", taxDate: "2032-03-01", dueDate: "2032-04-01", reference: "PHASE9-INVENTORY-USD",
      lines: [{ itemId: item.id, description: "Foreign inventory financial invoice", quantity: "10", unitPrice: "10.00", expenseAccountId: accounting.default_purchase_expense_account_id, taxCodeId: taxCodes.purchaseVat }],
    }, "post");
    const movementsAfter = (sqlite.prepare("SELECT COUNT(*) AS count FROM inventory_movements").get() as { count: number }).count;
    assert.equal(movementsAfter, movementsBefore);
    const inventoryDebit = sqlite.prepare(`SELECT jl.debit_minor FROM journal_entries je INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.source_type = 'purchase_invoice' AND je.source_id = ? AND jl.account_id = ?`).get(invoiceId, item.inventory_asset_account_id) as { debit_minor: number };
    assert.equal(inventoryDebit.debit_minor, 36_725);
  });

  await suite.test("business-local rates and Administrator permissions remain isolated", () => {
    const isolated = createBusiness({ name: "Phase 9 Isolated Business", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 4 }, adminId);
    assert.equal(getCurrencySettings(isolated.id, adminId).rates.length, 0);
    assert.throws(() => saveExchangeRate(businessId, standardId, { currencyCode: "EUR", rateDate: "2035-01-01", rateToBase: "4.000000", source: "Manual" }), /BUSINESS_ACCESS_DENIED/);
    assert.throws(() => changeBaseCurrency(businessId, adminId, "USD"), /cannot be changed after accounting activity/i);
  });

  await suite.test("foreign reverse-charge services snapshot equal AED output and recoverable VAT", () => {
    const reverseCharge = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'reverse_charge' AND is_active = 1 LIMIT 1").get() as { id: string };
    saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2034-03-01", rateToBase: "3.672500", source: "CBUAE", sourceReference: "Reverse-charge fixture" });
    const invoiceId = savePurchaseInvoice(businessId, adminId, {
      currencyCode: "USD", exchangeRateToBase: "3.672500", exchangeRateDate: "2034-03-01", exchangeRateSource: "CBUAE",
      supplierId: foreignSupplier.id, supplierInvoiceNumber: "PHASE9-RC-USD", invoiceDate: "2034-03-01", taxDate: "2034-03-01", dueDate: "2034-04-01", reference: "PHASE9-RC-USD",
      lines: [{ description: "Imported consulting", quantity: "1", unitPrice: "100.00", expenseAccountId: accounting.default_purchase_expense_account_id, taxCodeId: reverseCharge.id }],
    }, "post");
    const tax = sqlite.prepare("SELECT document_currency, foreign_vat_minor, base_vat_minor, output_vat_minor, recoverable_vat_minor, rate_source FROM tax_entries WHERE source_id = ?").get(invoiceId);
    assert.deepEqual(tax, { document_currency: "USD", foreign_vat_minor: 500, base_vat_minor: 1_836, output_vat_minor: 1_836, recoverable_vat_minor: 1_836, rate_source: "CBUAE" });
  });

  await suite.test("statements keep independent native balances while controls aggregate base carrying amounts", () => {
    const baseInvoiceId = createInvoice(businessId, adminId, {
      currencyCode: "AED", exchangeRateToBase: "1", exchangeRateDate: "2034-04-01", exchangeRateSource: "Base",
      customerId: foreignCustomer.id, invoiceDate: "2034-04-01", taxDate: "2034-04-01", dueDate: "2034-05-01", reference: "PHASE9-MULTI-STATEMENT",
      lines: [{ description: "AED statement fixture", quantity: "1", unitPrice: "50.00", salesAccountId: accounting.default_sales_account_id, taxCodeId: taxCodes.outOfScope }],
    }, "post");
    const rows = getCustomerStatement(businessId, adminId, foreignCustomer.id);
    const latestByCurrency = new Map<string, number>();
    rows.forEach((row) => latestByCurrency.set(row.currency_code, row.balanceMinor));
    assert.equal(latestByCurrency.get("AED"), 5_000);
    assert.ok(latestByCurrency.has("USD"));
    assert.ok(getCustomerStatement(businessId, adminId, foreignCustomer.id, "AED").every((row) => row.currency_code === "AED"));
    const ar = getAccountsReceivable(businessId, adminId).find((row) => row.document_id === baseInvoiceId)!;
    assert.equal(ar.foreign_open_minor, 5_000);
    assert.equal(ar.base_carrying_minor, 5_000);
    assert.ok(getSupplierStatement(businessId, adminId, foreignSupplier.id, "USD").every((row) => row.currency_code === "USD"));
  });
});

test("Phase 9 backup v2 preserves fiscal/base currency configuration and excludes provider execution secrets", async () => {
  const portable = createBusiness({ name: "Phase 9 Portable Business", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 7 }, adminId);
  changeBaseCurrency(portable.id, adminId, "USD");
  saveCurrency(portable.id, adminId, { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD", minorUnit: 3, isActive: true });
  saveExchangeRate(portable.id, adminId, { currencyCode: "EUR", rateDate: "2036-01-01", rateToBase: "1.090000", source: "Manual", sourceReference: "Portable backup fixture" });
  const source = getBusinessDb(portable.id, adminId).sqlite;
  source.prepare("UPDATE business_einvoice_settings SET asp_provider_key = 'mock-secret', asp_environment = 'mock' WHERE id = 'default'").run();
  const backup = await exportBusinessBackup(portable.id, adminId);
  const restoredId = await importBusinessBackup(backup.buffer.slice(backup.byteOffset, backup.byteOffset + backup.byteLength) as ArrayBuffer, adminId);
  const restoredRegistry = listBusinessesForUser(adminId).find((entry) => entry.business.id === restoredId)!.business;
  assert.equal(restoredRegistry.currency, "USD");
  assert.equal(restoredRegistry.financialYearStartMonth, 7);
  assert.equal(restoredRegistry.country, "United Arab Emirates");
  const restored = getBusinessDb(restoredId, adminId).sqlite;
  assert.deepEqual(restored.prepare("SELECT base_currency_code FROM business_currency_settings WHERE id = 'default'").get(), { base_currency_code: "USD" });
  assert.deepEqual(restored.prepare("SELECT minor_unit, is_active FROM currencies WHERE code = 'KWD'").get(), { minor_unit: 3, is_active: 1 });
  assert.deepEqual(restored.prepare("SELECT rate_to_base, source_reference FROM exchange_rates WHERE currency_code = 'EUR'").get(), { rate_to_base: "1.090000", source_reference: "Portable backup fixture" });
  assert.deepEqual(restored.prepare("SELECT asp_provider_key, asp_environment FROM business_einvoice_settings WHERE id = 'default'").get(), { asp_provider_key: null, asp_environment: "disabled" });
});
