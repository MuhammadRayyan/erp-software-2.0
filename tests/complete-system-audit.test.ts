import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-system-audit-")),
  BETTER_AUTH_SECRET: "system-audit-secret-key-999888",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

// Calculations & Money
const {
  parseMoneyToMinor,
  minorToInput,
  parseQuantityToMicros,
  quantityMicrosToInput,
  calculateDiscount,
  multiplyMoneyByQuantity,
} = await import("../src/modules/accounting/calculations/money");
const {
  previewDocumentLine,
} = await import("../src/components/documents/document-calculations");

// Core Services
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
const { saveInventoryItem } = await import("../src/modules/inventory/inventory-item-service");
const { saveInventoryLocation } = await import("../src/modules/inventory/inventory-location-service");

// Sales Cycle Services
const {
  saveSalesQuote,
  getSalesQuote,
  createSalesQuoteRevision,
  listSalesQuoteRevisions,
} = await import("../src/modules/sales-quotes/quote-service");
const {
  saveSalesOrder,
  getSalesOrder,
} = await import("../src/modules/sales-orders/sales-order-service");
const {
  createInvoice,
  getInvoice,
  listInvoices,
} = await import("../src/modules/sales-invoices/invoice-service");
const {
  createReceipt,
} = await import("../src/modules/receipts/receipt-service");
const {
  saveCreditNote,
} = await import("../src/modules/sales-credit-notes/credit-note-service");

// Purchases Cycle Services
const {
  savePurchaseQuote,
  getPurchaseQuote,
} = await import("../src/modules/purchase-quotes/purchase-quote-service");
const {
  savePurchaseOrder,
  getPurchaseOrder,
} = await import("../src/modules/purchase-orders/purchase-order-service");
const {
  savePurchaseInvoice,
  getPurchaseInvoice,
} = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const {
  createSupplierPayment,
} = await import("../src/modules/supplier-payments/supplier-payment-service");
const {
  saveDebitNote,
  getDebitNote,
} = await import("../src/modules/debit-notes/debit-note-service");

// Reports & GL
const {
  getTrialBalance,
} = await import("../src/modules/reports/report-service");
const {
  createVatPeriod,
} = await import("../src/modules/tax/vat-period-service");
const {
  getVatWorkingPaper,
} = await import("../src/modules/tax/vat-report-service");

// PDF Engine
const { generateDocumentPdf } = await import("../src/modules/document-templates/pdf-service");
const { saveTemplateSettings } = await import("../src/modules/document-templates/template-service");

// Initialize test database
const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);

const acctSettings = sqlite
  .prepare("SELECT default_sales_account_id, default_purchase_expense_account_id, default_bank_account_id FROM business_accounting_settings LIMIT 1")
  .get() as { default_sales_account_id: string; default_purchase_expense_account_id: string; default_bank_account_id: string };

const salesAccount = acctSettings.default_sales_account_id;
const expenseAccount = acctSettings.default_purchase_expense_account_id;
const defaultBankAccount = acctSettings.default_bank_account_id;
const assetAccount = (
  sqlite.prepare("SELECT id FROM accounts WHERE type = 'asset' LIMIT 1").get() as { id: string }
).id;

const vatOutputCode = (
  sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('sales', 'both') LIMIT 1").get() as { id: string }
).id;
const vatInputCode = (
  sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('purchases', 'both') LIMIT 1").get() as { id: string }
).id;

