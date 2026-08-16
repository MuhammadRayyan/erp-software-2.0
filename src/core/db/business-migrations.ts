import type Database from "better-sqlite3";
import { runMigrations, type SqliteMigration } from "./migrations/runner";
import { detectAndValidateBusinessBaseline } from "./migrations/business-baseline";

const PHASE_0_SCHEMA = `
  CREATE TABLE IF NOT EXISTS "customers" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "tax_reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'archived')),
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "sales_invoices" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "invoice_number" TEXT NOT NULL UNIQUE,
    "customer_id" TEXT NOT NULL REFERENCES "customers"("id"),
    "invoice_date" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft'
      CHECK ("status" IN ('draft', 'sent', 'partial', 'paid', 'overdue')),
    "subtotal_minor" INTEGER NOT NULL,
    "tax_minor" INTEGER NOT NULL,
    "total_minor" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "invoice_customer_idx" ON "sales_invoices" ("customer_id");
  CREATE TABLE IF NOT EXISTS "sales_invoice_lines" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "invoice_id" TEXT NOT NULL REFERENCES "sales_invoices"("id") ON DELETE CASCADE,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "rate_minor" INTEGER NOT NULL,
    "tax_rate" REAL NOT NULL,
    "position" INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "invoice_lines_invoice_idx" ON "sales_invoice_lines" ("invoice_id");
  CREATE TABLE IF NOT EXISTS "document_templates" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "document_type" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "template_json" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  );
`;

const PHASE_1_SCHEMA = `
  CREATE TABLE "accounts" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "code" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK ("type" IN ('asset', 'liability', 'equity', 'income', 'expense')),
    "subtype" TEXT NOT NULL,
    "is_system" INTEGER NOT NULL DEFAULT 0,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  );
  CREATE TABLE "tax_codes" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "rate_basis_points" INTEGER NOT NULL CHECK ("rate_basis_points" >= 0 AND "rate_basis_points" <= 10000),
    "sales_tax_account_id" TEXT REFERENCES "accounts"("id"),
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  );
  CREATE TABLE "business_accounting_settings" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "accounts_receivable_account_id" TEXT NOT NULL REFERENCES "accounts"("id"),
    "default_sales_account_id" TEXT NOT NULL REFERENCES "accounts"("id"),
    "default_bank_account_id" TEXT NOT NULL REFERENCES "accounts"("id"),
    "vat_output_account_id" TEXT NOT NULL REFERENCES "accounts"("id"),
    "invoice_prefix" TEXT NOT NULL,
    "invoice_next_number" INTEGER NOT NULL CHECK ("invoice_next_number" > 0),
    "invoice_padding" INTEGER NOT NULL CHECK ("invoice_padding" BETWEEN 1 AND 10),
    "receipt_prefix" TEXT NOT NULL,
    "receipt_next_number" INTEGER NOT NULL CHECK ("receipt_next_number" > 0),
    "journal_prefix" TEXT NOT NULL,
    "journal_next_number" INTEGER NOT NULL CHECK ("journal_next_number" > 0),
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  );
  CREATE TABLE "sales_invoices" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "invoice_number" TEXT NOT NULL UNIQUE,
    "customer_id" TEXT NOT NULL REFERENCES "customers"("id"),
    "invoice_date" TEXT NOT NULL,
    "due_date" TEXT NOT NULL,
    "reference" TEXT,
    "document_status" TEXT NOT NULL DEFAULT 'draft'
      CHECK ("document_status" IN ('draft', 'posted', 'void')),
    "subtotal_minor" INTEGER NOT NULL CHECK ("subtotal_minor" >= 0),
    "tax_minor" INTEGER NOT NULL CHECK ("tax_minor" >= 0),
    "total_minor" INTEGER NOT NULL CHECK ("total_minor" >= 0),
    "created_by" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "posted_at" TEXT,
    "voided_at" TEXT
  );
  CREATE UNIQUE INDEX "sales_invoice_number_idx" ON "sales_invoices" ("invoice_number");
  CREATE INDEX "sales_invoice_customer_idx" ON "sales_invoices" ("customer_id");
  CREATE TABLE "sales_invoice_lines" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "invoice_id" TEXT NOT NULL REFERENCES "sales_invoices"("id") ON DELETE CASCADE,
    "description" TEXT NOT NULL,
    "quantity_micros" INTEGER NOT NULL CHECK ("quantity_micros" > 0),
    "unit_price_minor" INTEGER NOT NULL CHECK ("unit_price_minor" >= 0),
    "sales_account_id" TEXT NOT NULL REFERENCES "accounts"("id"),
    "tax_code_id" TEXT NOT NULL REFERENCES "tax_codes"("id"),
    "net_amount_minor" INTEGER NOT NULL CHECK ("net_amount_minor" >= 0),
    "tax_amount_minor" INTEGER NOT NULL CHECK ("tax_amount_minor" >= 0),
    "gross_amount_minor" INTEGER NOT NULL CHECK ("gross_amount_minor" >= 0),
    "position" INTEGER NOT NULL
  );
  CREATE INDEX "sales_invoice_lines_invoice_idx" ON "sales_invoice_lines" ("invoice_id");
  CREATE TABLE "journal_entries" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "entry_number" TEXT NOT NULL UNIQUE,
    "date" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted' CHECK ("status" = 'posted'),
    "created_at" TEXT NOT NULL,
    "posted_at" TEXT NOT NULL,
    UNIQUE ("source_type", "source_id")
  );
  CREATE INDEX "journal_date_idx" ON "journal_entries" ("date");
  CREATE TABLE "journal_lines" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "journal_entry_id" TEXT NOT NULL REFERENCES "journal_entries"("id") ON DELETE CASCADE,
    "account_id" TEXT NOT NULL REFERENCES "accounts"("id"),
    "description" TEXT NOT NULL,
    "debit_minor" INTEGER NOT NULL DEFAULT 0,
    "credit_minor" INTEGER NOT NULL DEFAULT 0,
    "customer_id" TEXT REFERENCES "customers"("id"),
    "reference" TEXT,
    "position" INTEGER NOT NULL,
    CHECK ("debit_minor" >= 0 AND "credit_minor" >= 0),
    CHECK (("debit_minor" > 0 AND "credit_minor" = 0) OR ("credit_minor" > 0 AND "debit_minor" = 0))
  );
  CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" ("journal_entry_id");
  CREATE INDEX "journal_lines_account_idx" ON "journal_lines" ("account_id");
  CREATE INDEX "journal_lines_customer_idx" ON "journal_lines" ("customer_id");
  CREATE TABLE "receipts" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "receipt_number" TEXT NOT NULL UNIQUE,
    "customer_id" TEXT NOT NULL REFERENCES "customers"("id"),
    "date" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL REFERENCES "accounts"("id"),
    "amount_minor" INTEGER NOT NULL CHECK ("amount_minor" > 0),
    "reference" TEXT,
    "description" TEXT,
    "document_status" TEXT NOT NULL DEFAULT 'posted' CHECK ("document_status" IN ('posted', 'void')),
    "created_by" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "posted_at" TEXT NOT NULL,
    "voided_at" TEXT
  );
  CREATE INDEX "receipt_customer_idx" ON "receipts" ("customer_id");
  CREATE TABLE "receipt_allocations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "receipt_id" TEXT NOT NULL REFERENCES "receipts"("id") ON DELETE CASCADE,
    "sales_invoice_id" TEXT NOT NULL REFERENCES "sales_invoices"("id"),
    "amount_minor" INTEGER NOT NULL CHECK ("amount_minor" > 0),
    UNIQUE ("receipt_id", "sales_invoice_id")
  );
  CREATE INDEX "receipt_allocation_invoice_idx" ON "receipt_allocations" ("sales_invoice_id");
`;

type LegacyInvoice = {
  id: string;
  invoice_number: string;
  customer_id: string;
  invoice_date: string;
  due_date: string;
  reference: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type LegacyLine = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  rate_minor: number;
  tax_rate: number;
  position: number;
};

function createPhase0Baseline(sqlite: Database.Database) {
  sqlite.exec(PHASE_0_SCHEMA);
}

