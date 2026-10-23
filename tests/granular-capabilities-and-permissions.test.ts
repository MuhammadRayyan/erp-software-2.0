import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

Object.assign(process.env, {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "granular-capabilities-test-secret-12345",
  ERP_DATA_DIR:
    process.env.ERP_DATA_DIR || mkdtempSync(path.join(tmpdir(), "modern-erp-capabilities-test-")),
  NODE_ENV: "test",
});

const { eq } = await import("drizzle-orm");
const { getSystemDb, getSystemSqlite } = await import("../src/core/db/system");
const {
  authAccounts,
  memberships,
  users,
} = await import("../src/core/db/system-schema");
const { createBusiness } = await import("../src/core/businesses/business-service");
const {
  moduleKeys,
  parseModules,
  parseCapabilities,
  hasPermission,
  getFullCapabilities,
  getEmptyCapabilities,
  getAvailableActionsForModule,
  getModuleDefinition,
  getAllModuleDefinitions,
  STANDARD_ACTIONS,
  MODULE_DEFINITIONS,
} = await import("../src/core/permissions/module-access");
const {
  getBusinessAccess,
  hasActionPermission,
  canUserPerformAction,
} = await import("../src/core/permissions/permissions");
const {
  requirePermission,
  assertBusinessPermission,
} = await import("../src/core/permissions/require-module");
const {
  inviteBusinessUser,
  listBusinessUsers,
  updateMembership,
} = await import("../src/core/permissions/membership-service");
const { completeInvitation } = await import("../src/core/permissions/invitation-service");

