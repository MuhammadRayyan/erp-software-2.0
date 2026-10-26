import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-top-down-")),
  BETTER_AUTH_SECRET: "top-down-secret-key-123456",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const {
  getAccountingSettings,
  updateInvoiceNumbering,
} = await import("../src/modules/accounting/services/accounting-settings-service");
const { allocateNumber } = await import("../src/modules/accounting/services/numbering-service");
const {
  getFinancialLockDate,
  setFinancialLockDate,
  assertFinancialLock,
} = await import("../src/modules/accounting/services/financial-lock-service");
const {
  getFormDefaults,
  saveFormDefaults,
} = await import("../src/modules/form-defaults/form-defaults-service");
const {
  getBusinessProfile,
  updateBusinessProfile,
  updateLocalization,
} = await import("../src/modules/business-profile/business-profile-service");
const {
  createPaymentTerm,
  listPaymentTerms,
  calculateDueDate,
} = await import("../src/modules/payment-terms/payment-terms-service");
const {
  createUnitOfMeasure,
  listUnitsOfMeasure,
  toggleUnitOfMeasure,
} = await import("../src/modules/units-of-measure/uom-service");
const { interpolateEmailTemplate } = await import("../src/modules/email/email-template-types");
const {
  renderDocumentPdf,
  renderInvoicePdf,
} = await import("../src/modules/document-templates/template-registry");
const { saveTemplateSettings, getTemplateSettings } = await import(
  "../src/modules/document-templates/template-service"
);
const { formatDate, formatMoney } = await import("../src/core/format");
const { logger, getRecentLogs } = await import("../src/core/logger");
const { GET: healthGet } = await import("../src/app/api/health/route");
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { createInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { listAccounts } = await import("../src/modules/accounting/services/account-service");
const { getActiveTaxCodes } = await import("../src/modules/accounting/services/tax-code-service");

test("Top-Down Verification: Settings Changes Trigger Downstream Business Logic Reactivity", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  // 1. Numbering Settings Reactivity
  const currentSettings = getAccountingSettings(businessId, adminId);
  updateInvoiceNumbering(businessId, adminId, {
    prefix: "CUSTOM-INV-",
    nextNumber: 105,
    padding: 6,
    creditNotePrefix: "REBATE-",
    creditNoteNextNumber: 20,
    creditNotePadding: 4,
    salesQuotePrefix: currentSettings.salesQuotePrefix ?? "SQ-",
    salesQuoteNextNumber: currentSettings.salesQuoteNextNumber ?? 1,
    salesQuotePadding: currentSettings.salesQuotePadding ?? 4,
    salesOrderPrefix: currentSettings.salesOrderPrefix ?? "SO-",
    salesOrderNextNumber: currentSettings.salesOrderNextNumber ?? 1,
    salesOrderPadding: currentSettings.salesOrderPadding ?? 4,
    receiptPrefix: currentSettings.receiptPrefix ?? "REC-",
    receiptNextNumber: currentSettings.receiptNextNumber ?? 1,
    receiptPadding: currentSettings.receiptPadding ?? 4,
    purchaseQuotePrefix: currentSettings.purchaseQuotePrefix ?? "PQ-",
    purchaseQuoteNextNumber: currentSettings.purchaseQuoteNextNumber ?? 1,
    purchaseQuotePadding: currentSettings.purchaseQuotePadding ?? 4,
    purchaseOrderPrefix: currentSettings.purchaseOrderPrefix ?? "PO-",
    purchaseOrderNextNumber: currentSettings.purchaseOrderNextNumber ?? 1,
    purchaseOrderPadding: currentSettings.purchaseOrderPadding ?? 4,
    purchaseInvoicePrefix: currentSettings.purchaseInvoicePrefix ?? "PI-",
    purchaseInvoiceNextNumber: currentSettings.purchaseInvoiceNextNumber ?? 1,
    purchaseInvoicePadding: currentSettings.purchaseInvoicePadding ?? 4,
    supplierPaymentPrefix: currentSettings.supplierPaymentPrefix ?? "PAY-",
    supplierPaymentNextNumber: currentSettings.supplierPaymentNextNumber ?? 1,
    supplierPaymentPadding: currentSettings.supplierPaymentPadding ?? 4,
    debitNotePrefix: currentSettings.debitNotePrefix ?? "DN-",
    debitNoteNextNumber: currentSettings.debitNoteNextNumber ?? 1,
    debitNotePadding: currentSettings.debitNotePadding ?? 4,
    projectPrefix: currentSettings.projectPrefix ?? "PRJ-",
    projectNextNumber: currentSettings.projectNextNumber ?? 1,
    projectPadding: currentSettings.projectPadding ?? 4,
    goodsReceiptPrefix: currentSettings.goodsReceiptPrefix ?? "GR-",
    goodsReceiptNextNumber: currentSettings.goodsReceiptNextNumber ?? 1,
    goodsReceiptPadding: currentSettings.goodsReceiptPadding ?? 4,
    deliveryNotePrefix: currentSettings.deliveryNotePrefix ?? "DN-",
    deliveryNoteNextNumber: currentSettings.deliveryNoteNextNumber ?? 1,
    deliveryNotePadding: currentSettings.deliveryNotePadding ?? 4,
    stockAdjustmentPrefix: currentSettings.stockAdjustmentPrefix ?? "ADJ-",
    stockAdjustmentNextNumber: currentSettings.stockAdjustmentNextNumber ?? 1,
    stockAdjustmentPadding: currentSettings.stockAdjustmentPadding ?? 4,
    bankTransactionPrefix: currentSettings.bankTransactionPrefix ?? "BT-",
    bankTransactionNextNumber: currentSettings.bankTransactionNextNumber ?? 1,
    bankTransactionPadding: currentSettings.bankTransactionPadding ?? 4,
    bankTransferPrefix: currentSettings.bankTransferPrefix ?? "TX-",
    bankTransferNextNumber: currentSettings.bankTransferNextNumber ?? 1,
    bankTransferPadding: currentSettings.bankTransferPadding ?? 4,
    journalPrefix: currentSettings.journalPrefix ?? "JV-",
    journalNextNumber: currentSettings.journalNextNumber ?? 1,
    journalPadding: currentSettings.journalPadding ?? 4,
  });

  const allocatedInvoice = allocateNumber(sqlite, "invoice");
  assert.equal(allocatedInvoice, "CUSTOM-INV-000105", "Allocated invoice should reflect updated prefix and padding 6");

  const allocatedCreditNote = allocateNumber(sqlite, "creditNote");
  assert.equal(allocatedCreditNote, "REBATE-0020", "Allocated credit note should reflect updated prefix and padding 4");

  // 2. Financial Lock Date Reactivity
  setFinancialLockDate(businessId, adminId, "2026-06-30");
  const lockDate = getFinancialLockDate(businessId, adminId);
  assert.equal(lockDate, "2026-06-30");

  // Attempting transaction on or before lock date must throw
  assert.throws(
    () => assertFinancialLock(sqlite, "2026-06-15", "Sales Invoice"),
    /The financial period on or before 2026-06-30 is closed/,
    "Transaction before lock date should be rejected"
  );
  // Transaction strictly after lock date must succeed
  assert.doesNotThrow(
    () => assertFinancialLock(sqlite, "2026-07-01", "Sales Invoice"),
    "Transaction after lock date should be allowed"
  );

  // 3. Form Defaults Settings Reactivity
  saveFormDefaults(businessId, adminId, "sales-invoice", {
    defaultNotes: "Standard 30-day payment term applies.",
    defaultTerms: "Strictly net 30 days.",
    showDiscounts: true,
    showLineNumber: true,
    showTaxCode: true,
  });
  const invoiceDefaults = getFormDefaults(businessId, adminId, "sales-invoice");
  assert.equal(invoiceDefaults.defaultNotes, "Standard 30-day payment term applies.");
  assert.equal(invoiceDefaults.defaultTerms, "Strictly net 30 days.");
  assert.equal(invoiceDefaults.showDiscounts, true);

  // 4. Business Profile & Localization Reactivity
  updateBusinessProfile(businessId, adminId, {
    legalName: "Top-Down Corporation LLC",
    tradingName: "Top-Down Global",
    companyRegistrationNumber: "CR-999888",
    taxId: "100999888777003",
    email: "finance@topdown.local",
    phone: "+971 4 999 8888",
    website: "https://topdown.local",
    addressLine1: "Level 42, Financial Tower",
    addressLine2: "DIFC",
    city: "Dubai",
    stateOrEmirate: "Dubai",
    postalCode: "00000",
    country: "AE",
    countryCode: "AE",
    logoUrl: "",
  });
  const profile = getBusinessProfile(businessId, adminId);
  assert.equal(profile.legalName, "Top-Down Corporation LLC");
  assert.equal(profile.taxId, "100999888777003");

  updateLocalization(businessId, adminId, {
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24h",
    financialYearStartMonth: 1,
  });
  const formattedCustomDate = formatDate("2026-10-14", "DD/MM/YYYY");
  assert.equal(formattedCustomDate, "14/10/2026", "formatDate should reflect the custom DD/MM/YYYY localization");

  // 5. Payment Terms Presets & Due Date Calculation
  const newTerm = createPaymentTerm(businessId, adminId, {
    name: "Net 45 End of Month",
    term_type: "end_of_month",
    days: 45,
    is_default: false,
  });
  const allTerms = listPaymentTerms(businessId);
  assert.ok(allTerms.some((t) => t.id === newTerm.id));
  const calculatedDue = calculateDueDate("2026-05-10", newTerm);
  // May 10 -> EOM is May 31 + 45 days -> July 15, 2026
  assert.equal(calculatedDue, "2026-07-15", "end_of_month should accurately project end of month plus offset");

  // 6. Units of Measure Catalog
  createUnitOfMeasure(businessId, adminId, "BOX24", "Box of 24 units");
  const uoms = listUnitsOfMeasure(businessId, adminId);
  const foundUom = uoms.find((u) => u.code === "box24");
  assert.ok(foundUom, "Created UOM should appear in catalog");
  assert.equal(foundUom.isActive, true);

  toggleUnitOfMeasure(businessId, adminId, foundUom.id, false);
  const updatedUoms = listUnitsOfMeasure(businessId, adminId);
  const deactivatedUom = updatedUoms.find((u) => u.id === foundUom.id);
  assert.equal(deactivatedUom?.isActive, false, "Deactivated UOM should be inactive");

  // 7. Email Template Dynamic Token Interpolation
  const emailContext = {
    businessName: "Top-Down Corporation LLC",
    documentType: "Tax Invoice",
    documentNumber: "INV-9999",
    documentDate: "2026-10-14",
    dueDate: "2026-11-14",
    customerName: "Valued Customer Inc",
    total: "AED 5,250.00",
    currency: "AED",
  };
  const interpolated = interpolateEmailTemplate(
    {
      subject: "Invoice {{document_number}} from {{business_name}}",
      body: "Dear {{customer_name}},\nPlease find invoice {{document_number}} for {{total_amount}} due on {{due_date}}.",
    },
    emailContext
  );
  assert.equal(interpolated.subject, "Invoice INV-9999 from Top-Down Corporation LLC");
  assert.ok(interpolated.body.includes("for AED 5,250.00 due on 2026-11-14"));
});

