import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const testDataDir = mkdtempSync(path.join(tmpdir(), "modern-erp-admin-tenants-test-"));
const testSetupKey = "admin-tenant-test-key-xyz-789";

Object.assign(process.env, {
  ERP_DATA_DIR: testDataDir,
  BETTER_AUTH_SECRET: "test-better-auth-secret-for-tenant-tests-64chars-long-minimum-key",
  SETUP_KEY: testSetupKey,
  NODE_ENV: "test",
});

const { getSystemSqlite } = await import("../src/core/db/system");
const { createRootSuperAdmin } = await import("../src/core/auth/setup-service");
const {
  createTenantAccount,
  getTenantDetails,
  listTenantsWithStats,
  resetTenantPassword,
  toggleTenantSuspension,
  updateTenantQuotas,
} = await import("../src/core/admin/tenant-service");
const { createBusiness } = await import("../src/core/businesses/business-service");
const { createAndAddBusinessUser } = await import("../src/core/permissions/membership-service");
const { auth } = await import("../src/core/auth/auth");

test("Admin Control Panel, Tenant Lifecycle, Quotas & Safety Safeguards Suite", async (suite) => {
  const sqlite = getSystemSqlite();
  let superAdminId: string;
  let testTenantId: string;

  await suite.test("1. Migration 6 Schema Validation: tenants, quotas, ownership and indexes", () => {
    // Check migration table
    const migration = sqlite
      .prepare("SELECT version, name FROM schema_migrations WHERE version = 6")
      .get() as { version: number; name: string };
    assert.ok(migration, "Migration 6 must be applied to system database");
    assert.equal(migration.version, 6);

    // Verify user table has new columns
    const userColumns = sqlite.prepare("PRAGMA table_info(user)").all() as { name: string }[];
    const colNames = userColumns.map((c) => c.name);
    assert.ok(colNames.includes("status"), "user table must have status column");
    assert.ok(colNames.includes("max_businesses"), "user table must have max_businesses column");
    assert.ok(colNames.includes("max_users"), "user table must have max_users column");
    assert.ok(colNames.includes("is_tenant_admin"), "user table must have is_tenant_admin column");
    assert.ok(colNames.includes("created_by_user_id"), "user table must have created_by_user_id column");

    // Verify businesses table has owner_user_id column
    const businessColumns = sqlite.prepare("PRAGMA table_info(businesses)").all() as { name: string }[];
    const bColNames = businessColumns.map((c) => c.name);
    assert.ok(bColNames.includes("owner_user_id"), "businesses table must have owner_user_id column");
  });

  await suite.test("2. Initialize Platform Super-Admin", async () => {
    const created = await createRootSuperAdmin({
      name: "Master Super Admin",
      email: "master@platform.local",
      password: "MasterSecurePassword2026!",
      setupKey: testSetupKey,
    });
    superAdminId = created.userId;
    assert.ok(superAdminId);
  });

  await suite.test("3. Provision New Tenant (Account Holder) via Admin Service", async () => {
    // Non-super-admin cannot create tenants
    await assert.rejects(
      async () => {
        await createTenantAccount(
          {
            name: "Hacker Tenant",
            email: "hacker@domain.com",
            password: "password12345",
            maxBusinesses: 3,
            maxUsers: 5,
          },
          "invalid-super-admin-id"
        );
      },
      /PERMISSION_DENIED/,
      "Non-super-admin must be blocked from provisioning tenants"
    );

    // Super admin provisions Client Tenant
    const tenant = await createTenantAccount(
      {
        name: "Acme Corp Lead",
        email: "client@acme.com",
        password: "ClientSecurePassword123!",
        maxBusinesses: 2,
        maxUsers: 3,
      },
      superAdminId
    );

    testTenantId = tenant.id;
    assert.ok(testTenantId);
    assert.equal(tenant.email, "client@acme.com");
    assert.equal(tenant.maxBusinesses, 2);
    assert.equal(tenant.maxUsers, 3);
    assert.equal(tenant.status, "active");

    // Verify record in database
    const row = sqlite
      .prepare("SELECT id, name, email, is_tenant_admin, max_businesses, max_users, status, created_by_user_id FROM user WHERE id = ?")
      .get(testTenantId) as any;
    assert.equal(row.is_tenant_admin, 1);
    assert.equal(row.max_businesses, 2);
    assert.equal(row.max_users, 3);
    assert.equal(row.status, "active");
    assert.equal(row.created_by_user_id, superAdminId);

    // Verify duplicate email is blocked
    await assert.rejects(
      async () => {
        await createTenantAccount(
          {
            name: "Duplicate Email Client",
            email: "client@acme.com",
            password: "ClientSecurePassword123!",
            maxBusinesses: 2,
            maxUsers: 3,
          },
          superAdminId
        );
      },
      /DUPLICATE_EMAIL/,
      "Duplicate email registration must be rejected"
    );

    // Verify tenant can authenticate with Better-Auth
    const login = await auth.api.signInEmail({
      body: {
        email: "client@acme.com",
        password: "ClientSecurePassword123!",
      },
    });
    assert.ok(login?.token, "Tenant must be able to sign in with provisioned credentials");
    assert.equal(login.user.email, "client@acme.com");
  });

  await suite.test("4. Quota Enforcement: Workspace Creation Limits", () => {
    // Tenant creates 1st business -> succeeds
    const b1 = createBusiness(
      {
        name: "Acme Trading Dubai",
        country: "United Arab Emirates",
        currency: "AED",
        financialYearStartMonth: 1,
      },
      testTenantId,
      { enforceQuota: true }
    );
    assert.ok(b1.id);

    // Verify owner_user_id was recorded
    const b1Row = sqlite.prepare("SELECT id, owner_user_id FROM businesses WHERE id = ?").get(b1.id) as any;
    assert.equal(b1Row.owner_user_id, testTenantId);

    // Tenant creates 2nd business -> succeeds (quota = 2)
    const b2 = createBusiness(
      {
        name: "Acme Logistics Abu Dhabi",
        country: "United Arab Emirates",
        currency: "AED",
        financialYearStartMonth: 1,
      },
      testTenantId,
      { enforceQuota: true }
    );
    assert.ok(b2.id);

    // Tenant attempts to create 3rd business -> MUST FAIL with QUOTA_EXCEEDED!
    assert.throws(
      () => {
        createBusiness(
          {
            name: "Acme Retail Sharjah",
            country: "United Arab Emirates",
            currency: "AED",
            financialYearStartMonth: 1,
          },
          testTenantId,
          { enforceQuota: true }
        );
      },
      /QUOTA_EXCEEDED/,
      "Tenant attempting to exceed maxBusinesses quota must be blocked"
    );

    // Super Admin has NO quota limits
    assert.doesNotThrow(() => {
      createBusiness(
        {
          name: "Super Admin Sandbox",
          country: "United States",
          currency: "USD",
          financialYearStartMonth: 1,
        },
        superAdminId,
        { enforceQuota: true }
      );
    });
  });

  await suite.test("5. Quota Upgrades via Admin Service", () => {
    // Super Admin upgrades tenant quota from 2 to 5 businesses
    const updated = updateTenantQuotas(testTenantId, { maxBusinesses: 5, maxUsers: 10 }, superAdminId);
    assert.equal(updated.maxBusinesses, 5);
    assert.equal(updated.maxUsers, 10);

    // Tenant can now create the 3rd business without error
    assert.doesNotThrow(() => {
      createBusiness(
        {
          name: "Acme Retail Sharjah",
          country: "United Arab Emirates",
          currency: "AED",
          financialYearStartMonth: 1,
        },
        testTenantId,
        { enforceQuota: true }
      );
    });
  });

  await suite.test("6. Sub-User Creation & Team Member Quota Enforcement", async () => {
    const tenantBusinesses = sqlite
      .prepare("SELECT id FROM businesses WHERE owner_user_id = ?")
      .all(testTenantId) as { id: string }[];
    const bId = tenantBusinesses[0].id;

    // Create 1st team member
    const u1 = await createAndAddBusinessUser(bId, testTenantId, {
      name: "Accountant Alice",
      email: "alice@acme.com",
      password: "password12345",
      role: "standard",
      modules: ["sales", "purchases"],
    });
    assert.ok(u1.userId);

    // Verify Alice exists in database and is assigned to the business
    const aliceMembership = sqlite
      .prepare("SELECT role, modules_json FROM business_memberships WHERE business_id = ? AND user_id = ?")
      .get(bId, u1.userId) as any;
    assert.equal(aliceMembership.role, "standard");
    assert.ok(aliceMembership.modules_json.includes("sales"));
  });

  await suite.test("7. Tenant Suspension, Session Revocation & Sign-in Shield", async () => {
    // 1. Root Super Admin cannot be suspended
    assert.throws(
      () => {
        toggleTenantSuspension(superAdminId, "suspended", superAdminId);
      },
      /CANNOT_SUSPEND_SUPER_ADMIN/,
      "Root Super Admin deletion/suspension must be strictly prevented"
    );

    // 2. Client logs in and establishes an active session
    const loginBefore = await auth.api.signInEmail({
      body: {
        email: "client@acme.com",
        password: "ClientSecurePassword123!",
      },
    });
    assert.ok(loginBefore?.token);

    // Verify session row exists
    const sessionCountBefore = sqlite
      .prepare("SELECT count(*) as count FROM session WHERE userId = ?")
      .get(testTenantId) as { count: number };
    assert.ok(sessionCountBefore.count > 0, "Active session must exist before suspension");

    // 3. Super admin suspends tenant
    const res = toggleTenantSuspension(testTenantId, "suspended", superAdminId);
    assert.equal(res.newStatus, "suspended");

    // 4. Verify all active sessions were revoked immediately
    const sessionCountAfter = sqlite
      .prepare("SELECT count(*) as count FROM session WHERE userId = ?")
      .get(testTenantId) as { count: number };
    assert.equal(sessionCountAfter.count, 0, "All active sessions must be deleted upon suspension");

    // 5. Subsequent sign-in attempts by suspended tenant MUST be rejected (403 Forbidden)
    await assert.rejects(
      async () => {
        await auth.api.signInEmail({
          body: {
            email: "client@acme.com",
            password: "ClientSecurePassword123!",
          },
        });
      },
      (err: any) => {
        return err.message?.includes("suspended") || err.status === 403;
      },
      "Suspended user sign-in attempt must be rejected"
    );

    // 6. Reactivate tenant
    const reactivateRes = toggleTenantSuspension(testTenantId, "active", superAdminId);
    assert.equal(reactivateRes.newStatus, "active");

    // 7. Tenant can sign in again after reactivation
    const loginAfter = await auth.api.signInEmail({
      body: {
        email: "client@acme.com",
        password: "ClientSecurePassword123!",
      },
    });
    assert.ok(loginAfter?.token, "Reactivated user can log in again");
  });

  await suite.test("8. Tenant Password Reset via Admin Service", async () => {
    // Reset password
    const resetRes = await resetTenantPassword(testTenantId, "BrandNewSecurePassword2026!", superAdminId);
    assert.equal(resetRes.success, true);

    // Old password fails
    await assert.rejects(
      async () => {
        await auth.api.signInEmail({
          body: {
            email: "client@acme.com",
            password: "ClientSecurePassword123!",
          },
        });
      },
      /Invalid email or password|INVALID_EMAIL_OR_PASSWORD|401/i
    );

    // New password succeeds
    const newLogin = await auth.api.signInEmail({
      body: {
        email: "client@acme.com",
        password: "BrandNewSecurePassword2026!",
      },
    });
    assert.ok(newLogin?.token, "Sign in with new reset password must succeed");
  });

  await suite.test("9. Tenant Drill-Down & Stats Verification (getTenantDetails & listTenantsWithStats)", () => {
    const list = listTenantsWithStats();
    assert.ok(list.length >= 2, "List must contain at least super-admin and client tenant");

    const clientSummary = list.find((t) => t.id === testTenantId);
    assert.ok(clientSummary);
    assert.equal(clientSummary.businessCount, 3);
    assert.equal(clientSummary.subUsersCount, 1);
    assert.equal(clientSummary.status, "active");

    const details = getTenantDetails(testTenantId);
    assert.ok(details);
    assert.equal(details.user.id, testTenantId);
    assert.equal(details.businesses.length, 3);
    assert.equal(details.subUsers.length, 1);
    assert.equal(details.subUsers[0].name, "Accountant Alice");
    assert.equal(details.subUsers[0].role, "standard");
  });
});
