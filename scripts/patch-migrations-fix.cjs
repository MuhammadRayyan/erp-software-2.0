const fs = require("fs");
const path = require("path");

const migrationPath = path.join(__dirname, "../src/core/db/business-migrations.ts");
let content = fs.readFileSync(migrationPath, "utf-8");

const migrationSql = `
export function upgradeToPhase15(db: Database.Database) {
  // Add amountsIncludeTax to existing headers
  db.exec(\`ALTER TABLE sales_invoices ADD COLUMN amounts_include_tax INTEGER NOT NULL DEFAULT 0;\`);
  db.exec(\`ALTER TABLE sales_invoices ADD COLUMN sales_order_id TEXT;\`);
  db.exec(\`ALTER TABLE sales_credit_notes ADD COLUMN amounts_include_tax INTEGER NOT NULL DEFAULT 0;\`);
  db.exec(\`ALTER TABLE purchase_orders ADD COLUMN amounts_include_tax INTEGER NOT NULL DEFAULT 0;\`);
  db.exec(\`ALTER TABLE purchase_invoices ADD COLUMN amounts_include_tax INTEGER NOT NULL DEFAULT 0;\`);

  // Add discount fields to existing lines
  db.exec(\`ALTER TABLE sales_invoice_lines ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none';\`);
  db.exec(\`ALTER TABLE sales_invoice_lines ADD COLUMN discount_value TEXT NOT NULL DEFAULT '0';\`);
  
  db.exec(\`ALTER TABLE sales_credit_note_lines ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none';\`);
  db.exec(\`ALTER TABLE sales_credit_note_lines ADD COLUMN discount_value TEXT NOT NULL DEFAULT '0';\`);
  
  db.exec(\`ALTER TABLE purchase_order_lines ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none';\`);
  db.exec(\`ALTER TABLE purchase_order_lines ADD COLUMN discount_value TEXT NOT NULL DEFAULT '0';\`);
  
  db.exec(\`ALTER TABLE purchase_invoice_lines ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none';\`);
  db.exec(\`ALTER TABLE purchase_invoice_lines ADD COLUMN discount_value TEXT NOT NULL DEFAULT '0';\`);

  // Create Quotes
  db.exec(\`
    CREATE TABLE IF NOT EXISTS sales_quotes (
      id TEXT PRIMARY KEY,
      quote_number TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      project_id TEXT REFERENCES projects(id),
      quote_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      reference TEXT,
      document_status TEXT NOT NULL DEFAULT 'draft',
      amounts_include_tax INTEGER NOT NULL DEFAULT 0,
      subtotal_minor INTEGER NOT NULL,
      tax_minor INTEGER NOT NULL,
      total_minor INTEGER NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'AED' REFERENCES currencies(code),
      exchange_rate_to_base TEXT NOT NULL DEFAULT '1',
      exchange_rate_date TEXT NOT NULL,
      exchange_rate_source TEXT NOT NULL DEFAULT 'Base',
      base_subtotal_minor INTEGER NOT NULL,
      base_tax_minor INTEGER NOT NULL,
      base_total_minor INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sales_quote_number_idx ON sales_quotes(quote_number);
    CREATE INDEX IF NOT EXISTS sales_quote_customer_idx ON sales_quotes(customer_id);
    CREATE INDEX IF NOT EXISTS sales_quote_project_idx ON sales_quotes(project_id);

    CREATE TABLE IF NOT EXISTS sales_quote_lines (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES sales_quotes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity_micros INTEGER NOT NULL,
      unit_price_minor INTEGER NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value TEXT NOT NULL DEFAULT '0',
      sales_account_id TEXT NOT NULL REFERENCES accounts(id),
      tax_code_id TEXT NOT NULL REFERENCES tax_codes(id),
      project_id TEXT REFERENCES projects(id),
      item_id TEXT REFERENCES inventory_items(id),
      net_amount_minor INTEGER NOT NULL,
      tax_amount_minor INTEGER NOT NULL,
      gross_amount_minor INTEGER NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sales_quote_lines_quote_idx ON sales_quote_lines(quote_id);
  \`);

  // Create Orders
  db.exec(\`
    CREATE TABLE IF NOT EXISTS sales_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      sales_quote_id TEXT REFERENCES sales_quotes(id),
      project_id TEXT REFERENCES projects(id),
      order_date TEXT NOT NULL,
      delivery_date TEXT NOT NULL,
      reference TEXT,
      document_status TEXT NOT NULL DEFAULT 'draft',
      amounts_include_tax INTEGER NOT NULL DEFAULT 0,
      subtotal_minor INTEGER NOT NULL,
      tax_minor INTEGER NOT NULL,
      total_minor INTEGER NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'AED' REFERENCES currencies(code),
      exchange_rate_to_base TEXT NOT NULL DEFAULT '1',
      exchange_rate_date TEXT NOT NULL,
      exchange_rate_source TEXT NOT NULL DEFAULT 'Base',
      base_subtotal_minor INTEGER NOT NULL,
      base_tax_minor INTEGER NOT NULL,
      base_total_minor INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sales_order_number_idx ON sales_orders(order_number);
    CREATE INDEX IF NOT EXISTS sales_order_customer_idx ON sales_orders(customer_id);
    CREATE INDEX IF NOT EXISTS sales_order_project_idx ON sales_orders(project_id);

    CREATE TABLE IF NOT EXISTS sales_order_lines (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity_micros INTEGER NOT NULL,
      unit_price_minor INTEGER NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value TEXT NOT NULL DEFAULT '0',
      sales_account_id TEXT NOT NULL REFERENCES accounts(id),
      tax_code_id TEXT NOT NULL REFERENCES tax_codes(id),
      project_id TEXT REFERENCES projects(id),
      item_id TEXT REFERENCES inventory_items(id),
      net_amount_minor INTEGER NOT NULL,
      tax_amount_minor INTEGER NOT NULL,
      gross_amount_minor INTEGER NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sales_order_lines_order_idx ON sales_order_lines(order_id);
  \`);

  // Create Debit Notes
  db.exec(\`
    CREATE TABLE IF NOT EXISTS debit_notes (
      id TEXT PRIMARY KEY,
      debit_note_number TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      purchase_invoice_id TEXT REFERENCES purchase_invoices(id),
      project_id TEXT REFERENCES projects(id),
      debit_note_date TEXT NOT NULL,
      tax_date TEXT NOT NULL,
      reference TEXT,
      document_status TEXT NOT NULL DEFAULT 'draft',
      amounts_include_tax INTEGER NOT NULL DEFAULT 0,
      subtotal_minor INTEGER NOT NULL,
      tax_minor INTEGER NOT NULL,
      total_minor INTEGER NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'AED' REFERENCES currencies(code),
      exchange_rate_to_base TEXT NOT NULL DEFAULT '1',
      exchange_rate_date TEXT NOT NULL,
      exchange_rate_source TEXT NOT NULL DEFAULT 'Base',
      base_subtotal_minor INTEGER NOT NULL,
      base_tax_minor INTEGER NOT NULL,
      base_total_minor INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      posted_at TEXT,
      voided_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS debit_note_number_idx ON debit_notes(debit_note_number);
    CREATE INDEX IF NOT EXISTS debit_note_supplier_idx ON debit_notes(supplier_id);
    CREATE INDEX IF NOT EXISTS debit_note_project_idx ON debit_notes(project_id);

    CREATE TABLE IF NOT EXISTS debit_note_lines (
      id TEXT PRIMARY KEY,
      debit_note_id TEXT NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity_micros INTEGER NOT NULL,
      unit_price_minor INTEGER NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value TEXT NOT NULL DEFAULT '0',
      purchase_account_id TEXT NOT NULL REFERENCES accounts(id),
      tax_code_id TEXT NOT NULL REFERENCES tax_codes(id),
      project_id TEXT REFERENCES projects(id),
      item_id TEXT REFERENCES inventory_items(id),
      net_amount_minor INTEGER NOT NULL,
      tax_amount_minor INTEGER NOT NULL,
      gross_amount_minor INTEGER NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS debit_note_lines_note_idx ON debit_note_lines(debit_note_id);
  \`);
}
`;

if (!content.includes("export function upgradeToPhase15")) {
  content = content.replace(
    "export function migrateBusinessDatabase",
    migrationSql + "\nexport function migrateBusinessDatabase"
  );

  fs.writeFileSync(migrationPath, content);
  console.log("Migrations fixed!");
} else {
  console.log("Migration 15 already exists");
}

