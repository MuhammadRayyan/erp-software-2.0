import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatMoney, formatDate, minorToDecimalString } from "../src/core/format";

test("HR & Payroll Tables & Rows Theming Standardization Suite", async (t) => {
  const rootDir = process.cwd();

  await t.test("1. globals.css contains high-specificity table alignment & wrap classes", () => {
    const cssContent = fs.readFileSync(path.join(rootDir, "src/app/globals.css"), "utf-8");
    
    assert.ok(
      cssContent.includes(".data-table th.col-numeric"),
      "globals.css must define .data-table th.col-numeric to guarantee right alignment over th default"
    );
    assert.ok(
      cssContent.includes(".data-table td.col-numeric"),
      "globals.css must define .data-table td.col-numeric"
    );
    assert.ok(
      cssContent.includes(".data-table th.col-wrap"),
      "globals.css must define .data-table th.col-wrap"
    );
    assert.ok(
      cssContent.includes(".data-table td.col-wrap"),
      "globals.css must define .data-table td.col-wrap"
    );
  });

  await t.test("2. EmployeeTable adheres to global table architecture", () => {
    const employeeTableSrc = fs.readFileSync(
      path.join(rootDir, "src/modules/payroll/employee-table.tsx"),
      "utf-8"
    );

    // Density integration
    assert.ok(employeeTableSrc.includes("useTableDensity"), "EmployeeTable must use useTableDensity hook");
    assert.ok(employeeTableSrc.includes("<DensityToggle"), "EmployeeTable must render DensityToggle in toolbar");

    // Columns visibility integration
    assert.ok(employeeTableSrc.includes("useColumns"), "EmployeeTable must use useColumns hook");
    assert.ok(employeeTableSrc.includes('"payroll-employees"'), "EmployeeTable storageKey must be payroll-employees");
    assert.ok(employeeTableSrc.includes("{dropdown}"), "EmployeeTable must render columns dropdown");

    // Text wrapping & numeric alignment
    assert.ok(employeeTableSrc.includes("meta: { wrap: true }"), "EmployeeTable must have meta wrap true");
    assert.ok(employeeTableSrc.includes("meta: { numeric: true }"), "EmployeeTable must have numeric columns");
    assert.ok(employeeTableSrc.includes("enableHiding: false"), "EmployeeTable actions column must have enableHiding false");

    // TableTotalsBar conditional on filtered rows
    assert.ok(
      employeeTableSrc.includes("filteredRows.length > 0 &&"),
      "EmployeeTable must conditionally render TableTotalsBar only when results exist"
    );

    // Multi-currency support
    assert.ok(employeeTableSrc.includes("currency = \"AED\""), "EmployeeTable must support dynamic currency prop with AED fallback");
    assert.ok(employeeTableSrc.includes("formatDate("), "EmployeeTable must format dates using formatDate");
  });

  await t.test("3. PayslipTable adheres to global table architecture", () => {
    const payslipTableSrc = fs.readFileSync(
      path.join(rootDir, "src/modules/payroll/payslip-table.tsx"),
      "utf-8"
    );

    // Density integration
    assert.ok(payslipTableSrc.includes("useTableDensity"), "PayslipTable must use useTableDensity hook");
    assert.ok(payslipTableSrc.includes("<DensityToggle"), "PayslipTable must render DensityToggle in toolbar");

    // Columns visibility integration
    assert.ok(payslipTableSrc.includes("useColumns"), "PayslipTable must use useColumns hook");
    assert.ok(payslipTableSrc.includes('"payroll-payslips"'), "PayslipTable storageKey must be payroll-payslips");
    assert.ok(payslipTableSrc.includes("{dropdown}"), "PayslipTable must render columns dropdown");

    // Text wrapping & numeric alignment
    assert.ok(payslipTableSrc.includes("meta: { wrap: true }"), "PayslipTable must have meta wrap true");
    assert.ok(payslipTableSrc.includes("meta: { numeric: true }"), "PayslipTable must have numeric columns");
    assert.ok(payslipTableSrc.includes("enableHiding: false"), "PayslipTable actions column must have enableHiding false");

    // TableTotalsBar conditional
    assert.ok(
      payslipTableSrc.includes("filteredRows.length > 0 &&"),
      "PayslipTable must conditionally render TableTotalsBar only when results exist"
    );

    // Multi-currency & date formatting
    assert.ok(payslipTableSrc.includes("currency = \"AED\""), "PayslipTable must support dynamic currency prop");
    assert.ok(payslipTableSrc.includes("formatDate("), "PayslipTable must format dates using formatDate");
  });

  await t.test("4. PayRunDialog, EosbClient, ItemsClient & PayslipDetail use standardized tables & density", () => {
    const payRunSrc = fs.readFileSync(
      path.join(rootDir, "src/app/b/[businessId]/payroll/payslips/pay-run-dialog.tsx"),
      "utf-8"
    );
    assert.ok(payRunSrc.includes("useTableDensity"), "PayRunDialog must use useTableDensity");
    assert.ok(payRunSrc.includes('data-density={density}'), "PayRunDialog table must bind data-density");
    assert.ok(payRunSrc.includes('col-numeric text-right!'), "PayRunDialog header must have col-numeric right align");

    const eosbSrc = fs.readFileSync(
      path.join(rootDir, "src/app/b/[businessId]/payroll/eosb-calculator/eosb-client.tsx"),
      "utf-8"
    );
    assert.ok(eosbSrc.includes("useTableDensity"), "EosbClient must use useTableDensity");
    assert.ok(eosbSrc.includes("<DensityToggle"), "EosbClient must render DensityToggle");
    assert.ok(eosbSrc.includes('data-density={density}'), "EosbClient table must bind data-density");

    const itemsSrc = fs.readFileSync(
      path.join(rootDir, "src/app/b/[businessId]/payroll/items/items-client.tsx"),
      "utf-8"
    );
    assert.ok(itemsSrc.includes("useTableDensity"), "ItemsClient must use useTableDensity");
    assert.ok(itemsSrc.includes("<DensityToggle"), "ItemsClient must render DensityToggle");
    assert.ok(itemsSrc.includes('data-density={density}'), "ItemsClient table must bind data-density");
    assert.ok(itemsSrc.includes("<StatusBadge"), "ItemsClient must use global StatusBadge");

    const detailSrc = fs.readFileSync(
      path.join(rootDir, "src/app/b/[businessId]/payroll/payslips/[payslipId]/page.tsx"),
      "utf-8"
    );
    assert.ok(detailSrc.includes("currency"), "PayslipDetail must dynamically read business currency");
    assert.ok(detailSrc.includes("print-document-paper"), "PayslipDetail must have print styling classes");
    assert.ok(detailSrc.includes("col-numeric text-right!"), "PayslipDetail must have col-numeric text-right! headers");
  });

  await t.test("5. Currency formatting behaves correctly across multi-currency business profiles", () => {
    // AED (default)
    assert.equal(formatMoney(1050000, "AED"), "AED\u00a010,500.00");
    assert.equal(minorToDecimalString(1050000, "AED"), "10500.00");

    // USD
    assert.equal(formatMoney(250050, "USD"), "USD\u00a02,500.50");
    assert.equal(minorToDecimalString(250050, "USD"), "2500.50");

    // EUR
    assert.equal(formatMoney(340000, "EUR"), "EUR\u00a03,400.00");

    // Zero amounts
    assert.equal(formatMoney(0, "AED"), "AED\u00a00.00");
    assert.equal(formatMoney(0, "USD"), "USD\u00a00.00");

    // Date formatting helper
    assert.equal(formatDate("2026-04-01"), "01 Apr 2026");
    assert.equal(formatDate(""), "—");
    assert.equal(formatDate(null), "—");
    assert.equal(formatDate(undefined), "—");
  });
});
