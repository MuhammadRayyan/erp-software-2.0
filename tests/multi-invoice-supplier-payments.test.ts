import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-multi-payments-")),
  BETTER_AUTH_SECRET: "multi-payment-test-secret-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

test("Multi-Invoice Supplier Payments, Lump-Sum Settlements & Vendor Prepayment Pool", async (t) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
  const { savePurchaseInvoice, getPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
  const {
    createSupplierPayment,
    getSupplierPayment,
    voidSupplierPayment,
    getSupplierUnallocatedCredit,
    applySupplierPaymentCredit,
    listSupplierPayments,
  } = await import("../src/modules/supplier-payments/supplier-payment-service");
  const { getTrialBalance, getAccountsPayable } = await import("../src/modules/reports/report-service");

  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') LIMIT 1").get() as { id: string };
  const zeroTax = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1").get() ?? sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };

  assert.ok(expenseAccount, "Expense account must exist");
  assert.ok(bankAccount, "Bank account must exist");
  assert.ok(zeroTax, "Tax code must exist");

  const supplierId = createSupplier(businessId, userId, {
    name: "Al Futtaim Engineering & Logistics LLC",
    email: "billing@alfuttaim.ae",
    phone: "+971 4 888 5678",
  });

  let bill1Id = "";
  let bill2Id = "";
  let bill3Id = "";
  let lumpSumPaymentId = "";

  await t.test("1. Create 3 Purchase Invoices and Settle in Full via 1 Multi-Invoice Lump-Sum Payment", () => {
    // Bill 1: 30,000 AED
    bill1Id = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "ALF-INV-001",
        invoiceDate: "2026-09-01",
        dueDate: "2026-10-01",
        currencyCode: "AED",
        lines: [{ description: "Heavy Machinery Lease M1", quantity: "1", unitPrice: "30000", expenseAccountId: expenseAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    // Bill 2: 40,000 AED
    bill2Id = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "ALF-INV-002",
        invoiceDate: "2026-09-02",
        dueDate: "2026-10-02",
        currencyCode: "AED",
        lines: [{ description: "Heavy Machinery Lease M2", quantity: "1", unitPrice: "40000", expenseAccountId: expenseAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    // Bill 3: 30,000 AED
    bill3Id = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "ALF-INV-003",
        invoiceDate: "2026-09-03",
        dueDate: "2026-10-03",
        currencyCode: "AED",
        lines: [{ description: "Heavy Machinery Lease M3", quantity: "1", unitPrice: "30000", expenseAccountId: expenseAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    // Post 1 Lump-Sum Supplier Payment for 100,000 AED settling all 3 bills
    const paymentResult = createSupplierPayment(businessId, userId, {
      supplierId,
      bankAccountId: bankAccount.id,
      date: "2026-09-05",
      amount: "100000.00",
      currencyCode: "AED",
      reference: "WIRE-OUT-ALFUTTAIM-100K",
      description: "Lump-sum wire settlement for Q3 plant lease",
      allocations: [
        { invoiceId: bill1Id, amount: "30000.00" },
        { invoiceId: bill2Id, amount: "40000.00" },
        { invoiceId: bill3Id, amount: "30000.00" },
      ],
    });

    lumpSumPaymentId = paymentResult.id;
    assert.ok(lumpSumPaymentId, "Payment ID must be returned");

    // Verify all 3 bills have 0 balance
    const bill1 = getPurchaseInvoice(businessId, userId, bill1Id);
    const bill2 = getPurchaseInvoice(businessId, userId, bill2Id);
    const bill3 = getPurchaseInvoice(businessId, userId, bill3Id);

    assert.equal(bill1?.balanceMinor, 0, "Bill 1 must be fully settled (0 balance)");
    assert.equal(bill2?.balanceMinor, 0, "Bill 2 must be fully settled (0 balance)");
    assert.equal(bill3?.balanceMinor, 0, "Bill 3 must be fully settled (0 balance)");

    // Verify payment allocations detail
    const paymentRecord = getSupplierPayment(businessId, userId, lumpSumPaymentId);
    assert.ok(paymentRecord);
    assert.equal(paymentRecord.allocations.length, 3, "Payment must contain exactly 3 allocation rows");
    assert.equal(paymentRecord.payment.total_allocated_minor, 10000000, "Allocated total must be 100,000 AED");
    assert.equal(paymentRecord.payment.unallocated_amount_minor, 0, "No unallocated surplus");

    // Accounts payable report check: 0 open rows for this supplier
    const ap = getAccountsPayable(businessId, userId);
    const openSupplierRows = ap.filter((r) => r.supplier_id === supplierId);
    assert.equal(openSupplierRows.length, 0, "No open payables should remain for supplier");

    // General Ledger equilibrium check
    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance (DR == CR)");
  });

  let partialPaymentId = "";
  let bill4Id = "";

  await t.test("2. Partial Bill Settlement with Vendor Prepayment Deposit Surplus", () => {
    // Bill 4: 25,000 AED
    bill4Id = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "ALF-INV-004",
        invoiceDate: "2026-09-10",
        dueDate: "2026-10-10",
        currencyCode: "AED",
        lines: [{ description: "Warehouse Spares Initial Order", quantity: "1", unitPrice: "25000", expenseAccountId: expenseAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    // Business wires 40,000 AED: 25,000 pays Bill 4, 15,000 is vendor prepayment deposit surplus
    const result = createSupplierPayment(businessId, userId, {
      supplierId,
      bankAccountId: bankAccount.id,
      date: "2026-09-12",
      amount: "40000.00",
      currencyCode: "AED",
      reference: "WIRE-OUT-ALFUTTAIM-40K",
      description: "Bill 4 + vendor prepayment deposit on account",
      allocations: [{ invoiceId: bill4Id, amount: "25000.00" }],
    });

    partialPaymentId = result.id;
    assert.equal(result.unallocatedMinor, 1500000, "Unallocated surplus must be 15,000 AED (1,500,000 minor)");

    const bill4 = getPurchaseInvoice(businessId, userId, bill4Id);
    assert.equal(bill4?.balanceMinor, 0, "Bill 4 must be fully settled");

    const payment = getSupplierPayment(businessId, userId, partialPaymentId);
    assert.ok(payment);
    assert.equal(payment.allocations.length, 1);
    assert.equal(payment.payment.amount_minor, 4000000);
    assert.equal(payment.payment.total_allocated_minor, 2500000);
    assert.equal(payment.payment.unallocated_amount_minor, 1500000);

    // Check supplier unallocated prepayment credit discovery
    const unallocated = getSupplierUnallocatedCredit(businessId, userId, supplierId);
    assert.equal(unallocated.length, 1);
    assert.equal(unallocated[0]?.paymentId, partialPaymentId);
    assert.equal(unallocated[0]?.unallocatedAmountMinor, 1500000);

    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance (DR == CR)");
  });

  let purePrepaymentId = "";

  await t.test("3. Pure Vendor Prepayment Deposit (Zero Purchase Invoices)", () => {
    const supplierBId = createSupplier(businessId, userId, {
      name: "Global Steel & Alloys FZE",
      email: "finance@globalsteel.ae",
    });

    // Pay 50,000 AED advance retainer/prepayment before any bill is created
    const result = createSupplierPayment(businessId, userId, {
      supplierId: supplierBId,
      bankAccountId: bankAccount.id,
      date: "2026-09-15",
      amount: "50000.00",
      currencyCode: "AED",
      reference: "ADV-STEEL-PREPAY-50K",
      description: "Raw material procurement prepayment on account",
      allocations: [],
    });

    purePrepaymentId = result.id;
    assert.equal(result.unallocatedMinor, 5000000, "Entire 50,000 AED must be unallocated");

    const payment = getSupplierPayment(businessId, userId, purePrepaymentId);
    assert.ok(payment);
    assert.equal(payment.allocations.length, 0, "0 bill allocations for pure prepayment");
    assert.equal(payment.payment.unallocated_amount_minor, 5000000);

    // Supplier payments list includes the advance deposit
    const suppPayments = listSupplierPayments(businessId, userId, supplierBId);
    assert.equal(suppPayments.length, 1);
    assert.equal(suppPayments[0]?.internal_number, "Unallocated Prepayment");

    const unallocatedB = getSupplierUnallocatedCredit(businessId, userId, supplierBId);
    assert.equal(unallocatedB.length, 1);
    assert.equal(unallocatedB[0]?.unallocatedAmountMinor, 5000000);

    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance (DR == CR)");
  });

  await t.test("4. 1-Click Application of Available Prepayment Credit to Subsequent Bill", () => {
    // Bill 5: 10,000 AED for Supplier A (who holds 15,000 AED in prepayment credit from Payment 2)
    const bill5Id = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "ALF-INV-005",
        invoiceDate: "2026-09-20",
        dueDate: "2026-10-20",
        currencyCode: "AED",
        lines: [{ description: "Warehouse Spares Restock", quantity: "1", unitPrice: "10000", expenseAccountId: expenseAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    const bill5Before = getPurchaseInvoice(businessId, userId, bill5Id);
    assert.equal(bill5Before?.balanceMinor, 1000000, "Bill 5 open balance is 10,000 AED");

    // Apply 10,000 AED credit from partialPaymentId
    const applyResult = applySupplierPaymentCredit(businessId, userId, {
      paymentId: partialPaymentId,
      invoiceId: bill5Id,
      amount: "10000.00",
    });

    assert.equal(applyResult.ok, true);

    // Verify Bill 5 is now fully settled!
    const bill5After = getPurchaseInvoice(businessId, userId, bill5Id);
    assert.equal(bill5After?.balanceMinor, 0, "Bill 5 must be fully settled via applied prepayment");

    // Verify payment unallocated amount is reduced to 5,000 AED
    const paymentAfter = getSupplierPayment(businessId, userId, partialPaymentId);
    assert.equal(paymentAfter?.payment.total_allocated_minor, 3500000, "Total allocated is now 35,000 AED (25k + 10k)");
    assert.equal(paymentAfter?.payment.unallocated_amount_minor, 500000, "Remaining unallocated is 5,000 AED");

    // Supplier unallocated credit now reports 5,000 AED remaining
    const unallocated = getSupplierUnallocatedCredit(businessId, userId, supplierId);
    assert.equal(unallocated.length, 1);
    assert.equal(unallocated[0]?.unallocatedAmountMinor, 500000);

    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance (DR == CR)");
  });

  await t.test("5. Reversal / Voiding of a Multi-Invoice Supplier Payment Atomically Restores All Bills", () => {
    // Void the 100,000 AED lump-sum payment
    voidSupplierPayment(businessId, userId, lumpSumPaymentId);

    // Verify payment status is void
    const paymentVoided = getSupplierPayment(businessId, userId, lumpSumPaymentId);
    assert.equal(paymentVoided?.payment.document_status, "void");

    // Verify all 3 bills are restored to their original open balances
    const bill1Restored = getPurchaseInvoice(businessId, userId, bill1Id);
    const bill2Restored = getPurchaseInvoice(businessId, userId, bill2Id);
    const bill3Restored = getPurchaseInvoice(businessId, userId, bill3Id);

    assert.equal(bill1Restored?.balanceMinor, 3000000, "Bill 1 balance restored to 30,000 AED");
    assert.equal(bill2Restored?.balanceMinor, 4000000, "Bill 2 balance restored to 40,000 AED");
    assert.equal(bill3Restored?.balanceMinor, 3000000, "Bill 3 balance restored to 30,000 AED");

    // General Ledger equilibrium check after reversal
    const tb = getTrialBalance(businessId, userId, "2026-12-31");
    assert.equal(tb.debitMinor, tb.creditMinor, "General Ledger must balance after payment reversal (DR == CR)");
  });
});
