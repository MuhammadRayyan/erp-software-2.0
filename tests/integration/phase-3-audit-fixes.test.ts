import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const testDataDir = mkdtempSync(path.join(tmpdir(), "phase3-audit-fixes-"));

Object.assign(process.env, {
  ERP_DATA_DIR: testDataDir,
  BETTER_AUTH_SECRET: "phase3-audit-fixes-test-secret-64-bytes-long-key-1234567890",
  SETUP_KEY: "phase3-audit-fixes-setup-key-12345678901234567890",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../../src/core/db/seed");
const { getBusinessDb } = await import("../../src/core/db/business");
const { getSystemDb } = await import("../../src/core/db/system");
const { users, memberships } = await import("../../src/core/db/system-schema");
const { createBusiness } = await import("../../src/core/businesses/business-service");
const { logger, getRecentLogs } = await import("../../src/core/logger");
const { updateMembership, removeBusinessUser } = await import("../../src/core/permissions/membership-service");
const { setFinancialLockDate } = await import("../../src/modules/accounting/services/financial-lock-service");
const { saveApprovalRules, listApprovalRules } = await import("../../src/modules/approvals/approval-policy");
const { saveDebitNote, duplicateDebitNote, getDebitNote } = await import("../../src/modules/debit-notes/debit-note-service");
const { savePurchaseOrder, getPurchaseOrder } = await import("../../src/modules/purchase-orders/purchase-order-service");
const { saveStockAdjustment, listStockAdjustments, getStockAdjustment } = await import("../../src/modules/inventory/stock-adjustment-service");
const { saveBankAccount, getBankAccount, bankAccountToInput } = await import("../../src/modules/banking/bank-account-service");
const { startReconciliation } = await import("../../src/modules/banking/reconciliation-service");
const {
  getBusinessProfile,
  updateBusinessProfile,
  updateLocalization,
} = await import("../../src/modules/business-profile/business-profile-service");
const { getTaxSettings, updateTaxSettings } = await import("../../src/modules/tax/tax-settings-service");
const { upsertPreferences, clearPreferences, listPreferences } = await import("../../src/modules/preferences/preference-service");
const { runActivityLogCleanup } = await import("../../src/modules/activity-log/activity-log-service");

test("Phase 3 Audit Fixes Integration Suite", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const standardId = seeded.standard.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  suite.after(() => {
    try {
      rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures on exit
    }
  });

  await suite.test("1. RBAC & tenant isolation: membership, lock date, approval rules, and system-health logs", () => {
    const sysDb = getSystemDb();
    const extraUserId = randomUUID();
    const extraMembershipId = randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    sysDb.insert(users).values({
      id: extraUserId,
      name: "Extra User",
      email: `extra-${extraUserId}@demo.local`,
      emailVerified: true,
      isSuperAdmin: false,
      createdAt: now,
      updatedAt: now,
    }).run();
    sysDb.insert(memberships).values({
      id: extraMembershipId,
      userId: extraUserId,
      businessId,
      role: "standard",
      modulesJson: JSON.stringify(["sales"]),
      requiresApproval: false,
      createdAt: nowIso,
    }).run();

    // Standard user cannot mutate memberships, financial lock date, or approval rules
    assert.throws(() => updateMembership(businessId, standardId, extraMembershipId, "administrator", ["sales"]), /BUSINESS_ACCESS_DENIED|ADMINISTRATOR/i);
    assert.throws(() => removeBusinessUser(businessId, standardId, extraMembershipId), /BUSINESS_ACCESS_DENIED|ADMINISTRATOR/i);
    assert.throws(() => setFinancialLockDate(businessId, standardId, "2026-01-31"), /ADMINISTRATOR|DENIED|PERMISSION/i);
    assert.throws(
      () =>
        saveApprovalRules(businessId, standardId, [
          { entityType: "sales_invoice", isEnabled: true, thresholdMinor: 100000, requireCheckerSeparation: true },
        ]),
      /ADMINISTRATOR|DENIED|PERMISSION/i,
    );

    // Admin cannot remove workspace owner even by id lookup
    const allMemberships = sysDb.select().from(memberships).all().filter((m) => m.businessId === businessId);
    const ownerMembership = allMemberships.find((m) => m.userId === adminId);
    assert.ok(ownerMembership);
    assert.throws(() => removeBusinessUser(businessId, adminId, ownerMembership.id));

    // Tenant log isolation in getRecentLogs
    const otherBiz = createBusiness(
      { name: "Other Tenant Biz", currency: "AED", country: "United Arab Emirates", financialYearStartMonth: 1 },
      adminId,
    );
    const tagA = `tenant-A-${randomUUID()}`;
    const tagB = `tenant-B-${randomUUID()}`;
    logger.info(tagA, { businessId });
    logger.info(tagB, { businessId: otherBiz.id });

    const logsA = getRecentLogs({ businessId, limit: 50 });
    assert.ok(logsA.some((l) => l.message === tagA));
    assert.equal(logsA.some((l) => l.message === tagB), false, "Logs from other tenant must not leak");

    // Transactional saveApprovalRules saves multiple thresholds atomically
    const updatedRules = saveApprovalRules(businessId, adminId, [
      { entityType: "sales_invoice", isEnabled: true, thresholdMinor: 250000, requireCheckerSeparation: true },
      { entityType: "purchase_order", isEnabled: true, thresholdMinor: 125000, requireCheckerSeparation: false },
    ]);
    const listed = listApprovalRules(businessId, adminId);
    const siRule = updatedRules.find((r) => r.entityType === "sales_invoice") ?? listed.find((r) => r.entityType === "sales_invoice");
    const poRule = listed.find((r) => r.entityType === "purchase_order");
    assert.equal(siRule?.thresholdMinor, 250000);
    assert.equal(siRule?.isEnabled, true);
    assert.equal(poRule?.thresholdMinor, 125000);
    assert.equal(poRule?.requireCheckerSeparation, false);
  });

  await suite.test("2. Purchases & FX: debit note empty purchaseInvoiceId, duplicate foreign exchangeRateDate, and PO amounts_include_tax", () => {
    const supplier = sqlite.prepare("SELECT id FROM suppliers WHERE is_active = 1 LIMIT 1").get() as { id: string };
    const expenseAcct = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' AND is_active = 1 LIMIT 1").get() as { id: string };
    const taxCode = sqlite.prepare("SELECT id FROM tax_codes WHERE direction IN ('purchases', 'both') AND is_active = 1 LIMIT 1").get() as { id: string };

    // Ensure an active USD rate exists for duplicate FX test
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT OR REPLACE INTO exchange_rates (id, currency_code, rate_date, rate_to_base, source, created_at)
      VALUES (?, 'USD', '2026-03-10', '3.6725', 'CBUAE', ?)
    `).run(randomUUID(), now);

    const dnId = saveDebitNote(
      businessId,
      adminId,
      {
        supplierId: supplier.id,
        purchaseInvoiceId: "",
        currencyCode: "USD",
        exchangeRateToBase: "3.6725",
        exchangeRateDate: "2026-03-10",
        exchangeRateSource: "CBUAE",
        amountsIncludeTax: false,
        date: "2026-03-10",
        taxDate: "2026-03-10",
        reference: "DN-FX-TEST",
        lines: [
          {
            description: "Returned USD stock",
            quantity: "2",
            discountType: "none",
            discountValue: "0",
            unitPrice: "50.00",
            expenseAccountId: expenseAcct.id,
            taxCodeId: taxCode.id,
          },
        ],
      },
      "draft",
    );
    const createdDn = getDebitNote(businessId, adminId, dnId);
    assert.ok(createdDn);
    assert.equal(createdDn.note.purchaseInvoiceId, null);

    const dupDnId = duplicateDebitNote(businessId, adminId, dnId);
    const dupDn = getDebitNote(businessId, adminId, dupDnId);
    assert.ok(dupDn);
    assert.equal(dupDn.note.currencyCode, "USD");
    assert.equal(dupDn.note.exchangeRateDate, "2026-03-10", "Foreign FX duplicate must preserve exchangeRateDate");

    const poId = savePurchaseOrder(
      businessId,
      adminId,
      {
        supplierId: supplier.id,
        currencyCode: "AED",
        amountsIncludeTax: true,
        date: "2026-04-01",
        expectedDate: "2026-04-10",
        reference: "PO-INCL-TAX",
        lines: [
          {
            description: "Tax-inclusive supply",
            quantity: "1",
            discountType: "none",
            discountValue: "0",
            unitPrice: "105.00",
            expenseAccountId: expenseAcct.id,
            taxCodeId: taxCode.id,
          },
        ],
      },
      "draft",
    );
    const po = getPurchaseOrder(businessId, adminId, poId);
    assert.ok(po);
    assert.equal(Boolean(po.order.amountsIncludeTax), true, "PO amounts_include_tax must persist");
  });

  await suite.test("3. Inventory & Banking: negative stock adjustment value_delta_minor, bank account_code, cash clearing & reconciliation guard", () => {
    const item = sqlite.prepare("SELECT id FROM inventory_items WHERE is_active = 1 LIMIT 1").get() as { id: string };
    const location = sqlite.prepare("SELECT id FROM inventory_locations WHERE is_active = 1 LIMIT 1").get() as { id: string };

    // First post an opening positive adjustment so weighted cost > 0 exists, then post a negative adjustment
    const todayIso = new Date().toISOString().slice(0, 10);
    saveStockAdjustment(
      businessId,
      adminId,
      {
        date: todayIso,
        locationId: location.id,
        itemId: item.id,
        quantityChange: "10",
        unitCost: "25.00",
        reason: "Opening Balance",
        notes: "Initial stock",
      },
      "post",
    );
    const decId = saveStockAdjustment(
      businessId,
      adminId,
      {
        date: todayIso,
        locationId: location.id,
        itemId: item.id,
        quantityChange: "-3",
        unitCost: "",
        reason: "Damaged Goods",
        notes: "Write-off",
      },
      "post",
    );

    const listRows = listStockAdjustments(businessId, adminId);
    const decListRow = listRows.find((r) => r.id === decId);
    const decDetail = getStockAdjustment(businessId, adminId, decId);
    assert.ok(decListRow);
    assert.ok(decDetail);
    assert.ok(Number(decListRow.value_minor) < 0, "Negative stock adjustment list row must preserve signed negative value_minor");
    assert.ok(Number(decDetail.adjustment.value_minor) < 0, "Negative stock adjustment detail must preserve signed negative value_minor");

    // Create dedicated GL ledger accounts for new bank & cash accounts
    const now = new Date().toISOString();
    const bankGlId = randomUUID();
    const cashGlId = randomUUID();
    sqlite.prepare(`
      INSERT INTO accounts (id, name, type, subtype, is_system, is_active, created_at, updated_at)
      VALUES (?, 'Test Bank GL', 'asset', 'bank', 0, 1, ?, ?)
    `).run(bankGlId, now, now);
    sqlite.prepare(`
      INSERT INTO accounts (id, name, type, subtype, is_system, is_active, created_at, updated_at)
      VALUES (?, 'Test Cash GL', 'asset', 'cash', 0, 1, ?, ?)
    `).run(cashGlId, now, now);

    const bankId = saveBankAccount(businessId, adminId, {
      name: "ADCB Operating",
      accountCode: "BNK-991",
      bankName: "ADCB",
      accountNumberMasked: "****4455",
      currencyCode: "AED",
      ledgerAccountId: bankGlId,
      isCashAccount: false,
      isActive: true,
    });
    const savedBank = getBankAccount(businessId, adminId, bankId);
    assert.ok(savedBank);
    assert.equal(savedBank.account_code, "BNK-991");
    assert.equal(bankAccountToInput(savedBank).accountCode, "BNK-991");

    // Cash account must strip bankName & accountNumberMasked and block startReconciliation
    const cashId = saveBankAccount(businessId, adminId, {
      name: "Office Petty Cash",
      accountCode: "CSH-001",
      bankName: "Should Be Cleared",
      accountNumberMasked: "****9999",
      currencyCode: "AED",
      ledgerAccountId: cashGlId,
      isCashAccount: true,
      isActive: true,
    });
    const savedCash = getBankAccount(businessId, adminId, cashId);
    assert.ok(savedCash);
    assert.equal(savedCash.bank_name, null);
    assert.equal(savedCash.account_number_masked, null);
    assert.throws(
      () => startReconciliation(businessId, adminId, cashId, { statementDate: "2026-04-30", statementEndingBalance: "0.00" }),
      /Cash accounts/i,
    );
  });

  await suite.test("4. Bidirectional Profile <-> VAT Sync & compatibility on partial updates", () => {
    // Non-admin cannot update profile or localization
    assert.throws(
      () => updateBusinessProfile(businessId, standardId, { legalName: "Blocked", country: "United Arab Emirates", countryCode: "AE" }),
      /ADMINISTRATOR|DENIED|PERMISSION/i,
    );
    assert.throws(
      () => updateLocalization(businessId, standardId, { dateFormat: "YYYY-MM-DD", timeFormat: "24h", financialYearStartMonth: 1 }),
      /ADMINISTRATOR|DENIED|PERMISSION/i,
    );

    // Register VAT with valid TRN & Emirate
    updateTaxSettings(businessId, adminId, {
      vatRegistered: true,
      trn: "100000000000003",
      enforceTrnChecksum: false,
      vatRegistrationEffectiveDate: "2026-01-01",
      vatDeregistrationDate: "",
      defaultSupplyEmirate: "dubai",
    });
    let profile = getBusinessProfile(businessId, adminId);
    assert.equal(profile.taxId, "100000000000003");
    assert.equal(profile.stateOrEmirate, "Dubai");

    // Partial update without taxId/stateOrEmirate preserves existing TRN and Emirate
    updateBusinessProfile(businessId, adminId, {
      legalName: "Gulf Apex Trading LLC",
      tradingName: "Gulf Apex",
      country: "United Arab Emirates",
      countryCode: "AE",
    });
    profile = getBusinessProfile(businessId, adminId);
    assert.equal(profile.taxId, "100000000000003");
    assert.equal(profile.stateOrEmirate, "Dubai");
    assert.equal(getTaxSettings(businessId, adminId).trn, "100000000000003");

    // Explicit invalid TRN while VAT registered throws cleanly
    assert.throws(() =>
      updateBusinessProfile(businessId, adminId, {
        legalName: "Gulf Apex Trading LLC",
        taxId: "12345",
        country: "United Arab Emirates",
        countryCode: "AE",
      }),
    );

    // Valid TRN + Emirate change in profile syncs back to business_tax_settings
    updateBusinessProfile(businessId, adminId, {
      legalName: "Gulf Apex Trading LLC",
      taxId: "100234567890003",
      stateOrEmirate: "Abu Dhabi",
      country: "United Arab Emirates",
      countryCode: "AE",
    });
    const syncedTax = getTaxSettings(businessId, adminId);
    assert.equal(syncedTax.trn, "100234567890003");
    assert.equal(syncedTax.defaultSupplyEmirate, "abu_dhabi");

    // Missing tax row returns safe defaults instead of crashing
    sqlite.prepare("DELETE FROM business_tax_settings WHERE id = 'default'").run();
    const emptyTax = getTaxSettings(businessId, adminId);
    assert.equal(emptyTax.vatRegistered, false);
    assert.equal(emptyTax.trn, null);
  });

  await suite.test("5. Preferences & Activity Log retention clamping: preserve business.pinned and clamp 7..3650 days", () => {
    upsertPreferences(businessId, adminId, {
      "business.pinned": "true",
      "cols.invoices": '{"status":false}',
      "overview.range": '"30d"',
    });
    const deletedCount = clearPreferences(businessId, adminId);
    assert.equal(deletedCount, 2);
    const remaining = listPreferences(businessId, adminId);
    assert.equal(remaining["business.pinned"], "true");
    assert.equal(remaining["cols.invoices"], undefined);

    // Seed synthetic activity log rows aged 5 days and 10 days
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const recentId = `log-5d-${randomUUID()}`;
    const oldId = `log-10d-${randomUUID()}`;
    sqlite.prepare(`
      INSERT INTO activity_logs (id, business_id, user_id, user_name, user_email, action, entity_type, entity_id, entity_number, summary, created_at)
      VALUES (?, ?, ?, 'Admin', 'admin@demo.local', 'created', 'sales_invoice', 'e1', 'INV-5D', 'Recent log', ?)
    `).run(recentId, businessId, adminId, fiveDaysAgo);
    sqlite.prepare(`
      INSERT INTO activity_logs (id, business_id, user_id, user_name, user_email, action, entity_type, entity_id, entity_number, summary, created_at)
      VALUES (?, ?, ?, 'Admin', 'admin@demo.local', 'created', 'sales_invoice', 'e2', 'INV-10D', 'Old log', ?)
    `).run(oldId, businessId, adminId, tenDaysAgo);

    // overrideDays = 1 must clamp up to 7 days, preserving the 5-day-old row while pruning the 10-day-old row
    const resMin = runActivityLogCleanup(businessId, adminId, 1);
    assert.ok(resMin.deletedCount >= 1);
    const hasRecent = sqlite.prepare("SELECT id FROM activity_logs WHERE id = ?").get(recentId);
    const hasOld = sqlite.prepare("SELECT id FROM activity_logs WHERE id = ?").get(oldId);
    assert.ok(hasRecent, "5-day-old log must survive when overrideDays clamps to minimum 7 days");
    assert.equal(hasOld, undefined, "10-day-old log must be pruned");

    // overrideDays = 99999 must clamp down to 3650 days (~10 years) without error and preserve recent logs
    const resMax = runActivityLogCleanup(businessId, adminId, 99999);
    assert.equal(resMax.deletedCount, 0);
    assert.ok(sqlite.prepare("SELECT id FROM activity_logs WHERE id = ?").get(recentId));
  });
});
