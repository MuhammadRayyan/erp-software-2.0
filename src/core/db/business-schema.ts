import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { accountSubtypes, accountTypes } from "@/modules/accounting/account-types";

export { accountSubtypes, accountTypes };

export const schemaMigrations = sqliteTable("schema_migrations", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  appliedAt: text("applied_at").notNull(),
});

export const currencies = sqliteTable(
  "currencies",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    symbol: text("symbol"),
    minorUnit: integer("minor_unit").notNull(),
    isBase: integer("is_base", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("currency_active_idx").on(table.isActive, table.code)],
);

export const businessCurrencySettings = sqliteTable("business_currency_settings", {
  id: text("id").primaryKey(),
  baseCurrencyCode: text("base_currency_code").notNull().references(() => currencies.code),
  metadataSource: text("metadata_source", {
    enum: ["migration_default", "registry", "configured", "backup"],
  }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: text("id").primaryKey(),
    currencyCode: text("currency_code").notNull().references(() => currencies.code),
    rateDate: text("rate_date").notNull(),
    rateToBase: text("rate_to_base").notNull(),
    source: text("source", { enum: ["Manual", "CBUAE", "Imported", "FutureProvider"] }).notNull(),
    sourceReference: text("source_reference"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("exchange_rate_currency_date_source_idx").on(table.currencyCode, table.rateDate, table.source),
    index("exchange_rate_date_idx").on(table.rateDate, table.currencyCode),
  ],
);

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  taxReference: text("tax_reference"),
  legalName: text("legal_name"),
  trn: text("trn"),
  legalRegistrationIdentifier: text("legal_registration_identifier"),
  electronicAddress: text("electronic_address"),
  electronicAddressScheme: text("electronic_address_scheme"),
  addressLine1: text("address_line_1"),
  city: text("city"),
  countrySubdivision: text("country_subdivision"),
  countryCode: text("country_code"),
  buyerReference: text("buyer_reference"),
  defaultCurrencyCode: text("default_currency_code").notNull().default("AED").references(() => currencies.code),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  billingAddress: text("billing_address"),
  deliveryAddress: text("delivery_address"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  taxReference: text("tax_reference"),
  address: text("address"),
  legalName: text("legal_name"),
  trn: text("trn"),
  legalRegistrationIdentifier: text("legal_registration_identifier"),
  electronicAddress: text("electronic_address"),
  electronicAddressScheme: text("electronic_address_scheme"),
  registeredAddress: text("registered_address"),
  countryCode: text("country_code"),
  notes: text("notes"),
  defaultCurrencyCode: text("default_currency_code").notNull().default("AED").references(() => currencies.code),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: accountTypes }).notNull(),
    subtype: text("subtype", { enum: accountSubtypes }).notNull(),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("account_code_idx").on(table.code)],
);

export const taxCodes = sqliteTable("tax_codes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rateBasisPoints: integer("rate_basis_points").notNull(),
  direction: text("direction", { enum: ["sales", "purchases", "both"] }).notNull().default("both"),
  vatCategory: text("vat_category", {
    enum: ["standard", "zero_rated", "exempt", "out_of_scope", "reverse_charge", "import"],
  }),
  salesTaxAccountId: text("sales_tax_account_id").references(() => accounts.id),
  purchaseTaxAccountId: text("purchase_tax_account_id").references(() => accounts.id),
  isRecoverable: integer("is_recoverable", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accountingSettings = sqliteTable("business_accounting_settings", {
  id: text("id").primaryKey(),
  accountsReceivableAccountId: text("accounts_receivable_account_id")
    .notNull()
    .references(() => accounts.id),
  defaultSalesAccountId: text("default_sales_account_id")
    .notNull()
    .references(() => accounts.id),
  defaultBankAccountId: text("default_bank_account_id")
    .notNull()
    .references(() => accounts.id),
  vatOutputAccountId: text("vat_output_account_id")
    .notNull()
    .references(() => accounts.id),
  accountsPayableAccountId: text("accounts_payable_account_id")
    .notNull()
    .references(() => accounts.id),
  inputVatAccountId: text("input_vat_account_id")
    .notNull()
    .references(() => accounts.id),
  defaultPurchaseExpenseAccountId: text("default_purchase_expense_account_id")
    .notNull()
    .references(() => accounts.id),
  invoicePrefix: text("invoice_prefix").notNull(),
  invoiceNextNumber: integer("invoice_next_number").notNull(),
  invoicePadding: integer("invoice_padding").notNull(),
  receiptPrefix: text("receipt_prefix").notNull(),
  receiptNextNumber: integer("receipt_next_number").notNull(),
  creditNotePrefix: text("credit_note_prefix").notNull(),
  creditNoteNextNumber: integer("credit_note_next_number").notNull(),
  purchaseOrderPrefix: text("purchase_order_prefix").notNull(),
  purchaseOrderNextNumber: integer("purchase_order_next_number").notNull(),
  purchaseInvoicePrefix: text("purchase_invoice_prefix").notNull(),
  purchaseInvoiceNextNumber: integer("purchase_invoice_next_number").notNull(),
  supplierPaymentPrefix: text("supplier_payment_prefix").notNull(),
  supplierPaymentNextNumber: integer("supplier_payment_next_number").notNull(),
  projectPrefix: text("project_prefix").notNull().default("PRJ-"),
  projectNextNumber: integer("project_next_number").notNull().default(1),
  projectPadding: integer("project_padding").notNull().default(4),
  goodsReceiptPrefix: text("goods_receipt_prefix").notNull().default("GR-"),
  goodsReceiptNextNumber: integer("goods_receipt_next_number").notNull().default(1),
  goodsReceiptPadding: integer("goods_receipt_padding").notNull().default(4),
  deliveryNotePrefix: text("delivery_note_prefix").notNull().default("DN-"),
  deliveryNoteNextNumber: integer("delivery_note_next_number").notNull().default(1),
  deliveryNotePadding: integer("delivery_note_padding").notNull().default(4),
  stockAdjustmentPrefix: text("stock_adjustment_prefix").notNull().default("SA-"),
  stockAdjustmentNextNumber: integer("stock_adjustment_next_number").notNull().default(1),
  stockAdjustmentPadding: integer("stock_adjustment_padding").notNull().default(4),
  bankTransactionPrefix: text("bank_transaction_prefix").notNull().default("BT-"),
  bankTransactionNextNumber: integer("bank_transaction_next_number").notNull().default(1),
  bankTransactionPadding: integer("bank_transaction_padding").notNull().default(4),
  bankTransferPrefix: text("bank_transfer_prefix").notNull().default("TRF-"),
  bankTransferNextNumber: integer("bank_transfer_next_number").notNull().default(1),
  bankTransferPadding: integer("bank_transfer_padding").notNull().default(4),
  defaultInventoryAssetAccountId: text("default_inventory_asset_account_id")
    .notNull()
    .default("acct-inventory-1210")
    .references(() => accounts.id),
  defaultCostOfSalesAccountId: text("default_cost_of_sales_account_id")
    .notNull()
    .default("acct-cost-sales-5000")
    .references(() => accounts.id),
  inventoryAdjustmentAccountId: text("inventory_adjustment_account_id")
    .notNull()
    .default("acct-inventory-adjustment-5010")
    .references(() => accounts.id),
  realizedFxGainAccountId: text("realized_fx_gain_account_id").references(() => accounts.id),
  realizedFxLossAccountId: text("realized_fx_loss_account_id").references(() => accounts.id),
  journalPrefix: text("journal_prefix").notNull(),
  journalNextNumber: integer("journal_next_number").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    customerId: text("customer_id").references(() => customers.id),
    status: text("status", {
      enum: ["draft", "active", "on_hold", "completed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    description: text("description"),
    startDate: text("start_date"),
    targetEndDate: text("target_end_date"),
    actualEndDate: text("actual_end_date"),
    budgetRevenueMinor: integer("budget_revenue_minor"),
    budgetCostMinor: integer("budget_cost_minor"),
    managerName: text("manager_name"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("project_code_idx").on(table.code),
    index("project_customer_idx").on(table.customerId),
    index("project_status_idx").on(table.status),
  ],
);

export const projectNotes = sqliteTable(
  "project_notes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at"),
  },
  (table) => [index("project_notes_project_idx").on(table.projectId)],
);

export const projectAttachments = sqliteTable(
  "project_attachments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("project_attachments_project_idx").on(table.projectId),
    uniqueIndex("project_attachment_storage_path_idx").on(table.storagePath),
  ],
);

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    sku: text("sku"),
    name: text("name").notNull(),
    description: text("description"),
    unitName: text("unit_name").notNull(),
    salesPriceMinor: integer("sales_price_minor"),
    purchasePriceMinor: integer("purchase_price_minor"),
    salesAccountId: text("sales_account_id").notNull().references(() => accounts.id),
    inventoryAssetAccountId: text("inventory_asset_account_id").notNull().references(() => accounts.id),
    costOfSalesAccountId: text("cost_of_sales_account_id").notNull().references(() => accounts.id),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("inventory_item_sku_idx").on(table.sku).where(sql`${table.sku} IS NOT NULL`),
    index("inventory_item_name_idx").on(table.name),
  ],
);

export const inventoryLocations = sqliteTable(
  "inventory_locations",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("inventory_location_code_idx").on(table.code)],
);

