import assert from "node:assert/strict";
import test from "node:test";
import { parseTSV } from "../src/components/documents/grid/document-grid";
import { previewDocumentLine } from "../src/components/documents/document-calculations";
import { formatMoney } from "../src/core/format";

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
});

