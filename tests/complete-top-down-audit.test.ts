import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-complete-top-down-audit-")),
  BETTER_AUTH_SECRET: "top-down-audit-secret-2026-xyz",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createBusiness } = await import("../src/core/businesses/business-service");

// Accounting Settings & Setup
const { createAccount, listAccounts } = await import("../src/modules/accounting/services/account-service");
const { getOpeningBalances, saveOpeningBalances } = await import("../src/modules/accounting/services/opening-balances-service");
const { setFinancialLockDate, getFinancialLockDate } = await import("../src/modules/accounting/services/financial-lock-service");
const { auth } = await import("../src/core/auth/auth");
const {
  getBusinessProfile,
  updateBusinessProfile,
  updateLocalization,
} = await import("../src/modules/business-profile/business-profile-service");
const { upsertPreferences, listPreferences } = await import("../src/modules/preferences/preference-service");
const { getTemplateSettings, saveTemplateSettings } = await import("../src/modules/document-templates/template-service");
const { getFormDefaults, saveFormDefaults } = await import("../src/modules/form-defaults/form-defaults-service");
const { createPaymentTerm } = await import("../src/modules/payment-terms/payment-terms-service");
const { createUnitOfMeasure } = await import("../src/modules/units-of-measure/uom-service");
const {
  createCustomFieldDefinition,
  saveCustomFieldValues,
  getCustomFieldValuesForEntities,
} = await import("../src/modules/custom-fields/custom-field-service");

// Master Entities
const { createCustomer } = await import("../src/modules/customers/customer-service");
const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
const { createProject } = await import("../src/modules/projects/project-service");
const { saveInventoryLocation } = await import("../src/modules/inventory/inventory-location-service");
const { saveInventoryItem } = await import("../src/modules/inventory/inventory-item-service");