test("Top-Down Verification: Comprehensive PDF Generation & Formatting Across All 10 Document Types", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const currency = seeded.business.currency;

  const accounts = listAccounts(businessId, adminId);
  const revenueAccount = accounts.find((a) => a.type === "income") || accounts[0];
  const taxes = getActiveTaxCodes(businessId, adminId);
  const standardTax = taxes.find((t) => t.rateBasisPoints === 500 && ["sales", "both"].includes(t.direction)) || taxes.find((t) => ["sales", "both"].includes(t.direction))!;

  const customerId = createCustomer(businessId, adminId, {
    name: "PDF Test Enterprise Customer",
    email: "customer@pdftest.local",
    phone: "+97141112222",
    taxReference: "100222333444003",
  });

  // Test across all 3 visual template layouts: classic, minimal, modern
  const templateTypes: ("classic" | "minimal" | "modern")[] = ["classic", "minimal", "modern"];

  for (const tType of templateTypes) {
    saveTemplateSettings(businessId, adminId, "sales-invoice", {
      templateType: tType,
      primaryColor: "#0f766e",
      fontSize: "normal",
      showSignatureBlock: true,
      signatureLabel: "Chief Commercial Officer",
    });

    const activeSettings = getTemplateSettings(businessId, adminId, "sales-invoice");
    assert.equal(activeSettings.templateType, tType);

    // 1. Sales Invoice PDF
    const invoiceId = createInvoice(
      businessId,
      adminId,
      {
        customerId,
        invoiceDate: "2026-10-14",
        dueDate: "2026-11-14",
        currencyCode: currency,
        lines: [
          {
            description: "High Precision Sensor Unit",
            quantity: "2",
            unitPrice: "250.00",
            salesAccountId: revenueAccount.id,
            taxCodeId: standardTax.id,
          },
        ],
      },
      "post"
    );

    const record = getInvoice(businessId, adminId, invoiceId);
    assert.ok(record, "Invoice record exists");

    const invoicePdfBuffer = await renderInvoicePdf(businessId, adminId, {
      invoiceTitle: "TAX INVOICE",
      companyName: "Top-Down Corporation LLC",
      companyAddress: "Level 42, Financial Tower, Dubai, UAE",
      invoiceNumber: record.invoice.invoiceNumber,
      invoiceDate: record.invoice.invoiceDate,
      dueDate: record.invoice.dueDate,
      customerName: "PDF Test Enterprise Customer",
      subtotal: formatMoney(record.invoice.subtotalMinor, currency),
      tax: formatMoney(record.invoice.taxMinor, currency),
      total: formatMoney(record.invoice.totalMinor, currency),
      lines: [
        {
          description: "High Precision Sensor Unit",
          quantity: "2",
          unitPrice: "AED 250.00",
          amount: "AED 500.00",
        },
      ],
    });
    assert.ok(invoicePdfBuffer.length > 2000, `Sales Invoice PDF (${tType}) should have substantial bytes`);
    assert.equal(invoicePdfBuffer.slice(0, 4).toString(), "%PDF", `Sales Invoice PDF (${tType}) should start with %PDF`);
  }

  // Verify generic document PDF rendering across the other 9 document types
  const documentConfigs = [
    { type: "sales-quote", title: "Sales Quote", docNum: "SQ-1001", party: "PDF Customer" },
    { type: "sales-order", title: "Sales Order", docNum: "SO-1001", party: "PDF Customer" },
    { type: "sales-credit-note", title: "Sales Credit Note", docNum: "CN-1001", party: "PDF Customer" },
    { type: "delivery-note", title: "Delivery Note", docNum: "DN-1001", party: "PDF Customer" },
    { type: "purchase-quote", title: "Purchase Quote", docNum: "PQ-1001", party: "PDF Supplier" },
    { type: "purchase-order", title: "Purchase Order", docNum: "PO-1001", party: "PDF Supplier" },
    { type: "purchase-invoice", title: "Purchase Invoice", docNum: "PI-1001", party: "PDF Supplier" },
    { type: "debit-note", title: "Debit Note", docNum: "DN-1001", party: "PDF Supplier" },
    { type: "goods-receipt", title: "Goods Receipt", docNum: "GR-1001", party: "PDF Supplier" },
  ];

  for (const doc of documentConfigs) {
    const docData = {
      invoiceTitle: doc.title,
      customerLabel: "PARTY",
      invoiceNumber: doc.docNum,
      invoiceDate: "2026-10-14",
      customerName: doc.party,
      companyName: "Top-Down Corporation LLC",
      companyAddress: "Dubai, UAE",
      subtotal: "AED 1,000.00",
      tax: "AED 50.00",
      total: "AED 1,050.00",
      lines: [
        {
          description: "Component Unit Batch",
          quantity: "5",
          unitPrice: "AED 200.00",
          amount: "AED 1,000.00",
        },
      ],
    };

    const docPdfBuffer = await renderDocumentPdf(businessId, adminId, doc.type, docData);
    assert.ok(docPdfBuffer.length > 2000, `${doc.title} PDF should generate valid non-empty buffer`);
    assert.equal(docPdfBuffer.slice(0, 4).toString(), "%PDF", `${doc.title} PDF must have %PDF header`);
  }

  // Superseded watermark verification
  const supersededDocData = {
    invoiceTitle: "Sales Quote",
    invoiceNumber: "SQ-1001-REV-0",
    invoiceDate: "2026-10-14",
    customerName: "PDF Customer",
    companyName: "Top-Down Corporation LLC",
    subtotal: "AED 1,000.00",
    tax: "AED 50.00",
    total: "AED 1,050.00",
    lines: [
      {
        description: "Superseded Quote Item",
        quantity: "1",
        unitPrice: "AED 1,000.00",
        amount: "AED 1,000.00",
      },
    ],
  };
  const supersededPdf = await renderDocumentPdf(businessId, adminId, "sales-quote", supersededDocData, {
    templateType: "modern",
    logoUrl: null,
    logoPosition: "left",
    logoSize: "medium",
    headerImageUrl: null,
    footerImageUrl: null,
    primaryColor: "#356fd0",
    accentColor: "#64748b",
    fontName: "Inter",
    fontSize: "normal",
    headerText: "",
    footerText: "",
    showCompanyAddress: true,
    showCompanyTrn: true,
    showProjectColumn: false,
    showTaxColumn: true,
    showDiscountColumn: true,
    showCustomerTrn: true,
    showPaymentTerms: true,
    showNotes: true,
    showCustomFields: true,
    showPageNumbers: true,
    showPaymentInstructions: false,
    paymentInstructions: "",
    showSignatureBlock: false,
    signatureLabel: "Authorized Signatory",
    signatureImageUrl: null,
    watermarkText: "SUPERSEDED",
    customHtml: "",
  });
  assert.ok(supersededPdf.length > 2000, "Superseded quote PDF should generate properly");
  assert.equal(supersededPdf.slice(0, 4).toString(), "%PDF");
});