function seedDefaultAccounts(sqlite: Database.Database, now: string) {
  const rows = [
    ["acct-cash-1000", "1000", "Cash", "asset", "cash", 0],
    ["acct-bank-1010", "1010", "Bank", "asset", "bank", 1],
    ["acct-ar-1100", "1100", "Accounts Receivable", "asset", "accounts_receivable", 1],
    ["acct-current-assets-1200", "1200", "Other Current Assets", "asset", "current_asset", 0],
    ["acct-fixed-assets-1500", "1500", "Fixed Assets", "asset", "fixed_asset", 0],
    ["acct-ap-2000", "2000", "Accounts Payable", "liability", "accounts_payable", 0],
    ["acct-vat-payable-2100", "2100", "VAT Payable", "liability", "tax_payable", 1],
    ["acct-equity-3000", "3000", "Owner's Equity / Retained Earnings", "equity", "equity", 0],
    ["acct-sales-4000", "4000", "Sales", "income", "sales", 1],
    ["acct-other-income-4100", "4100", "Other Income", "income", "other_income", 0],
    ["acct-cost-sales-5000", "5000", "Cost of Sales", "expense", "cost_of_sales", 0],
    ["acct-operating-expenses-6000", "6000", "Operating Expenses", "expense", "operating_expense", 0],
  ] as const;
  const insert = sqlite.prepare(`
    INSERT INTO accounts
      (id, code, name, type, subtype, is_system, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  for (const row of rows) insert.run(...row, now, now);
}

function upgradeToPhase1(sqlite: Database.Database) {
  const legacyInvoices = sqlite.prepare("SELECT * FROM sales_invoices").all() as LegacyInvoice[];
  const legacyLines = sqlite
    .prepare("SELECT * FROM sales_invoice_lines ORDER BY invoice_id, position")
    .all() as LegacyLine[];
  const now = new Date().toISOString();

  sqlite.exec(`
        ALTER TABLE "sales_invoice_lines" RENAME TO "phase0_sales_invoice_lines";
        ALTER TABLE "sales_invoices" RENAME TO "phase0_sales_invoices";
        DROP INDEX IF EXISTS "invoice_lines_invoice_idx";
        DROP INDEX IF EXISTS "invoice_customer_idx";
        ${PHASE_1_SCHEMA}
      `);
  seedDefaultAccounts(sqlite, now);
  sqlite
    .prepare(`
          INSERT INTO tax_codes
            (id, name, rate_basis_points, sales_tax_account_id, is_active, created_at, updated_at)
          VALUES
            ('tax-no-vat', 'No VAT', 0, NULL, 1, ?, ?),
            ('tax-uae-vat-5', 'UAE VAT 5%', 500, 'acct-vat-payable-2100', 1, ?, ?)
        `)
    .run(now, now, now, now);

  const largestLegacyNumber = legacyInvoices.reduce((largest, invoice) => {
    const match = invoice.invoice_number.match(/(\d+)$/);
    return Math.max(largest, match ? Number(match[1]) : 0);
  }, 0);
  sqlite
    .prepare(`
          INSERT INTO business_accounting_settings (
            id, accounts_receivable_account_id, default_sales_account_id,
            default_bank_account_id, vat_output_account_id,
            invoice_prefix, invoice_next_number, invoice_padding,
            receipt_prefix, receipt_next_number, journal_prefix, journal_next_number,
            created_at, updated_at
          ) VALUES (
            'default', 'acct-ar-1100', 'acct-sales-4000',
            'acct-bank-1010', 'acct-vat-payable-2100',
            'INV-', ?, 5, 'REC-', 1, 'JE-', 1, ?, ?
          )
        `)
    .run(largestLegacyNumber + 1, now, now);

  const insertTaxCode = sqlite.prepare(`
        INSERT OR IGNORE INTO tax_codes
          (id, name, rate_basis_points, sales_tax_account_id, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 'acct-vat-payable-2100', 1, ?, ?)
      `);
  for (const rate of new Set(legacyLines.map((line) => Math.round(line.tax_rate * 100)))) {
    if (rate === 0 || rate === 500) continue;
    insertTaxCode.run(
      `tax-legacy-${rate}`,
      `Legacy VAT ${(rate / 100).toFixed(2)}%`,
      rate,
      now,
      now,
    );
  }

  const insertInvoice = sqlite.prepare(`
        INSERT INTO sales_invoices (
          id, invoice_number, customer_id, invoice_date, due_date, reference,
          document_status, subtotal_minor, tax_minor, total_minor,
          created_by, created_at, updated_at, posted_at, voided_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, NULL, NULL)
      `);
  const insertLine = sqlite.prepare(`
        INSERT INTO sales_invoice_lines (
          id, invoice_id, description, quantity_micros, unit_price_minor,
          sales_account_id, tax_code_id, net_amount_minor, tax_amount_minor,
          gross_amount_minor, position
        ) VALUES (?, ?, ?, ?, ?, 'acct-sales-4000', ?, ?, ?, ?, ?)
      `);

  for (const invoice of legacyInvoices) {
    const lines = legacyLines.filter((line) => line.invoice_id === invoice.id);
    let subtotalMinor = 0;
    let taxMinor = 0;
    for (const line of lines) {
      const quantityMicros = Math.max(1, Math.round(line.quantity * 10_000));
      const netMinor = Math.round((line.rate_minor * quantityMicros) / 10_000);
      const rateBasisPoints = Math.round(line.tax_rate * 100);
      const lineTaxMinor = Math.round((netMinor * rateBasisPoints) / 10_000);
      const taxCodeId =
        rateBasisPoints === 0
          ? "tax-no-vat"
          : rateBasisPoints === 500
            ? "tax-uae-vat-5"
            : `tax-legacy-${rateBasisPoints}`;
      insertLine.run(
        line.id,
        line.invoice_id,
        line.description,
        quantityMicros,
        line.rate_minor,
        taxCodeId,
        netMinor,
        lineTaxMinor,
        netMinor + lineTaxMinor,
        line.position,
      );
      subtotalMinor += netMinor;
      taxMinor += lineTaxMinor;
    }
    insertInvoice.run(
      invoice.id,
      invoice.invoice_number,
      invoice.customer_id,
      invoice.invoice_date,
      invoice.due_date,
      invoice.reference,
      subtotalMinor,
      taxMinor,
      subtotalMinor + taxMinor,
      invoice.created_by,
      invoice.created_at,
      invoice.updated_at,
    );
  }

  sqlite.exec(`
    DROP TABLE "phase0_sales_invoice_lines";
    DROP TABLE "phase0_sales_invoices";
  `);
}

function upgradeToPhase2(sqlite: Database.Database) {
  const now = new Date().toISOString();
  sqlite.exec(`
    CREATE TABLE "suppliers" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "name" TEXT NOT NULL,
      "email" TEXT,
      "phone" TEXT,
      "tax_reference" TEXT,
      "address" TEXT,
      "notes" TEXT,
      "is_active" INTEGER NOT NULL DEFAULT 1,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );

    INSERT OR IGNORE INTO accounts
      (id, code, name, type, subtype, is_system, is_active, created_at, updated_at)
    VALUES
      ('acct-input-vat-2110', '2110', 'VAT Recoverable / Input VAT', 'asset', 'current_asset', 1, 1, '${now}', '${now}'),
      ('acct-purchases-6100', '6100', 'General Purchases / Expenses', 'expense', 'operating_expense', 1, 1, '${now}', '${now}');
    UPDATE accounts SET is_system = 1, updated_at = '${now}' WHERE id = 'acct-ap-2000';

    ALTER TABLE tax_codes ADD COLUMN purchase_tax_account_id TEXT REFERENCES accounts(id);
    UPDATE tax_codes
      SET purchase_tax_account_id = CASE WHEN rate_basis_points > 0 THEN 'acct-input-vat-2110' ELSE NULL END,
          updated_at = '${now}';

    ALTER TABLE business_accounting_settings RENAME TO phase1_business_accounting_settings;
    CREATE TABLE "business_accounting_settings" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "accounts_receivable_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "default_sales_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "default_bank_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "vat_output_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "accounts_payable_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "input_vat_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "default_purchase_expense_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "invoice_prefix" TEXT NOT NULL,
      "invoice_next_number" INTEGER NOT NULL CHECK (invoice_next_number > 0),
      "invoice_padding" INTEGER NOT NULL CHECK (invoice_padding BETWEEN 1 AND 10),
      "receipt_prefix" TEXT NOT NULL,
      "receipt_next_number" INTEGER NOT NULL CHECK (receipt_next_number > 0),
      "credit_note_prefix" TEXT NOT NULL,
      "credit_note_next_number" INTEGER NOT NULL CHECK (credit_note_next_number > 0),
      "purchase_order_prefix" TEXT NOT NULL,
      "purchase_order_next_number" INTEGER NOT NULL CHECK (purchase_order_next_number > 0),
      "purchase_invoice_prefix" TEXT NOT NULL,
      "purchase_invoice_next_number" INTEGER NOT NULL CHECK (purchase_invoice_next_number > 0),
      "supplier_payment_prefix" TEXT NOT NULL,
      "supplier_payment_next_number" INTEGER NOT NULL CHECK (supplier_payment_next_number > 0),
      "journal_prefix" TEXT NOT NULL,
      "journal_next_number" INTEGER NOT NULL CHECK (journal_next_number > 0),
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );
    INSERT INTO business_accounting_settings (
      id, accounts_receivable_account_id, default_sales_account_id, default_bank_account_id,
      vat_output_account_id, accounts_payable_account_id, input_vat_account_id,
      default_purchase_expense_account_id, invoice_prefix, invoice_next_number, invoice_padding,
      receipt_prefix, receipt_next_number, credit_note_prefix, credit_note_next_number,
      purchase_order_prefix, purchase_order_next_number, purchase_invoice_prefix,
      purchase_invoice_next_number, supplier_payment_prefix, supplier_payment_next_number,
      journal_prefix, journal_next_number, created_at, updated_at
    )
    SELECT id, accounts_receivable_account_id, default_sales_account_id, default_bank_account_id,
      vat_output_account_id, 'acct-ap-2000', 'acct-input-vat-2110', 'acct-purchases-6100',
      invoice_prefix, invoice_next_number, invoice_padding, receipt_prefix, receipt_next_number,
      'CN-', 1, 'PO-', 1, 'PI-', 1, 'PAY-', 1,
      journal_prefix, journal_next_number, created_at, '${now}'
    FROM phase1_business_accounting_settings;
    DROP TABLE phase1_business_accounting_settings;

    CREATE TABLE "purchase_orders" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "order_number" TEXT NOT NULL UNIQUE,
      "supplier_id" TEXT NOT NULL REFERENCES suppliers(id),
      "date" TEXT NOT NULL,
      "expected_date" TEXT,
      "reference" TEXT,
      "notes" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'closed', 'cancelled')),
      "subtotal_minor" INTEGER NOT NULL CHECK (subtotal_minor >= 0),
      "tax_minor" INTEGER NOT NULL CHECK (tax_minor >= 0),
      "total_minor" INTEGER NOT NULL CHECK (total_minor >= 0),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "issued_at" TEXT,
      "closed_at" TEXT,
      "cancelled_at" TEXT
    );
    CREATE INDEX purchase_order_supplier_idx ON purchase_orders(supplier_id);
    CREATE TABLE "purchase_order_lines" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "purchase_order_id" TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      "description" TEXT NOT NULL,
      "quantity_micros" INTEGER NOT NULL CHECK (quantity_micros > 0),
      "unit_price_minor" INTEGER NOT NULL CHECK (unit_price_minor >= 0),
      "expense_account_id" TEXT REFERENCES accounts(id),
      "tax_code_id" TEXT NOT NULL REFERENCES tax_codes(id),
      "net_amount_minor" INTEGER NOT NULL CHECK (net_amount_minor >= 0),
      "tax_amount_minor" INTEGER NOT NULL CHECK (tax_amount_minor >= 0),
      "gross_amount_minor" INTEGER NOT NULL CHECK (gross_amount_minor >= 0),
      "position" INTEGER NOT NULL
    );
    CREATE INDEX purchase_order_lines_order_idx ON purchase_order_lines(purchase_order_id);

    CREATE TABLE "purchase_invoices" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "internal_number" TEXT NOT NULL UNIQUE,
      "supplier_id" TEXT NOT NULL REFERENCES suppliers(id),
      "supplier_invoice_number" TEXT NOT NULL,
      "invoice_date" TEXT NOT NULL,
      "due_date" TEXT NOT NULL,
      "reference" TEXT,
      "purchase_order_id" TEXT REFERENCES purchase_orders(id),
      "document_status" TEXT NOT NULL DEFAULT 'draft' CHECK (document_status IN ('draft', 'posted', 'void')),
      "subtotal_minor" INTEGER NOT NULL CHECK (subtotal_minor >= 0),
      "tax_minor" INTEGER NOT NULL CHECK (tax_minor >= 0),
      "total_minor" INTEGER NOT NULL CHECK (total_minor >= 0),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "posted_at" TEXT,
      "voided_at" TEXT
    );
    CREATE INDEX purchase_invoice_supplier_idx ON purchase_invoices(supplier_id);
    CREATE INDEX purchase_invoice_order_idx ON purchase_invoices(purchase_order_id);
    CREATE TABLE "purchase_invoice_lines" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "purchase_invoice_id" TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      "description" TEXT NOT NULL,
      "quantity_micros" INTEGER NOT NULL CHECK (quantity_micros > 0),
      "unit_price_minor" INTEGER NOT NULL CHECK (unit_price_minor >= 0),
      "expense_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "tax_code_id" TEXT NOT NULL REFERENCES tax_codes(id),
      "net_amount_minor" INTEGER NOT NULL CHECK (net_amount_minor >= 0),
      "tax_amount_minor" INTEGER NOT NULL CHECK (tax_amount_minor >= 0),
      "gross_amount_minor" INTEGER NOT NULL CHECK (gross_amount_minor >= 0),
      "position" INTEGER NOT NULL
    );
    CREATE INDEX purchase_invoice_lines_invoice_idx ON purchase_invoice_lines(purchase_invoice_id);

    CREATE TABLE "supplier_payments" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "payment_number" TEXT NOT NULL UNIQUE,
      "supplier_id" TEXT NOT NULL REFERENCES suppliers(id),
      "date" TEXT NOT NULL,
      "bank_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "amount_minor" INTEGER NOT NULL CHECK (amount_minor > 0),
      "reference" TEXT,
      "description" TEXT,
      "document_status" TEXT NOT NULL DEFAULT 'posted' CHECK (document_status IN ('posted', 'void')),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "posted_at" TEXT NOT NULL,
      "voided_at" TEXT
    );
    CREATE INDEX supplier_payment_supplier_idx ON supplier_payments(supplier_id);
    CREATE TABLE "supplier_payment_allocations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "payment_id" TEXT NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
      "purchase_invoice_id" TEXT NOT NULL REFERENCES purchase_invoices(id),
      "amount_minor" INTEGER NOT NULL CHECK (amount_minor > 0),
      UNIQUE(payment_id, purchase_invoice_id)
    );
    CREATE INDEX supplier_payment_allocation_invoice_idx ON supplier_payment_allocations(purchase_invoice_id);

    CREATE TABLE "sales_credit_notes" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "credit_note_number" TEXT NOT NULL UNIQUE,
      "customer_id" TEXT NOT NULL REFERENCES customers(id),
      "source_invoice_id" TEXT NOT NULL REFERENCES sales_invoices(id),
      "date" TEXT NOT NULL,
      "reference" TEXT,
      "reason" TEXT,
      "document_status" TEXT NOT NULL DEFAULT 'draft' CHECK (document_status IN ('draft', 'posted', 'void')),
      "subtotal_minor" INTEGER NOT NULL CHECK (subtotal_minor >= 0),
      "tax_minor" INTEGER NOT NULL CHECK (tax_minor >= 0),
      "total_minor" INTEGER NOT NULL CHECK (total_minor >= 0),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "posted_at" TEXT,
      "voided_at" TEXT
    );
    CREATE INDEX sales_credit_note_customer_idx ON sales_credit_notes(customer_id);
    CREATE INDEX sales_credit_note_invoice_idx ON sales_credit_notes(source_invoice_id);
    CREATE TABLE "sales_credit_note_lines" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "credit_note_id" TEXT NOT NULL REFERENCES sales_credit_notes(id) ON DELETE CASCADE,
      "description" TEXT NOT NULL,
      "quantity_micros" INTEGER NOT NULL CHECK (quantity_micros > 0),
      "unit_price_minor" INTEGER NOT NULL CHECK (unit_price_minor >= 0),
      "sales_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "tax_code_id" TEXT NOT NULL REFERENCES tax_codes(id),
      "net_amount_minor" INTEGER NOT NULL CHECK (net_amount_minor >= 0),
      "tax_amount_minor" INTEGER NOT NULL CHECK (tax_amount_minor >= 0),
      "gross_amount_minor" INTEGER NOT NULL CHECK (gross_amount_minor >= 0),
      "position" INTEGER NOT NULL
    );
    CREATE INDEX sales_credit_note_lines_note_idx ON sales_credit_note_lines(credit_note_id);
    CREATE TABLE "sales_credit_note_allocations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "credit_note_id" TEXT NOT NULL REFERENCES sales_credit_notes(id) ON DELETE CASCADE,
      "sales_invoice_id" TEXT NOT NULL REFERENCES sales_invoices(id),
      "amount_minor" INTEGER NOT NULL CHECK (amount_minor > 0),
      UNIQUE(credit_note_id, sales_invoice_id)
    );
    CREATE INDEX sales_credit_note_allocation_invoice_idx ON sales_credit_note_allocations(sales_invoice_id);

    ALTER TABLE journal_lines ADD COLUMN supplier_id TEXT REFERENCES suppliers(id);
    CREATE INDEX journal_lines_supplier_idx ON journal_lines(supplier_id);
  `);
}

function upgradeToPhase3(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE "projects" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "code" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "customer_id" TEXT REFERENCES customers(id),
      "status" TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'on_hold', 'completed', 'cancelled')),
      "description" TEXT,
      "start_date" TEXT,
      "target_end_date" TEXT,
      "actual_end_date" TEXT,
      "budget_revenue_minor" INTEGER CHECK (budget_revenue_minor IS NULL OR budget_revenue_minor >= 0),
      "budget_cost_minor" INTEGER CHECK (budget_cost_minor IS NULL OR budget_cost_minor >= 0),
      "manager_name" TEXT,
      "is_active" INTEGER NOT NULL DEFAULT 1,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );
    CREATE INDEX project_customer_idx ON projects(customer_id);
    CREATE INDEX project_status_idx ON projects(status);

    CREATE TABLE "project_notes" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "project_id" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      "body" TEXT NOT NULL,
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT
    );
    CREATE INDEX project_notes_project_idx ON project_notes(project_id);

    CREATE TABLE "project_attachments" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "project_id" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      "original_name" TEXT NOT NULL,
      "storage_path" TEXT NOT NULL UNIQUE,
      "mime_type" TEXT NOT NULL,
      "size_bytes" INTEGER NOT NULL CHECK (size_bytes >= 0),
      "uploaded_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL
    );
    CREATE INDEX project_attachments_project_idx ON project_attachments(project_id);

    ALTER TABLE business_accounting_settings
      ADD COLUMN project_prefix TEXT NOT NULL DEFAULT 'PRJ-';
    ALTER TABLE business_accounting_settings
      ADD COLUMN project_next_number INTEGER NOT NULL DEFAULT 1 CHECK (project_next_number > 0);

    ALTER TABLE sales_invoices ADD COLUMN project_id TEXT REFERENCES projects(id);
    ALTER TABLE sales_invoice_lines ADD COLUMN project_id TEXT REFERENCES projects(id);
    ALTER TABLE sales_credit_notes ADD COLUMN project_id TEXT REFERENCES projects(id);
    ALTER TABLE sales_credit_note_lines ADD COLUMN project_id TEXT REFERENCES projects(id);
    ALTER TABLE purchase_orders ADD COLUMN project_id TEXT REFERENCES projects(id);
    ALTER TABLE purchase_order_lines ADD COLUMN project_id TEXT REFERENCES projects(id);
    ALTER TABLE purchase_invoices ADD COLUMN project_id TEXT REFERENCES projects(id);
    ALTER TABLE purchase_invoice_lines ADD COLUMN project_id TEXT REFERENCES projects(id);
    ALTER TABLE journal_lines ADD COLUMN project_id TEXT REFERENCES projects(id);

    CREATE INDEX sales_invoice_project_idx ON sales_invoices(project_id);
    CREATE INDEX sales_invoice_lines_project_idx ON sales_invoice_lines(project_id);
    CREATE INDEX sales_credit_note_project_idx ON sales_credit_notes(project_id);
    CREATE INDEX sales_credit_note_lines_project_idx ON sales_credit_note_lines(project_id);
    CREATE INDEX purchase_order_project_idx ON purchase_orders(project_id);
    CREATE INDEX purchase_order_lines_project_idx ON purchase_order_lines(project_id);
    CREATE INDEX purchase_invoice_project_idx ON purchase_invoices(project_id);
    CREATE INDEX purchase_invoice_lines_project_idx ON purchase_invoice_lines(project_id);
    CREATE INDEX journal_lines_project_idx ON journal_lines(project_id);
  `);
}