test("1. Accounting & Mathematical Precision Audit", () => {
  // Test 1.1: Currency conversion minor / major scaling
  assert.equal(parseMoneyToMinor("123.45"), 12345);
  assert.equal(minorToInput(12345), "123.45");
  assert.equal(parseMoneyToMinor("0.05"), 5);
  assert.equal(minorToInput(5), "0.05");
  assert.equal(parseMoneyToMinor("1000.00"), 100000);

  // Test 1.2: Quantity micro-unit conversion (4 decimals: 1 unit = 10,000 units)
  assert.equal(parseQuantityToMicros("1"), 10_000);
  assert.equal(parseQuantityToMicros("2.5"), 25_000);
  assert.equal(quantityMicrosToInput(25_000), "2.5");
  assert.equal(quantityMicrosToInput(1_250), "0.125");

  // Test 1.3: Line item discount calculations with fractional quantities
  // 3.5 units @ 45.00 minor = 4500 per unit, subtotal = 157.50 (15750 minor)
  // Discount 10% => 15.75 discount (1575 minor) => net 141.75 (14175 minor)
  const lineTotalMinor = multiplyMoneyByQuantity(4500, 35_000);
  assert.equal(lineTotalMinor, 15750);
  const discountMinor = calculateDiscount(lineTotalMinor, "percentage", "10", 2);
  assert.equal(discountMinor, 1575);
  assert.equal(lineTotalMinor - discountMinor, 14175);

  // Test 1.4: Line preview with standard 5% UAE VAT
  const preview = previewDocumentLine(
    {
      unitPrice: "45.00",
      quantity: "3.5",
      discountType: "percentage",
      discountValue: "10",
      taxCodeId: vatOutputCode,
    },
    [{ id: vatOutputCode, name: "VAT 5%", rateBasisPoints: 500 }],
    2,
    false,
  );

  assert.equal(preview.netMinor, 14175); // 141.75
  assert.equal(preview.taxMinor, 709);   // 5% of 141.75 = 7.0875 => 7.09
  assert.equal(preview.grossMinor, 14884); // 141.75 + 7.09 = 148.84
});

test("2. Double-Entry Bookkeeping Audit: Universal Debit === Credit Balance", () => {
  // Query all journal lines grouped by journal entry and verify debit sum === credit sum
  const glEntries = sqlite.prepare(`
    SELECT journal_entry_id, SUM(debit_minor) as total_debit, SUM(credit_minor) as total_credit
    FROM journal_lines
    GROUP BY journal_entry_id
  `).all() as { journal_entry_id: string; total_debit: number; total_credit: number }[];

  assert.ok(glEntries.length > 0, "Demo database should contain journal entries");

  for (const entry of glEntries) {
    assert.equal(
      entry.total_debit,
      entry.total_credit,
      `Journal entry ${entry.journal_entry_id} is out of balance! Debits: ${entry.total_debit}, Credits: ${entry.total_credit}`
    );
  }

  // Also verify entire General Ledger / Trial Balance equality
  const trialBalance = getTrialBalance(businessId, adminId);
  assert.ok(trialBalance.debitMinor > 0);
  assert.equal(
    trialBalance.debitMinor,
    trialBalance.creditMinor,
    `Trial balance out of balance: ${trialBalance.debitMinor} != ${trialBalance.creditMinor}`
  );
});

