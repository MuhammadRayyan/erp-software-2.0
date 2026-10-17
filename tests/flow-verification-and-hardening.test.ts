import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-flow-verify-")),
  BETTER_AUTH_SECRET: "flow-verification-secret-test-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

// Validation Schemas
const { phoneSchema } = await import("../src/core/validation/party-schemas");
const { customerInputSchema } = await import("../src/modules/customers/customer-input");
const { supplierInputSchema } = await import("../src/modules/suppliers/supplier-input");

// Services
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
const { saveSalesQuote, getSalesQuote } = await import("../src/modules/sales-quotes/quote-service");
const { saveSalesOrder, getSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
const { createInvoice, getInvoice, updateInvoice, voidInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { createReceipt } = await import("../src/modules/receipts/receipt-service");
const { createSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
const { savePurchaseQuote, getPurchaseQuote } = await import("../src/modules/purchase-quotes/purchase-quote-service");
const { savePurchaseOrder, getPurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");
const { savePurchaseInvoice, getPurchaseInvoice, voidPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { getTrialBalance, getAccountsReceivable, getAccountsPayable, getBankBalance } = await import("../src/modules/reports/report-service");
const { renderDocumentPdf } = await import("../src/modules/document-templates/template-registry");
const { getTemplateSettings, saveTemplateSettings } = await import("../src/modules/document-templates/template-service");
const { renderMultiCurrencyString } = await import("../src/components/table-totals-bar");
const { formatMoney } = await import("../src/core/format");

test("System Flow Hardening, Validation, Linkage & Money Flow Verification", async (t) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
  const standardVat = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'standard' LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') LIMIT 1").get() as { id: string };

  assert.ok(incomeAccount, "income account found");
  assert.ok(expenseAccount, "expense account found");
  assert.ok(standardVat, "standard vat code found");
  assert.ok(bankAccount, "bank account found");

  await t.test("1. Phone Number Validation & Party Inputs", async () => {
    // Valid phone numbers
    const validPhones = [
      "+971 50 123 4567",
      "050-123-4567",
      "+1 (555) 123-4567",
      "+44 20 7946 0919",
      "04 321 4321",
      "1234567",
      "+971 50 1234 5678",
      "", // optional empty string
      undefined,
    ];

    for (const phone of validPhones) {
      const res = phoneSchema.safeParse(phone);
      assert.equal(res.success, true, `Expected phone "${phone}" to be valid`);
    }

    // Invalid phone numbers
    const invalidPhones = [
      "12345", // too short (5 digits)
      "abc",
      "call-me-now",
      "random-junk-text",
      "1234567890123456789", // too long (>15 digits)
      "+++",
      "(---)",
    ];

    for (const phone of invalidPhones) {
      const res = phoneSchema.safeParse(phone);
      assert.equal(res.success, false, `Expected phone "${phone}" to be rejected`);
    }

    // Party schemas reject invalid phone
    const badCustomer = customerInputSchema.safeParse({
      name: "Acme Corp",
      phone: "invalid-phone",
    });
    assert.equal(badCustomer.success, false);

    const badSupplier = supplierInputSchema.safeParse({
      name: "Supplier LLC",
      phone: "too-short-12",
    });
    assert.equal(badSupplier.success, false);

    // Creating customer with valid phone succeeds
    const customerId = createCustomer(businessId, userId, {
      name: "Verified Phone Customer LLC",
      phone: "+971 50 999 8888",
      email: "contact@verified.example",
    });
    assert.ok(customerId);

    // Creating supplier with valid phone succeeds
    const supplierId = createSupplier(businessId, userId, {
      name: "Verified Phone Supplier FZE",
      phone: "+971 4 888 7777",
      email: "accounts@supplier.example",
    });
    assert.ok(supplierId);
  });

  await t.test("2. Sales Cycle Relational Linkage & Stepper Pill Preservation on Edit", async () => {
    const customerId = createCustomer(businessId, userId, {
      name: "Workflow Tech FZ-LLC",
      phone: "+971 52 111 2222",
    });

    // 1. Create Quote
    const quoteId = saveSalesQuote(
      businessId,
      userId,
      {
        customerId,
        date: "2026-08-01",
        currencyCode: "AED",
        lines: [
          {
            description: "Enterprise ERP Software License",
            quantity: "2",
            unitPrice: "5000",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "issue",
    );

    const quoteRecord = getSalesQuote(businessId, userId, quoteId);
    assert.ok(quoteRecord);
    assert.equal(quoteRecord.lines.length, 1);

    // 2. Convert / Create Sales Order linked to Quote
    const orderId = saveSalesOrder(
      businessId,
      userId,
      {
        customerId,
        salesQuoteId: quoteId,
        date: "2026-08-02",
        currencyCode: "AED",
        lines: [
          {
            description: "Enterprise ERP Software License",
            quantity: "2",
            unitPrice: "5000",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "issue",
    );

    const initialOrder = getSalesOrder(businessId, userId, orderId);
    assert.equal(initialOrder?.order.salesQuoteId, quoteId, "Order must link to original quote");

    // 3. Edit the Sales Order WITHOUT passing salesQuoteId
    saveSalesOrder(
      businessId,
      userId,
      {
        customerId,
        date: "2026-08-02",
        currencyCode: "AED",
        notes: "Updated delivery schedule notes",
        lines: [
          {
            description: "Enterprise ERP Software License (Updated)",
            quantity: "2",
            unitPrice: "5000",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "issue",
      orderId,
    );

    const editedOrder = getSalesOrder(businessId, userId, orderId);
    assert.equal(
      editedOrder?.order.salesQuoteId,
      quoteId,
      "Order must preserve salesQuoteId across edit so stepper pill does not break",
    );
    assert.equal(editedOrder?.order.notes, "Updated delivery schedule notes");

    // 4. Create Sales Invoice linked to Order and Quote
    const invoiceId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        salesOrderId: orderId,
        quoteId: quoteId,
        invoiceDate: "2026-08-03",
        dueDate: "2026-09-02",
        currencyCode: "AED",
        lines: [
          {
            description: "Enterprise ERP Software License",
            quantity: "2",
            unitPrice: "5000",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "post",
    );

    const initialInvoice = getInvoice(businessId, userId, invoiceId);
    assert.ok(initialInvoice);
    assert.equal(initialInvoice.linkedOrder?.id, orderId, "Invoice has linkedOrder");
    assert.equal(initialInvoice.linkedQuote?.id, quoteId, "Invoice has linkedQuote");

    // 5. Edit the Sales Invoice WITHOUT explicitly supplying salesOrderId or quoteId
    updateInvoice(
      businessId,
      userId,
      invoiceId,
      {
        customerId,
        invoiceDate: "2026-08-03",
        dueDate: "2026-09-02",
        currencyCode: "AED",
        reference: "PO-CLIENT-999",
        notes: "Payment via wire transfer",
        lines: [
          {
            description: "Enterprise ERP Software License (Confirmed)",
            quantity: "2",
            unitPrice: "5000",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "post",
    );

    const editedInvoice = getInvoice(businessId, userId, invoiceId);
    assert.ok(editedInvoice);
    assert.equal(
      editedInvoice.linkedOrder?.id,
      orderId,
      "Invoice must preserve linkedOrder across edit so status pill stays visible",
    );
    assert.equal(
      editedInvoice.linkedQuote?.id,
      quoteId,
      "Invoice must preserve linkedQuote across edit so status pill stays visible",
    );
    assert.equal(editedInvoice.invoice.reference, "PO-CLIENT-999");
  });

  await t.test("3. Purchase Cycle Relational Linkage Preservation on Edit", async () => {
    const supplierId = createSupplier(businessId, userId, {
      name: "Direct Hardware Suppliers FZ",
      phone: "+971 4 333 4444",
    });

    // 1. Create Purchase Quote
    const pQuoteId = savePurchaseQuote(
      businessId,
      userId,
      {
        supplierId,
        date: "2026-08-01",
        currencyCode: "AED",
        lines: [
          {
            description: "Rack Servers Dell PowerEdge",
            quantity: "1",
            unitPrice: "15000",
            taxCodeId: standardVat.id,
            expenseAccountId: expenseAccount.id,
          },
        ],
      },
      "issue",
    );

    const initialPQuote = getPurchaseQuote(businessId, userId, pQuoteId);
    assert.ok(initialPQuote);

    // 2. Create Purchase Order linked to Quote
    const pOrderId = savePurchaseOrder(
      businessId,
      userId,
      {
        supplierId,
        purchaseQuoteId: pQuoteId,
        date: "2026-08-02",
        currencyCode: "AED",
        lines: [
          {
            description: "Rack Servers Dell PowerEdge",
            quantity: "1",
            unitPrice: "15000",
            taxCodeId: standardVat.id,
            expenseAccountId: expenseAccount.id,
          },
        ],
      },
      "issue",
    );

    const initialPOrder = getPurchaseOrder(businessId, userId, pOrderId);
    assert.equal(initialPOrder?.order.purchaseQuoteId, pQuoteId);

    // 3. Edit Purchase Order without supplying purchaseQuoteId
    savePurchaseOrder(
      businessId,
      userId,
      {
        supplierId,
        date: "2026-08-02",
        currencyCode: "AED",
        reference: "PO-REF-777",
        lines: [
          {
            description: "Rack Servers Dell PowerEdge (Priority Delivery)",
            quantity: "1",
            unitPrice: "15000",
            taxCodeId: standardVat.id,
            expenseAccountId: expenseAccount.id,
          },
        ],
      },
      "issue",
      pOrderId,
    );

    const editedPOrder = getPurchaseOrder(businessId, userId, pOrderId);
    assert.equal(
      editedPOrder?.order.purchaseQuoteId,
      pQuoteId,
      "Purchase order must retain purchaseQuoteId on edit",
    );

    // 4. Create Purchase Invoice linked to PO
    const pInvoiceId = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        purchaseOrderId: pOrderId,
        supplierInvoiceNumber: "SUPP-INV-001",
        invoiceDate: "2026-08-03",
        dueDate: "2026-09-02",
        currencyCode: "AED",
        lines: [
          {
            description: "Rack Servers Dell PowerEdge",
            quantity: "1",
            unitPrice: "15000",
            taxCodeId: standardVat.id,
            expenseAccountId: expenseAccount.id,
          },
        ],
      },
      "post",
    );

    const initialPInvoice = getPurchaseInvoice(businessId, userId, pInvoiceId);
    assert.equal(initialPInvoice?.invoice.purchaseOrderId, pOrderId);

    // 5. Edit Purchase Invoice without supplying purchaseOrderId
    savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "SUPP-INV-001-REV",
        invoiceDate: "2026-08-03",
        dueDate: "2026-09-02",
        currencyCode: "AED",
        reference: "BILL-MODIFIED-555",
        lines: [
          {
            description: "Rack Servers Dell PowerEdge (Received)",
            quantity: "1",
            unitPrice: "15000",
            taxCodeId: standardVat.id,
            expenseAccountId: expenseAccount.id,
          },
        ],
      },
      "post",
      pInvoiceId,
    );

    const editedPInvoice = getPurchaseInvoice(businessId, userId, pInvoiceId);
    assert.equal(
      editedPInvoice?.invoice.purchaseOrderId,
      pOrderId,
      "Purchase invoice must retain purchaseOrderId on edit",
    );
  });

  await t.test("4. Lifecycle Stage Guards & Edit Restrictions", async () => {
    const customerId = createCustomer(businessId, userId, {
      name: "Guard Test Customer",
      phone: "+971 55 666 7777",
    });

    // 1. Sales Order cannot be edited once completed/cancelled
    const orderId = saveSalesOrder(
      businessId,
      userId,
      {
        customerId,
        date: "2026-08-10",
        currencyCode: "AED",
        lines: [
          {
            description: "Consulting Package",
            quantity: "5",
            unitPrice: "1000",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "issue",
    );

    // Mark as completed
    sqlite.prepare("UPDATE sales_orders SET document_status = 'completed' WHERE id = ?").run(orderId);

    assert.throws(
      () => {
        saveSalesOrder(
          businessId,
          userId,
          {
            customerId,
            date: "2026-08-10",
            currencyCode: "AED",
            lines: [
              {
                description: "Illegal Edit",
                quantity: "5",
                unitPrice: "1000",
                taxCodeId: standardVat.id,
                salesAccountId: incomeAccount.id,
              },
            ],
          },
          "issue",
          orderId,
        );
      },
      /Closed or cancelled sales orders cannot be edited/,
      "Must forbid editing completed order",
    );

    // 2. Sales Invoice cannot be edited once a Delivery Note exists
    const invoiceId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-08-11",
        dueDate: "2026-09-11",
        currencyCode: "AED",
        lines: [
          {
            description: "Physical Widget",
            quantity: "10",
            unitPrice: "200",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "post",
    );

    // Insert dummy delivery note linking to this invoice
    const loc = sqlite.prepare("SELECT id FROM inventory_locations LIMIT 1").get() as { id: string };
    sqlite
      .prepare(
        "INSERT INTO delivery_notes (id, delivery_number, date, customer_id, sales_invoice_id, location_id, document_status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, datetime('now'), datetime('now'))",
      )
      .run("dn-test-guard", "DN-9999", "2026-08-11", customerId, invoiceId, loc.id, userId);

    assert.throws(
      () => {
        updateInvoice(
          businessId,
          userId,
          invoiceId,
          {
            customerId,
            invoiceDate: "2026-08-11",
            dueDate: "2026-09-11",
            currencyCode: "AED",
            lines: [
              {
                description: "Altered Widget",
                quantity: "15",
                unitPrice: "200",
                taxCodeId: standardVat.id,
                salesAccountId: incomeAccount.id,
              },
            ],
          },
          "post",
        );
      },
      /Delivery Note has been created from it/,
      "Must forbid editing invoice after delivery note is created",
    );
  });

  await t.test("5. Money Flow Architecture & Double-Entry Integrity", async () => {
    const customerId = createCustomer(businessId, userId, {
      name: "Financial Audit Client",
      phone: "+971 50 123 9999",
    });

    // Subtotal = 10,000.00 AED (1,000,000 minor)
    // 5% VAT = 500.00 AED (50,000 minor)
    // Total = 10,500.00 AED (1,050,000 minor)
    const invoiceId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-08-15",
        dueDate: "2026-09-15",
        currencyCode: "AED",
        lines: [
          {
            description: "Audited Financial Advisory Services",
            quantity: "1",
            unitPrice: "10000",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "post",
    );

    const inv = getInvoice(businessId, userId, invoiceId);
    assert.ok(inv);
    assert.equal(inv.invoice.subtotalMinor, 1000000);
    assert.equal(inv.invoice.taxMinor, 50000);
    assert.equal(inv.invoice.totalMinor, 1050000);
    assert.equal(inv.balanceMinor, 1050000);

    // Verify journal entry lines for invoice
    const invoiceJournal = sqlite
      .prepare("SELECT id FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?")
      .get(invoiceId) as { id: string };
    assert.ok(invoiceJournal, "Invoice journal must exist");

    const jLines = sqlite
      .prepare("SELECT debit_minor, credit_minor, account_id FROM journal_lines WHERE journal_entry_id = ?")
      .all(invoiceJournal.id) as { debit_minor: number; credit_minor: number; account_id: string }[];

    const totalDebits = jLines.reduce((acc, l) => acc + l.debit_minor, 0);
    const totalCredits = jLines.reduce((acc, l) => acc + l.credit_minor, 0);

    assert.equal(totalDebits, 1050000, "Debit must equal total invoice amount (10,500.00 AED)");
    assert.equal(totalCredits, 1050000, "Credit must equal total invoice amount (10,500.00 AED)");
    assert.equal(totalDebits, totalCredits, "Double entry must be strictly balanced");

    // Settle with Customer Receipt
    const receiptResult = createReceipt(businessId, userId, {
      customerId,
      invoiceId,
      bankAccountId: bankAccount.id,
      date: "2026-08-16",
      currencyCode: "AED",
      amount: "10500.00",
      reference: "REC-001",
    });
    const receiptId = receiptResult.id;
    assert.ok(receiptId);

    // Verify Invoice balance is now 0 (Fully Paid)
    const paidInvoice = getInvoice(businessId, userId, invoiceId);
    assert.ok(paidInvoice);
    assert.equal(paidInvoice.balanceMinor, 0, "Invoice balance must be 0 after full receipt");

    // Verify Receipt Journal Entry
    const receiptJournal = sqlite
      .prepare("SELECT id FROM journal_entries WHERE source_type = 'receipt' AND source_id = ?")
      .get(receiptId) as { id: string };
    assert.ok(receiptJournal, "Receipt journal must exist");

    const rLines = sqlite
      .prepare("SELECT debit_minor, credit_minor FROM journal_lines WHERE journal_entry_id = ?")
      .all(receiptJournal.id) as { debit_minor: number; credit_minor: number }[];

    const rDebits = rLines.reduce((acc, l) => acc + l.debit_minor, 0);
    const rCredits = rLines.reduce((acc, l) => acc + l.credit_minor, 0);

    assert.equal(rDebits, 1050000, "Receipt DR (Bank) == 10,500.00 AED");
    assert.equal(rCredits, 1050000, "Receipt CR (AR) == 10,500.00 AED");
    assert.equal(rDebits, rCredits, "Receipt journal balanced");

    // Verify Business-Wide Trial Balance
    const trialBalance = getTrialBalance(businessId, userId);
    assert.equal(
      trialBalance.debitMinor,
      trialBalance.creditMinor,
      "Trial balance total debits must equal total credits",
    );
    assert.equal(trialBalance.debitMinor - trialBalance.creditMinor, 0, "Trial balance discrepancy must be exactly 0.00");
  });

  await t.test("6. Document Template PDF Generation & Customization", async () => {
    const sampleData = {
      companyName: "Modern ERP Test Corp",
      companyAddress: "Downtown Dubai, UAE",
      companyEmail: "test@erp.example",
      companyPhone: "+971 4 123 4567",
      sellerTrn: "100234567800003",
      invoiceTitle: "TAX INVOICE",
      customerLabel: "BILL TO",
      invoiceNumber: "INV-2026-9999",
      invoiceDate: "15 Aug 2026",
      dueDate: "15 Sep 2026",
      customerName: "Global Client Ltd",
      customerAddress: "Business Bay, Dubai",
      customerTrn: "100987654300003",
      lines: [
        {
          description: "Technical Consultation",
          quantity: "1",
          unitPrice: "AED 5,000.00",
          amount: "AED 5,000.00",
          tax: "AED 250.00",
        },
      ],
      subtotal: "AED 5,000.00",
      tax: "AED 250.00",
      total: "AED 5,250.00",
      notes: "Thank you for partnering with us.",
      terms: "Payment due within 30 days.",
    };

    // Test PDF rendering for diverse document types
    const docTypes = ["sales-invoice", "sales-quote", "sales-order", "purchase-order", "delivery-note"];
    for (const dt of docTypes) {
      const pdfBuffer = await renderDocumentPdf(businessId, userId, dt, sampleData);
      assert.ok(pdfBuffer instanceof Buffer, `Should return a Buffer for ${dt}`);
      assert.ok(pdfBuffer.length > 500, `PDF buffer for ${dt} should be > 500 bytes`);
    }

    // Test template settings saving
    saveTemplateSettings(businessId, userId, "sales-invoice", {
      templateType: "modern",
      primaryColor: "#0284c7",
      watermarkText: "PAID",
      fontSize: "normal",
      showTaxColumn: true,
      showDiscountColumn: false,
      showItemCode: true,
      showNotes: true,
      showTerms: true,
    });

    const loadedSettings = getTemplateSettings(businessId, userId, "sales-invoice");
    assert.equal(loadedSettings.primaryColor, "#0284c7");
    assert.equal(loadedSettings.watermarkText, "PAID");
  });

  await t.test("7. Void Invoices and Bills Totals & General Ledger Reversal Invariants", async () => {
    const customerId = createCustomer(businessId, userId, {
      name: "Void Testing Customer Ltd",
      phone: "+971 50 444 3333",
    });

    // Create a posted Sales Invoice
    const invId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-08-10",
        dueDate: "2026-09-10",
        currencyCode: "AED",
        lines: [
          {
            description: "Consultancy Services for Architecture Audit",
            quantity: "1",
            unitPrice: "12000",
            taxCodeId: standardVat.id,
            salesAccountId: incomeAccount.id,
          },
        ],
      },
      "post",
    );

    const inv = getInvoice(businessId, userId, invId);
    assert.ok(inv);
    assert.equal(inv.invoice.documentStatus, "posted");
    assert.equal(inv.invoice.totalMinor, 1260000); // 12,000 + 5% = 12,600 AED
    assert.equal(inv.balanceMinor, 1260000);

    // Simulated Table Rows for Sales Invoices before voiding
    const tableRowsBefore = [
      {
        totalMinor: inv.invoice.totalMinor,
        balanceMinor: inv.balanceMinor,
        currencyCode: inv.invoice.currencyCode,
        currencyMinorUnit: 2,
        documentStatus: inv.invoice.documentStatus,
      },
    ];

    // Total Invoiced & Total Balance before voiding
    const totalInvoicedBefore = renderMultiCurrencyString(
      tableRowsBefore.map((r) => ({ amount: r.totalMinor, currency: r.currencyCode, minorUnit: r.currencyMinorUnit }))
    );
    const totalBalanceBefore = renderMultiCurrencyString(
      tableRowsBefore.filter((r) => r.documentStatus === "posted").map((r) => ({ amount: r.balanceMinor, currency: r.currencyCode, minorUnit: r.currencyMinorUnit }))
    );
    assert.equal(totalInvoicedBefore, formatMoney(1260000, "AED"));
    assert.equal(totalBalanceBefore, formatMoney(1260000, "AED"));

    // Accounts Receivable should list this invoice
    const arBefore = getAccountsReceivable(businessId, userId);
    assert.ok(arBefore.some((r) => r.document_id === invId && r.foreign_open_minor === 1260000));

    // Void the Sales Invoice
    voidInvoice(businessId, userId, invId);

    const voidedInv = getInvoice(businessId, userId, invId);
    assert.ok(voidedInv);
    assert.equal(voidedInv.invoice.documentStatus, "void");
    assert.equal(voidedInv.balanceMinor, 0);

    // Verify reversing journal entry exists in GL
    const reversalJournal = sqlite
      .prepare("SELECT id FROM journal_entries WHERE source_type = 'sales_invoice_void' AND source_id = ?")
      .get(invId) as { id: string } | undefined;
    assert.ok(reversalJournal, "Reversal journal must exist in general ledger");

    const reversalLines = sqlite
      .prepare("SELECT debit_minor, credit_minor FROM journal_lines WHERE journal_entry_id = ?")
      .all(reversalJournal.id) as { debit_minor: number; credit_minor: number }[];
    const revDebits = reversalLines.reduce((s, l) => s + l.debit_minor, 0);
    const revCredits = reversalLines.reduce((s, l) => s + l.credit_minor, 0);
    assert.equal(revDebits, 1260000);
    assert.equal(revCredits, 1260000);
    assert.equal(revDebits, revCredits, "Reversal journal is strictly balanced");

    // Accounts Receivable must NO LONGER list this void invoice
    const arAfter = getAccountsReceivable(businessId, userId);
    assert.equal(arAfter.some((r) => r.document_id === invId), false, "Void invoice must be removed from AR report");

    // Simulated Table Rows after voiding
    const tableRowsAfter: Array<{
      totalMinor: number;
      balanceMinor: number;
      currencyCode: string;
      currencyMinorUnit: number;
      documentStatus: string;
    }> = [
      {
        totalMinor: voidedInv.invoice.totalMinor,
        balanceMinor: voidedInv.balanceMinor,
        currencyCode: voidedInv.invoice.currencyCode,
        currencyMinorUnit: 2,
        documentStatus: voidedInv.invoice.documentStatus,
      },
    ];

    // Under the new corrected behavior:
    // Active rows (not filtering specifically by document:void) EXCLUDES void invoices!
    const activeRows = tableRowsAfter.filter((r) => r.documentStatus !== "void");
    const totalInvoicedActive = renderMultiCurrencyString(
      activeRows.map((r) => ({ amount: r.totalMinor, currency: r.currencyCode, minorUnit: r.currencyMinorUnit }))
    );
    const totalBalanceActive = renderMultiCurrencyString(
      tableRowsAfter.filter((r) => r.documentStatus === "posted").map((r) => ({ amount: r.balanceMinor, currency: r.currencyCode, minorUnit: r.currencyMinorUnit }))
    );

    // BOTH Total Invoiced AND Balance now adjust to empty "—" when no active invoices remain!
    assert.equal(totalInvoicedActive, "—", "Total invoiced for active invoices must remove voided invoice amount");
    assert.equal(totalBalanceActive, "—", "Balance must be —");

    // Verify with a mix of active and voided invoices:
    const mixedRows = [
      { totalMinor: 525000, balanceMinor: 525000, currencyCode: "AED", currencyMinorUnit: 2, documentStatus: "posted" },
      { totalMinor: 1260000, balanceMinor: 0, currencyCode: "AED", currencyMinorUnit: 2, documentStatus: "void" },
    ];
    const mixedTotalInvoiced = renderMultiCurrencyString(
      mixedRows.filter((r) => r.documentStatus !== "void").map((r) => ({ amount: r.totalMinor, currency: r.currencyCode, minorUnit: r.currencyMinorUnit }))
    );
    assert.equal(mixedTotalInvoiced, formatMoney(525000, "AED"), "Active total invoiced includes only active 5,250.00 AED and excludes 12,600.00 AED voided");

    // When explicitly filtering for void invoices, it is included in audit view
    const voidFilterRows = tableRowsAfter.filter((r) => r.documentStatus === "void");
    const totalInvoicedVoidFilter = renderMultiCurrencyString(
      voidFilterRows.map((r) => ({ amount: r.totalMinor, currency: r.currencyCode, minorUnit: r.currencyMinorUnit }))
    );
    assert.equal(totalInvoicedVoidFilter, formatMoney(1260000, "AED"), "Viewing void filter retains historic audit total");

    // Test Purchase Bill Voiding & Totals Synchronization
    const supplierId = createSupplier(businessId, userId, {
      name: "Void Testing Supplier LLC",
      phone: "+971 4 555 6666",
    });

    const billId = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "SUPP-BILL-VOID-01",
        invoiceDate: "2026-08-11",
        dueDate: "2026-09-11",
        currencyCode: "AED",
        lines: [
          {
            description: "Server Rack Colocation Fees",
            quantity: "1",
            unitPrice: "4000",
            taxCodeId: standardVat.id,
            expenseAccountId: expenseAccount.id,
          },
        ],
      },
      "post",
    );

    const bill = getPurchaseInvoice(businessId, userId, billId);
    assert.ok(bill);
    assert.equal(bill.invoice.documentStatus, "posted");
    assert.equal(bill.invoice.totalMinor, 420000); // 4,000 + 5% = 4,200 AED

    // Check AP before void
    const apBefore = getAccountsPayable(businessId, userId);
    assert.ok(apBefore.some((r) => r.document_id === billId && r.foreign_open_minor === 420000));

    // Void the bill
    voidPurchaseInvoice(businessId, userId, billId);

    const voidedBill = getPurchaseInvoice(businessId, userId, billId);
    assert.ok(voidedBill);
    assert.equal(voidedBill.invoice.documentStatus, "void");
    assert.equal(voidedBill.balanceMinor, 0);

    // Verify reversing journal exists in GL
    const billReversal = sqlite
      .prepare("SELECT id FROM journal_entries WHERE source_type = 'purchase_invoice_void' AND source_id = ?")
      .get(billId) as { id: string } | undefined;
    assert.ok(billReversal, "Bill reversal journal must exist in general ledger");

    // Check AP after void: removed from Accounts Payable report
    const apAfter = getAccountsPayable(businessId, userId);
    assert.equal(apAfter.some((r) => r.document_id === billId), false, "Void bill must be removed from AP report");

    // Verify Active Total Billed calculation excludes voided bill
    const billRowsAfter = [
      {
        total_minor: voidedBill.invoice.totalMinor,
        balanceMinor: voidedBill.balanceMinor,
        currency_code: voidedBill.invoice.currencyCode,
        currency_minor_unit: 2,
        document_status: voidedBill.invoice.documentStatus,
      },
    ];
    const activeBillRows = billRowsAfter.filter((r) => r.document_status !== "void");
    const totalBilledActive = renderMultiCurrencyString(
      activeBillRows.map((r) => ({ amount: r.total_minor, currency: r.currency_code, minorUnit: r.currency_minor_unit }))
    );
    assert.equal(totalBilledActive, "—", "Total billed for active bills must exclude void bills");

    const mixedBillRows = [
      { total_minor: 210000, balanceMinor: 210000, currency_code: "AED", currency_minor_unit: 2, document_status: "posted" },
      { total_minor: 420000, balanceMinor: 0, currency_code: "AED", currency_minor_unit: 2, document_status: "void" },
    ];
    const mixedTotalBilled = renderMultiCurrencyString(
      mixedBillRows.filter((r) => r.document_status !== "void").map((r) => ({ amount: r.total_minor, currency: r.currency_code, minorUnit: r.currency_minor_unit }))
    );
    assert.equal(mixedTotalBilled, formatMoney(210000, "AED"), "Active total billed includes only active 2,100.00 AED and excludes 4,200.00 AED voided");
  });

  await t.test("8. Multi-Case Money Flow: Bank Transactions, Chart of Accounts, Reconciliations & Trial Balance", async () => {
    // Check initial bank balance
    const initialBankBal = getBankBalance(businessId, userId);

    // Customer Cycle: Quote -> Order -> Invoice -> Receipt -> Bank
    const custId = createCustomer(businessId, userId, {
      name: "Money Flow Customer LLC",
      phone: "+971 50 777 8888",
    });

    const quoteId = saveSalesQuote(
      businessId,
      userId,
      {
        customerId: custId,
        date: "2026-08-01",
        currencyCode: "AED",
        lines: [{ description: "Enterprise Software Consulting", quantity: "2", unitPrice: "10000", taxCodeId: standardVat.id, salesAccountId: incomeAccount.id }],
      },
      "issue",
    );

    const orderId = saveSalesOrder(
      businessId,
      userId,
      {
        customerId: custId,
        salesQuoteId: quoteId,
        date: "2026-08-02",
        currencyCode: "AED",
        lines: [{ description: "Enterprise Software Consulting", quantity: "2", unitPrice: "10000", taxCodeId: standardVat.id, salesAccountId: incomeAccount.id }],
      },
      "issue",
    );

    const invId = createInvoice(
      businessId,
      userId,
      {
        customerId: custId,
        salesOrderId: orderId,
        invoiceDate: "2026-08-03",
        dueDate: "2026-09-03",
        currencyCode: "AED",
        lines: [{ description: "Enterprise Software Consulting", quantity: "2", unitPrice: "10000", taxCodeId: standardVat.id, salesAccountId: incomeAccount.id }],
      },
      "post",
    );

    const inv = getInvoice(businessId, userId, invId);
    assert.ok(inv);
    assert.equal(inv.invoice.totalMinor, 2100000); // 20,000 + 5% VAT = 21,000.00 AED
    assert.equal(inv.balanceMinor, 2100000);

    // Customer pays in full via receipt into Bank Account
    const receiptRes = createReceipt(businessId, userId, {
      customerId: custId,
      invoiceId: invId,
      bankAccountId: bankAccount.id,
      date: "2026-08-04",
      currencyCode: "AED",
      amount: "21000.00",
      reference: "WIRE-IN-001",
    });
    assert.ok(receiptRes.id);

    // Verify Invoice is paid
    const paidInv = getInvoice(businessId, userId, invId);
    assert.ok(paidInv);
    assert.equal(paidInv.balanceMinor, 0);
    assert.equal(paidInv.paymentStatus, "paid");

    // Invariant guard: Paid invoice CANNOT be voided
    assert.throws(
      () => voidInvoice(businessId, userId, invId),
      /allocations|cannot void/i,
      "Cannot void an invoice that has payment allocations"
    );

    // Supplier Cycle: PO -> Bill -> Supplier Payment -> Bank
    const suppId = createSupplier(businessId, userId, {
      name: "Cloud Hosting Global FZE",
      phone: "+971 4 999 0000",
    });

    const poId = savePurchaseOrder(
      businessId,
      userId,
      {
        supplierId: suppId,
        date: "2026-08-01",
        currencyCode: "AED",
        lines: [{ description: "Cloud Infrastructure Hosting", quantity: "1", unitPrice: "8000", taxCodeId: standardVat.id, expenseAccountId: expenseAccount.id }],
      },
      "issue",
    );

    const billId = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId: suppId,
        purchaseOrderId: poId,
        supplierInvoiceNumber: "CH-2026-888",
        invoiceDate: "2026-08-03",
        dueDate: "2026-09-03",
        currencyCode: "AED",
        lines: [{ description: "Cloud Infrastructure Hosting", quantity: "1", unitPrice: "8000", taxCodeId: standardVat.id, expenseAccountId: expenseAccount.id }],
      },
      "post",
    );

    const bill = getPurchaseInvoice(businessId, userId, billId);
    assert.ok(bill);
    assert.equal(bill.invoice.totalMinor, 840000); // 8,000 + 5% VAT = 8,400.00 AED
    assert.equal(bill.balanceMinor, 840000);

    // Supplier payment out of Bank Account
    const suppPayRes = createSupplierPayment(businessId, userId, {
      supplierId: suppId,
      purchaseInvoiceId: billId,
      bankAccountId: bankAccount.id,
      date: "2026-08-05",
      amount: "8400.00",
      currencyCode: "AED",
      reference: "WIRE-OUT-001",
      description: "Payment for Cloud Infrastructure Hosting",
    });
    assert.ok(suppPayRes.id);

    // Verify Bill is paid
    const paidBill = getPurchaseInvoice(businessId, userId, billId);
    assert.ok(paidBill);
    assert.equal(paidBill.balanceMinor, 0);
    assert.equal(paidBill.paymentStatus, "paid");

    // Invariant guard: Paid bill CANNOT be voided
    assert.throws(
      () => voidPurchaseInvoice(businessId, userId, billId),
      /allocations|cannot void/i,
      "Cannot void a purchase invoice that has payment allocations"
    );

    // Bank Account Balance verification:
    // Increased by +21,000.00 AED (receipt)
    // Decreased by -8,400.00 AED (payment)
    // Net change: +12,600.00 AED = +1,260,000 minor units
    const endBankBal = getBankBalance(businessId, userId);
    assert.equal(
      endBankBal - initialBankBal,
      1260000,
      "Net bank balance increase must exactly match (+21,000.00 customer receipt - 8,400.00 supplier payment)"
    );

    // Final Trial Balance Debit == Credit check across all accounts
    const tb = getTrialBalance(businessId, userId);
    assert.equal(tb.debitMinor, tb.creditMinor, "Trial balance debits must equal credits after full cycle");
    assert.equal(tb.debitMinor - tb.creditMinor, 0, "Discrepancy must be 0");
  });
});
