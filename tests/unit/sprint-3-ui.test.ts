import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import {
  allocateFifo,
  computeAllocationTotals,
  type SettlementOpenDocument,
} from "../../src/components/documents/settlement-allocation-math";
import {
  computeDocumentTotals,
  previewDocumentLine,
  type DocumentLineTaxOption,
} from "../../src/components/documents/document-calculations";
import {
  getEmptyCapabilities,
  hasPermission,
  moduleForBusinessPath,
} from "../../src/core/permissions/module-access";
import {
  scoreCommandItem,
  type CommandItem,
} from "../../src/components/command-palette";
import {
  filterComboboxOptions,
  type ComboboxOption,
} from "../../src/components/ui/combobox";

const TAX_CODES: DocumentLineTaxOption[] = [
  { id: "vat5", name: "Standard VAT 5%", rateBasisPoints: 500, vatCategory: "standard" },
  { id: "zero", name: "Zero Rated 0%", rateBasisPoints: 0, vatCategory: "zero_rated" },
  { id: "rcm", name: "Reverse Charge 5%", rateBasisPoints: 500, vatCategory: "reverse_charge" },
];

test("allocateFifo sorts open documents by dueDate ASC then invoiceDate ASC and filters currency", () => {
  const docs: SettlementOpenDocument[] = [
    {
      id: "inv-later-due",
      documentNumber: "INV-003",
      counterpartyId: "cust-1",
      invoiceDate: "2026-01-05",
      dueDate: "2026-02-15",
      totalMinor: 50000,
      balanceMinor: 50000,
      currencyCode: "AED",
      minorUnit: 2,
    },
    {
      id: "inv-usd",
      documentNumber: "INV-002",
      counterpartyId: "cust-1",
      invoiceDate: "2026-01-01",
      dueDate: "2026-01-10",
      totalMinor: 10000,
      balanceMinor: 10000,
      currencyCode: "USD",
      minorUnit: 2,
    },
    {
      id: "inv-oldest-due",
      documentNumber: "INV-001",
      counterpartyId: "cust-1",
      invoiceDate: "2026-01-10",
      dueDate: "2026-01-20",
      totalMinor: 30000,
      balanceMinor: 30000,
      currencyCode: "AED",
      minorUnit: 2,
    },
    {
      id: "inv-same-due-earlier-date",
      documentNumber: "INV-004",
      counterpartyId: "cust-1",
      invoiceDate: "2026-01-02",
      dueDate: "2026-01-20",
      totalMinor: 20000,
      balanceMinor: 20000,
      currencyCode: "AED",
      minorUnit: 2,
    },
    {
      id: "inv-paid",
      documentNumber: "INV-000",
      counterpartyId: "cust-1",
      invoiceDate: "2026-01-01",
      dueDate: "2026-01-05",
      totalMinor: 15000,
      balanceMinor: 0,
      currencyCode: "AED",
      minorUnit: 2,
    },
  ];

  // Amount = 450.00 AED (45000 minor):
  // 1) inv-same-due-earlier-date gets full 200.00 AED (remaining 250.00)
  // 2) inv-oldest-due gets partial 250.00 AED (remaining 0)
  // inv-usd is skipped (different currency), inv-paid skipped (0 balance), inv-later-due gets nothing
  const alloc = allocateFifo(docs, 45000, "AED");
  assert.deepEqual(alloc, {
    "inv-same-due-earlier-date": "200.00",
    "inv-oldest-due": "250.00",
  });

  // Zero or negative payment produces no allocations
  assert.deepEqual(allocateFifo(docs, 0, "AED"), {});
  assert.deepEqual(allocateFifo(docs, -500, "AED"), {});
});

