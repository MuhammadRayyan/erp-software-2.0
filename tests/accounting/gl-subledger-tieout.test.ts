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
const { createInvoice } = await import("../../src/modules/sales-invoices/invoice-service");
const { createReceipt, applyReceiptCredit } = await import("../../src/modules/receipts/receipt-service");
const { savePurchaseInvoice } = await import("../../src/modules/purchase-invoices/purchase-invoice-service");
const { saveGoodsReceipt } = await import("../../src/modules/inventory/goods-receipt-service");
const { createPdc, clearPdc } = await import("../../src/modules/banking/pdc-service");
const { saveOpeningBalances, OPENING_BALANCE_EQUITY_ACCOUNT_ID } = await import("../../src/modules/accounting/services/opening-balances-service");
const { businessToday } = await import("../../src/core/dates");

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
  return invoices.open_base - unapplied.credit_base;
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
  const today = businessToday();
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
  assert.equal(businessToday(new Date("2026-11-25T21:30:00Z")), "2026-11-26");
  assert.equal(businessToday(new Date("2026-11-25T19:59:00Z")), "2026-11-25");
});