function upgradeToPhase4(sqlite: Database.Database) {
  const now = new Date().toISOString();
  sqlite.exec(`
    INSERT OR IGNORE INTO accounts
      (id, code, name, type, subtype, is_system, is_active, created_at, updated_at)
    VALUES
      ('acct-inventory-1210', '1210', 'Inventory Asset', 'asset', 'current_asset', 1, 1, '${now}', '${now}'),
      ('acct-inventory-adjustment-5010', '5010', 'Inventory Adjustments', 'expense', 'cost_of_sales', 1, 1, '${now}', '${now}');
    UPDATE accounts SET is_system = 1, updated_at = '${now}' WHERE id = 'acct-cost-sales-5000';

    ALTER TABLE business_accounting_settings
      ADD COLUMN goods_receipt_prefix TEXT NOT NULL DEFAULT 'GR-';
    ALTER TABLE business_accounting_settings
      ADD COLUMN goods_receipt_next_number INTEGER NOT NULL DEFAULT 1 CHECK (goods_receipt_next_number > 0);
    ALTER TABLE business_accounting_settings
      ADD COLUMN delivery_note_prefix TEXT NOT NULL DEFAULT 'DN-';
    ALTER TABLE business_accounting_settings
      ADD COLUMN delivery_note_next_number INTEGER NOT NULL DEFAULT 1 CHECK (delivery_note_next_number > 0);
    ALTER TABLE business_accounting_settings
      ADD COLUMN stock_adjustment_prefix TEXT NOT NULL DEFAULT 'SA-';
    ALTER TABLE business_accounting_settings
      ADD COLUMN stock_adjustment_next_number INTEGER NOT NULL DEFAULT 1 CHECK (stock_adjustment_next_number > 0);
    ALTER TABLE business_accounting_settings
      ADD COLUMN default_inventory_asset_account_id TEXT NOT NULL DEFAULT 'acct-inventory-1210' REFERENCES accounts(id);
    ALTER TABLE business_accounting_settings
      ADD COLUMN default_cost_of_sales_account_id TEXT NOT NULL DEFAULT 'acct-cost-sales-5000' REFERENCES accounts(id);
    ALTER TABLE business_accounting_settings
      ADD COLUMN inventory_adjustment_account_id TEXT NOT NULL DEFAULT 'acct-inventory-adjustment-5010' REFERENCES accounts(id);

    CREATE TABLE "inventory_items" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "sku" TEXT,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "unit_name" TEXT NOT NULL,
      "sales_price_minor" INTEGER CHECK (sales_price_minor IS NULL OR sales_price_minor >= 0),
      "purchase_price_minor" INTEGER CHECK (purchase_price_minor IS NULL OR purchase_price_minor >= 0),
      "sales_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "inventory_asset_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "cost_of_sales_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "is_active" INTEGER NOT NULL DEFAULT 1,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );
    CREATE UNIQUE INDEX inventory_item_sku_idx ON inventory_items(sku COLLATE NOCASE) WHERE sku IS NOT NULL;
    CREATE INDEX inventory_item_name_idx ON inventory_items(name);

    CREATE TABLE "inventory_locations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "code" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "address" TEXT,
      "is_default" INTEGER NOT NULL DEFAULT 0,
      "is_active" INTEGER NOT NULL DEFAULT 1,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );
    INSERT INTO inventory_locations
      (id, code, name, address, is_default, is_active, created_at, updated_at)
    VALUES ('location-main', 'MAIN', 'Main Warehouse', NULL, 1, 1, '${now}', '${now}');

    ALTER TABLE sales_invoice_lines ADD COLUMN item_id TEXT REFERENCES inventory_items(id);
    ALTER TABLE purchase_order_lines ADD COLUMN item_id TEXT REFERENCES inventory_items(id);
    ALTER TABLE purchase_invoice_lines ADD COLUMN item_id TEXT REFERENCES inventory_items(id);
    CREATE INDEX sales_invoice_lines_item_idx ON sales_invoice_lines(item_id);
    CREATE INDEX purchase_order_lines_item_idx ON purchase_order_lines(item_id);
    CREATE INDEX purchase_invoice_lines_item_idx ON purchase_invoice_lines(item_id);

    CREATE TABLE "goods_receipts" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "receipt_number" TEXT NOT NULL UNIQUE,
      "supplier_id" TEXT NOT NULL REFERENCES suppliers(id),
      "purchase_order_id" TEXT REFERENCES purchase_orders(id),
      "purchase_invoice_id" TEXT REFERENCES purchase_invoices(id),
      "date" TEXT NOT NULL,
      "location_id" TEXT NOT NULL REFERENCES inventory_locations(id),
      "reference" TEXT,
      "project_id" TEXT REFERENCES projects(id),
      "notes" TEXT,
      "document_status" TEXT NOT NULL DEFAULT 'draft' CHECK (document_status IN ('draft', 'posted', 'void')),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "posted_at" TEXT,
      "voided_at" TEXT
    );
    CREATE INDEX goods_receipt_supplier_idx ON goods_receipts(supplier_id);
    CREATE INDEX goods_receipt_order_idx ON goods_receipts(purchase_order_id);
    CREATE INDEX goods_receipt_invoice_idx ON goods_receipts(purchase_invoice_id);
    CREATE TABLE "goods_receipt_lines" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "goods_receipt_id" TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
      "item_id" TEXT NOT NULL REFERENCES inventory_items(id),
      "description" TEXT NOT NULL,
      "quantity_micros" INTEGER NOT NULL CHECK (quantity_micros > 0),
      "unit_cost_minor" INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
      "project_id" TEXT REFERENCES projects(id),
      "purchase_order_line_id" TEXT REFERENCES purchase_order_lines(id),
      "purchase_invoice_line_id" TEXT REFERENCES purchase_invoice_lines(id),
      "position" INTEGER NOT NULL
    );
    CREATE INDEX goods_receipt_lines_receipt_idx ON goods_receipt_lines(goods_receipt_id);
    CREATE INDEX goods_receipt_lines_order_line_idx ON goods_receipt_lines(purchase_order_line_id);

    CREATE TABLE "delivery_notes" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "delivery_number" TEXT NOT NULL UNIQUE,
      "customer_id" TEXT NOT NULL REFERENCES customers(id),
      "sales_invoice_id" TEXT REFERENCES sales_invoices(id),
      "date" TEXT NOT NULL,
      "location_id" TEXT NOT NULL REFERENCES inventory_locations(id),
      "reference" TEXT,
      "project_id" TEXT REFERENCES projects(id),
      "notes" TEXT,
      "document_status" TEXT NOT NULL DEFAULT 'draft' CHECK (document_status IN ('draft', 'posted', 'void')),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "posted_at" TEXT,
      "voided_at" TEXT
    );
    CREATE INDEX delivery_note_customer_idx ON delivery_notes(customer_id);
    CREATE INDEX delivery_note_invoice_idx ON delivery_notes(sales_invoice_id);
    CREATE TABLE "delivery_note_lines" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "delivery_note_id" TEXT NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
      "item_id" TEXT NOT NULL REFERENCES inventory_items(id),
      "description" TEXT NOT NULL,
      "quantity_micros" INTEGER NOT NULL CHECK (quantity_micros > 0),
      "project_id" TEXT REFERENCES projects(id),
      "sales_invoice_line_id" TEXT REFERENCES sales_invoice_lines(id),
      "position" INTEGER NOT NULL
    );
    CREATE INDEX delivery_note_lines_note_idx ON delivery_note_lines(delivery_note_id);
    CREATE INDEX delivery_note_lines_invoice_line_idx ON delivery_note_lines(sales_invoice_line_id);

    CREATE TABLE "stock_adjustments" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "adjustment_number" TEXT NOT NULL UNIQUE,
      "date" TEXT NOT NULL,
      "location_id" TEXT NOT NULL REFERENCES inventory_locations(id),
      "item_id" TEXT NOT NULL REFERENCES inventory_items(id),
      "quantity_delta_micros" INTEGER NOT NULL CHECK (quantity_delta_micros <> 0),
      "unit_cost_minor" INTEGER CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
      "reason" TEXT NOT NULL,
      "project_id" TEXT REFERENCES projects(id),
      "notes" TEXT,
      "document_status" TEXT NOT NULL DEFAULT 'draft' CHECK (document_status IN ('draft', 'posted', 'void')),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "posted_at" TEXT,
      "voided_at" TEXT
    );

    CREATE TABLE "inventory_movements" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "date" TEXT NOT NULL,
      "item_id" TEXT NOT NULL REFERENCES inventory_items(id),
      "location_id" TEXT NOT NULL REFERENCES inventory_locations(id),
      "movement_type" TEXT NOT NULL CHECK (movement_type IN ('goods_receipt', 'delivery', 'adjustment_in', 'adjustment_out', 'opening_balance')),
      "quantity_delta_micros" INTEGER NOT NULL CHECK (quantity_delta_micros <> 0),
      "unit_cost_micros" INTEGER NOT NULL CHECK (unit_cost_micros >= 0),
      "value_delta_minor" INTEGER NOT NULL,
      "source_type" TEXT NOT NULL,
      "source_id" TEXT NOT NULL,
      "source_line_id" TEXT,
      "project_id" TEXT REFERENCES projects(id),
      "description" TEXT,
      "created_at" TEXT NOT NULL
    );
    CREATE INDEX inventory_movement_item_location_idx ON inventory_movements(item_id, location_id);
    CREATE INDEX inventory_movement_source_idx ON inventory_movements(source_type, source_id);
    CREATE INDEX inventory_movement_date_idx ON inventory_movements(date);
    CREATE INDEX inventory_movement_project_idx ON inventory_movements(project_id);
  `);
}