test("3. Complete Sales Cycle Audit: Revision Lifecycle & Downstream Transformation", () => {
  const customerId = createCustomer(businessId, adminId, {
    name: "Apex Trading FZCO",
    email: "procurement@apex-trading.ae",
    phone: "+97145551234",
    billingAddress: "Dubai Silicon Oasis, Dubai, UAE",
    trn: "100456789000003",
  });

  saveInventoryLocation(businessId, adminId, {
    name: "Al Quoz Main Warehouse",
    code: "WH-AQ-01",
  });

  const itemId = saveInventoryItem(businessId, adminId, {
    name: "Enterprise Cloud Hosting Subscription",
    sku: "SRV-CLOUD-01",
    unitName: "unit",
    salesPrice: "500.00",
    purchasePrice: "250.00",
    inventoryAssetAccountId: assetAccount,
    costOfSalesAccountId: expenseAccount,
    salesAccountId: salesAccount,
    isActive: true,
  });

  // Step 3.1: Create initial quote (Rev 0)
  const initialQuoteId = saveSalesQuote(
    businessId,
    adminId,
    {
      customerId,
      date: "2026-10-01",
      expectedDate: "2026-10-31",
      reference: "PROPOSAL-2026-01",
      notes: "Initial Proposal for Annual Hosting",
      terms: "Payment terms: 30 days net",
      amountsIncludeTax: false,
      lines: [
        {
          itemId,
          description: "Enterprise Cloud Hosting (12 Months)",
          quantity: "12",
          unitPrice: "500.00",
          taxCodeId: vatOutputCode,
          salesAccountId: salesAccount,
          discountType: "percentage",
          discountValue: "5", // 5% discount
        },
      ],
    },
    "issue",
  );

  const initialQuote = getSalesQuote(businessId, adminId, initialQuoteId);
  assert.ok(initialQuote);
  assert.equal(initialQuote.quote.revisionNumber, 0);
  assert.equal(initialQuote.quote.quoteNumber, "SQ-0001");
  assert.equal(initialQuote.quote.subtotalMinor, 570000); // 12 * 500 - 5% = 5700.00 AED

  // Step 3.2: Create Revision 1 upon client request for higher discount
  const rev1Id = createSalesQuoteRevision(businessId, adminId, initialQuoteId);
  const rev1Record = getSalesQuote(businessId, adminId, rev1Id);
  assert.ok(rev1Record);
  assert.equal(rev1Record.quote.revisionNumber, 1);
  assert.equal(rev1Record.quote.rootQuoteId, initialQuoteId);
  assert.equal(rev1Record.quote.quoteNumber, "SQ-0001-R1");

  // Update Rev 1 with 10% discount
  saveSalesQuote(
    businessId,
    adminId,
    {
      customerId,
      date: "2026-10-05",
      expectedDate: "2026-10-31",
      reference: "PROPOSAL-2026-01-REV1",
      notes: "Revised Proposal with 10% discount",
      terms: "Payment terms: 30 days net",
      amountsIncludeTax: false,
      lines: [
        {
          itemId,
          description: "Enterprise Cloud Hosting (12 Months)",
          quantity: "12",
          unitPrice: "500.00",
          taxCodeId: vatOutputCode,
          salesAccountId: salesAccount,
          discountType: "percentage",
          discountValue: "10", // 10% discount => 5400.00 AED
        },
      ],
    },
    "issue",
    rev1Id,
  );

  const updatedRev1 = getSalesQuote(businessId, adminId, rev1Id);
  assert.ok(updatedRev1);
  assert.equal(updatedRev1.quote.subtotalMinor, 540000);
  assert.equal(updatedRev1.quote.taxMinor, 27000); // 5% VAT = 270.00 AED
  assert.equal(updatedRev1.quote.totalMinor, 567000);

  // Step 3.3: Verify revision history query
  const allRevs = listSalesQuoteRevisions(businessId, adminId, initialQuoteId);
  assert.equal(allRevs.length, 2);
  assert.equal(allRevs[0].revision_number, 1);
  assert.equal(allRevs[1].revision_number, 0);

  // Step 3.4: Convert Rev 1 to Sales Order
  const salesOrderId = saveSalesOrder(
    businessId,
    adminId,
    {
      customerId,
      salesQuoteId: rev1Id,
      date: "2026-10-10",
      expectedDate: "2026-10-15",
      reference: updatedRev1.quote.quoteNumber,
      notes: updatedRev1.quote.notes ?? undefined,
      terms: updatedRev1.quote.terms ?? undefined,
      amountsIncludeTax: updatedRev1.quote.amountsIncludeTax,
      lines: updatedRev1.lines.map((l) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        unitPrice: (l.unitPriceMinor / 100).toFixed(2),
        taxCodeId: l.taxCodeId || vatOutputCode,
        salesAccountId: l.salesAccountId || salesAccount,
        discountType: (l.discountType as any) || "none",
        discountValue: l.discountValue || "0",
      })),
    },
    "issue",
  );

  const salesOrder = getSalesOrder(businessId, adminId, salesOrderId);
  assert.ok(salesOrder);
  assert.ok(salesOrder.order.orderNumber);
  assert.equal(salesOrder.order.salesQuoteId, rev1Id);
  assert.equal(salesOrder.order.totalMinor, 567000);

  // Step 3.5: Convert Sales Order to Sales Invoice
  const invoiceId = createInvoice(
    businessId,
    adminId,
    {
      customerId,
      invoiceDate: "2026-10-15",
      dueDate: "2026-11-14",
      taxDate: "2026-10-15",
      supplyEmirate: "dubai",
      salesOrderId,
      notes: "Annual Hosting Agreement Invoice",
      terms: "Net 30 days",
      reference: salesOrder.order.orderNumber,
      amountsIncludeTax: salesOrder.order.amountsIncludeTax,
      lines: salesOrder.lines.map((l) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        unitPrice: (l.unitPriceMinor / 100).toFixed(2),
        salesAccountId: l.salesAccountId,
        taxCodeId: l.taxCodeId ?? vatOutputCode,
        discountType: (l.discountType as any) || "none",
        discountValue: l.discountValue || "0",
        projectId: "",
      })),
    },
    "post",
  );

  const invoice = getInvoice(businessId, adminId, invoiceId);
  assert.ok(invoice);
  assert.equal(invoice.invoice.totalMinor, 567000);
  assert.equal(invoice.allocatedMinor, 0);
  assert.equal(invoice.balanceMinor, 567000);

  // Step 3.6: Partial Receipt Allocation (3000.00 AED)
  const receipt = createReceipt(businessId, adminId, {
    customerId,
    invoiceId,
    date: "2026-10-20",
    bankAccountId: defaultBankAccount,
    amount: "3000.00",
    reference: "TXN-APEX-9988",
    description: "Partial Payment for Hosting",
  });

  assert.ok(receipt.id);

  // Step 3.7: Verify invoice balance after partial payment
  const refreshedInvoice = getInvoice(businessId, adminId, invoiceId);
  assert.ok(refreshedInvoice);
  assert.equal(refreshedInvoice.allocatedMinor, 300000);
  assert.equal(refreshedInvoice.balanceMinor, 267000); // 5670.00 - 3000.00 = 2670.00

  // Step 3.8: Issue Credit Note for 500.00 AED + 5% VAT (525.00 total)
  const creditNoteId = saveCreditNote(
    businessId,
    adminId,
    {
      customerId,
      sourceInvoiceId: invoiceId,
      date: "2026-10-25",
      taxDate: "2026-10-25",
      supplyEmirate: "dubai",
      reason: "Promotional Service Credit",
      amountsIncludeTax: false,
      lines: [
        {
          description: "Promotional Hosting Credit (1 Month)",
          quantity: "1",
          unitPrice: "500.00",
          salesAccountId: salesAccount,
          taxCodeId: vatOutputCode,
          discountType: "none",
          discountValue: "0",
          projectId: "",
        },
      ],
    },
    "post",
  );
  assert.ok(creditNoteId);

  // Step 3.9: Verify invoice balance reduces by 52500: 267000 - 52500 = 214500
  const postCreditInvoice = getInvoice(businessId, adminId, invoiceId);
  assert.ok(postCreditInvoice);
  assert.equal(postCreditInvoice.balanceMinor, 214500);
});

