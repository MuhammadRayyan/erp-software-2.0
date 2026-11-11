import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDir = mkdtempSync(path.join(tmpdir(), "modern-erp-phase1-2-test-"));
Object.assign(process.env, {
  ERP_DATA_DIR: tempDir,
  BETTER_AUTH_SECRET: "phase1-2-secret-key-12345678901234567890",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { formatMajorMoney, formatMoney, getCurrencyMinorUnit } = await import("../src/core/format");
const { moneySchema, discountValueSchema } = await import("../src/core/validation/document-schemas");
const { previewDocumentLine } = await import("../src/components/documents/document-calculations");
const { calculateLines, totalsForLines } = await import("../src/modules/accounting/services/document-line-calculator");
const { createInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { buildDocumentTemplateData } = await import("../src/modules/document-templates/document-data-extractor");
const { listCustomers } = await import("../src/modules/customers/customer-service");

test("Phase 1 & 2 Modernization: Mathematical Integrity, Validation & Synchronization", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const context = getBusinessDb(businessId, adminId);

  await suite.test("1. Fixed discount formatting: Major currency units format correctly without 100x division bug", async () => {
    // getCurrencyMinorUnit verification
    assert.equal(getCurrencyMinorUnit("AED"), 2);
    assert.equal(getCurrencyMinorUnit("USD"), 2);
    assert.equal(getCurrencyMinorUnit("JPY"), 0);
    assert.equal(getCurrencyMinorUnit("KWD"), 3);

    // 10 AED fixed discount must format as "AED 10.00", NOT "AED 0.10"
    const formattedAED = formatMajorMoney("10.00", "AED");
    assert.equal(formattedAED, formatMoney(1000, "AED"), "10.00 AED fixed discount must format as AED 10.00");
    assert.equal(formattedAED, "AED\u00a010.00");

    const formattedAEDInt = formatMajorMoney("10", "AED");
    assert.equal(formattedAEDInt, formatMoney(1000, "AED"), "10 AED integer string fixed discount must format as AED 10.00");

    const formattedUSD = formatMajorMoney("25.50", "USD");
    assert.equal(formattedUSD, formatMoney(2550, "USD"), "25.50 USD fixed discount must format as USD 25.50");

    const formattedJPY = formatMajorMoney("1500", "JPY");
    assert.equal(formattedJPY, formatMoney(1500, "JPY"), "1500 JPY fixed discount must format as JPY 1,500 (0 minor units)");

    const formattedKWD = formatMajorMoney("1.500", "KWD");
    assert.equal(formattedKWD, formatMoney(1500, "KWD"), "1.500 KWD fixed discount must format as KWD 1.500 (3 minor units)");

    // Test extracted document data: create an invoice with a 10.00 AED fixed discount
    const customers = listCustomers(businessId, adminId);
    const customer = customers[0];
    assert.ok(customer, "Customer must exist");

    const incomeAccount = context.sqlite
      .prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1")
      .get() as any;
    const standardVat = context.sqlite
      .prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND is_active = 1 LIMIT 1")
      .get() as any;

    const invoiceId = createInvoice(businessId, adminId, {
      customerId: customer.id,
      invoiceDate: "2026-03-01",
      dueDate: "2026-03-31",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: "2026-03-01",
      exchangeRateSource: "Base",
      supplyEmirate: "abu_dhabi",
      amountsIncludeTax: false,
      lines: [
        {
          description: "Consulting Services",
          quantity: "1",
          unitPrice: "100.00",
          discountType: "fixed",
          discountValue: "10.00",
          salesAccountId: incomeAccount.id,
          taxCodeId: standardVat.id,
        },
      ],
    }, "post");

    const docData = buildDocumentTemplateData(businessId, adminId, "Acme LLC", "AED", "sales-invoice", invoiceId);
    assert.ok(docData, "Extracted document data must exist");
    assert.equal(docData.data.lines.length, 1, "Must have 1 line");
    // Verify that the extracted row discount is AED 10.00, NOT AED 0.10
    assert.equal(
      docData.data.lines[0].discount,
      formatMoney(1000, "AED"),
      "PDF template extractor must show AED 10.00 discount for 10.00 AED fixed discount"
    );
  });

  await suite.test("2. Schema alignment (Option A): moneySchema and discountValueSchema reject >2 decimal places", () => {
    // Valid standard amounts (up to 2 decimals)
    assert.ok(moneySchema.safeParse("10.00").success, "10.00 must pass moneySchema");
    assert.ok(moneySchema.safeParse("10.5").success, "10.5 must pass moneySchema");
    assert.ok(moneySchema.safeParse("10").success, "10 must pass moneySchema");
    assert.ok(moneySchema.safeParse("0.50").success, "0.50 must pass moneySchema");
    assert.ok(moneySchema.safeParse("999999.99").success, "Large 2-decimal amount must pass");

    // Invalid amounts with >2 decimals (Option A enforcement)
    const result3Decimals = moneySchema.safeParse("10.555");
    assert.equal(result3Decimals.success, false, "10.555 must fail moneySchema");
    if (!result3Decimals.success) {
      assert.ok(
        result3Decimals.error.issues[0].message.includes("2 decimal places"),
        "Error message must specify up to 2 decimal places"
      );
    }

    const result6Decimals = moneySchema.safeParse("3.141592");
    assert.equal(result6Decimals.success, false, "3.141592 must fail moneySchema");

    // discountValueSchema
    assert.ok(discountValueSchema.safeParse("10.00").success, "10.00 must pass discountValueSchema");
    assert.ok(discountValueSchema.safeParse("10.5").success, "10.5 must pass discountValueSchema");
    assert.ok(discountValueSchema.safeParse("10").success, "10 must pass discountValueSchema");
    assert.ok(discountValueSchema.safeParse("").success, "Empty string must pass discountValueSchema");

    const resultDiscount3Decimals = discountValueSchema.safeParse("10.555");
    assert.equal(resultDiscount3Decimals.success, false, "10.555 must fail discountValueSchema");
    if (!resultDiscount3Decimals.success) {
      assert.ok(
        resultDiscount3Decimals.error.issues[0].message.includes("2 decimal places"),
        "Discount error message must specify up to 2 decimal places"
      );
    }
  });

  await suite.test("3. Reverse Charge VAT: Client preview perfectly synchronizes with server calculation", () => {
    const reverseChargeCode = context.sqlite
      .prepare("SELECT id, rate_basis_points, direction, vat_category FROM tax_codes WHERE vat_category = 'reverse_charge' LIMIT 1")
      .get() as any;

    assert.ok(reverseChargeCode, "Reverse charge tax code must exist in seed data");

    const taxOptions = [
      {
        id: reverseChargeCode.id,
        name: "Reverse Charge 5%",
        rateBasisPoints: reverseChargeCode.rate_basis_points,
        vatCategory: reverseChargeCode.vat_category,
      },
    ];

    const expenseAccount = context.sqlite
      .prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1")
      .get() as any;

    // --- Exclusive calculation test ---
    // 100.00 AED net, 5% reverse charge VAT
    const clientPreviewExclusive = previewDocumentLine(
      {
        unitPrice: "100.00",
        quantity: "1",
        discountType: "none",
        discountValue: "0",
        taxCodeId: reverseChargeCode.id,
      },
      taxOptions,
      2,
      false // amountsIncludeTax = false
    );

    const serverStoredLinesExclusive = calculateLines(
      context.sqlite,
      [
        {
          description: "Cross-border B2B software license",
          quantity: "1",
          unitPrice: "100.00",
          discountType: "none",
          discountValue: "0",
          expenseAccountId: expenseAccount.id,
          taxCodeId: reverseChargeCode.id,
        },
      ],
      2,
      {
        accountTypeFilter: "expense",
        accountFieldOnLine: "expenseAccountId",
        taxDirection: "purchases",
        supportItems: false,
        amountsIncludeTax: false,
      }
    );

    const serverTotalsExclusive = totalsForLines(serverStoredLinesExclusive);

    // Client grossMinor must equal netMinor (100.00 AED = 10000 minor)
    assert.equal(clientPreviewExclusive.netMinor, 10000, "Client net must be 10000");
    assert.equal(clientPreviewExclusive.taxMinor, 500, "Client tax must be 500 (recorded for VAT return)");
    assert.equal(
      clientPreviewExclusive.grossMinor,
      10000,
      "Client gross payable must be 10000 (vendor payable is net under Reverse Charge)"
    );

    // Server parity check
    assert.equal(serverStoredLinesExclusive[0].netAmountMinor, 10000, "Server net must be 10000");
    assert.equal(serverStoredLinesExclusive[0].taxAmountMinor, 500, "Server tax must be 500");
    assert.equal(serverStoredLinesExclusive[0].grossAmountMinor, 10000, "Server gross must be 10000");
    assert.equal(serverTotalsExclusive.totalMinor, 10000, "Server totalMinor must be 10000");

    // Client preview and server totals are 100% synchronized!
    assert.equal(
      clientPreviewExclusive.grossMinor,
      serverStoredLinesExclusive[0].grossAmountMinor,
      "Client preview and server line gross must match exactly"
    );

    // --- Inclusive calculation test ---
    const clientPreviewInclusive = previewDocumentLine(
      {
        unitPrice: "100.00",
        quantity: "1",
        discountType: "none",
        discountValue: "0",
        taxCodeId: reverseChargeCode.id,
      },
      taxOptions,
      2,
      true // amountsIncludeTax = true
    );

    const serverStoredLinesInclusive = calculateLines(
      context.sqlite,
      [
        {
          description: "Cross-border B2B software license",
          quantity: "1",
          unitPrice: "100.00",
          discountType: "none",
          discountValue: "0",
          expenseAccountId: expenseAccount.id,
          taxCodeId: reverseChargeCode.id,
        },
      ],
      2,
      {
        accountTypeFilter: "expense",
        accountFieldOnLine: "expenseAccountId",
        taxDirection: "purchases",
        supportItems: false,
        amountsIncludeTax: true,
      }
    );

    assert.equal(clientPreviewInclusive.grossMinor, 10000);
    assert.equal(clientPreviewInclusive.netMinor, 10000);
    assert.equal(clientPreviewInclusive.taxMinor, 0);

    assert.equal(serverStoredLinesInclusive[0].grossAmountMinor, 10000);
    assert.equal(serverStoredLinesInclusive[0].netAmountMinor, 10000);
    assert.equal(serverStoredLinesInclusive[0].taxAmountMinor, 0);

    assert.equal(
      clientPreviewInclusive.grossMinor,
      serverStoredLinesInclusive[0].grossAmountMinor,
      "Client preview and server inclusive calculation must match exactly"
    );

    // Verify grand total parity: previews.reduce(sum + grossMinor) matches server totals
    const clientGrandTotalExclusive = [clientPreviewExclusive].reduce((sum, row) => sum + row.grossMinor, 0);
    assert.equal(
      clientGrandTotalExclusive,
      serverTotalsExclusive.totalMinor,
      "Client grand total must equal server totalMinor under Reverse Charge (100.00 AED, not 105.00 AED)"
    );
    assert.equal(clientGrandTotalExclusive, 10000, "Grand total must be 100.00 AED vendor payable");
  });

  await suite.test("4. Multi-row TSV clipboard paste parser correctly extracts rows and cell data", async () => {
    const { parseTSV } = await import("../src/components/documents/grid/document-grid");

    // Standard tab-delimited text
    const rawTSV = "Widget Alpha\t5\t25.00\r\nWidget Beta\t10\t12.50\r\nWidget Gamma\t1\t99.00";
    const rows = parseTSV(rawTSV);

    assert.equal(rows.length, 3, "Must parse 3 rows");
    assert.deepEqual(rows[0], ["Widget Alpha", "5", "25.00"]);
    assert.deepEqual(rows[1], ["Widget Beta", "10", "12.50"]);
    assert.deepEqual(rows[2], ["Widget Gamma", "1", "99.00"]);

    // Quoted strings with commas and escaped quotes from Excel
    const excelExport = '"Widget, Special"\t10\t15.50\n"15"" Screen"\t2\t150.00';
    const parsedExcel = parseTSV(excelExport);
    assert.equal(parsedExcel.length, 2);
    assert.deepEqual(parsedExcel[0], ['Widget, Special', '10', '15.50']);
    assert.deepEqual(parsedExcel[1], ['15" Screen', '2', '150.00']);

    // Quoted multiline cells
    const multilineTSV = '"Consulting Services\nPhase 1 Milestone"\t1\t5000.00\nWidget Standard\t2\t50.00';
    const parsedMultiline = parseTSV(multilineTSV);
    assert.equal(parsedMultiline.length, 2);
    assert.equal(parsedMultiline[0][0], "Consulting Services\nPhase 1 Milestone");
    assert.equal(parsedMultiline[0][1], "1");
    assert.equal(parsedMultiline[0][2], "5000.00");
    assert.deepEqual(parsedMultiline[1], ["Widget Standard", "2", "50.00"]);
  });

  await suite.test("5. Currency formatting robustness: lowercase and uppercase codes match expected precision", () => {
    assert.equal(formatMoney(1500, "kwd"), "KWD\u00a01.500", "Lowercase kwd must use 3 decimal places");
    assert.equal(formatMoney(1500, "KWD"), "KWD\u00a01.500", "Uppercase KWD must use 3 decimal places");
    assert.equal(formatMoney(1500, "jpy"), "JPY\u00a01,500", "Lowercase jpy must use 0 decimal places");
    assert.equal(formatMoney(1000, "aed"), "AED\u00a010.00", "Lowercase aed must use 2 decimal places");
  });
});
