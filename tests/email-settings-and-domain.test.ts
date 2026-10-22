import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getBusinessDb } from "../src/core/db/business";
import { getSystemDb } from "../src/core/db/system";
import { users } from "../src/core/db/system-schema";
import { createBusiness } from "../src/core/businesses/business-service";
import {
  getEmailSettings,
  saveEmailSettings,
  verifyAndSendTestEmail,
  sanitizeEmailSettingsForClient,
} from "../src/modules/email/email-settings-service";
import { sendEmail, listSentEmails, getSentEmail } from "../src/modules/email/email-service";
import {
  sanitizeDomain,
  getAppDomain,
  getAppProtocol,
  getAppBaseUrl,
  getTrustedOrigins,
} from "../src/core/config/app-url";

test("Email Settings & Unified Domain Configuration Suite", async (t) => {
  const systemDb = getSystemDb();
  const testUserId = `test-user-${randomUUID().slice(0, 8)}`;

  // 1. Provision test user and business
  systemDb
    .insert(users)
    .values({
      id: testUserId,
      name: "Email Test Admin",
      email: `${testUserId}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  const business = createBusiness(
    {
      name: "Rapid TSS Test Enterprise",
      country: "AE",
      currency: "AED",
      financialYearStartMonth: 1,
    },
    testUserId,
  );

  const testBusinessId = business.id;
  const { sqlite } = getBusinessDb(testBusinessId, testUserId);

  // -------------------------------------------------------------
  // TEST 1: Migration 35 Schema Verification
  // -------------------------------------------------------------
  await t.test("1. Migration 35 Schema: email_settings table and columns exist", () => {
    const tables = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    assert.ok(tables.includes("email_settings"), "email_settings table must exist");

    const cols = (
      sqlite.prepare("PRAGMA table_info(email_settings)").all() as {
        name: string;
      }[]
    ).map((c) => c.name);

    const expectedCols = [
      "id",
      "sender_name",
      "sender_email",
      "reply_to_email",
      "smtp_host",
      "smtp_port",
      "smtp_secure",
      "smtp_user",
      "smtp_pass",
      "is_active",
      "last_tested_at",
      "last_test_status",
      "last_test_error",
      "created_at",
      "updated_at",
    ];

    for (const col of expectedCols) {
      assert.ok(cols.includes(col), `email_settings must include column "${col}"`);
    }
  });

  // -------------------------------------------------------------
  // TEST 2: Email Settings CRUD Operations
  // -------------------------------------------------------------
  await t.test("2. getEmailSettings & saveEmailSettings CRUD", () => {
    // 2a. Initial defaults
    const initial = getEmailSettings(testBusinessId, testUserId);
    assert.equal(initial.id, "default");
    assert.equal(initial.isActive, false);
    assert.equal(initial.senderEmail, null);

    // 2b. Save custom settings
    const saved = saveEmailSettings(testBusinessId, testUserId, {
      senderName: "Rapid TSS Accounts",
      senderEmail: "billing@rapidtss.com",
      replyToEmail: "support@rapidtss.com",
      smtpHost: "smtp.hostinger.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: "billing@rapidtss.com",
      smtpPass: "secret-smtp-password-123",
      isActive: true,
    });

    assert.equal(saved.senderName, "Rapid TSS Accounts");
    assert.equal(saved.senderEmail, "billing@rapidtss.com");
    assert.equal(saved.replyToEmail, "support@rapidtss.com");
    assert.equal(saved.smtpHost, "smtp.hostinger.com");
    assert.equal(saved.smtpPort, 465);
    assert.equal(saved.smtpSecure, true);
    assert.equal(saved.smtpUser, "billing@rapidtss.com");
    assert.equal(saved.smtpPass, "secret-smtp-password-123");
    assert.equal(saved.isActive, true);

    // 2c. Save without re-supplying password should preserve existing password
    const updated = saveEmailSettings(testBusinessId, testUserId, {
      senderName: "Rapid TSS Finance",
      smtpPass: "", // Empty means keep existing
    });

    assert.equal(updated.senderName, "Rapid TSS Finance");
    assert.equal(updated.smtpPass, "secret-smtp-password-123", "Existing password must be preserved");
    assert.equal(updated.senderEmail, "billing@rapidtss.com");

    // 2d. Sanitization removes cleartext password for client-side delivery
    const sanitized = sanitizeEmailSettingsForClient(updated);
    assert.equal(sanitized.smtpPass, null, "Cleartext password must be removed for client");
    assert.equal(sanitized.hasPassword, true, "hasPassword must indicate presence of saved credential");
  });

  // -------------------------------------------------------------
  // TEST 3: verifyAndSendTestEmail Validation & Failure Diagnostics
  // -------------------------------------------------------------
  await t.test("3. verifyAndSendTestEmail: validation and failure reporting", async () => {
    // 3a. Rejects invalid recipient
    const invalidRes = await verifyAndSendTestEmail(testBusinessId, testUserId, {
      recipient: "not-an-email",
    });
    assert.equal(invalidRes.success, false);
    assert.ok(invalidRes.error?.includes("recipient"));

    // 3b. Test against an unreachable port / host
    const failRes = await verifyAndSendTestEmail(testBusinessId, testUserId, {
      recipient: "client@example.com",
      smtpHost: "127.0.0.1",
      smtpPort: 19999, // Unused port that will fail connection
      smtpSecure: false,
      smtpUser: "test@example.com",
      smtpPass: "wrongpass",
    });

    assert.equal(failRes.success, false);
    assert.ok(failRes.error, "Error message must be present");

    // 3c. Verify failure is recorded in email_settings table
    const afterFail = getEmailSettings(testBusinessId, testUserId);
    assert.equal(afterFail.lastTestStatus, "failed");
    assert.ok(afterFail.lastTestedAt);
    assert.ok(afterFail.lastTestError);

    // 3d. Verify that verifyAndSendTestEmail persists test results on brand-new business before any save
    const brandNewBiz = createBusiness(
      {
        name: "Brand New Email Enterprise",
        country: "AE",
        currency: "AED",
        financialYearStartMonth: 1,
      },
      testUserId,
    );
    const freshBizRes = await verifyAndSendTestEmail(brandNewBiz.id, testUserId, {
      recipient: "fresh-test@domain.com",
      smtpHost: "127.0.0.1",
      smtpPort: 19999,
      smtpSecure: false,
      smtpUser: "fresh@test.com",
      smtpPass: "freshpass",
    });
    assert.equal(freshBizRes.success, false);
    const freshSettings = getEmailSettings(brandNewBiz.id, testUserId);
    assert.equal(freshSettings.lastTestStatus, "failed", "Test status must be saved on fresh business via UPSERT");
    assert.ok(freshSettings.lastTestedAt);
    assert.ok(freshSettings.lastTestError);
  });

  // -------------------------------------------------------------
  // TEST 4: Outgoing sendEmail integration with business sender
  // -------------------------------------------------------------
  await t.test("4. sendEmail uses business sender and records failures cleanly", async () => {
    // 4a. Configure settings with dummy host that will fail
    saveEmailSettings(testBusinessId, testUserId, {
      senderName: "Rapid TSS Billing",
      senderEmail: "billing@rapidtss.com",
      replyToEmail: "replies@rapidtss.com",
      smtpHost: "127.0.0.1",
      smtpPort: 19999,
      smtpSecure: false,
      smtpUser: "billing@rapidtss.com",
      smtpPass: "badpass",
      isActive: true,
    });

    const result = await sendEmail(testBusinessId, testUserId, {
      from: { name: "Default Org", email: "default@local.org" },
      to: [{ name: "Client", email: "client@customer.com" }],
      subject: "Invoice INV-00100 for your review",
      bodyHtml: "<p>Please find attached invoice.</p>",
      relatedEntityType: "sales_invoice",
      relatedDocumentNumber: "INV-00100",
    });

    // Since 127.0.0.1:19999 is unreachable, delivery must fail gracefully
    assert.equal(result.status, "failed");
    assert.ok(result.errorMessage, "Failure message must be captured");

    // Check sent_emails audit log
    const emailRow = getSentEmail(testBusinessId, testUserId, result.id);
    assert.ok(emailRow, "Sent email row must exist");
    assert.equal(emailRow.status, "failed");
    assert.ok(emailRow.errorMessage);
    // Verified sender override
    assert.equal(emailRow.fromAddress, "Rapid TSS Billing <billing@rapidtss.com>");

    // 4b. When custom SMTP is disabled (isActive = false), falls back to logDriver (simulated success)
    saveEmailSettings(testBusinessId, testUserId, {
      isActive: false,
    });

    const fallbackResult = await sendEmail(testBusinessId, testUserId, {
      from: { name: "Custom Fallback Sender", email: "fallback-sender@other-domain.org" },
      to: [{ name: "Client", email: "client2@customer.com" }],
      subject: "Quote SQ-00050",
      bodyHtml: "<p>Here is your quote.</p>",
    });

    assert.equal(fallbackResult.status, "sent");
    const fallbackRow = getSentEmail(testBusinessId, testUserId, fallbackResult.id);
    assert.ok(fallbackRow);
    assert.equal(fallbackRow.status, "sent");
    // Verify that input.from was NOT overridden by inactive business email settings
    assert.equal(fallbackRow.fromAddress, "Custom Fallback Sender <fallback-sender@other-domain.org>");

    const allEmails = listSentEmails(testBusinessId, testUserId);
    assert.ok(allEmails.length >= 2, "Both sent emails must be returned by listSentEmails");
  });

  // -------------------------------------------------------------
  // TEST 5: Single-Source-of-Truth Domain & URL Configuration
  // -------------------------------------------------------------
  await t.test("5. Unified domain resolver handles localhost, custom domains, and origins", () => {
    // 5a. sanitizeDomain, getAppDomain, getAppBaseUrl
    assert.equal(sanitizeDomain("http://erp-portal.rapidtss.com/"), "erp-portal.rapidtss.com");
    assert.equal(sanitizeDomain("https://erp-portal.rapidtss.com:443"), "erp-portal.rapidtss.com:443");
    assert.equal(sanitizeDomain(""), "localhost:3000");
    assert.ok(getAppDomain().length > 0);
    assert.ok(getAppBaseUrl().startsWith("http"));

    // 5b. getAppProtocol
    assert.equal(getAppProtocol("localhost:3000"), "http:");
    assert.equal(getAppProtocol("127.0.0.1:3000"), "http:");
    assert.equal(getAppProtocol("erp-portal.rapidtss.com"), "https:");

    // 5c. getTrustedOrigins includes essential origins and request headers
    const req = new Request("http://localhost:3000/api/health", {
      headers: {
        "x-forwarded-host": "erp-portal.rapidtss.com",
        "x-forwarded-proto": "https",
        origin: "https://erp-portal.rapidtss.com",
      },
    });

    const origins = getTrustedOrigins(req);
    assert.ok(origins.includes("http://localhost:3000"));
    assert.ok(origins.includes("http://84.235.255.173"));
    assert.ok(origins.includes("https://84.235.255.173"));
    assert.ok(origins.includes("https://erp-portal.rapidtss.com"));

    // 5d. Precedence of APP_DOMAIN over BETTER_AUTH_URL in getAppBaseUrl
    const prevAppDomain = process.env.APP_DOMAIN;
    const prevAuthUrl = process.env.BETTER_AUTH_URL;
    try {
      process.env.APP_DOMAIN = "erp-portal.rapidtss.com";
      process.env.BETTER_AUTH_URL = "http://localhost:3000";
      assert.equal(getAppBaseUrl(), "https://erp-portal.rapidtss.com");
    } finally {
      process.env.APP_DOMAIN = prevAppDomain;
      process.env.BETTER_AUTH_URL = prevAuthUrl;
    }
  });
});