function upgradeToPhase5(sqlite: Database.Database) {
  sqlite.exec(`
    ALTER TABLE business_accounting_settings
      ADD COLUMN bank_transaction_prefix TEXT NOT NULL DEFAULT 'BT-';
    ALTER TABLE business_accounting_settings
      ADD COLUMN bank_transaction_next_number INTEGER NOT NULL DEFAULT 1 CHECK (bank_transaction_next_number > 0);
    ALTER TABLE business_accounting_settings
      ADD COLUMN bank_transfer_prefix TEXT NOT NULL DEFAULT 'TRF-';
    ALTER TABLE business_accounting_settings
      ADD COLUMN bank_transfer_next_number INTEGER NOT NULL DEFAULT 1 CHECK (bank_transfer_next_number > 0);

    CREATE TABLE "bank_accounts" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "name" TEXT NOT NULL,
      "account_code" TEXT,
      "bank_name" TEXT,
      "account_number_masked" TEXT,
      "currency_code" TEXT NOT NULL CHECK (length(currency_code) = 3),
      "ledger_account_id" TEXT NOT NULL REFERENCES accounts(id),
      "is_cash_account" INTEGER NOT NULL DEFAULT 0,
      "is_active" INTEGER NOT NULL DEFAULT 1,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );
    CREATE UNIQUE INDEX bank_account_ledger_idx ON bank_accounts(ledger_account_id);
    CREATE INDEX bank_account_active_idx ON bank_accounts(is_active);

    CREATE TABLE "bank_statement_imports" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "bank_account_id" TEXT NOT NULL REFERENCES bank_accounts(id),
      "file_name" TEXT NOT NULL,
      "row_count" INTEGER NOT NULL CHECK (row_count > 0),
      "imported_count" INTEGER NOT NULL CHECK (imported_count >= 0),
      "duplicate_count" INTEGER NOT NULL CHECK (duplicate_count >= 0),
      "mapping_json" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'completed' CHECK (status = 'completed'),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL
    );
    CREATE INDEX bank_statement_import_account_idx ON bank_statement_imports(bank_account_id);

    CREATE TABLE "bank_statement_lines" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "import_id" TEXT NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
      "bank_account_id" TEXT NOT NULL REFERENCES bank_accounts(id),
      "transaction_date" TEXT NOT NULL,
      "value_date" TEXT,
      "description" TEXT NOT NULL,
      "reference" TEXT,
      "amount_minor" INTEGER NOT NULL CHECK (amount_minor <> 0),
      "external_id" TEXT,
      "fingerprint" TEXT NOT NULL,
      "match_status" TEXT NOT NULL DEFAULT 'unmatched'
        CHECK (match_status IN ('unmatched', 'matched', 'created', 'ignored')),
      "matched_source_type" TEXT,
      "matched_source_id" TEXT,
      "created_at" TEXT NOT NULL,
      CHECK (
        (match_status IN ('matched', 'created') AND matched_source_type IS NOT NULL AND matched_source_id IS NOT NULL)
        OR (match_status IN ('unmatched', 'ignored') AND matched_source_type IS NULL AND matched_source_id IS NULL)
      )
    );
    CREATE UNIQUE INDEX bank_statement_line_fingerprint_idx
      ON bank_statement_lines(bank_account_id, fingerprint);
    CREATE INDEX bank_statement_line_account_status_idx
      ON bank_statement_lines(bank_account_id, match_status);
    CREATE INDEX bank_statement_line_source_idx
      ON bank_statement_lines(matched_source_type, matched_source_id);

    CREATE TABLE "bank_transactions" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "transaction_number" TEXT NOT NULL UNIQUE,
      "bank_account_id" TEXT NOT NULL REFERENCES bank_accounts(id),
      "date" TEXT NOT NULL,
      "type" TEXT NOT NULL CHECK (type IN ('money_in', 'money_out')),
      "reference" TEXT,
      "description" TEXT NOT NULL,
      "total_minor" INTEGER NOT NULL CHECK (total_minor > 0),
      "statement_line_id" TEXT REFERENCES bank_statement_lines(id),
      "document_status" TEXT NOT NULL DEFAULT 'draft'
        CHECK (document_status IN ('draft', 'posted', 'void')),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "posted_at" TEXT,
      "voided_at" TEXT
    );
    CREATE UNIQUE INDEX bank_transaction_number_idx ON bank_transactions(transaction_number);
    CREATE UNIQUE INDEX bank_transaction_statement_line_idx
      ON bank_transactions(statement_line_id) WHERE statement_line_id IS NOT NULL;
    CREATE INDEX bank_transaction_account_idx ON bank_transactions(bank_account_id);

    CREATE TABLE "bank_transaction_lines" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "bank_transaction_id" TEXT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
      "account_id" TEXT NOT NULL REFERENCES accounts(id),
      "tax_code_id" TEXT REFERENCES tax_codes(id),
      "project_id" TEXT REFERENCES projects(id),
      "description" TEXT NOT NULL,
      "net_amount_minor" INTEGER NOT NULL CHECK (net_amount_minor > 0),
      "tax_amount_minor" INTEGER NOT NULL CHECK (tax_amount_minor >= 0),
      "gross_amount_minor" INTEGER NOT NULL CHECK (gross_amount_minor > 0),
      "position" INTEGER NOT NULL,
      CHECK (gross_amount_minor = net_amount_minor + tax_amount_minor)
    );
    CREATE INDEX bank_transaction_line_transaction_idx
      ON bank_transaction_lines(bank_transaction_id);
    CREATE INDEX bank_transaction_line_project_idx ON bank_transaction_lines(project_id);

    CREATE TABLE "bank_transfers" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "transfer_number" TEXT NOT NULL UNIQUE,
      "from_bank_account_id" TEXT NOT NULL REFERENCES bank_accounts(id),
      "to_bank_account_id" TEXT NOT NULL REFERENCES bank_accounts(id),
      "date" TEXT NOT NULL,
      "amount_minor" INTEGER NOT NULL CHECK (amount_minor > 0),
      "reference" TEXT,
      "description" TEXT,
      "document_status" TEXT NOT NULL DEFAULT 'posted'
        CHECK (document_status IN ('posted', 'void')),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "posted_at" TEXT NOT NULL,
      "voided_at" TEXT,
      CHECK (from_bank_account_id <> to_bank_account_id)
    );
    CREATE UNIQUE INDEX bank_transfer_number_idx ON bank_transfers(transfer_number);
    CREATE INDEX bank_transfer_from_idx ON bank_transfers(from_bank_account_id);
    CREATE INDEX bank_transfer_to_idx ON bank_transfers(to_bank_account_id);

    CREATE TABLE "bank_reconciliations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "bank_account_id" TEXT NOT NULL REFERENCES bank_accounts(id),
      "statement_date" TEXT NOT NULL,
      "statement_ending_balance_minor" INTEGER NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
      "created_by" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "completed_at" TEXT
    );
    CREATE INDEX bank_reconciliation_account_date_idx
      ON bank_reconciliations(bank_account_id, statement_date);

    CREATE TABLE "bank_reconciliation_items" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "reconciliation_id" TEXT NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
      "statement_line_id" TEXT NOT NULL REFERENCES bank_statement_lines(id),
      "journal_entry_id" TEXT NOT NULL REFERENCES journal_entries(id),
      "created_at" TEXT NOT NULL
    );
    CREATE UNIQUE INDEX bank_reconciliation_statement_line_idx
      ON bank_reconciliation_items(statement_line_id);
    CREATE INDEX bank_reconciliation_item_reconciliation_idx
      ON bank_reconciliation_items(reconciliation_id);
    CREATE INDEX bank_reconciliation_item_journal_idx
      ON bank_reconciliation_items(journal_entry_id);
  `);
}

