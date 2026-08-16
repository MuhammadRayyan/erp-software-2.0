import type Database from "better-sqlite3";
import {
  sqliteColumnExists,
  sqliteTableExists,
  validateSqliteSchema,
  type SchemaExpectation,
} from "./schema-validation";

const commonTables = {
  customers: ["id", "name", "email", "phone", "tax_reference", "status", "created_at", "updated_at"],
  document_templates: ["id", "document_type", "name", "template_json", "updated_at"],
} as const;

const phase0Expectation: SchemaExpectation = {
  tables: {
    ...commonTables,
    sales_invoices: ["id", "invoice_number", "customer_id", "invoice_date", "due_date", "reference", "status", "subtotal_minor", "tax_minor", "total_minor", "created_by", "created_at", "updated_at"],
    sales_invoice_lines: ["id", "invoice_id", "description", "quantity", "rate_minor", "tax_rate", "position"],
  },
  indexes: ["invoice_customer_idx", "invoice_lines_invoice_idx"],
  foreignKeys: [
    { table: "sales_invoices", from: "customer_id", toTable: "customers", to: "id" },
    { table: "sales_invoice_lines", from: "invoice_id", toTable: "sales_invoices", to: "id", onDelete: "CASCADE" },
  ],
  uniqueColumns: [
    { table: "sales_invoices", columns: ["invoice_number"] },
    { table: "document_templates", columns: ["document_type"] },
  ],
  checkTables: ["customers", "sales_invoices"],
};