export const salesInvoices = sqliteTable(
  "sales_invoices",
  {
    id: text("id").primaryKey(),
    invoiceNumber: text("invoice_number").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    projectId: text("project_id").references(() => projects.id),
    invoiceDate: text("invoice_date").notNull(),
    taxDate: text("tax_date").notNull(),
    supplyEmirate: text("supply_emirate", {
      enum: ["abu_dhabi", "dubai", "sharjah", "ajman", "umm_al_quwain", "ras_al_khaimah", "fujairah"],
    }),
    dueDate: text("due_date").notNull(),
    reference: text("reference"),
    eInvoiceTransactionFlagsJson: text("einvoice_transaction_flags_json")
      .notNull()
      .default('{"freeTradeZone":false,"deemedSupply":false,"marginScheme":false,"summaryInvoice":false,"continuousSupply":false,"agentBilling":false,"eCommerce":false,"export":false}'),
    documentStatus: text("document_status", { enum: ["draft", "posted", "void"] })
      .notNull()
      .default("draft"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    currencyCode: text("currency_code").notNull().default("AED").references(() => currencies.code),
    exchangeRateToBase: text("exchange_rate_to_base").notNull().default("1"),
    exchangeRateDate: text("exchange_rate_date").notNull(),
    exchangeRateSource: text("exchange_rate_source").notNull().default("Base"),
    baseSubtotalMinor: integer("base_subtotal_minor").notNull(),
    baseTaxMinor: integer("base_tax_minor").notNull(),
    baseTotalMinor: integer("base_total_minor").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    postedAt: text("posted_at"),
    voidedAt: text("voided_at"),
  },
  (table) => [
    uniqueIndex("sales_invoice_number_idx").on(table.invoiceNumber),
    index("sales_invoice_customer_idx").on(table.customerId),
    index("sales_invoice_project_idx").on(table.projectId),
  ],
);

export const salesInvoiceLines = sqliteTable(
  "sales_invoice_lines",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    salesAccountId: text("sales_account_id")
      .notNull()
      .references(() => accounts.id),
    taxCodeId: text("tax_code_id")
      .notNull()
      .references(() => taxCodes.id),
    projectId: text("project_id").references(() => projects.id),
    itemId: text("item_id").references(() => inventoryItems.id),
    netAmountMinor: integer("net_amount_minor").notNull(),
    taxAmountMinor: integer("tax_amount_minor").notNull(),
    grossAmountMinor: integer("gross_amount_minor").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("sales_invoice_lines_invoice_idx").on(table.invoiceId),
    index("sales_invoice_lines_project_idx").on(table.projectId),
    index("sales_invoice_lines_item_idx").on(table.itemId),
  ],
);

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    entryNumber: text("entry_number").notNull(),
    date: text("date").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    description: text("description").notNull(),
    status: text("status", { enum: ["posted"] }).notNull().default("posted"),
    createdAt: text("created_at").notNull(),
    postedAt: text("posted_at").notNull(),
  },
  (table) => [
    uniqueIndex("journal_entry_number_idx").on(table.entryNumber),
    uniqueIndex("journal_source_idx").on(table.sourceType, table.sourceId),
    index("journal_date_idx").on(table.date),
  ],
);

export const journalLines = sqliteTable(
  "journal_lines",
  {
    id: text("id").primaryKey(),
    journalEntryId: text("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    description: text("description").notNull(),
    debitMinor: integer("debit_minor").notNull().default(0),
    creditMinor: integer("credit_minor").notNull().default(0),
    customerId: text("customer_id").references(() => customers.id),
    supplierId: text("supplier_id").references(() => suppliers.id),
    projectId: text("project_id").references(() => projects.id),
    reference: text("reference"),
    position: integer("position").notNull(),
  },
  (table) => [
    index("journal_lines_entry_idx").on(table.journalEntryId),
    index("journal_lines_account_idx").on(table.accountId),
    index("journal_lines_customer_idx").on(table.customerId),
    index("journal_lines_supplier_idx").on(table.supplierId),
    index("journal_lines_project_idx").on(table.projectId),
    check("journal_line_non_negative", sql`${table.debitMinor} >= 0 AND ${table.creditMinor} >= 0`),
    check(
      "journal_line_one_side",
      sql`(${table.debitMinor} > 0 AND ${table.creditMinor} = 0) OR (${table.creditMinor} > 0 AND ${table.debitMinor} = 0)`,
    ),
  ],
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    receiptNumber: text("receipt_number").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    date: text("date").notNull(),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => accounts.id),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code").notNull().default("AED").references(() => currencies.code),
    exchangeRateToBase: text("exchange_rate_to_base").notNull().default("1"),
    exchangeRateDate: text("exchange_rate_date").notNull(),
    exchangeRateSource: text("exchange_rate_source").notNull().default("Base"),
    baseAmountMinor: integer("base_amount_minor").notNull(),
    releasedCarryingAmountMinor: integer("released_carrying_amount_minor").notNull(),
    realizedFxAmountMinor: integer("realized_fx_amount_minor").notNull(),
    reference: text("reference"),
    description: text("description"),
    documentStatus: text("document_status", { enum: ["posted", "void"] })
      .notNull()
      .default("posted"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    postedAt: text("posted_at").notNull(),
    voidedAt: text("voided_at"),
  },
  (table) => [
    uniqueIndex("receipt_number_idx").on(table.receiptNumber),
    index("receipt_customer_idx").on(table.customerId),
  ],
);

