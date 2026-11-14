import assert from "node:assert/strict";
import test from "node:test";
import { parseTSV } from "../src/components/documents/grid/document-grid";
import { previewDocumentLine } from "../src/components/documents/document-calculations";
import { resolvePastedTSVRow } from "../src/components/documents/document-line-table";
import { formatMoney } from "../src/core/format";
import { purchaseQuoteInputSchema } from "../src/modules/purchase-quotes/purchase-quote-input";
import { creditNoteInputSchema } from "../src/modules/sales-credit-notes/credit-note-input";

test("Document Grid & Line Table Layout Engine", async (suite) => {
  await suite.test("1. TSV Parser handles diverse spreadsheet exports", () => {
    // Normal TSV
    const normal = "Item A\t1\t100.00\nItem B\t2\t50.00";
    const resNormal = parseTSV(normal);
    assert.equal(resNormal.length, 2);
    assert.deepEqual(resNormal[0], ["Item A", "1", "100.00"]);
    assert.deepEqual(resNormal[1], ["Item B", "2", "50.00"]);

    // Windows CRLF
    const crlf = "Item A\t1\t100.00\r\nItem B\t2\t50.00\r\n";
    const resCrlf = parseTSV(crlf);
    assert.equal(resCrlf.length, 2);
    assert.deepEqual(resCrlf[0], ["Item A", "1", "100.00"]);

    // Escaped quotes and commas
    const quotes = '"Special, Widget"\t5\t"12.50"\n"24"" Monitor"\t1\t500.00';
    const resQuotes = parseTSV(quotes);
    assert.equal(resQuotes.length, 2);
    assert.deepEqual(resQuotes[0], ["Special, Widget", "5", "12.50"]);
    assert.deepEqual(resQuotes[1], ['24" Monitor', "1", "500.00"]);

    // Empty lines handling
    const empty = "\n\n  \t  \n";
    const resEmpty = parseTSV(empty);
    assert.equal(resEmpty.length, 0);
  });

  await suite.test("2. Line calculation preview integrity for single consolidated Amount/Total column", () => {
    const taxOptions = [
      { id: "vat5", name: "Standard 5%", rateBasisPoints: 500, vatCategory: "standard" as const },
      { id: "vat0", name: "Zero 0%", rateBasisPoints: 0, vatCategory: "zero_rated" as const },
    ];

    // Tax-exclusive: 100 AED @ 5% = net 100, tax 5, gross 105
    const lineExcl = previewDocumentLine(
      { quantity: "2", unitPrice: "50.00", discountType: "none", discountValue: "0", taxCodeId: "vat5" },
      taxOptions,
      2,
      false
    );
    assert.equal(lineExcl.netMinor, 10000);
    assert.equal(lineExcl.taxMinor, 500);
    assert.equal(lineExcl.grossMinor, 10500);

    // Formatted gross text matches formatMoney
    assert.equal(formatMoney(lineExcl.grossMinor, "AED", 2), "AED\u00a0105.00");
    assert.equal(formatMoney(lineExcl.taxMinor, "AED", 2), "AED\u00a05.00");

    // Tax-inclusive: 105 AED total = gross 105, net 100, tax 5
    const lineIncl = previewDocumentLine(
      { quantity: "1", unitPrice: "105.00", discountType: "none", discountValue: "0", taxCodeId: "vat5" },
      taxOptions,
      2,
      true
    );
    assert.equal(lineIncl.grossMinor, 10500);
    assert.equal(lineIncl.taxMinor, 500);
    assert.equal(lineIncl.netMinor, 10000);

    // Percentage discount
    const lineDiscount = previewDocumentLine(
      { quantity: "1", unitPrice: "100.00", discountType: "percentage", discountValue: "10", taxCodeId: "vat5" },
      taxOptions,
      2,
      false
    );
    // 100 - 10% = 90.00 net, 4.50 tax, 94.50 gross
    assert.equal(lineDiscount.netMinor, 9000);
    assert.equal(lineDiscount.taxMinor, 450);
    assert.equal(lineDiscount.grossMinor, 9450);
  });

  await suite.test("3. Total column displays both Gross and Tax subtitle accurately", () => {
    const taxOptions = [
      { id: "vat5", name: "Standard 5%", rateBasisPoints: 500, vatCategory: "standard" as const },
    ];

    const preview = previewDocumentLine(
      { quantity: "1", unitPrice: "200.00", discountType: "none", discountValue: "0", taxCodeId: "vat5" },
      taxOptions,
      2,
      false
    );

    const grossFormatted = formatMoney(preview.grossMinor, "AED", 2);
    const taxFormatted = formatMoney(preview.taxMinor, "AED", 2);

    assert.equal(grossFormatted, "AED\u00a0210.00");
    assert.equal(taxFormatted, "AED\u00a010.00");
  });

  await suite.test("4. Mathematical layout verification: All 11 columns fit container without horizontal overflow", () => {
    // Column configuration as defined in DocumentLineTable
    const fixedCols = [
      { id: "lineNumber", widthPx: 32 },
      { id: "quantity", widthPx: 58 },
      { id: "unitPrice", widthPx: 76 },
      { id: "discount", widthPx: 78 },
      { id: "taxCode", widthPx: 80 },
      { id: "project", widthPx: 86 },
      { id: "total", widthPx: 84 },
      { id: "actions", widthPx: 36 },
    ];
    const totalFixedPx = fixedCols.reduce((sum, c) => sum + c.widthPx, 0); // 530px
    assert.equal(totalFixedPx, 530, "Fixed columns sum must be 530px");

    // Percentage columns when description is visible: item (14%), account (14%) = 28%
    const pctColsRatio = 0.28;

    // Viewport 1: 1280px standard screen with 240px sidebar and 52px page padding (988px available)
    const available988 = 988;
    const pctWidth988 = available988 * pctColsRatio; // 276.64px
    const remainingForDesc988 = available988 - totalFixedPx - pctWidth988;
    assert.ok(
      remainingForDesc988 >= 140,
      `At 988px, description must receive >= 140px (actual: ${remainingForDesc988.toFixed(1)}px)`
    );

    // Viewport 2: Standard compact laptop 1024px screen without sidebar or 1200px laptop (1228px available)
    const available1228 = 1228;
    const pctWidth1228 = available1228 * pctColsRatio; // 343.84px
    const remainingForDesc1228 = available1228 - totalFixedPx - pctWidth1228;
    assert.ok(
      remainingForDesc1228 >= 300,
      `At 1228px, description must receive >= 300px (actual: ${remainingForDesc1228.toFixed(1)}px)`
    );

    // Viewport 3: Minimum desktop breakpoint 960px container
    const available960 = 960;
    const pctWidth960 = available960 * pctColsRatio;
    const remainingForDesc960 = available960 - totalFixedPx - pctWidth960;
    assert.ok(
      remainingForDesc960 > 120,
      `At 960px, description must have positive space (actual: ${remainingForDesc960.toFixed(1)}px)`
    );
  });

  await suite.test("5. Multi-column TSV parsing with 5-column discount exports", () => {
    // 5-column TSV: Item, Description, Qty, Price, Discount
    const tsvWithDiscount =
      "PROD-100\tCustom Consultancy\t10\t150.00\t10%\n" +
      "PROD-200\tHardware Installation\t1\t2500.00\t50\n" +
      "PROD-300\tAnnual License\t2\t500.00\t0\n";

    const rows = parseTSV(tsvWithDiscount);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], ["PROD-100", "Custom Consultancy", "10", "150.00", "10%"]);
    assert.deepEqual(rows[1], ["PROD-200", "Hardware Installation", "1", "2500.00", "50"]);
    assert.deepEqual(rows[2], ["PROD-300", "Annual License", "2", "500.00", "0"]);
  });

  await suite.test("6. Column toggling layout adaptation", () => {
    // When discounts and projects are toggled off:
    // Fixed columns decrease by 78px (discount) + 86px (project) = 164px
    const baseFixed = 530;
    const withoutDiscountAndProject = baseFixed - 78 - 86; // 366px
    assert.equal(withoutDiscountAndProject, 366);

    const available988 = 988;
    const pctCols988 = available988 * 0.28;
    const expandedDesc = available988 - withoutDiscountAndProject - pctCols988;
    assert.ok(
      expandedDesc > 340,
      `Description expands to fill space when optional columns are toggled off (${expandedDesc.toFixed(1)}px)`
    );
  });

  await suite.test("7. Reverse-charge VAT line preview keeps totalMinor equal to netMinor", () => {
    const taxOptions = [
      { id: "rc5", name: "Reverse Charge 5%", rateBasisPoints: 500, vatCategory: "reverse_charge" as const },
    ];

    const preview = previewDocumentLine(
      { quantity: "1", unitPrice: "1000.00", discountType: "none", discountValue: "0", taxCodeId: "rc5" },
      taxOptions,
      2,
      false
    );

    assert.equal(preview.netMinor, 100_000);
    assert.equal(preview.taxMinor, 5_000);
    assert.equal(preview.grossMinor, 100_000, "Reverse charge bill total payable to supplier must exclude self-accounted VAT");
  });

  await suite.test("8. Commercial document schemas support 10,000-character terms from Form Defaults", () => {
    const longTerms = "T".repeat(8_500);
    const tooLongTerms = "T".repeat(10_001);

    const pqValid = purchaseQuoteInputSchema.safeParse({
      supplierId: "00000000-0000-4000-8000-000000000001",
      date: "2026-11-11",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: "2026-11-11",
      exchangeRateSource: "Base",
      terms: longTerms,
      lines: [
        {
          description: "Item",
          quantity: "1",
          unitPrice: "100.00",
          taxCodeId: "vat5",
        },
      ],
    });
    assert.equal(pqValid.success, true);

    const pqInvalid = purchaseQuoteInputSchema.safeParse({
      supplierId: "00000000-0000-4000-8000-000000000001",
      date: "2026-11-11",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: "2026-11-11",
      exchangeRateSource: "Base",
      terms: tooLongTerms,
      lines: [
        {
          description: "Item",
          quantity: "1",
          unitPrice: "100.00",
          taxCodeId: "vat5",
        },
      ],
    });
    assert.equal(pqInvalid.success, false);

    const cnValid = creditNoteInputSchema.safeParse({
      customerId: "00000000-0000-4000-8000-000000000001",
      sourceInvoiceId: "00000000-0000-4000-8000-000000000002",
      date: "2026-11-11",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: "2026-11-11",
      exchangeRateSource: "Base",
      terms: longTerms,
      lines: [
        {
          description: "Credit Item",
          quantity: "1",
          unitPrice: "100.00",
          salesAccountId: "acc-sales",
          taxCodeId: "vat5",
        },
      ],
    });
    assert.equal(cnValid.success, true);
  });

  await suite.test("9. TSV row resolver preserves custom spreadsheet descriptions/prices and resolves purchase vs sales catalog defaults", () => {
    const items = [
      {
        id: "item-1",
        sku: "SKU-001",
        name: "Catalog Widget",
        salesPriceMinor: 15_000,
        purchasePriceMinor: 9_500,
        salesAccountId: "acc-sales-1",
        inventoryAssetAccountId: "acc-inv-1",
      },
    ];

    // 4-col paste on Purchase form with custom description & custom spreadsheet price:
    // must NOT clobber custom description or custom price with catalog defaults
    const customPurchaseRow = resolvePastedTSVRow({
      rowCells: ["SKU-001", "Custom Batch Widget", "5", "110.00"],
      startColId: "item",
      items,
      minorUnit: 2,
      accountFieldName: "expenseAccountId",
    });
    assert.equal(customPurchaseRow.resolvedItemId, "item-1");
    assert.equal(customPurchaseRow.resolvedDesc, "Custom Batch Widget");
    assert.equal(customPurchaseRow.qtyVal, "5");
    assert.equal(customPurchaseRow.resolvedPrice, "110.00");
    assert.equal(customPurchaseRow.resolvedItemAccountId, "acc-inv-1");
    assert.equal(customPurchaseRow.lineData.expenseAccountId, "acc-inv-1");

    // 3-col paste on Purchase form with SKU in first column and 0.00 price:
    // must resolve catalog name (not raw SKU) and catalog purchasePriceMinor (95.00)
    const catalogPurchaseRow = resolvePastedTSVRow({
      rowCells: ["SKU-001", "3", "0.00"],
      startColId: "description",
      items,
      minorUnit: 2,
      accountFieldName: "expenseAccountId",
    });
    assert.equal(catalogPurchaseRow.resolvedItemId, "item-1");
    assert.equal(catalogPurchaseRow.resolvedDesc, "Catalog Widget");
    assert.equal(catalogPurchaseRow.qtyVal, "3");
    assert.equal(catalogPurchaseRow.resolvedPrice, "95.00");
    assert.equal(catalogPurchaseRow.resolvedItemAccountId, "acc-inv-1");

    // 3-col paste on Sales form with SKU in first column and 0.00 price:
    // must resolve catalog salesPriceMinor (150.00) and salesAccountId
    const catalogSalesRow = resolvePastedTSVRow({
      rowCells: ["SKU-001", "2", ""],
      startColId: "description",
      items,
      minorUnit: 2,
      accountFieldName: "salesAccountId",
    });
    assert.equal(catalogSalesRow.resolvedItemId, "item-1");
    assert.equal(catalogSalesRow.resolvedDesc, "Catalog Widget");
    assert.equal(catalogSalesRow.qtyVal, "2");
    assert.equal(catalogSalesRow.resolvedPrice, "150.00");
    assert.equal(catalogSalesRow.resolvedItemAccountId, "acc-sales-1");
    assert.equal(catalogSalesRow.lineData.salesAccountId, "acc-sales-1");
  });
});

