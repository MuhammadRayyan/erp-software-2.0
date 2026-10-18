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
} = await import("../src/modules/activity-log/activity-log-service");
const { createInvoice, voidInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { createReceipt, voidReceipt } = await import("../src/modules/receipts/receipt-service");
const { setFinancialLockDate } = await import("../src/modules/accounting/services/financial-lock-service");

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
});