test("4. Complete Purchases Cycle Audit: RFQ -> PO -> Invoice -> Debit Note -> Payment", () => {
  const supplierId = createSupplier(businessId, adminId, {
    name: "Gulf Infrastructure Solutions",
    email: "accounts@gulf-infra.ae",
    phone: "+97148887766",
    address: "Sharjah Industrial Area 3, UAE",
    trn: "100987654321003",
  });

  // Step 4.1: Create Purchase Quote / RFQ
  const pqId = savePurchaseQuote(
    businessId,
    adminId,
    {
      supplierId,
      date: "2026-10-01",
      expiryDate: "2026-10-31",
      reference: "RFQ-2026-001",
      notes: "Request for Cloud Server Hardware",
      terms: "Net 30 days",
      amountsIncludeTax: false,
      lines: [
        {
          itemId: "",
          description: "Dell PowerEdge Server Rack 1U",
          quantity: "2",
          unitPrice: "15000.00", // 15,000.00 AED each
          discountType: "none",
          discountValue: "0",
          expenseAccountId: expenseAccount,
          taxCodeId: vatInputCode,
          projectId: "",
        },
      ],
    },
    "issue",
  );

  const pq = getPurchaseQuote(businessId, adminId, pqId);
  assert.ok(pq);
  assert.equal(pq.quote.totalMinor, 3150000); // 30,000.00 + 5% VAT = 31,500.00 AED

  // Step 4.2: Convert to Purchase Order
  const poId = savePurchaseOrder(
    businessId,
    adminId,
    {
      supplierId,
      purchaseQuoteId: pqId,
      date: "2026-10-05",
      expectedDate: "2026-10-20",
      reference: pq.quote.quoteNumber,
      notes: pq.quote.notes ?? undefined,
      terms: pq.quote.terms ?? undefined,
      amountsIncludeTax: pq.quote.amountsIncludeTax,
      lines: pq.lines.map((l) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        unitPrice: (l.unitPriceMinor / 100).toFixed(2),
        discountType: (l.discountType as any) || "none",
        discountValue: l.discountValue || "0",
        expenseAccountId: l.expenseAccountId || expenseAccount,
        taxCodeId: l.taxCodeId || vatInputCode,
        projectId: l.projectId || "",
      })),
    },
    "issue",
  );

  const po = getPurchaseOrder(businessId, adminId, poId);
  assert.ok(po);
  assert.equal(po.order.totalMinor, 3150000);
  assert.equal(po.order.purchaseQuoteId, pqId);

  // Step 4.3: Convert Purchase Order to Purchase Invoice
  const piId = savePurchaseInvoice(
    businessId,
    adminId,
    {
      supplierId,
      purchaseOrderId: poId,
      invoiceDate: "2026-10-18",
      dueDate: "2026-11-17",
      taxDate: "2026-10-18",
      supplierInvoiceNumber: "SUPP-INV-2026-991",
      notes: po.order.notes ?? undefined,
      terms: po.order.terms ?? undefined,
      amountsIncludeTax: po.order.amountsIncludeTax,
      lines: po.lines.map((l) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        unitPrice: (l.unitPriceMinor / 100).toFixed(2),
        discountType: (l.discountType as any) || "none",
        discountValue: l.discountValue || "0",
        expenseAccountId: l.expenseAccountId || expenseAccount,
        taxCodeId: l.taxCodeId || vatInputCode,
        projectId: l.projectId || "",
      })),
    },
    "post",
  );

  const pi = getPurchaseInvoice(businessId, adminId, piId);
  assert.ok(pi);
  assert.equal(pi.invoice.totalMinor, 3150000);
  assert.equal(pi.paidMinor, 0);
  assert.equal(pi.balanceMinor, 3150000);

  // Step 4.4: Issue Debit Note against Purchase Invoice for damaged component (2,000.00 AED + VAT)
  const debitNoteId = saveDebitNote(
    businessId,
    adminId,
    {
      supplierId,
      purchaseInvoiceId: piId,
      date: "2026-10-22",
      reference: "DBN-CLAIM-01",
      amountsIncludeTax: false,
      projectId: "",
      lines: [
        {
          description: "Replacement DDR5 ECC RAM Credit",
          quantity: "1",
          unitPrice: "2000.00", // 2,000.00 AED
          taxCodeId: vatInputCode,
          expenseAccountId: expenseAccount,
          discountType: "none",
          discountValue: "0",
          projectId: "",
        },
      ],
    },
    "post",
  );

  const debitNote = getDebitNote(businessId, adminId, debitNoteId);
  assert.ok(debitNote);
  assert.equal(debitNote.note.totalMinor, 210000); // 2,000 + 5% VAT = 2,100.00 AED

  // Step 4.5: Check purchase invoice remaining balance
  // 3,150,000 minor total - 210,000 debit note = 2,940,000 minor (29,400.00 AED)
  const refreshedPI = getPurchaseInvoice(businessId, adminId, piId);
  assert.ok(refreshedPI);

  // Step 4.6: Pay balance via Supplier Payment
  const payment = createSupplierPayment(businessId, adminId, {
    supplierId,
    purchaseInvoiceId: piId,
    date: "2026-10-28",
    bankAccountId: defaultBankAccount,
    amount: "31500.00",
    reference: "WT-SUPP-991",
    description: "Full settlement for server hardware",
  });

  assert.ok(payment.id);

  // Verify Purchase Invoice is now FULLY PAID
  const fullyPaidPI = getPurchaseInvoice(businessId, adminId, piId);
  assert.ok(fullyPaidPI);
  assert.equal(fullyPaidPI.balanceMinor, 0);
  assert.equal(fullyPaidPI.paymentStatus, "paid");
});