function upgradeToPhase6(sqlite: Database.Database) {
  const now = new Date().toISOString();
  sqlite.exec(`
    ALTER TABLE tax_codes ADD COLUMN direction TEXT NOT NULL DEFAULT 'both'
      CHECK (direction IN ('sales', 'purchases', 'both'));
    ALTER TABLE tax_codes ADD COLUMN vat_category TEXT
      CHECK (vat_category IS NULL OR vat_category IN ('standard', 'zero_rated', 'exempt', 'out_of_scope', 'reverse_charge', 'import'));
    ALTER TABLE tax_codes ADD COLUMN is_recoverable INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE sales_invoices ADD COLUMN tax_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE sales_invoices ADD COLUMN supply_emirate TEXT
      CHECK (supply_emirate IS NULL OR supply_emirate IN ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah'));
    UPDATE sales_invoices SET tax_date = invoice_date WHERE tax_date = '';

    ALTER TABLE sales_credit_notes ADD COLUMN tax_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE sales_credit_notes ADD COLUMN supply_emirate TEXT
      CHECK (supply_emirate IS NULL OR supply_emirate IN ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah'));
    UPDATE sales_credit_notes SET tax_date = date WHERE tax_date = '';

    ALTER TABLE purchase_invoices ADD COLUMN tax_date TEXT NOT NULL DEFAULT '';
    UPDATE purchase_invoices SET tax_date = invoice_date WHERE tax_date = '';

    ALTER TABLE bank_transactions ADD COLUMN tax_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE bank_transactions ADD COLUMN supply_emirate TEXT
      CHECK (supply_emirate IS NULL OR supply_emirate IN ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah'));
    UPDATE bank_transactions SET tax_date = date WHERE tax_date = '';

    CREATE TABLE business_tax_settings (
      id TEXT PRIMARY KEY NOT NULL,
      vat_registered INTEGER NOT NULL DEFAULT 0,
      trn TEXT,
      vat_registration_effective_date TEXT,
      vat_deregistration_date TEXT,
      default_supply_emirate TEXT
        CHECK (default_supply_emirate IS NULL OR default_supply_emirate IN ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah')),
      tax_lock_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO business_tax_settings (
      id, vat_registered, trn, vat_registration_effective_date,
      vat_deregistration_date, default_supply_emirate, tax_lock_date, created_at, updated_at
    ) VALUES ('default', 0, NULL, NULL, NULL, NULL, NULL, '${now}', '${now}');

    CREATE TABLE vat_periods (
      id TEXT PRIMARY KEY NOT NULL,
      period_reference TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      filing_due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'prepared', 'finalized', 'filed_externally', 'reopened')),
      finalized_at TEXT,
      finalized_by TEXT,
      filed_at TEXT,
      filed_by TEXT,
      filing_reference TEXT,
      reopened_at TEXT,
      reopened_by TEXT,
      reopen_reason TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (start_date <= end_date)
    );
    CREATE INDEX vat_period_date_idx ON vat_periods(start_date, end_date);
    CREATE INDEX vat_period_status_idx ON vat_periods(status);
    CREATE UNIQUE INDEX vat_period_reference_idx ON vat_periods(period_reference);

    CREATE TABLE tax_entries (
      id TEXT PRIMARY KEY NOT NULL,
      tax_date TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_line_id TEXT NOT NULL,
      source_number TEXT NOT NULL,
      party_name TEXT,
      tax_code_id TEXT NOT NULL REFERENCES tax_codes(id),
      tax_code_name TEXT NOT NULL,
      rate_basis_points INTEGER NOT NULL,
      vat_category TEXT NOT NULL
        CHECK (vat_category IN ('standard', 'zero_rated', 'exempt', 'out_of_scope', 'reverse_charge', 'import')),
      direction TEXT NOT NULL CHECK (direction IN ('sales', 'purchases')),
      net_amount_minor INTEGER NOT NULL,
      vat_amount_minor INTEGER NOT NULL,
      output_vat_minor INTEGER NOT NULL DEFAULT 0,
      recoverable_vat_minor INTEGER NOT NULL DEFAULT 0,
      supply_emirate TEXT
        CHECK (supply_emirate IS NULL OR supply_emirate IN ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah')),
      project_id TEXT REFERENCES projects(id),
      created_at TEXT NOT NULL,
      UNIQUE (source_type, source_id, source_line_id)
    );
    CREATE INDEX tax_entry_date_idx ON tax_entries(tax_date);
    CREATE INDEX tax_entry_source_idx ON tax_entries(source_type, source_id);
    CREATE INDEX tax_entry_bucket_idx ON tax_entries(direction, vat_category, tax_date);
    CREATE INDEX tax_entry_emirate_idx ON tax_entries(supply_emirate, tax_date);
    CREATE INDEX tax_entry_tax_code_idx ON tax_entries(tax_code_id);
    CREATE UNIQUE INDEX tax_entry_source_line_idx ON tax_entries(source_type, source_id, source_line_id);

    CREATE TABLE vat_adjustments (
      id TEXT PRIMARY KEY NOT NULL,
      period_id TEXT NOT NULL REFERENCES vat_periods(id) ON DELETE CASCADE,
      report_bucket TEXT NOT NULL,
      amount_minor INTEGER NOT NULL DEFAULT 0,
      vat_amount_minor INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      reference TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX vat_adjustment_period_idx ON vat_adjustments(period_id);

    CREATE TABLE vat_period_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      period_id TEXT NOT NULL REFERENCES vat_periods(id) ON DELETE CASCADE,
      snapshot_kind TEXT NOT NULL CHECK (snapshot_kind IN ('finalized', 'filed_externally')),
      snapshot_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX vat_snapshot_period_idx ON vat_period_snapshots(period_id, created_at);

    CREATE TABLE vat_period_audit (
      id TEXT PRIMARY KEY NOT NULL,
      period_id TEXT NOT NULL REFERENCES vat_periods(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('created', 'prepared', 'finalized', 'reopened', 'filed_externally', 'adjustment_added')),
      reason_or_reference TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX vat_period_audit_period_idx ON vat_period_audit(period_id, created_at);

    CREATE TABLE vat_data_review (
      id TEXT PRIMARY KEY NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_line_id TEXT NOT NULL,
      tax_date TEXT NOT NULL,
      issue_type TEXT NOT NULL CHECK (issue_type IN ('ambiguous_zero_rate', 'missing_emirate', 'missing_classification')),
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (source_type, source_id, source_line_id, issue_type)
    );
    CREATE INDEX vat_data_review_date_idx ON vat_data_review(tax_date, status);
    CREATE INDEX vat_data_review_source_idx ON vat_data_review(source_type, source_id);
    CREATE UNIQUE INDEX vat_data_review_source_issue_idx
      ON vat_data_review(source_type, source_id, source_line_id, issue_type);

    UPDATE tax_codes
      SET direction = 'both',
          vat_category = CASE WHEN rate_basis_points > 0 THEN 'standard' ELSE vat_category END,
          is_recoverable = CASE WHEN rate_basis_points > 0 AND purchase_tax_account_id IS NOT NULL THEN 1 ELSE 0 END,
          updated_at = '${now}';
    UPDATE tax_codes
      SET vat_category = 'out_of_scope', direction = 'both', is_recoverable = 0, updated_at = '${now}'
      WHERE id = 'tax-no-vat';

    INSERT OR IGNORE INTO tax_codes (
      id, name, rate_basis_points, sales_tax_account_id, purchase_tax_account_id,
      is_active, created_at, updated_at, direction, vat_category, is_recoverable
    ) VALUES
      ('tax-uae-vat-5-sales', 'UAE VAT 5% Sales', 500, 'acct-vat-payable-2100', NULL, 1, '${now}', '${now}', 'sales', 'standard', 0),
      ('tax-uae-vat-5-purchases', 'UAE VAT 5% Purchases', 500, NULL, 'acct-input-vat-2110', 1, '${now}', '${now}', 'purchases', 'standard', 1),
      ('tax-zero-rated-sales', 'Zero Rated', 0, NULL, NULL, 1, '${now}', '${now}', 'sales', 'zero_rated', 0),
      ('tax-exempt-sales', 'Exempt', 0, NULL, NULL, 1, '${now}', '${now}', 'sales', 'exempt', 0),
      ('tax-out-of-scope', 'Out of Scope', 0, NULL, NULL, 1, '${now}', '${now}', 'both', 'out_of_scope', 0),
      ('tax-reverse-charge-purchases', 'Reverse Charge 5% Purchases', 500, 'acct-vat-payable-2100', 'acct-input-vat-2110', 1, '${now}', '${now}', 'purchases', 'reverse_charge', 1),
      ('tax-import-vat-purchases', 'Import VAT 5% Purchases', 500, NULL, 'acct-input-vat-2110', 1, '${now}', '${now}', 'purchases', 'import', 1);

    INSERT INTO tax_entries (
      id, tax_date, source_type, source_id, source_line_id, source_number, party_name,
      tax_code_id, tax_code_name, rate_basis_points, vat_category, direction,
      net_amount_minor, vat_amount_minor, output_vat_minor, recoverable_vat_minor,
      supply_emirate, project_id, created_at
    )
    SELECT lower(hex(randomblob(16))), si.invoice_date, 'sales_invoice', si.id, sil.id,
      si.invoice_number, c.name, tc.id, tc.name, tc.rate_basis_points, 'standard', 'sales',
      sil.net_amount_minor, sil.tax_amount_minor, sil.tax_amount_minor, 0, NULL,
      COALESCE(sil.project_id, si.project_id), '${now}'
    FROM sales_invoices si
    INNER JOIN sales_invoice_lines sil ON sil.invoice_id = si.id
    INNER JOIN tax_codes tc ON tc.id = sil.tax_code_id
    INNER JOIN customers c ON c.id = si.customer_id
    WHERE si.document_status = 'posted' AND tc.rate_basis_points > 0;

    INSERT INTO tax_entries (
      id, tax_date, source_type, source_id, source_line_id, source_number, party_name,
      tax_code_id, tax_code_name, rate_basis_points, vat_category, direction,
      net_amount_minor, vat_amount_minor, output_vat_minor, recoverable_vat_minor,
      supply_emirate, project_id, created_at
    )
    SELECT lower(hex(randomblob(16))), scn.date, 'sales_credit_note', scn.id, scnl.id,
      scn.credit_note_number, c.name, tc.id, tc.name, tc.rate_basis_points, 'standard', 'sales',
      -scnl.net_amount_minor, -scnl.tax_amount_minor, -scnl.tax_amount_minor, 0, NULL,
      COALESCE(scnl.project_id, scn.project_id), '${now}'
    FROM sales_credit_notes scn
    INNER JOIN sales_credit_note_lines scnl ON scnl.credit_note_id = scn.id
    INNER JOIN tax_codes tc ON tc.id = scnl.tax_code_id
    INNER JOIN customers c ON c.id = scn.customer_id
    WHERE scn.document_status = 'posted' AND tc.rate_basis_points > 0;

    INSERT INTO tax_entries (
      id, tax_date, source_type, source_id, source_line_id, source_number, party_name,
      tax_code_id, tax_code_name, rate_basis_points, vat_category, direction,
      net_amount_minor, vat_amount_minor, output_vat_minor, recoverable_vat_minor,
      supply_emirate, project_id, created_at
    )
    SELECT lower(hex(randomblob(16))), pi.invoice_date, 'purchase_invoice', pi.id, pil.id,
      pi.internal_number, s.name, tc.id, tc.name, tc.rate_basis_points, 'standard', 'purchases',
      pil.net_amount_minor, pil.tax_amount_minor, 0, pil.tax_amount_minor, NULL,
      COALESCE(pil.project_id, pi.project_id), '${now}'
    FROM purchase_invoices pi
    INNER JOIN purchase_invoice_lines pil ON pil.purchase_invoice_id = pi.id
    INNER JOIN tax_codes tc ON tc.id = pil.tax_code_id
    INNER JOIN suppliers s ON s.id = pi.supplier_id
    WHERE pi.document_status = 'posted' AND tc.rate_basis_points > 0;

    INSERT INTO tax_entries (
      id, tax_date, source_type, source_id, source_line_id, source_number, party_name,
      tax_code_id, tax_code_name, rate_basis_points, vat_category, direction,
      net_amount_minor, vat_amount_minor, output_vat_minor, recoverable_vat_minor,
      supply_emirate, project_id, created_at
    )
    SELECT lower(hex(randomblob(16))), bt.date, 'bank_transaction', bt.id, btl.id,
      bt.transaction_number, NULL, tc.id, tc.name, tc.rate_basis_points, 'standard',
      CASE WHEN bt.type = 'money_in' THEN 'sales' ELSE 'purchases' END,
      btl.net_amount_minor, btl.tax_amount_minor,
      CASE WHEN bt.type = 'money_in' THEN btl.tax_amount_minor ELSE 0 END,
      CASE WHEN bt.type = 'money_out' THEN btl.tax_amount_minor ELSE 0 END,
      NULL, btl.project_id, '${now}'
    FROM bank_transactions bt
    INNER JOIN bank_transaction_lines btl ON btl.bank_transaction_id = bt.id
    INNER JOIN tax_codes tc ON tc.id = btl.tax_code_id
    WHERE bt.document_status = 'posted' AND tc.rate_basis_points > 0;

    INSERT OR IGNORE INTO vat_data_review (
      id, source_type, source_id, source_line_id, tax_date, issue_type, details, status, created_at
    )
    SELECT lower(hex(randomblob(16))), 'sales_invoice', si.id, sil.id, si.invoice_date,
      'ambiguous_zero_rate', 'Historical 0% Sales Invoice line requires Zero Rated, Exempt, or Out-of-Scope classification.', 'open', '${now}'
    FROM sales_invoices si INNER JOIN sales_invoice_lines sil ON sil.invoice_id = si.id
    INNER JOIN tax_codes tc ON tc.id = sil.tax_code_id
    WHERE si.document_status = 'posted' AND tc.rate_basis_points = 0;
    INSERT OR IGNORE INTO vat_data_review (
      id, source_type, source_id, source_line_id, tax_date, issue_type, details, status, created_at
    )
    SELECT lower(hex(randomblob(16))), 'sales_credit_note', scn.id, scnl.id, scn.date,
      'ambiguous_zero_rate', 'Historical 0% Sales Credit Note line requires Zero Rated, Exempt, or Out-of-Scope classification.', 'open', '${now}'
    FROM sales_credit_notes scn INNER JOIN sales_credit_note_lines scnl ON scnl.credit_note_id = scn.id
    INNER JOIN tax_codes tc ON tc.id = scnl.tax_code_id
    WHERE scn.document_status = 'posted' AND tc.rate_basis_points = 0;
    INSERT OR IGNORE INTO vat_data_review (
      id, source_type, source_id, source_line_id, tax_date, issue_type, details, status, created_at
    )
    SELECT lower(hex(randomblob(16))), 'purchase_invoice', pi.id, pil.id, pi.invoice_date,
      'ambiguous_zero_rate', 'Historical 0% Purchase Invoice line requires Exempt, Out-of-Scope, or another supported classification.', 'open', '${now}'
    FROM purchase_invoices pi INNER JOIN purchase_invoice_lines pil ON pil.purchase_invoice_id = pi.id
    INNER JOIN tax_codes tc ON tc.id = pil.tax_code_id
    WHERE pi.document_status = 'posted' AND tc.rate_basis_points = 0;
    INSERT OR IGNORE INTO vat_data_review (
      id, source_type, source_id, source_line_id, tax_date, issue_type, details, status, created_at
    )
    SELECT lower(hex(randomblob(16))), 'bank_transaction', bt.id, btl.id, bt.date,
      'ambiguous_zero_rate', 'Historical 0% Bank Transaction line requires an explicit VAT classification.', 'open', '${now}'
    FROM bank_transactions bt INNER JOIN bank_transaction_lines btl ON btl.bank_transaction_id = bt.id
    INNER JOIN tax_codes tc ON tc.id = btl.tax_code_id
    WHERE bt.document_status = 'posted' AND tc.rate_basis_points = 0;

    INSERT OR IGNORE INTO vat_data_review (
      id, source_type, source_id, source_line_id, tax_date, issue_type, details, status, created_at
    )
    SELECT lower(hex(randomblob(16))), source_type, source_id, source_line_id, tax_date,
      'missing_emirate', 'Historical standard-rated Sale has no reviewed supply Emirate.', 'open', '${now}'
    FROM tax_entries
    WHERE direction = 'sales' AND vat_category = 'standard' AND supply_emirate IS NULL;
  `);
}

