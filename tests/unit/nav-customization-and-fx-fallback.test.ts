import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { businessMigrations } from "../../src/core/db/business-migrations";
import { runMigrations } from "../../src/core/db/migrations/runner";
import { primaryNav } from "../../src/components/app-shell/nav-items";
import {
  filterNavGroups,
  getAllConfigurableNavPaths,
  getNavGroupOptions,
  isNavPathVisible,
  normalizeHiddenNavPaths,
  resolveDefaultLandingPath,
} from "../../src/components/app-shell/nav-customization";
import {
  pickAutoExchangeRate,
  type DocumentRateOption,
} from "../../src/modules/currency/document-currency-fields";
import { resolveRateSnapshot } from "../../src/modules/currency/validation";

test("nav customization normalizes, filters groups/items, and resolves landing fallback safely", () => {
  const allPaths = getAllConfigurableNavPaths();
  assert.ok(allPaths.has("/overview"));
  assert.ok(allPaths.has("/payroll/eosb-calculator"));

  const groups = getNavGroupOptions();
  const hrGroup = groups.find((g) => g.label === "HR & Payroll");
  assert.ok(hrGroup);
  assert.deepEqual(
    hrGroup.items.map((i) => i.path),
    ["/payroll/employees", "/payroll/payslips", "/payroll/items", "/payroll/eosb-calculator"],
  );

  const normalized = normalizeHiddenNavPaths([
    "/payroll/eosb-calculator",
    "/payroll/eosb-calculator",
    "/not-a-real-path",
    123,
    "/overview",
  ]);
  assert.deepEqual(normalized, ["/overview", "/payroll/eosb-calculator"]);

  // Partial hide removes sub-item while preserving remaining HR items
  const partialNav = filterNavGroups(primaryNav, ["/payroll/eosb-calculator"]);
  const partialHr = partialNav.find((g) => g.label === "HR & Payroll");
  assert.ok(partialHr);
  assert.equal(partialHr.items.some((i) => i.path === "/payroll/eosb-calculator"), false);
  assert.equal(partialHr.items.some((i) => i.path === "/payroll/employees"), true);

  // Full group hide drops the entire empty group section cleanly
  const noHrNav = filterNavGroups(primaryNav, hrGroup.items.map((i) => i.path));
  assert.equal(noHrNav.some((g) => g.label === "HR & Payroll"), false);

  assert.equal(isNavPathVisible("/customers", ["/payroll/eosb-calculator"]), true);
  assert.equal(isNavPathVisible("/payroll/eosb-calculator", ["/payroll/eosb-calculator"]), false);

  assert.equal(resolveDefaultLandingPath(["/overview"]), "/approvals");
  assert.equal(resolveDefaultLandingPath([...allPaths]), "/settings");
});

test("pickAutoExchangeRate selects exact/latest rate on or before relevantDate and prefers CBUAE", () => {
  const rates: DocumentRateOption[] = [
    { id: "r1", currencyCode: "USD", rateDate: "2026-08-01", rateToBase: "3.6700", source: "Manual", sourceReference: null },
    { id: "r2", currencyCode: "USD", rateDate: "2026-08-27", rateToBase: "3.6720", source: "Manual", sourceReference: null },
    { id: "r3", currencyCode: "USD", rateDate: "2026-08-27", rateToBase: "3.6725", source: "CBUAE", sourceReference: "CBUAE" },
    { id: "r4", currencyCode: "USD", rateDate: "2026-09-10", rateToBase: "3.6800", source: "CBUAE", sourceReference: "CBUAE" },
  ];

  // Exact tax date matches CBUAE over Manual on the same date
  assert.equal(pickAutoExchangeRate(rates, "USD", "2026-08-27")?.id, "r3");
  // Earlier date resolves latest rate <= relevantDate instead of future r4
  assert.equal(pickAutoExchangeRate(rates, "USD", "2026-08-26")?.id, "r1");
  // Missing currency returns undefined
  assert.equal(pickAutoExchangeRate(rates, "EUR", "2026-08-27"), undefined);
});

test("resolveRateSnapshot auto-resolves backend rates when rate inputs are omitted while enforcing VAT CBUAE rules", () => {
  const sqlite = new Database(":memory:");
  runMigrations(sqlite, { label: "fx-auto-test", migrations: businessMigrations });
  const now = new Date().toISOString();

  // Seed VAT settings (vat_registered = 1), standard VAT tax code, and exchange rates
  sqlite
    .prepare("UPDATE business_tax_settings SET vat_registered = 1, default_supply_emirate = 'dubai', updated_at = ? WHERE id = 'default'")
    .run(now);
  const stdTax = sqlite
    .prepare("SELECT id FROM tax_codes WHERE vat_category = 'standard' LIMIT 1")
    .get() as { id: string };
  const oosTax = sqlite
    .prepare("SELECT id FROM tax_codes WHERE vat_category = 'out_of_scope' LIMIT 1")
    .get() as { id: string };

  sqlite
    .prepare("INSERT INTO exchange_rates (id, currency_code, rate_date, rate_to_base, source, source_reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("fx-manual", "USD", "2026-08-26", "3.671000", "Manual", "Manual", now);
  sqlite
    .prepare("INSERT INTO exchange_rates (id, currency_code, rate_date, rate_to_base, source, source_reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("fx-cbuae", "USD", "2026-08-27", "3.672500", "CBUAE", "CBUAE", now);

  // 1. VAT-relevant foreign invoice with omitted snapshot resolves exact-date CBUAE automatically
  const vatAuto = resolveRateSnapshot(sqlite, {
    currencyCode: "USD",
    relevantDate: "2026-08-27",
    taxCodeIds: [stdTax.id],
    enforceVatPolicy: true,
  });
  assert.equal(vatAuto.exchangeRateToBase, "3.672500");
  assert.equal(vatAuto.exchangeRateSource, "CBUAE");
  assert.equal(vatAuto.exchangeRateDate, "2026-08-27");

  // 2. VAT-relevant foreign invoice on date without CBUAE rate still rejects with CBUAE rule
  assert.throws(
    () =>
      resolveRateSnapshot(sqlite, {
        currencyCode: "USD",
        relevantDate: "2026-08-26",
        taxCodeIds: [stdTax.id],
        enforceVatPolicy: true,
      }),
    /CBUAE rate for its tax date/i,
  );

  // 3. Non-VAT document on 2026-08-26 auto-resolves Manual rate on <= relevantDate
  const nonVatAuto = resolveRateSnapshot(sqlite, {
    currencyCode: "USD",
    relevantDate: "2026-08-26",
    taxCodeIds: [oosTax.id],
    enforceVatPolicy: true,
  });
  assert.equal(nonVatAuto.exchangeRateToBase, "3.671000");
  assert.equal(nonVatAuto.exchangeRateSource, "Manual");
  assert.equal(nonVatAuto.exchangeRateDate, "2026-08-26");

  // 4. Explicit conflicting rate rejected cleanly when VAT-relevant uses Manual
  assert.throws(
    () =>
      resolveRateSnapshot(sqlite, {
        currencyCode: "USD",
        exchangeRateToBase: "3.671000",
        exchangeRateDate: "2026-08-26",
        exchangeRateSource: "Manual",
        relevantDate: "2026-08-26",
        taxCodeIds: [stdTax.id],
        enforceVatPolicy: true,
      }),
    /CBUAE rate for its tax date/i,
  );

  sqlite.close();
});