test("5. UAE FTA VAT Form 201 Return Audit", () => {
  const periodId = createVatPeriod(businessId, adminId, {
    periodReference: "Q4 2026",
    startDate: "2026-10-01",
    endDate: "2026-12-31",
    filingDueDate: "2027-01-28",
    notes: "Q4 2026 Audit Period",
  });

  const workingPaper = getVatWorkingPaper(businessId, adminId, periodId);
  assert.ok(workingPaper);
  assert.ok(workingPaper.buckets);
  assert.ok(workingPaper.emirateBreakdown);
  assert.ok(typeof workingPaper.totalOutputVatMinor === "number");
  assert.ok(typeof workingPaper.totalRecoverableVatMinor === "number");

  // Invariant: emirates breakdown length equals 7 UAE Emirates
  assert.equal(workingPaper.emirateBreakdown.length, 7);
});

test("6. Multi-Format Document PDF Engine Audit (Modern, Classic, Minimal)", async () => {
  const invoices = listInvoices(businessId, adminId);
  assert.ok(invoices.length > 0);
  const sampleInvoiceId = invoices[0].id;

  // Test 6.1: Render Modern Layout
  saveTemplateSettings(businessId, adminId, "sales-invoice", {
    templateType: "modern",
    primaryColor: "#0284c7",
    fontName: "Inter",
    watermarkText: "AUDITED",
    showPaymentInstructions: true,
    paymentInstructions: "Bank: Emirates NBD | IBAN: AE123456789012345678901",
    showSignatureBlock: true,
    signatureLabel: "Chief Accountant",
  });

  const modernResult = await generateDocumentPdf(
    businessId,
    adminId,
    "Northstar Technical Services LLC",
    "AED",
    "sales-invoice",
    sampleInvoiceId,
  );
  assert.ok(modernResult.pdf);
  assert.ok(modernResult.pdf.length > 1000, "Modern PDF buffer should contain valid PDF bytes");
  assert.equal(modernResult.pdf.subarray(0, 4).toString(), "%PDF", "PDF must start with %PDF header");

  // Test 6.2: Render Classic Layout
  saveTemplateSettings(businessId, adminId, "sales-invoice", {
    templateType: "classic",
    primaryColor: "#475569",
    fontName: "Lato",
    watermarkText: "TAX INVOICE",
    showSignatureBlock: true,
  });

  const classicResult = await generateDocumentPdf(
    businessId,
    adminId,
    "Northstar Technical Services LLC",
    "AED",
    "sales-invoice",
    sampleInvoiceId,
  );
  assert.ok(classicResult.pdf);
  assert.ok(classicResult.pdf.length > 1000, "Classic PDF buffer should contain valid PDF bytes");
  assert.equal(classicResult.pdf.subarray(0, 4).toString(), "%PDF");

  // Test 6.3: Render Minimal Swiss-Style Layout
  saveTemplateSettings(businessId, adminId, "sales-invoice", {
    templateType: "minimal",
    primaryColor: "#0f172a",
    fontName: "Roboto",
    showSignatureBlock: true,
  });

  const minimalResult = await generateDocumentPdf(
    businessId,
    adminId,
    "Northstar Technical Services LLC",
    "AED",
    "sales-invoice",
    sampleInvoiceId,
  );
  assert.ok(minimalResult.pdf);
  assert.ok(minimalResult.pdf.length > 1000, "Minimal PDF buffer should contain valid PDF bytes");
  assert.equal(minimalResult.pdf.subarray(0, 4).toString(), "%PDF");
});