function modernExpectation(version: number): SchemaExpectation {
  const settingsColumns = [
    "id", "accounts_receivable_account_id", "default_sales_account_id",
    "default_bank_account_id", "vat_output_account_id", "invoice_prefix",
    "invoice_next_number", "invoice_padding", "receipt_prefix", "receipt_next_number",
    "journal_prefix", "journal_next_number", "created_at", "updated_at",
  ];
  if (version >= 2) settingsColumns.push(
    "accounts_payable_account_id", "input_vat_account_id",
    "default_purchase_expense_account_id", "credit_note_prefix", "credit_note_next_number",
    "purchase_order_prefix", "purchase_order_next_number", "purchase_invoice_prefix",
    "purchase_invoice_next_number", "supplier_payment_prefix", "supplier_payment_next_number",
  );
  if (version >= 3) settingsColumns.push("project_prefix", "project_next_number");
  if (version >= 4) settingsColumns.push(
    "goods_receipt_prefix", "goods_receipt_next_number", "delivery_note_prefix",
    "delivery_note_next_number", "stock_adjustment_prefix", "stock_adjustment_next_number",
    "default_inventory_asset_account_id", "default_cost_of_sales_account_id",
    "inventory_adjustment_account_id",
  );
  if (version >= 5) settingsColumns.push(
    "bank_transaction_prefix", "bank_transaction_next_number",
    "bank_transfer_prefix", "bank_transfer_next_number",
  );
  if (version >= 9) settingsColumns.push(
    "realized_fx_gain_account_id", "realized_fx_loss_account_id",
  );

  const salesInvoiceColumns = [
    "id", "invoice_number", "customer_id", "invoice_date", "due_date", "reference",
    "document_status", "subtotal_minor", "tax_minor", "total_minor", "created_by",
    "created_at", "updated_at", "posted_at", "voided_at",
  ];
  const salesLineColumns = [
    "id", "invoice_id", "description", "quantity_micros", "unit_price_minor",
    "sales_account_id", "tax_code_id", "net_amount_minor", "tax_amount_minor",
    "gross_amount_minor", "position",
  ];
  const journalLineColumns = [
    "id", "journal_entry_id", "account_id", "description", "debit_minor", "credit_minor",
    "customer_id", "reference", "position",
  ];
  if (version >= 2) journalLineColumns.push("supplier_id");
  if (version >= 3) {
    salesInvoiceColumns.push("project_id");
    salesLineColumns.push("project_id");
    journalLineColumns.push("project_id");
  }
  if (version >= 4) salesLineColumns.push("item_id");
  if (version >= 6) salesInvoiceColumns.push("tax_date", "supply_emirate");
  if (version >= 7) salesInvoiceColumns.push("einvoice_transaction_flags_json");
  if (version >= 9) salesInvoiceColumns.push(
    "currency_code", "exchange_rate_to_base", "exchange_rate_date", "exchange_rate_source",
    "base_subtotal_minor", "base_tax_minor", "base_total_minor",
  );

  const tables: Record<string, readonly string[]> = {
    ...commonTables,
    accounts: ["id", "code", "name", "type", "subtype", "is_system", "is_active", "created_at", "updated_at"],
    tax_codes: ["id", "name", "rate_basis_points", "sales_tax_account_id", "is_active", "created_at", "updated_at", ...(version >= 2 ? ["purchase_tax_account_id"] : []), ...(version >= 6 ? ["direction", "vat_category", "is_recoverable"] : [])],
    business_accounting_settings: settingsColumns,
    sales_invoices: salesInvoiceColumns,
    sales_invoice_lines: salesLineColumns,
    journal_entries: ["id", "entry_number", "date", "source_type", "source_id", "description", "status", "created_at", "posted_at"],
    journal_lines: journalLineColumns,
    receipts: ["id", "receipt_number", "customer_id", "date", "bank_account_id", "amount_minor", "reference", "description", "document_status", "created_by", "created_at", "posted_at", "voided_at", ...(version >= 9 ? ["currency_code", "exchange_rate_to_base", "exchange_rate_date", "exchange_rate_source", "base_amount_minor", "released_carrying_amount_minor", "realized_fx_amount_minor"] : [])],
    receipt_allocations: ["id", "receipt_id", "sales_invoice_id", "amount_minor", ...(version >= 9 ? ["foreign_amount_allocated", "base_carrying_amount_released", "settlement_base_amount", "realized_fx_amount"] : [])],
  };
  if (version >= 9) {
    tables.customers = [...tables.customers, "default_currency_code"];
  }
  if (version >= 11) {
    tables.customers = [...tables.customers, "is_active", "billing_address", "delivery_address"];
  }

  const indexes = [
    "sales_invoice_number_idx", "sales_invoice_customer_idx",
    "sales_invoice_lines_invoice_idx", "journal_date_idx", "journal_lines_entry_idx",
    "journal_lines_account_idx", "journal_lines_customer_idx", "receipt_customer_idx",
    "receipt_allocation_invoice_idx",
  ];
  const foreignKeys: NonNullable<SchemaExpectation["foreignKeys"]>[number][] = [
    { table: "sales_invoices", from: "customer_id", toTable: "customers", to: "id" },
    { table: "sales_invoice_lines", from: "invoice_id", toTable: "sales_invoices", to: "id", onDelete: "CASCADE" },
    { table: "journal_lines", from: "journal_entry_id", toTable: "journal_entries", to: "id", onDelete: "CASCADE" },
    { table: "journal_lines", from: "account_id", toTable: "accounts", to: "id" },
    { table: "receipts", from: "customer_id", toTable: "customers", to: "id" },
    { table: "receipt_allocations", from: "receipt_id", toTable: "receipts", to: "id", onDelete: "CASCADE" },
    { table: "receipt_allocations", from: "sales_invoice_id", toTable: "sales_invoices", to: "id" },
  ];
  const uniqueColumns = [
    { table: "accounts", columns: ["code"] },
    { table: "sales_invoices", columns: ["invoice_number"] },
    { table: "journal_entries", columns: ["entry_number"] },
    { table: "journal_entries", columns: ["source_type", "source_id"] },
    { table: "receipts", columns: ["receipt_number"] },
    { table: "receipt_allocations", columns: ["receipt_id", "sales_invoice_id"] },
    { table: "document_templates", columns: ["document_type"] },
  ];
  const checkTables = [
    "customers", "accounts", "tax_codes", "business_accounting_settings",
    "sales_invoices", "sales_invoice_lines", "journal_entries", "journal_lines",
    "receipts", "receipt_allocations",
  ];

  if (version >= 2) {
    Object.assign(tables, {
      suppliers: [
        "id", "name", "email", "phone", "tax_reference", "address", "notes", "is_active",
        "created_at", "updated_at",
        ...(version >= 8 ? [
          "legal_name", "trn", "legal_registration_identifier", "electronic_address",
          "electronic_address_scheme", "registered_address", "country_code",
        ] : []),
      ],
      purchase_orders: ["id", "order_number", "supplier_id", "date", "expected_date", "reference", "notes", "status", "subtotal_minor", "tax_minor", "total_minor", "created_by", "created_at", "updated_at", "issued_at", "closed_at", "cancelled_at", ...(version >= 3 ? ["project_id"] : []), ...(version >= 9 ? ["currency_code", "exchange_rate_to_base", "exchange_rate_date", "exchange_rate_source", "base_subtotal_minor", "base_tax_minor", "base_total_minor"] : [])],
      purchase_order_lines: ["id", "purchase_order_id", "description", "quantity_micros", "unit_price_minor", "expense_account_id", "tax_code_id", "net_amount_minor", "tax_amount_minor", "gross_amount_minor", "position", ...(version >= 3 ? ["project_id"] : []), ...(version >= 4 ? ["item_id"] : [])],
      purchase_invoices: ["id", "internal_number", "supplier_id", "supplier_invoice_number", "invoice_date", "due_date", "reference", "purchase_order_id", "document_status", "subtotal_minor", "tax_minor", "total_minor", "created_by", "created_at", "updated_at", "posted_at", "voided_at", ...(version >= 3 ? ["project_id"] : []), ...(version >= 6 ? ["tax_date"] : []), ...(version >= 8 ? ["inbound_einvoice_document_id"] : []), ...(version >= 9 ? ["currency_code", "exchange_rate_to_base", "exchange_rate_date", "exchange_rate_source", "base_subtotal_minor", "base_tax_minor", "base_total_minor"] : [])],
      purchase_invoice_lines: ["id", "purchase_invoice_id", "description", "quantity_micros", "unit_price_minor", "expense_account_id", "tax_code_id", "net_amount_minor", "tax_amount_minor", "gross_amount_minor", "position", ...(version >= 3 ? ["project_id"] : []), ...(version >= 4 ? ["item_id"] : [])],
      supplier_payments: ["id", "payment_number", "supplier_id", "date", "bank_account_id", "amount_minor", "reference", "description", "document_status", "created_by", "created_at", "posted_at", "voided_at", ...(version >= 9 ? ["currency_code", "exchange_rate_to_base", "exchange_rate_date", "exchange_rate_source", "base_amount_minor", "released_carrying_amount_minor", "realized_fx_amount_minor"] : [])],
      supplier_payment_allocations: ["id", "payment_id", "purchase_invoice_id", "amount_minor", ...(version >= 9 ? ["foreign_amount_allocated", "base_carrying_amount_released", "settlement_base_amount", "realized_fx_amount"] : [])],
      sales_credit_notes: ["id", "credit_note_number", "customer_id", "source_invoice_id", "date", "reference", "reason", "document_status", "subtotal_minor", "tax_minor", "total_minor", "created_by", "created_at", "updated_at", "posted_at", "voided_at", ...(version >= 3 ? ["project_id"] : []), ...(version >= 6 ? ["tax_date", "supply_emirate"] : []), ...(version >= 7 ? ["einvoice_reason_code", "einvoice_transaction_flags_json"] : []), ...(version >= 9 ? ["currency_code", "exchange_rate_to_base", "exchange_rate_date", "exchange_rate_source", "base_subtotal_minor", "base_tax_minor", "base_total_minor"] : [])],
      sales_credit_note_lines: ["id", "credit_note_id", "description", "quantity_micros", "unit_price_minor", "sales_account_id", "tax_code_id", "net_amount_minor", "tax_amount_minor", "gross_amount_minor", "position", ...(version >= 3 ? ["project_id"] : [])],
      sales_credit_note_allocations: ["id", "credit_note_id", "sales_invoice_id", "amount_minor", ...(version >= 9 ? ["foreign_amount_allocated", "base_carrying_amount_released"] : [])],
    });
    if (version >= 9) tables.suppliers = [...tables.suppliers, "default_currency_code"];
    indexes.push(
      "purchase_order_supplier_idx", "purchase_order_lines_order_idx",
      "purchase_invoice_supplier_idx", "purchase_invoice_order_idx",
      "purchase_invoice_lines_invoice_idx", "supplier_payment_supplier_idx",
      "supplier_payment_allocation_invoice_idx", "sales_credit_note_customer_idx",
      "sales_credit_note_invoice_idx", "sales_credit_note_lines_note_idx",
      "sales_credit_note_allocation_invoice_idx", "journal_lines_supplier_idx",
    );
    foreignKeys.push(
      { table: "purchase_orders", from: "supplier_id", toTable: "suppliers", to: "id" },
      { table: "purchase_order_lines", from: "purchase_order_id", toTable: "purchase_orders", to: "id", onDelete: "CASCADE" },
      { table: "purchase_invoices", from: "supplier_id", toTable: "suppliers", to: "id" },
      { table: "purchase_invoice_lines", from: "purchase_invoice_id", toTable: "purchase_invoices", to: "id", onDelete: "CASCADE" },
      { table: "supplier_payment_allocations", from: "payment_id", toTable: "supplier_payments", to: "id", onDelete: "CASCADE" },
      { table: "sales_credit_note_lines", from: "credit_note_id", toTable: "sales_credit_notes", to: "id", onDelete: "CASCADE" },
    );
    uniqueColumns.push(
      { table: "purchase_orders", columns: ["order_number"] },
      { table: "purchase_invoices", columns: ["internal_number"] },
      { table: "supplier_payments", columns: ["payment_number"] },
      { table: "sales_credit_notes", columns: ["credit_note_number"] },
    );
    checkTables.push(
      "purchase_orders", "purchase_order_lines", "purchase_invoices",
      "purchase_invoice_lines", "supplier_payments", "supplier_payment_allocations",
      "sales_credit_notes", "sales_credit_note_lines", "sales_credit_note_allocations",
    );
  }

  if (version >= 3) {
    Object.assign(tables, {
      projects: ["id", "code", "name", "customer_id", "status", "description", "start_date", "target_end_date", "actual_end_date", "budget_revenue_minor", "budget_cost_minor", "manager_name", "is_active", "created_at", "updated_at"],
      project_notes: ["id", "project_id", "body", "created_by", "created_at", "updated_at"],
      project_attachments: ["id", "project_id", "original_name", "storage_path", "mime_type", "size_bytes", "uploaded_by", "created_at"],
    });
    indexes.push(
      "project_customer_idx", "project_status_idx", "project_notes_project_idx",
      "project_attachments_project_idx", "sales_invoice_project_idx",
      "sales_invoice_lines_project_idx", "sales_credit_note_project_idx",
      "sales_credit_note_lines_project_idx", "purchase_order_project_idx",
      "purchase_order_lines_project_idx", "purchase_invoice_project_idx",
      "purchase_invoice_lines_project_idx", "journal_lines_project_idx",
    );
    foreignKeys.push(
      { table: "project_notes", from: "project_id", toTable: "projects", to: "id", onDelete: "CASCADE" },
      { table: "project_attachments", from: "project_id", toTable: "projects", to: "id", onDelete: "CASCADE" },
      { table: "journal_lines", from: "project_id", toTable: "projects", to: "id" },
    );
    uniqueColumns.push(
      { table: "projects", columns: ["code"] },
      { table: "project_attachments", columns: ["storage_path"] },
    );
    checkTables.push("projects", "project_attachments");
  }

  if (version >= 4) {
    Object.assign(tables, {
      inventory_items: ["id", "sku", "name", "description", "unit_name", "sales_price_minor", "purchase_price_minor", "sales_account_id", "inventory_asset_account_id", "cost_of_sales_account_id", "is_active", "created_at", "updated_at"],
      inventory_locations: ["id", "code", "name", "address", "is_default", "is_active", "created_at", "updated_at"],
      goods_receipts: ["id", "receipt_number", "supplier_id", "purchase_order_id", "purchase_invoice_id", "date", "location_id", "reference", "project_id", "notes", "document_status", "created_by", "created_at", "updated_at", "posted_at", "voided_at"],
      goods_receipt_lines: ["id", "goods_receipt_id", "item_id", "description", "quantity_micros", "unit_cost_minor", "project_id", "purchase_order_line_id", "purchase_invoice_line_id", "position"],
      delivery_notes: ["id", "delivery_number", "customer_id", "sales_invoice_id", "date", "location_id", "reference", "project_id", "notes", "document_status", "created_by", "created_at", "updated_at", "posted_at", "voided_at"],
      delivery_note_lines: ["id", "delivery_note_id", "item_id", "description", "quantity_micros", "project_id", "sales_invoice_line_id", "position"],
      stock_adjustments: ["id", "adjustment_number", "date", "location_id", "item_id", "quantity_delta_micros", "unit_cost_minor", "reason", "project_id", "notes", "document_status", "created_by", "created_at", "updated_at", "posted_at", "voided_at"],
      inventory_movements: ["id", "date", "item_id", "location_id", "movement_type", "quantity_delta_micros", "unit_cost_micros", "value_delta_minor", "source_type", "source_id", "source_line_id", "project_id", "description", "created_at"],
    });
    indexes.push(
      "inventory_item_sku_idx", "inventory_item_name_idx", "sales_invoice_lines_item_idx",
      "purchase_order_lines_item_idx", "purchase_invoice_lines_item_idx",
      "goods_receipt_supplier_idx", "goods_receipt_order_idx", "goods_receipt_invoice_idx",
      "goods_receipt_lines_receipt_idx", "goods_receipt_lines_order_line_idx",
      "delivery_note_customer_idx", "delivery_note_invoice_idx", "delivery_note_lines_note_idx",
      "delivery_note_lines_invoice_line_idx", "inventory_movement_item_location_idx",
      "inventory_movement_source_idx", "inventory_movement_date_idx",
      "inventory_movement_project_idx",
    );
    foreignKeys.push(
      { table: "goods_receipt_lines", from: "goods_receipt_id", toTable: "goods_receipts", to: "id", onDelete: "CASCADE" },
      { table: "delivery_note_lines", from: "delivery_note_id", toTable: "delivery_notes", to: "id", onDelete: "CASCADE" },
      { table: "inventory_movements", from: "item_id", toTable: "inventory_items", to: "id" },
      { table: "inventory_movements", from: "location_id", toTable: "inventory_locations", to: "id" },
    );
    uniqueColumns.push(
      { table: "inventory_items", columns: ["sku"] },
      { table: "inventory_locations", columns: ["code"] },
      { table: "goods_receipts", columns: ["receipt_number"] },
      { table: "delivery_notes", columns: ["delivery_number"] },
      { table: "stock_adjustments", columns: ["adjustment_number"] },
    );
    checkTables.push(
      "inventory_items", "goods_receipts", "goods_receipt_lines", "delivery_notes",
      "delivery_note_lines", "stock_adjustments", "inventory_movements",
    );
  }

  if (version >= 5) {
    Object.assign(tables, {
      bank_accounts: ["id", "name", "account_code", "bank_name", "account_number_masked", "currency_code", "ledger_account_id", "is_cash_account", "is_active", "created_at", "updated_at"],
      bank_statement_imports: ["id", "bank_account_id", "file_name", "row_count", "imported_count", "duplicate_count", "mapping_json", "status", "created_by", "created_at"],
      bank_statement_lines: ["id", "import_id", "bank_account_id", "transaction_date", "value_date", "description", "reference", "amount_minor", "external_id", "fingerprint", "match_status", "matched_source_type", "matched_source_id", "created_at"],
      bank_transactions: ["id", "transaction_number", "bank_account_id", "date", "type", "reference", "description", "total_minor", "statement_line_id", "document_status", "created_by", "created_at", "updated_at", "posted_at", "voided_at", ...(version >= 6 ? ["tax_date", "supply_emirate"] : [])],
      bank_transaction_lines: ["id", "bank_transaction_id", "account_id", "tax_code_id", "project_id", "description", "net_amount_minor", "tax_amount_minor", "gross_amount_minor", "position"],
      bank_transfers: ["id", "transfer_number", "from_bank_account_id", "to_bank_account_id", "date", "amount_minor", "reference", "description", "document_status", "created_by", "created_at", "posted_at", "voided_at"],
      bank_reconciliations: ["id", "bank_account_id", "statement_date", "statement_ending_balance_minor", "status", "created_by", "created_at", "updated_at", "completed_at"],
      bank_reconciliation_items: ["id", "reconciliation_id", "statement_line_id", "journal_entry_id", "created_at"],
    });
    indexes.push(
      "bank_account_ledger_idx", "bank_account_active_idx",
      "bank_statement_import_account_idx", "bank_statement_line_fingerprint_idx",
      "bank_statement_line_account_status_idx", "bank_statement_line_source_idx",
      "bank_transaction_number_idx", "bank_transaction_statement_line_idx", "bank_transaction_account_idx",
      "bank_transaction_line_transaction_idx", "bank_transaction_line_project_idx",
      "bank_transfer_number_idx", "bank_transfer_from_idx", "bank_transfer_to_idx",
      "bank_reconciliation_account_date_idx", "bank_reconciliation_statement_line_idx",
      "bank_reconciliation_item_reconciliation_idx", "bank_reconciliation_item_journal_idx",
    );
    foreignKeys.push(
      { table: "bank_accounts", from: "ledger_account_id", toTable: "accounts", to: "id" },
      { table: "bank_statement_imports", from: "bank_account_id", toTable: "bank_accounts", to: "id" },
      { table: "bank_statement_lines", from: "import_id", toTable: "bank_statement_imports", to: "id", onDelete: "CASCADE" },
      { table: "bank_statement_lines", from: "bank_account_id", toTable: "bank_accounts", to: "id" },
      { table: "bank_transactions", from: "bank_account_id", toTable: "bank_accounts", to: "id" },
      { table: "bank_transactions", from: "statement_line_id", toTable: "bank_statement_lines", to: "id" },
      { table: "bank_transaction_lines", from: "bank_transaction_id", toTable: "bank_transactions", to: "id", onDelete: "CASCADE" },
      { table: "bank_transfers", from: "from_bank_account_id", toTable: "bank_accounts", to: "id" },
      { table: "bank_transfers", from: "to_bank_account_id", toTable: "bank_accounts", to: "id" },
      { table: "bank_reconciliations", from: "bank_account_id", toTable: "bank_accounts", to: "id" },
      { table: "bank_reconciliation_items", from: "reconciliation_id", toTable: "bank_reconciliations", to: "id", onDelete: "CASCADE" },
      { table: "bank_reconciliation_items", from: "statement_line_id", toTable: "bank_statement_lines", to: "id" },
      { table: "bank_reconciliation_items", from: "journal_entry_id", toTable: "journal_entries", to: "id" },
    );
    uniqueColumns.push(
      { table: "bank_accounts", columns: ["ledger_account_id"] },
      { table: "bank_statement_lines", columns: ["bank_account_id", "fingerprint"] },
      { table: "bank_transactions", columns: ["transaction_number"] },
      { table: "bank_transactions", columns: ["statement_line_id"] },
      { table: "bank_transfers", columns: ["transfer_number"] },
      { table: "bank_reconciliation_items", columns: ["statement_line_id"] },
    );
    checkTables.push(
      "bank_accounts", "bank_statement_imports", "bank_statement_lines",
      "bank_transactions", "bank_transaction_lines", "bank_transfers",
      "bank_reconciliations",
    );
  }

  if (version >= 6) {
    Object.assign(tables, {
      business_tax_settings: ["id", "vat_registered", "trn", "vat_registration_effective_date", "vat_deregistration_date", "default_supply_emirate", "tax_lock_date", "created_at", "updated_at"],
      vat_periods: ["id", "period_reference", "start_date", "end_date", "filing_due_date", "status", "finalized_at", "finalized_by", "filed_at", "filed_by", "filing_reference", "reopened_at", "reopened_by", "reopen_reason", "notes", "created_at", "updated_at"],
      tax_entries: ["id", "tax_date", "source_type", "source_id", "source_line_id", "source_number", "party_name", "tax_code_id", "tax_code_name", "rate_basis_points", "vat_category", "direction", "net_amount_minor", "vat_amount_minor", "output_vat_minor", "recoverable_vat_minor", "supply_emirate", "project_id", "created_at", ...(version >= 9 ? ["document_currency", "foreign_net_minor", "foreign_vat_minor", "exchange_rate_to_base", "base_net_minor", "base_vat_minor", "rate_date", "rate_source"] : [])],
      vat_adjustments: ["id", "period_id", "report_bucket", "amount_minor", "vat_amount_minor", "reason", "reference", "created_by", "created_at"],
      vat_period_snapshots: ["id", "period_id", "snapshot_kind", "snapshot_json", "created_by", "created_at"],
      vat_period_audit: ["id", "period_id", "action", "reason_or_reference", "created_by", "created_at"],
      vat_data_review: ["id", "source_type", "source_id", "source_line_id", "tax_date", "issue_type", "details", "status", "resolved_at", "created_at"],
    });
    indexes.push(
      "vat_period_reference_idx", "vat_period_date_idx", "vat_period_status_idx",
      "tax_entry_source_line_idx", "tax_entry_date_idx", "tax_entry_source_idx",
      "tax_entry_bucket_idx", "tax_entry_emirate_idx", "tax_entry_tax_code_idx",
      "vat_adjustment_period_idx", "vat_snapshot_period_idx", "vat_period_audit_period_idx",
      "vat_data_review_source_issue_idx", "vat_data_review_date_idx", "vat_data_review_source_idx",
    );
    foreignKeys.push(
      { table: "tax_entries", from: "tax_code_id", toTable: "tax_codes", to: "id" },
      { table: "vat_adjustments", from: "period_id", toTable: "vat_periods", to: "id", onDelete: "CASCADE" },
      { table: "vat_period_snapshots", from: "period_id", toTable: "vat_periods", to: "id", onDelete: "CASCADE" },
      { table: "vat_period_audit", from: "period_id", toTable: "vat_periods", to: "id", onDelete: "CASCADE" },
    );
    uniqueColumns.push(
      { table: "vat_periods", columns: ["period_reference"] },
      { table: "tax_entries", columns: ["source_type", "source_id", "source_line_id"] },
      { table: "vat_data_review", columns: ["source_type", "source_id", "source_line_id", "issue_type"] },
    );
    checkTables.push("business_tax_settings", "vat_periods", "tax_entries", "vat_data_review");
  }

  if (version >= 7) {
    Object.assign(tables, {
      customers: [
        "id", "name", "email", "phone", "tax_reference", "legal_name", "trn",
        "legal_registration_identifier", "electronic_address", "electronic_address_scheme",
        "address_line_1", "city", "country_subdivision", "country_code", "buyer_reference",
        "status", "created_at", "updated_at", ...(version >= 9 ? ["default_currency_code"] : []),
      ],
      business_einvoice_settings: [
        "id", "enabled", "legal_name", "legal_registration_identifier", "address_line_1", "city",
        "country_subdivision", "country_code", "participant_identifier",
        "participant_identifier_scheme", "endpoint_identifier", "endpoint_identifier_scheme",
        "asp_provider_key", "asp_environment", "specification_version", "created_at", "updated_at",
      ],
      einvoice_documents: [
        "id", "source_type", "source_id", "document_type", "uuid", "specification_version", "status",
        "canonical_json", "xml_payload", "payload_hash", "validation_json", "provider_key",
        "provider_environment", "exchange_status", "reporting_status", "last_error", "created_at",
        "updated_at", "validated_at", "submitted_at", "accepted_at", "rejected_at",
      ],
      einvoice_submissions: [
        "id", "document_id", "provider_key", "provider_environment", "attempt_number", "status",
        "provider_request_id", "exchange_status", "reporting_status", "response_code",
        "response_payload", "error_message", "submitted_at", "responded_at", "created_at",
      ],
    });
    indexes.push(
      "einvoice_document_source_idx", "einvoice_document_uuid_idx", "einvoice_document_status_idx",
      "einvoice_submission_attempt_idx", "einvoice_submission_document_idx",
    );
    foreignKeys.push(
      { table: "einvoice_submissions", from: "document_id", toTable: "einvoice_documents", to: "id", onDelete: "CASCADE" },
    );
    uniqueColumns.push(
      { table: "einvoice_documents", columns: ["source_type", "source_id"] },
      { table: "einvoice_documents", columns: ["uuid"] },
      { table: "einvoice_submissions", columns: ["document_id", "attempt_number"] },
    );
    checkTables.push("business_einvoice_settings", "einvoice_documents", "einvoice_submissions");
  }

  if (version >= 8) {
    Object.assign(tables, {
      inbound_einvoice_documents: [
        "id", "provider_key", "environment", "provider_document_id", "document_type",
        "specification_version", "document_uuid", "seller_endpoint_id", "seller_endpoint_scheme",
        "seller_trn", "seller_legal_registration_identifier", "seller_legal_name",
        "buyer_endpoint_id", "buyer_endpoint_scheme", "buyer_trn",
        "buyer_legal_registration_identifier", "buyer_legal_name", "document_number",
        "issue_date", "tax_date", "due_date", "currency_code", "source_invoice_reference",
        "status", "network_status", "raw_xml", "raw_hash", "canonical_json",
        "validation_result_json", "subtotal_minor", "allowance_total_minor",
        "charge_total_minor", "tax_minor", "total_minor", "amount_due_minor",
        "buyer_identity_verified", "supplier_id", "purchase_order_id", "goods_receipt_id",
        "purchase_invoice_id", "duplicate_of_id", "duplicate_kind", "last_error",
        "rejection_reason", "received_at", "validated_at", "reviewed_by", "reviewed_at",
        "archived_at",
      ],
      inbound_einvoice_lines: [
        "id", "inbound_document_id", "source_line_id", "order_line_reference",
        "supplier_item_identifier", "erp_item_identifier", "description", "item_name",
        "quantity_micros", "unit_code", "unit_price_minor", "net_amount_minor",
        "tax_amount_minor", "gross_amount_minor", "tax_category", "tax_rate_basis_points",
        "match_status", "purchase_order_line_id", "item_id", "expense_account_id",
        "tax_code_id", "project_id", "position",
      ],
      supplier_einvoice_identities: [
        "id", "supplier_id", "identity_type", "identifier", "scheme", "confirmed_by",
        "confirmed_at", "created_at",
      ],
      supplier_item_mappings: [
        "id", "supplier_id", "supplier_item_identifier", "item_id", "unit_code",
        "confirmed_by", "confirmed_at",
      ],
      inbound_einvoice_events: [
        "id", "inbound_document_id", "provider_key", "event_type", "status",
        "provider_event_id", "raw_response", "created_by", "created_at",
      ],
    });
    indexes.push(
      "supplier_einvoice_endpoint_idx", "supplier_einvoice_trn_idx",
      "supplier_einvoice_registration_idx", "inbound_einvoice_provider_document_idx",
      "inbound_einvoice_raw_hash_idx", "inbound_einvoice_uuid_seller_idx",
      "inbound_einvoice_status_received_idx", "inbound_einvoice_supplier_number_idx",
      "inbound_einvoice_purchase_order_idx", "inbound_einvoice_goods_receipt_idx",
      "inbound_einvoice_purchase_invoice_idx", "inbound_einvoice_line_position_idx",
      "inbound_einvoice_line_order_idx", "inbound_einvoice_line_item_idx",
      "supplier_einvoice_identity_value_idx", "supplier_einvoice_identity_supplier_idx",
      "supplier_item_mapping_value_idx", "supplier_item_mapping_item_idx",
      "inbound_einvoice_provider_event_idx", "inbound_einvoice_event_document_idx",
      "purchase_invoice_inbound_source_idx", "purchase_invoice_supplier_document_idx",
    );
    foreignKeys.push(
      { table: "inbound_einvoice_documents", from: "supplier_id", toTable: "suppliers", to: "id" },
      { table: "inbound_einvoice_documents", from: "purchase_order_id", toTable: "purchase_orders", to: "id" },
      { table: "inbound_einvoice_documents", from: "goods_receipt_id", toTable: "goods_receipts", to: "id" },
      { table: "inbound_einvoice_documents", from: "purchase_invoice_id", toTable: "purchase_invoices", to: "id", onDelete: "SET NULL" },
      { table: "inbound_einvoice_lines", from: "inbound_document_id", toTable: "inbound_einvoice_documents", to: "id", onDelete: "CASCADE" },
      { table: "supplier_einvoice_identities", from: "supplier_id", toTable: "suppliers", to: "id", onDelete: "CASCADE" },
      { table: "supplier_item_mappings", from: "supplier_id", toTable: "suppliers", to: "id", onDelete: "CASCADE" },
      { table: "inbound_einvoice_events", from: "inbound_document_id", toTable: "inbound_einvoice_documents", to: "id", onDelete: "CASCADE" },
      { table: "purchase_invoices", from: "inbound_einvoice_document_id", toTable: "inbound_einvoice_documents", to: "id" },
    );
    uniqueColumns.push(
      { table: "inbound_einvoice_documents", columns: ["provider_key", "environment", "provider_document_id"] },
      { table: "inbound_einvoice_documents", columns: ["raw_hash"] },
      { table: "inbound_einvoice_lines", columns: ["inbound_document_id", "position"] },
      { table: "supplier_einvoice_identities", columns: ["identity_type", "scheme", "identifier"] },
      { table: "supplier_item_mappings", columns: ["supplier_id", "supplier_item_identifier"] },
      { table: "inbound_einvoice_events", columns: ["provider_key", "provider_event_id"] },
      { table: "purchase_invoices", columns: ["inbound_einvoice_document_id"] },
    );
    checkTables.push(
      "inbound_einvoice_documents", "inbound_einvoice_lines", "supplier_einvoice_identities",
    );
  }

  if (version >= 9) {
    Object.assign(tables, {
      currencies: ["code", "name", "symbol", "minor_unit", "is_base", "is_active", "created_at", "updated_at"],
      business_currency_settings: ["id", "base_currency_code", "metadata_source", "created_at", "updated_at"],
      exchange_rates: ["id", "currency_code", "rate_date", "rate_to_base", "source", "source_reference", "created_by", "created_at"],
    });
    indexes.push(
      "currency_single_base_idx", "currency_active_idx",
      "exchange_rate_currency_date_source_idx", "exchange_rate_date_idx",
      "sales_invoice_currency_idx", "purchase_invoice_currency_idx",
      "receipt_currency_idx", "supplier_payment_currency_idx",
    );
    foreignKeys.push(
      { table: "business_currency_settings", from: "base_currency_code", toTable: "currencies", to: "code" },
      { table: "exchange_rates", from: "currency_code", toTable: "currencies", to: "code" },
    );
    uniqueColumns.push(
      { table: "currencies", columns: ["code"] },
      { table: "currencies", columns: ["is_base"] },
      { table: "exchange_rates", columns: ["currency_code", "rate_date", "source"] },
    );
    checkTables.push("currencies", "business_currency_settings", "exchange_rates");
  }

  return { tables, indexes, foreignKeys, uniqueColumns, checkTables };
}

