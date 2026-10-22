import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const testDataDir = mkdtempSync(path.join(tmpdir(), "modern-erp-super-admin-test-"));
const testSetupKey = "super-secret-test-setup-key-xyz-123";

Object.assign(process.env, {
  ERP_DATA_DIR: testDataDir,
  BETTER_AUTH_SECRET: "test-better-auth-secret-for-superadmin-tests-64chars-long",
  SETUP_KEY: testSetupKey,
  NODE_ENV: "test",
});

const { getSystemSqlite } = await import("../src/core/db/system");
const { isSetupComplete, createRootSuperAdmin, verifySetupKey, resolveSetupKey } = await import("../src/core/auth/setup-service");
const { getBusinessDb } = await import("../src/core/db/business");
const { getBusinessAccess } = await import("../src/core/permissions/permissions");
const { moduleKeys } = await import("../src/core/permissions/module-access");
const { createBusiness, getBusinessForUser, listBusinessesForUser, touchBusiness } = await import("../src/core/businesses/business-service");
const { auth } = await import("../src/core/auth/auth");

test("Super-Admin Lifecycle, Resilience, Trigger Deletion Shield & Workspace Suspension Suite", async (suite) => {
  const sqlite = getSystemSqlite();

  await suite.test("1. Migration 5 schema validation: is_super_admin, status column, and engine triggers", () => {
    // Check migration table
    const migration = sqlite.prepare("SELECT version, name FROM schema_migrations WHERE version = 5").get() as {
      version: number;
      name: string;
    };
    assert.ok(migration, "Migration 5 must be applied to system database");
    assert.equal(migration.version, 5);

    // Verify user table has is_super_admin column
    const userColumns = sqlite.prepare("PRAGMA table_info(user)").all() as { name: string }[];
    const hasSuperAdminCol = userColumns.some((col) => col.name === "is_super_admin");
    assert.ok(hasSuperAdminCol, "user table must contain is_super_admin column");

    // Verify businesses table has status column
    const businessColumns = sqlite.prepare("PRAGMA table_info(businesses)").all() as { name: string }[];
    const hasStatusCol = businessColumns.some((col) => col.name === "status");
    assert.ok(hasStatusCol, "businesses table must contain status column");

    // Verify trigger exists
    const trigger = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'prevent_superadmin_deletion'")
      .get() as { name: string };
    assert.ok(trigger, "prevent_superadmin_deletion trigger must exist on system database");
  });

  await suite.test("2. Setup Key Resolution & Validation", () => {
    assert.equal(resolveSetupKey(), testSetupKey);
    assert.equal(verifySetupKey(testSetupKey), true);
    assert.equal(verifySetupKey("wrong-key"), false);
    assert.equal(verifySetupKey(""), false);
  });

  await suite.test("3. Visual Setup Gate & Atomic Super-Admin Creation", async () => {
    // Before any user is created: setup must NOT be complete
    assert.equal(isSetupComplete(), false, "isSetupComplete must be false on fresh DB");

    // Reject with bad setup key
    await assert.rejects(
      async () => {
        await createRootSuperAdmin({
          name: "Root Admin",
          email: "superadmin@platform.local",
          password: "password12345",
          setupKey: "invalid-key",
        });
      },
      /INVALID_SETUP_KEY/,
    );

    // Reject invalid inputs
    await assert.rejects(
      async () => {
        await createRootSuperAdmin({
          name: "A",
          email: "superadmin@platform.local",
          password: "password12345",
          setupKey: testSetupKey,
        });
      },
      /INVALID_NAME/,
    );

    await assert.rejects(
      async () => {
        await createRootSuperAdmin({
          name: "Root Admin",
          email: "invalid-email",
          password: "password12345",
          setupKey: testSetupKey,
        });
      },
      /INVALID_EMAIL/,
    );

    await assert.rejects(
      async () => {
        await createRootSuperAdmin({
          name: "Root Admin",
          email: "superadmin@platform.local",
          password: "short",
          setupKey: testSetupKey,
        });
      },
      /WEAK_PASSWORD/,
    );

    // Successful super-admin creation
    const created = await createRootSuperAdmin({
      name: "Root Administrator",
      email: "superadmin@platform.local",
      password: "MasterSecurePassword2026!",
      setupKey: testSetupKey,
    });

    assert.ok(created.userId);
    assert.equal(created.email, "superadmin@platform.local");

    // Verify row in user table has is_super_admin = 1
    const userRow = sqlite
      .prepare("SELECT id, name, email, is_super_admin FROM user WHERE id = ?")
      .get(created.userId) as { id: string; name: string; email: string; is_super_admin: number };
    assert.equal(userRow.is_super_admin, 1, "Created user must have is_super_admin = 1");

    // Verify isSetupComplete is now permanently true
    assert.equal(isSetupComplete(), true, "isSetupComplete must be true after super-admin is initialized");

    // Verify super-admin can sign in via better-auth with initialized credentials
    const loginResult = await auth.api.signInEmail({
      body: {
        email: "superadmin@platform.local",
        password: "MasterSecurePassword2026!",
      },
    });
    assert.ok(loginResult, "Sign-in should succeed for created super-admin");
    assert.equal(loginResult.user.email, "superadmin@platform.local");
    assert.equal(Boolean(loginResult.user.isSuperAdmin), true, "Session user must have isSuperAdmin = true");
    assert.ok(loginResult.token, "Auth session token must be generated");

    // Verify subsequent setup attempts are strictly blocked
    await assert.rejects(
      async () => {
        await createRootSuperAdmin({
          name: "Second Super Admin",
          email: "second@platform.local",
          password: "MasterSecurePassword2026!",
          setupKey: testSetupKey,
        });
      },
      /SETUP_ALREADY_COMPLETED/,
    );
  });

  await suite.test("4. SQLite Engine-Level Trigger: Immutability Shield against Super-Admin Deletion", () => {
    // Create a standard (non-super-admin) user directly to test deletion
    const regularUserId = crypto.randomUUID();
    const now = Date.now();
    sqlite
      .prepare(`
        INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, is_super_admin)
        VALUES (?, 'Standard User', 'standard@test.local', 1, ?, ?, 0)
      `)
      .run(regularUserId, now, now);

    // Standard user CAN be deleted normally
    assert.doesNotThrow(() => {
      sqlite.prepare("DELETE FROM user WHERE id = ?").run(regularUserId);
    });

    // Super-admin user CANNOT be deleted - trigger must abort the transaction
    const superAdmin = sqlite.prepare("SELECT id FROM user WHERE is_super_admin = 1 LIMIT 1").get() as { id: string };
    assert.ok(superAdmin, "Super admin user must exist");

    assert.throws(
      () => {
        sqlite.prepare("DELETE FROM user WHERE id = ?").run(superAdmin.id);
      },
      /IMMUTABLE_ROOT_ACCOUNT: Super-admin cannot be deleted\./,
      "Engine trigger must raise ABORT exception when attempting to delete super-admin",
    );

    // Verify super-admin is still present in the table
    const stillExists = sqlite.prepare("SELECT id FROM user WHERE id = ?").get(superAdmin.id);
    assert.ok(stillExists, "Super-admin record must still be intact");
  });

  await suite.test("5. Workspace Suspension & Super-Admin Live View Access Control", () => {
    const superAdmin = sqlite.prepare("SELECT id FROM user WHERE is_super_admin = 1 LIMIT 1").get() as { id: string };

    // Create a regular tenant user
    const tenantUserId = crypto.randomUUID();
    const now = Date.now();
    sqlite
      .prepare(`
        INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, is_super_admin)
        VALUES (?, 'Tenant User', 'tenant@company.local', 1, ?, ?, 0)
      `)
      .run(tenantUserId, now, now);

    // Create a business owned by tenant user
    const business = createBusiness(
      {
        name: "Acme Logistics Ltd",
        country: "United Arab Emirates",
        currency: "AED",
        financialYearStartMonth: 1,
      },
      tenantUserId,
    );

    // Verify initial status is active
    const businessRow = sqlite
      .prepare("SELECT id, status FROM businesses WHERE id = ?")
      .get(business.id) as { id: string; status: string };
    assert.equal(businessRow.status, "active", "Default business status must be active");

    // Tenant user can access getBusinessDb while active
    assert.doesNotThrow(() => {
      getBusinessDb(business.id, tenantUserId);
    });

    // Suspend the business
    sqlite.prepare("UPDATE businesses SET status = 'suspended' WHERE id = ?").run(business.id);

    // Tenant user MUST be blocked with BUSINESS_SUSPENDED
    assert.throws(
      () => {
        getBusinessDb(business.id, tenantUserId);
      },
      /BUSINESS_SUSPENDED/,
      "Tenant user must receive BUSINESS_SUSPENDED error when business is suspended",
    );

    // Super-Admin MUST have Live View access without any error!
    assert.doesNotThrow(() => {
      const db = getBusinessDb(business.id, superAdmin.id);
      assert.ok(db.sqlite, "Super-admin must receive valid database handle for suspended business");
    });

    // Super-Admin access check through getBusinessAccess returns isSuperAdmin: true
    const access = getBusinessAccess(business.id, superAdmin.id);
    assert.ok(access, "getBusinessAccess must return access for super-admin");
    assert.equal(access.isSuperAdmin, true);
    assert.equal(access.business.status, "suspended");

    // Reactivate business
    sqlite.prepare("UPDATE businesses SET status = 'active' WHERE id = ?").run(business.id);

    // Tenant user can access again
    assert.doesNotThrow(() => {
      getBusinessDb(business.id, tenantUserId);
    });
  });

  await suite.test("7. Super-Admin Full Platform Live View & Workspace Inspection", () => {
    const superAdmin = sqlite.prepare("SELECT id FROM user WHERE is_super_admin = 1 LIMIT 1").get() as { id: string };
    const business = sqlite.prepare("SELECT id FROM businesses LIMIT 1").get() as { id: string };

    // Verify Super-Admin full access via getBusinessForUser, listBusinessesForUser, and touchBusiness
    // Even without an explicit row in business_memberships:
    const superAdminBusinessAccess = getBusinessForUser(business.id, superAdmin.id);
    assert.ok(superAdminBusinessAccess, "getBusinessForUser must return valid business entry for super-admin");
    assert.equal(superAdminBusinessAccess.membership.role, "administrator");
    assert.equal(superAdminBusinessAccess.business.id, business.id);

    // touchBusiness must succeed for super-admin on any tenant business
    assert.doesNotThrow(() => {
      touchBusiness(business.id, superAdmin.id);
    }, "touchBusiness must succeed for super-admin on tenant workspace");

    // listBusinessesForUser must return all tenant businesses for super-admin
    const superAdminList = listBusinessesForUser(superAdmin.id);
    const foundInList = superAdminList.find((b) => b.business.id === business.id);
    assert.ok(foundInList, "listBusinessesForUser must include tenant business for super-admin");
    assert.equal(foundInList.membership.role, "administrator");

    // If super-admin is explicitly added with standard role, their effective role must still be administrator
    sqlite.prepare(`
      INSERT INTO business_memberships (id, business_id, user_id, role, modules_json, created_at)
      VALUES ('custom-standard-membership', ?, ?, 'standard', '["sales"]', ?)
    `).run(business.id, superAdmin.id, new Date().toISOString());

    const elevatedAccess = getBusinessAccess(business.id, superAdmin.id);
    assert.ok(elevatedAccess);
    assert.equal(elevatedAccess.membership.role, "administrator", "Super-admin role must always be administrator");
    assert.deepEqual(elevatedAccess.modules, [...moduleKeys], "Super-admin must always have all module access");

    const elevatedDb = getBusinessDb(business.id, superAdmin.id);
    assert.equal(elevatedDb.membership.role, "administrator");
  });

  await suite.test("6. Auth Hardening: Public HTTP Sign-up is Blocked and disableSignUp is enforced", async () => {
    // Check auth configuration options
    assert.equal(auth.options.emailAndPassword?.disableSignUp, process.env.NODE_ENV === "production");

    // Attempting to call the HTTP sign-up route directly via auth middleware or handler
    const mockRequest = new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "hacker@bot.net",
        password: "maliciouspassword123",
        name: "Bot User",
      }),
    });

    const response = await auth.handler(mockRequest);
    // Response should be 403 Forbidden
    assert.equal(response.status, 403, "Public sign-up endpoint must return 403 Forbidden");
    const json = (await response.json()) as { message?: string };
    assert.ok(json.message?.includes("Public registration is disabled"), "Response must indicate public signup is disabled");
  });
});
