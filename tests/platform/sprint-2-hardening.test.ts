import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import JSZip from "jszip";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-sprint-2-")),
  BETTER_AUTH_SECRET: "sprint-2-hardening-test-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { getBusinessPaths } = await import("../../src/core/db/paths");
const { createBusiness, getBusinessQuickKpis } = await import("../../src/core/businesses/business-service");
const { createBusinessBackupStream, importBusinessBackup } = await import("../../src/core/businesses/backup-service");
const {
  listTenantsWithStats,
  listBusinessesWithStats,
  getAdminOverviewStats,
  getAdminPageData,
} = await import("../../src/core/admin/tenant-service");
const { saveExchangeRate } = await import("../../src/modules/currency/exchange-rate");
const { createCustomer, listCustomersPaginated } = await import("../../src/modules/customers/customer-service");
const { createSupplier, listSuppliersPaginated } = await import("../../src/modules/suppliers/supplier-service");
const { createProject } = await import("../../src/modules/projects/project-service");
const {
  createInvoice,
  getOverviewInvoiceMetrics,
  listInvoiceFilterOptions,
  listInvoices,
  listInvoicesPaginated,
  voidInvoice,
} = await import("../../src/modules/sales-invoices/invoice-service");
const {
  listPurchaseInvoiceFilterOptions,
  listPurchaseInvoices,
  listPurchaseInvoicesPaginated,
  savePurchaseInvoice,
} = await import("../../src/modules/purchase-invoices/purchase-invoice-service");
const { createReceipt, listReceiptsPaginated } = await import("../../src/modules/receipts/receipt-service");
const {
  createSupplierPayment,
  listSupplierPaymentsPaginated,
} = await import("../../src/modules/supplier-payments/supplier-payment-service");
const {
  getDashboardCounts,
  getReceivablesAgingSummary,
} = await import("../../src/modules/reports/report-service");
const {
  collectStreamToBuffer,
  createStreamingZipStream,
  deduplicateArchiveFilename,
} = await import("../../src/lib/streaming-zip");
const { renderHtmlTemplate } = await import("../../src/modules/document-templates/html-templates/render");
const {
  closeHtmlPdfBrowser,
  getHtmlPdfPoolStats,
} = await import("../../src/modules/document-templates/html-templates/browser-pool");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const userId = seeded.admin.id;
const { sqlite } = getBusinessDb(businessId, userId);

after(async () => {
  await closeHtmlPdfBrowser();
});

function isoDateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function isoDateDaysAhead(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("Sprint 2 hardening verification suite", async (t) => {
  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') LIMIT 1").get() as { id: string };
  const zeroTax = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1").get()
    ?? sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get()) as { id: string };

  assert.ok(incomeAccount && expenseAccount && bankAccount && zeroTax, "Required base accounts/tax codes must exist");

  // Ensure USD currency is active and has CBUAE exchange rates for all test dates
  sqlite.prepare("UPDATE currencies SET is_active = 1 WHERE code = 'USD'").run();
  for (const rateDate of ["2026-04-10", "2026-04-15", "2026-05-01", "2026-07-01", "2026-08-10", "2026-09-10", "2026-09-15"]) {
    saveExchangeRate(businessId, userId, {
      currencyCode: "USD",
      rateDate,
      rateToBase: "3.6725",
      source: "CBUAE",
    });
  }

  const wildcardCustomerId = createCustomer(businessId, userId, {
    name: "Alpha 100%_Holdings LLC",
    email: "alpha-special@example.test",
    isActive: true,
  });
  const regularCustomerId = createCustomer(businessId, userId, {
    name: "Alpha 100XYZ Holdings LLC",
    email: "alpha-plain@example.test",
    isActive: true,
  });
  const usdCustomerId = createCustomer(businessId, userId, {
    name: "Pacific USD Client Corp",
    email: "usd-client@example.test",
    defaultCurrencyCode: "USD",
    isActive: true,
  });

  // Bulk customers (> 60 total) with an inactive customer
  createCustomer(businessId, userId, {
    name: "Dormant Archive Client",
    email: "dormant@example.test",
    isActive: false,
  });
  for (let i = 1; i <= 62; i++) {
    createCustomer(businessId, userId, {
      name: `Paged Customer ${String(i).padStart(2, "0")}`,
      email: `paged-cust-${i}@example.test`,
      isActive: true,
    });
  }

  const primarySupplierId = createSupplier(businessId, userId, {
    name: "Gulf Hardware 100%_Supply",
    email: "gulf-hw@example.test",
    isActive: true,
  });
  const usdSupplierId = createSupplier(businessId, userId, {
    name: "Global Freight USD Partners",
    email: "freight-usd@example.test",
    defaultCurrencyCode: "USD",
    isActive: true,
  });
  createSupplier(businessId, userId, {
    name: "Archived Inactive Vendor",
    email: "inactive-vendor@example.test",
    isActive: false,
  });
  for (let i = 1; i <= 62; i++) {
    createSupplier(businessId, userId, {
      name: `Paged Supplier ${String(i).padStart(2, "0")}`,
      email: `paged-supp-${i}@example.test`,
      isActive: true,
    });
  }

  const projectId = createProject(businessId, userId, {
    code: "S2-PROJ",
    name: "Sprint 2 Tower Automation",
    customerId: regularCustomerId,
    status: "active",
    description: "Project filter verification",
    startDate: "2026-01-01",
    targetEndDate: "2027-01-01",
    actualEndDate: "",
    budgetRevenue: "50000.00",
    budgetCost: "20000.00",
    managerName: "Project Lead",
  });

  await t.test("1. Sales & Purchase Invoices SQL CTE pagination (>60 rows), filtering, LIKE escaping, sorting, and DB-wide multi-currency summary", () => {
    const today = isoDateDaysAgo(0);
    const agingStartCustomers = [wildcardCustomerId, regularCustomerId];
    void agingStartCustomers;

    // Create 64 additional sales invoices across drafts, void, USD posted, AED posted, project-linked
    for (let i = 1; i <= 30; i++) {
      createInvoice(
        businessId,
        userId,
        {
          customerId: regularCustomerId,
          projectId: i === 1 ? projectId : undefined,
          invoiceDate: "2026-06-15",
          dueDate: isoDateDaysAhead(20),
          currencyCode: "AED",
          reference: i === 2 ? "REF-100%_MATCH" : `REF-${i}`,
          lines: [
            {
              description: `Posted Item ${i}`,
              quantity: "1",
              unitPrice: "100.00",
              salesAccountId: incomeAccount.id,
              taxCodeId: zeroTax.id,
            },
          ],
        },
        "post",
      );
    }

    for (let i = 1; i <= 20; i++) {
      createInvoice(
        businessId,
        userId,
        {
          customerId: usdCustomerId,
          invoiceDate: "2026-07-01",
          dueDate: isoDateDaysAhead(30),
          currencyCode: "USD",
          exchangeRateToBase: "3.6725",
          exchangeRateDate: "2026-07-01",
          exchangeRateSource: "CBUAE",
          lines: [
            {
              description: `Draft USD Item ${i}`,
              quantity: "1",
              unitPrice: "200.00",
              salesAccountId: incomeAccount.id,
              taxCodeId: zeroTax.id,
            },
          ],
        },
        i <= 10 ? "post" : "draft",
      );
    }

    const voidCandidateId = createInvoice(
      businessId,
      userId,
      {
        customerId: wildcardCustomerId,
        invoiceDate: today,
        dueDate: today,
        currencyCode: "AED",
        lines: [
          {
            description: "To Void Invoice",
            quantity: "1",
            unitPrice: "999.00",
            salesAccountId: incomeAccount.id,
            taxCodeId: zeroTax.id,
          },
        ],
      },
      "post",
    );
    voidInvoice(businessId, userId, voidCandidateId);

    for (let i = 1; i <= 14; i++) {
      createInvoice(
        businessId,
        userId,
        {
          customerId: regularCustomerId,
          invoiceDate: "2026-08-05",
          dueDate: "2026-09-05",
          currencyCode: "AED",
          lines: [
            {
              description: `Draft AED Item ${i}`,
              quantity: "1",
              unitPrice: "50.00",
              salesAccountId: incomeAccount.id,
              taxCodeId: zeroTax.id,
            },
          ],
        },
        "draft",
      );
    }

    const page1 = listInvoicesPaginated(businessId, userId, { page: 1, pageSize: 25 });
    const page2 = listInvoicesPaginated(businessId, userId, { page: 2, pageSize: 25 });
    assert.ok(page1.total > 60, `Expected >60 sales invoices, got ${page1.total}`);
    assert.strictEqual(page1.rows.length, 25);
    assert.strictEqual(page2.rows.length, 25);
    assert.ok(page1.totalPages >= 3);
    assert.notStrictEqual(page1.rows[0].id, page2.rows[0].id);

    // DB-wide multi-currency summary spans all pages (both AED and USD present, excludes void by default)
    const usdSummary = page1.summary.currencyTotals.find((c) => c.currencyCode === "USD");
    const aedSummary = page1.summary.currencyTotals.find((c) => c.currencyCode === "AED");
    const expectedAllUsdMinor = (
      sqlite
        .prepare("SELECT COALESCE(SUM(total_minor), 0) AS s FROM sales_invoices WHERE currency_code = 'USD' AND document_status <> 'void'")
        .get() as { s: number }
    ).s;
    assert.strictEqual(usdSummary?.totalMinor, expectedAllUsdMinor, "USD DB-wide total should sum all non-void USD invoices across pages");
    const smallPageUsd = listInvoicesPaginated(businessId, userId, { customerId: usdCustomerId, pageSize: 25 });
    assert.strictEqual(smallPageUsd.summary.currencyTotals[0]?.totalMinor, 20 * 20_000, "Customer-filtered USD total spans all invoices");
    assert.ok(aedSummary && page1.summary.filteredTotal === page1.total);

    // Literal LIKE escaping: "100%_MATCH" matches only the exact literal pattern invoice, not regular ones
    const wildcardSearch = listInvoicesPaginated(businessId, userId, { q: "100%_Holdings", pageSize: 50 });
    assert.strictEqual(wildcardSearch.total, 1, "Escaped %_ search must match only literal 100%_Holdings");
    assert.strictEqual(wildcardSearch.rows[0].customerId, wildcardCustomerId);

    // Status filters: void vs draft vs project filter vs server sorting
    const voidList = listInvoicesPaginated(businessId, userId, { status: "document:void" });
    assert.ok(voidList.rows.some((r) => r.id === voidCandidateId));
    assert.ok(voidList.summary.currencyTotals.some((c) => c.totalMinor >= 99_900), "Void filter includes voided totalMinor");

    const projectFiltered = listInvoicesPaginated(businessId, userId, { projectId });
    assert.ok(projectFiltered.rows.some((r) => r.projectIds.includes(projectId)));

    const sortedDesc = listInvoicesPaginated(businessId, userId, { sort: "totalMinor", dir: "desc", pageSize: 25 });
    for (let i = 1; i < sortedDesc.rows.length; i++) {
      assert.ok(sortedDesc.rows[i - 1].totalMinor >= sortedDesc.rows[i].totalMinor, "Expected descending totalMinor order");
    }

    const filterOpts = listInvoiceFilterOptions(businessId, userId);
    assert.ok(filterOpts.customers.some(([id]) => id === wildcardCustomerId));
    assert.ok(filterOpts.projects.some(([id]) => id === projectId));

    // Legacy listInvoices compatibility
    const unpaginatedCount = listInvoices(businessId, userId).length;
    assert.strictEqual(unpaginatedCount, page1.total);

    // Purchase Invoices > 60 rows
    for (let i = 1; i <= 62; i++) {
      const piDate = i <= 30 ? "2026-05-01" : "2026-08-10";
      const isUsd = i % 2 !== 0;
      savePurchaseInvoice(
        businessId,
        userId,
        {
          supplierId: isUsd ? usdSupplierId : primarySupplierId,
          supplierInvoiceNumber: `SUPP-60-${i}`,
          invoiceDate: piDate,
          dueDate: isoDateDaysAhead(15),
          currencyCode: isUsd ? "USD" : "AED",
          ...(isUsd
            ? {
                exchangeRateToBase: "3.6725",
                exchangeRateDate: piDate,
                exchangeRateSource: "CBUAE" as const,
              }
            : {}),
          projectId: i === 1 ? projectId : undefined,
          lines: [
            {
              description: `Purchase Line ${i}`,
              quantity: "1",
              unitPrice: isUsd ? "150.00" : "400.00",
              expenseAccountId: expenseAccount.id,
              taxCodeId: zeroTax.id,
            },
          ],
        },
        i <= 50 ? "post" : "draft",
      );
    }

    const piPage1 = listPurchaseInvoicesPaginated(businessId, userId, { page: 1, pageSize: 25 });
    const piPage2 = listPurchaseInvoicesPaginated(businessId, userId, { page: 2, pageSize: 25 });
    assert.ok(piPage1.total > 60, `Expected >60 purchase invoices, got ${piPage1.total}`);
    assert.strictEqual(piPage1.rows.length, 25);
    assert.strictEqual(piPage2.rows.length, 25);
    assert.strictEqual(piPage1.summary.filteredTotal, piPage1.total);
    assert.ok(piPage1.summary.currencyTotals.some((c) => c.currencyCode === "USD"));
    assert.ok(piPage1.summary.currencyTotals.some((c) => c.currencyCode === "AED"));

    const piSortedAsc = listPurchaseInvoicesPaginated(businessId, userId, { sort: "total", dir: "asc", pageSize: 25 });
    for (let i = 1; i < piSortedAsc.rows.length; i++) {
      assert.ok(piSortedAsc.rows[i - 1].total_minor <= piSortedAsc.rows[i].total_minor);
    }
    const piFilters = listPurchaseInvoiceFilterOptions(businessId, userId);
    assert.ok(piFilters.suppliers.some(([id]) => id === primarySupplierId));
    assert.strictEqual(listPurchaseInvoices(businessId, userId).length, piPage1.total);
  });

  await t.test("2. Customers, Suppliers, Receipts, & Supplier Payments server pagination (>60 rows), search, status, sorting & DB-wide summary", () => {
    const custPage1 = listCustomersPaginated(businessId, userId, { page: 1, pageSize: 25, sort: "name", dir: "asc" });
    const custPage2 = listCustomersPaginated(businessId, userId, { page: 2, pageSize: 25, sort: "name", dir: "asc" });
    assert.ok(custPage1.total > 60);
    assert.strictEqual(custPage1.rows.length, 25);
    assert.strictEqual(custPage2.rows.length, 25);
    assert.ok(custPage1.summary.unfilteredTotal > custPage1.summary.activeCount);
    const inactiveCust = listCustomersPaginated(businessId, userId, { status: "inactive" });
    assert.ok(inactiveCust.rows.every((r) => !r.isActive));
    assert.ok(inactiveCust.total >= 1);
    const wildcardCust = listCustomersPaginated(businessId, userId, { q: "100%_" });
    assert.strictEqual(wildcardCust.total, 1);
    assert.strictEqual(wildcardCust.rows[0]?.id, wildcardCustomerId);

    const suppPage1 = listSuppliersPaginated(businessId, userId, {
      page: 1,
      pageSize: 25,
      sort: "outstanding",
      dir: "desc",
    });
    assert.ok(suppPage1.total > 60);
    assert.strictEqual(suppPage1.rows.length, 25);
    assert.ok(suppPage1.summary.totalOutstandingMinor > 0);
    const outstandingOf = (s: { total_purchased_minor: number; total_paid_minor: number }) =>
      Math.max(0, s.total_purchased_minor - s.total_paid_minor);
    for (let i = 1; i < suppPage1.rows.length; i++) {
      assert.ok(outstandingOf(suppPage1.rows[i - 1]) >= outstandingOf(suppPage1.rows[i]));
    }

    // Create 62 Receipts & 62 Supplier Payments
    for (let i = 1; i <= 62; i++) {
      const isUsd = i % 2 !== 0;
      const receiptDate = i <= 30 ? "2026-04-10" : "2026-09-10";
      const paymentDate = i <= 30 ? "2026-04-15" : "2026-09-15";
      createReceipt(businessId, userId, {
        customerId: isUsd ? usdCustomerId : wildcardCustomerId,
        date: receiptDate,
        bankAccountId: bankAccount.id,
        amount: "25.00",
        currencyCode: isUsd ? "USD" : "AED",
        ...(isUsd
          ? {
              exchangeRateToBase: "3.6725",
              exchangeRateDate: receiptDate,
              exchangeRateSource: "CBUAE" as const,
            }
          : {}),
        reference: `RCPT-REF-${i}`,
        description: "Sprint 2 bulk receipt",
      });
      createSupplierPayment(businessId, userId, {
        supplierId: isUsd ? usdSupplierId : primarySupplierId,
        date: paymentDate,
        bankAccountId: bankAccount.id,
        amount: "30.00",
        currencyCode: isUsd ? "USD" : "AED",
        ...(isUsd
          ? {
              exchangeRateToBase: "3.6725",
              exchangeRateDate: paymentDate,
              exchangeRateSource: "CBUAE" as const,
            }
          : {}),
        reference: `PAY-REF-${i}`,
        description: "Sprint 2 bulk supplier payment",
      });
    }

    const rPage1 = listReceiptsPaginated(businessId, userId, { page: 1, pageSize: 25, sort: "amount_minor", dir: "desc" });
    const rPage2 = listReceiptsPaginated(businessId, userId, { page: 2, pageSize: 25, sort: "amount_minor", dir: "desc" });
    assert.ok(rPage1.total > 60);
    assert.strictEqual(rPage1.rows.length, 25);
    assert.strictEqual(rPage2.rows.length, 25);
    assert.ok(rPage1.summary.currencyTotals.some((c) => c.currencyCode === "USD"));
    assert.ok(rPage1.summary.totalBaseAmountMinor > 0);
    const rDateFiltered = listReceiptsPaginated(businessId, userId, { from: "2026-09-01", to: "2026-09-30" });
    assert.strictEqual(rDateFiltered.rows.every((r) => r.date >= "2026-09-01" && r.date <= "2026-09-30"), true);
    assert.strictEqual(rDateFiltered.summary.unfilteredTotal, rPage1.summary.unfilteredTotal);

    const pPage1 = listSupplierPaymentsPaginated(businessId, userId, { page: 1, pageSize: 25, sort: "date", dir: "asc" });
    const pPage2 = listSupplierPaymentsPaginated(businessId, userId, { page: 2, pageSize: 25, sort: "date", dir: "asc" });
    assert.ok(pPage1.total > 60);
    assert.strictEqual(pPage1.rows.length, 25);
    assert.strictEqual(pPage2.rows.length, 25);
    for (let i = 1; i < pPage1.rows.length; i++) {
      assert.ok(pPage1.rows[i - 1].date <= pPage1.rows[i].date);
    }
    const pSearch = listSupplierPaymentsPaginated(businessId, userId, { q: "PAY-REF-42" });
    assert.strictEqual(pSearch.total, 1);
  });

  await t.test("3. SQL getDashboardCounts, getReceivablesAgingSummary, getOverviewInvoiceMetrics, & getBusinessQuickKpis", () => {
    const counts = getDashboardCounts(businessId, userId);
    assert.strictEqual(counts.payments, counts.supplierPayments, "payments alias must match supplierPayments");
    const directCustomerCount = (sqlite.prepare("SELECT COUNT(*) AS c FROM customers").get() as { c: number }).c;
    const directInvoiceCount = (sqlite.prepare("SELECT COUNT(*) AS c FROM sales_invoices").get() as { c: number }).c;
    assert.strictEqual(counts.customers, directCustomerCount);
    assert.strictEqual(counts.salesInvoices, directInvoiceCount);
    assert.ok(counts.bankAccounts >= 1 && counts.chartOfAccounts >= 1);

    // Aging bucket check with explicit due dates across all 4 buckets + partial receipt
    const b15 = createInvoice(
      businessId,
      userId,
      {
        customerId: regularCustomerId,
        invoiceDate: isoDateDaysAgo(30),
        dueDate: isoDateDaysAgo(15),
        currencyCode: "AED",
        lines: [{ description: "15d overdue", quantity: "1", unitPrice: "100.00", salesAccountId: incomeAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );
    createReceipt(businessId, userId, {
      customerId: regularCustomerId,
      invoiceId: b15,
      date: isoDateDaysAgo(0),
      bankAccountId: bankAccount.id,
      amount: "40.00",
    });
    createInvoice(
      businessId,
      userId,
      {
        customerId: regularCustomerId,
        invoiceDate: isoDateDaysAgo(60),
        dueDate: isoDateDaysAgo(45),
        currencyCode: "AED",
        lines: [{ description: "45d overdue", quantity: "1", unitPrice: "200.00", salesAccountId: incomeAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );
    createInvoice(
      businessId,
      userId,
      {
        customerId: regularCustomerId,
        invoiceDate: isoDateDaysAgo(120),
        dueDate: isoDateDaysAgo(90),
        currencyCode: "AED",
        lines: [{ description: "90d overdue", quantity: "1", unitPrice: "300.00", salesAccountId: incomeAccount.id, taxCodeId: zeroTax.id }],
      },
      "post",
    );

    const aging = getReceivablesAgingSummary(businessId, userId);
    assert.ok(aging.currentCount >= 1 && aging.days30Count >= 1 && aging.days60Count >= 1 && aging.days60PlusCount >= 1);
    assert.strictEqual(
      aging.totalMinor,
      aging.currentMinor + aging.days30Minor + aging.days60Minor + aging.days60PlusMinor,
    );
    assert.strictEqual(
      aging.totalCount,
      aging.currentCount + aging.days30Count + aging.days60Count + aging.days60PlusCount,
    );

    // Cross-check SQL getReceivablesAgingSummary against unpaginated listInvoices
    const postedOpen = listInvoices(businessId, userId).filter(
      (i) => i.documentStatus === "posted" && i.baseBalanceMinor > 0,
    );
    const expectedTotalMinor = postedOpen.reduce((sum, i) => sum + i.baseBalanceMinor, 0);
    assert.strictEqual(aging.totalMinor, expectedTotalMinor);
    assert.strictEqual(aging.totalCount, postedOpen.length);

    // Overview SQL metrics + Quick KPIs
    const overview = getOverviewInvoiceMetrics(businessId, userId, { from: "2026-06-01", to: "2026-06-30" });
    assert.strictEqual(overview.recentInvoices.length, 6, "recentInvoices must be capped at 6");
    assert.strictEqual(overview.outstandingBaseMinor, expectedTotalMinor);
    assert.strictEqual(overview.overdueCount, postedOpen.filter((i) => i.paymentStatus === "overdue").length);

    const quickKpis = getBusinessQuickKpis(businessId, userId);
    assert.strictEqual(quickKpis.outstandingReceivablesMinor, expectedTotalMinor);
    assert.strictEqual(quickKpis.overdueCount, overview.overdueCount);
    assert.strictEqual(quickKpis.overdueMinor, overview.overdueBaseMinor);

    // Overdue & legacy "unpaid" filter semantics in invoice-service
    const legacyUnpaid = listInvoicesPaginated(businessId, userId, { status: "unpaid" });
    const paymentOpen = listInvoicesPaginated(businessId, userId, { status: "payment:open" });
    assert.strictEqual(legacyUnpaid.total, paymentOpen.total);
    assert.ok(legacyUnpaid.rows.every((r) => r.balanceMinor > 0 && r.documentStatus === "posted"));
  });

  await t.test("4. Admin batched stats, listBusinessesWithStats, & tab-scoped getAdminPageData", () => {
    const secondBusiness = createBusiness(
      { name: "Sprint 2 Second Ledger", country: "AE", currency: "AED", financialYearStartMonth: 1 },
      userId,
    );
    assert.ok(secondBusiness.id);

    const legacyTenants = listTenantsWithStats();
    const businessesWithBytes = listBusinessesWithStats({ includeStorageBytes: true });
    const businessesNoBytes = listBusinessesWithStats({ includeStorageBytes: false });
    assert.ok(businessesWithBytes.length >= 2);
    assert.strictEqual(businessesWithBytes.length, businessesNoBytes.length);
    assert.ok(businessesNoBytes.every((b) => b.storageBytes === 0));
    assert.ok(businessesWithBytes.some((b) => b.id === businessId && b.storageBytes > 0 && b.memberCount >= 1));

    const overviewStats = getAdminOverviewStats();
    const tabTenants = getAdminPageData("tenants");
    const tabBusinesses = getAdminPageData("businesses");
    const tabAudit = getAdminPageData("audit");

    assert.deepStrictEqual(tabTenants.stats, overviewStats);
    assert.deepStrictEqual(tabBusinesses.stats, overviewStats);
    assert.deepStrictEqual(tabAudit.stats, overviewStats);
    assert.strictEqual(tabTenants.tenantRows.length, legacyTenants.length);
    assert.strictEqual(tabTenants.businessRows.length, 0, "Off-tab businessRows should stay empty on tenants tab");
    assert.strictEqual(tabTenants.auditLogs.length, 0, "Off-tab auditLogs should stay empty on tenants tab");
    assert.strictEqual(tabBusinesses.businessRows.length, businessesWithBytes.length);
    assert.strictEqual(tabBusinesses.tenantRows.length, 0);
    assert.strictEqual(tabAudit.tenantRows.length, 0);
    assert.strictEqual(tabAudit.businessRows.length, 0);
  });

  await t.test("5. Streaming ZIP helper, abort cleanup, streaming business backup & import roundtrip", async () => {
    // Filename deduplication
    const seen = new Set<string>();
    assert.strictEqual(deduplicateArchiveFilename("INV-001.pdf", seen), "INV-001.pdf");
    assert.strictEqual(deduplicateArchiveFilename("INV-001.pdf", seen), "INV-001 (2).pdf");
    assert.strictEqual(deduplicateArchiveFilename("inv-001.pdf", seen), "inv-001 (3).pdf");

    // Abort signal & stream cancellation each fire onCleanup exactly once
    let cleanups = 0;
    const ac = new AbortController();
    const abortedStream = createStreamingZipStream({
      signal: ac.signal,
      onCleanup: () => {
        cleanups++;
      },
      populate: (zip) => {
        zip.addBuffer(Buffer.alloc(1024 * 64, "a"), "big.bin");
      },
    });
    ac.abort();
    const abortedBuf = await collectStreamToBuffer(abortedStream);
    assert.strictEqual(abortedBuf.length, 0);
    assert.strictEqual(cleanups, 1, "onCleanup must run once when aborted");

    let cancelCleanups = 0;
    const cancelStream = createStreamingZipStream({
      onCleanup: () => {
        cancelCleanups++;
      },
      populate: (zip) => {
        zip.addBuffer(Buffer.alloc(1024 * 64, "b"), "cancel.bin");
      },
    });
    await cancelStream.cancel();
    assert.strictEqual(cancelCleanups, 1, "onCleanup must run once on stream cancel");

    // Streaming business backup produces valid ZIP, cleans temp file, and imports cleanly
    const { stream, filename } = await createBusinessBackupStream(businessId, userId);
    assert.ok(filename.endsWith(".erpbackup"));
    const backupBuffer = await collectStreamToBuffer(stream);

    const bizPaths = getBusinessPaths(seeded.business.directoryKey);
    const leftoverBackups = readdirSync(bizPaths.directory).filter((f) => f.startsWith(".backup-"));
    assert.strictEqual(leftoverBackups.length, 0, `Expected zero temp backup sqlite files, found: ${leftoverBackups.join(", ")}`);

    const zip = await JSZip.loadAsync(backupBuffer);
    const manifestRaw = await zip.file("manifest.json")?.async("string");
    const dbBytes = await zip.file("business.sqlite")?.async("nodebuffer");
    assert.ok(manifestRaw && dbBytes, "Backup archive must contain manifest.json and business.sqlite");
    const manifest = JSON.parse(manifestRaw) as { databaseSha256: string; formatVersion: number };
    assert.strictEqual(manifest.formatVersion, 2);
    assert.strictEqual(createHash("sha256").update(dbBytes).digest("hex"), manifest.databaseSha256);

    const importedId = await importBusinessBackup(backupBuffer, userId);
    assert.ok(typeof importedId === "string" && importedId.length > 0, "Imported backup must create a restored business");
  });

  await t.test("6. Pooled Chromium HTML-to-PDF reuses one browser instance and shuts down cleanly", async (ctx) => {
    try {
      const [pdf1, pdf2] = await Promise.all([
        renderHtmlTemplate("<!doctype html><html><body><h1>Invoice {{n}}</h1></body></html>", { n: 1 }, {}),
        renderHtmlTemplate("<!doctype html><html><body><h1>Invoice {{n}}</h1></body></html>", { n: 2 }, {}),
      ]);
      const pdf3 = await renderHtmlTemplate("<!doctype html><html><body><h1>Invoice {{n}}</h1></body></html>", { n: 3 }, {});

      assert.strictEqual(pdf1.subarray(0, 5).toString("utf8"), "%PDF-");
      assert.strictEqual(pdf2.subarray(0, 5).toString("utf8"), "%PDF-");
      assert.strictEqual(pdf3.subarray(0, 5).toString("utf8"), "%PDF-");

      const statsBeforeClose = getHtmlPdfPoolStats();
      assert.strictEqual(statsBeforeClose.connected, true);
      assert.strictEqual(statsBeforeClose.launchCount, 1, "Concurrent + sequential renders must reuse 1 Chromium instance");
      assert.ok(statsBeforeClose.totalRenders >= 3);

      await closeHtmlPdfBrowser();
      const statsAfterClose = getHtmlPdfPoolStats();
      assert.strictEqual(statsAfterClose.connected, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Failed to launch|No usable sandbox|Could not find Chrome|error while loading shared libraries/i.test(msg)) {
        ctx.skip(`Chromium unavailable in environment: ${msg}`);
        return;
      }
      throw err;
    }
  });
});
