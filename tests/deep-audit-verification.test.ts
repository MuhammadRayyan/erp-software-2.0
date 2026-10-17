import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-deep-audit-")),
  BETTER_AUTH_SECRET: "deep-audit-verification-secret-test-key",
  NODE_ENV: "test",
});

const { getBusinessDb } = await import("../src/core/db/business");
const { seedDemoData } = await import("../src/core/db/seed");
const { createBusiness } = await import("../src/core/businesses/business-service");
const {
  splitTaxInclusive,
  calculateDiscount,
} = await import("../src/modules/accounting/calculations/money");
const { proportionalCarryingRelease } = await import("../src/modules/currency/conversion");
const { allocateNumber } = await import("../src/modules/accounting/services/numbering-service");

test("Deep Audit Verification: Core Math, Allocations, Invariants & Security", async (suite) => {
  const seed = await seedDemoData();
  const userId = seed.admin.id;
  const isolated = createBusiness(
    { name: "Deep Audit Test Business", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 1 },
    userId,
  );
  const businessId = isolated.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  await suite.test("1. Accounting Math: Tax Inclusivity Splitting & Zero-Sum Equilibrium", () => {
    // Standard 5% UAE VAT: 105.00 gross -> 100.00 net, 5.00 tax
    const standard = splitTaxInclusive(10500, 500);
    assert.equal(standard.netMinor, 10000);
    assert.equal(standard.taxMinor, 500);
    assert.equal(standard.netMinor + standard.taxMinor, 10500);

    // Odd gross amounts with rounding: 10.00 gross at 5% VAT
    const odd = splitTaxInclusive(1000, 500);
    assert.equal(odd.netMinor + odd.taxMinor, 1000);

    // Extreme case: 1 minor unit gross at 5% VAT
    const tiny = splitTaxInclusive(1, 500);
    assert.equal(tiny.netMinor + tiny.taxMinor, 1);

    // Zero gross
    const zero = splitTaxInclusive(0, 500);
    assert.equal(zero.netMinor, 0);
    assert.equal(zero.taxMinor, 0);

    // 0% VAT
    const zeroVat = splitTaxInclusive(15000, 0);
    assert.equal(zeroVat.netMinor, 15000);
    assert.equal(zeroVat.taxMinor, 0);
  });

  await suite.test("2. Discount Math: Percentage and Fixed Amount Precision", () => {
    // 15% discount on 10,000 minor
    const pct15 = calculateDiscount(10000, "percentage", "15", 2);
    assert.equal(pct15, 1500);

    // 100% discount
    const pct100 = calculateDiscount(10000, "percentage", "100", 2);
    assert.equal(pct100, 10000);

    // Fixed discount cannot exceed line amount
    const capped = calculateDiscount(5000, "fixed", "80.00", 2);
    assert.equal(capped, 5000);

    // Fractional percentage discount: 12.5% on 2,500 minor
    const pctFraction = calculateDiscount(2500, "percentage", "12.5", 2);
    assert.equal(pctFraction, 313);
  });

  await suite.test("3. Multi-Currency Math: Proportional Carrying Release & Residual Cleared", () => {
    // Foreign invoice: 1,000 USD at 3.6725 rate = 3,673 AED carrying amount
    const foreignTotal = 100000;
    const baseCarrying = 367250;

    // Partial payment 1: 400 USD
    const release1 = proportionalCarryingRelease(40000, foreignTotal, baseCarrying);
    assert.equal(release1, 146900); // 400 * 3.6725 = 1469.00

    // Partial payment 2: 600 USD (final payment should release exact remaining)
    const remainingForeign = foreignTotal - 40000;
    const remainingCarrying = baseCarrying - release1;
    const release2 = proportionalCarryingRelease(remainingForeign, remainingForeign, remainingCarrying);
    assert.equal(release2, remainingCarrying);
    assert.equal(release1 + release2, baseCarrying);
  });

  await suite.test("4. Numbering Sequences: Concurrency Lock & Gapless Uniqueness", () => {
    const num1 = allocateNumber(sqlite, "invoice");
    const num2 = allocateNumber(sqlite, "invoice");
    const num3 = allocateNumber(sqlite, "invoice");

    assert.ok(num1);
    assert.ok(num2);
    assert.ok(num3);
    assert.notEqual(num1, num2);
    assert.notEqual(num2, num3);
  });

  await suite.test("5. Multi-Tenant Database Isolation Security", () => {
    // Unauthorized user accessing this business must throw BUSINESS_ACCESS_DENIED
    const rogueUserId = "unauthorized-user-" + Date.now();
    assert.throws(
      () => getBusinessDb(businessId, rogueUserId),
      (err: any) => err.message === "BUSINESS_ACCESS_DENIED"
    );
  });

  await suite.test("6. Full Commercial Sales Pipeline & Ledger Equilibrium", async () => {
    const { createCustomer } = await import("../src/modules/customers/customer-service");
    const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
    const { saveSalesQuote, createSalesQuoteRevision } = await import("../src/modules/sales-quotes/quote-service");
    const { saveSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
    const { createInvoice, getInvoice, voidInvoice } = await import("../src/modules/sales-invoices/invoice-service");
    const { saveDeliveryNote } = await import("../src/modules/inventory/delivery-note-service");
    const { saveInventoryItem } = await import("../src/modules/inventory/inventory-item-service");
    const { saveInventoryLocation } = await import("../src/modules/inventory/inventory-location-service");
    const { saveGoodsReceipt } = await import("../src/modules/inventory/goods-receipt-service");
    const { createReceipt } = await import("../src/modules/receipts/receipt-service");
    const { getTrialBalance } = await import("../src/modules/reports/report-service");

    const customerId = createCustomer(businessId, userId, {
      name: "Global Tech Enterprise",
      email: "finance@globaltech.com",
    });
    const supplierId = createSupplier(businessId, userId, {
      name: "Hardware Vendor LLC",
      email: "orders@hardwarevendor.ae",
    });

    const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
    const assetAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'asset' LIMIT 1").get() as { id: string };
    const cogsAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
    const bankLedgerAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype = 'bank' LIMIT 1").get() as { id: string };
    const { saveBankAccount } = await import("../src/modules/banking/bank-account-service");
    saveBankAccount(businessId, userId, {
      name: "Emirates NBD Corporate",
      currencyCode: "AED",
      ledgerAccountId: bankLedgerAccount.id,
      isCashAccount: false,
    });
    const tax5 = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get() ??
      sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };

    // Setup inventory item and initial stock via goods receipt
    const locId = saveInventoryLocation(businessId, userId, { name: "Main Hub", code: "HUB-1" });
    const itemId = saveInventoryItem(businessId, userId, {
      name: "Enterprise Server Node",
      sku: "SRV-NODE-01",
      unitName: "unit",
      salesAccountId: incomeAccount.id,
      inventoryAssetAccountId: assetAccount.id,
      costOfSalesAccountId: cogsAccount.id,
      purchasePrice: "1000.00",
      salesPrice: "2500.00",
    });

    saveGoodsReceipt(businessId, userId, {
      supplierId,
      locationId: locId,
      date: "2026-10-01",
      reference: "INITIAL-STOCK",
      lines: [
        {
          itemId,
          description: "Initial Stock Inflow",
          quantity: "10",
          unitCost: "1000.00",
          projectId: "",
          purchaseOrderLineId: "",
          purchaseInvoiceLineId: "",
        },
      ],
    }, "post");

    // 1. Sales Quote (Rev 0)
    const quoteId = saveSalesQuote(businessId, userId, {
      customerId,
      date: "2026-10-05",
      expectedDate: "2026-10-25",
      reference: "RFQ-2026-001",
      amountsIncludeTax: false,
      lines: [
        {
          itemId,
          description: "Enterprise Server Node",
          quantity: "2",
          unitPrice: "2500.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: tax5.id,
          discountType: "none",
          discountValue: "0",
          projectId: "",
        },
      ],
    }, "issue");
    assert.ok(quoteId);

    // 2. Quote Revision (Rev 1 with 10% discount)
    const rev1Id = createSalesQuoteRevision(businessId, userId, quoteId);
    saveSalesQuote(businessId, userId, {
      customerId,
      date: "2026-10-06",
      expectedDate: "2026-10-25",
      reference: "RFQ-2026-001-REV1",
      amountsIncludeTax: false,
      lines: [
        {
          itemId,
          description: "Enterprise Server Node (Discounted)",
          quantity: "2",
          unitPrice: "2500.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: tax5.id,
          discountType: "percentage",
          discountValue: "10",
          projectId: "",
        },
      ],
    }, "issue", rev1Id);

    // 3. Convert Accepted Quote to Sales Order
    const orderId = saveSalesOrder(businessId, userId, {
      customerId,
      salesQuoteId: rev1Id,
      date: "2026-10-07",
      expectedDate: "2026-10-20",
      reference: "PO-FROM-CLIENT-101",
      amountsIncludeTax: false,
      lines: [
        {
          itemId,
          description: "Enterprise Server Node",
          quantity: "2",
          unitPrice: "2500.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: tax5.id,
          discountType: "percentage",
          discountValue: "10",
          projectId: "",
        },
      ],
    }, "issue");
    assert.ok(orderId);

    // 4. Convert Sales Order to Posted Sales Invoice
    // 2 * 2500 = 5000; 10% discount = 500; Net = 4500; Tax 5% = 225; Total = 4725
    const invoiceId = createInvoice(businessId, userId, {
      customerId,
      salesOrderId: orderId,
      invoiceDate: "2026-10-08",
      taxDate: "2026-10-08",
      dueDate: "2026-11-08",
      reference: "INV-REF-01",
      amountsIncludeTax: false,
      lines: [
        {
          itemId,
          description: "Enterprise Server Node",
          quantity: "2",
          unitPrice: "2500.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: tax5.id,
          discountType: "percentage",
          discountValue: "10",
          projectId: "",
        },
      ],
    }, "post");

    const inv = getInvoice(businessId, userId, invoiceId);
    assert.ok(inv);
    assert.equal(inv.invoice.totalMinor, 472500);
    assert.equal(inv.invoice.taxMinor, 22500);
    assert.equal(inv.invoice.subtotalMinor, 450000);
    assert.equal(inv.invoice.documentStatus, "posted");

    // Double-Entry Balance Verification:
    let tb = getTrialBalance(businessId, userId);
    assert.equal(tb.debitMinor, tb.creditMinor, "Trial balance must remain in strict equilibrium after invoice");

    // 5. Post Delivery Note linked to the Sales Invoice
    const invLine = inv.lines[0];
    const deliveryId = saveDeliveryNote(businessId, userId, {
      customerId,
      salesInvoiceId: invoiceId,
      locationId: locId,
      date: "2026-10-09",
      reference: "DEL-001",
      lines: [
        {
          itemId,
          description: "Enterprise Server Node delivery",
          quantity: "2",
          salesInvoiceLineId: invLine.id,
          projectId: "",
        },
      ],
    }, "post");
    assert.ok(deliveryId);

    tb = getTrialBalance(businessId, userId);
    assert.equal(tb.debitMinor, tb.creditMinor, "Trial balance must remain in equilibrium after delivery note COGS & stock reduction");

    // 6. Test Delivery Note Guard on Invoice Voiding BEFORE receipts are allocated:
    assert.throws(
      () => voidInvoice(businessId, userId, invoiceId),
      /Cannot void an invoice that has active delivery notes/i,
      "Cannot void an invoice that has active delivery notes"
    );

    // 7. Overpayment Receipt: Customer pays 5,000 AED against 4,725 AED invoice
    // Settle 4,725 against invoice, and hold 275 AED as advance customer credit!
    const receiptId = createReceipt(businessId, userId, {
      customerId,
      bankAccountId: bankLedgerAccount.id,
      date: "2026-10-10",
      amount: "5000.00",
      reference: "WIRE-7701",
      allocations: [
        {
          invoiceId,
          amount: "4725.00",
        },
      ],
    });
    assert.ok(receiptId);

    // Invoice is now fully paid!
    const paidInv = getInvoice(businessId, userId, invoiceId);
    assert.equal(paidInv?.balanceMinor, 0);
    assert.equal(paidInv?.paymentStatus, "paid");

    tb = getTrialBalance(businessId, userId);
    assert.equal(tb.debitMinor, tb.creditMinor, "Trial balance must remain in equilibrium after receipt overpayment & advance credit creation");

    // 8. Test Void Safety: Cannot void invoice while allocations exist
    assert.throws(
      () => voidInvoice(businessId, userId, invoiceId),
      /allocations/i
    );
  });

  await suite.test("7. Sales Order Lifecycle Guards & Error Messages", async () => {
    const { createCustomer } = await import("../src/modules/customers/customer-service");
    const { saveSalesOrder, closeSalesOrder, cancelSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");

    const customerId = createCustomer(businessId, userId, {
      name: "Guards Customer",
      email: "guards@client.com",
    });

    const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
    const tax5 = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get() ??
      sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };

    const draftOrderId = saveSalesOrder(businessId, userId, {
      customerId,
      date: "2026-10-10",
      amountsIncludeTax: false,
      lines: [{ description: "Service test", quantity: "1", unitPrice: "100.00", salesAccountId: incomeAccount.id, taxCodeId: tax5.id, discountType: "none", discountValue: "0", projectId: "" }],
    }, "draft");

    // Closing a draft order must fail with sales order specific message
    assert.throws(
      () => closeSalesOrder(businessId, userId, draftOrderId),
      /Only an active sales order can be closed/i
    );

    // Issue it
    const activeOrderId = saveSalesOrder(businessId, userId, {
      customerId,
      date: "2026-10-10",
      amountsIncludeTax: false,
      lines: [{ description: "Service test", quantity: "1", unitPrice: "100.00", salesAccountId: incomeAccount.id, taxCodeId: tax5.id, discountType: "none", discountValue: "0", projectId: "" }],
    }, "issue", draftOrderId);

    // Close it
    closeSalesOrder(businessId, userId, activeOrderId);

    // Cancelling a completed order must fail
    assert.throws(
      () => cancelSalesOrder(businessId, userId, activeOrderId),
      /A completed sales order cannot be cancelled/i
    );
  });

  await suite.test("8. Full Commercial Purchase Pipeline & Balance Verification", async () => {
    const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
    const { savePurchaseQuote } = await import("../src/modules/purchase-quotes/purchase-quote-service");
    const { savePurchaseOrder, getPurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");
    const { savePurchaseInvoice, getPurchaseInvoice, voidPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
    const { saveGoodsReceipt } = await import("../src/modules/inventory/goods-receipt-service");
    const { saveInventoryLocation } = await import("../src/modules/inventory/inventory-location-service");
    const { saveInventoryItem } = await import("../src/modules/inventory/inventory-item-service");
    const { createSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
    const { getTrialBalance } = await import("../src/modules/reports/report-service");

    const supplierId = createSupplier(businessId, userId, {
      name: "Global Components Inc",
      email: "supply@globalcomponents.com",
    });

    const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
    const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
    const assetAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'asset' LIMIT 1").get() as { id: string };
    const bankLedgerAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype = 'bank' LIMIT 1").get() as { id: string };
    const tax5 = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get() ??
      sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };
    const locId = saveInventoryLocation(businessId, userId, { name: "Purchasing Warehouse", code: "WH-2" });
    const itemId = saveInventoryItem(businessId, userId, {
      name: "DDR5 ECC RAM 64GB",
      sku: "RAM-DDR5-64G",
      unitName: "pcs",
      salesAccountId: incomeAccount.id,
      inventoryAssetAccountId: assetAccount.id,
      costOfSalesAccountId: expenseAccount.id,
      purchasePrice: "300.00",
      salesPrice: "450.00",
    });

    // 1. Purchase Quote
    const pqId = savePurchaseQuote(businessId, userId, {
      supplierId,
      date: "2026-10-11",
      expiryDate: "2026-10-30",
      reference: "RFQ-RAM-01",
      amountsIncludeTax: false,
      lines: [{ itemId, description: "DDR5 ECC RAM 64GB", quantity: "10", unitPrice: "300.00", expenseAccountId: expenseAccount.id, taxCodeId: tax5.id, discountType: "none", discountValue: "0", projectId: "" }],
    }, "issue");
    assert.ok(pqId);

    // 2. Purchase Order from Quote
    const poId = savePurchaseOrder(businessId, userId, {
      supplierId,
      purchaseQuoteId: pqId,
      date: "2026-10-12",
      expectedDate: "2026-10-25",
      reference: "PO-RAM-01",
      amountsIncludeTax: false,
      lines: [{ itemId, description: "DDR5 ECC RAM 64GB", quantity: "10", unitPrice: "300.00", expenseAccountId: expenseAccount.id, taxCodeId: tax5.id, discountType: "none", discountValue: "0", projectId: "" }],
    }, "issue");
    assert.ok(poId);

    // 3. Purchase Invoice (Bill)
    const billId = savePurchaseInvoice(businessId, userId, {
      supplierId,
      purchaseOrderId: poId,
      supplierInvoiceNumber: "INV-SUP-9988",
      invoiceDate: "2026-10-13",
      dueDate: "2026-11-13",
      reference: "PO-RAM-01",
      amountsIncludeTax: false,
      lines: [{ itemId, description: "DDR5 ECC RAM 64GB", quantity: "10", unitPrice: "300.00", expenseAccountId: expenseAccount.id, taxCodeId: tax5.id, discountType: "none", discountValue: "0", projectId: "" }],
    }, "post");
    assert.ok(billId);

    const bill = getPurchaseInvoice(businessId, userId, billId);
    assert.ok(bill);
    assert.equal(bill.invoice.totalMinor, 315000); // 10 * 300 = 3,000 + 5% tax (150) = 3,150 AED = 315,000 minor
    assert.equal(bill.balanceMinor, 315000);

    // 4. Goods Receipt linked to the Purchase Invoice
    const po = getPurchaseOrder(businessId, userId, poId);
    assert.ok(po);
    const grId = saveGoodsReceipt(businessId, userId, {
      supplierId,
      purchaseOrderId: poId,
      purchaseInvoiceId: billId,
      locationId: locId,
      date: "2026-10-14",
      reference: "GR-RAM-01",
      lines: [{
        itemId,
        description: "DDR5 ECC RAM 64GB received",
        quantity: "10",
        unitCost: "300.00",
        projectId: "",
        purchaseOrderLineId: po.lines[0].id,
        purchaseInvoiceLineId: bill.lines[0].id,
      }],
    }, "post");
    assert.ok(grId);

    // 5. Guard check: Cannot void bill with active goods receipts
    assert.throws(
      () => voidPurchaseInvoice(businessId, userId, billId),
      /Cannot void a purchase invoice that has active goods receipts/i
    );

    // 6. Pay the bill
    const paymentId = createSupplierPayment(businessId, userId, {
      supplierId,
      bankAccountId: bankLedgerAccount.id,
      date: "2026-10-15",
      amount: "3150.00",
      reference: "WIRE-SUPP-1",
      allocations: [{ invoiceId: billId, amount: "3150.00" }],
    });
    assert.ok(paymentId);

    const paidBill = getPurchaseInvoice(businessId, userId, billId);
    assert.ok(paidBill);
    assert.equal(paidBill.balanceMinor, 0);
    assert.equal(paidBill.paymentStatus, "paid");

    // Guard check: Cannot void bill with payment allocations
    assert.throws(
      () => voidPurchaseInvoice(businessId, userId, billId),
      /Cannot void a purchase invoice that has payment allocations/i
    );

    const tb = getTrialBalance(businessId, userId);
    assert.equal(tb.debitMinor, tb.creditMinor, "Trial balance must remain in strict equilibrium after full purchase flow");
  });

  await suite.test("9. Money Utilities with Multi-Unit Precision", async () => {
    const { minorToInput } = await import("../src/modules/accounting/calculations/money");
    // Standard 2-decimal currencies (AED, USD, EUR)
    assert.equal(minorToInput(12345), "123.45");
    assert.equal(minorToInput(5), "0.05");
    assert.equal(minorToInput(-50), "-0.50");

    // Zero-decimal currencies (JPY)
    assert.equal(minorToInput(500, 0), "500");
    assert.equal(minorToInput(-1250, 0), "-1250");

    // Three-decimal currencies (BHD, KWD, OMR)
    assert.equal(minorToInput(12345, 3), "12.345");
    assert.equal(minorToInput(7, 3), "0.007");
  });
});