export const receiptAllocations = sqliteTable(
  "receipt_allocations",
  {
    id: text("id").primaryKey(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    salesInvoiceId: text("sales_invoice_id")
      .notNull()
      .references(() => salesInvoices.id),
    amountMinor: integer("amount_minor").notNull(),
    foreignAmountAllocated: integer("foreign_amount_allocated").notNull(),
    baseCarryingAmountReleased: integer("base_carrying_amount_released").notNull(),
    settlementBaseAmount: integer("settlement_base_amount").notNull(),
    realizedFxAmount: integer("realized_fx_amount").notNull(),
  },
  (table) => [
    uniqueIndex("receipt_invoice_allocation_idx").on(table.receiptId, table.salesInvoiceId),
    index("receipt_allocation_invoice_idx").on(table.salesInvoiceId),
    check("receipt_allocation_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const purchaseOrders = sqliteTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    supplierId: text("supplier_id").notNull().references(() => suppliers.id),
    projectId: text("project_id").references(() => projects.id),
    date: text("date").notNull(),
    expectedDate: text("expected_date"),
    reference: text("reference"),
    notes: text("notes"),
    status: text("status", { enum: ["draft", "issued", "closed", "cancelled"] }).notNull().default("draft"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    currencyCode: text("currency_code").notNull().default("AED").references(() => currencies.code),
    exchangeRateToBase: text("exchange_rate_to_base").notNull().default("1"),
    exchangeRateDate: text("exchange_rate_date").notNull(),
    exchangeRateSource: text("exchange_rate_source").notNull().default("Base"),
    baseSubtotalMinor: integer("base_subtotal_minor").notNull(),
    baseTaxMinor: integer("base_tax_minor").notNull(),
    baseTotalMinor: integer("base_total_minor").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    issuedAt: text("issued_at"),
    closedAt: text("closed_at"),
    cancelledAt: text("cancelled_at"),
  },
  (table) => [
    uniqueIndex("purchase_order_number_idx").on(table.orderNumber),
    index("purchase_order_supplier_idx").on(table.supplierId),
    index("purchase_order_project_idx").on(table.projectId),
  ],
);

export const purchaseOrderLines = sqliteTable(
  "purchase_order_lines",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    expenseAccountId: text("expense_account_id").references(() => accounts.id),
    taxCodeId: text("tax_code_id").notNull().references(() => taxCodes.id),
    projectId: text("project_id").references(() => projects.id),
    itemId: text("item_id").references(() => inventoryItems.id),
    netAmountMinor: integer("net_amount_minor").notNull(),
    taxAmountMinor: integer("tax_amount_minor").notNull(),
    grossAmountMinor: integer("gross_amount_minor").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("purchase_order_lines_order_idx").on(table.purchaseOrderId),
    index("purchase_order_lines_project_idx").on(table.projectId),
    index("purchase_order_lines_item_idx").on(table.itemId),
  ],
);

export const purchaseInvoices = sqliteTable(
  "purchase_invoices",
  {
    id: text("id").primaryKey(),
    internalNumber: text("internal_number").notNull(),
    supplierId: text("supplier_id").notNull().references(() => suppliers.id),
    projectId: text("project_id").references(() => projects.id),
    supplierInvoiceNumber: text("supplier_invoice_number").notNull(),
    invoiceDate: text("invoice_date").notNull(),
    taxDate: text("tax_date").notNull(),
    dueDate: text("due_date").notNull(),
    reference: text("reference"),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
    documentStatus: text("document_status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    currencyCode: text("currency_code").notNull().default("AED").references(() => currencies.code),
    exchangeRateToBase: text("exchange_rate_to_base").notNull().default("1"),
    exchangeRateDate: text("exchange_rate_date").notNull(),
    exchangeRateSource: text("exchange_rate_source").notNull().default("Base"),
    baseSubtotalMinor: integer("base_subtotal_minor").notNull(),
    baseTaxMinor: integer("base_tax_minor").notNull(),
    baseTotalMinor: integer("base_total_minor").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    postedAt: text("posted_at"),
    voidedAt: text("voided_at"),
    inboundEInvoiceDocumentId: text("inbound_einvoice_document_id"),
  },
  (table) => [
    uniqueIndex("purchase_invoice_number_idx").on(table.internalNumber),
    index("purchase_invoice_supplier_idx").on(table.supplierId),
    index("purchase_invoice_order_idx").on(table.purchaseOrderId),
    index("purchase_invoice_project_idx").on(table.projectId),
    uniqueIndex("purchase_invoice_inbound_source_idx").on(table.inboundEInvoiceDocumentId),
    index("purchase_invoice_supplier_document_idx").on(table.supplierId, table.supplierInvoiceNumber, table.documentStatus),
  ],
);

export const purchaseInvoiceLines = sqliteTable(
  "purchase_invoice_lines",
  {
    id: text("id").primaryKey(),
    purchaseInvoiceId: text("purchase_invoice_id").notNull().references(() => purchaseInvoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    expenseAccountId: text("expense_account_id").notNull().references(() => accounts.id),
    taxCodeId: text("tax_code_id").notNull().references(() => taxCodes.id),
    projectId: text("project_id").references(() => projects.id),
    itemId: text("item_id").references(() => inventoryItems.id),
    netAmountMinor: integer("net_amount_minor").notNull(),
    taxAmountMinor: integer("tax_amount_minor").notNull(),
    grossAmountMinor: integer("gross_amount_minor").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("purchase_invoice_lines_invoice_idx").on(table.purchaseInvoiceId),
    index("purchase_invoice_lines_project_idx").on(table.projectId),
    index("purchase_invoice_lines_item_idx").on(table.itemId),
  ],
);

export const supplierPayments = sqliteTable(
  "supplier_payments",
  {
    id: text("id").primaryKey(),
    paymentNumber: text("payment_number").notNull(),
    supplierId: text("supplier_id").notNull().references(() => suppliers.id),
    date: text("date").notNull(),
    bankAccountId: text("bank_account_id").notNull().references(() => accounts.id),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: text("currency_code").notNull().default("AED").references(() => currencies.code),
    exchangeRateToBase: text("exchange_rate_to_base").notNull().default("1"),
    exchangeRateDate: text("exchange_rate_date").notNull(),
    exchangeRateSource: text("exchange_rate_source").notNull().default("Base"),
    baseAmountMinor: integer("base_amount_minor").notNull(),
    releasedCarryingAmountMinor: integer("released_carrying_amount_minor").notNull(),
    realizedFxAmountMinor: integer("realized_fx_amount_minor").notNull(),
    reference: text("reference"),
    description: text("description"),
    documentStatus: text("document_status", { enum: ["posted", "void"] }).notNull().default("posted"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    postedAt: text("posted_at").notNull(),
    voidedAt: text("voided_at"),
  },
  (table) => [
    uniqueIndex("supplier_payment_number_idx").on(table.paymentNumber),
    index("supplier_payment_supplier_idx").on(table.supplierId),
  ],
);

export const supplierPaymentAllocations = sqliteTable(
  "supplier_payment_allocations",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id").notNull().references(() => supplierPayments.id, { onDelete: "cascade" }),
    purchaseInvoiceId: text("purchase_invoice_id").notNull().references(() => purchaseInvoices.id),
    amountMinor: integer("amount_minor").notNull(),
    foreignAmountAllocated: integer("foreign_amount_allocated").notNull(),
    baseCarryingAmountReleased: integer("base_carrying_amount_released").notNull(),
    settlementBaseAmount: integer("settlement_base_amount").notNull(),
    realizedFxAmount: integer("realized_fx_amount").notNull(),
  },
  (table) => [
    uniqueIndex("supplier_payment_invoice_allocation_idx").on(table.paymentId, table.purchaseInvoiceId),
    index("supplier_payment_allocation_invoice_idx").on(table.purchaseInvoiceId),
    check("supplier_payment_allocation_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const salesCreditNotes = sqliteTable(
  "sales_credit_notes",
  {
    id: text("id").primaryKey(),
    creditNoteNumber: text("credit_note_number").notNull(),
    customerId: text("customer_id").notNull().references(() => customers.id),
    projectId: text("project_id").references(() => projects.id),
    sourceInvoiceId: text("source_invoice_id").notNull().references(() => salesInvoices.id),
    date: text("date").notNull(),
    taxDate: text("tax_date").notNull(),
    supplyEmirate: text("supply_emirate", {
      enum: ["abu_dhabi", "dubai", "sharjah", "ajman", "umm_al_quwain", "ras_al_khaimah", "fujairah"],
    }),
    reference: text("reference"),
    reason: text("reason"),
    eInvoiceReasonCode: text("einvoice_reason_code"),
    eInvoiceTransactionFlagsJson: text("einvoice_transaction_flags_json")
      .notNull()
      .default('{"freeTradeZone":false,"deemedSupply":false,"marginScheme":false,"summaryInvoice":false,"continuousSupply":false,"agentBilling":false,"eCommerce":false,"export":false}'),
    documentStatus: text("document_status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    currencyCode: text("currency_code").notNull().default("AED").references(() => currencies.code),
    exchangeRateToBase: text("exchange_rate_to_base").notNull().default("1"),
    exchangeRateDate: text("exchange_rate_date").notNull(),
    exchangeRateSource: text("exchange_rate_source").notNull().default("Base"),
    baseSubtotalMinor: integer("base_subtotal_minor").notNull(),
    baseTaxMinor: integer("base_tax_minor").notNull(),
    baseTotalMinor: integer("base_total_minor").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    postedAt: text("posted_at"),
    voidedAt: text("voided_at"),
  },
  (table) => [
    uniqueIndex("sales_credit_note_number_idx").on(table.creditNoteNumber),
    index("sales_credit_note_customer_idx").on(table.customerId),
    index("sales_credit_note_invoice_idx").on(table.sourceInvoiceId),
    index("sales_credit_note_project_idx").on(table.projectId),
  ],
);

export const salesCreditNoteLines = sqliteTable(
  "sales_credit_note_lines",
  {
    id: text("id").primaryKey(),
    creditNoteId: text("credit_note_id").notNull().references(() => salesCreditNotes.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    salesAccountId: text("sales_account_id").notNull().references(() => accounts.id),
    taxCodeId: text("tax_code_id").notNull().references(() => taxCodes.id),
    projectId: text("project_id").references(() => projects.id),
    netAmountMinor: integer("net_amount_minor").notNull(),
    taxAmountMinor: integer("tax_amount_minor").notNull(),
    grossAmountMinor: integer("gross_amount_minor").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("sales_credit_note_lines_note_idx").on(table.creditNoteId),
    index("sales_credit_note_lines_project_idx").on(table.projectId),
  ],
);

export const salesCreditNoteAllocations = sqliteTable(
  "sales_credit_note_allocations",
  {
    id: text("id").primaryKey(),
    creditNoteId: text("credit_note_id").notNull().references(() => salesCreditNotes.id, { onDelete: "cascade" }),
    salesInvoiceId: text("sales_invoice_id").notNull().references(() => salesInvoices.id),
    amountMinor: integer("amount_minor").notNull(),
    foreignAmountAllocated: integer("foreign_amount_allocated").notNull(),
    baseCarryingAmountReleased: integer("base_carrying_amount_released").notNull(),
  },
  (table) => [
    uniqueIndex("sales_credit_note_invoice_allocation_idx").on(table.creditNoteId, table.salesInvoiceId),
    index("sales_credit_note_allocation_invoice_idx").on(table.salesInvoiceId),
    check("sales_credit_note_allocation_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const goodsReceipts = sqliteTable(
  "goods_receipts",
  {
    id: text("id").primaryKey(),
    receiptNumber: text("receipt_number").notNull(),
    supplierId: text("supplier_id").notNull().references(() => suppliers.id),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
    purchaseInvoiceId: text("purchase_invoice_id").references(() => purchaseInvoices.id),
    date: text("date").notNull(),
    locationId: text("location_id").notNull().references(() => inventoryLocations.id),
    reference: text("reference"),
    projectId: text("project_id").references(() => projects.id),
    notes: text("notes"),
    documentStatus: text("document_status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    postedAt: text("posted_at"),
    voidedAt: text("voided_at"),
  },
  (table) => [
    uniqueIndex("goods_receipt_number_idx").on(table.receiptNumber),
    index("goods_receipt_supplier_idx").on(table.supplierId),
    index("goods_receipt_order_idx").on(table.purchaseOrderId),
    index("goods_receipt_invoice_idx").on(table.purchaseInvoiceId),
  ],
);

export const goodsReceiptLines = sqliteTable(
  "goods_receipt_lines",
  {
    id: text("id").primaryKey(),
    goodsReceiptId: text("goods_receipt_id").notNull().references(() => goodsReceipts.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().references(() => inventoryItems.id),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    unitCostMinor: integer("unit_cost_minor").notNull(),
    projectId: text("project_id").references(() => projects.id),
    purchaseOrderLineId: text("purchase_order_line_id").references(() => purchaseOrderLines.id),
    purchaseInvoiceLineId: text("purchase_invoice_line_id").references(() => purchaseInvoiceLines.id),
    position: integer("position").notNull(),
  },
  (table) => [
    index("goods_receipt_lines_receipt_idx").on(table.goodsReceiptId),
    index("goods_receipt_lines_order_line_idx").on(table.purchaseOrderLineId),
  ],
);

export const deliveryNotes = sqliteTable(
  "delivery_notes",
  {
    id: text("id").primaryKey(),
    deliveryNumber: text("delivery_number").notNull(),
    customerId: text("customer_id").notNull().references(() => customers.id),
    salesInvoiceId: text("sales_invoice_id").references(() => salesInvoices.id),
    date: text("date").notNull(),
    locationId: text("location_id").notNull().references(() => inventoryLocations.id),
    reference: text("reference"),
    projectId: text("project_id").references(() => projects.id),
    notes: text("notes"),
    documentStatus: text("document_status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    postedAt: text("posted_at"),
    voidedAt: text("voided_at"),
  },
  (table) => [
    uniqueIndex("delivery_note_number_idx").on(table.deliveryNumber),
    index("delivery_note_customer_idx").on(table.customerId),
    index("delivery_note_invoice_idx").on(table.salesInvoiceId),
  ],
);

export const deliveryNoteLines = sqliteTable(
  "delivery_note_lines",
  {
    id: text("id").primaryKey(),
    deliveryNoteId: text("delivery_note_id").notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().references(() => inventoryItems.id),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    projectId: text("project_id").references(() => projects.id),
    salesInvoiceLineId: text("sales_invoice_line_id").references(() => salesInvoiceLines.id),
    position: integer("position").notNull(),
  },
  (table) => [
    index("delivery_note_lines_note_idx").on(table.deliveryNoteId),
    index("delivery_note_lines_invoice_line_idx").on(table.salesInvoiceLineId),
  ],
);

export const stockAdjustments = sqliteTable(
  "stock_adjustments",
  {
    id: text("id").primaryKey(),
    adjustmentNumber: text("adjustment_number").notNull(),
    date: text("date").notNull(),
    locationId: text("location_id").notNull().references(() => inventoryLocations.id),
    itemId: text("item_id").notNull().references(() => inventoryItems.id),
    quantityDeltaMicros: integer("quantity_delta_micros").notNull(),
    unitCostMinor: integer("unit_cost_minor"),
    reason: text("reason").notNull(),
    projectId: text("project_id").references(() => projects.id),
    notes: text("notes"),
    documentStatus: text("document_status", { enum: ["draft", "posted", "void"] }).notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    postedAt: text("posted_at"),
    voidedAt: text("voided_at"),
  },
  (table) => [uniqueIndex("stock_adjustment_number_idx").on(table.adjustmentNumber)],
);

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    itemId: text("item_id").notNull().references(() => inventoryItems.id),
    locationId: text("location_id").notNull().references(() => inventoryLocations.id),
    movementType: text("movement_type", {
      enum: ["goods_receipt", "delivery", "adjustment_in", "adjustment_out", "opening_balance"],
    }).notNull(),
    quantityDeltaMicros: integer("quantity_delta_micros").notNull(),
    unitCostMicros: integer("unit_cost_micros").notNull(),
    valueDeltaMinor: integer("value_delta_minor").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceLineId: text("source_line_id"),
    projectId: text("project_id").references(() => projects.id),
    description: text("description"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("inventory_movement_item_location_idx").on(table.itemId, table.locationId),
    index("inventory_movement_source_idx").on(table.sourceType, table.sourceId),
    index("inventory_movement_date_idx").on(table.date),
    index("inventory_movement_project_idx").on(table.projectId),
    check("inventory_movement_non_zero_quantity", sql`${table.quantityDeltaMicros} <> 0`),
    check("inventory_movement_non_negative_cost", sql`${table.unitCostMicros} >= 0`),
  ],
);

export const bankAccounts = sqliteTable(
  "bank_accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    accountCode: text("account_code"),
    bankName: text("bank_name"),
    accountNumberMasked: text("account_number_masked"),
    currencyCode: text("currency_code").notNull(),
    ledgerAccountId: text("ledger_account_id").notNull().references(() => accounts.id),
    isCashAccount: integer("is_cash_account", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("bank_account_ledger_idx").on(table.ledgerAccountId),
    index("bank_account_active_idx").on(table.isActive),
    check("bank_account_currency_code", sql`length(${table.currencyCode}) = 3`),
  ],
);

export const bankStatementImports = sqliteTable(
  "bank_statement_imports",
  {
    id: text("id").primaryKey(),
    bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id),
    fileName: text("file_name").notNull(),
    rowCount: integer("row_count").notNull(),
    importedCount: integer("imported_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull(),
    mappingJson: text("mapping_json").notNull(),
    status: text("status", { enum: ["completed"] }).notNull().default("completed"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("bank_statement_import_account_idx").on(table.bankAccountId),
    check("bank_statement_import_counts", sql`${table.rowCount} > 0 AND ${table.importedCount} >= 0 AND ${table.duplicateCount} >= 0`),
  ],
);

export const bankStatementLines = sqliteTable(
  "bank_statement_lines",
  {
    id: text("id").primaryKey(),
    importId: text("import_id").notNull().references(() => bankStatementImports.id, { onDelete: "cascade" }),
    bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id),
    transactionDate: text("transaction_date").notNull(),
    valueDate: text("value_date"),
    description: text("description").notNull(),
    reference: text("reference"),
    amountMinor: integer("amount_minor").notNull(),
    externalId: text("external_id"),
    fingerprint: text("fingerprint").notNull(),
    matchStatus: text("match_status", { enum: ["unmatched", "matched", "created", "ignored"] })
      .notNull()
      .default("unmatched"),
    matchedSourceType: text("matched_source_type"),
    matchedSourceId: text("matched_source_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("bank_statement_line_fingerprint_idx").on(table.bankAccountId, table.fingerprint),
    index("bank_statement_line_account_status_idx").on(table.bankAccountId, table.matchStatus),
    index("bank_statement_line_source_idx").on(table.matchedSourceType, table.matchedSourceId),
    check("bank_statement_line_non_zero_amount", sql`${table.amountMinor} <> 0`),
  ],
);

export const bankTransactions = sqliteTable(
  "bank_transactions",
  {
    id: text("id").primaryKey(),
    transactionNumber: text("transaction_number").notNull(),
    bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id),
    date: text("date").notNull(),
    taxDate: text("tax_date").notNull(),
    supplyEmirate: text("supply_emirate", {
      enum: ["abu_dhabi", "dubai", "sharjah", "ajman", "umm_al_quwain", "ras_al_khaimah", "fujairah"],
    }),
    type: text("type", { enum: ["money_in", "money_out"] }).notNull(),
    reference: text("reference"),
    description: text("description").notNull(),
    totalMinor: integer("total_minor").notNull(),
    statementLineId: text("statement_line_id").references(() => bankStatementLines.id),
    documentStatus: text("document_status", { enum: ["draft", "posted", "void"] })
      .notNull()
      .default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    postedAt: text("posted_at"),
    voidedAt: text("voided_at"),
  },
  (table) => [
    uniqueIndex("bank_transaction_number_idx").on(table.transactionNumber),
    uniqueIndex("bank_transaction_statement_line_idx").on(table.statementLineId).where(sql`${table.statementLineId} IS NOT NULL`),
    index("bank_transaction_account_idx").on(table.bankAccountId),
    check("bank_transaction_positive_total", sql`${table.totalMinor} > 0`),
  ],
);

export const bankTransactionLines = sqliteTable(
  "bank_transaction_lines",
  {
    id: text("id").primaryKey(),
    bankTransactionId: text("bank_transaction_id").notNull().references(() => bankTransactions.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => accounts.id),
    taxCodeId: text("tax_code_id").references(() => taxCodes.id),
    projectId: text("project_id").references(() => projects.id),
    description: text("description").notNull(),
    netAmountMinor: integer("net_amount_minor").notNull(),
    taxAmountMinor: integer("tax_amount_minor").notNull(),
    grossAmountMinor: integer("gross_amount_minor").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("bank_transaction_line_transaction_idx").on(table.bankTransactionId),
    index("bank_transaction_line_project_idx").on(table.projectId),
    check("bank_transaction_line_positive_net", sql`${table.netAmountMinor} > 0`),
    check("bank_transaction_line_non_negative_tax", sql`${table.taxAmountMinor} >= 0`),
    check("bank_transaction_line_positive_gross", sql`${table.grossAmountMinor} > 0`),
    check("bank_transaction_line_total", sql`${table.grossAmountMinor} = ${table.netAmountMinor} + ${table.taxAmountMinor}`),
  ],
);

export const bankTransfers = sqliteTable(
  "bank_transfers",
  {
    id: text("id").primaryKey(),
    transferNumber: text("transfer_number").notNull(),
    fromBankAccountId: text("from_bank_account_id").notNull().references(() => bankAccounts.id),
    toBankAccountId: text("to_bank_account_id").notNull().references(() => bankAccounts.id),
    date: text("date").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    reference: text("reference"),
    description: text("description"),
    documentStatus: text("document_status", { enum: ["posted", "void"] }).notNull().default("posted"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    postedAt: text("posted_at").notNull(),
    voidedAt: text("voided_at"),
  },
  (table) => [
    uniqueIndex("bank_transfer_number_idx").on(table.transferNumber),
    index("bank_transfer_from_idx").on(table.fromBankAccountId),
    index("bank_transfer_to_idx").on(table.toBankAccountId),
    check("bank_transfer_positive_amount", sql`${table.amountMinor} > 0`),
    check("bank_transfer_different_accounts", sql`${table.fromBankAccountId} <> ${table.toBankAccountId}`),
  ],
);

export const bankReconciliations = sqliteTable(
  "bank_reconciliations",
  {
    id: text("id").primaryKey(),
    bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id),
    statementDate: text("statement_date").notNull(),
    statementEndingBalanceMinor: integer("statement_ending_balance_minor").notNull(),
    status: text("status", { enum: ["draft", "completed"] }).notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [index("bank_reconciliation_account_date_idx").on(table.bankAccountId, table.statementDate)],
);

export const bankReconciliationItems = sqliteTable(
  "bank_reconciliation_items",
  {
    id: text("id").primaryKey(),
    reconciliationId: text("reconciliation_id").notNull().references(() => bankReconciliations.id, { onDelete: "cascade" }),
    statementLineId: text("statement_line_id").notNull().references(() => bankStatementLines.id),
    journalEntryId: text("journal_entry_id").notNull().references(() => journalEntries.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("bank_reconciliation_statement_line_idx").on(table.statementLineId),
    index("bank_reconciliation_item_reconciliation_idx").on(table.reconciliationId),
    index("bank_reconciliation_item_journal_idx").on(table.journalEntryId),
  ],
);

export const businessTaxSettings = sqliteTable("business_tax_settings", {
  id: text("id").primaryKey(),
  vatRegistered: integer("vat_registered", { mode: "boolean" }).notNull().default(false),
  trn: text("trn"),
  vatRegistrationEffectiveDate: text("vat_registration_effective_date"),
  vatDeregistrationDate: text("vat_deregistration_date"),
  defaultSupplyEmirate: text("default_supply_emirate", {
    enum: ["abu_dhabi", "dubai", "sharjah", "ajman", "umm_al_quwain", "ras_al_khaimah", "fujairah"],
  }),
  taxLockDate: text("tax_lock_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const vatPeriods = sqliteTable(
  "vat_periods",
  {
    id: text("id").primaryKey(),
    periodReference: text("period_reference").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    filingDueDate: text("filing_due_date").notNull(),
    status: text("status", { enum: ["open", "prepared", "finalized", "filed_externally", "reopened"] }).notNull().default("open"),
    finalizedAt: text("finalized_at"),
    finalizedBy: text("finalized_by"),
    filedAt: text("filed_at"),
    filedBy: text("filed_by"),
    filingReference: text("filing_reference"),
    reopenedAt: text("reopened_at"),
    reopenedBy: text("reopened_by"),
    reopenReason: text("reopen_reason"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("vat_period_reference_idx").on(table.periodReference),
    index("vat_period_date_idx").on(table.startDate, table.endDate),
    index("vat_period_status_idx").on(table.status),
  ],
);

export const taxEntries = sqliteTable(
  "tax_entries",
  {
    id: text("id").primaryKey(),
    taxDate: text("tax_date").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceLineId: text("source_line_id").notNull(),
    sourceNumber: text("source_number").notNull(),
    partyName: text("party_name"),
    taxCodeId: text("tax_code_id").notNull().references(() => taxCodes.id),
    taxCodeName: text("tax_code_name").notNull(),
    rateBasisPoints: integer("rate_basis_points").notNull(),
    vatCategory: text("vat_category", {
      enum: ["standard", "zero_rated", "exempt", "out_of_scope", "reverse_charge", "import"],
    }).notNull(),
    direction: text("direction", { enum: ["sales", "purchases"] }).notNull(),
    netAmountMinor: integer("net_amount_minor").notNull(),
    vatAmountMinor: integer("vat_amount_minor").notNull(),
    documentCurrency: text("document_currency").notNull().default("AED"),
    foreignNetMinor: integer("foreign_net_minor").notNull(),
    foreignVatMinor: integer("foreign_vat_minor").notNull(),
    exchangeRateToBase: text("exchange_rate_to_base").notNull().default("1"),
    baseNetMinor: integer("base_net_minor").notNull(),
    baseVatMinor: integer("base_vat_minor").notNull(),
    rateDate: text("rate_date").notNull(),
    rateSource: text("rate_source").notNull().default("Base"),
    outputVatMinor: integer("output_vat_minor").notNull().default(0),
    recoverableVatMinor: integer("recoverable_vat_minor").notNull().default(0),
    supplyEmirate: text("supply_emirate", {
      enum: ["abu_dhabi", "dubai", "sharjah", "ajman", "umm_al_quwain", "ras_al_khaimah", "fujairah"],
    }),
    projectId: text("project_id").references(() => projects.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("tax_entry_source_line_idx").on(table.sourceType, table.sourceId, table.sourceLineId),
    index("tax_entry_date_idx").on(table.taxDate),
    index("tax_entry_source_idx").on(table.sourceType, table.sourceId),
    index("tax_entry_bucket_idx").on(table.direction, table.vatCategory, table.taxDate),
    index("tax_entry_emirate_idx").on(table.supplyEmirate, table.taxDate),
    index("tax_entry_tax_code_idx").on(table.taxCodeId),
  ],
);

export const vatAdjustments = sqliteTable(
  "vat_adjustments",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id").notNull().references(() => vatPeriods.id, { onDelete: "cascade" }),
    reportBucket: text("report_bucket").notNull(),
    amountMinor: integer("amount_minor").notNull().default(0),
    vatAmountMinor: integer("vat_amount_minor").notNull().default(0),
    reason: text("reason").notNull(),
    reference: text("reference"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("vat_adjustment_period_idx").on(table.periodId)],
);

export const vatPeriodSnapshots = sqliteTable(
  "vat_period_snapshots",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id").notNull().references(() => vatPeriods.id, { onDelete: "cascade" }),
    snapshotKind: text("snapshot_kind", { enum: ["finalized", "filed_externally"] }).notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("vat_snapshot_period_idx").on(table.periodId, table.createdAt)],
);

export const vatPeriodAudit = sqliteTable(
  "vat_period_audit",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id").notNull().references(() => vatPeriods.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["created", "prepared", "finalized", "reopened", "filed_externally", "adjustment_added"] }).notNull(),
    reasonOrReference: text("reason_or_reference"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("vat_period_audit_period_idx").on(table.periodId, table.createdAt)],
);

export const vatDataReview = sqliteTable(
  "vat_data_review",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceLineId: text("source_line_id").notNull(),
    taxDate: text("tax_date").notNull(),
    issueType: text("issue_type", { enum: ["ambiguous_zero_rate", "missing_emirate", "missing_classification"] }).notNull(),
    details: text("details").notNull(),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("vat_data_review_source_issue_idx").on(table.sourceType, table.sourceId, table.sourceLineId, table.issueType),
    index("vat_data_review_date_idx").on(table.taxDate, table.status),
    index("vat_data_review_source_idx").on(table.sourceType, table.sourceId),
  ],
);

export const businessEInvoiceSettings = sqliteTable("business_einvoice_settings", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  legalName: text("legal_name"),
  legalRegistrationIdentifier: text("legal_registration_identifier"),
  addressLine1: text("address_line_1"),
  city: text("city"),
  countrySubdivision: text("country_subdivision"),
  countryCode: text("country_code").notNull().default("AE"),
  participantIdentifier: text("participant_identifier"),
  participantIdentifierScheme: text("participant_identifier_scheme"),
  endpointIdentifier: text("endpoint_identifier"),
  endpointIdentifierScheme: text("endpoint_identifier_scheme"),
  aspProviderKey: text("asp_provider_key"),
  aspEnvironment: text("asp_environment", {
    enum: ["disabled", "mock", "sandbox", "production"],
  }).notNull().default("disabled"),
  specificationVersion: text("specification_version").notNull().default("1.0.4"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const eInvoiceDocuments = sqliteTable(
  "einvoice_documents",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type", { enum: ["sales_invoice", "sales_credit_note"] }).notNull(),
    sourceId: text("source_id").notNull(),
    documentType: text("document_type", { enum: ["invoice", "credit_note"] }).notNull(),
    uuid: text("uuid").notNull(),
    specificationVersion: text("specification_version").notNull(),
    status: text("status", {
      enum: ["NotPrepared", "NeedsData", "ValidationFailed", "Ready", "Submitted", "Accepted", "Rejected"],
    }).notNull().default("NotPrepared"),
    canonicalJson: text("canonical_json"),
    xmlPayload: text("xml_payload"),
    payloadHash: text("payload_hash"),
    validationJson: text("validation_json"),
    providerKey: text("provider_key"),
    providerEnvironment: text("provider_environment"),
    exchangeStatus: text("exchange_status"),
    reportingStatus: text("reporting_status"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    validatedAt: text("validated_at"),
    submittedAt: text("submitted_at"),
    acceptedAt: text("accepted_at"),
    rejectedAt: text("rejected_at"),
  },
  (table) => [
    uniqueIndex("einvoice_document_source_idx").on(table.sourceType, table.sourceId),
    uniqueIndex("einvoice_document_uuid_idx").on(table.uuid),
    index("einvoice_document_status_idx").on(table.status, table.updatedAt),
  ],
);

export const eInvoiceSubmissions = sqliteTable(
  "einvoice_submissions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => eInvoiceDocuments.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull(),
    providerEnvironment: text("provider_environment").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status", { enum: ["Submitted", "Accepted", "Rejected", "Failed"] }).notNull(),
    providerRequestId: text("provider_request_id"),
    exchangeStatus: text("exchange_status"),
    reportingStatus: text("reporting_status"),
    responseCode: text("response_code"),
    responsePayload: text("response_payload"),
    errorMessage: text("error_message"),
    submittedAt: text("submitted_at").notNull(),
    respondedAt: text("responded_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("einvoice_submission_attempt_idx").on(table.documentId, table.attemptNumber),
    index("einvoice_submission_document_idx").on(table.documentId, table.createdAt),
  ],
);

export const inboundEInvoiceDocuments = sqliteTable(
  "inbound_einvoice_documents",
  {
    id: text("id").primaryKey(),
    providerKey: text("provider_key").notNull(),
    environment: text("environment").notNull(),
    providerDocumentId: text("provider_document_id"),
    documentType: text("document_type", { enum: ["invoice", "credit_note"] }).notNull(),
    specificationVersion: text("specification_version").notNull(),
    documentUuid: text("document_uuid").notNull(),
    sellerEndpointId: text("seller_endpoint_id"),
    sellerEndpointScheme: text("seller_endpoint_scheme"),
    sellerTrn: text("seller_trn"),
    sellerLegalRegistrationIdentifier: text("seller_legal_registration_identifier"),
    sellerLegalName: text("seller_legal_name").notNull(),
    buyerEndpointId: text("buyer_endpoint_id"),
    buyerEndpointScheme: text("buyer_endpoint_scheme"),
    buyerTrn: text("buyer_trn"),
    buyerLegalRegistrationIdentifier: text("buyer_legal_registration_identifier"),
    buyerLegalName: text("buyer_legal_name"),
    documentNumber: text("document_number").notNull(),
    issueDate: text("issue_date").notNull(),
    taxDate: text("tax_date"),
    dueDate: text("due_date"),
    currencyCode: text("currency_code").notNull(),
    sourceInvoiceReference: text("source_invoice_reference"),
    status: text("status", {
      enum: [
        "Received", "ValidationFailed", "Validated", "NeedsSupplier", "NeedsReview",
        "ReadyForDraft", "DraftCreated", "Processed", "Rejected", "Archived",
      ],
    }).notNull().default("Received"),
    networkStatus: text("network_status"),
    rawXml: text("raw_xml").notNull(),
    rawHash: text("raw_hash").notNull(),
    canonicalJson: text("canonical_json").notNull(),
    validationResultJson: text("validation_result_json"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    allowanceTotalMinor: integer("allowance_total_minor").notNull().default(0),
    chargeTotalMinor: integer("charge_total_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    amountDueMinor: integer("amount_due_minor").notNull(),
    buyerIdentityVerified: integer("buyer_identity_verified", { mode: "boolean" }).notNull().default(false),
    supplierId: text("supplier_id").references(() => suppliers.id),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
    goodsReceiptId: text("goods_receipt_id").references(() => goodsReceipts.id),
    purchaseInvoiceId: text("purchase_invoice_id").references(() => purchaseInvoices.id, { onDelete: "set null" }),
    duplicateOfId: text("duplicate_of_id"),
    duplicateKind: text("duplicate_kind", { enum: ["hard", "likely"] }),
    lastError: text("last_error"),
    rejectionReason: text("rejection_reason"),
    receivedAt: text("received_at").notNull(),
    validatedAt: text("validated_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("inbound_einvoice_provider_document_idx").on(table.providerKey, table.environment, table.providerDocumentId),
    uniqueIndex("inbound_einvoice_raw_hash_idx").on(table.rawHash),
    index("inbound_einvoice_status_received_idx").on(table.status, table.receivedAt),
    index("inbound_einvoice_supplier_number_idx").on(table.supplierId, table.documentNumber),
    index("inbound_einvoice_purchase_order_idx").on(table.purchaseOrderId),
    index("inbound_einvoice_goods_receipt_idx").on(table.goodsReceiptId),
    index("inbound_einvoice_purchase_invoice_idx").on(table.purchaseInvoiceId),
  ],
);

export const inboundEInvoiceLines = sqliteTable(
  "inbound_einvoice_lines",
  {
    id: text("id").primaryKey(),
    inboundDocumentId: text("inbound_document_id").notNull().references(() => inboundEInvoiceDocuments.id, { onDelete: "cascade" }),
    sourceLineId: text("source_line_id").notNull(),
    orderLineReference: text("order_line_reference"),
    supplierItemIdentifier: text("supplier_item_identifier"),
    erpItemIdentifier: text("erp_item_identifier"),
    description: text("description").notNull(),
    itemName: text("item_name"),
    quantityMicros: integer("quantity_micros").notNull(),
    unitCode: text("unit_code").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    netAmountMinor: integer("net_amount_minor").notNull(),
    taxAmountMinor: integer("tax_amount_minor").notNull(),
    grossAmountMinor: integer("gross_amount_minor").notNull(),
    taxCategory: text("tax_category").notNull(),
    taxRateBasisPoints: integer("tax_rate_basis_points").notNull(),
    matchStatus: text("match_status", { enum: ["Matched", "Possible Match", "Unmatched"] }).notNull().default("Unmatched"),
    purchaseOrderLineId: text("purchase_order_line_id").references(() => purchaseOrderLines.id),
    itemId: text("item_id").references(() => inventoryItems.id),
    expenseAccountId: text("expense_account_id").references(() => accounts.id),
    taxCodeId: text("tax_code_id").references(() => taxCodes.id),
    projectId: text("project_id").references(() => projects.id),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("inbound_einvoice_line_position_idx").on(table.inboundDocumentId, table.position),
    index("inbound_einvoice_line_order_idx").on(table.purchaseOrderLineId),
    index("inbound_einvoice_line_item_idx").on(table.itemId),
  ],
);

export const supplierEInvoiceIdentities = sqliteTable(
  "supplier_einvoice_identities",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
    identityType: text("identity_type", { enum: ["endpoint", "trn", "legal_registration"] }).notNull(),
    identifier: text("identifier").notNull(),
    scheme: text("scheme").notNull().default(""),
    confirmedBy: text("confirmed_by").notNull(),
    confirmedAt: text("confirmed_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("supplier_einvoice_identity_value_idx").on(table.identityType, table.scheme, table.identifier),
    index("supplier_einvoice_identity_supplier_idx").on(table.supplierId),
  ],
);

export const supplierItemMappings = sqliteTable(
  "supplier_item_mappings",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
    supplierItemIdentifier: text("supplier_item_identifier").notNull(),
    itemId: text("item_id").notNull().references(() => inventoryItems.id),
    unitCode: text("unit_code"),
    confirmedBy: text("confirmed_by").notNull(),
    confirmedAt: text("confirmed_at").notNull(),
  },
  (table) => [
    uniqueIndex("supplier_item_mapping_value_idx").on(table.supplierId, table.supplierItemIdentifier),
    index("supplier_item_mapping_item_idx").on(table.itemId),
  ],
);

export const inboundEInvoiceEvents = sqliteTable(
  "inbound_einvoice_events",
  {
    id: text("id").primaryKey(),
    inboundDocumentId: text("inbound_document_id").notNull().references(() => inboundEInvoiceDocuments.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    providerEventId: text("provider_event_id"),
    rawResponse: text("raw_response"),
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("inbound_einvoice_provider_event_idx").on(table.providerKey, table.providerEventId),
    index("inbound_einvoice_event_document_idx").on(table.inboundDocumentId, table.createdAt),
  ],
);

export const documentTemplates = sqliteTable("document_templates", {
  id: text("id").primaryKey(),
  documentType: text("document_type").notNull().unique(),
  name: text("name").notNull(),
  templateJson: text("template_json").default(""),
  settingsJson: text("settings_json"),
  customHtml: text("custom_html"),
  updatedAt: text("updated_at").notNull(),
});
