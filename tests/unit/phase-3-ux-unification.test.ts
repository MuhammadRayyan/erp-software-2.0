import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  getFlatSettingsItems,
  getVisibleSettingsGroups,
  SETTINGS_GROUPS,
} from "../../src/modules/settings/settings-registry";
import { moduleForBusinessPath } from "../../src/core/permissions/module-access";
import { primaryNav } from "../../src/components/app-shell/nav-items";
import { customerInputSchema } from "../../src/modules/customers/customer-input";
import { supplierInputSchema } from "../../src/modules/suppliers/supplier-input";
import { inventoryItemInputSchema } from "../../src/modules/inventory/inventory-item-input";
import { projectInputSchema } from "../../src/modules/projects/project-input";
import { debitNoteInputSchema } from "../../src/modules/debit-notes/debit-note-input";
import { bankTransactionInputSchema } from "../../src/modules/banking/bank-transaction-input";
import { bankTransferInputSchema } from "../../src/modules/banking/bank-transfer-input";
import {
  formatMoney,
  getCurrencyMinorUnit,
  minorToDecimalString,
} from "../../src/core/format";
import {
  minorToCurrencyInput,
  parseCurrencyAmountToMinor,
} from "../../src/modules/currency/conversion";
import { escapeCsvCell } from "../../src/lib/csv-utils";

function walkSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkSourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

test("settings registry entries define metadata and enforce RBAC/module visibility", () => {
  const allEntries = SETTINGS_GROUPS.flatMap((group) => group.items);
  assert.ok(allEntries.length > 0);
  for (const entry of allEntries) {
    assert.ok(entry.title.trim().length > 0, `Missing title for ${entry.id}`);
    assert.ok(entry.subtitle.trim().length > 0, `Missing subtitle for ${entry.id}`);
    assert.ok(entry.path.startsWith("/settings"), `Expected /settings path for ${entry.id}`);
    assert.ok(entry.keywords.trim().length > 0, `Missing keywords for ${entry.id}`);
  }

  const superAdminRequiredIds = new Set(
    allEntries.filter((e) => e.requiresSuperAdmin).map((e) => e.id),
  );
  const adminRequiredIds = new Set(
    allEntries.filter((e) => e.requiresAdmin).map((e) => e.id),
  );
  const personalIds = new Set(
    allEntries.filter((e) => e.isPersonal).map((e) => e.id),
  );

  assert.ok(superAdminRequiredIds.size > 0);

  const regularAdminItems = getFlatSettingsItems({
    businessId: "biz-1",
    isAdmin: true,
    isSuperAdmin: false,
    hasSettingsModule: true,
  });
  for (const superId of superAdminRequiredIds) {
    assert.equal(
      regularAdminItems.some((item) => item.id === superId),
      false,
      `Expected super-admin setting ${superId} hidden for regular admin`,
    );
  }

  const superAdminItems = getFlatSettingsItems({
    businessId: "biz-1",
    isAdmin: true,
    isSuperAdmin: true,
    hasSettingsModule: true,
  });
  for (const superId of superAdminRequiredIds) {
    assert.equal(
      superAdminItems.some((item) => item.id === superId),
      true,
      `Expected super-admin setting ${superId} visible for super admin`,
    );
  }

  const nonAdminItems = getFlatSettingsItems({
    businessId: "biz-1",
    isAdmin: false,
    isSuperAdmin: false,
    hasSettingsModule: true,
  });
  for (const adminId of adminRequiredIds) {
    assert.equal(
      nonAdminItems.some((item) => item.id === adminId),
      false,
      `Expected admin-only setting ${adminId} hidden for non-admin`,
    );
  }

  const noSettingsModItems = getFlatSettingsItems({
    businessId: "biz-1",
    isAdmin: false,
    isSuperAdmin: false,
    hasSettingsModule: false,
  });
  assert.ok(noSettingsModItems.length > 0);
  for (const item of noSettingsModItems) {
    assert.equal(
      personalIds.has(item.id),
      true,
      `Expected only personal settings when settings module hidden, got ${item.id}`,
    );
  }

  const vatGroups = getVisibleSettingsGroups({ businessId: "biz-1", vatRegistered: true });
  const nonVatGroups = getVisibleSettingsGroups({ businessId: "biz-1", vatRegistered: false });
  const vatTaxItem = vatGroups.flatMap((g) => g.items).find((i) => i.id === "tax");
  const nonVatTaxItem = nonVatGroups.flatMap((g) => g.items).find((i) => i.id === "tax");
  assert.equal(vatTaxItem?.badge, "VAT Registered");
  assert.equal(vatTaxItem?.tone, "success");
  assert.equal(nonVatTaxItem?.badge, "Non-VAT");
  assert.equal(nonVatTaxItem?.tone, "neutral");
});