function upgradeToPhase7(sqlite: Database.Database) {
  const now = new Date().toISOString();
  sqlite.exec(`
    ALTER TABLE customers ADD COLUMN legal_name TEXT;
    ALTER TABLE customers ADD COLUMN trn TEXT;
    ALTER TABLE customers ADD COLUMN legal_registration_identifier TEXT;
    ALTER TABLE customers ADD COLUMN electronic_address TEXT;
    ALTER TABLE customers ADD COLUMN electronic_address_scheme TEXT;
    ALTER TABLE customers ADD COLUMN address_line_1 TEXT;
    ALTER TABLE customers ADD COLUMN city TEXT;
    ALTER TABLE customers ADD COLUMN country_subdivision TEXT;
    ALTER TABLE customers ADD COLUMN country_code TEXT;
    ALTER TABLE customers ADD COLUMN buyer_reference TEXT;

    ALTER TABLE sales_invoices ADD COLUMN einvoice_transaction_flags_json TEXT NOT NULL
      DEFAULT '{"freeTradeZone":false,"deemedSupply":false,"marginScheme":false,"summaryInvoice":false,"continuousSupply":false,"agentBilling":false,"eCommerce":false,"export":false}';

    ALTER TABLE sales_credit_notes ADD COLUMN einvoice_reason_code TEXT;
    ALTER TABLE sales_credit_notes ADD COLUMN einvoice_transaction_flags_json TEXT NOT NULL
      DEFAULT '{"freeTradeZone":false,"deemedSupply":false,"marginScheme":false,"summaryInvoice":false,"continuousSupply":false,"agentBilling":false,"eCommerce":false,"export":false}';

    CREATE TABLE business_einvoice_settings (
      id TEXT PRIMARY KEY NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      legal_name TEXT,
      legal_registration_identifier TEXT,
      address_line_1 TEXT,
      city TEXT,
      country_subdivision TEXT,
      country_code TEXT NOT NULL DEFAULT 'AE',
      participant_identifier TEXT,
      participant_identifier_scheme TEXT,
      endpoint_identifier TEXT,
      endpoint_identifier_scheme TEXT,
      asp_provider_key TEXT,
      asp_environment TEXT NOT NULL DEFAULT 'disabled'
        CHECK (asp_environment IN ('disabled', 'mock', 'sandbox', 'production')),
      specification_version TEXT NOT NULL DEFAULT '1.0.4',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO business_einvoice_settings (
      id, enabled, country_code, asp_environment, specification_version, created_at, updated_at
    ) VALUES ('default', 0, 'AE', 'disabled', '1.0.4', '${now}', '${now}');

    CREATE TABLE einvoice_documents (
      id TEXT PRIMARY KEY NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('sales_invoice', 'sales_credit_note')),
      source_id TEXT NOT NULL,
      document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'credit_note')),
      uuid TEXT NOT NULL,
      specification_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NotPrepared'
        CHECK (status IN ('NotPrepared', 'NeedsData', 'ValidationFailed', 'Ready', 'Submitted', 'Accepted', 'Rejected')),
      canonical_json TEXT,
      xml_payload TEXT,
      payload_hash TEXT,
      validation_json TEXT,
      provider_key TEXT,
      provider_environment TEXT,
      exchange_status TEXT,
      reporting_status TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      validated_at TEXT,
      submitted_at TEXT,
      accepted_at TEXT,
      rejected_at TEXT
    );
    CREATE UNIQUE INDEX einvoice_document_source_idx
      ON einvoice_documents(source_type, source_id);
    CREATE UNIQUE INDEX einvoice_document_uuid_idx ON einvoice_documents(uuid);
    CREATE INDEX einvoice_document_status_idx ON einvoice_documents(status, updated_at);

    CREATE TABLE einvoice_submissions (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL REFERENCES einvoice_documents(id) ON DELETE CASCADE,
      provider_key TEXT NOT NULL,
      provider_environment TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Submitted', 'Accepted', 'Rejected', 'Failed')),
      provider_request_id TEXT,
      exchange_status TEXT,
      reporting_status TEXT,
      response_code TEXT,
      response_payload TEXT,
      error_message TEXT,
      submitted_at TEXT NOT NULL,
      responded_at TEXT,
      created_at TEXT NOT NULL,
      CHECK (attempt_number > 0)
    );
    CREATE UNIQUE INDEX einvoice_submission_attempt_idx
      ON einvoice_submissions(document_id, attempt_number);
    CREATE INDEX einvoice_submission_document_idx
      ON einvoice_submissions(document_id, created_at);
  `);
}

