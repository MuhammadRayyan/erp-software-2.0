import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-activity-log-")),
  BETTER_AUTH_SECRET: "activity-log-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { getSystemDb } = await import("../src/core/db/system");
const { users, memberships } = await import("../src/core/db/system-schema");
const {
  recordActivity,
  listActivityLogs,
  getActivityLogUsers,
  getActivityLogSettings,
  updateActivityLogSettings,
  runActivityLogCleanup,
} = await import("../src/modules/activity-log/activity-log-service");
const { createInvoice, voidInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { createReceipt, voidReceipt } = await import("../src/modules/receipts/receipt-service");
const { setFinancialLockDate } = await import("../src/modules/accounting/services/financial-lock-service");
const { saveSalesQuote } = await import("../src/modules/sales-quotes/quote-service");
const { saveSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
const { createAccount } = await import("../src/modules/accounting/services/account-service");
const { createCustomFieldDefinition } = await import("../src/modules/custom-fields/custom-field-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;

// Create a standard user in system DB and add to business
const standardUserId = randomUUID();
const standardUserEmail = `standard-${Date.now()}@example.com`;
getSystemDb()
  .insert(users)
  .values({
    id: standardUserId,
    name: "Standard Team Member",
    email: standardUserEmail,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  .run();

getSystemDb()
  .insert(memberships)
  .values({
    id: randomUUID(),
    businessId,
    userId: standardUserId,
    role: "standard",
    modulesJson: JSON.stringify(["sales", "purchases", "settings"]),
    createdAt: new Date().toISOString(),
  })
  .run();

const { sqlite } = getBusinessDb(businessId, adminId);
const customer = sqlite.prepare("SELECT id FROM customers LIMIT 1").get() as { id: string };
const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
const taxCode = sqlite.prepare("SELECT id FROM tax_codes LIMIT 1").get() as { id: string };
const bank = sqlite.prepare("SELECT id FROM accounts WHERE type = 'asset' LIMIT 1").get() as { id: string };

test("Activity & Audit Logging Suite", async (suite) => {
  await suite.test("1. Explicit activity logging records correctly", () => {
    const record = recordActivity(businessId, {
      userId: adminId,
      action: "created",
      entityType: "test_entity",
      entityId: "test-123",
      entityNumber: "TEST-001",
      summary: "Created test entity for regression test",
      details: { foo: "bar", value: 42 },
    });

    assert.ok(record);
    assert.equal(record.action, "created");
    assert.equal(record.entityType, "test_entity");
    assert.equal(record.entityNumber, "TEST-001");
    assert.deepEqual(record.details, { foo: "bar", value: 42 });
  });

  await suite.test("2. Sales invoice creation and voiding automatically record activity logs", () => {
    // Standard user creates a posted invoice
    const invoiceId = createInvoice(
      businessId,
      standardUserId,
      {
        customerId: customer.id,
        currencyCode: "AED",
        invoiceDate: "2026-10-18",
        dueDate: "2026-10-25",
        lines: [
          {
            description: "Consulting Service",
            quantity: "2",
            unitPrice: "500",
            salesAccountId: incomeAccount.id,
            taxCodeId: taxCode.id,
          },
        ],
      },
      "post",
    );

    // Verify invoice creation log
    const standardLogs = listActivityLogs(businessId, standardUserId, { entityType: "sales_invoice" });
    const invoiceCreateLog = standardLogs.logs.find((l) => l.entityId === invoiceId && l.action === "posted");
    assert.ok(invoiceCreateLog, "Invoice creation activity log should exist");
    assert.equal(invoiceCreateLog.userId, standardUserId);
    assert.match(invoiceCreateLog.summary, /Posted sales invoice/);

    // Standard user voids the invoice
    voidInvoice(businessId, standardUserId, invoiceId);

    const updatedLogs = listActivityLogs(businessId, standardUserId, { entityType: "sales_invoice" });
    const invoiceVoidLog = updatedLogs.logs.find((l) => l.entityId === invoiceId && l.action === "voided");
    assert.ok(invoiceVoidLog, "Invoice void activity log should exist");
    assert.equal(invoiceVoidLog.userId, standardUserId);
    assert.match(invoiceVoidLog.summary, /Voided sales invoice/);
  });

  await suite.test("3. Payment receipt recording and voiding log events", () => {
    const receiptResult = createReceipt(businessId, adminId, {
      customerId: customer.id,
      date: "2026-10-18",
      bankAccountId: bank.id,
      amount: "150.00",
      currencyCode: "AED",
      reference: "BANK-TRANSFER-99",
      description: "Down payment",
      allocations: [],
    });

    const adminLogs = listActivityLogs(businessId, adminId, { entityType: "receipt" });
    const receiptCreateLog = adminLogs.logs.find((l) => l.entityId === receiptResult.id && l.action === "posted");
    assert.ok(receiptCreateLog, "Receipt posted activity log should exist");
    assert.equal(receiptCreateLog.userId, adminId);
    assert.match(receiptCreateLog.summary, /Recorded payment receipt/);

    // Void the receipt
    voidReceipt(businessId, adminId, receiptResult.id);

    const logsAfterVoid = listActivityLogs(businessId, adminId, { entityType: "receipt" });
    const receiptVoidLog = logsAfterVoid.logs.find((l) => l.entityId === receiptResult.id && l.action === "voided");
    assert.ok(receiptVoidLog, "Receipt void activity log should exist");
    assert.equal(receiptVoidLog.userId, adminId);
  });

  await suite.test("4. Financial settings update records audit log", () => {
    setFinancialLockDate(businessId, adminId, "2026-09-30");

    const settingsLogs = listActivityLogs(businessId, adminId, { entityType: "financial_lock" });
    const lockLog = settingsLogs.logs.find((l) => l.action === "settings_changed");
    assert.ok(lockLog, "Financial lock date change should be recorded");
    assert.equal(lockLog.userId, adminId);
    assert.match(lockLog.summary, /2026-09-30/);
  });

  await suite.test("5. Role-based isolation: Admin sees all logs; standard user sees only their own", () => {
    // Admin list without user filter returns logs from BOTH admin and standard user
    const adminAllResult = listActivityLogs(businessId, adminId);
    assert.equal(adminAllResult.isAdmin, true);
    const hasAdminLog = adminAllResult.logs.some((l) => l.userId === adminId);
    const hasStandardLog = adminAllResult.logs.some((l) => l.userId === standardUserId);
    assert.ok(hasAdminLog, "Admin should see their own logs");
    assert.ok(hasStandardLog, "Admin should see other users' logs");

    // Admin filters specifically by standard user
    const adminFilteredByStandard = listActivityLogs(businessId, adminId, { userId: standardUserId });
    assert.ok(adminFilteredByStandard.logs.length > 0);
    assert.ok(adminFilteredByStandard.logs.every((l) => l.userId === standardUserId), "Only standard user logs returned");

    // Standard user queries logs: CANNOT see admin's logs
    const standardResult = listActivityLogs(businessId, standardUserId);
    assert.equal(standardResult.isAdmin, false);
    assert.ok(standardResult.logs.length > 0);
    assert.ok(
      standardResult.logs.every((l) => l.userId === standardUserId),
      "Standard user should strictly only see their own logs",
    );
    assert.equal(
      standardResult.logs.some((l) => l.userId === adminId),
      false,
      "Standard user MUST NEVER see admin logs",
    );
  });

  await suite.test("6. Chaos/Security test: Standard user attempting privilege escalation is blocked", () => {
    // Malicious standard user passes userId = adminId in query filters
    const exploitAttempt = listActivityLogs(businessId, standardUserId, { userId: adminId });

    // The system MUST ignore the requested adminId and force userId to standardUserId
    assert.equal(exploitAttempt.isAdmin, false);
    assert.equal(
      exploitAttempt.logs.some((l) => l.userId === adminId),
      false,
      "Exploit attempt to read admin logs via filter injection must fail completely",
    );
    assert.ok(
      exploitAttempt.logs.every((l) => l.userId === standardUserId),
      "All returned logs must belong exclusively to the calling standard user",
    );
  });

  await suite.test("7. Activity Log users list respects role visibility", () => {
    const adminUsersList = getActivityLogUsers(businessId, adminId);
    assert.ok(adminUsersList.length >= 2, "Admin should see all business members in user list");
    assert.ok(adminUsersList.some((u) => u.id === adminId));
    assert.ok(adminUsersList.some((u) => u.id === standardUserId));

    const standardUsersList = getActivityLogUsers(businessId, standardUserId);
    assert.equal(standardUsersList.length, 1, "Standard user should only see themselves");
    assert.equal(standardUsersList[0].id, standardUserId);
  });

  await suite.test("8. Search and action filtering work accurately", () => {
    const searchResult = listActivityLogs(businessId, adminId, { search: "sales invoice" });
    assert.ok(searchResult.logs.length > 0);
    assert.ok(searchResult.logs.every((l) => l.summary.toLowerCase().includes("sales invoice")));

    const voidedOnly = listActivityLogs(businessId, adminId, { action: "voided" });
    assert.ok(voidedOnly.logs.length > 0);
    assert.ok(voidedOnly.logs.every((l) => l.action === "voided"));
  });

  await suite.test("9. Automated log retention settings configuration & security isolation", () => {
    // Default settings
    const initialSettings = getActivityLogSettings(businessId, adminId);
    assert.equal(initialSettings.retentionEnabled, false);
    assert.equal(initialSettings.retentionDays, 90);
    assert.equal(initialSettings.lastCleanupAt, null);

    // Standard user attempting to modify retention settings is blocked
    assert.throws(
      () => {
        updateActivityLogSettings(businessId, standardUserId, {
          retentionEnabled: true,
          retentionDays: 180,
        });
      },
      { message: "ADMIN_REQUIRED" },
    );

    // Admin updates retention settings
    const updated = updateActivityLogSettings(businessId, adminId, {
      retentionEnabled: true,
      retentionDays: 180,
    });
    assert.equal(updated.retentionEnabled, true);
    assert.equal(updated.retentionDays, 180);

    const reFetched = getActivityLogSettings(businessId, adminId);
    assert.equal(reFetched.retentionEnabled, true);
    assert.equal(reFetched.retentionDays, 180);

    // Activity log must capture this settings change
    const settingsLogs = listActivityLogs(businessId, adminId, {
      entityType: "activity_log_retention",
    });
    const policyLog = settingsLogs.logs.find((l) => l.action === "settings_changed");
    assert.ok(policyLog, "Updating retention policy should record settings_changed audit log");
    assert.match(policyLog.summary, /180 days/);
  });

  await suite.test("10. Automated log retention pruning execution", () => {
    // Non-admin cannot run cleanup
    assert.throws(
      () => {
        runActivityLogCleanup(businessId, standardUserId, 90);
      },
      { message: "ADMIN_REQUIRED" },
    );

    // Seed an old activity log from 250 days ago directly into SQLite
    const oldLogId = randomUUID();
    const oldTimestamp = new Date(Date.now() - 250 * 24 * 60 * 60 * 1000).toISOString();
    sqlite
      .prepare(`
        INSERT INTO activity_logs (
          id, business_id, user_id, user_name, user_email,
          action, entity_type, entity_id, entity_number,
          summary, details_json, ip_address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        oldLogId,
        businessId,
        adminId,
        "Admin",
        "admin@example.com",
        "created",
        "legacy_document",
        "legacy-999",
        "LEG-001",
        "Legacy operational action from past cycle",
        null,
        "127.0.0.1",
        oldTimestamp,
      );

    // Verify the record is currently in the DB
    const oldRowCheck = sqlite
      .prepare("SELECT id FROM activity_logs WHERE id = ?")
      .get(oldLogId);
    assert.ok(oldRowCheck, "Old log should exist before pruning");

    // Execute cleanup with 180 days threshold
    const cleanupResult = runActivityLogCleanup(businessId, adminId, 180);
    assert.ok(cleanupResult.deletedCount >= 1, "Should have pruned at least the old log");

    // Verify old log is pruned
    const afterPruneCheck = sqlite
      .prepare("SELECT id FROM activity_logs WHERE id = ?")
      .get(oldLogId);
    assert.equal(afterPruneCheck, undefined, "Old log must be deleted after pruning");

    // Verify recent logs are still present
    const recentLogs = listActivityLogs(businessId, adminId);
    assert.ok(recentLogs.total > 0, "Recent logs should be preserved intact");

    // Verify settings recorded the cleanup telemetry
    const settings = getActivityLogSettings(businessId, adminId);
    assert.ok(settings.lastCleanupAt !== null, "lastCleanupAt should be populated");
    assert.ok(settings.lastCleanupCount >= 1, "lastCleanupCount should reflect pruned count");
  });

  await suite.test("11. Operational events logged across sales quotes and sales orders", () => {
    // Create sales quote
    const quoteId = saveSalesQuote(
      businessId,
      adminId,
      {
        customerId: customer.id,
        date: "2026-10-18",
        currencyCode: "AED",
        lines: [
          {
            description: "Product Design",
            quantity: "1",
            unitPrice: "1200",
            salesAccountId: incomeAccount.id,
            taxCodeId: taxCode.id,
          },
        ],
      },
      "draft",
    );

    const quoteLogs = listActivityLogs(businessId, adminId, { entityType: "sales_quote" });
    const quoteCreatedLog = quoteLogs.logs.find((l) => l.entityId === quoteId && l.action === "created");
    assert.ok(quoteCreatedLog, "Sales quote creation should be logged in activity logs");
    assert.match(quoteCreatedLog.summary, /sales quote/i);

    // Create sales order
    const orderId = saveSalesOrder(
      businessId,
      adminId,
      {
        customerId: customer.id,
        salesQuoteId: quoteId,
        date: "2026-10-18",
        currencyCode: "AED",
        lines: [
          {
            description: "Product Design Delivery",
            quantity: "1",
            unitPrice: "1200",
            salesAccountId: incomeAccount.id,
            taxCodeId: taxCode.id,
          },
        ],
      },
      "issue",
    );

    const orderLogs = listActivityLogs(businessId, adminId, { entityType: "sales_order" });
    const orderPostedLog = orderLogs.logs.find((l) => l.entityId === orderId && l.action === "posted");
    assert.ok(orderPostedLog, "Sales order issued/posted should be logged in activity logs");
    assert.match(orderPostedLog.summary, /sales order/i);
  });

  await suite.test("12. Operational events logged for chart of accounts and custom fields", () => {
    // Create account
    createAccount(businessId, adminId, {
      name: "Special R&D Expense",
      type: "expense",
      subtype: "operating_expense",
      isActive: true,
    });

    const accountLogs = listActivityLogs(businessId, adminId, { entityType: "account" });
    const accountCreatedLog = accountLogs.logs.find((l) => l.summary.includes("Special R&D Expense"));
    assert.ok(accountCreatedLog, "Account creation should be logged in activity logs");
    assert.equal(accountCreatedLog.action, "created");

    // Create custom field
    const fieldId = createCustomFieldDefinition(businessId, adminId, {
      entityType: "customer",
      name: "Industry Vertical",
      fieldType: "text",
      selectOptions: [],
      isRequired: false,
      showInList: true,
    });

    const customFieldLogs = listActivityLogs(businessId, adminId, { entityType: "custom_field" });
    const fieldCreatedLog = customFieldLogs.logs.find((l) => l.entityId === fieldId);
    assert.ok(fieldCreatedLog, "Custom field creation should be logged in activity logs");
    assert.equal(fieldCreatedLog.action, "created");
  });
});
