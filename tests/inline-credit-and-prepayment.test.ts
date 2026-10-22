import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-inline-credit-")),
  BETTER_AUTH_SECRET: "inline-credit-test-secret-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

test("Inline Customer Credit & Supplier Prepayment Drawdown on Document Creation", async (t) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const { createCustomer } = await import("../src/modules/customers/customer-service");
  const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
  const { createInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
  const { savePurchaseInvoice, getPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
  const { createReceipt, getCustomerUnallocatedCredit, getAllCustomersUnallocatedCredit } = await import("../src/modules/receipts/receipt-service");
  const { createSupplierPayment, getSupplierUnallocatedCredit, getAllSuppliersUnallocatedPrepayments } = await import("../src/modules/supplier-payments/supplier-payment-service");
  const { getTrialBalance } = await import("../src/modules/reports/report-service");

  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') LIMIT 1").get() as { id: string };
  const zeroTax = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1").get() ?? sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };

  assert.ok(incomeAccount, "Income account must exist");
  assert.ok(expenseAccount, "Expense account must exist");
  assert.ok(bankAccount, "Bank account must exist");
  assert.ok(zeroTax, "Tax code must exist");

  const customerId = createCustomer(businessId, userId, {
    name: "Crescent Gulf Ventures",
    email: "billing@crescentgulf.ae",
    phone: "+971 4 333 4455",
  });

  const supplierId = createSupplier(businessId, userId, {
    name: "Emirates Cloud Infrastructure LLC",
    email: "accounts@emiratescloud.ae",
    phone: "+971 4 444 7788",
  });

  await t.test("1. Customer Advance Deposit & Inline Credit Drawdown on New Invoice", () => {
    // 1. Customer deposits 1,000 AED advance retainer
    const receiptResult = createReceipt(businessId, userId, {
      customerId,
      bankAccountId: bankAccount.id,
      date: "2026-10-01",
      amount: "1000.00",
      reference: "ADV-DEP-1001",
      description: "Advance retainer deposit",
      allocations: [],
    });

    assert.ok(receiptResult.id);
    assert.equal(receiptResult.unallocatedMinor, 100000);

    // Verify unallocated credit queries
    const customerCredits = getCustomerUnallocatedCredit(businessId, userId, customerId);
    assert.equal(customerCredits.length, 1);
    assert.equal(customerCredits[0].unallocatedAmountMinor, 100000);

    const allCredits = getAllCustomersUnallocatedCredit(businessId, userId);
    assert.ok(allCredits[customerId]);
    assert.equal(allCredits[customerId][0].unallocatedAmountMinor, 100000);

    // 2. Create and post a new Sales Invoice for 600.00 AED with applyAvailableCredit = true
    const inv1Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-05",
        dueDate: "2026-10-20",
        reference: "INV-INLINE-01",
        applyAvailableCredit: true,
        lines: [
          {
            description: "Consulting Retainer Services",
            quantity: "1",
            unitPrice: "600.00",
            salesAccountId: incomeAccount.id,
            taxCodeId: zeroTax.id,
            discountType: "none",
            discountValue: "0",
          },
        ],
      },
      "post"
    );

    const inv1 = getInvoice(businessId, userId, inv1Id);
    assert.ok(inv1);
    assert.equal(inv1.invoice.documentStatus, "posted");
    assert.equal(inv1.invoice.totalMinor, 60000);
    assert.equal(inv1.paymentStatus, "paid", "Invoice should be immediately paid via advance credit");
    assert.equal(inv1.balanceMinor, 0, "Invoice balance should be 0");
    assert.equal(inv1.receipts.length, 1, "Should have 1 receipt allocation");
    assert.equal(inv1.receipts[0].allocatedMinor, 60000);

    // Verify remaining customer credit is 400.00 AED
    const remainingCredits = getCustomerUnallocatedCredit(businessId, userId, customerId);
    assert.equal(remainingCredits.length, 1);
    assert.equal(remainingCredits[0].unallocatedAmountMinor, 40000);

    // 3. Create another invoice for 500.00 AED with applyAvailableCredit = true
    // It should exhaust the remaining 400.00 AED credit and leave 100.00 AED balance (partially_paid)
    const inv2Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-06",
        dueDate: "2028-10-21",
        reference: "INV-INLINE-02",
        applyAvailableCredit: true,
        lines: [
          {
            description: "Additional Advisory Work",
            quantity: "1",
            unitPrice: "500.00",
            salesAccountId: incomeAccount.id,
            taxCodeId: zeroTax.id,
            discountType: "none",
            discountValue: "0",
          },
        ],
      },
      "post"
    );

    const inv2 = getInvoice(businessId, userId, inv2Id);
    assert.ok(inv2);
    assert.equal(inv2.paymentStatus, "partially_paid");
    assert.equal(inv2.balanceMinor, 10000, "100.00 AED balance remaining");
    assert.equal(inv2.receipts[0].allocatedMinor, 40000);

    // Customer credit should now be completely exhausted (0)
    const finalCredits = getCustomerUnallocatedCredit(businessId, userId, customerId);
    assert.equal(finalCredits.length, 0);
  });

  await t.test("2. Supplier Prepayment & Inline Prepayment Drawdown on New Bill", () => {
    // 1. Record an advance supplier payment of 1,500.00 AED
    const paymentResult = createSupplierPayment(businessId, userId, {
      supplierId,
      bankAccountId: bankAccount.id,
      date: "2026-10-01",
      amount: "1500.00",
      reference: "PREPAY-VENDOR-01",
      description: "Cloud hosting advance deposit",
      allocations: [],
    });

    assert.ok(paymentResult.id);
    assert.equal(paymentResult.unallocatedMinor, 150000);

    // Verify unallocated prepayment queries
    const supplierPrepayments = getSupplierUnallocatedCredit(businessId, userId, supplierId);
    assert.equal(supplierPrepayments.length, 1);
    assert.equal(supplierPrepayments[0].unallocatedAmountMinor, 150000);

    const allPrepayments = getAllSuppliersUnallocatedPrepayments(businessId, userId);
    assert.ok(allPrepayments[supplierId]);
    assert.equal(allPrepayments[supplierId][0].unallocatedAmountMinor, 150000);

    // 2. Post a new Purchase Invoice for 850.00 AED with applyAvailablePrepayment = true
    const bill1Id = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "EC-INV-8891",
        invoiceDate: "2026-10-07",
        dueDate: "2026-10-22",
        reference: "PO-CLOUD-01",
        applyAvailablePrepayment: true,
        lines: [
          {
            description: "Server Hosting Services",
            quantity: "1",
            unitPrice: "850.00",
            expenseAccountId: expenseAccount.id,
            taxCodeId: zeroTax.id,
            discountType: "none",
            discountValue: "0",
          },
        ],
      },
      "post"
    );

    const bill1 = getPurchaseInvoice(businessId, userId, bill1Id);
    assert.ok(bill1);
    assert.equal(bill1.invoice.documentStatus, "posted");
    assert.equal(bill1.invoice.totalMinor, 85000);
    assert.equal(bill1.paymentStatus, "paid", "Bill should be fully paid via prepayment drawdown");
    assert.equal(bill1.paidMinor, 85000);
    assert.equal(bill1.payments.length, 1);
    assert.equal(bill1.payments[0].allocatedMinor, 85000);

    // Verify remaining vendor prepayment is 650.00 AED
    const remainingPrepayments = getSupplierUnallocatedCredit(businessId, userId, supplierId);
    assert.equal(remainingPrepayments.length, 1);
    assert.equal(remainingPrepayments[0].unallocatedAmountMinor, 65000);
  });

  await t.test("3. Accounting Ledger Equilibrium & Trial Balance Symmetry", () => {
    const trialBalance = getTrialBalance(businessId, userId, "2026-10-31");
    assert.equal(
      trialBalance.debitMinor,
      trialBalance.creditMinor,
      "Trial balance debits must exactly equal credits"
    );
  });
});