function upgradeToPhase8(sqlite: Database.Database) {
  sqlite.exec(`
    ALTER TABLE suppliers ADD COLUMN legal_name TEXT;
    ALTER TABLE suppliers ADD COLUMN trn TEXT;
    ALTER TABLE suppliers ADD COLUMN legal_registration_identifier TEXT;
    ALTER TABLE suppliers ADD COLUMN electronic_address TEXT;
    ALTER TABLE suppliers ADD COLUMN electronic_address_scheme TEXT;
    ALTER TABLE suppliers ADD COLUMN registered_address TEXT;
    ALTER TABLE suppliers ADD COLUMN country_code TEXT;

    CREATE INDEX supplier_einvoice_endpoint_idx
      ON suppliers(electronic_address_scheme, electronic_address)
      WHERE electronic_address IS NOT NULL;
    CREATE INDEX supplier_einvoice_trn_idx ON suppliers(trn) WHERE trn IS NOT NULL;
    CREATE INDEX supplier_einvoice_registration_idx
      ON suppliers(legal_registration_identifier)
      WHERE legal_registration_identifier IS NOT NULL;

    CREATE TABLE inbound_einvoice_documents (
      id TEXT PRIMARY KEY NOT NULL,
      provider_key TEXT NOT NULL,
      environment TEXT NOT NULL,
      provider_document_id TEXT,
      document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'credit_note')),
      specification_version TEXT NOT NULL,
      document_uuid TEXT NOT NULL,
      seller_endpoint_id TEXT,
      seller_endpoint_scheme TEXT,
      seller_trn TEXT,
      seller_legal_registration_identifier TEXT,
      seller_legal_name TEXT NOT NULL,
      buyer_endpoint_id TEXT,
      buyer_endpoint_scheme TEXT,
      buyer_trn TEXT,
      buyer_legal_registration_identifier TEXT,
      buyer_legal_name TEXT,
      document_number TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      tax_date TEXT,
      due_date TEXT,
      currency_code TEXT NOT NULL,
      source_invoice_reference TEXT,
      status TEXT NOT NULL DEFAULT 'Received' CHECK (status IN (
        'Received', 'ValidationFailed', 'Validated', 'NeedsSupplier', 'NeedsReview',
        'ReadyForDraft', 'DraftCreated', 'Processed', 'Rejected', 'Archived'
      )),
      network_status TEXT,
      raw_xml TEXT NOT NULL,
      raw_hash TEXT NOT NULL,
      canonical_json TEXT NOT NULL,
      validation_result_json TEXT,
      subtotal_minor INTEGER NOT NULL,
      allowance_total_minor INTEGER NOT NULL DEFAULT 0,
      charge_total_minor INTEGER NOT NULL DEFAULT 0,
      tax_minor INTEGER NOT NULL,
      total_minor INTEGER NOT NULL,
      amount_due_minor INTEGER NOT NULL,
      buyer_identity_verified INTEGER NOT NULL DEFAULT 0,
      supplier_id TEXT REFERENCES suppliers(id),
      purchase_order_id TEXT REFERENCES purchase_orders(id),
      goods_receipt_id TEXT REFERENCES goods_receipts(id),
      purchase_invoice_id TEXT REFERENCES purchase_invoices(id) ON DELETE SET NULL,
      duplicate_of_id TEXT REFERENCES inbound_einvoice_documents(id),
      duplicate_kind TEXT CHECK (duplicate_kind IN ('hard', 'likely')),
      last_error TEXT,
      rejection_reason TEXT,
      received_at TEXT NOT NULL,
      validated_at TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      archived_at TEXT
    );
    CREATE UNIQUE INDEX inbound_einvoice_provider_document_idx
      ON inbound_einvoice_documents(provider_key, environment, provider_document_id)
      WHERE provider_document_id IS NOT NULL;
    CREATE UNIQUE INDEX inbound_einvoice_raw_hash_idx ON inbound_einvoice_documents(raw_hash);
    CREATE UNIQUE INDEX inbound_einvoice_uuid_seller_idx
      ON inbound_einvoice_documents(
        document_uuid,
        COALESCE(seller_endpoint_scheme, ''),
        COALESCE(seller_endpoint_id, ''),
        COALESCE(seller_trn, ''),
        COALESCE(seller_legal_registration_identifier, '')
      );
    CREATE INDEX inbound_einvoice_status_received_idx
      ON inbound_einvoice_documents(status, received_at);
    CREATE INDEX inbound_einvoice_supplier_number_idx
      ON inbound_einvoice_documents(supplier_id, document_number);
    CREATE INDEX inbound_einvoice_purchase_order_idx
      ON inbound_einvoice_documents(purchase_order_id);
    CREATE INDEX inbound_einvoice_goods_receipt_idx
      ON inbound_einvoice_documents(goods_receipt_id);
    CREATE INDEX inbound_einvoice_purchase_invoice_idx
      ON inbound_einvoice_documents(purchase_invoice_id);

    CREATE TABLE inbound_einvoice_lines (
      id TEXT PRIMARY KEY NOT NULL,
      inbound_document_id TEXT NOT NULL REFERENCES inbound_einvoice_documents(id) ON DELETE CASCADE,
      source_line_id TEXT NOT NULL,
      order_line_reference TEXT,
      supplier_item_identifier TEXT,
      erp_item_identifier TEXT,
      description TEXT NOT NULL,
      item_name TEXT,
      quantity_micros INTEGER NOT NULL CHECK (quantity_micros > 0),
      unit_code TEXT NOT NULL,
      unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
      net_amount_minor INTEGER NOT NULL CHECK (net_amount_minor >= 0),
      tax_amount_minor INTEGER NOT NULL CHECK (tax_amount_minor >= 0),
      gross_amount_minor INTEGER NOT NULL CHECK (gross_amount_minor >= 0),
      tax_category TEXT NOT NULL,
      tax_rate_basis_points INTEGER NOT NULL CHECK (tax_rate_basis_points >= 0),
      match_status TEXT NOT NULL DEFAULT 'Unmatched'
        CHECK (match_status IN ('Matched', 'Possible Match', 'Unmatched')),
      purchase_order_line_id TEXT REFERENCES purchase_order_lines(id),
      item_id TEXT REFERENCES inventory_items(id),
      expense_account_id TEXT REFERENCES accounts(id),
      tax_code_id TEXT REFERENCES tax_codes(id),
      project_id TEXT REFERENCES projects(id),
      position INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX inbound_einvoice_line_position_idx
      ON inbound_einvoice_lines(inbound_document_id, position);
    CREATE INDEX inbound_einvoice_line_order_idx
      ON inbound_einvoice_lines(purchase_order_line_id);
    CREATE INDEX inbound_einvoice_line_item_idx ON inbound_einvoice_lines(item_id);

    CREATE TABLE supplier_einvoice_identities (
      id TEXT PRIMARY KEY NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      identity_type TEXT NOT NULL CHECK (identity_type IN ('endpoint', 'trn', 'legal_registration')),
      identifier TEXT NOT NULL,
      scheme TEXT NOT NULL DEFAULT '',
      confirmed_by TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX supplier_einvoice_identity_value_idx
      ON supplier_einvoice_identities(identity_type, scheme, identifier);
    CREATE INDEX supplier_einvoice_identity_supplier_idx
      ON supplier_einvoice_identities(supplier_id);

    CREATE TABLE supplier_item_mappings (
      id TEXT PRIMARY KEY NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      supplier_item_identifier TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES inventory_items(id),
      unit_code TEXT,
      confirmed_by TEXT NOT NULL,
      confirmed_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX supplier_item_mapping_value_idx
      ON supplier_item_mappings(supplier_id, supplier_item_identifier);
    CREATE INDEX supplier_item_mapping_item_idx ON supplier_item_mappings(item_id);

    CREATE TABLE inbound_einvoice_events (
      id TEXT PRIMARY KEY NOT NULL,
      inbound_document_id TEXT NOT NULL REFERENCES inbound_einvoice_documents(id) ON DELETE CASCADE,
      provider_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_event_id TEXT,
      raw_response TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX inbound_einvoice_provider_event_idx
      ON inbound_einvoice_events(provider_key, provider_event_id)
      WHERE provider_event_id IS NOT NULL;
    CREATE INDEX inbound_einvoice_event_document_idx
      ON inbound_einvoice_events(inbound_document_id, created_at);

    ALTER TABLE purchase_invoices ADD COLUMN inbound_einvoice_document_id TEXT
      REFERENCES inbound_einvoice_documents(id);
    CREATE UNIQUE INDEX purchase_invoice_inbound_source_idx
      ON purchase_invoices(inbound_einvoice_document_id)
      WHERE inbound_einvoice_document_id IS NOT NULL;
    CREATE INDEX purchase_invoice_supplier_document_idx
      ON purchase_invoices(supplier_id, supplier_invoice_number, document_status);

    CREATE TRIGGER inbound_einvoice_original_immutable
    BEFORE UPDATE OF provider_key, environment, provider_document_id, document_type,
      specification_version, document_uuid, raw_xml, raw_hash, canonical_json, received_at
    ON inbound_einvoice_documents
    WHEN NEW.provider_key IS NOT OLD.provider_key
      OR NEW.environment IS NOT OLD.environment
      OR NEW.provider_document_id IS NOT OLD.provider_document_id
      OR NEW.document_type IS NOT OLD.document_type
      OR NEW.specification_version IS NOT OLD.specification_version
      OR NEW.document_uuid IS NOT OLD.document_uuid
      OR NEW.raw_xml IS NOT OLD.raw_xml
      OR NEW.raw_hash IS NOT OLD.raw_hash
      OR NEW.canonical_json IS NOT OLD.canonical_json
      OR NEW.received_at IS NOT OLD.received_at
    BEGIN
      SELECT RAISE(ABORT, 'Inbound eInvoice original payload is immutable');
    END;
    CREATE TRIGGER inbound_einvoice_no_delete
    BEFORE DELETE ON inbound_einvoice_documents
    BEGIN
      SELECT RAISE(ABORT, 'Inbound eInvoice documents must be archived, not deleted');
    END;
    CREATE TRIGGER inbound_einvoice_line_source_immutable
    BEFORE UPDATE OF source_line_id, order_line_reference, supplier_item_identifier,
      erp_item_identifier, quantity_micros, unit_code, unit_price_minor,
      net_amount_minor, tax_amount_minor, gross_amount_minor, tax_category,
      tax_rate_basis_points, position
    ON inbound_einvoice_lines
    BEGIN
      SELECT RAISE(ABORT, 'Inbound eInvoice source line facts are immutable');
    END;
    CREATE TRIGGER inbound_einvoice_events_no_update
    BEFORE UPDATE ON inbound_einvoice_events
    BEGIN
      SELECT RAISE(ABORT, 'Inbound eInvoice history is append-only');
    END;
    CREATE TRIGGER inbound_einvoice_events_no_delete
    BEFORE DELETE ON inbound_einvoice_events
    BEGIN
      SELECT RAISE(ABORT, 'Inbound eInvoice history is append-only');
    END;
  `);
}