test("computeAllocationTotals accurately reports advance surplus and overallocation", () => {
  const docs: SettlementOpenDocument[] = [
    {
      id: "doc-1",
      documentNumber: "BILL-1",
      counterpartyId: "sup-1",
      invoiceDate: "2026-03-01",
      dueDate: "2026-03-15",
      totalMinor: 10000,
      balanceMinor: 10000,
      currencyCode: "AED",
      minorUnit: 2,
    },
  ];

  const advanceTotals = computeAllocationTotals("250.00", { "doc-1": "100.00" }, docs, 2);
  assert.equal(advanceTotals.totalAmountMinor, 25000);
  assert.equal(advanceTotals.totalAllocatedMinor, 10000);
  assert.equal(advanceTotals.unallocatedMinor, 15000);
  assert.equal(advanceTotals.isOverAllocated, false);

  const overTotals = computeAllocationTotals("80.00", { "doc-1": "100.00" }, docs, 2);
  assert.equal(overTotals.totalAmountMinor, 8000);
  assert.equal(overTotals.totalAllocatedMinor, 10000);
  assert.equal(overTotals.unallocatedMinor, 0);
  assert.equal(overTotals.isOverAllocated, true);
});

test("previewDocumentLine and computeDocumentTotals support exclusive, inclusive, discounts, RCM, and 3-decimal currencies", () => {
  // Tax-exclusive 5% VAT with 10% discount: 2 * 100.00 = 200.00 -> 180.00 net + 9.00 tax = 189.00 gross
  const line1 = previewDocumentLine(
    {
      unitPrice: "100.00",
      quantity: "2",
      discountType: "percentage",
      discountValue: "10",
      taxCodeId: "vat5",
    },
    TAX_CODES,
    2,
    false,
  );
  assert.deepEqual(line1, { netMinor: 18000, taxMinor: 900, grossMinor: 18900 });

  // Tax-inclusive 5% VAT: 105.00 gross -> 100.00 net + 5.00 tax
  const inclusive = previewDocumentLine(
    { unitPrice: "105.00", quantity: "1", taxCodeId: "vat5" },
    TAX_CODES,
    2,
    true,
  );
  assert.deepEqual(inclusive, { netMinor: 10000, taxMinor: 500, grossMinor: 10500 });

  // Reverse charge VAT keeps invoice gross equal to net when tax-exclusive
  const rcm = previewDocumentLine(
    { unitPrice: "200.00", quantity: "1", taxCodeId: "rcm" },
    TAX_CODES,
    2,
    false,
  );
  assert.equal(rcm.netMinor, 20000);
  assert.equal(rcm.grossMinor, 20000);

  // Aggregate totals across multiple lines
  const totals = computeDocumentTotals(
    [
      { unitPrice: "100.00", quantity: "2", taxCodeId: "vat5" },
      { unitPrice: "50.00", quantity: "1", taxCodeId: "zero" },
    ],
    TAX_CODES,
    2,
    false,
  );
  assert.equal(totals.subtotalMinor, 25000);
  assert.equal(totals.taxMinor, 1000);
  assert.equal(totals.totalMinor, 26000);

  // 3-decimal currency (minorUnit = 3, e.g. BHD): 10.000 * 1 @ 5% = 10000 net + 500 tax = 10500 gross
  const bhdTotals = computeDocumentTotals(
    [{ unitPrice: "10.000", quantity: "1", taxCodeId: "vat5" }],
    TAX_CODES,
    3,
    false,
  );
  assert.equal(bhdTotals.subtotalMinor, 10000);
  assert.equal(bhdTotals.taxMinor, 500);
  assert.equal(bhdTotals.totalMinor, 10500);
});

