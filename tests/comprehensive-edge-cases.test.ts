import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-edge-cases-")),
  BETTER_AUTH_SECRET: "edge-cases-secret-key-445566",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

// Calculations & Money
const {
  calculateDiscount,
  multiplyMoneyByQuantity,
  parseMoneyToMinor,
  parseSignedMoneyToMinor,
  minorToInput,
  parseQuantityToMicros,
} = await import("../src/modules/accounting/calculations/money");

// Multi-Currency
const { convertDocumentLinesToBase } = await import("../src/modules/currency/conversion");

// Payment Terms & Due Dates
const {
  calculateDueDate,
  createPaymentTerm,
  listPaymentTerms,
  updatePaymentTerm,
} = await import("../src/modules/payment-terms/payment-terms-service");

// Email Templates & Interpolation
const {
  interpolateEmailTemplate,
  DEFAULT_TEMPLATES,
} = await import("../src/modules/email/email-template-types");

// Financial Lock
const {
  assertFinancialLock,
  setFinancialLockDate,
  getFinancialLockDate,
} = await import("../src/modules/accounting/services/financial-lock-service");

// Revision Engine & SQL Security
const {
  createDocumentRevision,
  deleteDraftRevision,
} = await import("../src/core/versioning/revision-engine");

// Account & Numbering
const {
  deleteAccount,
} = await import("../src/modules/accounting/services/account-service");
const {
  allocateNumber,
} = await import("../src/modules/accounting/services/numbering-service");

// Commercial Services
const {
  createInvoice,
  getInvoice,
} = await import("../src/modules/sales-invoices/invoice-service");
const {
  saveSalesQuote,
  getSalesQuote,
} = await import("../src/modules/sales-quotes/quote-service");
const {
  saveOpeningBalances,
  getOpeningBalances,
} = await import("../src/modules/accounting/services/opening-balances-service");