function upgradeToPhase9(sqlite: Database.Database) {
  const now = new Date().toISOString();
  sqlite.exec(`
    CREATE TABLE currencies (
      code TEXT PRIMARY KEY NOT NULL CHECK (length(code) = 3 AND code = upper(code)),
      name TEXT NOT NULL,
      symbol TEXT,
      minor_unit INTEGER NOT NULL CHECK (minor_unit BETWEEN 0 AND 6),
      is_base INTEGER NOT NULL DEFAULT 0 CHECK (is_base IN (0, 1)),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX currency_single_base_idx ON currencies(is_base) WHERE is_base = 1;
    CREATE INDEX currency_active_idx ON currencies(is_active, code);
    INSERT INTO currencies (code, name, symbol, minor_unit, is_base, is_active, created_at, updated_at)
    VALUES
      ('AED', 'UAE Dirham', 'د.إ', 2, 1, 1, '${now}', '${now}'),
      ('USD', 'US Dollar', '$', 2, 0, 1, '${now}', '${now}'),
      ('EUR', 'Euro', '€', 2, 0, 1, '${now}', '${now}'),
      ('JPY', 'Japanese Yen', '¥', 0, 0, 1, '${now}', '${now}');

    CREATE TABLE business_currency_settings (
      id TEXT PRIMARY KEY NOT NULL CHECK (id = 'default'),
      base_currency_code TEXT NOT NULL REFERENCES currencies(code),
      metadata_source TEXT NOT NULL DEFAULT 'migration_default'
        CHECK (metadata_source IN ('migration_default', 'registry', 'configured', 'backup')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO business_currency_settings
      (id, base_currency_code, metadata_source, created_at, updated_at)
    VALUES ('default', 'AED', 'migration_default', '${now}', '${now}');

    CREATE TABLE exchange_rates (
      id TEXT PRIMARY KEY NOT NULL,
      currency_code TEXT NOT NULL REFERENCES currencies(code),
      rate_date TEXT NOT NULL,
      rate_to_base TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('Manual', 'CBUAE', 'Imported', 'FutureProvider')),
      source_reference TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX exchange_rate_currency_date_source_idx
      ON exchange_rates(currency_code, rate_date, source);
    CREATE INDEX exchange_rate_date_idx ON exchange_rates(rate_date, currency_code);

    ALTER TABLE customers ADD COLUMN default_currency_code TEXT REFERENCES currencies(code);
    ALTER TABLE suppliers ADD COLUMN default_currency_code TEXT REFERENCES currencies(code);
    UPDATE customers SET default_currency_code = 'AED' WHERE default_currency_code IS NULL;
    UPDATE suppliers SET default_currency_code = 'AED' WHERE default_currency_code IS NULL;

    INSERT OR IGNORE INTO accounts
      (id, code, name, type, subtype, is_system, is_active, created_at, updated_at)
    VALUES
      ('acct-realized-fx-gain-4200', '4200', 'Realized FX Gain', 'income', 'other_income', 1, 1, '${now}', '${now}'),
      ('acct-realized-fx-loss-6200', '6200', 'Realized FX Loss', 'expense', 'other_expense', 1, 1, '${now}', '${now}');
    ALTER TABLE business_accounting_settings ADD COLUMN realized_fx_gain_account_id TEXT REFERENCES accounts(id);
    ALTER TABLE business_accounting_settings ADD COLUMN realized_fx_loss_account_id TEXT REFERENCES accounts(id);
    UPDATE business_accounting_settings
      SET realized_fx_gain_account_id = 'acct-realized-fx-gain-4200',
          realized_fx_loss_account_id = 'acct-realized-fx-loss-6200',
          updated_at = '${now}'
      WHERE id = 'default';

    ALTER TABLE sales_invoices ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'AED';
    ALTER TABLE sales_invoices ADD COLUMN exchange_rate_to_base TEXT NOT NULL DEFAULT '1';
    ALTER TABLE sales_invoices ADD COLUMN exchange_rate_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE sales_invoices ADD COLUMN exchange_rate_source TEXT NOT NULL DEFAULT 'Base';
    ALTER TABLE sales_invoices ADD COLUMN base_subtotal_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sales_invoices ADD COLUMN base_tax_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sales_invoices ADD COLUMN base_total_minor INTEGER NOT NULL DEFAULT 0;
    UPDATE sales_invoices SET exchange_rate_date = tax_date,
      base_subtotal_minor = subtotal_minor, base_tax_minor = tax_minor, base_total_minor = total_minor;

    ALTER TABLE sales_credit_notes ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'AED';
    ALTER TABLE sales_credit_notes ADD COLUMN exchange_rate_to_base TEXT NOT NULL DEFAULT '1';
    ALTER TABLE sales_credit_notes ADD COLUMN exchange_rate_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE sales_credit_notes ADD COLUMN exchange_rate_source TEXT NOT NULL DEFAULT 'Base';
    ALTER TABLE sales_credit_notes ADD COLUMN base_subtotal_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sales_credit_notes ADD COLUMN base_tax_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sales_credit_notes ADD COLUMN base_total_minor INTEGER NOT NULL DEFAULT 0;
    UPDATE sales_credit_notes SET exchange_rate_date = tax_date,
      base_subtotal_minor = subtotal_minor, base_tax_minor = tax_minor, base_total_minor = total_minor;

    ALTER TABLE purchase_orders ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'AED';
    ALTER TABLE purchase_orders ADD COLUMN exchange_rate_to_base TEXT NOT NULL DEFAULT '1';
    ALTER TABLE purchase_orders ADD COLUMN exchange_rate_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE purchase_orders ADD COLUMN exchange_rate_source TEXT NOT NULL DEFAULT 'Base';
    ALTER TABLE purchase_orders ADD COLUMN base_subtotal_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchase_orders ADD COLUMN base_tax_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchase_orders ADD COLUMN base_total_minor INTEGER NOT NULL DEFAULT 0;
    UPDATE purchase_orders SET exchange_rate_date = date,
      base_subtotal_minor = subtotal_minor, base_tax_minor = tax_minor, base_total_minor = total_minor;

    ALTER TABLE purchase_invoices ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'AED';
    ALTER TABLE purchase_invoices ADD COLUMN exchange_rate_to_base TEXT NOT NULL DEFAULT '1';
    ALTER TABLE purchase_invoices ADD COLUMN exchange_rate_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE purchase_invoices ADD COLUMN exchange_rate_source TEXT NOT NULL DEFAULT 'Base';
    ALTER TABLE purchase_invoices ADD COLUMN base_subtotal_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchase_invoices ADD COLUMN base_tax_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE purchase_invoices ADD COLUMN base_total_minor INTEGER NOT NULL DEFAULT 0;
    UPDATE purchase_invoices SET exchange_rate_date = tax_date,
      base_subtotal_minor = subtotal_minor, base_tax_minor = tax_minor, base_total_minor = total_minor;

    ALTER TABLE receipts ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'AED';
    ALTER TABLE receipts ADD COLUMN exchange_rate_to_base TEXT NOT NULL DEFAULT '1';
    ALTER TABLE receipts ADD COLUMN exchange_rate_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE receipts ADD COLUMN exchange_rate_source TEXT NOT NULL DEFAULT 'Base';
    ALTER TABLE receipts ADD COLUMN base_amount_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE receipts ADD COLUMN released_carrying_amount_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE receipts ADD COLUMN realized_fx_amount_minor INTEGER NOT NULL DEFAULT 0;
    UPDATE receipts SET exchange_rate_date = date, base_amount_minor = amount_minor,
      released_carrying_amount_minor = amount_minor, realized_fx_amount_minor = 0;

    ALTER TABLE supplier_payments ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'AED';
    ALTER TABLE supplier_payments ADD COLUMN exchange_rate_to_base TEXT NOT NULL DEFAULT '1';
    ALTER TABLE supplier_payments ADD COLUMN exchange_rate_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE supplier_payments ADD COLUMN exchange_rate_source TEXT NOT NULL DEFAULT 'Base';
    ALTER TABLE supplier_payments ADD COLUMN base_amount_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE supplier_payments ADD COLUMN released_carrying_amount_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE supplier_payments ADD COLUMN realized_fx_amount_minor INTEGER NOT NULL DEFAULT 0;
    UPDATE supplier_payments SET exchange_rate_date = date, base_amount_minor = amount_minor,
      released_carrying_amount_minor = amount_minor, realized_fx_amount_minor = 0;

    ALTER TABLE receipt_allocations ADD COLUMN foreign_amount_allocated INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE receipt_allocations ADD COLUMN base_carrying_amount_released INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE receipt_allocations ADD COLUMN settlement_base_amount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE receipt_allocations ADD COLUMN realized_fx_amount INTEGER NOT NULL DEFAULT 0;
    UPDATE receipt_allocations SET foreign_amount_allocated = amount_minor,
      base_carrying_amount_released = amount_minor, settlement_base_amount = amount_minor;

    ALTER TABLE supplier_payment_allocations ADD COLUMN foreign_amount_allocated INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE supplier_payment_allocations ADD COLUMN base_carrying_amount_released INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE supplier_payment_allocations ADD COLUMN settlement_base_amount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE supplier_payment_allocations ADD COLUMN realized_fx_amount INTEGER NOT NULL DEFAULT 0;
    UPDATE supplier_payment_allocations SET foreign_amount_allocated = amount_minor,
      base_carrying_amount_released = amount_minor, settlement_base_amount = amount_minor;

    ALTER TABLE sales_credit_note_allocations ADD COLUMN foreign_amount_allocated INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sales_credit_note_allocations ADD COLUMN base_carrying_amount_released INTEGER NOT NULL DEFAULT 0;
    UPDATE sales_credit_note_allocations SET foreign_amount_allocated = amount_minor,
      base_carrying_amount_released = amount_minor;

    ALTER TABLE tax_entries ADD COLUMN document_currency TEXT NOT NULL DEFAULT 'AED';
    ALTER TABLE tax_entries ADD COLUMN foreign_net_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tax_entries ADD COLUMN foreign_vat_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tax_entries ADD COLUMN exchange_rate_to_base TEXT NOT NULL DEFAULT '1';
    ALTER TABLE tax_entries ADD COLUMN base_net_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tax_entries ADD COLUMN base_vat_minor INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE tax_entries ADD COLUMN rate_date TEXT NOT NULL DEFAULT '';
    ALTER TABLE tax_entries ADD COLUMN rate_source TEXT NOT NULL DEFAULT 'Base';
    UPDATE tax_entries SET foreign_net_minor = net_amount_minor,
      foreign_vat_minor = vat_amount_minor, base_net_minor = net_amount_minor,
      base_vat_minor = vat_amount_minor, rate_date = tax_date;

    CREATE INDEX sales_invoice_currency_idx ON sales_invoices(currency_code, document_status);
    CREATE INDEX purchase_invoice_currency_idx ON purchase_invoices(currency_code, document_status);
    CREATE INDEX receipt_currency_idx ON receipts(currency_code, document_status);
    CREATE INDEX supplier_payment_currency_idx ON supplier_payments(currency_code, document_status);

    CREATE TRIGGER sales_invoice_currency_exists_insert
    BEFORE INSERT ON sales_invoices WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Sales Invoice currency is not configured'); END;
    CREATE TRIGGER sales_invoice_currency_exists_update
    BEFORE UPDATE OF currency_code ON sales_invoices WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Sales Invoice currency is not configured'); END;
    CREATE TRIGGER sales_credit_note_currency_exists_insert
    BEFORE INSERT ON sales_credit_notes WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Sales Credit Note currency is not configured'); END;
    CREATE TRIGGER sales_credit_note_currency_exists_update
    BEFORE UPDATE OF currency_code ON sales_credit_notes WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Sales Credit Note currency is not configured'); END;
    CREATE TRIGGER purchase_order_currency_exists_insert
    BEFORE INSERT ON purchase_orders WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Purchase Order currency is not configured'); END;
    CREATE TRIGGER purchase_order_currency_exists_update
    BEFORE UPDATE OF currency_code ON purchase_orders WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Purchase Order currency is not configured'); END;
    CREATE TRIGGER purchase_invoice_currency_exists_insert
    BEFORE INSERT ON purchase_invoices WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Purchase Invoice currency is not configured'); END;
    CREATE TRIGGER purchase_invoice_currency_exists_update
    BEFORE UPDATE OF currency_code ON purchase_invoices WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Purchase Invoice currency is not configured'); END;
    CREATE TRIGGER receipt_currency_exists_insert
    BEFORE INSERT ON receipts WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Receipt currency is not configured'); END;
    CREATE TRIGGER receipt_currency_exists_update
    BEFORE UPDATE OF currency_code ON receipts WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Receipt currency is not configured'); END;
    CREATE TRIGGER supplier_payment_currency_exists_insert
    BEFORE INSERT ON supplier_payments WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Supplier Payment currency is not configured'); END;
    CREATE TRIGGER supplier_payment_currency_exists_update
    BEFORE UPDATE OF currency_code ON supplier_payments WHEN NOT EXISTS (SELECT 1 FROM currencies WHERE code = NEW.currency_code)
    BEGIN SELECT RAISE(ABORT, 'Supplier Payment currency is not configured'); END;

    CREATE TRIGGER posted_sales_invoice_currency_immutable
    BEFORE UPDATE OF currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source
    ON sales_invoices WHEN OLD.document_status = 'posted' AND (
      NEW.currency_code <> OLD.currency_code OR NEW.exchange_rate_to_base <> OLD.exchange_rate_to_base
      OR NEW.exchange_rate_date <> OLD.exchange_rate_date OR NEW.exchange_rate_source <> OLD.exchange_rate_source)
    BEGIN SELECT RAISE(ABORT, 'Posted document currency and exchange rate are immutable'); END;
    CREATE TRIGGER posted_purchase_invoice_currency_immutable
    BEFORE UPDATE OF currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source
    ON purchase_invoices WHEN OLD.document_status = 'posted' AND (
      NEW.currency_code <> OLD.currency_code OR NEW.exchange_rate_to_base <> OLD.exchange_rate_to_base
      OR NEW.exchange_rate_date <> OLD.exchange_rate_date OR NEW.exchange_rate_source <> OLD.exchange_rate_source)
    BEGIN SELECT RAISE(ABORT, 'Posted document currency and exchange rate are immutable'); END;
    CREATE TRIGGER posted_credit_note_currency_immutable
    BEFORE UPDATE OF currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source
    ON sales_credit_notes WHEN OLD.document_status = 'posted' AND (
      NEW.currency_code <> OLD.currency_code OR NEW.exchange_rate_to_base <> OLD.exchange_rate_to_base
      OR NEW.exchange_rate_date <> OLD.exchange_rate_date OR NEW.exchange_rate_source <> OLD.exchange_rate_source)
    BEGIN SELECT RAISE(ABORT, 'Posted document currency and exchange rate are immutable'); END;
  `);
}

function upgradeToPhase10(sqlite: Database.Database) {
  sqlite.exec(`
    ALTER TABLE document_templates ADD COLUMN settings_json TEXT;
    ALTER TABLE document_templates ADD COLUMN custom_html TEXT;
    UPDATE document_templates
    SET settings_json = '{"templateType":"modern","primaryColor":"#356fd0","fontName":"Inter","footerText":"Thank you for your business","showTaxColumn":true}'
    WHERE settings_json IS NULL;
  `);
}

export const businessMigrations = [
  { version: 0, name: "phase_0_baseline", up: createPhase0Baseline },
  {
    version: 1,
    name: "phase_1_accounting_core",
    up: upgradeToPhase1,
    foreignKeys: "off",
  },
  {
    version: 2,
    name: "phase_2_receivables_payables",
    up: upgradeToPhase2,
    foreignKeys: "off",
  },
  {
    version: 3,
    name: "phase_3_projects_operational_linking",
    up: upgradeToPhase3,
  },
  {
    version: 4,
    name: "phase_4_basic_inventory",
    up: upgradeToPhase4,
    foreignKeys: "off",
  },
  {
    version: 5,
    name: "phase_5_banking_reconciliation",
    up: upgradeToPhase5,
  },
  {
    version: 6,
    name: "phase_6_uae_vat_reporting",
    up: upgradeToPhase6,
  },
  {
    version: 7,
    name: "phase_7_outbound_einvoicing",
    up: upgradeToPhase7,
  },
  {
    version: 8,
    name: "phase_8_inbound_supplier_einvoicing",
    up: upgradeToPhase8,
  },
  {
    version: 9,
    name: "phase_9_multi_currency_foundation",
    up: upgradeToPhase9,
  },
  {
    version: 10,
    name: "document_template_settings",
    up: upgradeToPhase10,
  },
] satisfies readonly SqliteMigration[];

export function migrateBusinessDatabase(sqlite: Database.Database, label = "business database") {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  runMigrations(sqlite, {
    label,
    migrations: businessMigrations,
    legacyHistoryTable: "business_schema_migrations",
    baselineVersion: detectAndValidateBusinessBaseline,
  });
}