test("Settings personal vs business route mapping and approval permissions gate Save & Issue", () => {
  // Personal routes under /settings bypass business-level settings module gating
  assert.equal(moduleForBusinessPath("/b/demo-biz/settings/profile"), null);
  assert.equal(moduleForBusinessPath("/b/demo-biz/settings/activity-log"), null);
  assert.deepEqual(moduleForBusinessPath("/b/demo-biz/settings"), {
    businessId: "demo-biz",
    module: "settings",
  });
  assert.deepEqual(moduleForBusinessPath("/b/demo-biz/sales/quotes"), {
    businessId: "demo-biz",
    module: "sales",
  });
  assert.deepEqual(moduleForBusinessPath("/b/demo-biz/sales/delivery-notes"), {
    businessId: "demo-biz",
    module: "inventory",
  });

  // Standard creator without approve/post permission cannot issue quotes/orders
  const makerOnlyCaps = {
    ...getEmptyCapabilities(),
    sales: ["view", "create", "edit"],
  };
  assert.equal(hasPermission(makerOnlyCaps, "sales", "create"), true);
  assert.equal(hasPermission(makerOnlyCaps, "sales", "approve"), false);
  assert.equal(hasPermission(makerOnlyCaps, "sales", "post"), false);

  // User with post or approve gets approve equivalence for Save & Issue
  const checkerCaps = {
    ...getEmptyCapabilities(),
    sales: ["view", "create", "post"],
  };
  assert.equal(hasPermission(checkerCaps, "sales", "approve"), true);
});

test("scoreCommandItem prioritizes exact and prefix navigation matches over Create items", () => {
  const noop = () => {};
  const reportsNav: CommandItem = {
    group: "Navigation",
    label: "Reports",
    hint: "Reports",
    keywords: "Reports Reports /reports",
    onSelect: noop,
  };
  const suppliersNav: CommandItem = {
    group: "Navigation",
    label: "Suppliers",
    hint: "Purchases",
    keywords: "Purchases Suppliers /suppliers",
    onSelect: noop,
  };
  const findAndRecodeNav: CommandItem = {
    group: "Navigation",
    label: "Find & Recode",
    hint: "Accounting",
    keywords: "Accounting Find & Recode /accounting/find-and-recode",
    onSelect: noop,
  };
  const recordSupplierPayment: CommandItem = {
    group: "Create",
    label: "Record Supplier Payment",
    hint: "Create",
    keywords: "new create add record supplier vendor payment disbursement",
    onSelect: noop,
  };
  const newSupplierCreate: CommandItem = {
    group: "Create",
    label: "New Supplier",
    hint: "Create",
    keywords: "new create add supplier vendor purchases",
    onSelect: noop,
  };
  const createWithReportsKeyword: CommandItem = {
    group: "Create",
    label: "Export Audit Package",
    hint: "Create",
    keywords: "reports faf export",
    onSelect: noop,
  };

  // Blank queries match everything equally so GROUP_ORDER controls default presentation
  assert.equal(scoreCommandItem(reportsNav, ""), 1);
  assert.equal(scoreCommandItem(recordSupplierPayment, "   "), 1);

  // Exact and prefix navigation queries for "Reports" must outrank Create items
  assert.equal(scoreCommandItem(reportsNav, "Reports"), 1000);
  assert.equal(scoreCommandItem(reportsNav, "  reports  "), 1000);
  assert.equal(scoreCommandItem(recordSupplierPayment, "Reports"), 0);
  assert.equal(scoreCommandItem(createWithReportsKeyword, "Reports"), 250);
  assert.ok(
    scoreCommandItem(reportsNav, "Reports") > scoreCommandItem(recordSupplierPayment, "Reports"),
  );
  assert.ok(
    scoreCommandItem(reportsNav, "Reports") > scoreCommandItem(createWithReportsKeyword, "Reports"),
  );

  assert.equal(scoreCommandItem(reportsNav, "rep"), 800);
  assert.equal(scoreCommandItem(recordSupplierPayment, "rep"), 0);
  assert.ok(scoreCommandItem(reportsNav, "rep") > scoreCommandItem(recordSupplierPayment, "rep"));

  // Prefix navigation match ("Suppliers") must outrank word-prefix Create items ("Record Supplier Payment", "New Supplier")
  assert.equal(scoreCommandItem(suppliersNav, "supplier"), 800);
  assert.equal(scoreCommandItem(recordSupplierPayment, "supplier"), 650);
  assert.equal(scoreCommandItem(newSupplierCreate, "supplier"), 650);
  assert.ok(
    scoreCommandItem(suppliersNav, "supplier") > scoreCommandItem(recordSupplierPayment, "supplier"),
  );
  assert.ok(
    scoreCommandItem(suppliersNav, "supplier") > scoreCommandItem(newSupplierCreate, "supplier"),
  );

  const rankedForReports = [recordSupplierPayment, createWithReportsKeyword, reportsNav]
    .filter((item) => scoreCommandItem(item, "Reports") > 0)
    .sort((a, b) => scoreCommandItem(b, "Reports") - scoreCommandItem(a, "Reports"));
  assert.equal(rankedForReports[0].label, "Reports");

  // Full tier hierarchy: exact (1000) > prefix (800) > word-prefix (650) > substring (500) > multi-token label (400) > meta prefix (250) > meta substring (150) > miss (0)
  assert.equal(scoreCommandItem(findAndRecodeNav, "Find & Recode"), 1000);
  assert.equal(scoreCommandItem(findAndRecodeNav, "find"), 800);
  assert.equal(scoreCommandItem(findAndRecodeNav, "recode"), 650);
  assert.equal(scoreCommandItem(findAndRecodeNav, "code"), 500);
  assert.equal(scoreCommandItem(recordSupplierPayment, "record payment"), 400);
  assert.equal(scoreCommandItem(recordSupplierPayment, "disbursement"), 250);
  assert.equal(scoreCommandItem(recordSupplierPayment, "bursement"), 150);
  assert.equal(scoreCommandItem(recordSupplierPayment, "nonexistent-command"), 0);
});

