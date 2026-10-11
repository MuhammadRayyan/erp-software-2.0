import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-settings-test-")),
  BETTER_AUTH_SECRET: "settings-test-secret-123456",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { getSystemDb } = await import("../src/core/db/system");
const { businesses } = await import("../src/core/db/system-schema");
const { eq } = await import("drizzle-orm");
const {
  getBusinessProfile,
  updateBusinessProfile,
  updateLocalization,
} = await import("../src/modules/business-profile/business-profile-service");
const {
  allocateNumber,
} = await import("../src/modules/accounting/services/numbering-service");
const {
  getAccountingSettings,
  updateInvoiceNumbering,
} = await import("../src/modules/accounting/services/accounting-settings-service");
const {
  getFormDefaults,
  saveFormDefaults,
  isFormType,
} = await import("../src/modules/form-defaults/form-defaults-service");
const { formatDate } = await import("../src/core/format");
const {
  templateSettingsSchema,
  defaultSettings,
} = await import("../src/modules/document-templates/template-settings");
const {
  getTemplateSettings,
  saveTemplateSettings,
} = await import("../src/modules/document-templates/template-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, adminId);

test("migration 25 installs business_profile table and extra numbering columns", () => {
  const table = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'business_profile'")
    .get();
  assert.ok(table, "business_profile table should exist");

  const cols = (sqlite.prepare("PRAGMA table_info(business_profile)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes("legal_name"));
  assert.ok(cols.includes("trading_name"));
  assert.ok(cols.includes("tax_id"));
  assert.ok(cols.includes("date_format"));
  assert.ok(cols.includes("time_format"));
  assert.ok(cols.includes("logo_url"));

  const acctCols = (sqlite.prepare("PRAGMA table_info(business_accounting_settings)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(acctCols.includes("debit_note_prefix"));
  assert.ok(acctCols.includes("debit_note_next_number"));
  assert.ok(acctCols.includes("debit_note_padding"));
  assert.ok(acctCols.includes("receipt_padding"));
  assert.ok(acctCols.includes("credit_note_padding"));
  assert.ok(acctCols.includes("journal_padding"));
});

test("business profile service retrieves and updates organization details", () => {
  const initial = getBusinessProfile(businessId, adminId);
  assert.ok(initial);
  assert.equal(initial.id, "default");

  const updated = updateBusinessProfile(businessId, adminId, {
    legalName: "Acme Middle East FZ-LLC",
    tradingName: "Acme MENA",
    companyRegistrationNumber: "DED-987654",
    taxId: "100999888777003",
    email: "finance@acme-mena.ae",
    phone: "+971 4 999 8888",
    website: "https://acme-mena.ae",
    addressLine1: "Level 14, Tower B",
    addressLine2: "Business Bay",
    city: "Dubai",
    stateOrEmirate: "Dubai",
    postalCode: "P.O. Box 54321",
    country: "United Arab Emirates",
    countryCode: "AE",
    logoUrl: "https://acme-mena.ae/branding/logo.png",
  });

  assert.equal(updated.legalName, "Acme Middle East FZ-LLC");
  assert.equal(updated.tradingName, "Acme MENA");
  assert.equal(updated.taxId, "100999888777003");
  assert.equal(updated.city, "Dubai");
  assert.equal(updated.logoUrl, "https://acme-mena.ae/branding/logo.png");

  // Verify synchronization with system business name
  const sysBiz = getSystemDb().select().from(businesses).where(eq(businesses.id, businessId)).get();
  assert.equal(sysBiz?.name, "Acme MENA");

  // Verify synchronization with business_tax_settings TRN
  const taxRow = sqlite.prepare("SELECT trn FROM business_tax_settings WHERE id = 'default'").get() as { trn: string };
  assert.equal(taxRow.trn, "100999888777003");
});

test("localization settings update date format, time format and fiscal year", () => {
  const updated = updateLocalization(businessId, adminId, {
    dateFormat: "YYYY-MM-DD",
    timeFormat: "24h",
    financialYearStartMonth: 4,
  });

  assert.equal(updated.dateFormat, "YYYY-MM-DD");
  assert.equal(updated.timeFormat, "24h");
  assert.equal(updated.financialYearStartMonth, 4);

  // Verify synchronization with system businesses table
  const sysBiz = getSystemDb().select().from(businesses).where(eq(businesses.id, businessId)).get();
  assert.equal(sysBiz?.financialYearStartMonth, 4);
});

test("numbering service allocates debit notes and supports all sequences", () => {
  sqlite.transaction(() => {
    const num1 = allocateNumber(sqlite, "debitNote");
    assert.ok(num1.startsWith("DN-"), `Expected DN- prefix, got ${num1}`);
    const num2 = allocateNumber(sqlite, "debitNote");
    assert.notEqual(num1, num2);
  })();

  const currentSettings = getAccountingSettings(businessId, adminId);
  updateInvoiceNumbering(businessId, adminId, {
    prefix: "INV-",
    nextNumber: 101,
    padding: 5,
    creditNotePrefix: "CN-",
    creditNoteNextNumber: 201,
    creditNotePadding: 4,
    salesQuotePrefix: "QUO-",
    salesQuoteNextNumber: 50,
    salesQuotePadding: 4,
    salesOrderPrefix: "ORD-",
    salesOrderNextNumber: 60,
    salesOrderPadding: 4,
    receiptPrefix: "RC-",
    receiptNextNumber: 301,
    receiptPadding: 5,
    purchaseQuotePrefix: "RFQ-",
    purchaseQuoteNextNumber: 10,
    purchaseQuotePadding: 4,
    purchaseOrderPrefix: "PO-",
    purchaseOrderNextNumber: 401,
    purchaseOrderPadding: 4,
    purchaseInvoicePrefix: "PI-",
    purchaseInvoiceNextNumber: 501,
    purchaseInvoicePadding: 4,
    supplierPaymentPrefix: "PAY-",
    supplierPaymentNextNumber: 601,
    supplierPaymentPadding: 4,
    debitNotePrefix: "DBN-",
    debitNoteNextNumber: 15,
    debitNotePadding: 4,
    projectPrefix: currentSettings.projectPrefix,
    projectNextNumber: currentSettings.projectNextNumber,
    projectPadding: currentSettings.projectPadding,
    goodsReceiptPrefix: currentSettings.goodsReceiptPrefix,
    goodsReceiptNextNumber: currentSettings.goodsReceiptNextNumber,
    goodsReceiptPadding: currentSettings.goodsReceiptPadding,
    deliveryNotePrefix: currentSettings.deliveryNotePrefix,
    deliveryNoteNextNumber: currentSettings.deliveryNoteNextNumber,
    deliveryNotePadding: currentSettings.deliveryNotePadding,
    stockAdjustmentPrefix: currentSettings.stockAdjustmentPrefix,
    stockAdjustmentNextNumber: currentSettings.stockAdjustmentNextNumber,
    stockAdjustmentPadding: currentSettings.stockAdjustmentPadding,
    bankTransactionPrefix: currentSettings.bankTransactionPrefix,
    bankTransactionNextNumber: currentSettings.bankTransactionNextNumber,
    bankTransactionPadding: currentSettings.bankTransactionPadding,
    bankTransferPrefix: currentSettings.bankTransferPrefix,
    bankTransferNextNumber: currentSettings.bankTransferNextNumber,
    bankTransferPadding: currentSettings.bankTransferPadding,
    journalPrefix: "JRN-",
    journalNextNumber: 701,
    journalPadding: 4,
  });

  const refreshed = getAccountingSettings(businessId, adminId);
  assert.equal(refreshed.salesQuotePrefix, "QUO-");
  assert.equal(refreshed.salesOrderPrefix, "ORD-");
  assert.equal(refreshed.debitNotePrefix, "DBN-");
  assert.equal(refreshed.debitNoteNextNumber, 15);
  assert.equal(refreshed.journalPrefix, "JRN-");
  assert.equal(refreshed.journalNextNumber, 701);
});

test("form defaults service handles new form types and fields", () => {
  assert.ok(isFormType("delivery-note"));
  assert.ok(isFormType("goods-receipt"));
  assert.ok(isFormType("stock-adjustment"));

  saveFormDefaults(businessId, adminId, "delivery-note", {
    showDescription: true,
    showLineNumber: true,
    showDiscounts: false,
    showTaxCode: false,
    defaultNotes: "Goods received in good condition.",
  });

  const defaults = getFormDefaults(businessId, adminId, "delivery-note");
  assert.equal(defaults.showDescription, true);
  assert.equal(defaults.showLineNumber, true);
  assert.equal(defaults.showTaxCode, false);
  assert.equal(defaults.defaultNotes, "Goods received in good condition.");
});

test("formatDate supports custom pattern strings", () => {
  const d = "2026-10-15";
  assert.equal(formatDate(d, "YYYY-MM-DD"), "2026-10-15");
  assert.equal(formatDate(d, "DD/MM/YYYY"), "15/10/2026");
  assert.equal(formatDate(d, "MM/DD/YYYY"), "10/15/2026");
  assert.equal(formatDate(d, "DD MMM YYYY"), "15 Oct 2026");
});

test("template settings schema validates layout, colors, and typography", () => {
  // Valid settings pass
  const valid = templateSettingsSchema.parse({
    templateType: "minimal",
    primaryColor: "#059669",
    accentColor: "#10b981",
    fontName: "Roboto",
    fontSize: "small",
    watermarkText: "DRAFT ONLY",
    showSignatureBlock: true,
    signatureLabel: "Managing Director",
  });
  assert.equal(valid.templateType, "minimal");
  assert.equal(valid.primaryColor, "#059669");
  assert.equal(valid.fontName, "Roboto");
  assert.equal(valid.watermarkText, "DRAFT ONLY");

  // Invalid hex color is rejected
  assert.throws(() => {
    templateSettingsSchema.parse({
      primaryColor: "not-a-hex-color",
    });
  });

  // Invalid template type is rejected
  assert.throws(() => {
    templateSettingsSchema.parse({
      templateType: "unknown-layout-type",
    });
  });

  // Invalid font name is rejected
  assert.throws(() => {
    templateSettingsSchema.parse({
      fontName: "Comic Sans",
    });
  });
});

test("unconfigured documents inherit brand styling from sales-invoice master template", () => {
  // Before configuring sales-invoice, unconfigured documents get defaultSettings
  const initialQuoteStyle = getTemplateSettings(businessId, adminId, "sales-quote");
  assert.equal(initialQuoteStyle.primaryColor, defaultSettings.primaryColor);

  // Configure master sales-invoice with custom brand styling
  saveTemplateSettings(businessId, adminId, "sales-invoice", {
    templateType: "classic",
    primaryColor: "#7c3aed",
    accentColor: "#a78bfa",
    fontName: "Lato",
    fontSize: "large",
    headerText: "ACME GLOBAL HOLDINGS - OFFICIAL DOCUMENT",
    watermarkText: "ORIGINAL",
    showSignatureBlock: true,
    signatureLabel: "Chief Financial Officer",
    paymentInstructions: "Bank: First Abu Dhabi Bank | IBAN: AE000000000000000000001",
  });

  // Now, sales-quote, sales-order, and purchase-order without explicit configs inherit the sales-invoice brand!
  const inheritedQuote = getTemplateSettings(businessId, adminId, "sales-quote");
  assert.equal(inheritedQuote.primaryColor, "#7c3aed");
  assert.equal(inheritedQuote.templateType, "classic");
  assert.equal(inheritedQuote.fontName, "Lato");
  assert.equal(inheritedQuote.watermarkText, "ORIGINAL");
  assert.equal(inheritedQuote.signatureLabel, "Chief Financial Officer");

  const inheritedOrder = getTemplateSettings(businessId, adminId, "sales-order");
  assert.equal(inheritedOrder.primaryColor, "#7c3aed");

  const inheritedPO = getTemplateSettings(businessId, adminId, "purchase-order");
  assert.equal(inheritedPO.primaryColor, "#7c3aed");

  // Specific override for purchase-order maintains its own dedicated styling
  saveTemplateSettings(businessId, adminId, "purchase-order", {
    templateType: "minimal",
    primaryColor: "#dc2626",
    fontName: "Inter",
  });

  const customPO = getTemplateSettings(businessId, adminId, "purchase-order");
  assert.equal(customPO.primaryColor, "#dc2626");
  assert.equal(customPO.templateType, "minimal");

  // sales-quote still inherits sales-invoice styling
  const stillInheritedQuote = getTemplateSettings(businessId, adminId, "sales-quote");
  assert.equal(stillInheritedQuote.primaryColor, "#7c3aed");
});

test("document numbering sequence padding handles boundary overflows gracefully", () => {
  // If nextNumber is larger than padding width (e.g. 5 digits with padding 3), it does not truncate
  sqlite.transaction(() => {
    sqlite
      .prepare(`UPDATE business_accounting_settings SET sales_order_next_number = 10050, sales_order_padding = 4 WHERE id = 'default'`)
      .run();
    const allocated = allocateNumber(sqlite, "salesOrder");
    assert.equal(allocated, "ORD-10050");
  })();
});

