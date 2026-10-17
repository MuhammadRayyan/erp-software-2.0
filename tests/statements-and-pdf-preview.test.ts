import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-statements-test-")),
  BETTER_AUTH_SECRET: "statements-test-secret-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

test("Customer & Supplier Statements, Accounting Parity & PDF Export", async (t) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const { createCustomer } = await import("../src/modules/customers/customer-service");
  const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
  const { createInvoice } = await import("../src/modules/sales-invoices/invoice-service");
  const { savePurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
  const { createReceipt } = await import("../src/modules/receipts/receipt-service");
  const { createSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
  const { saveCreditNote } = await import("../src/modules/sales-credit-notes/credit-note-service");
  const { saveDebitNote } = await import("../src/modules/debit-notes/debit-note-service");
  const { getCustomerStatement, getCustomerAccountingSummary, getCustomerAging } = await import("../src/modules/reports/customer-statement-service");
  const { getSupplierStatement, getSupplierAccountingSummary, getSupplierAging } = await import("../src/modules/reports/supplier-statement-service");
  const { renderStatementPdf, renderDocumentPdf } = await import("../src/modules/document-templates/template-registry");

  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') LIMIT 1").get() as { id: string };
  const zeroTax = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1").get() ?? sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };

  assert.ok(incomeAccount, "Income account must exist");
  assert.ok(expenseAccount, "Expense account must exist");
  assert.ok(bankAccount, "Bank account must exist");
  assert.ok(zeroTax, "Tax code must exist");

  await t.test("Customer Statement & Accounting Summary with Invoices, Advance Retainers, and Credit Notes", async () => {
    const customerId = createCustomer(businessId, userId, {
      name: "Statement Customer LLC",
      email: "billing@statementcustomer.ae",
      phone: "+971 4 555 7788",
    });

    // 1. Post Sales Invoice for AED 5,000
    const invId = createInvoice(businessId, userId, {
      customerId,
      invoiceDate: "2026-09-01",
      taxDate: "2026-09-01",
      dueDate: "2026-09-30",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: "2026-09-01",
      exchangeRateSource: "Base",
      lines: [
        {
          description: "Software Services",
          quantity: "1",
          unitPrice: "5000.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: zeroTax.id,
        },
      ],
    }, "post");

    let stmt = getCustomerStatement(businessId, userId, customerId);
    assert.equal(stmt.length, 1);
    assert.equal(stmt[0].source_type, "sales_invoice");
    assert.equal(stmt[0].debit_minor, 500_000);
    assert.equal(stmt[0].credit_minor, 0);
    assert.equal(stmt[0].balanceMinor, 500_000);

    let summary = getCustomerAccountingSummary(businessId, userId, customerId);
    assert.equal(summary.totalInvoicedMinor, 500_000);
    assert.equal(summary.totalReceivedMinor, 0);
    assert.equal(summary.totalCreditedMinor, 0);
    assert.equal(summary.outstandingMinor, 500_000);

    // 2. Post pure Customer Advance Receipt for AED 2,000 (no allocations)
    createReceipt(businessId, userId, {
      customerId,
      date: "2026-09-05",
      bankAccountId: bankAccount.id,
      amount: "2000.00",
      currencyCode: "AED",
      allocations: [],
    });

    stmt = getCustomerStatement(businessId, userId, customerId);
    assert.equal(stmt.length, 2, "Unallocated advance receipt must appear on customer statement");
    assert.equal(stmt[1].source_type, "receipt");
    assert.equal(stmt[1].credit_minor, 200_000);
    assert.equal(stmt[1].balanceMinor, 300_000, "Running balance must decrease after receipt");

    summary = getCustomerAccountingSummary(businessId, userId, customerId);
    assert.equal(summary.totalInvoicedMinor, 500_000);
    assert.equal(summary.totalReceivedMinor, 200_000, "Accounting summary must count full advance receipt");
    assert.equal(summary.outstandingMinor, 300_000);

    // 3. Post Credit Note for AED 500
    saveCreditNote(businessId, userId, {
      customerId,
      sourceInvoiceId: invId,
      date: "2026-09-10",
      taxDate: "2026-09-10",
      reason: "Discount adjustment",
      lines: [
        {
          description: "Service adjustment",
          quantity: "1",
          unitPrice: "500.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: zeroTax.id,
          discountType: "none",
          discountValue: "0",
          projectId: "",
        },
      ],
    }, "post");

    stmt = getCustomerStatement(businessId, userId, customerId);
    assert.equal(stmt.length, 3, "Credit note must appear on customer statement");
    assert.equal(stmt[2].source_type, "sales_credit_note");
    assert.equal(stmt[2].credit_minor, 50_000);
    assert.equal(stmt[2].balanceMinor, 250_000);

    summary = getCustomerAccountingSummary(businessId, userId, customerId);
    assert.equal(summary.totalInvoicedMinor, 500_000);
    assert.equal(summary.totalReceivedMinor, 200_000);
    assert.equal(summary.totalCreditedMinor, 50_000);
    assert.equal(summary.outstandingMinor, 250_000);

    // 4. Test Date-Range Filtering & Opening Balance ("Balance Brought Forward")
    const rangeStmt = getCustomerStatement(businessId, userId, customerId, { fromDate: "2026-09-06" });
    assert.equal(rangeStmt.length, 2, "Filtered statement must include opening balance row and subsequent transactions");
    assert.equal(rangeStmt[0].entry_number, "OPENING");
    assert.equal(rangeStmt[0].source_type, "opening_balance");
    assert.equal(rangeStmt[0].description, "Balance Brought Forward");
    assert.equal(rangeStmt[0].balanceMinor, 300_000, "Opening balance before Sep 6 must equal 5,000 - 2,000 = 3,000");
    assert.equal(rangeStmt[1].source_type, "sales_credit_note");
    assert.equal(rangeStmt[1].credit_minor, 50_000);
    assert.equal(rangeStmt[1].balanceMinor, 250_000, "Final balance after credit note must be 2,500");

    // 5. Test Customer Aging Analysis (Aged Receivables)
    const custAging = getCustomerAging(businessId, userId, customerId, "2026-10-15");
    assert.equal(custAging.totalMinor, 250_000, "Total aging balance must equal net outstanding customer balance");
    assert.equal(custAging.days30Minor, 250_000, "Invoice due 2026-09-30 is 15 days overdue on 2026-10-15 -> 1-30 days bucket");
    assert.equal(custAging.currentMinor, 0);
    assert.equal(
      custAging.currentMinor + custAging.days30Minor + custAging.days60Minor + custAging.days90Minor + custAging.days90PlusMinor,
      custAging.totalMinor,
      "Sum of all aging buckets must strictly equal totalMinor",
    );

    // 6. Generate Customer Statement PDF with Period & Aging Analysis
    const customerPdf = await renderStatementPdf(businessId, userId, {
      companyName: "Acme Corp",
      customerName: "Statement Customer LLC",
      statementDate: "10 Sep 2026",
      periodLabel: "06 Sep 2026 – 10 Sep 2026",
      lines: rangeStmt.map((r) => ({
        date: r.date,
        type: r.source_type,
        reference: r.reference || r.entry_number,
        description: r.description,
        debit: r.debit_minor ? (r.debit_minor / 100).toFixed(2) : "",
        credit: r.credit_minor ? (r.credit_minor / 100).toFixed(2) : "",
        balance: (r.balanceMinor / 100).toFixed(2),
      })),
      totalOutstanding: "AED 2,500.00",
      aging: {
        current: "AED 0.00",
        days30: "AED 2,500.00",
        days60: "AED 0.00",
        days90: "AED 0.00",
        days90Plus: "AED 0.00",
        total: "AED 2,500.00",
      },
    });
    assert.ok(customerPdf.length > 500);
    assert.equal(customerPdf.subarray(0, 4).toString(), "%PDF");
  });

  await t.test("Supplier Statement & Accounting Summary with Bills, Vendor Prepayments, and Debit Notes", async () => {
    const supplierId = createSupplier(businessId, userId, {
      name: "Statement Vendor FZE",
      email: "finance@statementvendor.ae",
      phone: "+971 4 999 1122",
    });

    // 1. Post Purchase Invoice for AED 10,000
    const billId = savePurchaseInvoice(businessId, userId, {
      supplierId,
      invoiceDate: "2026-09-01",
      taxDate: "2026-09-01",
      dueDate: "2026-09-30",
      supplierInvoiceNumber: "VEND-BILL-100",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: "2026-09-01",
      exchangeRateSource: "Base",
      lines: [
        {
          description: "Consulting Materials",
          quantity: "1",
          unitPrice: "10000.00",
          expenseAccountId: expenseAccount.id,
          taxCodeId: zeroTax.id,
          discountType: "none",
          discountValue: "0",
          projectId: "",
        },
      ],
    }, "post");

    let stmt = getSupplierStatement(businessId, userId, supplierId);
    assert.equal(stmt.length, 1);
    assert.equal(stmt[0].source_type, "purchase_invoice");
    assert.equal(stmt[0].credit_minor, 1_000_000);
    assert.equal(stmt[0].debit_minor, 0);
    assert.equal(stmt[0].balanceMinor, 1_000_000);

    let summary = getSupplierAccountingSummary(businessId, userId, supplierId);
    assert.equal(summary.totalPurchasedMinor, 1_000_000);
    assert.equal(summary.totalPaidMinor, 0);
    assert.equal(summary.totalDebitedMinor, 0);
    assert.equal(summary.outstandingMinor, 1_000_000);

    // 2. Post pure Vendor Prepayment for AED 4,000 (no bill allocations)
    createSupplierPayment(businessId, userId, {
      supplierId,
      date: "2026-09-04",
      bankAccountId: bankAccount.id,
      amount: "4000.00",
      currencyCode: "AED",
      allocations: [],
    });

    stmt = getSupplierStatement(businessId, userId, supplierId);
    assert.equal(stmt.length, 2, "Unallocated vendor prepayment must appear on supplier statement");
    assert.equal(stmt[1].source_type, "supplier_payment");
    assert.equal(stmt[1].debit_minor, 400_000);
    assert.equal(stmt[1].balanceMinor, 600_000, "Payable balance must decrease after payment");

    summary = getSupplierAccountingSummary(businessId, userId, supplierId);
    assert.equal(summary.totalPurchasedMinor, 1_000_000);
    assert.equal(summary.totalPaidMinor, 400_000, "Accounting summary must count full vendor prepayment");
    assert.equal(summary.totalDebitedMinor, 0);
    assert.equal(summary.outstandingMinor, 600_000);

    // 3. Post Debit Note for AED 1,000 against the bill
    saveDebitNote(businessId, userId, {
      supplierId,
      purchaseInvoiceId: billId,
      date: "2026-09-08",
      taxDate: "2026-09-08",
      reference: "DEFECTIVE-RETURN",
      lines: [
        {
          description: "Defective materials return",
          quantity: "1",
          unitPrice: "1000.00",
          expenseAccountId: expenseAccount.id,
          taxCodeId: zeroTax.id,
          discountType: "none",
          discountValue: "0",
          projectId: "",
        },
      ],
    }, "post");

    stmt = getSupplierStatement(businessId, userId, supplierId);
    assert.equal(stmt.length, 3, "Debit note must appear on supplier statement");
    assert.equal(stmt[2].source_type, "debit_note");
    assert.equal(stmt[2].debit_minor, 100_000);
    assert.equal(stmt[2].balanceMinor, 500_000);

    summary = getSupplierAccountingSummary(businessId, userId, supplierId);
    assert.equal(summary.totalPurchasedMinor, 1_000_000);
    assert.equal(summary.totalPaidMinor, 400_000);
    assert.equal(summary.totalDebitedMinor, 100_000);
    assert.equal(summary.outstandingMinor, 500_000);

    // 4. Test Date-Range Filtering & Opening Balance ("Balance Brought Forward")
    const rangeStmt = getSupplierStatement(businessId, userId, supplierId, { fromDate: "2026-09-05" });
    assert.equal(rangeStmt.length, 2, "Filtered statement must include opening balance row and subsequent transactions");
    assert.equal(rangeStmt[0].entry_number, "OPENING");
    assert.equal(rangeStmt[0].source_type, "opening_balance");
    assert.equal(rangeStmt[0].description, "Balance Brought Forward");
    assert.equal(rangeStmt[0].balanceMinor, 600_000, "Opening balance before Sep 5 must equal 10,000 - 4,000 = 6,000");
    assert.equal(rangeStmt[1].source_type, "debit_note");
    assert.equal(rangeStmt[1].debit_minor, 100_000);
    assert.equal(rangeStmt[1].balanceMinor, 500_000, "Payable balance after debit note must be 5,000");

    // 5. Test Supplier Aging Analysis (Aged Payables)
    const suppAging = getSupplierAging(businessId, userId, supplierId, "2026-11-15");
    assert.equal(suppAging.totalMinor, 500_000, "Total aging balance must equal net outstanding supplier payable");
    assert.equal(suppAging.days60Minor, 500_000, "Bill due 2026-09-30 is 46 days overdue on 2026-11-15 -> 31-60 days bucket");
    assert.equal(suppAging.currentMinor, 0);
    assert.equal(
      suppAging.currentMinor + suppAging.days30Minor + suppAging.days60Minor + suppAging.days90Minor + suppAging.days90PlusMinor,
      suppAging.totalMinor,
      "Sum of all aging buckets must strictly equal totalMinor",
    );

    // 6. Generate Supplier Statement PDF with Period & Aging Analysis
    const supplierPdf = await renderStatementPdf(businessId, userId, {
      companyName: "Acme Corp",
      partyName: "Statement Vendor FZE",
      partyLabel: "Supplier",
      title: "SUPPLIER STATEMENT OF ACCOUNT",
      balanceLabel: "Payable Balance:",
      statementDate: "10 Sep 2026",
      periodLabel: "05 Sep 2026 – 10 Sep 2026",
      lines: rangeStmt.map((r) => ({
        date: r.date,
        type: r.source_type,
        reference: r.reference || r.entry_number,
        description: r.description,
        debit: r.debit_minor ? (r.debit_minor / 100).toFixed(2) : "",
        credit: r.credit_minor ? (r.credit_minor / 100).toFixed(2) : "",
        balance: (r.balanceMinor / 100).toFixed(2),
      })),
      totalOutstanding: "AED 5,000.00",
      aging: {
        current: "AED 0.00",
        days30: "AED 0.00",
        days60: "AED 5,000.00",
        days90: "AED 0.00",
        days90Plus: "AED 0.00",
        total: "AED 5,000.00",
      },
    });
    assert.ok(supplierPdf.length > 500);
    assert.equal(supplierPdf.subarray(0, 4).toString(), "%PDF");
  });

  await t.test("Template Studio PDF Preview compiles documents cleanly", async () => {
    const sampleInvoicePdf = await renderDocumentPdf(businessId, userId, "sales-invoice", {
      companyName: "Acme Corp",
      invoiceTitle: "TAX INVOICE",
      customerLabel: "BILL TO",
      invoiceNumber: "INV-PREVIEW-001",
      invoiceDate: "2026-09-01",
      dueDate: "2026-09-30",
      customerName: "Preview Client LLC",
      lines: [
        {
          description: "Consulting",
          quantity: "1",
          unitPrice: "1,000.00",
          amount: "1,000.00",
        },
      ],
      subtotal: "AED 1,000.00",
      tax: "AED 0.00",
      total: "AED 1,000.00",
    });
    assert.ok(sampleInvoicePdf.length > 500);
    assert.equal(sampleInvoicePdf.subarray(0, 4).toString(), "%PDF");

    const sampleDebitPdf = await renderDocumentPdf(businessId, userId, "debit-note", {
      companyName: "Acme Corp",
      invoiceTitle: "DEBIT NOTE",
      customerLabel: "SUPPLIER",
      invoiceNumber: "DN-PREVIEW-001",
      invoiceDate: "2026-09-01",
      customerName: "Preview Supplier FZE",
      lines: [
        {
          description: "Damaged Goods",
          quantity: "1",
          unitPrice: "500.00",
          amount: "500.00",
        },
      ],
      subtotal: "AED 500.00",
      tax: "AED 0.00",
      total: "AED 500.00",
    });
    assert.ok(sampleDebitPdf.length > 500);
    assert.equal(sampleDebitPdf.subarray(0, 4).toString(), "%PDF");
  });
});