test("filterComboboxOptions matches across label, description, badge, and keywords in virtualized lists", () => {
  const opts: ComboboxOption[] = Array.from({ length: 45 }, (_, idx) => ({
    value: `acct-${idx + 1}`,
    label: idx === 41 ? "VAcct 42 Consulting Revenue" : `Account ${idx + 1}`,
    description: idx === 41 ? "Professional fees" : "General ledger account",
    badge: `4${String(idx + 1).padStart(3, "0")}`,
    keywords: idx === 41 ? ["consulting", "income"] : ["ledger"],
  }));

  assert.equal(filterComboboxOptions(opts, "").length, 45);
  assert.equal(filterComboboxOptions(opts, "   ").length, 45);

  const byMultiToken = filterComboboxOptions(opts, "vacct 4042 consulting");
  assert.deepEqual(
    byMultiToken.map((o) => o.value),
    ["acct-42"],
  );

  const byBadgeAndDesc = filterComboboxOptions(opts, "professional 4042");
  assert.deepEqual(
    byBadgeAndDesc.map((o) => o.value),
    ["acct-42"],
  );

  assert.deepEqual(filterComboboxOptions(opts, "no-such-option-zzz"), []);
});

test("Appearance settings omit save permission lock and ThemeProvider sets Zod jitless mode", () => {
  const themeProviderSrc = readFileSync(
    path.join(process.cwd(), "src/core/theme/theme-provider.tsx"),
    "utf8",
  );
  assert.match(themeProviderSrc, /z\.config\(\{\s*jitless:\s*true\s*\}\)/);

  const appearanceFormSrc = readFileSync(
    path.join(process.cwd(), "src/modules/appearance/appearance-form.tsx"),
    "utf8",
  );
  assert.doesNotMatch(appearanceFormSrc, /<Button[^>]*permission=/);

  const previousConfig = z.config();
  try {
    z.config({ jitless: true });
    const schema = z.object({ density: z.enum(["comfortable", "compact"]) });
    assert.equal(schema.safeParse({ density: "compact" }).success, true);
    assert.equal(schema.safeParse({ density: "invalid" }).success, false);
  } finally {
    z.config(previousConfig);
  }
});
