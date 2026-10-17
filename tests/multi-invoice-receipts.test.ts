import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-multi-receipts-")),
  BETTER_AUTH_SECRET: "multi-receipt-test-secret-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

test("Multi-Invoice Receipts, Lump-Sum Settlements & Customer Advance Credit Pool", async (t) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const { createCustomer } = await import("../src/modules/customers/customer-service");
  const { createInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
  const {
    createReceipt,
    getReceipt,
    voidReceipt,
    getCustomerUnallocatedCredit,
    applyReceiptCredit,
    listReceiptsForCustomer,
  } = await import("../src/modules/receipts/receipt-service");
  const { getTrialBalance, getAccountsReceivable } = await import("../src/modules/reports/report-service");

  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') LIMIT 1").get() as { id: string };
  const zeroTax = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1").get() ?? sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };

  assert.ok(incomeAccount, "Income account must exist");
  assert.ok(bankAccount, "Bank account must exist");
  assert.ok(zeroTax, "Tax code must exist");

  const customerId = createCustomer(businessId, userId, {
    name: "Apex Global Holdings FZ-LLC",
    email: "finance@apexholdings.ae",
    phone: "+971 4 555 1234",
  });

  let inv1Id = "";
  let inv2Id = "";
  let inv3Id = "";
  let lumpSumReceiptId = "";

  await t.test("1. Create 3 Invoices and Settle in Full via 1 Multi-Invoice Lump-Sum Receipt", () => {
    // Invoice 1: 30,000 AED
    inv1Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-09-01",
        dueDate: "2026-10-01",
        currencyCode: "AED",
        lines: [{ description: "Enterprise Consulting Month 1", quantity: "1", unitPrice: "30000", salesAccountId: incomeAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    // Invoice 2: 40,000 AED
    inv2Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-09-02",
        dueDate: "2026-10-02",
        currencyCode: "AED",
        lines: [{ description: "Enterprise Consulting Month 2", quantity: "1", unitPrice: "40000", salesAccountId: incomeAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    // Invoice 3: 30,000 AED
    inv3Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-09-03",
        dueDate: "2026-10-03",
        currencyCode: "AED",
        lines: [{ description: "Enterprise Consulting Month 3", quantity: "1", unitPrice: "30000", salesAccountId: incomeAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    // Post 1 Lump-Sum Receipt for 100,000 AED settling all 3 invoices
    const receiptResult = createReceipt(businessId, userId, {
      customerId,
      bankAccountId: bankAccount.id,
      date: "2026-09-05",
      amount: "100000.00",
      currencyCode: "AED",
      reference: "WIRE-APEX-100K",
      description: "Lump-sum wire transfer settling Q3 consulting fees",
      allocations: [
        { invoiceId: inv1Id, amount: "30000.00" },
        { invoiceId: inv2Id, amount: "40000.00" },
        { invoiceId: inv3Id, amount: "30000.00" },
      ],
    });

    lumpSumReceiptId = receiptResult.id;
    assert.ok(lumpSumReceiptId, "Receipt ID must be returned");

    // Verify all 3 invoices have 0 balance
    const inv1 = getInvoice(businessId, userId, inv1Id);
    const inv2 = getInvoice(businessId, userId, inv2Id);
    const inv3 = getInvoice(businessId, userId, inv3Id);

    assert.equal(inv1?.balanceMinor, 0, "Invoice 1 must be fully settled (0 balance)");
    assert.equal(inv2?.balanceMinor, 0, "Invoice 2 must be fully settled (0 balance)");
    assert.equal(inv3?.balanceMinor, 0, "Invoice 3 must be fully settled (0 balance)");

    // Verify receipt allocations detail
    const receiptRecord = getReceipt(businessId, userId, lumpSumReceiptId);
    assert.ok(receiptRecord);
    assert.equal(receiptRecord.allocations.length, 3, "Receipt must contain exactly 3 allocation rows");
    assert.equal(receiptRecord.receipt.total_allocated_minor, 10000000, "Allocated total must be 100,000 AED");
    assert.equal(receiptRecord.receipt.unallocated_amount_minor, 0, "No unallocated surplus");

    // Accounts receivable report check: 0 open rows for this customer
    const ar = getAccountsReceivable(businessId, userId);
    const openCustomerRows = ar.filter((r) => r.customer_id === customerId);
    assert.equal(openCustomerRows.length, 0, "No open receivables should remain for customer");

    // General Ledger equilibrium check
    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance (DR == CR)");
  });

  let partialReceiptId = "";
  let inv4Id = "";

  await t.test("2. Partial Invoice Settlement with Advance Deposit Surplus", () => {
    // Invoice 4: 25,000 AED
    inv4Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-09-10",
        dueDate: "2026-10-10",
        currencyCode: "AED",
        lines: [{ description: "System Optimization Phase 1", quantity: "1", unitPrice: "25000", salesAccountId: incomeAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    // Customer wires 40,000 AED: 25,000 pays Invoice 4, 15,000 is advance deposit surplus
    const result = createReceipt(businessId, userId, {
      customerId,
      bankAccountId: bankAccount.id,
      date: "2026-09-12",
      amount: "40000.00",
      currencyCode: "AED",
      reference: "WIRE-APEX-40K",
      description: "Invoice 4 + advance retainer deposit",
      allocations: [{ invoiceId: inv4Id, amount: "25000.00" }],
    });

    partialReceiptId = result.id;
    assert.equal(result.unallocatedMinor, 1500000, "Unallocated surplus must be 15,000 AED (1,500,000 minor)");

    const inv4 = getInvoice(businessId, userId, inv4Id);
    assert.equal(inv4?.balanceMinor, 0, "Invoice 4 must be fully settled");

    const receipt = getReceipt(businessId, userId, partialReceiptId);
    assert.ok(receipt);
    assert.equal(receipt.allocations.length, 1);
    assert.equal(receipt.receipt.amount_minor, 4000000);
    assert.equal(receipt.receipt.total_allocated_minor, 2500000);
    assert.equal(receipt.receipt.unallocated_amount_minor, 1500000);

    // Check customer unallocated credit discovery
    const unallocated = getCustomerUnallocatedCredit(businessId, userId, customerId);
    assert.equal(unallocated.length, 1);
    assert.equal(unallocated[0]?.receiptId, partialReceiptId);
    assert.equal(unallocated[0]?.unallocatedAmountMinor, 1500000);

    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance (DR == CR)");
  });

  let pureAdvanceReceiptId = "";

  await t.test("3. Pure Customer Advance Retainer Deposit (Zero Invoices)", () => {
    const customerBId = createCustomer(businessId, userId, {
      name: "Falcon Ventures Limited",
      email: "accounts@falcon.ae",
    });

    // Customer B pays 50,000 AED advance retainer before any invoice is created
    const result = createReceipt(businessId, userId, {
      customerId: customerBId,
      bankAccountId: bankAccount.id,
      date: "2026-09-15",
      amount: "50000.00",
      currencyCode: "AED",
      reference: "ADV-RETAINER-50K",
      description: "Project retainer deposit on account",
      allocations: [],
    });

    pureAdvanceReceiptId = result.id;
    assert.equal(result.unallocatedMinor, 5000000, "Entire 50,000 AED must be unallocated");

    const receipt = getReceipt(businessId, userId, pureAdvanceReceiptId);
    assert.ok(receipt);
    assert.equal(receipt.allocations.length, 0, "0 invoice allocations for pure advance");
    assert.equal(receipt.receipt.unallocated_amount_minor, 5000000);

    // Customer receipts list includes the advance deposit
    const custReceipts = listReceiptsForCustomer(businessId, userId, customerBId);
    assert.equal(custReceipts.length, 1);
    assert.equal(custReceipts[0]?.invoice_number, "Unallocated Advance");

    const unallocatedB = getCustomerUnallocatedCredit(businessId, userId, customerBId);
    assert.equal(unallocatedB.length, 1);
    assert.equal(unallocatedB[0]?.unallocatedAmountMinor, 5000000);

    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance (DR == CR)");
  });

  await t.test("4. 1-Click Application of Available Advance Credit to Subsequent Invoice", () => {
    // Invoice 5: 10,000 AED for Customer A (who holds 15,000 AED in advance credit from Receipt 2)
    const inv5Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-09-20",
        dueDate: "2026-10-20",
        currencyCode: "AED",
        lines: [{ description: "System Optimization Phase 2", quantity: "1", unitPrice: "10000", salesAccountId: incomeAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    const inv5Before = getInvoice(businessId, userId, inv5Id);
    assert.equal(inv5Before?.balanceMinor, 1000000, "Invoice 5 open balance is 10,000 AED");

    // Apply 10,000 AED credit from partialReceiptId
    const applyResult = applyReceiptCredit(businessId, userId, {
      receiptId: partialReceiptId,
      invoiceId: inv5Id,
      amount: "10000.00",
    });

    assert.equal(applyResult.ok, true);

    // Verify Invoice 5 is now fully settled!
    const inv5After = getInvoice(businessId, userId, inv5Id);
    assert.equal(inv5After?.balanceMinor, 0, "Invoice 5 must be fully settled via applied credit");

    // Verify receipt unallocated amount is reduced to 5,000 AED
    const receiptAfter = getReceipt(businessId, userId, partialReceiptId);
    assert.equal(receiptAfter?.receipt.total_allocated_minor, 3500000, "Total allocated is now 35,000 AED (25k + 10k)");
    assert.equal(receiptAfter?.receipt.unallocated_amount_minor, 500000, "Remaining unallocated is 5,000 AED");

    // Customer unallocated credit now reports 5,000 AED remaining
    const unallocated = getCustomerUnallocatedCredit(businessId, userId, customerId);
    assert.equal(unallocated.length, 1);
    assert.equal(unallocated[0]?.unallocatedAmountMinor, 500000);

    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance (DR == CR)");
  });

  await t.test("5. Reversal / Voiding of a Multi-Invoice Receipt Atomically Restores All Invoices", () => {
    // Void the 100,000 AED lump-sum receipt
    voidReceipt(businessId, userId, lumpSumReceiptId);

    const receipt = getReceipt(businessId, userId, lumpSumReceiptId);
    assert.equal(receipt?.receipt.document_status, "void");

    // Invoices 1, 2, and 3 must have their balances fully restored!
    const inv1 = getInvoice(businessId, userId, inv1Id);
    const inv2 = getInvoice(businessId, userId, inv2Id);
    const inv3 = getInvoice(businessId, userId, inv3Id);

    assert.equal(inv1?.balanceMinor, 3000000, "Invoice 1 balance restored to 30,000 AED");
    assert.equal(inv2?.balanceMinor, 4000000, "Invoice 2 balance restored to 40,000 AED");
    assert.equal(inv3?.balanceMinor, 3000000, "Invoice 3 balance restored to 30,000 AED");

    // Accounts receivable report now reflects the restored open amounts
    const ar = getAccountsReceivable(businessId, userId);
    const openCustomerRows = ar.filter((r) => r.customer_id === customerId && [inv1Id, inv2Id, inv3Id].includes(r.document_id));
    assert.equal(openCustomerRows.length, 3, "All 3 invoices restored in AR aging");

    // General Ledger equilibrium check after reversal
    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must remain in balance after reversal");
  });
});