test("Top-Down Rigorous Edge Cases & Stress Invariants Suite", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  const acctSettings = sqlite
    .prepare(
      "SELECT default_sales_account_id, default_purchase_expense_account_id, default_bank_account_id FROM business_accounting_settings LIMIT 1"
    )
    .get() as {
    default_sales_account_id: string;
    default_purchase_expense_account_id: string;
    default_bank_account_id: string;
  };
  const salesAccount = acctSettings.default_sales_account_id;
  const defaultCustomer = sqlite.prepare("SELECT id FROM customers LIMIT 1").get() as { id: string };
  const standardVat = sqlite
    .prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1")
    .get() as { id: string };
  const zeroVat = sqlite
    .prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1")
    .get() as { id: string };

  // =========================================================================
  // 1. ARITHMETIC & MONEY MATH BOUNDARY EXTREMES
  // =========================================================================
  await suite.test("1. Precision Money & Discount Boundary Conditions", () => {
    // 0% discount
    assert.equal(calculateDiscount(10000, "percentage", "0", 2), 0);
    assert.equal(calculateDiscount(10000, "percentage", "0.00", 2), 0);

    // 100% discount
    assert.equal(calculateDiscount(10000, "percentage", "100", 2), 10000);
    assert.equal(calculateDiscount(10000, "percentage", "100.00", 2), 10000);

    // 0.01% (1 basis point of 1,000,000 minor = 100 minor)
    assert.equal(calculateDiscount(1000000, "percentage", "0.01", 2), 100);

    // 19.99% discount on 10,000 minor = 1999 minor
    assert.equal(calculateDiscount(10000, "percentage", "19.99", 2), 1999);

    // 50% discount on odd minor (101 minor * 50% = 50.5 -> 51 minor rounded half-up)
    assert.equal(calculateDiscount(101, "percentage", "50", 2), 51);

    // Out-of-bounds percentage throws
    assert.throws(() => calculateDiscount(10000, "percentage", "-1", 2), /Invalid discount percentage/);
    assert.throws(() => calculateDiscount(10000, "percentage", "100.01", 2), /Invalid discount percentage/);
    assert.throws(() => calculateDiscount(10000, "percentage", "abc", 2), /Invalid discount percentage/);

    // Fixed discount: capped at line total
    assert.equal(calculateDiscount(5000, "fixed", "10.00", 2), 1000); // 10 AED = 1000 minor
    assert.equal(calculateDiscount(5000, "fixed", "100.00", 2), 5000); // 100 AED capped at 50 AED (5000 minor)
    assert.equal(calculateDiscount(5000, "fixed", "0", 2), 0);

    // Quantity & Money multiplication extremes
    // 1 micro quantity (0.0001) at 10,000 minor (100.00) = 1 minor
    assert.equal(multiplyMoneyByQuantity(10000, 1), 1);
    // 0 quantity must throw
    assert.throws(() => multiplyMoneyByQuantity(10000, 0), /Quantity must be greater than zero/);
    // Large volume: 50,000 units (500,000,000 micros) at 250.00 (25000 minor)
    assert.equal(multiplyMoneyByQuantity(25000, 500000000), 1250000000);

    // Signed money parsing
    assert.equal(parseSignedMoneyToMinor("-150.75"), -15075);
    assert.equal(parseSignedMoneyToMinor("150.75"), 15075);
    assert.equal(parseSignedMoneyToMinor("0.00"), 0);
  });

  // =========================================================================
  // 2. MULTI-CURRENCY CONVERSION ROUNDING & SPLIT TAX INVARIANTS
  // =========================================================================
  await suite.test("2. Multi-Currency Split Tax Conversion Invariants", () => {
    // 3 lines with odd decimals converted from USD (rate 3.6725) to AED
    const rateSnapshot = {
      currencyCode: "USD",
      exchangeRateToBase: "3.6725",
      exchangeRateDate: "2026-10-15",
      exchangeRateSource: "Manual" as const,
      currencyMinorUnit: 2,
      baseCurrencyCode: "AED",
      baseMinorUnit: 2,
    };

    const lines = [
      { netAmountMinor: 1033, taxAmountMinor: 52, grossAmountMinor: 1085 },
      { netAmountMinor: 2077, taxAmountMinor: 104, grossAmountMinor: 2181 },
      { netAmountMinor: 500, taxAmountMinor: 0, grossAmountMinor: 500 },
    ];

    const result = convertDocumentLinesToBase(lines, rateSnapshot);

    // Verify invariant: baseTotalMinor === baseSubtotalMinor + baseTaxMinor exactly
    assert.equal(
      result.baseTotalMinor,
      result.baseSubtotalMinor + result.baseTaxMinor,
      "Base total must equal base subtotal + base tax with zero rounding drift"
    );

    // Verify each line's base gross equals base net + base tax
    for (const l of result.lines) {
      assert.equal(l.baseGrossAmountMinor, l.baseNetAmountMinor + l.baseTaxAmountMinor);
    }
  });

  // =========================================================================
  // 3. DATE BOUNDARIES & LEAP YEAR / MONTH-END PAYMENT TERMS
  // =========================================================================
  await suite.test("3. Payment Terms Due Date Leap Year & Month-End Calculations", () => {
    // Leap year February (2024 is a leap year)
    const eomTerm = { is_eom: 1, days: 0 };
    assert.equal(calculateDueDate("2024-02-14", eomTerm), "2024-02-29");

    // Non-leap year February (2025 is not a leap year)
    assert.equal(calculateDueDate("2025-02-14", eomTerm), "2025-02-28");

    // End of Month with additional days (EOM + 15 days from April 10 -> April 30 + 15 = May 15)
    const eom15Term = { is_eom: 1, days: 15 };
    assert.equal(calculateDueDate("2026-04-10", eom15Term), "2026-05-15");

    // Year boundary roll-over (Dec 20 -> Dec 31 + 10 = Jan 10 next year)
    const eom10Term = { is_eom: 1, days: 10 };
    assert.equal(calculateDueDate("2026-12-20", eom10Term), "2027-01-10");

    // Net 30 from Jan 31 -> March 2
    const net30Term = { is_eom: 0, days: 30 };
    assert.equal(calculateDueDate("2026-01-31", net30Term), "2026-03-02");

    // Due on receipt (0 days)
    const dueOnReceipt = { is_eom: 0, days: 0 };
    assert.equal(calculateDueDate("2026-10-15", dueOnReceipt), "2026-10-15");

    // Malformed / empty date strings fallback safely
    assert.equal(calculateDueDate("", net30Term), "");
    assert.equal(calculateDueDate("invalid-date", net30Term), "invalid-date");
  });

  // =========================================================================
  // 4. SECURITY & INJECTION SHIELDS
  // =========================================================================
  await suite.test("4. SQL Whitelisting & Injection Rejection in Revision Engine", () => {
    // Malicious header table name injection attempt
    const maliciousConfig = {
      headerTable: "sales_quotes; DROP TABLE customers; --",
      lineTable: "sales_quote_lines",
      headerIdColumn: "id",
      lineHeaderIdColumn: "quote_id",
      documentNumberColumn: "quote_number",
    };

    assert.throws(
      () => createDocumentRevision(sqlite, maliciousConfig as any, adminId, "non-existent-id"),
      /Unauthorized revision header table/
    );

    // Malicious column injection attempt
    const maliciousColConfig = {
      headerTable: "sales_quotes",
      lineTable: "sales_quote_lines",
      headerIdColumn: "id; SELECT 1",
      lineHeaderIdColumn: "quote_id",
      documentNumberColumn: "quote_number",
    };

    assert.throws(
      () => createDocumentRevision(sqlite, maliciousColConfig as any, adminId, "non-existent-id"),
      /Unauthorized revision header ID column/
    );

    // Malicious status column injection in deleteDraftRevision
    const maliciousStatusConfig = {
      headerTable: "sales_quotes",
      lineTable: "sales_quote_lines",
      headerIdColumn: "id",
      lineHeaderIdColumn: "quote_id",
      documentNumberColumn: "quote_number",
      statusColumn: "status UNION SELECT * FROM passwords",
    };

    assert.throws(
      () => deleteDraftRevision(sqlite, maliciousStatusConfig as any, "dummy-id"),
      /Unauthorized status column/
    );
  });

  // =========================================================================
  // 5. EMAIL TEMPLATE TOKEN INTERPOLATION & XSS PRESERVATION
  // =========================================================================
  await suite.test("5. Email Template Safe Interpolation with Special Characters & Unicode", () => {
    const rawTemplate = {
      subject: "Invoice {{document_number}} for {{customer_name}}",
      body: "Dear {{customer_name}},\nTotal: {{total_amount}}\nCompany: {{business_name}}",
    };

    // Arabic unicode and special quotes
    const interpolated = interpolateEmailTemplate(rawTemplate, {
      documentNumber: "INV-2026-999",
      customerName: "شركة الفجر للتجارة LLC <test@alfajr.ae>",
      total: "AED 15,250.00",
      businessName: "Gulf Apex & Co. \"Global\"",
    });

    assert.equal(interpolated.subject, "Invoice INV-2026-999 for شركة الفجر للتجارة LLC <test@alfajr.ae>");
    assert.ok(interpolated.body.includes("شركة الفجر للتجارة LLC <test@alfajr.ae>"));
    assert.ok(interpolated.body.includes("Gulf Apex & Co. \"Global\""));

    // Script tags are preserved verbatim as text (never stripped into invalid syntax)
    const xssAttempt = interpolateEmailTemplate(rawTemplate, {
      customerName: "<script>alert('xss')</script>",
      documentNumber: "INV-001",
      total: "100",
      businessName: "Test",
    });
    assert.equal(xssAttempt.subject, "Invoice INV-001 for <script>alert('xss')</script>");
  });

  // =========================================================================
  // 6. FINANCIAL LOCK DATE PERIOD CLOSING CONTROLS
  // =========================================================================
  await suite.test("6. Financial Lock Date Boundary Enforcement", () => {
    const lockDate = "2026-06-30";
    setFinancialLockDate(businessId, adminId, lockDate);
    assert.equal(getFinancialLockDate(businessId, adminId), lockDate);

    // Date on lock date must throw
    assert.throws(
      () => assertFinancialLock(sqlite, "2026-06-30", "Posting"),
      /period on or before 2026-06-30 is closed/
    );

    // Date before lock date must throw
    assert.throws(
      () => assertFinancialLock(sqlite, "2026-06-29", "Posting"),
      /period on or before 2026-06-30 is closed/
    );

    // Date after lock date must succeed without throwing
    assert.doesNotThrow(() => assertFinancialLock(sqlite, "2026-07-01", "Posting"));
    assert.doesNotThrow(() => assertFinancialLock(sqlite, "2026-12-31", "Posting"));

    // Clear lock date -> backdated postings succeed
    setFinancialLockDate(businessId, adminId, null);
    assert.equal(getFinancialLockDate(businessId, adminId), null);
    assert.doesNotThrow(() => assertFinancialLock(sqlite, "2026-06-15", "Posting"));
  });

  // =========================================================================
  // 7. RELATIONAL INTEGRITY & ATOMIC ACCOUNT DELETION GUARDS
  // =========================================================================
  await suite.test("7. Account Relational Invariants & Atomic Delete Guard", () => {
    // 1. System account deletion rejection
    const systemAcct = sqlite.prepare("SELECT id FROM accounts WHERE is_system = 1 LIMIT 1").get() as { id: string };
    assert.throws(
      () => deleteAccount(businessId, adminId, systemAcct.id),
      /System accounts cannot be deleted/
    );

    // 2. Custom non-system account configured in a tax code cannot be deleted
    const customAcctId = randomUUID();
    sqlite.prepare(`
      INSERT INTO accounts (id, name, type, subtype, is_active, is_system, created_at, updated_at)
      VALUES (?, 'Custom Temp Account', 'income', 'operating_revenue', 1, 0, datetime('now'), datetime('now'))
    `).run(customAcctId);

    const customTaxId = randomUUID();
    sqlite.prepare(`
      INSERT INTO tax_codes (id, name, rate_basis_points, direction, vat_category, sales_tax_account_id, purchase_tax_account_id, is_active, created_at, updated_at)
      VALUES (?, 'Temp Tax', 500, 'both', 'standard', ?, ?, 1, datetime('now'), datetime('now'))
    `).run(customTaxId, customAcctId, customAcctId);

    assert.throws(
      () => deleteAccount(businessId, adminId, customAcctId),
      /Cannot delete this account because it has transactions or is configured/
    );

    // Clean up
    sqlite.prepare("DELETE FROM tax_codes WHERE id = ?").run(customTaxId);
    sqlite.prepare("DELETE FROM accounts WHERE id = ?").run(customAcctId);
  });

  // =========================================================================
  // 8. NUMBERING SEQUENCE CONCURRENCY & COLLISION RECOVERY
  // =========================================================================
  await suite.test("8. Numbering Sequence Auto-Collision Resolution", () => {
    // Allocate normal next invoice number
    let allocated1 = "";
    sqlite.transaction(() => {
      allocated1 = allocateNumber(sqlite, "invoice");
    }).immediate();
    assert.ok(allocated1.startsWith("INV-"));

    // Manually insert an invoice with the next prospective number to force a collision
    const prefix = allocated1.slice(0, 4);
    const numPart = parseInt(allocated1.slice(4), 10);
    const prospectiveNumber = `${prefix}${String(numPart + 1).padStart(5, "0")}`;

    sqlite.prepare(`
      INSERT INTO sales_invoices (
        id, invoice_number, customer_id, invoice_date, tax_date, due_date, currency_code,
        exchange_rate_to_base, exchange_rate_date, document_status, subtotal_minor,
        tax_minor, total_minor, base_subtotal_minor, base_tax_minor,
        base_total_minor, created_by, created_at, updated_at
      ) VALUES (
        'collision-test-id', '${prospectiveNumber}', '${defaultCustomer.id}',
        '2026-10-15', '2026-10-15', '2026-11-15', 'AED', '1.0000', '2026-10-15', 'draft',
        0, 0, 0, 0, 0, 0, '${adminId}', datetime('now'), datetime('now')
      )
    `).run();

    // Allocate again: must detect prospectiveNumber collision and jump past it cleanly!
    let allocated2 = "";
    sqlite.transaction(() => {
      allocated2 = allocateNumber(sqlite, "invoice");
    }).immediate();

    assert.notEqual(allocated2, prospectiveNumber, "Must skip colliding number");
    const numPart2 = parseInt(allocated2.slice(4), 10);
    assert.equal(numPart2, numPart + 2, "Must advance sequence past colliding number");

    // Clean up collision test row
    sqlite.prepare("DELETE FROM sales_invoices WHERE id = 'collision-test-id'").run();
  });

  // =========================================================================
  // 9. DOUBLE-ENTRY GENERAL LEDGER STRICT INVARIANTS UNDER STRESS
  // =========================================================================
  await suite.test("9. Multi-Line Mixed Document Double-Entry Balancing", () => {
    // Create sales invoice with mixed discount types & mixed tax codes:
    // Line 1: 500 AED, 5% VAT, 10% percentage discount
    // Line 2: 200 AED, 0% VAT, 25 AED fixed discount
    // Line 3: 1,000 AED, 5% VAT, 0 discount
    const invoiceId = createInvoice(
      businessId,
      adminId,
      {
        customerId: defaultCustomer.id,
        invoiceDate: "2026-10-15",
        dueDate: "2026-11-15",
        currencyCode: "AED",
        exchangeRateToBase: "1.0000",
        amountsIncludeTax: false,
        lines: [
          {
            description: "Consulting Package",
            quantity: "1",
            unitPrice: "500.00",
            salesAccountId: salesAccount,
            taxCodeId: standardVat.id,
            discountType: "percentage",
            discountValue: "10",
          },
          {
            description: "Hardware Dongle",
            quantity: "1",
            unitPrice: "200.00",
            salesAccountId: salesAccount,
            taxCodeId: zeroVat.id,
            discountType: "fixed",
            discountValue: "25",
          },
          {
            description: "Implementation Service",
            quantity: "2",
            unitPrice: "500.00",
            salesAccountId: salesAccount,
            taxCodeId: standardVat.id,
            discountType: "none",
            discountValue: "0",
          },
        ],
      },
      "post" // Post directly to General Ledger
    );

    const invoiceResult = getInvoice(businessId, adminId, invoiceId);
    assert.ok(invoiceResult, "Invoice must exist");
    assert.equal(invoiceResult.invoice.documentStatus, "posted");

    // Query journal lines created by this posting
    const journalEntry = sqlite
      .prepare("SELECT id FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?")
      .get(invoiceId) as { id: string } | undefined;
    assert.ok(journalEntry, "Posting must generate a journal entry");

    const lines = sqlite
      .prepare("SELECT debit_minor, credit_minor FROM journal_lines WHERE journal_entry_id = ?")
      .all(journalEntry.id) as Array<{ debit_minor: number; credit_minor: number }>;

    const totalDebits = lines.reduce((sum, l) => sum + l.debit_minor, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.credit_minor, 0);

    // Fundamental double-entry accounting invariant
    assert.equal(totalDebits, totalCredits, "Total debits must strictly equal total credits");
    assert.equal(totalDebits, invoiceResult.invoice.totalMinor, "Total debits must match invoice gross minor");
  });

  // =========================================================================
  // 10. OPENING BALANCES ENGINE RETIRED EQUITY OFFSETS
  // =========================================================================
  await suite.test("10. Opening Balances Self-Balancing Engine Offset Integrity", () => {
    // Post opening balance with a debit surplus of 10,000 AED in bank
    const bankAccount = acctSettings.default_bank_account_id;
    saveOpeningBalances(businessId, adminId, "2026-01-01", [
      {
        accountId: bankAccount,
        debitMinor: 1000000, // 10,000.00 AED
        creditMinor: 0,
      },
    ]);

    const opening = getOpeningBalances(businessId, adminId);
    assert.equal(opening.openingDate, "2026-01-01");

    // Verify journal entry has offsetting Retained Earnings / Equity entry
    const journal = sqlite
      .prepare("SELECT id FROM journal_entries WHERE source_type = 'opening_balance' LIMIT 1")
      .get() as { id: string } | undefined;
    assert.ok(journal, "Opening balance journal must exist");

    const jLines = sqlite
      .prepare("SELECT debit_minor, credit_minor FROM journal_lines WHERE journal_entry_id = ?")
      .all(journal.id) as Array<{ debit_minor: number; credit_minor: number }>;

    const debits = jLines.reduce((sum, l) => sum + l.debit_minor, 0);
    const credits = jLines.reduce((sum, l) => sum + l.credit_minor, 0);

    assert.equal(debits, 1000000);
    assert.equal(credits, 1000000, "Retained earnings must offset unbalanced opening debit");
  });

  // =========================================================================
  // 11. DOCUMENT REVISION LIFECYCLE & DRAFT RESTORATION
  // =========================================================================
  await suite.test("11. Quote Revision Versioning & Clean Rollback Invariants", () => {
    // Create base sales quote (Rev 0)
    const quoteId = saveSalesQuote(
      businessId,
      adminId,
      {
        customerId: defaultCustomer.id,
        date: "2026-10-15",
        expectedDate: "2026-11-15",
        currencyCode: "AED",
        exchangeRateToBase: "1.0000",
        lines: [
          {
            description: "Initial Quote Item",
            quantity: "1",
            unitPrice: "1500.00",
            salesAccountId: salesAccount,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "issue"
    );

    const rev0 = getSalesQuote(businessId, adminId, quoteId);
    assert.ok(rev0);
    assert.equal(rev0.quote.revisionNumber, 0);
    assert.equal(Boolean(rev0.quote.isLatestRevision), true);

    // Create Revision 1
    const rev1Id = createDocumentRevision(
      sqlite,
      {
        headerTable: "sales_quotes",
        lineTable: "sales_quote_lines",
        headerIdColumn: "id",
        lineHeaderIdColumn: "quote_id",
        documentNumberColumn: "quote_number",
        statusColumn: "document_status",
      },
      adminId,
      quoteId
    );

    const rev1 = getSalesQuote(businessId, adminId, rev1Id);
    assert.ok(rev1);
    assert.equal(rev1.quote.revisionNumber, 1);
    assert.equal(Boolean(rev1.quote.isLatestRevision), true);
    assert.equal(rev1.quote.documentStatus, "draft");

    // Creating another draft when one is active must throw
    assert.throws(
      () =>
        createDocumentRevision(
          sqlite,
          {
            headerTable: "sales_quotes",
            lineTable: "sales_quote_lines",
            headerIdColumn: "id",
            lineHeaderIdColumn: "quote_id",
            documentNumberColumn: "quote_number",
            statusColumn: "document_status",
          },
          adminId,
          quoteId
        ),
      /A draft revision already exists/
    );

    // Delete draft Rev 1: should safely restore Rev 0 as the latest revision!
    deleteDraftRevision(
      sqlite,
      {
        headerTable: "sales_quotes",
        lineTable: "sales_quote_lines",
        headerIdColumn: "id",
        lineHeaderIdColumn: "quote_id",
        documentNumberColumn: "quote_number",
        statusColumn: "document_status",
      },
      rev1Id
    );

    const rev0Restored = getSalesQuote(businessId, adminId, quoteId);
    assert.ok(rev0Restored);
    assert.equal(Boolean(rev0Restored.quote.isLatestRevision), true, "Rev 0 must be restored as latest revision");
  });
});