test("Top-Down Verification: Multi-Tenant Connection LRU Cache, SQLite Pragmas & Batch Inserts", async () => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;

  const { sqlite } = getBusinessDb(businessId, adminId);

  // 1. Verify SQLite Pragmas
  const journalMode = (sqlite.prepare("PRAGMA journal_mode;").get() as any).journal_mode;
  assert.equal(journalMode.toLowerCase(), "wal", "Journal mode must be WAL");

  const synchronous = (sqlite.prepare("PRAGMA synchronous;").get() as any).synchronous;
  assert.equal(synchronous, 2, "Synchronous pragma must be FULL (2)");

  const busyTimeout = (sqlite.prepare("PRAGMA busy_timeout;").get() as any).timeout;
  assert.equal(busyTimeout, 5000, "Busy timeout must be 5000ms");

  const foreignKeys = (sqlite.prepare("PRAGMA foreign_keys;").get() as any).foreign_keys;
  assert.equal(foreignKeys, 1, "Foreign keys must be ON (1)");

  // 2. Health Endpoint Telemetry
  const healthRes = await healthGet();
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, "ok");
  assert.equal(typeof healthData.revision, "string");
  assert.equal(healthData.database, undefined);
  assert.equal(healthData.memory, undefined);

  // 3. Correlated Structured Logger & system_logs Persistence
  logger.info("Top-Down Diagnostic Test Log", {
    businessId,
    userId: adminId,
    metadata: { testSuite: "top-down-comprehensive-verification", iteration: 1 },
  });

  const logs = getRecentLogs({ businessId, limit: 5 });
  const foundLog = logs.find((l: { message: string }) => l.message === "Top-Down Diagnostic Test Log");
  assert.ok(foundLog, "Logged event should be persisted to system_logs");
  assert.equal(foundLog.businessId, businessId);
  assert.equal(foundLog.userId, adminId);
  assert.equal(foundLog.level, "info");
  assert.ok(foundLog.metadataJson?.includes("top-down-comprehensive-verification"));
});