test("zero native browser confirm/alert/prompt calls exist under src/", () => {
  const srcRoot = path.join(process.cwd(), "src");
  const files = walkSourceFiles(srcRoot);
  const offenders: string[] = [];
  const pattern = /\b(?:window\.)?(?:confirm|alert|prompt)\s*\(/;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    if (pattern.test(content)) {
      offenders.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(offenders, []);
});

test("navigation includes inventory adjustments and UAE VAT return; command palette omits broken journal/new", () => {
  const navItems = primaryNav.flatMap((group) => group.items);
  const stockAdj = navItems.find((item) => item.path === "/inventory/adjustments");
  const vatReturn = navItems.find((item) => item.path === "/tax/vat");

  assert.equal(stockAdj?.label, "Stock Adjustments");
  assert.equal(stockAdj?.module, "inventory");
  assert.equal(vatReturn?.label, "UAE VAT Return");
  assert.equal(vatReturn?.module, "reports");

  const paletteSrc = readFileSync(
    path.join(process.cwd(), "src/components/command-palette.tsx"),
    "utf8",
  );
  assert.equal(paletteSrc.includes("/accounting/journal/new"), false);
});

test("quick-create input schemas validate minimal payloads and server actions guard permissions", () => {
  assert.equal(
    customerInputSchema.safeParse({ name: "Al Noor Trading", defaultCurrencyCode: "AED" }).success,
    true,
  );
  assert.equal(
    customerInputSchema.safeParse({ name: "A", defaultCurrencyCode: "AED" }).success,
    false,
  );

  assert.equal(
    supplierInputSchema.safeParse({ name: "Desert Supply Co", defaultCurrencyCode: "AED" }).success,
    true,
  );
  assert.equal(
    supplierInputSchema.safeParse({ name: "", defaultCurrencyCode: "AED" }).success,
    false,
  );

  assert.equal(
    inventoryItemInputSchema.safeParse({
      name: "Widget Pro",
      unitName: "pcs",
      salesAccountId: "acct-sales",
      inventoryAssetAccountId: "acct-asset",
      costOfSalesAccountId: "acct-cogs",
    }).success,
    true,
  );
  assert.equal(
    inventoryItemInputSchema.safeParse({
      name: "",
      unitName: "pcs",
      salesAccountId: "acct-sales",
      inventoryAssetAccountId: "acct-asset",
      costOfSalesAccountId: "acct-cogs",
    }).success,
    false,
  );

  assert.equal(
    projectInputSchema.safeParse({
      name: "Marina Fitout",
      code: "",
      customerId: "",
      status: "active",
    }).success,
    true,
  );
  assert.equal(
    projectInputSchema.safeParse({
      name: "",
      code: "",
      customerId: "",
      status: "active",
    }).success,
    false,
  );

  const actionChecks = [
    { file: "src/modules/customers/actions.ts", fn: "quickCreateCustomerAction" },
    { file: "src/modules/suppliers/actions.ts", fn: "quickCreateSupplierAction" },
    { file: "src/modules/inventory/actions.ts", fn: "quickCreateInventoryItemAction" },
    { file: "src/modules/projects/actions.ts", fn: "quickCreateProjectAction" },
  ];

  for (const check of actionChecks) {
    const src = readFileSync(path.join(process.cwd(), check.file), "utf8");
    const fnIdx = src.indexOf(`export async function ${check.fn}`);
    assert.ok(fnIdx !== -1, `Expected ${check.fn} in ${check.file}`);
    const bodySlice = src.slice(fnIdx, fnIdx + 400);
    assert.match(bodySlice, /requirePermission\(/, `${check.fn} must call requirePermission`);
  }

  const modalsSrc = readFileSync(
    path.join(process.cwd(), "src/components/documents/quick-create-modals.tsx"),
    "utf8",
  );
  assert.match(modalsSrc, /e\.stopPropagation\(\)/);
});

test("appearance form buttons avoid permission lock", () => {
  const appearanceSrc = readFileSync(
    path.join(process.cwd(), "src/modules/appearance/appearance-form.tsx"),
    "utf8",
  );
  assert.doesNotMatch(appearanceSrc, /<Button[^>]*permission=/);
});

test("Phase 3 UX declutter: admin-only settings, personal appearance route exemption, and bidirectional TRN/Emirate sync", () => {
  const allEntries = SETTINGS_GROUPS.flatMap((group) => group.items);
  for (const adminSettingId of ["lock-date", "document-templates", "email"]) {
    const entry = allEntries.find((e) => e.id === adminSettingId);
    assert.ok(entry, `Expected ${adminSettingId} in SETTINGS_GROUPS`);
    assert.equal(entry.requiresAdmin, true, `Expected ${adminSettingId} to require admin`);
  }

  assert.equal(moduleForBusinessPath("/b/biz-1/settings/appearance"), null);
  assert.deepEqual(moduleForBusinessPath("/b/biz-1/settings/business-profile"), {
    businessId: "biz-1",
    module: "settings",
  });

  const supplierServiceSrc = readFileSync(
    path.join(process.cwd(), "src/modules/suppliers/supplier-service.ts"),
    "utf8",
  );
  assert.match(supplierServiceSrc, /const trnValue\s*=/);
  assert.match(supplierServiceSrc, /const addressValue\s*=/);

  const profileServiceSrc = readFileSync(
    path.join(process.cwd(), "src/modules/business-profile/business-profile-service.ts"),
    "utf8",
  );
  assert.match(profileServiceSrc, /(?:UPDATE|INSERT INTO) business_tax_settings/);

  const taxServiceSrc = readFileSync(
    path.join(process.cwd(), "src/modules/tax/tax-settings-service.ts"),
    "utf8",
  );
  assert.match(taxServiceSrc, /UPDATE business_profile/);
});

test("currency minor units support 0-decimal (KRW) and 3-decimal (JOD/IQD/LYD/TND) formatting and parsing", () => {
  assert.equal(getCurrencyMinorUnit("KRW"), 0);
  assert.equal(getCurrencyMinorUnit("JPY"), 0);
  for (const code of ["JOD", "IQD", "LYD", "TND", "KWD", "BHD", "OMR"]) {
    assert.equal(getCurrencyMinorUnit(code), 3, `Expected 3 minor decimals for ${code}`);
  }
  assert.equal(getCurrencyMinorUnit("AED"), 2);

  assert.equal(minorToDecimalString(1500, "KRW"), "1500");
  assert.equal(minorToDecimalString(1500, "JOD"), "1.500");
  assert.equal(minorToCurrencyInput(1500, 3), "1.500");
  assert.equal(parseCurrencyAmountToMinor("1234", 0), 1234);
  assert.equal(parseCurrencyAmountToMinor("1.250", 3), 1250);
  assert.throws(() => parseCurrencyAmountToMinor("12.34", 0));
  assert.match(formatMoney(1500, "JOD"), /1\.500/);
  assert.match(formatMoney(1500, "KRW"), /1,500|1500/);
});

test("CSV cell sanitizer neutralizes formula payloads while preserving numeric values", () => {
  assert.equal(escapeCsvCell("=CMD()"), "'=CMD()");
  assert.equal(escapeCsvCell("+1+2"), "'+1+2");
  assert.equal(escapeCsvCell("@SUM(A1:A2)"), "'@SUM(A1:A2)");
  assert.equal(escapeCsvCell("-CMD()"), "'-CMD()");
  assert.equal(escapeCsvCell("-125.50"), "-125.50");
  assert.equal(escapeCsvCell(42), "42");
  assert.equal(escapeCsvCell('Hello, "World"'), '"Hello, ""World"""');
});

test("debitNoteInputSchema accepts empty string purchaseInvoiceId and preferences setting is personal", () => {
  const valid = debitNoteInputSchema.safeParse({
    supplierId: "00000000-0000-4000-8000-000000000001",
    purchaseInvoiceId: "",
    currencyCode: "AED",
    amountsIncludeTax: false,
    date: "2026-06-01",
    lines: [
      {
        description: "Return item",
        quantity: "1",
        discountType: "none",
        discountValue: "0",
        unitPrice: "100.00",
        expenseAccountId: "acct-5000",
        taxCodeId: "tax-vat-5",
      },
    ],
  });
  assert.equal(valid.success, true);

  const prefs = SETTINGS_GROUPS.flatMap((g) => g.items).find((e) => e.id === "preferences");
  assert.equal(prefs?.isPersonal, true);
  assert.equal(moduleForBusinessPath("/b/biz-1/settings/preferences"), null);
});

test("banking schemas support 0/2/3-decimal currencies and dead UI files remain removed", () => {
  const bankAccId = "00000000-0000-4000-8000-000000000010";
  const otherAccId = "00000000-0000-4000-8000-000000000020";

  for (const amount of ["12.345", "1000"]) {
    const txRes = bankTransactionInputSchema.safeParse({
      bankAccountId: bankAccId,
      date: "2026-06-01",
      type: "money_out",
      description: "Multi-currency expense",
      lines: [
        {
          accountId: "acct-5000",
          taxCodeId: "tax-vat-5",
          description: "Service fee",
          amount,
        },
      ],
    });
    assert.equal(txRes.success, true, `Expected bankTransactionInputSchema to accept ${amount}`);

    const trRes = bankTransferInputSchema.safeParse({
      fromBankAccountId: bankAccId,
      toBankAccountId: otherAccId,
      date: "2026-06-01",
      amount,
    });
    assert.equal(trRes.success, true, `Expected bankTransferInputSchema to accept ${amount}`);
  }

  assert.equal(existsSync(path.join(process.cwd(), "src/app/admin/confirm-dialog.tsx")), false);
  assert.equal(existsSync(path.join(process.cwd(), "src/components/section-loading.tsx")), false);
});
