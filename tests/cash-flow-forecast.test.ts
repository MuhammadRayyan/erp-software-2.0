import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-cash-flow-")),
  BETTER_AUTH_SECRET: "cash-flow-test-secret-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createBusiness } = await import("../src/core/businesses/business-service");

test("Cash Flow & Liquidity Forecast Engine", async (t) => {
  const seed = await seedDemoData();
  const userId = seed.admin.id;
  const isolated = createBusiness(
    { name: "Cash Flow Isolated Business", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 1 },
    userId,
  );
  const businessId = isolated.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const { createCustomer } = await import("../src/modules/customers/customer-service");
  const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
  const { createInvoice } = await import("../src/modules/sales-invoices/invoice-service");
  const { savePurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
  const { getCashFlowForecast } = await import("../src/modules/reports/cash-flow-forecast-service");

  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
  const zeroTax = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1").get() ?? sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };

  const customerId = createCustomer(businessId, userId, {
    name: "Al Majed Technologies",
    email: "finance@almajed.ae",
  });

  const supplierId = createSupplier(businessId, userId, {
    name: "Apex Data Centers LLC",
    email: "billing@apexdata.ae",
  });

  const baseToday = "2026-11-01";

  // Create a posted Sales Invoice due in 5 days (Nov 6) for 10,000 AED
  createInvoice(businessId, userId, {
    customerId,
    invoiceDate: "2026-10-25",
    taxDate: "2026-10-25",
    dueDate: "2026-11-06",
    lines: [
      {
        description: "Server Migration Services",
        quantity: "1",
        unitPrice: "10000.00",
        salesAccountId: incomeAccount.id,
        taxCodeId: zeroTax.id,
        discountType: "none",
        discountValue: "0",
      },
    ],
  }, "post");

  // Create a posted Sales Invoice due in 45 days (Dec 16) for 15,000 AED
  createInvoice(businessId, userId, {
    customerId,
    invoiceDate: "2026-10-25",
    taxDate: "2026-10-25",
    dueDate: "2026-12-16",
    lines: [
      {
        description: "Annual Maintenance Retainer",
        quantity: "1",
        unitPrice: "15000.00",
        salesAccountId: incomeAccount.id,
        taxCodeId: zeroTax.id,
        discountType: "none",
        discountValue: "0",
      },
    ],
  }, "post");

  // Create an overdue Sales Invoice due 5 days ago (Oct 27) for 4,000 AED
  createInvoice(businessId, userId, {
    customerId,
    invoiceDate: "2026-10-10",
    taxDate: "2026-10-10",
    dueDate: "2026-10-27",
    lines: [
      {
        description: "Consulting - Past Due",
        quantity: "1",
        unitPrice: "4000.00",
        salesAccountId: incomeAccount.id,
        taxCodeId: zeroTax.id,
        discountType: "none",
        discountValue: "0",
      },
    ],
  }, "post");

  // Create a posted Purchase Bill due in 10 days (Nov 11) for 6,000 AED
  savePurchaseInvoice(businessId, userId, {
    supplierId,
    supplierInvoiceNumber: "APEX-INV-9901",
    invoiceDate: "2026-10-20",
    taxDate: "2026-10-20",
    dueDate: "2026-11-11",
    lines: [
      {
        description: "Cloud Hosting - Nov",
        quantity: "1",
        unitPrice: "6000.00",
        expenseAccountId: expenseAccount.id,
        taxCodeId: zeroTax.id,
        discountType: "none",
        discountValue: "0",
      },
    ],
  }, "post");

  // Create an overdue Purchase Bill due 3 days ago (Oct 29) for 2,500 AED
  savePurchaseInvoice(businessId, userId, {
    supplierId,
    supplierInvoiceNumber: "APEX-INV-8877",
    invoiceDate: "2026-10-05",
    taxDate: "2026-10-05",
    dueDate: "2026-10-29",
    lines: [
      {
        description: "Fiber Link - Overdue",
        quantity: "1",
        unitPrice: "2500.00",
        expenseAccountId: expenseAccount.id,
        taxCodeId: zeroTax.id,
        discountType: "none",
        discountValue: "0",
      },
    ],
  }, "post");

  await t.test("1. 30-Day Forecast calculations", () => {
    const forecast30 = getCashFlowForecast(businessId, userId, {
      horizonDays: 30,
      asOfDate: baseToday,
    });

    assert.equal(forecast30.summary.horizonDays, 30);
    assert.equal(forecast30.summary.asOfDate, baseToday);
    assert.ok(forecast30.accounts.length > 0, "Liquid accounts found");

    // Overdue items check
    assert.equal(forecast30.summary.overdueInflowsMinor, 400000, "4,000 AED overdue customer invoice");
    assert.equal(forecast30.summary.overdueOutflowsMinor, 250000, "2,500 AED overdue supplier bill");

    // Inflows within 30 days:
    // Overdue: 4,000 AED
    // Nov 6 (5 days out): 10,000 AED
    // Total 30d inflows = 14,000 AED = 1,400,000 minor
    assert.equal(forecast30.summary.totalInflowsMinor, 1400000);

    // Outflows within 30 days:
    // Overdue: 2,500 AED
    // Nov 11 (10 days out): 6,000 AED
    // Total 30d outflows = 8,500 AED = 850,000 minor
    assert.equal(forecast30.summary.totalOutflowsMinor, 850000);

    // Net cash flow = 14,000 - 8,500 = +5,500 AED = +550,000 minor
    assert.equal(forecast30.summary.netCashFlowMinor, 550000);
    assert.equal(
      forecast30.summary.projectedClosingCashMinor,
      forecast30.summary.startingCashMinor + 550000,
    );

    // Daily ledger checks
    assert.equal(forecast30.dailyLedger.length, 31); // day 0 through day 30
    const day0 = forecast30.dailyLedger[0];
    assert.equal(day0.isToday, true);
    assert.equal(day0.date, baseToday);
    assert.equal(day0.inflowsMinor, 400000); // overdue inflow
    assert.equal(day0.outflowsMinor, 250000); // overdue outflow
    assert.equal(day0.netChangeMinor, 150000);

    // Day Nov 06 (offset 5)
    const day5 = forecast30.dailyLedger.find((d) => d.date === "2026-11-06");
    assert.ok(day5);
    assert.equal(day5.inflowsMinor, 1000000);
    assert.equal(day5.outflowsMinor, 0);

    // Day Nov 11 (offset 10)
    const day10 = forecast30.dailyLedger.find((d) => d.date === "2026-11-11");
    assert.ok(day10);
    assert.equal(day10.inflowsMinor, 0);
    assert.equal(day10.outflowsMinor, 600000);
  });

  await t.test("2. 60-Day Forecast captures day-45 invoice", () => {
    const forecast60 = getCashFlowForecast(businessId, userId, {
      horizonDays: 60,
      asOfDate: baseToday,
    });

    assert.equal(forecast60.summary.horizonDays, 60);

    // Dec 16 invoice (15,000 AED) is 45 days out, so it is included in 60d forecast!
    // Total inflows = 14,000 (from 30d) + 15,000 = 29,000 AED = 2,900,000 minor
    assert.equal(forecast60.summary.totalInflowsMinor, 2900000);

    // Bucket check: Dec 16 is in "31–60 Days"
    assert.equal(forecast60.summary.bucketSummaries.days31To60.inflowsMinor, 1500000);

    assert.equal(forecast60.dailyLedger.length, 61);
    const day45 = forecast60.dailyLedger.find((d) => d.date === "2026-12-16");
    assert.ok(day45);
    assert.equal(day45.inflowsMinor, 1500000);
  });
});