test("Granular Capabilities, Sub-Permissions & Extensibility Suite", async (t) => {
  const db = getSystemDb();
  const sqlite = getSystemSqlite();

  // -------------------------------------------------------------
  // TEST 1: Centralized Registry & Extensibility
  // -------------------------------------------------------------
  await t.test("1. Centralized Module Registry: defines all modules, actions, and metadata", () => {
    const allDefs = getAllModuleDefinitions();
    assert.equal(allDefs.length, moduleKeys.length);

    for (const mod of moduleKeys) {
      const def = getModuleDefinition(mod);
      assert.ok(def, `Definition for ${mod} must exist`);
      assert.equal(def.key, mod);
      assert.ok(def.label.length > 0, `Module ${mod} must have a label`);
      assert.ok(def.description.length > 0, `Module ${mod} must have a description`);
      assert.ok(def.actions.length > 0, `Module ${mod} must have at least one action`);
      assert.ok(def.actions.includes("view"), `Module ${mod} must include 'view' action`);
    }

    // Verify STANDARD_ACTIONS coverage
    assert.deepEqual(
      STANDARD_ACTIONS,
      ["view", "create", "edit", "delete", "post", "approve", "export"]
    );

    // Sales and Purchases have full operational workflows
    const salesDef = MODULE_DEFINITIONS.sales;
    assert.ok(salesDef.actions.includes("create"));
    assert.ok(salesDef.actions.includes("edit"));
    assert.ok(salesDef.actions.includes("delete"));
    assert.ok(salesDef.actions.includes("post"));
    assert.ok(salesDef.actions.includes("approve"));

    // Reports is view + export focused
    const reportsDef = MODULE_DEFINITIONS.reports;
    assert.deepEqual(reportsDef.actions, ["view", "export"]);
  });

  // -------------------------------------------------------------
  // TEST 2: Backward Compatibility - Legacy Flat Array Parsing
  // -------------------------------------------------------------
  await t.test("2. Legacy Schema Normalization: flat string arrays expand to full actions", () => {
    const legacyJson = JSON.stringify(["sales", "banking"]);

    // parseModules returns flat array of active modules
    const parsedModules = parseModules("standard", legacyJson);
    assert.deepEqual(parsedModules, ["sales", "banking"]);

    // parseCapabilities normalizes legacy array into full actions for assigned modules
    const caps = parseCapabilities("standard", legacyJson);
    assert.deepEqual(caps.sales, [...getAvailableActionsForModule("sales")]);
    assert.deepEqual(caps.banking, [...getAvailableActionsForModule("banking")]);
    assert.deepEqual(caps.purchases, []);
    assert.deepEqual(caps.accounting, []);
    assert.deepEqual(caps.settings, []);

    // Administrators get full wildcard across all modules regardless of input
    const adminCaps = parseCapabilities("administrator", legacyJson);
    for (const mod of moduleKeys) {
      assert.deepEqual(adminCaps[mod], [...getAvailableActionsForModule(mod)]);
    }
  });

  // -------------------------------------------------------------
  // TEST 3: Structured Capability Map Parsing
  // -------------------------------------------------------------
  await t.test("3. Structured Capability Maps: parses custom action arrays and boolean records", () => {
    // 3A: Action string arrays
    const actionMap = {
      sales: ["view", "create", "edit"],
      purchases: ["view"],
      reports: ["view", "export"],
    };
    const capsA = parseCapabilities("standard", JSON.stringify(actionMap));
    assert.deepEqual(capsA.sales, ["view", "create", "edit"]);
    assert.deepEqual(capsA.purchases, ["view"]);
    assert.deepEqual(capsA.reports, ["view", "export"]);
    assert.deepEqual(capsA.banking, []);

    // parseModules identifies all modules with active capabilities
    const activeModsA = parseModules("standard", JSON.stringify(actionMap));
    assert.deepEqual(activeModsA.sort(), ["sales", "purchases", "reports"].sort());

    // 3B: Boolean maps e.g. { view: true, create: true, delete: false }
    const boolMap = {
      sales: { view: true, create: true, delete: false },
      inventory: { view: true, export: true },
      banking: { view: false, create: false },
    };
    const capsB = parseCapabilities("standard", JSON.stringify(boolMap));
    assert.deepEqual(capsB.sales, ["view", "create"]);
    assert.deepEqual(capsB.inventory, ["view", "export"]);
    assert.deepEqual(capsB.banking, []);

    const activeModsB = parseModules("standard", JSON.stringify(boolMap));
    assert.deepEqual(activeModsB.sort(), ["sales", "inventory"].sort());

    // 3C: Root and module wildcards
    const rootWildcardCaps = parseCapabilities("standard", JSON.stringify({ "*": ["*"] }));
    assert.deepEqual(rootWildcardCaps, getFullCapabilities());

    const modWildcardCaps = parseCapabilities("standard", JSON.stringify({ payroll: ["*"] }));
    assert.deepEqual(modWildcardCaps.payroll, [...getAvailableActionsForModule("payroll")]);
    assert.deepEqual(modWildcardCaps.sales, []);
  });

  // -------------------------------------------------------------
  // TEST 4: Malformed, Empty, and Edge Case Inputs
  // -------------------------------------------------------------
  await t.test("4. Robustness & Fault Tolerance: handles null, empty, corrupted, and invalid values gracefully", () => {
    const emptyExpected = getEmptyCapabilities();

    assert.deepEqual(parseCapabilities("standard", ""), emptyExpected);
    assert.deepEqual(parseCapabilities("standard", null), emptyExpected);
    assert.deepEqual(parseCapabilities("standard", undefined), emptyExpected);
    assert.deepEqual(parseCapabilities("standard", "{not-valid-json"), emptyExpected);
    assert.deepEqual(parseCapabilities("standard", 12345), emptyExpected);
    assert.deepEqual(parseCapabilities("standard", true), emptyExpected);

    assert.deepEqual(parseModules("standard", ""), []);
    assert.deepEqual(parseModules("standard", null), []);
    assert.deepEqual(parseModules("standard", "{bad-json"), []);
    assert.deepEqual(parseModules("standard", 12345), []);
  });

  // -------------------------------------------------------------
  // TEST 5: Permission Evaluation (hasPermission)
  // -------------------------------------------------------------
  await t.test("5. Permission Evaluation Logic: exact matches, view inheritance, and workflow aliases", () => {
    const caps = parseCapabilities("standard", {
      sales: ["create", "edit"],
      purchases: ["post"],
      banking: ["*"],
      reports: ["view"],
    });

    // Exact matches
    assert.equal(hasPermission(caps, "sales", "create"), true);
    assert.equal(hasPermission(caps, "sales", "edit"), true);
    assert.equal(hasPermission(caps, "sales", "delete"), false);

    // View inheritance: having write/edit permissions automatically implies view
    assert.equal(hasPermission(caps, "sales", "view"), true);

    // View-only module: cannot perform operational actions
    assert.equal(hasPermission(caps, "reports", "view"), true);
    assert.equal(hasPermission(caps, "reports", "export"), false);

    // Workflow alias: post and approve are interchangeable
    assert.equal(hasPermission(caps, "purchases", "post"), true);
    assert.equal(hasPermission(caps, "purchases", "approve"), true);

    // Wildcard module grants all actions
    assert.equal(hasPermission(caps, "banking", "view"), true);
    assert.equal(hasPermission(caps, "banking", "delete"), true);
    assert.equal(hasPermission(caps, "banking", "post"), true);

    // Unassigned module
    assert.equal(hasPermission(caps, "accounting", "view"), false);
    assert.equal(hasPermission(caps, "accounting", "post"), false);

    // Null/undefined capabilities
    assert.equal(hasPermission(null, "sales", "view"), false);
    assert.equal(hasPermission(undefined, "sales", "view"), false);
  });

  // -------------------------------------------------------------
  // TEST 6: End-to-End Workspace, Membership Lifecycle & Action Checks
  // -------------------------------------------------------------
  const adminUserId = `admin-${randomUUID().slice(0, 8)}`;
  const adminEmail = `${adminUserId}@testcorp.local`;
  const now = Date.now();

  sqlite.transaction(() => {
    db.insert(users)
      .values({
        id: adminUserId,
        name: "Enterprise Admin",
        email: adminEmail,
        emailVerified: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        isSuperAdmin: false,
        status: "active",
        maxBusinesses: 5,
        maxUsers: 10,
        isTenantAdmin: true,
      })
      .run();

    db.insert(authAccounts)
      .values({
        id: randomUUID(),
        accountId: adminUserId,
        providerId: "credential",
        userId: adminUserId,
        password: "hashedPassword123!",
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .run();
  })();

  const business = createBusiness(
    {
      name: "Acme Enterprises Ltd",
      country: "AE",
      currency: "AED",
      financialYearStartMonth: 1,
    },
    adminUserId
  );
  const businessId = business.id;

  await t.test("6. Workspace Lifecycle: invite user with granular capabilities and verify guards", async () => {
    const salesRepEmail = `salesrep.${randomUUID().slice(0, 6)}@acme.local`;

    // 1. Invite a standard user with restricted sales permissions: view + create only (no post/approve, no delete)
    const inviteRes = await inviteBusinessUser(businessId, adminUserId, {
      email: salesRepEmail,
      role: "standard",
      capabilities: {
        sales: ["view", "create"],
        reports: ["view"],
      },
    });

    assert.ok(inviteRes.inviteUrl);
    const token = (inviteRes.inviteUrl.match(/token=([a-f0-9]+)/) || [])[1];
    await completeInvitation(token, "Alex SalesRep", "SecurePassword2026!");

    const repUserId = inviteRes.userId;

    // 2. Verify membership row in DB
    const memberRow = db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, repUserId))
      .get();
    assert.ok(memberRow);
    const storedCaps = JSON.parse(memberRow.modulesJson);
    assert.deepEqual(storedCaps.sales, ["view", "create"]);
    assert.deepEqual(storedCaps.reports, ["view"]);

    // 3. Verify listBusinessUsers includes normalized modules and capabilities
    const usersList = listBusinessUsers(businessId, adminUserId);
    const repEntry = usersList.find((u) => u.user.id === repUserId);
    assert.ok(repEntry);
    assert.deepEqual(repEntry.modules.sort(), ["reports", "sales"].sort());
    assert.deepEqual(repEntry.capabilities?.sales, ["view", "create"]);

    // 4. Verify getBusinessAccess on server
    const access = getBusinessAccess(businessId, repUserId);
    assert.ok(access);
    assert.deepEqual(access.modules.sort(), ["reports", "sales"].sort());
    assert.deepEqual(access.capabilities.sales, ["view", "create"]);

    // 5. Verify action permissions via hasActionPermission / canUserPerformAction
    assert.equal(hasActionPermission(businessId, repUserId, "sales", "view"), true);
    assert.equal(hasActionPermission(businessId, repUserId, "sales", "create"), true);
    assert.equal(hasActionPermission(businessId, repUserId, "sales", "delete"), false);
    assert.equal(hasActionPermission(businessId, repUserId, "sales", "post"), false);
    assert.equal(hasActionPermission(businessId, repUserId, "sales", "approve"), false);
    assert.equal(canUserPerformAction(businessId, repUserId, "reports", "export"), false);

    // 6. Verify Administrator and Business Owner bypass: possess full capabilities across all actions
    assert.equal(hasActionPermission(businessId, adminUserId, "sales", "delete"), true);
    assert.equal(hasActionPermission(businessId, adminUserId, "sales", "approve"), true);
    assert.equal(hasActionPermission(businessId, adminUserId, "accounting", "post"), true);
    assert.equal(canUserPerformAction(businessId, adminUserId, "settings", "edit"), true);

    // 7. Verify requirePermission guard
    // 7A: Permitted action succeeds
    const allowedGuard = await requirePermission(businessId, repUserId, "sales", "create");
    assert.ok(allowedGuard.user);
    assert.equal(allowedGuard.user.id, repUserId);

    // 7B: Forbidden action rejects with PERMISSION_DENIED
    await assert.rejects(
      async () => {
        await requirePermission(businessId, repUserId, "sales", "approve");
      },
      /PERMISSION_DENIED: Action 'approve' on module 'sales' is not permitted/
    );

    await assert.rejects(
      async () => {
        await assertBusinessPermission(businessId, repUserId, "sales", "delete");
      },
      /PERMISSION_DENIED: Action 'delete' on module 'sales' is not permitted/
    );

    // 8. Update membership to grant 'approve' and 'post'
    updateMembership(businessId, adminUserId, memberRow.id, "standard", {
      sales: ["view", "create", "edit", "post"],
    });

    // Check updated permission
    assert.equal(hasActionPermission(businessId, repUserId, "sales", "post"), true);
    assert.equal(hasActionPermission(businessId, repUserId, "sales", "approve"), true); // alias
    assert.equal(hasActionPermission(businessId, repUserId, "sales", "delete"), false);

    const updatedGuard = await requirePermission(businessId, repUserId, "sales", "approve");
    assert.ok(updatedGuard);
  });
});
