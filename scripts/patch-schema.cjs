const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "../src/core/db/business-schema.ts");
let content = fs.readFileSync(schemaPath, "utf-8");

function addField(tableName, fieldDefinition) {
  const tableStart = content.indexOf(`export const ${tableName} = sqliteTable(`);
  if (tableStart === -1) {
    console.error(`Table ${tableName} not found!`);
    return;
  }
  
  // Find the end of the fields block
  const fieldsEnd = content.indexOf("},", tableStart);
  if (fieldsEnd === -1) {
    console.error(`End of fields not found for ${tableName}!`);
    return;
  }
  
  // Check if field already exists
  const fieldName = fieldDefinition.split(":")[0].trim();
  if (content.slice(tableStart, fieldsEnd).includes(`${fieldName}:`)) {
    console.log(`Field ${fieldName} already exists in ${tableName}`);
    return;
  }
  
  const before = content.slice(0, fieldsEnd);
  const after = content.slice(fieldsEnd);
  content = before + `\n    ${fieldDefinition},` + after;
}

// Add fields to salesInvoices
addField("salesInvoices", `amountsIncludeTax: integer("amounts_include_tax", { mode: "boolean" }).notNull().default(false)`);
addField("salesInvoices", `salesOrderId: text("sales_order_id")`);

// Add fields to salesCreditNotes
addField("salesCreditNotes", `amountsIncludeTax: integer("amounts_include_tax", { mode: "boolean" }).notNull().default(false)`);

// Add fields to purchaseOrders
addField("purchaseOrders", `amountsIncludeTax: integer("amounts_include_tax", { mode: "boolean" }).notNull().default(false)`);

// Add fields to purchaseInvoices
addField("purchaseInvoices", `amountsIncludeTax: integer("amounts_include_tax", { mode: "boolean" }).notNull().default(false)`);

const discountFields = `discountType: text("discount_type", { enum: ["none", "percentage", "fixed"] }).notNull().default("none"),\n    discountValue: text("discount_value").notNull().default("0")`;

addField("salesInvoiceLines", discountFields);
addField("salesCreditNoteLines", discountFields);
addField("purchaseOrderLines", discountFields);
addField("purchaseInvoiceLines", discountFields);

const newTables = `
export const salesQuotes = sqliteTable(
  "sales_quotes",
  {
    id: text("id").primaryKey(),
    quoteNumber: text("quote_number").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    projectId: text("project_id").references(() => projects.id),
    quoteDate: text("quote_date").notNull(),
    expiryDate: text("expiry_date").notNull(),
    reference: text("reference"),
    documentStatus: text("document_status", { enum: ["draft", "sent", "accepted", "rejected"] })
      .notNull()
      .default("draft"),
    amountsIncludeTax: integer("amounts_include_tax", { mode: "boolean" }).notNull().default(false),
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
  },
  (table) => [
    uniqueIndex("sales_quote_number_idx").on(table.quoteNumber),
    index("sales_quote_customer_idx").on(table.customerId),
    index("sales_quote_project_idx").on(table.projectId),
  ],
);

export const salesQuoteLines = sqliteTable(
  "sales_quote_lines",
  {
    id: text("id").primaryKey(),
    quoteId: text("quote_id")
      .notNull()
      .references(() => salesQuotes.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    discountType: text("discount_type", { enum: ["none", "percentage", "fixed"] }).notNull().default("none"),
    discountValue: text("discount_value").notNull().default("0"),
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
    index("sales_quote_lines_quote_idx").on(table.quoteId),
  ],
);

export const salesOrders = sqliteTable(
  "sales_orders",
  {
    id: text("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    salesQuoteId: text("sales_quote_id").references(() => salesQuotes.id),
    projectId: text("project_id").references(() => projects.id),
    orderDate: text("order_date").notNull(),
    deliveryDate: text("delivery_date").notNull(),
    reference: text("reference"),
    documentStatus: text("document_status", { enum: ["draft", "active", "completed", "cancelled"] })
      .notNull()
      .default("draft"),
    amountsIncludeTax: integer("amounts_include_tax", { mode: "boolean" }).notNull().default(false),
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
  },
  (table) => [
    uniqueIndex("sales_order_number_idx").on(table.orderNumber),
    index("sales_order_customer_idx").on(table.customerId),
    index("sales_order_project_idx").on(table.projectId),
  ],
);

export const salesOrderLines = sqliteTable(
  "sales_order_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    discountType: text("discount_type", { enum: ["none", "percentage", "fixed"] }).notNull().default("none"),
    discountValue: text("discount_value").notNull().default("0"),
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
    index("sales_order_lines_order_idx").on(table.orderId),
  ],
);

export const debitNotes = sqliteTable(
  "debit_notes",
  {
    id: text("id").primaryKey(),
    debitNoteNumber: text("debit_note_number").notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    purchaseInvoiceId: text("purchase_invoice_id").references(() => purchaseInvoices.id),
    projectId: text("project_id").references(() => projects.id),
    debitNoteDate: text("debit_note_date").notNull(),
    taxDate: text("tax_date").notNull(),
    reference: text("reference"),
    documentStatus: text("document_status", { enum: ["draft", "posted", "void"] })
      .notNull()
      .default("draft"),
    amountsIncludeTax: integer("amounts_include_tax", { mode: "boolean" }).notNull().default(false),
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
    uniqueIndex("debit_note_number_idx").on(table.debitNoteNumber),
    index("debit_note_supplier_idx").on(table.supplierId),
    index("debit_note_project_idx").on(table.projectId),
  ],
);

export const debitNoteLines = sqliteTable(
  "debit_note_lines",
  {
    id: text("id").primaryKey(),
    debitNoteId: text("debit_note_id")
      .notNull()
      .references(() => debitNotes.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantityMicros: integer("quantity_micros").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    discountType: text("discount_type", { enum: ["none", "percentage", "fixed"] }).notNull().default("none"),
    discountValue: text("discount_value").notNull().default("0"),
    purchaseAccountId: text("purchase_account_id")
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
    index("debit_note_lines_note_idx").on(table.debitNoteId),
  ],
);
`;

if (!content.includes("salesQuotes")) {
  content += "\n" + newTables;
}

fs.writeFileSync(schemaPath, content);
console.log("Schema patched!");

