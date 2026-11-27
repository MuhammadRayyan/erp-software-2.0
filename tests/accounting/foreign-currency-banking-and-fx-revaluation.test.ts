import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-fx-banking-")),
  BETTER_AUTH_SECRET: "fx-banking-revaluation-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { saveExchangeRate } = await import("../../src/modules/currency/exchange-rate");
const { createAccount } = await import("../../src/modules/accounting/services/account-service");
const { saveBankAccount, getBankAccount } = await import("../../src/modules/banking/bank-account-service");
const { createInvoice } = await import("../../src/modules/sales-invoices/invoice-service");
const { createReceipt } = await import("../../src/modules/receipts/receipt-service");
const { savePurchaseInvoice } = await import("../../src/modules/purchase-invoices/purchase-invoice-service");
const { createSupplierPayment } = await import("../../src/modules/supplier-payments/supplier-payment-service");
const { saveBankTransaction, voidBankTransaction } = await import("../../src/modules/banking/bank-transaction-service");
const { createBankTransfer } = await import("../../src/modules/banking/bank-transfer-service");
const { getBankTransactionHistory } = await import("../../src/modules/banking/banking-report-service");
const { importBankStatement } = await import("../../src/modules/banking/statement-service");
const { suggestMatches, confirmStatementMatch } = await import("../../src/modules/banking/matching-service");
const { startReconciliation, getReconciliationSnapshot, completeReconciliation } = await import("../../src/modules/banking/reconciliation-service");
const { saveOpeningBalances } = await import("../../src/modules/accounting/services/opening-balances-service");
const { setFinancialLockDate } = await import("../../src/modules/accounting/services/financial-lock-service");
const {
  previewFxRevaluation, postFxRevaluation, voidFxRevaluation, listFxRevaluations, getFxRevaluationRateDefaults,
} = await import("../../src/modules/accounting/services/fx-revaluation-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);
const settings = sqlite.prepare(`
  SELECT accounts_receivable_account_id AS ar, accounts_payable_account_id AS ap,
    default_sales_account_id AS sales, default_bank_account_id AS bank,
    default_purchase_expense_account_id AS expense,
    realized_fx_gain_account_id AS fx_gain, realized_fx_loss_account_id AS fx_loss
  FROM business_accounting_settings WHERE id = 'default'
`).get() as { ar: string; ap: string; sales: string; bank: string; expense: string; fx_gain: string; fx_loss: string };
const usdCustomer = sqlite.prepare("SELECT id FROM customers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };
const usdSupplier = sqlite.prepare("SELECT id FROM suppliers WHERE default_currency_code = 'USD' ORDER BY name LIMIT 1").get() as { id: string };
const aedBank = sqlite.prepare("SELECT id FROM bank_accounts WHERE ledger_account_id = ?").get(settings.bank) as { id: string };

for (const [currencyCode, rateDate, rateToBase] of [
  ["USD", "2036-01-01", "3.600000"], ["USD", "2036-01-15", "3.650000"], ["USD", "2036-01-31", "3.700000"],
  ["USD", "2036-02-10", "3.750000"], ["EUR", "2036-01-01", "4.000000"], ["EUR", "2036-01-31", "4.100000"],
] as const) {
  saveExchangeRate(businessId, adminId, { currencyCode, rateDate, rateToBase, source: "Manual", sourceReference: "fx-banking test" });
}
const usdRate = (date: string, rate: string) => ({ currencyCode: "USD", exchangeRateToBase: rate, exchangeRateDate: date, exchangeRateSource: "Manual" as const });

function newBank(name: string, currencyCode: string) {
  const ledgerAccountId = createAccount(businessId, adminId, { name: `${name} ledger`, type: "asset", subtype: "bank" });
  const id = saveBankAccount(businessId, adminId, {
    name, accountCode: name.slice(0, 6), bankName: "Test Bank", accountNumberMasked: "", currencyCode,
    ledgerAccountId, isCashAccount: false, isActive: true,
  });
  return { id, ledgerAccountId };
}
const usdBank = newBank("USD Account", "USD");
const eurBank = newBank("EUR Account", "EUR");

function glBalance(accountId: string, asOf = "9999-12-31") {
  return (sqlite.prepare(`
    SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = ? AND je.status = 'posted' AND je.date <= ?
  `).get(accountId, asOf) as { balance: number }).balance;
}
function journalLines(sourceType: string, sourceId: string) {
  return sqlite.prepare(`
    SELECT jl.account_id, jl.debit_minor, jl.credit_minor, jl.currency_amount_minor
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_type = ? AND je.source_id = ? ORDER BY jl.position
  `).all(sourceType, sourceId) as { account_id: string; debit_minor: number; credit_minor: number; currency_amount_minor: number | null }[];
}
const lineFor = (lines: ReturnType<typeof journalLines>, accountId: string) => lines.find((line) => line.account_id === accountId);

/** Base-currency subledgers, the same way gl-subledger-tieout.test.ts measures them. */
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
function apSubledger() {
  const invoices = sqlite.prepare(`
    SELECT COALESCE(SUM(pi.base_total_minor
      - COALESCE((SELECT SUM(spa.base_carrying_amount_released) FROM supplier_payment_allocations spa
          INNER JOIN supplier_payments sp ON sp.id = spa.payment_id AND sp.document_status = 'posted'
          WHERE spa.purchase_invoice_id = pi.id), 0)), 0) AS open_base
    FROM purchase_invoices pi WHERE pi.document_status = 'posted'
  `).get() as { open_base: number };
  const unapplied = sqlite.prepare(`
    SELECT COALESCE(SUM(sp.base_amount_minor
      - COALESCE((SELECT SUM(spa.settlement_base_amount) FROM supplier_payment_allocations spa WHERE spa.payment_id = sp.id), 0)), 0) AS debit_base
    FROM supplier_payments sp WHERE sp.document_status = 'posted'
  `).get() as { debit_base: number };
  // AP is a credit balance: GL (debit-positive) + subledger should be constant.
  return invoices.open_base - unapplied.debit_base;
}
const arGap = () => glBalance(settings.ar) - arSubledger();
const apGap = () => glBalance(settings.ap) + apSubledger();

function usdInvoice(amount: string, date: string, reference: string) {
  return createInvoice(businessId, adminId, {
    ...usdRate("2036-01-01", "3.600000"),
    customerId: usdCustomer.id, invoiceDate: date, taxDate: date, dueDate: "2036-03-31", reference,
    lines: [{ description: reference, quantity: "1", unitPrice: amount, salesAccountId: settings.sales, taxCodeId: "tax-out-of-scope" }],
  }, "post");
}
function usdBill(amount: string, date: string, reference: string) {
  return savePurchaseInvoice(businessId, adminId, {
    ...usdRate("2036-01-01", "3.600000"),
    supplierId: usdSupplier.id, supplierInvoiceNumber: reference, invoiceDate: date, taxDate: date, dueDate: "2036-03-31",
    lines: [{ description: reference, quantity: "1", unitPrice: amount, expenseAccountId: settings.expense, taxCodeId: "tax-out-of-scope" }],
  }, "post");
}

const gapsAtStart = { ar: arGap(), ap: apGap() };
const ids = {} as Record<string, string>;

test("bank accounts keep a currency that is locked once used, on a dedicated ledger", () => {
  assert.throws(() => saveBankAccount(businessId, adminId, {
    name: "Bad USD", accountCode: "", bankName: "", accountNumberMasked: "", currencyCode: "USD",
    ledgerAccountId: settings.bank, isCashAccount: false, isActive: true,
  }), /default bank ledger|already mapped/);
  const account = getBankAccount(businessId, adminId, usdBank.id)!;
  assert.equal(account.currency_code, "USD");
  assert.equal(account.book_balance_minor, 0);
  assert.throws(
    () => saveOpeningBalances(businessId, adminId, "2035-12-31", [{ accountId: usdBank.ledgerAccountId, debitMinor: 100, creditMinor: 0 }]),
    /Bank Transaction in USD/,
  );
});

test("a receipt into a USD bank books the bank in USD and base, with realized FX against the invoice rate", () => {
  ids.invoiceA = usdInvoice("1000.00", "2036-01-01", "FXB-INV-A");
  const receipt = createReceipt(businessId, adminId, {
    ...usdRate("2036-01-15", "3.650000"),
    customerId: usdCustomer.id, date: "2036-01-15", bankAccountId: usdBank.ledgerAccountId, amount: "1000.00",
    allocations: [{ invoiceId: ids.invoiceA, amount: "1000.00" }],
  });
  ids.receiptA = receipt.id;
  const lines = journalLines("receipt", receipt.id);
  assert.deepEqual(lineFor(lines, usdBank.ledgerAccountId), { account_id: usdBank.ledgerAccountId, debit_minor: 365_000, credit_minor: 0, currency_amount_minor: 100_000 });
  assert.equal(lineFor(lines, settings.ar)?.credit_minor, 360_000);
  assert.equal(lineFor(lines, settings.fx_gain)?.credit_minor, 5_000);

  // Same-currency bank and invoice at the same rate: no FX at all.
  const sameRateInvoice = usdInvoice("10.00", "2036-01-01", "FXB-INV-SAME");
  const sameRate = createReceipt(businessId, adminId, {
    ...usdRate("2036-01-01", "3.600000"),
    customerId: usdCustomer.id, date: "2036-01-02", bankAccountId: usdBank.ledgerAccountId, amount: "10.00",
    allocations: [{ invoiceId: sameRateInvoice, amount: "10.00" }],
  });
  const sameLines = journalLines("receipt", sameRate.id);
  assert.equal(sameLines.length, 2);
  assert.equal(lineFor(sameLines, usdBank.ledgerAccountId)?.currency_amount_minor, 1_000);

  assert.throws(() => createReceipt(businessId, adminId, {
    currencyCode: "AED", customerId: usdCustomer.id, date: "2036-01-15", bankAccountId: usdBank.ledgerAccountId, amount: "5.00",
  }), /USD bank account can only receive payments in USD/);

  const account = getBankAccount(businessId, adminId, usdBank.id)!;
  assert.equal(account.book_balance_minor, 101_000, "balance in USD");
  assert.equal(account.base_balance_minor, 368_600, "GL balance in AED");
  assert.throws(() => saveBankAccount(businessId, adminId, {
    name: "USD Account", accountCode: "", bankName: "", accountNumberMasked: "", currencyCode: "EUR",
    ledgerAccountId: usdBank.ledgerAccountId, isCashAccount: false, isActive: true,
  }, usdBank.id), /currency cannot change/);
  assert.equal(arGap(), gapsAtStart.ar);
});

test("a supplier payment from a USD bank credits the bank in USD", () => {
  const bill = usdBill("400.00", "2036-01-01", "FXB-BILL-A");
  const payment = createSupplierPayment(businessId, adminId, {
    ...usdRate("2036-01-15", "3.650000"),
    supplierId: usdSupplier.id, date: "2036-01-15", bankAccountId: usdBank.ledgerAccountId, amount: "400.00",
    allocations: [{ invoiceId: bill, amount: "400.00" }],
  });
  ids.paymentA = payment.id;
  const lines = journalLines("supplier_payment", payment.id);
  assert.deepEqual(lineFor(lines, usdBank.ledgerAccountId), { account_id: usdBank.ledgerAccountId, debit_minor: 0, credit_minor: 146_000, currency_amount_minor: -40_000 });
  assert.equal(lineFor(lines, settings.ap)?.debit_minor, 144_000);
  assert.equal(lineFor(lines, settings.fx_loss)?.debit_minor, 2_000);
  assert.equal(apGap(), gapsAtStart.ap);
});

test("a bank transaction on a USD bank is entered in USD and posted in base at the stored rate", () => {
  ids.bankTxn = saveBankTransaction(businessId, adminId, {
    bankAccountId: usdBank.id, date: "2036-01-15", taxDate: "2036-01-15", type: "money_out", description: "USD bank charges",
    lines: [{ accountId: settings.expense, taxCodeId: "tax-out-of-scope", description: "Charges", amount: "50.00" }],
  }, "post");
  const row = sqlite.prepare("SELECT total_minor, base_total_minor, exchange_rate_to_base FROM bank_transactions WHERE id = ?").get(ids.bankTxn);
  assert.deepEqual(row, { total_minor: 5_000, base_total_minor: 18_250, exchange_rate_to_base: "3.650000" });
  const lines = journalLines("bank_transaction", ids.bankTxn);
  assert.deepEqual(lineFor(lines, usdBank.ledgerAccountId), { account_id: usdBank.ledgerAccountId, debit_minor: 0, credit_minor: 18_250, currency_amount_minor: -5_000 });
  assert.equal(lineFor(lines, settings.expense)?.debit_minor, 18_250);

  // Voiding reverses the bank-currency amount along with the base amount.
  const voided = saveBankTransaction(businessId, adminId, {
    bankAccountId: usdBank.id, date: "2036-01-15", taxDate: "2036-01-15", type: "money_in", description: "Posted in error",
    lines: [{ accountId: settings.sales, taxCodeId: "tax-out-of-scope", description: "Error", amount: "20.00" }],
  }, "post");
  voidBankTransaction(businessId, adminId, voided);
  assert.deepEqual(lineFor(journalLines("bank_transaction_void", voided), usdBank.ledgerAccountId),
    { account_id: usdBank.ledgerAccountId, debit_minor: 0, credit_minor: 7_300, currency_amount_minor: -2_000 });
});

test("transfers between currencies take both amounts and book the conversion difference as realized FX", () => {
  assert.throws(() => createBankTransfer(businessId, adminId, {
    fromBankAccountId: aedBank.id, toBankAccountId: usdBank.id, date: "2036-01-15", amount: "3680.00",
  }), /USD amount received/);

  ids.transferIn = createBankTransfer(businessId, adminId, {
    fromBankAccountId: aedBank.id, toBankAccountId: usdBank.id, date: "2036-01-15", amount: "3680.00", toAmount: "1000.00",
  });
  const inLines = journalLines("bank_transfer", ids.transferIn);
  // 1,000 USD is worth 3,650 AED at the day's rate; 3,680 AED was paid: 30 AED loss.
  assert.deepEqual(lineFor(inLines, usdBank.ledgerAccountId), { account_id: usdBank.ledgerAccountId, debit_minor: 365_000, credit_minor: 0, currency_amount_minor: 100_000 });
  assert.deepEqual(lineFor(inLines, settings.bank), { account_id: settings.bank, debit_minor: 0, credit_minor: 368_000, currency_amount_minor: null });
  assert.equal(lineFor(inLines, settings.fx_loss)?.debit_minor, 3_000);

  ids.transferOut = createBankTransfer(businessId, adminId, {
    fromBankAccountId: usdBank.id, toBankAccountId: eurBank.id, date: "2036-01-15", amount: "100.00", toAmount: "90.00",
  });
  const outLines = journalLines("bank_transfer", ids.transferOut);
  // 100 USD @ 3.65 = 365.00 AED out; 90 EUR @ 4.00 = 360.00 AED in: 5 AED loss.
  assert.deepEqual(lineFor(outLines, usdBank.ledgerAccountId), { account_id: usdBank.ledgerAccountId, debit_minor: 0, credit_minor: 36_500, currency_amount_minor: -10_000 });
  assert.deepEqual(lineFor(outLines, eurBank.ledgerAccountId), { account_id: eurBank.ledgerAccountId, debit_minor: 36_000, credit_minor: 0, currency_amount_minor: 9_000 });
  assert.equal(lineFor(outLines, settings.fx_loss)?.debit_minor, 500);
  const transfer = sqlite.prepare("SELECT amount_minor, to_amount_minor, realized_fx_amount_minor FROM bank_transfers WHERE id = ?").get(ids.transferOut);
  assert.deepEqual(transfer, { amount_minor: 10_000, to_amount_minor: 9_000, realized_fx_amount_minor: -500 });

  const history = getBankTransactionHistory(businessId, adminId, usdBank.id);
  const last = history.at(-1)!;
  // 1,000 + 10 − 400 − 50 + 1,000 − 100 = 1,460 USD
  assert.equal(last.balance_minor, 146_000);
  assert.equal(getBankAccount(businessId, adminId, eurBank.id)!.book_balance_minor, 9_000);
});

test("statement import, matching and reconciliation run in the bank account's currency", () => {
  const mapping = { date: "Date", valueDate: "", description: "Description", reference: "Reference", amount: "Amount", debit: "", credit: "", externalId: "ID" };
  importBankStatement(businessId, adminId, usdBank.id, "usd.csv", [
    "Date,Description,Reference,Amount,ID",
    "2036-01-02,Deposit,R0,10.00,USD-0",
    "2036-01-15,Deposit,R1,1000.00,USD-1",
    "2036-01-15,Wire out,P1,-400.00,USD-2",
  ].join("\n"), mapping);
  const lineId = (externalId: string) => (sqlite.prepare("SELECT id FROM bank_statement_lines WHERE external_id = ?").get(externalId) as { id: string }).id;
  const deposit = suggestMatches(businessId, adminId, lineId("USD-1"));
  assert.ok(deposit.some((candidate) => candidate.sourceId === ids.receiptA), "a USD 1,000 receipt matches a USD 1,000 line");
  confirmStatementMatch(businessId, adminId, lineId("USD-1"), "receipt", ids.receiptA);
  confirmStatementMatch(businessId, adminId, lineId("USD-2"), "supplier_payment", ids.paymentA);
  const small = suggestMatches(businessId, adminId, lineId("USD-0"));
  confirmStatementMatch(businessId, adminId, lineId("USD-0"), "receipt", small[0].sourceId);

  const reconciliationId = startReconciliation(businessId, adminId, usdBank.id, { statementDate: "2036-01-15", statementEndingBalance: "610.00" });
  const snapshot = getReconciliationSnapshot(businessId, adminId, reconciliationId, usdBank.id)!;
  assert.equal(snapshot.bookBalanceMinor, 146_000);
  assert.equal(snapshot.outstandingNetMinor, 85_000, "bank charge, both transfers outstanding");
  assert.equal(snapshot.differenceMinor, 0);
  completeReconciliation(businessId, adminId, usdBank.id, reconciliationId);
  assert.equal(getBankAccount(businessId, adminId, usdBank.id)!.statement_balance_minor, 61_000);
});

test("FX revaluation restates open AR, AP, advances and foreign bank balances, then reverses next day", () => {
  ids.invoiceB = usdInvoice("500.00", "2036-01-10", "FXB-INV-B");
  ids.advance = createReceipt(businessId, adminId, {
    ...usdRate("2036-01-15", "3.650000"),
    customerId: usdCustomer.id, date: "2036-01-15", bankAccountId: usdBank.ledgerAccountId, amount: "200.00",
  }).id;
  ids.billC = usdBill("300.00", "2036-01-10", "FXB-BILL-C");
  const gapsBefore = { ar: arGap(), ap: apGap() };
  assert.deepEqual(gapsBefore, gapsAtStart);

  const defaults = getFxRevaluationRateDefaults(businessId, adminId, "2036-01-31");
  assert.equal(defaults.find((row) => row.code === "USD")?.rateToBase, "3.700000", "prefilled from the latest stored rate");
  assert.equal(defaults.find((row) => row.code === "EUR")?.rateToBase, "4.100000");

  const partial = previewFxRevaluation(businessId, adminId, { date: "2036-01-31", rates: { USD: "3.70" } });
  assert.deepEqual(partial.missingRates, ["EUR"]);
  assert.throws(() => postFxRevaluation(businessId, adminId, { date: "2036-01-31", rates: { USD: "3.70" } }), /closing rate for EUR/);

  const rates = { USD: "3.70", EUR: "4.10" };
  const preview = previewFxRevaluation(businessId, adminId, { date: "2036-01-31", rates });
  const line = (sourceId: string) => preview.lines.find((row) => row.sourceId === sourceId)!;
  assert.equal(line(ids.invoiceB).adjustmentMinor, 5_000, "USD 500 receivable: 1,800 → 1,850");
  assert.equal(line(ids.advance).adjustmentMinor, -1_000, "USD 200 customer advance: 730 → 740 owed");
  assert.equal(line(ids.billC).adjustmentMinor, -3_000, "USD 300 payable: 1,080 → 1,110");
  assert.equal(preview.lines.some((row) => row.sourceId === ids.invoiceA), false, "settled invoices are not revalued");
  const usdBankLine = line(usdBank.id);
  // 1,460 + 200 = 1,660 USD; carrying 3,686 − 1,460 − 182.50 + 3,650 − 365 + 730 = 6,058.50 AED
  assert.equal(usdBankLine.foreignOpenMinor, 166_000);
  assert.equal(usdBankLine.carryingBaseMinor, 605_850);
  assert.equal(usdBankLine.adjustmentMinor, 614_200 - 605_850);
  assert.equal(line(eurBank.id).adjustmentMinor, 900);
  assert.equal(preview.netAdjustmentMinor, preview.lines.reduce((sum, row) => sum + row.adjustmentMinor, 0));

  setFinancialLockDate(businessId, adminId, "2036-01-31");
  assert.throws(() => postFxRevaluation(businessId, adminId, { date: "2036-01-31", rates }), /closed/);
  setFinancialLockDate(businessId, adminId, null);

  const arBefore = glBalance(settings.ar, "2036-01-31");
  const usdBankBaseBefore = glBalance(usdBank.ledgerAccountId, "2036-01-31");
  const posted = postFxRevaluation(businessId, adminId, { date: "2036-01-31", rates });
  ids.revaluation = posted.id;
  assert.equal(posted.netAdjustmentMinor, preview.netAdjustmentMinor);
  assert.throws(() => postFxRevaluation(businessId, adminId, { date: "2036-01-31", rates }), /already revalues/);

  const unrealized = sqlite.prepare("SELECT unrealized_fx_account_id AS id FROM business_accounting_settings WHERE id = 'default'").get() as { id: string };
  assert.ok(unrealized.id, "the Unrealized FX account is created on first use");
  const arAdjustment = preview.lines.filter((row) => row.accountId === settings.ar).reduce((sum, row) => sum + row.adjustmentMinor, 0);
  const apAdjustment = preview.lines.filter((row) => row.accountId === settings.ap).reduce((sum, row) => sum + row.adjustmentMinor, 0);
  assert.equal(glBalance(settings.ar, "2036-01-31") - arBefore, arAdjustment);
  assert.equal(glBalance(unrealized.id, "2036-01-31"), -preview.netAdjustmentMinor, "net gain is a credit to Unrealized FX");
  assert.equal(glBalance(usdBank.ledgerAccountId, "2036-01-31") - usdBankBaseBefore, usdBankLine.adjustmentMinor);
  assert.equal(glBalance(usdBank.ledgerAccountId, "2036-01-31"), 614_200, "bank carried at the closing rate");
  assert.equal(getBankAccount(businessId, adminId, usdBank.id)!.book_balance_minor, 166_000, "USD balance unchanged");

  // At the revaluation date GL departs from the subledger by exactly the revaluation…
  const arGapAt = glBalance(settings.ar, "2036-01-31") - arSubledger();
  assert.equal(arGapAt - (glBalance(settings.ar) - arSubledger()), arAdjustment);
  // …and once the next-day reversal is in, the control accounts tie out again.
  assert.deepEqual({ ar: arGap(), ap: apGap() }, gapsBefore);
  assert.equal(glBalance(settings.ar, "2036-02-01") - glBalance(settings.ar, "2036-01-31"), -arAdjustment);
  assert.equal(glBalance(settings.ap, "2036-02-01") - glBalance(settings.ap, "2036-01-31"), -apAdjustment);
  assert.equal(glBalance(unrealized.id), 0);

  const reversal = sqlite.prepare("SELECT date FROM journal_entries WHERE source_type = 'fx_revaluation_reversal' AND source_id = ?").get(posted.id);
  assert.deepEqual(reversal, { date: "2036-02-01" });
  const trialBalance = sqlite.prepare(`
    SELECT SUM(jl.debit_minor) AS debit, SUM(jl.credit_minor) AS credit
    FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.source_type LIKE 'fx_revaluation%' AND je.source_id = ?
  `).get(posted.id) as { debit: number; credit: number };
  assert.equal(trialBalance.debit, trialBalance.credit);
  const activity = sqlite.prepare("SELECT action FROM activity_logs WHERE entity_type = 'fx_revaluation' AND entity_id = ?").all(posted.id);
  assert.deepEqual(activity, [{ action: "posted" }]);

  // The register shows the revaluation as a base-only movement.
  const register = getBankTransactionHistory(businessId, adminId, usdBank.id);
  const revaluationRow = register.find((row) => row.source_type === "fx_revaluation")!;
  assert.equal(revaluationRow.money_in_minor + revaluationRow.money_out_minor, 0);
  assert.equal(revaluationRow.base_amount_minor, usdBankLine.adjustmentMinor);
});

test("voiding a revaluation cancels it and its reversal on their own dates", () => {
  const gainAt = (date: string) => {
    const id = (sqlite.prepare("SELECT unrealized_fx_account_id AS id FROM business_accounting_settings WHERE id = 'default'").get() as { id: string }).id;
    return glBalance(id, date);
  };
  assert.notEqual(gainAt("2036-01-31"), 0);
  voidFxRevaluation(businessId, adminId, ids.revaluation);
  assert.equal(gainAt("2036-01-31"), 0);
  assert.equal(gainAt("2036-02-01"), 0);
  assert.equal(listFxRevaluations(businessId, adminId).find((run) => run.id === ids.revaluation)?.status, "void");
  assert.throws(() => voidFxRevaluation(businessId, adminId, ids.revaluation), /Only a posted/);
  // A corrected run can then be posted for the same date.
  ids.revaluation = postFxRevaluation(businessId, adminId, { date: "2036-01-31", rates: { USD: "3.70", EUR: "4.10" } }).id;
});

test("realized FX after a revaluation equals the total economic FX of the document", () => {
  const gapsBefore = { ar: arGap(), ap: apGap() };
  const gainBefore = glBalance(settings.fx_gain);
  const lossBefore = glBalance(settings.fx_loss);
  const receipt = createReceipt(businessId, adminId, {
    ...usdRate("2036-02-10", "3.750000"),
    customerId: usdCustomer.id, date: "2036-02-10", bankAccountId: usdBank.ledgerAccountId, amount: "500.00",
    allocations: [{ invoiceId: ids.invoiceB, amount: "500.00" }],
  });
  // Booked at 3.60, settled at 3.75: 500 × 0.15 = 75.00 AED, all realized at settlement.
  assert.equal(glBalance(settings.fx_gain) - gainBefore, -7_500);
  assert.equal(lineFor(journalLines("receipt", receipt.id), settings.ar)?.credit_minor, 180_000);
  const payment = createSupplierPayment(businessId, adminId, {
    ...usdRate("2036-02-10", "3.750000"),
    supplierId: usdSupplier.id, date: "2036-02-10", bankAccountId: usdBank.ledgerAccountId, amount: "300.00",
    allocations: [{ invoiceId: ids.billC, amount: "300.00" }],
  });
  assert.equal(glBalance(settings.fx_loss) - lossBefore, 4_500, "300 × 0.15 realized loss on the payable");
  assert.equal(lineFor(journalLines("supplier_payment", payment.id), settings.ap)?.debit_minor, 108_000);
  const unrealized = (sqlite.prepare("SELECT unrealized_fx_account_id AS id FROM business_accounting_settings WHERE id = 'default'").get() as { id: string }).id;
  assert.equal(glBalance(unrealized), 0, "unrealized FX nets to zero once reversed");
  assert.deepEqual({ ar: arGap(), ap: apGap() }, gapsBefore);
  const posted = sqlite.prepare("SELECT COUNT(*) AS n FROM journal_entries je LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id GROUP BY je.id HAVING SUM(jl.debit_minor) <> SUM(jl.credit_minor)").all();
  assert.deepEqual(posted, [], "every journal balances");
});
