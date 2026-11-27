import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-gl-tieout-")),
  BETTER_AUTH_SECRET: "gl-subledger-tieout-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { saveExchangeRate } = await import("../../src/modules/currency/exchange-rate");
const { createInvoice, updateInvoice } = await import("../../src/modules/sales-invoices/invoice-service");
const { createReceipt, applyReceiptCredit } = await import("../../src/modules/receipts/receipt-service");
const { savePurchaseInvoice } = await import("../../src/modules/purchase-invoices/purchase-invoice-service");
const { saveGoodsReceipt } = await import("../../src/modules/inventory/goods-receipt-service");
const { createPdc, clearPdc } = await import("../../src/modules/banking/pdc-service");
const { saveOpeningBalances, OPENING_BALANCE_EQUITY_ACCOUNT_ID } = await import("../../src/modules/accounting/services/opening-balances-service");
const { getBusinessDateIso, getBusinessTodayIso } = await import("../../src/core/format");
const { setFinancialLockDate } = await import("../../src/modules/accounting/services/financial-lock-service");
const { createSupplierPayment } = await import("../../src/modules/supplier-payments/supplier-payment-service");
const { saveCreditNote, voidCreditNote, getRemainingInvoiceBalance } = await import("../../src/modules/sales-credit-notes/credit-note-service");
const { saveDebitNote, voidDebitNote } = await import("../../src/modules/debit-notes/debit-note-service");
const {
  applyCreditNoteToInvoice, applyDebitNoteToPurchaseInvoice, createCustomerRefund, createSupplierRefund,
  listPartyNoteCredits, voidCustomerRefund, voidSupplierRefund,
} = await import("../../src/modules/settlement/party-credit-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const settings = sqlite.prepare(`
  SELECT accounts_receivable_account_id AS ar, accounts_payable_account_id AS ap,
    default_sales_account_id AS sales, default_bank_account_id AS bank,
    realized_fx_gain_account_id AS fx_gain, realized_fx_loss_account_id AS fx_loss
  FROM business_accounting_settings WHERE id = 'default'
`).get() as { ar: string; ap: string; sales: string; bank: string; fx_gain: string; fx_loss: string };
const usdCustomer = sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };
const aedCustomer = sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = 'AED' AND is_active = 1 ORDER BY name LIMIT 1").get() as { id: string };

function glBalance(accountId: string) {
  const row = sqlite.prepare(`
    SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = ? AND je.status = 'posted'
  `).get(accountId) as { balance: number };
  return row.balance;
}

/** Customer subledger in base currency: open invoice carrying value minus unapplied receipt credit. */
function arSubledger() {
  const invoices = sqlite.prepare(`
    SELECT COALESCE(SUM(i.base_total_minor
      - COALESCE((SELECT SUM(ra.base_carrying_amount_released) FROM receipt_allocations ra
          INNER JOIN receipts r ON r.id = ra.receipt_id AND r.document_status = 'posted'
          WHERE ra.sales_invoice_id = i.id), 0)
      - COALESCE((SELECT SUM(scna.base_carrying_amount_released) FROM sales_credit_note_allocations scna
          INNER JOIN sales_credit_notes scn ON scn.id = scna.credit_note_id AND scn.document_status = 'posted'
          WHERE scna.sales_invoice_id = i.id), 0)), 0) AS open_base
    FROM sales_invoices i WHERE i.document_status = 'posted'
  `).get() as { open_base: number };
  const unapplied = sqlite.prepare(`
    SELECT COALESCE(SUM(r.base_amount_minor
      - COALESCE((SELECT SUM(ra.settlement_base_amount) FROM receipt_allocations ra WHERE ra.receipt_id = r.id), 0)), 0) AS credit_base
    FROM receipts r WHERE r.document_status = 'posted'
  `).get() as { credit_base: number };
  // Credit-note value not used against an invoice is customer credit until refunded.
  const noteCredit = sqlite.prepare(`
    SELECT COALESCE(SUM(scn.base_total_minor
      - COALESCE((SELECT SUM(COALESCE(scna.settlement_base_amount, scna.base_carrying_amount_released))
          FROM sales_credit_note_allocations scna WHERE scna.credit_note_id = scn.id), 0)
      - COALESCE((SELECT SUM(cr.released_carrying_amount_minor) FROM customer_refunds cr
          WHERE cr.credit_note_id = scn.id AND cr.document_status = 'posted'), 0)), 0) AS credit_base
    FROM sales_credit_notes scn WHERE scn.document_status = 'posted'
  `).get() as { credit_base: number };
  return invoices.open_base - unapplied.credit_base - noteCredit.credit_base;
}

/** GL minus subledger; each scenario must leave this difference unchanged. */
const arGap = () => glBalance(settings.ar) - arSubledger();

test("applying an unallocated foreign receipt books realized FX so AR stays tied to the subledger", () => {
  saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2034-01-01", rateToBase: "3.600000", source: "Manual", sourceReference: "tie-out invoice" });
  saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2034-01-05", rateToBase: "3.700000", source: "Manual", sourceReference: "tie-out prepayment" });
  const gapBefore = arGap();
  const fxGainBefore = glBalance(settings.fx_gain);

  const receipt = createReceipt(businessId, adminId, {
    currencyCode: "USD", exchangeRateToBase: "3.700000", exchangeRateDate: "2034-01-05", exchangeRateSource: "Manual",
    customerId: usdCustomer.id, date: "2034-01-05", bankAccountId: settings.bank, amount: "100.00",
    reference: "TIEOUT-PREPAY", description: "Unallocated prepayment",
  });
  const invoiceId = createInvoice(businessId, adminId, {
    currencyCode: "USD", exchangeRateToBase: "3.600000", exchangeRateDate: "2034-01-01", exchangeRateSource: "Manual",
    customerId: usdCustomer.id, invoiceDate: "2034-01-10", taxDate: "2034-01-10", dueDate: "2034-02-10", reference: "TIEOUT-FX-INV",
    lines: [{ description: "Tie-out", quantity: "1", unitPrice: "100.00", salesAccountId: settings.sales, taxCodeId: "tax-out-of-scope" }],
  }, "post");
  applyReceiptCredit(businessId, adminId, { receiptId: receipt.id, invoiceId, amount: "100.00" });

  assert.equal(arGap(), gapBefore, "GL AR moves with the subledger");
  // 100 USD credited at 3.70 against a 3.60 invoice: 10.00 AED gain.
  assert.equal(glBalance(settings.fx_gain) - fxGainBefore, -1_000);
});

test("a cleared post-dated cheque settles its invoice once, with no double credit", () => {
  const gapBefore = arGap();
  const today = getBusinessTodayIso();
  const invoiceId = createInvoice(businessId, adminId, {
    customerId: aedCustomer.id, invoiceDate: today, taxDate: today, dueDate: today, reference: "TIEOUT-PDC-INV",
    lines: [{ description: "PDC tie-out", quantity: "1", unitPrice: "1000.00", salesAccountId: settings.sales, taxCodeId: "tax-out-of-scope" }],
  }, "post");
  const bankAccount = sqlite.prepare("SELECT id FROM bank_accounts WHERE ledger_account_id = ?").get(settings.bank) as { id: string };
  const pdcId = createPdc(businessId, adminId, {
    direction: "receivable", chequeNumber: "TIEOUT-CHQ-1", issueDate: today, maturityDate: today,
    customerId: aedCustomer.id, salesInvoiceId: invoiceId, bankAccountId: bankAccount.id, amount: "1000.00",
  });
  assert.equal(arGap(), gapBefore, "a held cheque does not touch the ledger");
  clearPdc(businessId, adminId, pdcId, today);

  assert.equal(arGap(), gapBefore);
  assert.throws(
    () => createReceipt(businessId, adminId, {
      customerId: aedCustomer.id, invoiceId, date: today, bankAccountId: settings.bank, amount: "1000.00",
    }),
    /already fully settled/,
  );
});

test("reverse-charge purchases entered tax-inclusive still self-assess VAT", () => {
  const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'AED' AND is_active = 1 ORDER BY name LIMIT 1").get() as { id: string };
  const expense = sqlite.prepare("SELECT default_purchase_expense_account_id AS id FROM business_accounting_settings WHERE id = 'default'").get() as { id: string };
  const invoiceId = savePurchaseInvoice(businessId, adminId, {
    supplierId: supplier.id, supplierInvoiceNumber: "TIEOUT-RC", invoiceDate: "2034-03-01", taxDate: "2034-03-01", dueDate: "2034-03-31",
    amountsIncludeTax: true,
    lines: [{ description: "Imported service", quantity: "1", unitPrice: "1000.00", expenseAccountId: expense.id, taxCodeId: "tax-reverse-charge-purchases" }],
  }, "post");
  const tax = sqlite.prepare("SELECT base_net_minor, output_vat_minor, recoverable_vat_minor FROM tax_entries WHERE source_id = ?").get(invoiceId) as {
    base_net_minor: number; output_vat_minor: number; recoverable_vat_minor: number;
  };
  assert.deepEqual(tax, { base_net_minor: 100_000, output_vat_minor: 5_000, recoverable_vat_minor: 5_000 });
  const payable = sqlite.prepare("SELECT total_minor FROM purchase_invoices WHERE id = ?").get(invoiceId) as { total_minor: number };
  assert.equal(payable.total_minor, 100_000, "the supplier is owed the price only");
});

test("stock received against a foreign, discounted purchase invoice carries the invoice's base value", () => {
  saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2034-04-01", rateToBase: "3.672500", source: "Manual", sourceReference: "tie-out stock" });
  const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };
  const item = sqlite.prepare("SELECT id, inventory_asset_account_id FROM inventory_items WHERE is_active = 1 ORDER BY name LIMIT 1").get() as { id: string; inventory_asset_account_id: string };
  const location = sqlite.prepare("SELECT id FROM inventory_locations WHERE is_active = 1 ORDER BY code LIMIT 1").get() as { id: string };

  const invoiceId = savePurchaseInvoice(businessId, adminId, {
    currencyCode: "USD", exchangeRateToBase: "3.672500", exchangeRateDate: "2034-04-01", exchangeRateSource: "Manual",
    supplierId: supplier.id, supplierInvoiceNumber: "TIEOUT-STOCK", invoiceDate: "2034-04-01", taxDate: "2034-04-01", dueDate: "2034-04-30",
    lines: [{ itemId: item.id, description: "Stock", quantity: "3", unitPrice: "10.00", discountType: "percentage", discountValue: "10",
      expenseAccountId: item.inventory_asset_account_id, taxCodeId: "tax-out-of-scope" }],
  }, "post");
  const invoiceLine = sqlite.prepare("SELECT id FROM purchase_invoice_lines WHERE purchase_invoice_id = ?").get(invoiceId) as { id: string };
  const journalInventory = sqlite.prepare(`
    SELECT SUM(jl.debit_minor) AS value FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_type = 'purchase_invoice' AND je.source_id = ? AND jl.account_id = ?
  `).get(invoiceId, item.inventory_asset_account_id) as { value: number };

  const receiptId = saveGoodsReceipt(businessId, adminId, {
    supplierId: supplier.id, purchaseInvoiceId: invoiceId, date: "2034-04-02", locationId: location.id,
    lines: [{ itemId: item.id, description: "Stock", quantity: "3", unitCost: "10.00", purchaseInvoiceLineId: invoiceLine.id }],
  }, "post");
  const movement = sqlite.prepare("SELECT SUM(value_delta_minor) AS value FROM inventory_movements WHERE source_type = 'goods_receipt' AND source_id = ?").get(receiptId) as { value: number };

  // 3 × 10 USD less 10% = 27 USD × 3.6725 = 99.16 AED, not the typed 30.00.
  assert.equal(journalInventory.value, 9_916);
  assert.equal(movement.value, journalInventory.value);
});

test("an unbalanced opening balance lands in a dedicated Opening Balance Equity account", () => {
  const cash = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') AND is_active = 1 ORDER BY id LIMIT 1").get() as { id: string };
  saveOpeningBalances(businessId, adminId, "2020-01-01", [{ accountId: cash.id, debitMinor: 50_000, creditMinor: 0 }]);
  const plug = sqlite.prepare(`
    SELECT jl.credit_minor FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_type = 'opening_balance' AND jl.account_id = ?
  `).get(OPENING_BALANCE_EQUITY_ACCOUNT_ID) as { credit_minor: number };
  assert.equal(plug.credit_minor, 50_000);
  assert.throws(
    () => saveOpeningBalances(businessId, adminId, "2020-01-01", [{ accountId: cash.id, debitMinor: 100, creditMinor: 100 }]),
    /not both/,
  );
});

test("ledger dates use the UAE business day, not the UTC day", () => {
  assert.equal(getBusinessDateIso(new Date("2026-11-25T21:30:00Z")), "2026-11-26");
  assert.equal(getBusinessDateIso(new Date("2026-11-25T19:59:00Z")), "2026-11-25");
});

/** Supplier subledger in base currency: open bill carrying value minus unapplied payment and debit-note credit, plus refunds received. */
function apSubledger() {
  const bills = sqlite.prepare(`
    SELECT COALESCE(SUM(pi.base_total_minor
      - COALESCE((SELECT SUM(spa.base_carrying_amount_released) FROM supplier_payment_allocations spa
          INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
          WHERE spa.purchase_invoice_id = pi.id), 0)
      - COALESCE((SELECT SUM(dna.base_carrying_amount_released) FROM debit_note_allocations dna
          INNER JOIN debit_notes dn ON dn.id = dna.debit_note_id AND dn.document_status = 'posted'
          WHERE dna.purchase_invoice_id = pi.id), 0)), 0) AS open_base
    FROM purchase_invoices pi WHERE pi.document_status = 'posted'
  `).get() as { open_base: number };
  const unapplied = sqlite.prepare(`
    SELECT COALESCE(SUM(sp.base_amount_minor
      - COALESCE((SELECT SUM(spa.settlement_base_amount) FROM supplier_payment_allocations spa WHERE spa.payment_id = sp.id), 0)), 0) AS credit_base
    FROM supplier_payments sp WHERE sp.document_status = 'posted'
  `).get() as { credit_base: number };
  const debitCredit = sqlite.prepare(`
    SELECT COALESCE(SUM(dn.base_total_minor
      - COALESCE((SELECT SUM(dna.settlement_base_amount) FROM debit_note_allocations dna WHERE dna.debit_note_id = dn.id), 0)
      - COALESCE((SELECT SUM(r.released_carrying_amount_minor) FROM supplier_refunds r
          WHERE r.debit_note_id = dn.id AND r.document_status = 'posted'), 0)), 0) AS credit_base
    FROM debit_notes dn WHERE dn.document_status = 'posted'
  `).get() as { credit_base: number };
  return bills.open_base - unapplied.credit_base - debitCredit.credit_base;
}

/** AP is credit-normal: its credit balance minus the subledger must not move. */
const apGap = () => -glBalance(settings.ap) - apSubledger();

/** VAT per tax rows vs. the GL movement on the same journals, across a document's whole history. */
function vatTieOut(sourceType: "sales_invoice" | "purchase_invoice", documentId: string, accountId: string) {
  const revisions = sqlite.prepare(`
    SELECT DISTINCT source_id FROM journal_entries WHERE source_type IN (?, ?) AND source_id LIKE ? || ':%'
  `).all(`${sourceType}_superseded`, `${sourceType}_amendment`, documentId) as { source_id: string }[];
  const sourceIds = [documentId, ...revisions.map((row) => row.source_id)];
  const placeholders = sourceIds.map(() => "?").join(", ");
  const tax = sqlite.prepare(`
    SELECT COALESCE(SUM(output_vat_minor), 0) AS output, COALESCE(SUM(recoverable_vat_minor), 0) AS recoverable
    FROM tax_entries WHERE source_id IN (${placeholders})
  `).get(...sourceIds) as { output: number; recoverable: number };
  const gl = sqlite.prepare(`
    SELECT COALESCE(SUM(jl.credit_minor - jl.debit_minor), 0) AS amount
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_id IN (${placeholders}) AND jl.account_id = ?
  `).get(...sourceIds, accountId) as { amount: number };
  return { tax, gl: gl.amount };
}

const vatAccounts = sqlite.prepare(`
  SELECT vat_output_account_id AS output, input_vat_account_id AS input, default_purchase_expense_account_id AS expense
  FROM business_accounting_settings WHERE id = 'default'
`).get() as { output: string; input: string; expense: string };
const aedSupplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'AED' AND is_active = 1 ORDER BY name LIMIT 1").get() as { id: string };
const countJournals = () => (sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries").get() as { count: number }).count;
const lastActivity = (entityId: string) => sqlite.prepare(`
  SELECT summary, details_json FROM activity_logs WHERE entity_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
`).get(entityId) as { summary: string; details_json: string };

test("editing a posted sales invoice reverses and reposts, keeping AR and VAT tied to the GL", () => {
  const gapBefore = arGap();
  const invoiceInput = {
    customerId: aedCustomer.id, invoiceDate: "2034-05-10", taxDate: "2034-05-10", dueDate: "2034-06-10", reference: "TIEOUT-AMEND",
    supplyEmirate: "dubai" as const,
    lines: [{ description: "Consulting", quantity: "1", unitPrice: "1000.00", salesAccountId: settings.sales, taxCodeId: "tax-uae-vat-5-sales" }],
  };
  const twoLines = [
    { description: "Consulting", quantity: "1", unitPrice: "1200.00", salesAccountId: settings.sales, taxCodeId: "tax-uae-vat-5-sales" },
    { description: "Travel", quantity: "2", unitPrice: "50.00", salesAccountId: settings.sales, taxCodeId: "tax-uae-vat-5-sales" },
  ];
  const invoiceId = createInvoice(businessId, adminId, invoiceInput, "post");
  createReceipt(businessId, adminId, {
    customerId: aedCustomer.id, invoiceId, date: "2034-05-12", bankAccountId: settings.bank, amount: "300.00",
  });
  const original = sqlite.prepare("SELECT entry_number FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?").get(invoiceId) as { entry_number: string };

  updateInvoice(businessId, adminId, invoiceId, { ...invoiceInput, lines: twoLines }, "post");

  // The old version survives as its own entry and is reversed, not rewritten.
  const history = sqlite.prepare(`
    SELECT entry_number, source_type FROM journal_entries WHERE source_id = ? OR source_id LIKE ? || ':%'
  `).all(invoiceId, invoiceId) as { entry_number: string; source_type: string }[];
  assert.deepEqual(history.map((row) => row.source_type).sort(), ["sales_invoice", "sales_invoice_amendment", "sales_invoice_superseded"]);
  assert.equal(history.find((row) => row.source_type === "sales_invoice_superseded")?.entry_number, original.entry_number);
  assert.notEqual(history.find((row) => row.source_type === "sales_invoice")?.entry_number, original.entry_number);
  const live = sqlite.prepare(`
    SELECT SUM(jl.debit_minor) AS debit FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_type = 'sales_invoice' AND je.source_id = ? AND jl.account_id = ?
  `).get(invoiceId, settings.ar) as { debit: number };
  assert.equal(live.debit, 136_500, "1,300 + 5% VAT");

  assert.equal(arGap(), gapBefore, "AR control still equals the customer subledger");
  const vat = vatTieOut("sales_invoice", invoiceId, vatAccounts.output);
  assert.equal(vat.tax.output, 6_500);
  assert.equal(vat.gl, vat.tax.output, "output VAT rows tie to the VAT ledger");

  const log = lastActivity(invoiceId);
  const details = JSON.parse(log.details_json);
  assert.deepEqual([details.before.totalMinor, details.after.totalMinor], [105_000, 136_500]);
  assert.deepEqual([details.before.vatMinor, details.after.vatMinor], [5_000, 6_500]);
  assert.equal(details.lineChangeSummary, "1 line added, 1 line changed");
  assert.match(log.summary, /1050\.00 → AED 1365\.00/);
  assert.equal(details.amendment.supersededEntry, original.entry_number);

  assert.throws(
    () => updateInvoice(businessId, adminId, invoiceId, {
      ...invoiceInput,
      lines: [{ description: "Consulting", quantity: "1", unitPrice: "100.00", salesAccountId: settings.sales, taxCodeId: "tax-uae-vat-5-sales" }],
    }, "post"),
    /300\.00 is already settled/,
  );

  // A notes-only edit leaves the ledger alone.
  const journalsBefore = countJournals();
  updateInvoice(businessId, adminId, invoiceId, { ...invoiceInput, notes: "Thank you", lines: twoLines }, "post");
  assert.equal(countJournals(), journalsBefore);
  assert.equal(vatTieOut("sales_invoice", invoiceId, vatAccounts.output).tax.output, 6_500);
  assert.match(lastActivity(invoiceId).summary, /ledger unchanged/);

  // A second amendment stacks another revision and still ties out.
  updateInvoice(businessId, adminId, invoiceId, {
    ...invoiceInput, invoiceDate: "2034-05-11", taxDate: "2034-05-11",
    lines: [{ description: "Consulting", quantity: "1", unitPrice: "800.00", salesAccountId: settings.sales, taxCodeId: "tax-uae-vat-5-sales" }],
  }, "post");
  assert.equal(arGap(), gapBefore);
  const secondVat = vatTieOut("sales_invoice", invoiceId, vatAccounts.output);
  assert.equal(secondVat.tax.output, 4_000);
  assert.equal(secondVat.gl, secondVat.tax.output);
});

test("posted invoice edits are refused when the old or new date is in a locked period", () => {
  const invoiceInput = {
    customerId: aedCustomer.id, invoiceDate: "2034-07-10", taxDate: "2034-07-10", dueDate: "2034-08-10",
    lines: [{ description: "Lock test", quantity: "1", unitPrice: "100.00", salesAccountId: settings.sales, taxCodeId: "tax-out-of-scope" }],
  };
  const invoiceId = createInvoice(businessId, adminId, invoiceInput, "post");
  try {
    setFinancialLockDate(businessId, adminId, "2034-06-30");
    assert.throws(
      () => updateInvoice(businessId, adminId, invoiceId, { ...invoiceInput, invoiceDate: "2034-06-15", taxDate: "2034-06-15" }, "post"),
      /closed/,
    );
    setFinancialLockDate(businessId, adminId, "2034-07-15");
    assert.throws(
      () => updateInvoice(businessId, adminId, invoiceId, { ...invoiceInput, invoiceDate: "2034-07-20", taxDate: "2034-07-20" }, "post"),
      /closed/,
    );
  } finally {
    setFinancialLockDate(businessId, adminId, null);
  }
  const amendments = sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries WHERE source_id LIKE ? || ':%'").get(invoiceId) as { count: number };
  assert.equal(amendments.count, 0);
});

test("editing a posted purchase invoice reverses and reposts, keeping AP and input VAT tied to the GL", () => {
  const gapBefore = apGap();
  const billInput = {
    supplierId: aedSupplier.id, supplierInvoiceNumber: "TIEOUT-AMEND-BILL", invoiceDate: "2034-05-10", taxDate: "2034-05-10", dueDate: "2034-06-10",
    lines: [{ description: "Supplies", quantity: "1", unitPrice: "400.00", expenseAccountId: vatAccounts.expense, taxCodeId: "tax-uae-vat-5-purchases" }],
  };
  const billId = savePurchaseInvoice(businessId, adminId, billInput, "post");
  createSupplierPayment(businessId, adminId, {
    supplierId: aedSupplier.id, purchaseInvoiceId: billId, date: "2034-05-12", bankAccountId: settings.bank, amount: "100.00",
  });
  assert.equal(apGap(), gapBefore);

  savePurchaseInvoice(businessId, adminId, {
    ...billInput,
    lines: [{ description: "Supplies", quantity: "2", unitPrice: "400.00", expenseAccountId: vatAccounts.expense, taxCodeId: "tax-uae-vat-5-purchases" }],
  }, "post", billId);
  assert.equal(apGap(), gapBefore, "AP control still equals the supplier subledger");
  const vat = vatTieOut("purchase_invoice", billId, vatAccounts.input);
  assert.equal(vat.tax.recoverable, 4_000);
  assert.equal(-vat.gl, vat.tax.recoverable, "input VAT rows tie to the VAT ledger");
  const superseded = sqlite.prepare("SELECT COUNT(*) AS count FROM journal_entries WHERE source_type = 'purchase_invoice_superseded' AND source_id LIKE ? || ':%'").get(billId) as { count: number };
  assert.equal(superseded.count, 1);

  assert.throws(
    () => savePurchaseInvoice(businessId, adminId, {
      ...billInput,
      lines: [{ description: "Supplies", quantity: "1", unitPrice: "50.00", expenseAccountId: vatAccounts.expense, taxCodeId: "tax-uae-vat-5-purchases" }],
    }, "post", billId),
    /100\.00 is already settled/,
  );
  const details = JSON.parse(lastActivity(billId).details_json);
  assert.deepEqual([details.before.netMinor, details.after.netMinor], [40_000, 80_000]);
});

test("crediting a fully paid invoice leaves customer credit that can be applied and refunded, with AR tied out", () => {
  const gapBefore = arGap();
  const bankBefore = glBalance(settings.bank);
  const line = (unitPrice: string) => [{ description: "Refund case", quantity: "1", unitPrice, salesAccountId: settings.sales, taxCodeId: "tax-out-of-scope" }];
  const paidInvoiceId = createInvoice(businessId, adminId, {
    customerId: aedCustomer.id, invoiceDate: "2034-08-01", taxDate: "2034-08-01", dueDate: "2034-08-31", lines: line("1000.00"),
  }, "post");
  createReceipt(businessId, adminId, { customerId: aedCustomer.id, invoiceId: paidInvoiceId, date: "2034-08-02", bankAccountId: settings.bank, amount: "1000.00" });

  const noteInput = {
    customerId: aedCustomer.id, sourceInvoiceId: paidInvoiceId, date: "2034-08-05", taxDate: "2034-08-05", reason: "Returned", lines: line("400.00"),
  };
  assert.throws(() => saveCreditNote(businessId, adminId, { ...noteInput, lines: line("1000.01") }, "post"), /cannot exceed AED 1000\.00/);
  const noteId = saveCreditNote(businessId, adminId, noteInput, "post");
  assert.equal(arGap(), gapBefore, "the excess credit sits in AR as a customer credit balance");
  const credit = listPartyNoteCredits(businessId, adminId, "customer", aedCustomer.id).find((row) => row.noteId === noteId);
  assert.equal(credit?.unallocatedMinor, 40_000);

  // Apply part of the credit to another invoice.
  const nextInvoiceId = createInvoice(businessId, adminId, {
    customerId: aedCustomer.id, invoiceDate: "2034-08-06", taxDate: "2034-08-06", dueDate: "2034-09-06", lines: line("150.00"),
  }, "post");
  applyCreditNoteToInvoice(businessId, adminId, { noteId, documentId: nextInvoiceId, amount: "100.00" });
  assert.equal(getRemainingInvoiceBalance(businessId, adminId, nextInvoiceId), 5_000);
  assert.equal(arGap(), gapBefore);

  // Refund the rest from the bank.
  assert.throws(
    () => createCustomerRefund(businessId, adminId, { noteId, date: "2034-08-07", bankAccountId: settings.bank, amount: "300.01" }),
    /available to refund/,
  );
  const refund = createCustomerRefund(businessId, adminId, { noteId, date: "2034-08-07", bankAccountId: settings.bank, amount: "300.00", reference: "REF-1" });
  assert.match(refund.refundNumber, /^CRF-\d{4}$/);
  assert.equal(arGap(), gapBefore, "AR control equals the subledger after the refund");
  assert.equal(glBalance(settings.bank) - bankBefore, 100_000 - 30_000);
  assert.equal(listPartyNoteCredits(businessId, adminId, "customer", aedCustomer.id).some((row) => row.noteId === noteId), false);
  assert.throws(() => voidCreditNote(businessId, adminId, noteId), /applied to another invoice or refunded/);
  assert.match(lastActivity(noteId).summary, /Refunded AED 300\.00 to customer/);

  voidCustomerRefund(businessId, adminId, refund.id);
  assert.equal(arGap(), gapBefore);
  assert.equal(listPartyNoteCredits(businessId, adminId, "customer", aedCustomer.id).find((row) => row.noteId === noteId)?.unallocatedMinor, 30_000);
});

test("a foreign-currency customer refund books realized FX and keeps AR tied out", () => {
  saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2034-09-01", rateToBase: "3.600000", source: "Manual", sourceReference: "refund invoice" });
  saveExchangeRate(businessId, adminId, { currencyCode: "USD", rateDate: "2034-09-10", rateToBase: "3.700000", source: "Manual", sourceReference: "refund paid" });
  const gapBefore = arGap();
  const fxLossBefore = glBalance(settings.fx_loss);
  const usd = { currencyCode: "USD", exchangeRateToBase: "3.600000", exchangeRateDate: "2034-09-01", exchangeRateSource: "Manual" as const };
  const invoiceId = createInvoice(businessId, adminId, {
    ...usd, customerId: usdCustomer.id, invoiceDate: "2034-09-01", taxDate: "2034-09-01", dueDate: "2034-10-01",
    lines: [{ description: "USD refund", quantity: "1", unitPrice: "100.00", salesAccountId: settings.sales, taxCodeId: "tax-out-of-scope" }],
  }, "post");
  createReceipt(businessId, adminId, { ...usd, customerId: usdCustomer.id, invoiceId, date: "2034-09-01", bankAccountId: settings.bank, amount: "100.00" });
  const noteId = saveCreditNote(businessId, adminId, {
    ...usd, customerId: usdCustomer.id, sourceInvoiceId: invoiceId, date: "2034-09-02", taxDate: "2034-09-02",
    lines: [{ description: "USD refund", quantity: "1", unitPrice: "100.00", salesAccountId: settings.sales, taxCodeId: "tax-out-of-scope" }],
  }, "post");
  assert.equal(arGap(), gapBefore);
  createCustomerRefund(businessId, adminId, {
    noteId, date: "2034-09-10", bankAccountId: settings.bank, amount: "100.00",
    exchangeRateToBase: "3.700000", exchangeRateDate: "2034-09-10", exchangeRateSource: "Manual",
  });
  assert.equal(arGap(), gapBefore);
  // 100 USD carried at 3.60 but paid out at 3.70: 10.00 AED loss.
  assert.equal(glBalance(settings.fx_loss) - fxLossBefore, 1_000);
});

test("debiting a fully paid purchase invoice leaves supplier credit that can be applied and refunded, with AP tied out", () => {
  const gapBefore = apGap();
  const bankBefore = glBalance(settings.bank);
  const line = (unitPrice: string) => [{ description: "Supplier refund case", quantity: "1", unitPrice, expenseAccountId: vatAccounts.expense, taxCodeId: "tax-out-of-scope" }];
  const billId = savePurchaseInvoice(businessId, adminId, {
    supplierId: aedSupplier.id, supplierInvoiceNumber: "TIEOUT-DN-PAID", invoiceDate: "2034-08-01", taxDate: "2034-08-01", dueDate: "2034-08-31", lines: line("500.00"),
  }, "post");
  createSupplierPayment(businessId, adminId, { supplierId: aedSupplier.id, purchaseInvoiceId: billId, date: "2034-08-02", bankAccountId: settings.bank, amount: "500.00" });
  assert.equal(apGap(), gapBefore);

  const noteInput = { supplierId: aedSupplier.id, purchaseInvoiceId: billId, date: "2034-08-05", taxDate: "2034-08-05", lines: line("200.00") };
  assert.throws(() => saveDebitNote(businessId, adminId, { ...noteInput, lines: line("500.01") }, "post"), /cannot exceed AED 500\.00/);
  const noteId = saveDebitNote(businessId, adminId, noteInput, "post");
  assert.equal(apGap(), gapBefore, "the excess sits in AP as a supplier debit balance");
  assert.equal(listPartyNoteCredits(businessId, adminId, "supplier", aedSupplier.id).find((row) => row.noteId === noteId)?.unallocatedMinor, 20_000);
  const paidBill = sqlite.prepare("SELECT total_minor FROM purchase_invoices WHERE id = ?").get(billId) as { total_minor: number };
  assert.equal(paidBill.total_minor, 50_000);

  const nextBillId = savePurchaseInvoice(businessId, adminId, {
    supplierId: aedSupplier.id, supplierInvoiceNumber: "TIEOUT-DN-NEXT", invoiceDate: "2034-08-06", taxDate: "2034-08-06", dueDate: "2034-09-06", lines: line("80.00"),
  }, "post");
  applyDebitNoteToPurchaseInvoice(businessId, adminId, { noteId, documentId: nextBillId, amount: "50.00" });
  assert.equal(apGap(), gapBefore);
  assert.throws(
    () => createSupplierPayment(businessId, adminId, { supplierId: aedSupplier.id, purchaseInvoiceId: nextBillId, date: "2034-08-07", bankAccountId: settings.bank, amount: "80.00" }),
    /exceeds/,
    "a payment cannot exceed what the applied debit note left open",
  );

  const refund = createSupplierRefund(businessId, adminId, { noteId, date: "2034-08-08", bankAccountId: settings.bank, amount: "150.00" });
  assert.match(refund.refundNumber, /^SRF-\d{4}$/);
  assert.equal(apGap(), gapBefore, "AP control equals the subledger after the refund");
  assert.equal(glBalance(settings.bank) - bankBefore, -50_000 + 15_000);
  assert.throws(() => voidDebitNote(businessId, adminId, noteId), /applied to another purchase invoice or refunded/);
  voidSupplierRefund(businessId, adminId, refund.id);
  assert.equal(apGap(), gapBefore);
});