function candidateVersion(sqlite: Database.Database) {
  if (sqliteColumnExists(sqlite, "customers", "is_active")) return 11;
  if (sqliteColumnExists(sqlite, "document_templates", "settings_json")) return 10;
  if (sqliteTableExists(sqlite, "currencies")) return 9;
  if (sqliteTableExists(sqlite, "inbound_einvoice_documents")) return 8;
  if (sqliteTableExists(sqlite, "einvoice_documents")) return 7;
  if (sqliteTableExists(sqlite, "tax_entries")) return 6;
  if (sqliteTableExists(sqlite, "bank_accounts")) return 5;
  if (sqliteTableExists(sqlite, "inventory_movements")) return 4;
  if (sqliteTableExists(sqlite, "projects")) return 3;
  if (sqliteTableExists(sqlite, "purchase_invoices")) return 2;
  if (sqliteColumnExists(sqlite, "sales_invoices", "document_status")) return 1;
  if (sqliteColumnExists(sqlite, "sales_invoices", "status")) return 0;
  return null;
}

export function detectAndValidateBusinessBaseline(sqlite: Database.Database) {
  const version = candidateVersion(sqlite);
  if (version === null) {
    const knownTable = [
      "customers", "sales_invoices", "sales_invoice_lines", "accounts", "projects",
      "inventory_items", "goods_receipts", "delivery_notes", "bank_accounts", "einvoice_documents",
      "inbound_einvoice_documents",
    ].find((table) => sqliteTableExists(sqlite, table));
    if (knownTable) {
      throw new Error(
        `Cannot adopt legacy business schema: ${knownTable} exists but no complete known baseline could be identified.`,
      );
    }
    return null;
  }
  const issues = validateSqliteSchema(
    sqlite,
    version === 0 ? phase0Expectation : modernExpectation(version),
  );
  if (issues.length) {
    throw new Error(
      `Cannot adopt legacy business schema baseline ${version}: ${issues.slice(0, 12).join("; ")}${issues.length > 12 ? `; and ${issues.length - 12} more issue(s)` : ""}.`,
    );
  }
  return version;
}
