import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { createBusiness } from "@/core/businesses/business-service";
import { openBusinessDatabase, closeBusinessConnection } from "@/core/db/business";
import { applyStandardSqlitePragmas } from "@/core/db/pragmas";
import { makeScratchDirectory } from "@/core/db/paths";
import {
  extractManagerData,
  type ManagerExtractedData,
  MANAGER_CONTENT_TYPES,
} from "./manager-extractor";
import { decodeProtobuf } from "./manager-protobuf";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import Decimal from "decimal.js";
import { addMinor, calculateTax, parseQuantityToMicros } from "@/modules/accounting/calculations/money";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getBaseCurrency } from "@/modules/currency/currency";
import type { RateSnapshot } from "@/modules/currency/validation";
import { postSalesInvoice } from "@/modules/accounting/services/invoice-posting-service";
import { postPurchaseInvoice } from "@/modules/accounting/services/purchase-invoice-posting-service";
import { postReceipt } from "@/modules/accounting/services/receipt-posting-service";
import { postSupplierPayment } from "@/modules/accounting/services/supplier-payment-posting-service";
import { postTransaction, type JournalLineInput } from "@/modules/accounting/services/posting-service";
import { replaceTaxEntries } from "@/modules/tax/tax-entry-service";

export interface ManagerInspectionSummary {
  businessName: string;
  trn?: string;
  phone?: string;
  email?: string;
  address?: string;
  country: string;
  currency: string;
  customersCount: number;
  suppliersCount: number;
  inventoryItemsCount: number;
  fixedAssetsCount: number;
  projectsCount: number;
  accountsCount: number;
  bankAccountsCount: number;
  salesInvoicesCount: number;
  salesQuotesCount: number;
  salesOrdersCount: number;
  purchaseInvoicesCount: number;
  receiptsCount: number;
  paymentsCount: number;
  bankTransfersCount: number;
  employeesCount: number;
  payslipsCount: number;
  journalEntriesCount: number;
}

export interface ManagerImportOptions {
  overrideBusinessName?: string;
  documentStatus?: "posted" | "draft";
}

/** What the import did to the ledger (counts only; no business data). */
export interface ManagerImportLedgerStats {
  invoicesPosted: number;
  invoicesLeftAsDraft: number;
  billsPosted: number;
  billsLeftAsDraft: number;
  receiptsPosted: number;
  receiptsLeftAsDraft: number;
  receiptsSkipped: number;
  paymentsPosted: number;
  paymentsLeftAsDraft: number;
  paymentsSkipped: number;
  transfersPosted: number;
  transfersSkipped: number;
  payslipsPosted: number;
  payslipsLeftAsDraft: number;
  journalsPosted: number;
  journalsSkipped: number;
  journalLinesWithUnmappedAccount: number;
  /** Invoice/bill lines whose Manager tax code was mapped to a business tax code by rate. */
  taxLinesMapped: number;
  /** Invoice/bill lines with no resolvable Manager tax code, defaulted to UAE standard 5%. */
  taxLinesDefaulted: number;
}

export interface ManagerImportResult {
  businessId: string;
  businessName: string;
  summary: ManagerInspectionSummary;
  ledger: ManagerImportLedgerStats;
}

// ---------------------------------------------------------------------------
// Exact amount / quantity conversion helpers (exported for unit tests)
// ---------------------------------------------------------------------------

const ImportDecimal = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });

function toImportDecimal(value: number | string, label: string) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${label} is not a finite number.`);
  }
  // Number#toString yields the shortest round-trip decimal, so values decoded
  // from Manager's bcl.Decimal (e.g. 12.35) are recovered exactly.
  const decimal = new ImportDecimal(typeof value === "number" ? value.toString() : value.trim());
  if (!decimal.isFinite()) throw new Error(`${label} is not a finite number.`);
  return decimal;
}

function decimalToSafeInteger(value: Decimal, label: string) {
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const number = rounded.toNumber();
  if (!Number.isSafeInteger(number)) throw new Error(`${label} is too large.`);
  return number;
}

/** Converts a (signed) Manager decimal amount to integer minor units of a currency with `minorUnit` decimals, HALF_UP. */
export function managerAmountToMinor(value: number | string, minorUnit: number, label = "Amount") {
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 6) {
    throw new Error("Currency minor unit must be between 0 and 6.");
  }
  return decimalToSafeInteger(
    toImportDecimal(value, label).mul(new ImportDecimal(10).pow(minorUnit)),
    label,
  );
}

/** Converts a Manager quantity to the app's quantity scale (QUANTITY_SCALE = 10,000, i.e. 4 decimals). */
export function managerQuantityToScaled(value: number | string) {
  const absolute = toImportDecimal(value, "Quantity").abs().toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return parseQuantityToMicros(absolute.toFixed(4));
}

export type ImportTaxCode = { id: string; rateBasisPoints: number };

export type ImportLineInput = {
  quantity: number | string;
  unitPrice: number | string;
  taxCode: ImportTaxCode;
};

export type ComputedImportLine<T extends ImportLineInput> = {
  source: T;
  quantityMicros: number;
  unitPriceMinor: number;
  discountMinor: number;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  taxCodeId: string;
};

/**
 * Computes stored line amounts with exact decimal math, mirroring the app's
 * tax-exclusive line calculator (per-line HALF_UP tax via calculateTax).
 *
 * The line net is quantity x unit price evaluated exactly and rounded once to
 * the currency's minor unit, so Manager's document totals are preserved even
 * when the unit price has more decimals than the currency. Negative lines
 * (Manager discount / adjustment lines) cannot be stored as negative lines, so
 * they are applied as fixed line discounts, first against lines with the same
 * tax code, then against any other line. Any discount that cannot be absorbed
 * is reported in `unappliedDiscountMinor` (the document must not be posted).
 */
export function computeImportedDocumentLines<T extends ImportLineInput>(lines: readonly T[], minorUnit: number) {
  const computed: ComputedImportLine<T>[] = [];
  const discountPools = new Map<string, number>();

  for (const line of lines) {
    const quantity = toImportDecimal(line.quantity, "Quantity");
    const unitPrice = toImportDecimal(line.unitPrice, "Unit price");
    const rawMinor = managerAmountToMinor(quantity.mul(unitPrice).toString(), minorUnit, "Line amount");
    if (rawMinor < 0) {
      discountPools.set(line.taxCode.id, addMinor([discountPools.get(line.taxCode.id) ?? 0, -rawMinor]));
      continue;
    }
    let quantityMicros = managerQuantityToScaled(line.quantity);
    let unitPriceMinor = Math.abs(managerAmountToMinor(line.unitPrice, minorUnit, "Unit price"));
    if (quantityMicros <= 0) {
      // A zero quantity cannot be stored; keep the line informational at zero value.
      quantityMicros = 10_000;
      unitPriceMinor = 0;
    }
    computed.push({
      source: line,
      quantityMicros,
      unitPriceMinor,
      discountMinor: 0,
      netAmountMinor: rawMinor,
      taxAmountMinor: 0,
      grossAmountMinor: 0,
      taxCodeId: line.taxCode.id,
    });
  }

  let unappliedDiscountMinor = 0;
  for (const [taxCodeId, poolMinor] of discountPools) {
    let remaining = poolMinor;
    // Same tax code first, then the largest lines, so VAT moves as little as possible.
    const targets = [...computed].sort((a, b) =>
      Number(b.taxCodeId === taxCodeId) - Number(a.taxCodeId === taxCodeId) || b.netAmountMinor - a.netAmountMinor);
    for (const target of targets) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, target.netAmountMinor);
      if (take <= 0) continue;
      target.netAmountMinor -= take;
      target.discountMinor += take;
      remaining -= take;
    }
    unappliedDiscountMinor += remaining;
  }

  for (const line of computed) {
    line.taxAmountMinor = calculateTax(line.netAmountMinor, line.source.taxCode.rateBasisPoints);
    line.grossAmountMinor = addMinor([line.netAmountMinor, line.taxAmountMinor]);
  }

  const subtotalMinor = addMinor(computed.map((line) => line.netAmountMinor));
  const taxMinor = addMinor(computed.map((line) => line.taxAmountMinor));
  return {
    lines: computed,
    subtotalMinor,
    taxMinor,
    totalMinor: addMinor([subtotalMinor, taxMinor]),
    unappliedDiscountMinor,
  };
}

/**
 * Converts Manager journal lines to single-sided minor-unit lines and enforces
 * that the entry balances. A line carrying both a debit and a credit is netted
 * to one side (not dropped); a line that nets to zero carries no amount and is
 * omitted. Throws (naming the journal number) when debits and credits differ.
 */
export function convertManagerJournalLines<T extends { debit: number | string; credit: number | string }>(
  entryNumber: string,
  lines: readonly T[],
  minorUnit: number,
) {
  const converted: Array<{ source: T; debitMinor: number; creditMinor: number }> = [];
  for (const line of lines) {
    const netMinor = managerAmountToMinor(line.debit, minorUnit, "Debit") - managerAmountToMinor(line.credit, minorUnit, "Credit");
    if (netMinor === 0) continue;
    converted.push({
      source: line,
      debitMinor: netMinor > 0 ? netMinor : 0,
      creditMinor: netMinor < 0 ? -netMinor : 0,
    });
  }
  const debitTotal = addMinor(converted.map((line) => line.debitMinor));
  const creditTotal = addMinor(converted.map((line) => line.creditMinor));
  if (debitTotal !== creditTotal) {
    throw new Error(
      `Manager.io journal entry ${entryNumber} is not balanced (debits ${minorToCurrencyInput(debitTotal, minorUnit)} vs credits ${minorToCurrencyInput(creditTotal, minorUnit)}); import aborted.`,
    );
  }
  return { lines: converted, totalMinor: debitTotal };
}

type BusinessTaxCodeRow = {
  id: string;
  rate_basis_points: number;
  direction: "sales" | "purchases" | "both";
  vat_category: string | null;
  is_recoverable: number;
  is_active: number;
};

/** Picks the business tax code for a Manager rate: 5% -> standard, 0% -> zero-rated (sales) / out-of-scope. */
export function pickBusinessTaxCode(
  codes: readonly BusinessTaxCodeRow[],
  direction: "sales" | "purchases",
  rateBasisPoints: number,
  preferNoVat = false,
): ImportTaxCode | null {
  const categoryRank = (category: string | null) => {
    if (rateBasisPoints > 0) return category === "standard" ? 0 : 99;
    const order = preferNoVat
      ? ["out_of_scope", "zero_rated", "exempt"]
      : ["zero_rated", "out_of_scope", "exempt"];
    const index = order.indexOf(category ?? "");
    return index === -1 ? 99 : index;
  };
  const candidates = codes
    .filter((code) => code.is_active
      && code.rate_basis_points === rateBasisPoints
      && (code.direction === "both" || code.direction === direction)
      && categoryRank(code.vat_category) < 99)
    .sort((a, b) =>
      categoryRank(a.vat_category) - categoryRank(b.vat_category)
      || (direction === "purchases" ? b.is_recoverable - a.is_recoverable : 0)
      || Number(a.direction === "both") - Number(b.direction === "both")
      || a.id.localeCompare(b.id));
  const code = candidates[0];
  return code ? { id: code.id, rateBasisPoints: code.rate_basis_points } : null;
}

const KNOWN_THREE_DECIMAL_CURRENCIES = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/**
 * Validates SQLite header and opens a temporary readonly instance.
 */
function openTempManagerDb(buffer: ArrayBuffer | Buffer): { db: Database.Database; cleanup: () => void } {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");
  if (buf.length < 16 || Buffer.compare(buf.subarray(0, 16), SQLITE_HEADER) !== 0) {
    throw new Error("Invalid Manager.io backup file: missing SQLite format 3 header.");
  }

  const tempDir = makeScratchDirectory("manager-import-");
  const tempPath = path.join(tempDir, "source.manager");
  writeFileSync(tempPath, buf);

  const db = new Database(tempPath, { readonly: true, fileMustExist: true });

  const cleanup = () => {
    try {
      db.close();
    } catch {}
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { db, cleanup };
}

/**
 * Ultra-fast pre-flight inspection using SQL table count grouping.
 * Completes in <15ms without full database deserialization.
 */
export function inspectManagerBackup(buffer: ArrayBuffer | Buffer): ManagerInspectionSummary {
  const { db, cleanup } = openTempManagerDb(buffer);
  try {
    let businessName = "Imported Business";
    let trn: string | undefined;
    let phone: string | undefined;
    let email: string | undefined;
    let address: string | undefined;

    const bizRow = db
      .prepare('SELECT Content FROM "Objects" WHERE ContentType = ?')
      .get(MANAGER_CONTENT_TYPES.BUSINESS_DETAILS) as { Content: Buffer } | undefined;
    if (bizRow) {
      const d = decodeProtobuf(bizRow.Content);
      if (d["1"] && typeof d["1"] === "string") businessName = d["1"].trim();
      if (d["2"] && typeof d["2"] === "string") address = d["2"];
      if (address) {
        const trnMatch = address.match(/TRN\s*(?:NO)?[:\s]*([0-9]{15})/i);
        if (trnMatch) trn = trnMatch[1];
        const phoneMatch = address.match(/(?:Mob|Tel|Phone)[:\s]*([+0-9\s-]{8,20})/i);
        if (phoneMatch) phone = phoneMatch[1].trim();
        const emailMatch = address.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) email = emailMatch[1];
      }
    }

    const rows = db
      .prepare('SELECT ContentType, count(*) as count FROM "Objects" GROUP BY ContentType')
      .all() as Array<{ ContentType: string; count: number }>;
    const countMap = new Map<string, number>();
    for (const r of rows) countMap.set(r.ContentType, r.count);

    const getCount = (...types: string[]) => types.reduce((acc, t) => acc + (countMap.get(t) || 0), 0);

    return {
      businessName,
      trn,
      phone,
      email,
      address,
      country: "United Arab Emirates",
      currency: "AED",
      customersCount: getCount(MANAGER_CONTENT_TYPES.CUSTOMERS),
      suppliersCount: getCount(MANAGER_CONTENT_TYPES.SUPPLIERS),
      inventoryItemsCount: getCount(MANAGER_CONTENT_TYPES.INVENTORY_ITEMS),
      fixedAssetsCount: getCount(MANAGER_CONTENT_TYPES.FIXED_ASSETS),
      projectsCount: getCount(MANAGER_CONTENT_TYPES.PROJECTS_TRACKING_CODES),
      accountsCount: getCount(MANAGER_CONTENT_TYPES.CHART_OF_ACCOUNTS),
      bankAccountsCount: getCount(MANAGER_CONTENT_TYPES.BANK_AND_CASH_ACCOUNTS),
      salesInvoicesCount: getCount(
        MANAGER_CONTENT_TYPES.SALES_INVOICES_LEGACY,
        MANAGER_CONTENT_TYPES.SALES_INVOICES_MODERN,
      ),
      salesQuotesCount: getCount(
        MANAGER_CONTENT_TYPES.SALES_QUOTES_LEGACY,
        MANAGER_CONTENT_TYPES.SALES_QUOTES_MODERN,
      ),
      salesOrdersCount: getCount(MANAGER_CONTENT_TYPES.SALES_ORDERS),
      purchaseInvoicesCount: getCount(
        MANAGER_CONTENT_TYPES.PURCHASE_INVOICES_LEGACY,
        MANAGER_CONTENT_TYPES.PURCHASE_INVOICES_MODERN,
      ),
      receiptsCount: getCount(
        MANAGER_CONTENT_TYPES.RECEIPTS_LEGACY,
        MANAGER_CONTENT_TYPES.RECEIPTS_MODERN,
      ),
      paymentsCount: getCount(
        MANAGER_CONTENT_TYPES.PAYMENTS_LEGACY,
        MANAGER_CONTENT_TYPES.PAYMENTS_MODERN,
      ),
      bankTransfersCount: getCount(MANAGER_CONTENT_TYPES.INTER_ACCOUNT_TRANSFERS),
      employeesCount: getCount(MANAGER_CONTENT_TYPES.EMPLOYEES),
      payslipsCount: getCount(MANAGER_CONTENT_TYPES.PAYSLIPS),
      journalEntriesCount: getCount(MANAGER_CONTENT_TYPES.JOURNAL_ENTRIES),
    };
  } finally {
    cleanup();
  }
}

/**
 * Executes full high-speed migration of a Manager.io backup file into a brand new business workspace.
 */
export function importManagerBackupToNewBusiness(
  buffer: ArrayBuffer | Buffer,
  userId: string,
  optionsOrName?: ManagerImportOptions | string,
): ManagerImportResult {
  const options: ManagerImportOptions =
    typeof optionsOrName === "string"
      ? { overrideBusinessName: optionsOrName }
      : optionsOrName || {};

  const docStatus = options.documentStatus || "posted";

  const { db: sourceDb, cleanup } = openTempManagerDb(buffer);
  let extracted: ManagerExtractedData;
  try {
    extracted = extractManagerData(sourceDb);
  } finally {
    cleanup();
  }

  const nameToUse = options.overrideBusinessName?.trim() || extracted.business.name;

  // Reject unbalanced manual journals before any business is created, so a bad
  // backup never leaves a half-imported workspace behind. (The ledger currency
  // precision is re-checked inside the import transaction against the real
  // currencies table.)
  const preflightMinorUnit = KNOWN_THREE_DECIMAL_CURRENCIES.has(extracted.business.currency) ? 3 : 2;
  for (const je of extracted.journalEntries) {
    convertManagerJournalLines(je.entryNumber, je.lines, preflightMinorUnit);
  }

  // 1. Create new isolated business workspace (automatically runs all latest business migrations)
  const { id: businessId, directoryKey } = createBusiness(
    {
      name: nameToUse,
      country: extracted.business.country,
      currency: extracted.business.currency,
      financialYearStartMonth: extracted.business.financialYearStartMonth,
    },
    userId,
  );

  // 2. Open new business database connection
  const context = openBusinessDatabase(directoryKey);
  const now = new Date().toISOString();

  // 3. Build O(1) in-memory lookup maps for instant entity referencing
  const customerMap = new Map(extracted.customers.map((c) => [c.id, c]));
  const supplierMap = new Map(extracted.suppliers.map((s) => [s.id, s]));
  const bankMap = new Map(extracted.bankAccounts.map((b) => [b.id, b]));
  const projectMap = new Map(extracted.projects.map((p) => [p.id, p]));
  const itemMap = new Map(extracted.inventoryItems.map((i) => [i.id, i]));
  for (const a of extracted.fixedAssets) itemMap.set(a.id, a as any);
  const accountMap = new Map(extracted.accounts.map((a) => [a.id, a]));
  const employeeMap = new Map(extracted.employees.map((e) => [e.id, e]));
  const defaultCustomerId = extracted.customers[0]?.id || "default-customer";
  const defaultSupplierId = extracted.suppliers[0]?.id || "default-supplier";
  const defaultBankAccountId = extracted.bankAccounts[0]?.id || "acct-bank-1010";
  const sqlite = context.sqlite;
  const ledgerStats: ManagerImportLedgerStats = {
    invoicesPosted: 0,
    invoicesLeftAsDraft: 0,
    billsPosted: 0,
    billsLeftAsDraft: 0,
    receiptsPosted: 0,
    receiptsLeftAsDraft: 0,
    receiptsSkipped: 0,
    paymentsPosted: 0,
    paymentsLeftAsDraft: 0,
    paymentsSkipped: 0,
    transfersPosted: 0,
    transfersSkipped: 0,
    payslipsPosted: 0,
    payslipsLeftAsDraft: 0,
    journalsPosted: 0,
    journalsSkipped: 0,
    journalLinesWithUnmappedAccount: 0,
    taxLinesMapped: 0,
    taxLinesDefaulted: 0,
  };

  try {
    // Enable SQLite turbo pragmas for high-throughput bulk insertion
    context.sqlite.pragma("synchronous = OFF");
    context.sqlite.pragma("journal_mode = MEMORY");
    context.sqlite.pragma("temp_store = MEMORY");
    context.sqlite.pragma("cache_size = -64000"); // 64MB memory cache

    // 4. Populate business within an atomic transaction
    context.sqlite.transaction(() => {
      // 4.1 Update Business Profile
      context.sqlite
        .prepare(
          `
        INSERT OR REPLACE INTO business_profile (
          id, legal_name, trading_name, tax_id, phone, email, address_line_1, city, state_or_emirate, country, country_code, financial_year_start_month, created_at, updated_at
        ) VALUES (
          'default', ?, ?, ?, ?, ?, ?, ?, 'Dubai', 'United Arab Emirates', 'AE', ?, ?, ?
        )
      `,
        )
        .run(
          extracted.business.legalName || nameToUse,
          nameToUse,
          extracted.business.trn || null,
          extracted.business.phone || null,
          extracted.business.email || null,
          extracted.business.address || null,
          extracted.business.city || "Dubai",
          extracted.business.financialYearStartMonth || 1,
          now,
          now,
        );

      // 4.2 Insert Chart of Accounts
      const insertAccount = context.sqlite.prepare(`
        INSERT OR IGNORE INTO accounts (id, name, type, subtype, is_system, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 1, ?, ?)
      `);
      for (const acc of extracted.accounts) {
        insertAccount.run(acc.id, acc.name, acc.type, acc.subtype, now, now);
      }

      // 4.3 Insert Bank & Cash Accounts
      const insertBankAccount = context.sqlite.prepare(`
        INSERT OR IGNORE INTO bank_accounts (
          id, name, account_code, bank_name, account_number_masked, currency_code, ledger_account_id, is_cash_account, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1, ?, ?)
      `);
      for (const b of extracted.bankAccounts) {
        insertAccount.run(b.id, b.name, "asset", "bank", now, now);
        accountMap.set(b.id, b as any);
        insertBankAccount.run(
          b.id,
          b.name,
          b.code || null,
          b.type === "cash" ? "Cash on Hand" : b.name,
          b.currency || extracted.business.currency,
          b.id,
          b.type === "cash" ? 1 : 0,
          now,
          now,
        );
      }

      // 4.4 Insert Customers
      const insertCustomer = context.sqlite.prepare(`
        INSERT OR IGNORE INTO customers (
          id, name, legal_name, trn, phone, email, address_line_1, default_currency_code, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      for (const cust of extracted.customers) {
        insertCustomer.run(
          cust.id,
          cust.name,
          cust.name,
          cust.trn || null,
          cust.phone || null,
          cust.email || null,
          cust.address || null,
          extracted.business.currency,
          now,
          now,
        );
      }

      // 4.5 Insert Suppliers
      const insertSupplier = context.sqlite.prepare(`
        INSERT OR IGNORE INTO suppliers (
          id, name, legal_name, trn, phone, email, address, default_currency_code, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      for (const supp of extracted.suppliers) {
        insertSupplier.run(
          supp.id,
          supp.name,
          supp.name,
          supp.trn || null,
          supp.phone || null,
          supp.email || null,
          supp.address || null,
          extracted.business.currency,
          now,
          now,
        );
      }

      // 4.6 Insert Projects / Job Cards
      const insertProject = context.sqlite.prepare(`
        INSERT OR IGNORE INTO projects (
          id, code, name, description, status, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, 'Manager.io Imported Job Card', 'active', 1, ?, ?)
      `);
      const usedProjectCodes = new Set<string>();
      for (let i = 0; i < extracted.projects.length; i++) {
        const pr = extracted.projects[i];
        let code = pr.code?.trim() || `JOB-${i + 1}`;
        if (usedProjectCodes.has(code.toLowerCase())) {
          code = `${code}-${i + 1}`;
        }
        usedProjectCodes.add(code.toLowerCase());
        insertProject.run(pr.id, code, pr.name || code, now, now);
      }

      // 4.7 Insert Inventory Items
      const insertItem = context.sqlite.prepare(`
        INSERT OR IGNORE INTO inventory_items (
          id, sku, name, description, unit_name, sales_price_minor, purchase_price_minor,
          sales_account_id, inventory_asset_account_id, cost_of_sales_account_id, is_active, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          'acct-sales-4000', 'acct-inventory-1210', 'acct-cost-sales-5000', 1, ?, ?
        )
      `);
      const itemMinorUnit = getBaseCurrency(sqlite).minor_unit;
      const usedSkus = new Set<string>();
      for (let i = 0; i < extracted.inventoryItems.length; i++) {
        const item = extracted.inventoryItems[i];
        let sku: string | null = item.code?.trim() || null;
        if (sku) {
          if (usedSkus.has(sku.toLowerCase())) {
            sku = `${sku}-${i + 1}`;
          }
          usedSkus.add(sku.toLowerCase());
        }
        insertItem.run(
          item.id,
          sku,
          item.name,
          null,
          item.unitOfMeasure || "Units",
          Math.max(0, managerAmountToMinor(item.salesUnitPrice || 0, itemMinorUnit, "Item sales price")),
          Math.max(0, managerAmountToMinor(item.purchaseUnitPrice || 0, itemMinorUnit, "Item purchase price")),
          now,
          now,
        );
      }

      // 4.8 Insert Fixed Assets as tracked equipment
      for (const asset of extracted.fixedAssets) {
        insertItem.run(
          asset.id,
          null,
          `${asset.name}${asset.category ? ` (${asset.category})` : ""}`,
          "Fixed Asset / Workshop Equipment",
          "Units",
          0,
          0,
          now,
          now,
        );
      }

      // 4.9 Custom Fields Definitions
      const insertCustomFieldDef = context.sqlite.prepare(`
        INSERT OR IGNORE INTO custom_field_definitions (
          id, entity_type, name, field_type, select_options, position, is_required, show_in_list, created_at, updated_at
        ) VALUES (?, ?, ?, 'text', '[]', ?, 0, 1, ?, ?)
      `);
      insertCustomFieldDef.run(randomUUID(), "sales_invoice", "Vehicle Plate", 0, now, now);
      insertCustomFieldDef.run(randomUUID(), "sales_invoice", "Vehicle Model", 1, now, now);
      insertCustomFieldDef.run(randomUUID(), "sales_invoice", "CHASIS NO", 2, now, now);
      insertCustomFieldDef.run(randomUUID(), "sales_invoice", "SERVICE KMS", 3, now, now);

      if (!extracted.customers.length) {
        insertCustomer.run(
          defaultCustomerId,
          "General Customer",
          "General Customer",
          null,
          null,
          null,
          null,
          extracted.business.currency,
          now,
          now,
        );
      }
      if (!extracted.suppliers.length) {
        insertSupplier.run(
          defaultSupplierId,
          "General Supplier",
          "General Supplier",
          null,
          null,
          null,
          null,
          extracted.business.currency,
          now,
          now,
        );
      }

      // 4.10 Resolve currency precision, base-rate snapshot and tax codes used by every document below
      const ledgerCurrency = extracted.business.currency;
      const baseCurrency = getBaseCurrency(sqlite);
      const currencyRow = sqlite
        .prepare("SELECT code, minor_unit FROM currencies WHERE code = ?")
        .get(ledgerCurrency) as { code: string; minor_unit: number } | undefined;
      if (!currencyRow || currencyRow.code !== baseCurrency.code) {
        throw new Error(`Manager.io import requires the business base currency (${baseCurrency.code}); found ${ledgerCurrency}.`);
      }
      const minorUnit = currencyRow.minor_unit;
      const toMinor = (value: number, label: string) => managerAmountToMinor(value || 0, minorUnit, label);
      const rateFor = (date: string): RateSnapshot => ({
        currencyCode: baseCurrency.code,
        exchangeRateToBase: "1",
        exchangeRateDate: date,
        exchangeRateSource: "Base",
        currencyMinorUnit: baseCurrency.minor_unit,
        baseCurrencyCode: baseCurrency.code,
        baseMinorUnit: baseCurrency.minor_unit,
      });

      const businessTaxCodes = sqlite
        .prepare("SELECT id, rate_basis_points, direction, vat_category, is_recoverable, is_active FROM tax_codes")
        .all() as BusinessTaxCodeRow[];
      const requireTaxCode = (direction: "sales" | "purchases", rateBasisPoints: number, preferNoVat = false) => {
        const code = pickBusinessTaxCode(businessTaxCodes, direction, rateBasisPoints, preferNoVat);
        if (!code) {
          throw new Error(`No active ${direction} tax code at ${rateBasisPoints / 100}% exists to map imported Manager.io lines.`);
        }
        return code;
      };
      const defaultSalesTax = requireTaxCode("sales", 500);
      const defaultPurchaseTax = requireTaxCode("purchases", 500);
      const managerTaxRates = new Map(extracted.taxCodes.map((code) => [code.id, code.rate]));
      const resolveLineTax = (direction: "sales" | "purchases", ref: string | null | undefined): ImportTaxCode => {
        if (ref === null) {
          // Manager line explicitly has no tax code: not reportable VAT.
          ledgerStats.taxLinesMapped += 1;
          return requireTaxCode(direction, 0, true);
        }
        const rate = ref ? managerTaxRates.get(ref) : undefined;
        if (typeof rate === "number" && Number.isFinite(rate) && rate >= 0) {
          ledgerStats.taxLinesMapped += 1;
          return requireTaxCode(direction, managerAmountToMinor(rate, 2, "Tax rate"));
        }
        // Legacy line formats carry no known tax field, or the Manager tax code /
        // its rate could not be resolved: fall back to UAE standard rate (5%).
        ledgerStats.taxLinesDefaulted += 1;
        return direction === "sales" ? defaultSalesTax : defaultPurchaseTax;
      };

      const accountingSettings = sqlite
        .prepare("SELECT default_bank_account_id FROM business_accounting_settings WHERE id = 'default'")
        .get() as { default_bank_account_id: string | null } | undefined;
      const fallbackBankAccountId = accountingSettings?.default_bank_account_id ?? null;
      const isPostingImport = docStatus === "posted";

      // 4.11 Insert Sales Quotes (non-posting documents)
      const insertQuote = sqlite.prepare(`
        INSERT OR IGNORE INTO sales_quotes (
          id, quote_number, customer_id, project_id, quote_date, expiry_date,
          reference, document_status, amounts_include_tax,
          subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, NULL, ?, ?,
          NULL, 'approved', 0,
          ?, ?, ?,
          ?, '1', ?, 'Base',
          ?, ?, ?,
          ?, ?, ?
        )
      `);
      const insertQuoteLine = sqlite.prepare(`
        INSERT INTO sales_quote_lines (
          id, quote_id, description, quantity_micros, unit_price_minor,
          discount_type, discount_value, sales_account_id, tax_code_id, project_id, item_id,
          net_amount_minor, tax_amount_minor, gross_amount_minor, position
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, 'acct-sales-4000', ?, NULL, NULL,
          ?, ?, ?, ?
        )
      `);
      const discountType = (line: { discountMinor: number }) => (line.discountMinor > 0 ? "fixed" : "none");
      const discountValue = (line: { discountMinor: number }) =>
        line.discountMinor > 0 ? minorToCurrencyInput(line.discountMinor, minorUnit) : "0";

      const usedQuoteNumbers = new Set<string>();
      for (let i = 0; i < extracted.salesQuotes.length; i++) {
        const sq = extracted.salesQuotes[i];
        let qNum = sq.quoteNumber?.trim() || `SQ-${i + 1}`;
        if (usedQuoteNumbers.has(qNum.toLowerCase())) {
          qNum = `${qNum}-${i + 1}`;
        }
        usedQuoteNumbers.add(qNum.toLowerCase());

        const targetCustId =
          (sq.customerId && customerMap.has(sq.customerId) && sq.customerId) || defaultCustomerId;
        const qDate = sq.issueDate || now.split("T")[0];
        const doc = computeImportedDocumentLines(
          sq.lines.map((l) => ({ ...l, taxCode: defaultSalesTax })),
          minorUnit,
        );

        insertQuote.run(
          sq.id, qNum, targetCustId, qDate, qDate,
          doc.subtotalMinor, doc.taxMinor, doc.totalMinor,
          ledgerCurrency, qDate,
          doc.subtotalMinor, doc.taxMinor, doc.totalMinor,
          userId, now, now,
        );
        doc.lines.forEach((cl, lineIdx) => {
          insertQuoteLine.run(
            randomUUID(), sq.id, cl.source.description || "Quote Line Item",
            cl.quantityMicros, cl.unitPriceMinor, discountType(cl), discountValue(cl), cl.taxCodeId,
            cl.netAmountMinor, cl.taxAmountMinor, cl.grossAmountMinor, lineIdx + 1,
          );
        });
      }

      // 4.12 Insert Sales Orders (non-posting documents)
      const insertOrder = sqlite.prepare(`
        INSERT OR IGNORE INTO sales_orders (
          id, order_number, customer_id, sales_quote_id, project_id,
          order_date, delivery_date, reference, document_status, amounts_include_tax,
          subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor,
          notes, created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, NULL,
          ?, ?, NULL, ?, 0,
          ?, ?, ?,
          ?, '1', ?, 'Base',
          ?, ?, ?,
          ?, ?, ?, ?
        )
      `);
      const insertOrderLine = sqlite.prepare(`
        INSERT INTO sales_order_lines (
          id, order_id, description, quantity_micros, unit_price_minor,
          discount_type, discount_value, sales_account_id, tax_code_id, project_id, item_id,
          net_amount_minor, tax_amount_minor, gross_amount_minor, position
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, 'acct-sales-4000', ?, NULL, NULL,
          ?, ?, ?, ?
        )
      `);

      const usedOrderNumbers = new Set<string>();
      for (let i = 0; i < extracted.salesOrders.length; i++) {
        const so = extracted.salesOrders[i];
        let orderNum = so.orderNumber?.trim() || `SO-${i + 1}`;
        if (usedOrderNumbers.has(orderNum.toLowerCase())) {
          orderNum = `${orderNum}-${i + 1}`;
        }
        usedOrderNumbers.add(orderNum.toLowerCase());

        const targetCustId =
          (so.customerId && customerMap.has(so.customerId) && so.customerId) || defaultCustomerId;
        const oDate = so.orderDate || now.split("T")[0];
        const doc = computeImportedDocumentLines(
          so.lines.map((l) => ({ ...l, taxCode: defaultSalesTax })),
          minorUnit,
        );
        const orderStatus = isPostingImport ? "active" : "draft";

        insertOrder.run(
          so.id, orderNum, targetCustId, so.salesQuoteId || null, oDate, oDate, orderStatus,
          doc.subtotalMinor, doc.taxMinor, doc.totalMinor,
          ledgerCurrency, oDate,
          doc.subtotalMinor, doc.taxMinor, doc.totalMinor,
          so.notes || null, userId, now, now,
        );
        doc.lines.forEach((cl, lineIdx) => {
          insertOrderLine.run(
            randomUUID(), so.id, cl.source.description || "Order Line Item",
            cl.quantityMicros, cl.unitPriceMinor, discountType(cl), discountValue(cl), cl.taxCodeId,
            cl.netAmountMinor, cl.taxAmountMinor, cl.grossAmountMinor, lineIdx + 1,
          );
        });
      }

      // 4.13 Insert Purchase Invoices (Bills) and post them through the app's posting services
      const insertBill = sqlite.prepare(`
        INSERT OR IGNORE INTO purchase_invoices (
          id, internal_number, supplier_id, project_id, supplier_invoice_number,
          invoice_date, tax_date, due_date, reference, purchase_order_id,
          document_status, subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at, posted_at, amounts_include_tax
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, NULL, NULL,
          ?, ?, ?, ?,
          ?, '1', ?, 'Base',
          ?, ?, ?,
          ?, ?, ?, ?, 0
        )
      `);
      const insertBillLine = sqlite.prepare(`
        INSERT INTO purchase_invoice_lines (
          id, purchase_invoice_id, description, quantity_micros, unit_price_minor,
          expense_account_id, tax_code_id, project_id, item_id,
          net_amount_minor, tax_amount_minor, gross_amount_minor, position,
          discount_type, discount_value
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `);

      // Open (unsettled) balance of each posted bill / invoice, used to cap allocations.
      const billOpenMinor = new Map<string, { supplierId: string; openMinor: number }>();
      const billSupplier = new Map<string, string>();
      const usedBillNumbers = new Set<string>();
      for (let i = 0; i < extracted.purchaseInvoices.length; i++) {
        const bill = extracted.purchaseInvoices[i];
        let billNum = bill.invoiceNumber?.trim() || `BILL-${i + 1}`;
        if (usedBillNumbers.has(billNum.toLowerCase())) {
          billNum = `${billNum}-${i + 1}`;
        }
        usedBillNumbers.add(billNum.toLowerCase());

        const supplierResolved = Boolean(bill.supplierId && supplierMap.has(bill.supplierId));
        const targetSuppId = supplierResolved ? bill.supplierId : defaultSupplierId;
        const bDate = bill.issueDate || now.split("T")[0];

        const doc = computeImportedDocumentLines(
          bill.lines.map((l) => {
            const accountRef = l.accountId ?? l.itemId;
            return {
              ...l,
              taxCode: resolveLineTax("purchases", l.taxCodeId),
              lineProjectId: (l.projectId && projectMap.has(l.projectId) && l.projectId) || null,
              lineItemId: (l.itemId && itemMap.has(l.itemId) && l.itemId) || null,
              expenseAccountId: (accountRef && accountMap.has(accountRef) && accountRef) || "acct-operating-expenses-6000",
            };
          }),
          minorUnit,
        );
        const lines = doc.lines.map((cl) => ({ ...cl, id: randomUUID() }));
        const billPrjId =
          lines.find((l) => l.source.lineProjectId)?.source.lineProjectId ||
          (bill.projectId && projectMap.has(bill.projectId) && bill.projectId) ||
          null;

        // Only documents the app itself could post are imported as posted; the
        // rest (zero value, unknown supplier, unabsorbable credit lines) stay as
        // drafts for review instead of becoming posted documents without a ledger.
        const postable = isPostingImport && supplierResolved && doc.totalMinor > 0 && doc.unappliedDiscountMinor === 0;
        if (isPostingImport && !postable) ledgerStats.billsLeftAsDraft += 1;

        insertBill.run(
          bill.id, billNum, targetSuppId, billPrjId, billNum,
          bDate, bDate, bDate,
          "draft", doc.subtotalMinor, doc.taxMinor, doc.totalMinor,
          ledgerCurrency, bDate,
          doc.subtotalMinor, doc.taxMinor, doc.totalMinor,
          userId, now, now, null,
        );
        billSupplier.set(bill.id, targetSuppId);

        lines.forEach((cl, lineIdx) => {
          insertBillLine.run(
            cl.id, bill.id, cl.source.description || "Purchase Line Item",
            cl.quantityMicros, cl.unitPriceMinor,
            cl.source.expenseAccountId, cl.taxCodeId, cl.source.lineProjectId, cl.source.lineItemId,
            cl.netAmountMinor, cl.taxAmountMinor, cl.grossAmountMinor, lineIdx + 1,
            discountType(cl), discountValue(cl),
          );
        });

        if (postable) {
          const rate = rateFor(bDate);
          const postingLines = lines.map((cl) => ({
            id: cl.id,
            expenseAccountId: cl.source.expenseAccountId,
            taxCodeId: cl.taxCodeId,
            projectId: cl.source.lineProjectId ?? billPrjId,
            itemId: cl.source.lineItemId,
            netAmountMinor: cl.netAmountMinor,
            taxAmountMinor: cl.taxAmountMinor,
            grossAmountMinor: cl.grossAmountMinor,
          }));
          postPurchaseInvoice(sqlite, {
            id: bill.id, internalNumber: billNum, supplierId: targetSuppId,
            invoiceDate: bDate, totalMinor: doc.totalMinor, rate,
          }, postingLines);
          replaceTaxEntries(sqlite, {
            sourceType: "purchase_invoice", sourceId: bill.id, sourceNumber: billNum,
            partyName: supplierMap.get(targetSuppId)?.name ?? null,
            taxDate: bDate, direction: "purchases", rate,
          }, postingLines);
          sqlite
            .prepare("UPDATE purchase_invoices SET document_status = 'posted', posted_at = ? WHERE id = ?")
            .run(bDate, bill.id);
          billOpenMinor.set(bill.id, { supplierId: targetSuppId, openMinor: doc.totalMinor });
          ledgerStats.billsPosted += 1;
        }
      }

      // 4.14 Insert Sales Invoices and post them through the app's posting services
      const insertInvoice = sqlite.prepare(`
        INSERT OR IGNORE INTO sales_invoices (
          id, invoice_number, customer_id, project_id,
          invoice_date, tax_date, supply_emirate, due_date, reference,
          einvoice_transaction_flags_json, document_status,
          subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at, posted_at, amounts_include_tax
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, 'dubai', ?, NULL,
          '{"freeTradeZone":false,"deemedSupply":false,"marginScheme":false,"summaryInvoice":false,"continuousSupply":false,"agentBilling":false,"eCommerce":false,"export":false}', ?,
          ?, ?, ?,
          ?, '1', ?, 'Base',
          ?, ?, ?,
          ?, ?, ?, ?, 0
        )
      `);
      const insertInvoiceLine = sqlite.prepare(`
        INSERT INTO sales_invoice_lines (
          id, invoice_id, description, quantity_micros, unit_price_minor,
          sales_account_id, tax_code_id, project_id, item_id,
          net_amount_minor, tax_amount_minor, gross_amount_minor, position,
          discount_type, discount_value
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        )
      `);

      const invoiceOpenMinor = new Map<string, { customerId: string; openMinor: number }>();
      const invoiceCustomer = new Map<string, string>();
      const usedInvNumbers = new Set<string>();
      for (let i = 0; i < extracted.salesInvoices.length; i++) {
        const inv = extracted.salesInvoices[i];
        let invNum = inv.invoiceNumber?.trim() || `INV-${i + 1}`;
        if (usedInvNumbers.has(invNum.toLowerCase())) {
          invNum = `${invNum}-${i + 1}`;
        }
        usedInvNumbers.add(invNum.toLowerCase());

        const customerResolved = Boolean(inv.customerId && customerMap.has(inv.customerId));
        const targetCustId = customerResolved ? inv.customerId : defaultCustomerId;
        const iDate = inv.issueDate || now.split("T")[0];

        const doc = computeImportedDocumentLines(
          inv.lines.map((l) => {
            const accountRef = l.accountId ?? l.itemId;
            return {
              ...l,
              taxCode: resolveLineTax("sales", l.taxCodeId),
              lineProjectId: (l.projectId && projectMap.has(l.projectId) && l.projectId) || null,
              lineItemId: (l.itemId && itemMap.has(l.itemId) && l.itemId) || null,
              salesAccountId: (accountRef && accountMap.has(accountRef) && accountRef) || "acct-sales-4000",
            };
          }),
          minorUnit,
        );
        const lines = doc.lines.map((cl) => ({ ...cl, id: randomUUID() }));
        const invPrjId =
          lines.find((l) => l.source.lineProjectId)?.source.lineProjectId ||
          (inv.projectId && projectMap.has(inv.projectId) && inv.projectId) ||
          null;

        const postable = isPostingImport && customerResolved && doc.totalMinor > 0 && doc.unappliedDiscountMinor === 0;
        if (isPostingImport && !postable) ledgerStats.invoicesLeftAsDraft += 1;

        insertInvoice.run(
          inv.id, invNum, targetCustId, invPrjId,
          iDate, iDate, iDate,
          "draft",
          doc.subtotalMinor, doc.taxMinor, doc.totalMinor,
          ledgerCurrency, iDate,
          doc.subtotalMinor, doc.taxMinor, doc.totalMinor,
          userId, now, now, null,
        );
        invoiceCustomer.set(inv.id, targetCustId);

        lines.forEach((cl, lineIdx) => {
          insertInvoiceLine.run(
            cl.id, inv.id, cl.source.description || "Invoice Line Item",
            cl.quantityMicros, cl.unitPriceMinor,
            cl.source.salesAccountId, cl.taxCodeId, cl.source.lineProjectId, cl.source.lineItemId,
            cl.netAmountMinor, cl.taxAmountMinor, cl.grossAmountMinor, lineIdx + 1,
            discountType(cl), discountValue(cl),
          );
        });

        if (postable) {
          const rate = rateFor(iDate);
          const postingLines = lines.map((cl) => ({
            id: cl.id,
            salesAccountId: cl.source.salesAccountId,
            taxCodeId: cl.taxCodeId,
            projectId: cl.source.lineProjectId ?? invPrjId,
            netAmountMinor: cl.netAmountMinor,
            taxAmountMinor: cl.taxAmountMinor,
          }));
          postSalesInvoice(sqlite, {
            id: inv.id, invoiceNumber: invNum, customerId: targetCustId,
            invoiceDate: iDate, totalMinor: doc.totalMinor, rate,
          }, postingLines);
          replaceTaxEntries(sqlite, {
            sourceType: "sales_invoice", sourceId: inv.id, sourceNumber: invNum,
            partyName: customerMap.get(targetCustId)?.name ?? null,
            taxDate: iDate, direction: "sales", supplyEmirate: "dubai", rate,
          }, postingLines);
          sqlite
            .prepare("UPDATE sales_invoices SET document_status = 'posted', posted_at = ? WHERE id = ?")
            .run(iDate, inv.id);
          invoiceOpenMinor.set(inv.id, { customerId: targetCustId, openMinor: doc.totalMinor });
          ledgerStats.invoicesPosted += 1;
        }
      }

      // 4.15 Insert Customer Receipts, allocate to the invoices they pay, and post them
      const insertReceipt = sqlite.prepare(`
        INSERT OR IGNORE INTO receipts (
          id, receipt_number, customer_id, date, bank_account_id,
          amount_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_amount_minor, released_carrying_amount_minor, realized_fx_amount_minor,
          reference, description, document_status,
          created_by, created_at, posted_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, '1', ?, 'Base',
          ?, ?, 0,
          NULL, ?, ?,
          ?, ?, ?
        )
      `);
      const insertReceiptAlloc = sqlite.prepare(`
        INSERT OR IGNORE INTO receipt_allocations (
          id, receipt_id, sales_invoice_id, amount_minor,
          foreign_amount_allocated, base_carrying_amount_released, settlement_base_amount, realized_fx_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `);
      const resolveBank = (accountId: string | undefined) =>
        (accountId && bankMap.has(accountId) && accountId) || null;

      const usedReceiptNumbers = new Set<string>();
      for (let i = 0; i < extracted.receipts.length; i++) {
        const r = extracted.receipts[i];
        const amountMinor = toMinor(r.amount, "Receipt amount");
        if (amountMinor <= 0) {
          // No positive amount could be decoded: nothing to record (previously a fake 0.01 receipt).
          ledgerStats.receiptsSkipped += 1;
          continue;
        }
        let rNum = r.receiptNumber?.trim() || `RCV-${i + 1}`;
        if (usedReceiptNumbers.has(rNum.toLowerCase())) {
          rNum = `${rNum}-${i + 1}`;
        }
        usedReceiptNumbers.add(rNum.toLowerCase());

        const allocatedInvoiceCustomer = r.allocations
          .map((alloc) => invoiceCustomer.get(alloc.invoiceId))
          .find((customerId): customerId is string => Boolean(customerId && customerMap.has(customerId)));
        const resolvedCustId =
          (r.customerId && customerMap.has(r.customerId) && r.customerId) || allocatedInvoiceCustomer || null;
        const resolvedBankId = resolveBank(r.accountId);
        const postable = isPostingImport && Boolean(resolvedCustId) && Boolean(resolvedBankId);
        const targetCustId = resolvedCustId ?? defaultCustomerId;
        const targetBankId = resolvedBankId ?? fallbackBankAccountId ?? defaultBankAccountId;
        const rDate = r.receiptDate || now.split("T")[0];
        if (isPostingImport && !postable) ledgerStats.receiptsLeftAsDraft += 1;

        insertReceipt.run(
          r.id, rNum, targetCustId, rDate, targetBankId,
          amountMinor, ledgerCurrency, rDate,
          amountMinor, amountMinor,
          r.description || "Customer Receipt", postable ? "posted" : "draft",
          userId, now, postable ? rDate : null,
        );

        // Allocate only to posted invoices of the same customer, capped at their open balance;
        // anything left stays as unallocated customer credit on the receipt.
        let remainingMinor = amountMinor;
        for (const alloc of r.allocations) {
          const open = invoiceOpenMinor.get(alloc.invoiceId);
          if (!open || open.customerId !== targetCustId || remainingMinor <= 0) continue;
          const allocMinor = Math.min(toMinor(alloc.amount, "Allocation amount"), open.openMinor, remainingMinor);
          if (allocMinor <= 0) continue;
          insertReceiptAlloc.run(randomUUID(), r.id, alloc.invoiceId, allocMinor, allocMinor, allocMinor, allocMinor);
          if (postable) open.openMinor -= allocMinor;
          remainingMinor -= allocMinor;
        }

        if (postable) {
          postReceipt(sqlite, {
            id: r.id, receiptNumber: rNum, customerId: targetCustId, date: rDate,
            bankAccountId: targetBankId, baseAmountMinor: amountMinor,
            releasedCarryingAmountMinor: amountMinor, realizedFxAmountMinor: 0,
          });
          ledgerStats.receiptsPosted += 1;
        }
      }

      // 4.16 Insert Supplier Payments, allocate to the bills they pay, and post them
      const insertPayment = sqlite.prepare(`
        INSERT OR IGNORE INTO supplier_payments (
          id, payment_number, supplier_id, date, bank_account_id,
          amount_minor, currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_amount_minor, released_carrying_amount_minor, realized_fx_amount_minor,
          reference, description, document_status,
          created_by, created_at, posted_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, '1', ?, 'Base',
          ?, ?, 0,
          NULL, ?, ?,
          ?, ?, ?
        )
      `);
      const insertPaymentAlloc = sqlite.prepare(`
        INSERT OR IGNORE INTO supplier_payment_allocations (
          id, payment_id, purchase_invoice_id, amount_minor,
          foreign_amount_allocated, base_carrying_amount_released, settlement_base_amount, realized_fx_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `);

      const usedPaymentNumbers = new Set<string>();
      for (let i = 0; i < extracted.payments.length; i++) {
        const p = extracted.payments[i];
        const amountMinor = toMinor(p.amount, "Payment amount");
        if (amountMinor <= 0) {
          ledgerStats.paymentsSkipped += 1;
          continue;
        }
        let pNum = p.paymentNumber?.trim() || `PAY-${i + 1}`;
        if (usedPaymentNumbers.has(pNum.toLowerCase())) {
          pNum = `${pNum}-${i + 1}`;
        }
        usedPaymentNumbers.add(pNum.toLowerCase());

        const allocatedBillSupplier = p.allocations
          .map((alloc) => billSupplier.get(alloc.invoiceId))
          .find((supplierId): supplierId is string => Boolean(supplierId && supplierMap.has(supplierId)));
        const resolvedSuppId =
          (p.supplierId && supplierMap.has(p.supplierId) && p.supplierId) || allocatedBillSupplier || null;
        const resolvedBankId = resolveBank(p.accountId);
        const postable = isPostingImport && Boolean(resolvedSuppId) && Boolean(resolvedBankId);
        const targetSuppId = resolvedSuppId ?? defaultSupplierId;
        const targetBankId = resolvedBankId ?? fallbackBankAccountId ?? defaultBankAccountId;
        const pDate = p.paymentDate || now.split("T")[0];
        if (isPostingImport && !postable) ledgerStats.paymentsLeftAsDraft += 1;

        insertPayment.run(
          p.id, pNum, targetSuppId, pDate, targetBankId,
          amountMinor, ledgerCurrency, pDate,
          amountMinor, amountMinor,
          p.description || "Supplier Payment", postable ? "posted" : "draft",
          userId, now, postable ? pDate : null,
        );

        let remainingMinor = amountMinor;
        for (const alloc of p.allocations) {
          const open = billOpenMinor.get(alloc.invoiceId);
          if (!open || open.supplierId !== targetSuppId || remainingMinor <= 0) continue;
          const allocMinor = Math.min(toMinor(alloc.amount, "Allocation amount"), open.openMinor, remainingMinor);
          if (allocMinor <= 0) continue;
          insertPaymentAlloc.run(randomUUID(), p.id, alloc.invoiceId, allocMinor, allocMinor, allocMinor, allocMinor);
          if (postable) open.openMinor -= allocMinor;
          remainingMinor -= allocMinor;
        }

        if (postable) {
          postSupplierPayment(sqlite, {
            id: p.id, paymentNumber: pNum, supplierId: targetSuppId, date: pDate,
            bankAccountId: targetBankId, baseAmountMinor: amountMinor,
            releasedCarryingAmountMinor: amountMinor, realizedFxAmountMinor: 0,
          });
          ledgerStats.paymentsPosted += 1;
        }
      }

      // 4.17 Insert Bank Transfers (always posted documents) with their ledger journal
      const insertTransfer = sqlite.prepare(`
        INSERT OR IGNORE INTO bank_transfers (
          id, transfer_number, from_bank_account_id, to_bank_account_id,
          date, amount_minor, reference, description, document_status,
          created_by, created_at, posted_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'posted', ?, ?, ?)
      `);

      let transferSeq = 0;
      for (let i = 0; i < extracted.bankTransfers.length; i++) {
        const tr = extracted.bankTransfers[i];
        const fromId = resolveBank(tr.fromAccountId);
        const toId = resolveBank(tr.toAccountId);
        const amountMinor = toMinor(tr.amount, "Transfer amount");
        // Never invent the account pair or the amount: an unresolvable transfer is skipped.
        if (!fromId || !toId || fromId === toId || amountMinor <= 0) {
          ledgerStats.transfersSkipped += 1;
          continue;
        }
        transferSeq += 1;
        const transferNum = `BT-${String(transferSeq).padStart(4, "0")}`;
        const tDate = tr.transferDate || now.split("T")[0];
        insertTransfer.run(
          tr.id, transferNum, fromId, toId, tDate, amountMinor,
          tr.description || "Inter-account transfer", userId, now, now,
        );
        postTransaction(sqlite, {
          sourceType: "bank_transfer", sourceId: tr.id, date: tDate,
          description: `Bank Transfer ${transferNum}`,
          lines: [
            { accountId: toId, description: tr.description || `Transfer from ${transferNum}`, debitMinor: amountMinor, reference: transferNum },
            { accountId: fromId, description: tr.description || `Transfer to ${transferNum}`, creditMinor: amountMinor, reference: transferNum },
          ],
        });
        ledgerStats.transfersPosted += 1;
      }

      // 4.18 Insert Employees (Migration 33)
      const insertEmployee = sqlite.prepare(`
        INSERT OR IGNORE INTO employees (
          id, code, name, email, phone, address, designation, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, NULL, ?, 'Staff', 1, ?, ?)
      `);
      for (let i = 0; i < extracted.employees.length; i++) {
        const emp = extracted.employees[i];
        insertEmployee.run(
          emp.id,
          `EMP-${String(i + 1).padStart(3, "0")}`,
          emp.name,
          emp.address || null,
          now,
          now,
        );
      }

      // 4.19 Insert Payslips (Migration 33) and post their payroll journal
      const insertPayslip = sqlite.prepare(`
        INSERT OR IGNORE INTO payslips (
          id, payslip_number, employee_id, date, period_description,
          gross_amount_minor, deductions_minor, net_amount_minor,
          document_status, notes, created_by, created_at, posted_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
      `);
      const defaultEarningsAccountId = (sqlite.prepare(`
        SELECT id FROM accounts WHERE id = 'acct-salaries-expense-6100' OR (type = 'expense' AND is_active = 1)
        ORDER BY (id = 'acct-salaries-expense-6100') DESC, created_at ASC LIMIT 1
      `).get() as { id: string } | undefined)?.id || "acct-salaries-expense-6100";

      const defaultDeductionsAccountId = (sqlite.prepare(`
        SELECT id FROM accounts WHERE id = 'acct-payroll-payable-2200' OR (type = 'liability' AND is_active = 1)
        ORDER BY (id = 'acct-payroll-payable-2200') DESC, created_at ASC LIMIT 1
      `).get() as { id: string } | undefined)?.id || "acct-payroll-payable-2200";
      const payrollPayableAccountId = defaultDeductionsAccountId;

      const insertEarningsLine = sqlite.prepare(`
        INSERT INTO payslip_lines (
          id, payslip_id, item_id, type, description, account_id, amount_minor, position
        ) VALUES (?, ?, NULL, 'earnings', 'Basic Salary', ?, ?, 1)
      `);
      const insertDeductionLine = sqlite.prepare(`
        INSERT INTO payslip_lines (
          id, payslip_id, item_id, type, description, account_id, amount_minor, position
        ) VALUES (?, ?, NULL, 'deduction', 'Payroll Deductions', ?, ?, 2)
      `);
      const linkPayslipJournal = sqlite.prepare(
        "UPDATE payslips SET document_status = 'posted', posted_at = ?, journal_entry_id = ? WHERE id = ?",
      );
      const defaultEmpId = extracted.employees[0]?.id || "default-emp";
      for (let i = 0; i < extracted.payslips.length; i++) {
        const slip = extracted.payslips[i];
        const employeeResolved = Boolean(slip.employeeId && employeeMap.has(slip.employeeId));
        const targetEmpId = employeeResolved ? slip.employeeId : defaultEmpId;
        const rawGrossMinor = toMinor(slip.grossAmount, "Payslip gross amount");
        const rawNetMinor = toMinor(slip.netAmount, "Payslip net amount");
        const deductionsMinor = Math.max(0, rawGrossMinor - rawNetMinor);
        const grossMinor = Math.max(rawGrossMinor, rawNetMinor + deductionsMinor);
        const netMinor = grossMinor - deductionsMinor;
        const postable = isPostingImport && employeeResolved && grossMinor > 0;
        if (isPostingImport && !postable) ledgerStats.payslipsLeftAsDraft += 1;

        insertPayslip.run(
          slip.id, slip.payslipNumber, targetEmpId, slip.date, slip.periodDescription || null,
          grossMinor, deductionsMinor, netMinor,
          "draft", slip.notes || null, userId, now, null, now,
        );

        if (grossMinor > 0) {
          insertEarningsLine.run(randomUUID(), slip.id, defaultEarningsAccountId, grossMinor);
        }
        if (deductionsMinor > 0) {
          insertDeductionLine.run(randomUUID(), slip.id, defaultDeductionsAccountId, deductionsMinor);
        }

        if (postable) {
          const employeeName = employeeMap.get(targetEmpId)?.name || "Employee";
          const journalLines: JournalLineInput[] = [
            { accountId: defaultEarningsAccountId, description: `[Earnings] Basic Salary (${employeeName})`, debitMinor: grossMinor },
          ];
          if (deductionsMinor > 0) {
            journalLines.push({ accountId: defaultDeductionsAccountId, description: `[Deduction] Payroll Deductions (${employeeName})`, creditMinor: deductionsMinor });
          }
          if (netMinor > 0) {
            journalLines.push({ accountId: payrollPayableAccountId, description: `Net Salary Payable (${employeeName})`, creditMinor: netMinor });
          }
          const journal = postTransaction(sqlite, {
            sourceType: "payslip", sourceId: slip.id, date: slip.date,
            description: `Payroll: ${slip.payslipNumber} - ${employeeName}`,
            lines: journalLines,
          });
          linkPayslipJournal.run(slip.date, journal.id, slip.id);
          ledgerStats.payslipsPosted += 1;
        }
      }

      // 4.20 Insert Manual Journal Entries through the validating posting service
      for (const je of extracted.journalEntries) {
        const converted = convertManagerJournalLines(je.entryNumber, je.lines, minorUnit);
        if (converted.totalMinor === 0) {
          ledgerStats.journalsSkipped += 1;
          continue;
        }
        postTransaction(sqlite, {
          sourceType: "general",
          sourceId: je.id,
          date: je.date,
          description: `${je.narration} (Manager.io ${je.entryNumber})`,
          lines: converted.lines.map(({ source, debitMinor, creditMinor }) => {
            const mapped = Boolean(source.accountId && accountMap.has(source.accountId));
            if (!mapped) ledgerStats.journalLinesWithUnmappedAccount += 1;
            return {
              accountId: mapped ? source.accountId : "acct-operating-expenses-6000",
              description: source.description || je.narration,
              debitMinor,
              creditMinor,
              reference: je.entryNumber,
            };
          }),
        });
        ledgerStats.journalsPosted += 1;
      }
    })();

    // 5. Restore SQLite pragmas to runtime defaults
    applyStandardSqlitePragmas(context.sqlite);

    // 6. Log migration event in the new business activity log
    recordActivity(businessId, {
      userId,
      entityType: "business_profile",
      entityId: businessId,
      entityNumber: nameToUse,
      action: "created",
      createdAt: now,
      summary: `Imported business '${nameToUse}' from Manager.io (${docStatus} mode) with ${extracted.customers.length} customers, ${extracted.suppliers.length} suppliers, ${extracted.salesInvoices.length} invoices, ${extracted.purchaseInvoices.length} bills, and ${extracted.employees.length} employees.`,
      details: {
        source: "manager.io",
        documentStatus: docStatus,
        customers: extracted.customers.length,
        suppliers: extracted.suppliers.length,
        items: extracted.inventoryItems.length,
        projects: extracted.projects.length,
        salesInvoices: extracted.salesInvoices.length,
        salesOrders: extracted.salesOrders.length,
        salesQuotes: extracted.salesQuotes.length,
        purchaseInvoices: extracted.purchaseInvoices.length,
        receipts: extracted.receipts.length,
        payments: extracted.payments.length,
        employees: extracted.employees.length,
        payslips: extracted.payslips.length,
        ledger: ledgerStats,
      },
      sqlite: context.sqlite,
    });

    const summary: ManagerInspectionSummary = {
      businessName: nameToUse,
      trn: extracted.business.trn,
      phone: extracted.business.phone,
      email: extracted.business.email,
      address: extracted.business.address,
      country: extracted.business.country,
      currency: extracted.business.currency,
      customersCount: extracted.customers.length,
      suppliersCount: extracted.suppliers.length,
      inventoryItemsCount: extracted.inventoryItems.length,
      fixedAssetsCount: extracted.fixedAssets.length,
      projectsCount: extracted.projects.length,
      accountsCount: extracted.accounts.length,
      bankAccountsCount: extracted.bankAccounts.length,
      salesInvoicesCount: extracted.salesInvoices.length,
      salesQuotesCount: extracted.salesQuotes.length,
      salesOrdersCount: extracted.salesOrders.length,
      purchaseInvoicesCount: extracted.purchaseInvoices.length,
      receiptsCount: extracted.receipts.length,
      paymentsCount: extracted.payments.length,
      bankTransfersCount: extracted.bankTransfers.length,
      employeesCount: extracted.employees.length,
      payslipsCount: extracted.payslips.length,
      journalEntriesCount: extracted.journalEntries.length,
    };

    return {
      businessId,
      businessName: nameToUse,
      summary,
      ledger: ledgerStats,
    };
  } catch (err) {
    try {
      applyStandardSqlitePragmas(context.sqlite);
    } catch {}
    closeBusinessConnection(directoryKey);
    throw err;
  }
}