// Sales Commercial Cycle
const {
  saveSalesQuote,
  getSalesQuote,
  createSalesQuoteRevision,
  listSalesQuoteRevisions,
} = await import("../src/modules/sales-quotes/quote-service");
const { saveSalesOrder, getSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
const { createInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { createReceipt } = await import("../src/modules/receipts/receipt-service");
const { saveCreditNote } = await import("../src/modules/sales-credit-notes/credit-note-service");

// Purchases Commercial Cycle & Inventory Operations
const { savePurchaseQuote, getPurchaseQuote } = await import("../src/modules/purchase-quotes/purchase-quote-service");
const { savePurchaseOrder, getPurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");
const { saveGoodsReceipt } = await import("../src/modules/inventory/goods-receipt-service");
const { getStockOnHandReport } = await import("../src/modules/inventory/inventory-report-service");
const { savePurchaseInvoice, getPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { createSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
const { saveDebitNote } = await import("../src/modules/debit-notes/debit-note-service");

// Banking Rules & Categorization
const { saveBankAccount } = await import("../src/modules/banking/bank-account-service");
const {
  createBankRule,
  listBankRules,
  findMatchingBankRule,
  applyBankRule,
} = await import("../src/modules/banking/bank-rule-service");
const { importBankStatement, listStatementLines } = await import("../src/modules/banking/statement-service");
const { getBankTransaction } = await import("../src/modules/banking/bank-transaction-service");

// UAE HR & Payroll
const {
  saveEmployee,
  generateBatchPayslips,
  getPayslipWithLines,
} = await import("../src/modules/payroll/services/payroll-service");
const { calculateUaeEosb } = await import("../src/modules/payroll/services/eosb-calculator");

// Financial Reporting
const {
  getTrialBalance,
  getProfitAndLoss,
  getGeneralLedger,
} = await import("../src/modules/reports/report-service");
const { getCashFlowForecast } = await import("../src/modules/reports/cash-flow-forecast-service");
const { getVatTransactionDetail } = await import("../src/modules/tax/vat-report-service");
const { listActivityLogs } = await import("../src/modules/activity-log/activity-log-service");
const { quantityMicrosToInput } = await import("../src/modules/accounting/calculations/money");

test("Complete Top-Down ERP Architecture, Workflow & Financial Audit", async (suite) => {
  // Bootstrap base test user and seed
  const seeded = await seedDemoData();
  const userId = seeded.admin.id;

  // Create isolated enterprise business
  const business = createBusiness(
    {
      name: "Apex Vanguard Enterprise LLC",
      country: "United Arab Emirates",
      currency: "AED",
      financialYearStartMonth: 1,
    },
    userId,
  );
  const businessId = business.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  // Retrieve base accounts and tax codes
  const vat5Output = (
    sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('sales', 'both') LIMIT 1").get() as { id: string }
  ).id;

  const vat5Input = (
    sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('purchases', 'both') LIMIT 1").get() as { id: string }
  ).id;

  // Create Bank Account mapped to default Bank asset account
  const bankLedger = sqlite
    .prepare("SELECT id FROM accounts WHERE type = 'asset' AND subtype = 'bank' LIMIT 1")
    .get() as { id: string };

  const bankAccId = saveBankAccount(businessId, userId, {
    name: "Apex Corporate Main Bank",
    currencyCode: "AED",
    ledgerAccountId: bankLedger.id,
    isCashAccount: false,
    isActive: true,
  });

  const bankAccount = { id: bankAccId, ledger_account_id: bankLedger.id };

  // Track key entities across stages
  let customExpenseAccountId = "";
  let customIncomeAccountId = "";
  let customAssetAccountId = "";
  let customerId = "";
  let supplierId = "";
  let projectId = "";
  let locationId = "";
  let itemId = "";
  let customFieldDefId = "";
  let salesInvoiceId = "";
  let purchaseInvoiceId = "";

  // --------------------------------------------------------------------------
  // Phase 0: User Authentication, Credential Verification & Session Validation
  // --------------------------------------------------------------------------
  await suite.test("Phase 0: User Authentication, Session Validation & Security Guard", async () => {
    // 0.1 Successful Login with Seeded Admin Credentials
    const loginResult = await auth.api.signInEmail({
      body: {
        email: seeded.admin.email,
        password: "demo12345",
      },
    });
    assert.ok(loginResult, "Login should succeed for seeded admin");
    assert.equal(loginResult.user.id, userId);
    assert.equal(loginResult.user.email, seeded.admin.email);
    assert.ok(loginResult.token, "Auth session token must be generated");

    // 0.2 Failed Login with Invalid Password Rejection
    await assert.rejects(
      async () => {
        await auth.api.signInEmail({
          body: {
            email: seeded.admin.email,
            password: "wrong-password-999",
          },
        });
      },
      (err: unknown) => {
        assert.ok(err, "Must reject invalid credentials");
        return true;
      },
    );

    // 0.3 Session Verification in Database and via Session Lookup
    const loginRes = await auth.api.signInEmail({
      body: {
        email: seeded.admin.email,
        password: "demo12345",
      },
      asResponse: true,
    });
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    assert.ok(setCookie.includes("better-auth.session_token"));

    const sessionCheck = await auth.api.getSession({
      headers: new Headers({
        cookie: setCookie,
      }),
    });
    assert.ok(sessionCheck?.session, "Session must resolve from authenticated cookies");
    assert.equal(sessionCheck?.user.id, userId);
  });

  // --------------------------------------------------------------------------
  // Phase 0.5: Business Profile, Localization & UI Display Settings Customization
  // --------------------------------------------------------------------------
  await suite.test("Phase 0.5: Business Profile, Localization & UI Display Settings Customization", () => {
    // 0.5.1 Business Profile Customization
    const profile = updateBusinessProfile(businessId, userId, {
      legalName: "Apex Vanguard Enterprise PJSC",
      tradingName: "Apex Technologies Group",
      companyRegistrationNumber: "AE-DXB-987654",
      taxId: "100987654321003",
      email: "finance@apexvanguard.ae",
      phone: "+971 4 999 8888",
      website: "https://apexvanguard.ae",
      addressLine1: "Level 42, Al Saada Commercial Tower",
      addressLine2: "Trade Centre 1",
      city: "Dubai",
      stateOrEmirate: "Dubai",
      postalCode: "12345",
      country: "United Arab Emirates",
      countryCode: "AE",
      logoUrl: "",
    });
    assert.equal(profile.legalName, "Apex Vanguard Enterprise PJSC");
    assert.equal(profile.tradingName, "Apex Technologies Group");
    assert.equal(profile.taxId, "100987654321003");
    assert.equal(profile.city, "Dubai");

    const fetchedProfile = getBusinessProfile(businessId, userId);
    assert.equal(fetchedProfile.legalName, "Apex Vanguard Enterprise PJSC");
    assert.equal(fetchedProfile.companyRegistrationNumber, "AE-DXB-987654");

    // 0.5.2 Localization Preferences Customization
    const localized = updateLocalization(businessId, userId, {
      dateFormat: "DD MMM YYYY",
      timeFormat: "24h",
      financialYearStartMonth: 1,
    });
    assert.equal(localized.dateFormat, "DD MMM YYYY");
    assert.equal(localized.timeFormat, "24h");

    // 0.5.3 User Display Preferences & Density Settings
    upsertPreferences(businessId, userId, {
      density: "compact",
      "overview.range": "month",
      "overview-cards": JSON.stringify(["sales", "expenses", "net-income"]),
    });
    const prefs = listPreferences(businessId, userId);
    assert.equal(prefs.density, "compact");
    assert.equal(prefs["overview.range"], "month");

    // 0.5.4 Document Template Settings
    saveTemplateSettings(businessId, userId, "sales-invoice", {
      templateType: "modern",
      primaryColor: "#1e3a8a",
      accentColor: "#3b82f6",
      headerText: "Official Tax Invoice · Apex Vanguard Group",
      footerText: "Thank you for partnering with Apex Technologies.",
      showCompanyTrn: true,
      showTaxColumn: true,
      showDiscountColumn: true,
    });
    const tpl = getTemplateSettings(businessId, userId, "sales-invoice");
    assert.equal(tpl.primaryColor, "#1e3a8a");
    assert.equal(tpl.headerText, "Official Tax Invoice · Apex Vanguard Group");

    // 0.5.5 Form Defaults Configuration
    saveFormDefaults(businessId, userId, "sales-invoice", {
      amountsIncludeTax: false,
      showDiscounts: true,
      showTaxCode: true,
      defaultPaymentTermsDays: 45,
      defaultNotes: "Standard commercial contract terms apply.",
    });
    const defaults = getFormDefaults(businessId, userId, "sales-invoice");
    assert.equal(defaults.amountsIncludeTax, false);
    assert.equal(defaults.defaultPaymentTermsDays, 45);
    assert.equal(defaults.showDiscounts, true);
  });

  // --------------------------------------------------------------------------
  // Phase 1: Accounting Customization, Chart of Accounts & Opening Balances
  // --------------------------------------------------------------------------
  await suite.test("Phase 1: Custom Accounts Creation and Opening Balances Equilibrium", () => {
    // 1.1 Create custom expense account
    createAccount(businessId, userId, {
      name: "Cloud Hosting & Subscriptions",
      type: "expense",
      subtype: "operating_expense",
      isActive: true,
    });
    // 1.2 Create custom income account
    createAccount(businessId, userId, {
      name: "Cloud Advisory & Architecture",
      type: "income",
      subtype: "sales",
      isActive: true,
    });
    // 1.3 Create custom fixed asset account
    createAccount(businessId, userId, {
      name: "Datacenter Hardware Appliance",
      type: "asset",
      subtype: "fixed_asset",
      isActive: true,
    });

    const accounts = listAccounts(businessId, userId);
    const expAcc = accounts.find((a) => a.name === "Cloud Hosting & Subscriptions");
    const incAcc = accounts.find((a) => a.name === "Cloud Advisory & Architecture");
    const assetAcc = accounts.find((a) => a.name === "Datacenter Hardware Appliance");
    const equityAcc = accounts.find((a) => a.type === "equity");

    assert.ok(expAcc);
    assert.ok(incAcc);
    assert.ok(assetAcc);
    assert.ok(equityAcc);

    customExpenseAccountId = expAcc.id;
    customIncomeAccountId = incAcc.id;
    customAssetAccountId = assetAcc.id;

    // 1.4 Post Opening Balances as of 2026-01-01
    // Bank Ledger: 500,000 AED debit (50,000,000 minor)
    // Datacenter Hardware: 100,000 AED debit (10,000,000 minor)
    // Equity: 600,000 AED credit (60,000,000 minor)
    saveOpeningBalances(businessId, userId, "2026-01-01", [
      { accountId: bankAccount.ledger_account_id, debitMinor: 50_000_000, creditMinor: 0 },
      { accountId: customAssetAccountId, debitMinor: 10_000_000, creditMinor: 0 },
      { accountId: equityAcc.id, debitMinor: 0, creditMinor: 60_000_000 },
    ]);

    const opBalances = getOpeningBalances(businessId, userId);
    assert.equal(opBalances.totalDebitsMinor, 60_000_000);
    assert.equal(opBalances.totalCreditsMinor, 60_000_000);
    assert.equal(opBalances.differenceMinor, 0);

    // Verify Trial Balance immediately after opening balances
    const tb = getTrialBalance(businessId, userId, "2026-01-01");
    assert.equal(tb.debitMinor, 60_000_000);
    assert.equal(tb.creditMinor, 60_000_000);
    assert.equal(tb.debitMinor, tb.creditMinor, "Opening balance Trial Balance must balance");
  });

  // --------------------------------------------------------------------------
  // Phase 2: Master Data Setup (UOM, Terms, Custom Fields, Entities, Inventory)
  // --------------------------------------------------------------------------
  await suite.test("Phase 2: Master Setup - Payment Terms, UOM, Custom Fields & Master Entities", () => {
    // 2.1 Payment Term
    const term = createPaymentTerm(businessId, userId, {
      name: "Net 45 Days",
      days: 45,
      is_default: false,
    });
    assert.ok(term.id);

    // 2.2 Unit of Measure
    createUnitOfMeasure(businessId, userId, "titan-hr", "Consulting Hours");

    // 2.3 Custom Field Definition on Sales Invoices
    customFieldDefId = createCustomFieldDefinition(businessId, userId, {
      entityType: "sales_invoice",
      name: "Client Purchase Order Ref",
      fieldType: "text",
      isRequired: false,
      showInList: true,
    });
    assert.ok(customFieldDefId);

    // 2.4 Project
    projectId = createProject(businessId, userId, {
      name: "Project Titan Migration",
      code: "TITAN-01",
      customerId: "",
      status: "active",
    });
    assert.ok(projectId);

    // 2.5 Customer
    customerId = createCustomer(businessId, userId, {
      name: "Global Sovereign Systems FZCO",
      email: "finance@globalsovereign.ae",
      trn: "100200300400003",
      billingAddress: "DIFC Gate Tower 4, Dubai, UAE",
    });
    assert.ok(customerId);

    // 2.6 Supplier
    supplierId = createSupplier(businessId, userId, {
      name: "Nordic Data Systems AB",
      email: "accounts@nordicdata.se",
      trn: "100900800700003",
    });
    assert.ok(supplierId);

    // 2.7 Inventory Location
    locationId = saveInventoryLocation(businessId, userId, {
      name: "Dubai Silicon Oasis Logistics Center",
      code: "LOC-DSO-01",
    });
    assert.ok(locationId);

    // 2.8 Inventory Item
    itemId = saveInventoryItem(businessId, userId, {
      name: "Enterprise Blade Server Titan",
      sku: "BLADE-TITAN-X1",
      unitName: "unit",
      salesPrice: "18000.00",
      purchasePrice: "11000.00",
      salesAccountId: customIncomeAccountId,
      costOfSalesAccountId: customExpenseAccountId,
      inventoryAssetAccountId: customAssetAccountId,
      isActive: true,
    });
    assert.ok(itemId);
  });

  // --------------------------------------------------------------------------
  // Phase 3: Sales Commercial Cycle (Quote -> Revision -> Order -> Invoice -> Receipt -> Credit Note)
  // --------------------------------------------------------------------------
  await suite.test("Phase 3: Sales Cycle - Multi-Line Quote, Revision, Order, Invoice, Custom Fields & Allocations", () => {
    // 3.1 Initial Quote (Rev 0)
    // Line 1: Consulting (40 hrs @ 500 AED = 20,000 AED + 5% VAT)
    // Line 2: Server Blade (2 units @ 18,000 AED = 36,000 AED + 5% VAT)
    const initialQuoteId = saveSalesQuote(
      businessId,
      userId,
      {
        customerId,
        projectId,
        date: "2026-06-01",
        expectedDate: "2026-06-30",
        reference: "QUOTE-TITAN-INITIAL",
        notes: "Architecture and Hardware rollout",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Enterprise Architecture Consulting",
            quantity: "40",
            unitPrice: "500.00",
            salesAccountId: customIncomeAccountId,
            taxCodeId: vat5Output,
            discountType: "none",
            discountValue: "0",
            projectId,
          },
          {
            itemId,
            description: "Enterprise Blade Server Titan",
            quantity: "2",
            unitPrice: "18000.00",
            salesAccountId: customIncomeAccountId,
            taxCodeId: vat5Output,
            discountType: "none",
            discountValue: "0",
            projectId,
          },
        ],
      },
      "issue",
    );

    const q0 = getSalesQuote(businessId, userId, initialQuoteId);
    assert.ok(q0);
    assert.equal(q0.quote.revisionNumber, 0);
    assert.equal(q0.quote.subtotalMinor, 56_000_00);
    assert.equal(q0.quote.taxMinor, 2_800_00); // 5% of 56,000 = 2,800
    assert.equal(q0.quote.totalMinor, 58_800_00);

    // 3.2 Quote Revision 1: Add 10% negotiated discount on Consulting
    const rev1QuoteId = createSalesQuoteRevision(businessId, userId, initialQuoteId);
    saveSalesQuote(
      businessId,
      userId,
      {
        customerId,
        projectId,
        date: "2026-06-03",
        expectedDate: "2026-06-30",
        reference: "QUOTE-TITAN-REV1",
        notes: "Approved 10% discount on consulting services",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Enterprise Architecture Consulting",
            quantity: "40",
            unitPrice: "500.00",
            salesAccountId: customIncomeAccountId,
            taxCodeId: vat5Output,
            discountType: "percentage",
            discountValue: "10", // 20,000 - 2,000 = 18,000
            projectId,
          },
          {
            itemId,
            description: "Enterprise Blade Server Titan",
            quantity: "2",
            unitPrice: "18000.00",
            salesAccountId: customIncomeAccountId,
            taxCodeId: vat5Output,
            discountType: "none",
            discountValue: "0",
            projectId,
          },
        ],
      },
      "issue",
      rev1QuoteId,
    );

    const q1 = getSalesQuote(businessId, userId, rev1QuoteId);
    assert.ok(q1);
    assert.equal(q1.quote.revisionNumber, 1);
    // Subtotal: 18,000 + 36,000 = 54,000 AED
    assert.equal(q1.quote.subtotalMinor, 54_000_00);
    assert.equal(q1.quote.taxMinor, 2_700_00); // 5% of 54,000 = 2,700
    assert.equal(q1.quote.totalMinor, 56_700_00);

    const revs = listSalesQuoteRevisions(businessId, userId, initialQuoteId);
    assert.equal(revs.length, 2);

    // 3.3 Create Sales Order from Rev 1
    const salesOrderId = saveSalesOrder(
      businessId,
      userId,
      {
        customerId,
        projectId,
        salesQuoteId: rev1QuoteId,
        date: "2026-06-04",
        expectedDate: "2026-06-25",
        reference: "SO-TITAN-REV1",
        amountsIncludeTax: false,
        lines: q1.lines.map((l) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          salesAccountId: l.salesAccountId || customIncomeAccountId,
          taxCodeId: l.taxCodeId || vat5Output,
          discountType: l.discountType as "percentage" | "fixed" | "none",
          discountValue: l.discountValue || "0",
          projectId,
        })),
      },
      "issue",
    );

    const so = getSalesOrder(businessId, userId, salesOrderId);
    assert.ok(so);
    assert.equal(so.order.totalMinor, 56_700_00);

    // 3.4 Convert to Sales Invoice and attach Custom Field Value
    salesInvoiceId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        projectId,
        salesOrderId,
        invoiceDate: "2026-06-05",
        taxDate: "2026-06-05",
        dueDate: "2026-07-20",
        reference: "INV-TITAN-001",
        amountsIncludeTax: false,
        lines: so.lines.map((l) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          salesAccountId: l.salesAccountId || customIncomeAccountId,
          taxCodeId: l.taxCodeId || vat5Output,
          discountType: l.discountType as "percentage" | "fixed" | "none",
          discountValue: l.discountValue || "0",
          projectId,
        })),
      },
      "post",
    );

    assert.ok(salesInvoiceId);
    const invoiceRecord = getInvoice(businessId, userId, salesInvoiceId);
    assert.ok(invoiceRecord);
    assert.equal(invoiceRecord.invoice.documentStatus, "posted");
    assert.equal(invoiceRecord.invoice.totalMinor, 56_700_00);
    assert.equal(invoiceRecord.balanceMinor, 56_700_00);

    // Save Custom Field Value
    saveCustomFieldValues(businessId, userId, "sales_invoice", salesInvoiceId, {
      [customFieldDefId]: "PO-CLIENT-SOVEREIGN-999",
    });

    const cfValues = getCustomFieldValuesForEntities(businessId, userId, "sales_invoice", [salesInvoiceId]);
    assert.equal(cfValues.get(salesInvoiceId)?.[customFieldDefId], "PO-CLIENT-SOVEREIGN-999");

    // Verify GL entries for Invoice
    const invoiceGl = sqlite
      .prepare("SELECT * FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?")
      .get(salesInvoiceId) as { id: string; status: string };
    assert.ok(invoiceGl);
    assert.equal(invoiceGl.status, "posted");

    const glLines = sqlite
      .prepare("SELECT * FROM journal_lines WHERE journal_entry_id = ?")
      .all(invoiceGl.id) as { debit_minor: number; credit_minor: number }[];
    const totalDebit = glLines.reduce((sum, l) => sum + l.debit_minor, 0);
    const totalCredit = glLines.reduce((sum, l) => sum + l.credit_minor, 0);
    assert.equal(totalDebit, 56_700_00);
    assert.equal(totalCredit, 56_700_00);

    // 3.5 Customer Payment (Receipt) of 30,000 AED
    const receipt = createReceipt(businessId, userId, {
      customerId,
      invoiceId: salesInvoiceId,
      bankAccountId: bankAccount.ledger_account_id,
      amount: "30000.00",
      date: "2026-06-10",
      reference: "REC-TITAN-PARTIAL-01",
      description: "First milestone payment",
    });
    assert.ok(receipt);

    const invoiceAfterReceipt = getInvoice(businessId, userId, salesInvoiceId);
    assert.ok(invoiceAfterReceipt);
    assert.equal(invoiceAfterReceipt.balanceMinor, 26_700_00); // 56,700 - 30,000 = 26,700

    // 3.6 Sales Credit Note for 2,100 AED (2,000 net + 100 VAT)
    const creditNoteId = saveCreditNote(
      businessId,
      userId,
      {
        customerId,
        sourceInvoiceId: salesInvoiceId,
        projectId,
        date: "2026-06-12",
        reference: "CN-TITAN-ADJUSTMENT",
        reason: "Client goodwill consulting discount adjustment",
        lines: [
          {
            description: "Consulting Goodwill Allowance",
            quantity: "1",
            unitPrice: "2000.00",
            salesAccountId: customIncomeAccountId,
            taxCodeId: vat5Output,
            projectId,
          },
        ],
      },
      "post",
    );
    assert.ok(creditNoteId);

    const invoiceAfterCreditNote = getInvoice(businessId, userId, salesInvoiceId);
    assert.ok(invoiceAfterCreditNote);
    assert.equal(invoiceAfterCreditNote.balanceMinor, 24_600_00); // 26,700 - 2,100 = 24,600 AED
  });

  // --------------------------------------------------------------------------
  // Phase 4: Purchases Commercial Cycle & Inventory Tracking
  // --------------------------------------------------------------------------
  await suite.test("Phase 4: Purchases Cycle - Quote, Order, Goods Receipt, Bill, Payment & Debit Note", () => {
    // 4.1 Purchase Quote from Supplier for 5 units @ 11,000 AED = 55,000 AED + 5% VAT (2,750 AED) = 57,750 AED
    const purchaseQuoteId = savePurchaseQuote(
      businessId,
      userId,
      {
        supplierId,
        projectId,
        date: "2026-06-02",
        expiryDate: "2026-06-30",
        reference: "PQ-NORDIC-8801",
        amountsIncludeTax: false,
        lines: [
          {
            itemId,
            description: "Enterprise Blade Server Titan (Hardware Acquisition)",
            quantity: "5",
            unitPrice: "11000.00",
            expenseAccountId: customExpenseAccountId,
            taxCodeId: vat5Input,
            projectId,
          },
        ],
      },
      "issue",
    );

    const pq = getPurchaseQuote(businessId, userId, purchaseQuoteId);
    assert.ok(pq);
    assert.equal(pq.quote.totalMinor, 57_750_00);

    // 4.2 Purchase Order
    const purchaseOrderId = savePurchaseOrder(
      businessId,
      userId,
      {
        supplierId,
        projectId,
        purchaseQuoteId,
        date: "2026-06-03",
        expectedDate: "2026-06-15",
        reference: "PO-NORDIC-8801",
        amountsIncludeTax: false,
        lines: pq.lines.map((l) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          expenseAccountId: l.expenseAccountId || customExpenseAccountId,
          taxCodeId: l.taxCodeId || vat5Input,
          projectId,
        })),
      },
      "issue",
    );

    const po = getPurchaseOrder(businessId, userId, purchaseOrderId);
    assert.ok(po);
    assert.equal(po.order.totalMinor, 57_750_00);

    // 4.3 Goods Receipt: Receive 5 units into location
    const goodsReceiptId = saveGoodsReceipt(
      businessId,
      userId,
      {
        supplierId,
        purchaseOrderId,
        purchaseInvoiceId: "",
        locationId,
        date: "2026-06-05",
        reference: "GRN-NORDIC-001",
        projectId,
        notes: "Received in perfect condition",
        lines: [
          {
            itemId,
            description: "Enterprise Blade Server Titan",
            quantity: "5",
            unitCost: "11000.00",
            purchaseOrderLineId: po.lines[0].id,
            purchaseInvoiceLineId: "",
            projectId,
          },
        ],
      },
      "post",
    );
    assert.ok(goodsReceiptId);

    // Verify Stock on Hand
    const stock = getStockOnHandReport(businessId, userId, { itemId });
    assert.ok(stock.length > 0);
    const itemStock = stock.find((s: any) => s.item_id === itemId);
    assert.ok(itemStock);
    assert.equal(itemStock.quantity_micros, 50_000); // 5 units * 10,000

    // 4.4 Convert to Purchase Invoice (Bill)
    purchaseInvoiceId = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        projectId,
        purchaseOrderId,
        invoiceDate: "2026-06-08",
        dueDate: "2026-07-23",
        reference: "BILL-NORDIC-091",
        supplierInvoiceNumber: "INV-ND-2026-091",
        amountsIncludeTax: false,
        lines: po.lines.map((l) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          expenseAccountId: l.expenseAccountId || customExpenseAccountId,
          taxCodeId: l.taxCodeId || vat5Input,
          projectId,
        })),
      },
      "post",
    );

    const billRecord = getPurchaseInvoice(businessId, userId, purchaseInvoiceId);
    assert.ok(billRecord);
    assert.equal(billRecord.invoice.documentStatus, "posted");
    assert.equal(billRecord.invoice.totalMinor, 57_750_00);
    assert.equal(billRecord.balanceMinor, 57_750_00);

    // 4.5 Supplier Payment of 50,000 AED against Bill
    const payment = createSupplierPayment(businessId, userId, {
      supplierId,
      purchaseInvoiceId,
      bankAccountId: bankAccount.ledger_account_id,
      amount: "50000.00",
      date: "2026-06-12",
      reference: "PAY-NORDIC-001",
      description: "Major settlement against hardware bill",
    });
    assert.ok(payment);

    const billAfterPay = getPurchaseInvoice(businessId, userId, purchaseInvoiceId);
    assert.ok(billAfterPay);
    assert.equal(billAfterPay.balanceMinor, 7_750_00); // 57,750 - 50,000 = 7,750 AED

    // 4.6 Debit Note for 1,050 AED (1,000 net + 50 VAT)
    const debitNoteId = saveDebitNote(
      businessId,
      userId,
      {
        supplierId,
        purchaseInvoiceId,
        projectId,
        date: "2026-06-14",
        taxDate: "2026-06-14",
        reference: "DN-NORDIC-DAMAGED-PARTS",
        currencyCode: "AED",
        exchangeRateToBase: "1",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Hardware transit damage allowance",
            quantity: "1",
            unitPrice: "1000.00",
            expenseAccountId: customExpenseAccountId,
            taxCodeId: vat5Input,
            discountType: "none",
            discountValue: "0",
            projectId,
          },
        ],
      },
      "post",
    );
    assert.ok(debitNoteId);
  });

  // --------------------------------------------------------------------------
  // Phase 5: Bank Rules & Automated Transaction Classification
  // --------------------------------------------------------------------------
  await suite.test("Phase 5: Bank Rules Engine - Pattern Matching & Automated Classification", () => {
    // 5.1 Create Rule for Cloud Infrastructure (AWS)
    const ruleId = createBankRule(businessId, userId, {
      name: "AWS Cloud Infrastructure",
      direction: "money_out",
      matchField: "description",
      matchType: "contains",
      matchText: "AWS-CLOUD",
      bankAccountId: bankAccount.id,
      targetAccountId: customExpenseAccountId,
      targetTaxCodeId: vat5Input,
      autoDescription: "Monthly AWS Cloud Infrastructure Operations",
      isActive: true,
    });
    assert.ok(ruleId);

    // 5.2 Import Bank Statement
    const csvContent = "Date,Description,Reference,Amount,ID\n2026-06-15,DIRECT DEBIT AWS-CLOUD EMEA SERVICES,REF-AWS-449,-4200.00,STMT-AWS-449";
    const mapping = {
      date: "Date",
      valueDate: "",
      description: "Description",
      reference: "Reference",
      amount: "Amount",
      debit: "",
      credit: "",
      externalId: "ID",
    };
    importBankStatement(businessId, userId, bankAccount.id, "aws-statement.csv", csvContent, mapping);

    const statementLines = listStatementLines(businessId, userId, bankAccount.id);
    const line = statementLines.find((l) => l.external_id === "STMT-AWS-449");
    assert.ok(line);
    assert.equal(line.match_status, "unmatched");

    // 5.3 Match Rule
    const allRules = listBankRules(businessId, userId, bankAccount.id);
    const matchedRule = findMatchingBankRule(allRules, line);
    assert.ok(matchedRule);
    assert.equal(matchedRule.id, ruleId);

    // 5.4 Apply Rule
    const { transactionId } = applyBankRule(businessId, userId, ruleId, line.id);
    assert.ok(transactionId);

    const tx = getBankTransaction(businessId, userId, transactionId);
    assert.ok(tx);
    assert.equal(tx.transaction.document_status, "posted");
    assert.equal(tx.transaction.total_minor, 4200_00);
    assert.equal(tx.transaction.description, "Monthly AWS Cloud Infrastructure Operations");

    const reloadedLine = listStatementLines(businessId, userId, bankAccount.id).find((l) => l.id === line.id);
    assert.equal(reloadedLine?.match_status, "created");
    assert.equal(reloadedLine?.matched_source_id, transactionId);
  });

  // --------------------------------------------------------------------------
  // Phase 6: UAE Payroll, Ledger Posting & Federal EOSB Gratuity
  // --------------------------------------------------------------------------
  await suite.test("Phase 6: UAE HR & Payroll - Employee, Batch Pay Run, Ledger Post & EOSB Gratuity", () => {
    // 6.1 Save Employee with complete compensation structure
    const empId = saveEmployee(businessId, userId, {
      name: "Tariq Mansoor Al Falasi",
      code: "EMP-001",
      email: "tariq@apexvanguard.ae",
      designation: "Lead Infrastructure Architect",
      department: "Cloud Engineering",
      joiningDate: "2023-01-01",
      basicSalaryMinor: 18_000_00, // 18,000 AED
      housingAllowanceMinor: 6_000_00, // 6,000 AED
      transportAllowanceMinor: 2_000_00, // 2,000 AED
      otherAllowancesMinor: 0,
      isActive: true,
    });
    assert.ok(empId);

    // 6.2 Generate Batch Pay Run for June 2026
    const payRunResult = generateBatchPayslips(
      businessId,
      userId,
      {
        periodDate: "2026-06-30",
        periodDescription: "June 2026",
        employeeIds: [empId],
        autoPost: true,
      },
    );
    assert.equal(payRunResult.createdCount, 1);
    assert.equal(payRunResult.payslipIds.length, 1);

    const payslipRecord = getPayslipWithLines(businessId, userId, payRunResult.payslipIds[0]);
    assert.ok(payslipRecord);
    assert.equal(payslipRecord.payslip.documentStatus, "posted");
    assert.equal(payslipRecord.payslip.netAmountMinor, 26_000_00); // 18k + 6k + 2k = 26k AED

    // 6.3 Verify UAE End of Service Benefits (EOSB)
    // Employee served from 2023-01-01 to 2026-07-01 (3.5 years of service)
    const eosb = calculateUaeEosb({
      joiningDate: "2023-01-01",
      terminationDate: "2026-07-01",
      basicSalaryMinor: 18_000_00,
    });

    assert.equal(eosb.eligibleForGratuity, true);
    // Daily wage = 18,000 / 30 = 600 AED = 60,000 minor
    assert.equal(eosb.dailyWageMinor, 60_000);
    assert.ok(eosb.yearsOfService > 3.4 && eosb.yearsOfService < 3.6);
    // Under 5 years: 21 days basic wage per year
    // Approx 3.5 * 21 = 73.5 days => 73.5 * 600 AED = 44,100 AED (4,410,000 minor)
    assert.ok(eosb.gratuityMinor > 4_300_000 && eosb.gratuityMinor < 4_600_000);
    assert.equal(eosb.isCapped, false);
  });

  // --------------------------------------------------------------------------
  // Phase 7: Comprehensive Financial Statements & Reporting Audit
  // --------------------------------------------------------------------------
  await suite.test("Phase 7: Financial Statements - Trial Balance, Accrual vs Cash P&L, Balance Sheet & Cash Flow", () => {
    // 7.1 Trial Balance Equilibrium Check
    const tb = getTrialBalance(businessId, userId);
    assert.ok(tb);
    assert.ok(tb.debitMinor > 0);
    assert.equal(
      tb.debitMinor,
      tb.creditMinor,
      `Double-Entry Bookkeeping Violation! Debits (${tb.debitMinor}) != Credits (${tb.creditMinor})`,
    );

    // Verify all individual journal entries are perfectly balanced
    const unbalancedJournals = sqlite
      .prepare(`
        SELECT journal_entry_id, SUM(debit_minor) as total_debit, SUM(credit_minor) as total_credit
        FROM journal_lines
        GROUP BY journal_entry_id
        HAVING total_debit != total_credit
      `)
      .all();
    assert.equal(unbalancedJournals.length, 0, "No individual journal entry may ever be unbalanced");

    // 7.2 Profit and Loss: Accrual Basis vs Cash Basis
    const pnlAccrual = getProfitAndLoss(businessId, userId, "2026-01-01", "2026-12-31", "accrual");
    const pnlCash = getProfitAndLoss(businessId, userId, "2026-01-01", "2026-12-31", "cash");

    assert.ok(pnlAccrual.length > 0);
    assert.ok(pnlCash.length > 0);

    const totalIncomeAccrual = pnlAccrual.filter((r) => r.type === "income").reduce((s, r) => s + r.net_minor, 0);
    const totalExpenseAccrual = pnlAccrual.filter((r) => r.type === "expense").reduce((s, r) => s + r.net_minor, 0);
    const netIncomeAccrual = totalIncomeAccrual - totalExpenseAccrual;

    // 7.3 Balance Sheet Equation: Assets === Liabilities + Equity
    const rows = tb.accounts;
    const sumBalance = (arr: typeof rows, normalBalance: "debit" | "credit") =>
      arr.reduce((acc, r) => {
        const net = normalBalance === "debit" ? r.debit_total - r.credit_total : r.credit_total - r.debit_total;
        return acc + net;
      }, 0);

    const totalAssets = sumBalance(rows.filter((r) => r.type === "asset"), "debit");
    const totalLiabilities = sumBalance(rows.filter((r) => r.type === "liability"), "credit");
    const totalEquityWithoutNetIncome = sumBalance(rows.filter((r) => r.type === "equity"), "credit");
    const totalEquity = totalEquityWithoutNetIncome + netIncomeAccrual;

    assert.equal(
      totalAssets,
      totalLiabilities + totalEquity,
      `Balance Sheet Equation Violation! Assets (${totalAssets}) != Liabilities (${totalLiabilities}) + Equity (${totalEquity})`,
    );

    // 7.4 General Ledger Integrity
    const gl = getGeneralLedger(businessId, userId, {});
    assert.ok(gl.length > 0, "General Ledger must record audit transactions");

    // 7.4 Cash Flow Forecast
    const forecast = getCashFlowForecast(businessId, userId, { asOfDate: "2026-06-01", horizonDays: 60 });
    assert.ok(forecast);
    assert.ok(forecast.summary.startingCashMinor > 0);
    assert.ok(forecast.dailyLedger.length > 0);

    // 7.5 VAT Transaction Detail Report
    const vatReport = getVatTransactionDetail(businessId, userId, {
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
    });
    assert.ok(vatReport.length > 0);

    // Ensure output VAT lines and input VAT lines exist
    const outputRows = vatReport.filter((r) => r.direction === "sales");
    const inputRows = vatReport.filter((r) => r.direction === "purchases");
    assert.ok(outputRows.length > 0, "Output VAT entries must be recorded");
    assert.ok(inputRows.length > 0, "Input VAT entries must be recorded");
  });

  // --------------------------------------------------------------------------
  // Phase 8: Financial Lock Date Enforcement & Security Audit Trail
  // --------------------------------------------------------------------------
  await suite.test("Phase 8: Financial Lock Date Security & Activity Log Audit Trail", () => {
    // 8.1 Set Financial Lock Date to 2026-05-31
    setFinancialLockDate(businessId, userId, "2026-05-31");
    const lockDate = getFinancialLockDate(businessId, userId);
    assert.equal(lockDate, "2026-05-31");

    // 8.2 Attempt to post backdated Sales Invoice in closed period (2026-05-15)
    assert.throws(
      () =>
        createInvoice(
          businessId,
          userId,
          {
            customerId,
            invoiceDate: "2026-05-15",
            dueDate: "2026-06-15",
            taxDate: "2026-05-15",
            lines: [
              {
                description: "Backdated Service",
                quantity: "1",
                unitPrice: "1000.00",
                salesAccountId: customIncomeAccountId,
                taxCodeId: vat5Output,
              },
            ],
          },
          "post",
        ),
      /closed/i,
      "System must reject backdated transaction prior to financial lock date",
    );

    // 8.3 Verify forward-dated invoice after lock date succeeds
    const forwardInvoiceId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-06-25",
        dueDate: "2026-07-25",
        taxDate: "2026-06-25",
        lines: [
          {
            description: "Legitimate Forward Service",
            quantity: "1",
            unitPrice: "1000.00",
            salesAccountId: customIncomeAccountId,
            taxCodeId: vat5Output,
          },
        ],
      },
      "post",
    );
    assert.ok(forwardInvoiceId);

    // 8.4 Verify Comprehensive Activity Log Audit Trail
    const logResult = listActivityLogs(businessId, userId);
    const logs = logResult.logs;
    assert.ok(logs.length >= 10, `Activity log must record business lifecycle operations (found ${logs.length})`);

    const entityTypesLogged = new Set(logs.map((l) => l.entityType));
    assert.ok(entityTypesLogged.has("sales_invoice"), "Sales invoices must be logged");
    assert.ok(entityTypesLogged.has("receipt"), "Receipts must be logged");
    assert.ok(entityTypesLogged.has("financial_lock"), "Financial lock updates must be logged");
    assert.ok(entityTypesLogged.has("account"), "Account creations must be logged");
  });
});
