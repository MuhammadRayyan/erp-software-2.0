import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-find-recode-")),
  BETTER_AUTH_SECRET: "find-recode-test-secret-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createBusiness } = await import("../src/core/businesses/business-service");

test("Find & Recode / Bulk Transaction Editor Engine", async (t) => {
  const seed = await seedDemoData();
  const userId = seed.admin.id;
  const isolated = createBusiness(
    { name: "Find and Recode Test Business", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 1 },
    userId,
  );
  const businessId = isolated.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const { createCustomer } = await import("../src/modules/customers/customer-service");
  const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
  const { createProject } = await import("../src/modules/projects/project-service");
  const { createInvoice } = await import("../src/modules/sales-invoices/invoice-service");
  const { savePurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
  const { createAccount } = await import("../src/modules/accounting/services/account-service");
  const { getTrialBalance } = await import("../src/modules/reports/report-service");
  const {
    findRecodableLines,
    recodeSelectedLines,
  } = await import("../src/modules/accounting/services/find-and-recode-service");

  // Create accounts
  createAccount(businessId, userId, {
    name: "Software Consulting Revenue",
    type: "income",
    subtype: "sales",
  });
  createAccount(businessId, userId, {
    name: "SaaS Subscription Revenue",
    type: "income",
    subtype: "sales",
  });
  createAccount(businessId, userId, {
    name: "Server Hosting Expenses",
    type: "expense",
    subtype: "operating_expense",
  });
  createAccount(businessId, userId, {
    name: "Cloud Storage Expenses",
    type: "expense",
    subtype: "operating_expense",
  });

  const salesAcctA = sqlite.prepare("SELECT id FROM accounts WHERE name = 'Software Consulting Revenue'").get() as { id: string };
  const salesAcctB = sqlite.prepare("SELECT id FROM accounts WHERE name = 'SaaS Subscription Revenue'").get() as { id: string };
  const expenseAcctA = sqlite.prepare("SELECT id FROM accounts WHERE name = 'Server Hosting Expenses'").get() as { id: string };

  const zeroTax = sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 0 LIMIT 1").get() as { id: string };

  const customerId = createCustomer(businessId, userId, {
    name: "Alpha Holdings UAE",
    email: "finance@alphaholdings.ae",
  });
  const supplierId = createSupplier(businessId, userId, {
    name: "Global Cloud Services",
    email: "billing@globalcloud.com",
  });

  const projectAlphaId = createProject(businessId, userId, {
    name: "Project Titan",
    code: "TITAN",
    customerId,
    status: "active",
  });
  const projectBetaId = createProject(businessId, userId, {
    name: "Project Apollo",
    code: "APOLLO",
    customerId,
    status: "active",
  });

  // Post Sales Invoice 1
  createInvoice(businessId, userId, {
    customerId,
    invoiceDate: "2026-10-15",
    taxDate: "2026-10-15",
    dueDate: "2026-11-15",
    lines: [
      {
        description: "Initial Architecture Consulting",
        quantity: "1",
        unitPrice: "5000.00",
        salesAccountId: salesAcctA.id,
        taxCodeId: zeroTax.id,
        projectId: projectAlphaId,
        discountType: "none",
        discountValue: "0",
      },
    ],
  }, "post");

  // Post Purchase Invoice 1
  savePurchaseInvoice(businessId, userId, {
    supplierId,
    supplierInvoiceNumber: "GCS-9001",
    invoiceDate: "2026-10-18",
    taxDate: "2026-10-18",
    dueDate: "2026-11-18",
    lines: [
      {
        description: "Primary Web Server Fleet",
        quantity: "1",
        unitPrice: "3000.00",
        expenseAccountId: expenseAcctA.id,
        taxCodeId: zeroTax.id,
        projectId: projectAlphaId,
        discountType: "none",
        discountValue: "0",
      },
    ],
  }, "post");

  await t.test("1. Find Transaction Lines with Multi-Dimensional Filters", () => {
    // Find all
    const allLines = findRecodableLines(businessId, userId, { sourceType: "all" });
    assert.equal(allLines.length, 2);

    // Filter by sourceType
    const salesOnly = findRecodableLines(businessId, userId, { sourceType: "sales_invoice" });
    assert.equal(salesOnly.length, 1);
    assert.ok(salesOnly[0].sourceNumber.startsWith("INV-"));
    assert.equal(salesOnly[0].accountId, salesAcctA.id);
    assert.equal(salesOnly[0].partyName, "Alpha Holdings UAE");

    const billsOnly = findRecodableLines(businessId, userId, { sourceType: "purchase_invoice" });
    assert.equal(billsOnly.length, 1);
    assert.equal(billsOnly[0].accountId, expenseAcctA.id);
    assert.equal(billsOnly[0].partyName, "Global Cloud Services");

    // Filter by text query
    const queried = findRecodableLines(businessId, userId, { query: "Architecture" });
    assert.equal(queried.length, 1);
    assert.ok(queried[0].sourceNumber.startsWith("INV-"));

    // Filter by project
    const titanLines = findRecodableLines(businessId, userId, { projectId: projectAlphaId });
    assert.equal(titanLines.length, 2);

    const apolloLines = findRecodableLines(businessId, userId, { projectId: projectBetaId });
    assert.equal(apolloLines.length, 0);
  });

  await t.test("2. Bulk Recode Account (GL Reclassification) & Synchronize Ledger", () => {
    // Before recode: Trial Balance has 5,000 in salesAcctA and 0 in salesAcctB
    let tb = getTrialBalance(businessId, userId);
    let acctARow = tb.accounts.find((a) => a.id === salesAcctA.id);
    let acctBRow = tb.accounts.find((a) => a.id === salesAcctB.id);
    assert.equal(acctARow?.creditMinor, 500000);
    assert.equal(acctBRow, undefined);

    const salesLines = findRecodableLines(businessId, userId, { sourceType: "sales_invoice" });
    assert.equal(salesLines.length, 1);

    // Recode line from salesAcctA to salesAcctB
    const result = recodeSelectedLines(businessId, userId, {
      lines: [
        {
          lineId: salesLines[0].lineId,
          sourceType: "sales_invoice",
          sourceId: salesLines[0].sourceId,
        },
      ],
      action: {
        type: "account",
        targetAccountId: salesAcctB.id,
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.updatedLines, 1);
    assert.equal(result.updatedDocuments, 1);

    // Check document line in DB
    const updatedLine = sqlite.prepare("SELECT sales_account_id FROM sales_invoice_lines WHERE id = ?").get(salesLines[0].lineId) as { sales_account_id: string };
    assert.equal(updatedLine.sales_account_id, salesAcctB.id);

    // Verify Trial Balance: salesAcctA is now 0 (filtered out), salesAcctB is now 5,000!
    tb = getTrialBalance(businessId, userId);
    acctARow = tb.accounts.find((a) => a.id === salesAcctA.id);
    acctBRow = tb.accounts.find((a) => a.id === salesAcctB.id);
    assert.equal(acctARow, undefined);
    assert.equal(acctBRow?.creditMinor, 500000);

    // Strict Double-Entry Balance
    assert.equal(tb.debitMinor, tb.creditMinor);
  });

  await t.test("3. Bulk Recode Project Tagging across Sales & Purchases", () => {
    const lines = findRecodableLines(businessId, userId, { sourceType: "all" });
    assert.equal(lines.length, 2);

    // Reclassify both lines to Project Apollo
    const result = recodeSelectedLines(businessId, userId, {
      lines: lines.map((l) => ({
        lineId: l.lineId,
        sourceType: l.sourceType,
        sourceId: l.sourceId,
      })),
      action: {
        type: "project",
        targetProjectId: projectBetaId,
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.updatedLines, 2);
    assert.equal(result.updatedDocuments, 2);

    // Check project lines in DB
    const apolloLines = findRecodableLines(businessId, userId, { projectId: projectBetaId });
    assert.equal(apolloLines.length, 2);

    const titanLines = findRecodableLines(businessId, userId, { projectId: projectAlphaId });
    assert.equal(titanLines.length, 0);
  });

  await t.test("4. Safety & Period Lock Protection", () => {
    // Set financial lock date to 2026-10-31
    sqlite.prepare("UPDATE business_accounting_settings SET financial_lock_date = '2026-10-31' WHERE id = 'default'").run();

    const lines = findRecodableLines(businessId, userId, { sourceType: "all" });
    // All lines are from Oct 15 and Oct 18, so they should be marked isLocked = true
    assert.equal(lines.every((l) => l.isLocked), true);

    // Attempting to recode should fail with locked period error
    assert.throws(
      () => {
        recodeSelectedLines(businessId, userId, {
          lines: [
            {
              lineId: lines[0].lineId,
              sourceType: lines[0].sourceType,
              sourceId: lines[0].sourceId,
            },
          ],
          action: {
            type: "account",
            targetAccountId: salesAcctA.id,
          },
        });
      },
      /closed/i,
      "Should reject recode in locked financial period",
    );

    // Unlock period
    sqlite.prepare("UPDATE business_accounting_settings SET financial_lock_date = NULL WHERE id = 'default'").run();
  });

  await t.test("5. System Control Account Protection", () => {
    const settings = sqlite.prepare("SELECT accounts_receivable_account_id FROM business_accounting_settings WHERE id = 'default'").get() as { accounts_receivable_account_id: string };
    const lines = findRecodableLines(businessId, userId, { sourceType: "sales_invoice" });

    // Attempting to recode into Accounts Receivable control account should fail
    assert.throws(
      () => {
        recodeSelectedLines(businessId, userId, {
          lines: [
            {
              lineId: lines[0].lineId,
              sourceType: lines[0].sourceType,
              sourceId: lines[0].sourceId,
            },
          ],
          action: {
            type: "account",
            targetAccountId: settings.accounts_receivable_account_id,
          },
        });
      },
      /control account/i,
      "Should reject recoding directly into control accounts",
    );
  });
});
