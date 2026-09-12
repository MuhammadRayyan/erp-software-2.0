CREATE TABLE `business_accounting_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`accounts_receivable_account_id` text NOT NULL,
	`default_sales_account_id` text NOT NULL,
	`default_bank_account_id` text NOT NULL,
	`vat_output_account_id` text NOT NULL,
	`accounts_payable_account_id` text NOT NULL,
	`input_vat_account_id` text NOT NULL,
	`default_purchase_expense_account_id` text NOT NULL,
	`invoice_prefix` text NOT NULL,
	`invoice_next_number` integer NOT NULL,
	`invoice_padding` integer NOT NULL,
	`receipt_prefix` text NOT NULL,
	`receipt_next_number` integer NOT NULL,
	`credit_note_prefix` text NOT NULL,
	`credit_note_next_number` integer NOT NULL,
	`purchase_order_prefix` text NOT NULL,
	`purchase_order_next_number` integer NOT NULL,
	`purchase_invoice_prefix` text NOT NULL,
	`purchase_invoice_next_number` integer NOT NULL,
	`supplier_payment_prefix` text NOT NULL,
	`supplier_payment_next_number` integer NOT NULL,
	`sales_quote_prefix` text DEFAULT 'SQ-' NOT NULL,
	`sales_quote_next_number` integer DEFAULT 1 NOT NULL,
	`sales_quote_padding` integer DEFAULT 4 NOT NULL,
	`purchase_quote_prefix` text DEFAULT 'PQ-' NOT NULL,
	`purchase_quote_next_number` integer DEFAULT 1 NOT NULL,
	`purchase_quote_padding` integer DEFAULT 4 NOT NULL,
	`sales_order_prefix` text DEFAULT 'SO-' NOT NULL,
	`sales_order_next_number` integer DEFAULT 1 NOT NULL,
	`sales_order_padding` integer DEFAULT 4 NOT NULL,
	`project_prefix` text DEFAULT 'PRJ-' NOT NULL,
	`project_next_number` integer DEFAULT 1 NOT NULL,
	`project_padding` integer DEFAULT 4 NOT NULL,
	`goods_receipt_prefix` text DEFAULT 'GR-' NOT NULL,
	`goods_receipt_next_number` integer DEFAULT 1 NOT NULL,
	`goods_receipt_padding` integer DEFAULT 4 NOT NULL,
	`delivery_note_prefix` text DEFAULT 'DN-' NOT NULL,
	`delivery_note_next_number` integer DEFAULT 1 NOT NULL,
	`delivery_note_padding` integer DEFAULT 4 NOT NULL,
	`stock_adjustment_prefix` text DEFAULT 'SA-' NOT NULL,
	`stock_adjustment_next_number` integer DEFAULT 1 NOT NULL,
	`stock_adjustment_padding` integer DEFAULT 4 NOT NULL,
	`bank_transaction_prefix` text DEFAULT 'BT-' NOT NULL,
	`bank_transaction_next_number` integer DEFAULT 1 NOT NULL,
	`bank_transaction_padding` integer DEFAULT 4 NOT NULL,
	`bank_transfer_prefix` text DEFAULT 'TRF-' NOT NULL,
	`bank_transfer_next_number` integer DEFAULT 1 NOT NULL,
	`bank_transfer_padding` integer DEFAULT 4 NOT NULL,
	`default_inventory_asset_account_id` text DEFAULT 'acct-inventory-1210' NOT NULL,
	`default_cost_of_sales_account_id` text DEFAULT 'acct-cost-sales-5000' NOT NULL,
	`inventory_adjustment_account_id` text DEFAULT 'acct-inventory-adjustment-5010' NOT NULL,
	`realized_fx_gain_account_id` text,
	`realized_fx_loss_account_id` text,
	`journal_prefix` text NOT NULL,
	`journal_next_number` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`accounts_receivable_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_sales_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_bank_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vat_output_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accounts_payable_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`input_vat_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_purchase_expense_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_inventory_asset_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_cost_of_sales_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_adjustment_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`realized_fx_gain_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`realized_fx_loss_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_code_idx` ON `accounts` (`code`);--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`account_code` text,
	`bank_name` text,
	`account_number_masked` text,
	`currency_code` text NOT NULL,
	`ledger_account_id` text NOT NULL,
	`is_cash_account` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`ledger_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_account_currency_code" CHECK(length("bank_accounts"."currency_code") = 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_account_ledger_idx` ON `bank_accounts` (`ledger_account_id`);--> statement-breakpoint
CREATE INDEX `bank_account_active_idx` ON `bank_accounts` (`is_active`);--> statement-breakpoint
CREATE TABLE `bank_reconciliation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`reconciliation_id` text NOT NULL,
	`statement_line_id` text NOT NULL,
	`journal_entry_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`reconciliation_id`) REFERENCES `bank_reconciliations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`statement_line_id`) REFERENCES `bank_statement_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_reconciliation_statement_line_idx` ON `bank_reconciliation_items` (`statement_line_id`);--> statement-breakpoint
CREATE INDEX `bank_reconciliation_item_reconciliation_idx` ON `bank_reconciliation_items` (`reconciliation_id`);--> statement-breakpoint
CREATE INDEX `bank_reconciliation_item_journal_idx` ON `bank_reconciliation_items` (`journal_entry_id`);--> statement-breakpoint
CREATE TABLE `bank_reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_account_id` text NOT NULL,
	`statement_date` text NOT NULL,
	`statement_ending_balance_minor` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bank_reconciliation_account_date_idx` ON `bank_reconciliations` (`bank_account_id`,`statement_date`);--> statement-breakpoint
CREATE TABLE `bank_statement_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_account_id` text NOT NULL,
	`file_name` text NOT NULL,
	`row_count` integer NOT NULL,
	`imported_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`mapping_json` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_statement_import_counts" CHECK("bank_statement_imports"."row_count" > 0 AND "bank_statement_imports"."imported_count" >= 0 AND "bank_statement_imports"."duplicate_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bank_statement_import_account_idx` ON `bank_statement_imports` (`bank_account_id`);--> statement-breakpoint
CREATE TABLE `bank_statement_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`transaction_date` text NOT NULL,
	`value_date` text,
	`description` text NOT NULL,
	`reference` text,
	`amount_minor` integer NOT NULL,
	`external_id` text,
	`fingerprint` text NOT NULL,
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`matched_source_type` text,
	`matched_source_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `bank_statement_imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_statement_line_non_zero_amount" CHECK("bank_statement_lines"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_statement_line_fingerprint_idx` ON `bank_statement_lines` (`bank_account_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `bank_statement_line_account_status_idx` ON `bank_statement_lines` (`bank_account_id`,`match_status`);--> statement-breakpoint
CREATE INDEX `bank_statement_line_source_idx` ON `bank_statement_lines` (`matched_source_type`,`matched_source_id`);--> statement-breakpoint
CREATE TABLE `bank_transaction_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`tax_code_id` text,
	`project_id` text,
	`description` text NOT NULL,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`bank_transaction_id`) REFERENCES `bank_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_transaction_line_positive_net" CHECK("bank_transaction_lines"."net_amount_minor" > 0),
	CONSTRAINT "bank_transaction_line_non_negative_tax" CHECK("bank_transaction_lines"."tax_amount_minor" >= 0),
	CONSTRAINT "bank_transaction_line_positive_gross" CHECK("bank_transaction_lines"."gross_amount_minor" > 0),
	CONSTRAINT "bank_transaction_line_total" CHECK("bank_transaction_lines"."gross_amount_minor" = "bank_transaction_lines"."net_amount_minor" + "bank_transaction_lines"."tax_amount_minor")
);
--> statement-breakpoint
CREATE INDEX `bank_transaction_line_transaction_idx` ON `bank_transaction_lines` (`bank_transaction_id`);--> statement-breakpoint
CREATE INDEX `bank_transaction_line_project_idx` ON `bank_transaction_lines` (`project_id`);--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_number` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`date` text NOT NULL,
	`tax_date` text NOT NULL,
	`supply_emirate` text,
	`type` text NOT NULL,
	`reference` text,
	`description` text NOT NULL,
	`total_minor` integer NOT NULL,
	`statement_line_id` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`posted_at` text,
	`voided_at` text,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`statement_line_id`) REFERENCES `bank_statement_lines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_transaction_positive_total" CHECK("bank_transactions"."total_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_number_idx` ON `bank_transactions` (`transaction_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_statement_line_idx` ON `bank_transactions` (`statement_line_id`) WHERE "bank_transactions"."statement_line_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `bank_transaction_account_idx` ON `bank_transactions` (`bank_account_id`);--> statement-breakpoint
CREATE TABLE `bank_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_number` text NOT NULL,
	`from_bank_account_id` text NOT NULL,
	`to_bank_account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`reference` text,
	`description` text,
	`document_status` text DEFAULT 'posted' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`posted_at` text NOT NULL,
	`voided_at` text,
	FOREIGN KEY (`from_bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_transfer_positive_amount" CHECK("bank_transfers"."amount_minor" > 0),
	CONSTRAINT "bank_transfer_different_accounts" CHECK("bank_transfers"."from_bank_account_id" <> "bank_transfers"."to_bank_account_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfer_number_idx` ON `bank_transfers` (`transfer_number`);--> statement-breakpoint
CREATE INDEX `bank_transfer_from_idx` ON `bank_transfers` (`from_bank_account_id`);--> statement-breakpoint
CREATE INDEX `bank_transfer_to_idx` ON `bank_transfers` (`to_bank_account_id`);--> statement-breakpoint
CREATE TABLE `business_currency_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`base_currency_code` text NOT NULL,
	`metadata_source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`base_currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `business_einvoice_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`legal_name` text,
	`legal_registration_identifier` text,
	`address_line_1` text,
	`city` text,
	`country_subdivision` text,
	`country_code` text DEFAULT 'AE' NOT NULL,
	`participant_identifier` text,
	`participant_identifier_scheme` text,
	`endpoint_identifier` text,
	`endpoint_identifier_scheme` text,
	`asp_provider_key` text,
	`asp_environment` text DEFAULT 'disabled' NOT NULL,
	`specification_version` text DEFAULT '1.0.4' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_tax_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`vat_registered` integer DEFAULT false NOT NULL,
	`trn` text,
	`vat_registration_effective_date` text,
	`vat_deregistration_date` text,
	`default_supply_emirate` text,
	`tax_lock_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`symbol` text,
	`minor_unit` integer NOT NULL,
	`is_base` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `currency_active_idx` ON `currencies` (`is_active`,`code`);--> statement-breakpoint
CREATE TABLE `custom_field_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`field_type` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`is_required` integer DEFAULT false NOT NULL,
	`options_json` text,
	`position` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_def_entity_key_idx` ON `custom_field_definitions` (`entity_type`,`key`);--> statement-breakpoint
CREATE INDEX `custom_field_def_entity_idx` ON `custom_field_definitions` (`entity_type`);--> statement-breakpoint
CREATE TABLE `custom_field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`definition_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`text_value` text,
	`number_value` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `custom_field_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_field_val_def_entity_idx` ON `custom_field_values` (`definition_id`,`entity_id`);--> statement-breakpoint
CREATE INDEX `custom_field_val_entity_idx` ON `custom_field_values` (`entity_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`tax_reference` text,
	`legal_name` text,
	`trn` text,
	`legal_registration_identifier` text,
	`electronic_address` text,
	`electronic_address_scheme` text,
	`address_line_1` text,
	`city` text,
	`country_subdivision` text,
	`country_code` text,
	`buyer_reference` text,
	`default_currency_code` text DEFAULT 'AED' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`billing_address` text,
	`delivery_address` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`default_currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `debit_note_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`debit_note_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` text DEFAULT '0' NOT NULL,
	`expense_account_id` text NOT NULL,
	`tax_code_id` text NOT NULL,
	`project_id` text,
	`item_id` text,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`debit_note_id`) REFERENCES `debit_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `debit_note_lines_note_idx` ON `debit_note_lines` (`debit_note_id`);--> statement-breakpoint
CREATE TABLE `debit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`debit_note_number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`purchase_invoice_id` text,
	`project_id` text,
	`debit_note_date` text NOT NULL,
	`tax_date` text NOT NULL,
	`reference` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`amounts_include_tax` integer DEFAULT false NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_subtotal_minor` integer NOT NULL,
	`base_tax_minor` integer NOT NULL,
	`base_total_minor` integer NOT NULL,
	`notes` text,
	`terms` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`posted_at` text,
	`voided_at` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debit_note_number_idx` ON `debit_notes` (`debit_note_number`);--> statement-breakpoint
CREATE INDEX `debit_note_supplier_idx` ON `debit_notes` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `debit_note_project_idx` ON `debit_notes` (`project_id`);--> statement-breakpoint
CREATE TABLE `delivery_note_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_note_id` text NOT NULL,
	`item_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`project_id` text,
	`sales_invoice_line_id` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`delivery_note_id`) REFERENCES `delivery_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sales_invoice_line_id`) REFERENCES `sales_invoice_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `delivery_note_lines_note_idx` ON `delivery_note_lines` (`delivery_note_id`);--> statement-breakpoint
CREATE INDEX `delivery_note_lines_invoice_line_idx` ON `delivery_note_lines` (`sales_invoice_line_id`);--> statement-breakpoint
CREATE TABLE `delivery_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`sales_invoice_id` text,
	`date` text NOT NULL,
	`location_id` text NOT NULL,
	`reference` text,
	`project_id` text,
	`notes` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`posted_at` text,
	`voided_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_note_number_idx` ON `delivery_notes` (`delivery_number`);--> statement-breakpoint
CREATE INDEX `delivery_note_customer_idx` ON `delivery_notes` (`customer_id`);--> statement-breakpoint
CREATE INDEX `delivery_note_invoice_idx` ON `delivery_notes` (`sales_invoice_id`);--> statement-breakpoint
CREATE TABLE `document_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`document_type` text NOT NULL,
	`name` text NOT NULL,
	`template_json` text DEFAULT '',
	`settings_json` text,
	`custom_html` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_templates_document_type_unique` ON `document_templates` (`document_type`);--> statement-breakpoint
CREATE TABLE `einvoice_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`document_type` text NOT NULL,
	`uuid` text NOT NULL,
	`specification_version` text NOT NULL,
	`status` text DEFAULT 'NotPrepared' NOT NULL,
	`canonical_json` text,
	`xml_payload` text,
	`payload_hash` text,
	`validation_json` text,
	`provider_key` text,
	`provider_environment` text,
	`exchange_status` text,
	`reporting_status` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`validated_at` text,
	`submitted_at` text,
	`accepted_at` text,
	`rejected_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `einvoice_document_source_idx` ON `einvoice_documents` (`source_type`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `einvoice_document_uuid_idx` ON `einvoice_documents` (`uuid`);--> statement-breakpoint
CREATE INDEX `einvoice_document_status_idx` ON `einvoice_documents` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `einvoice_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`provider_key` text NOT NULL,
	`provider_environment` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text NOT NULL,
	`provider_request_id` text,
	`exchange_status` text,
	`reporting_status` text,
	`response_code` text,
	`response_payload` text,
	`error_message` text,
	`submitted_at` text NOT NULL,
	`responded_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `einvoice_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `einvoice_submission_attempt_idx` ON `einvoice_submissions` (`document_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `einvoice_submission_document_idx` ON `einvoice_submissions` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`currency_code` text NOT NULL,
	`rate_date` text NOT NULL,
	`rate_to_base` text NOT NULL,
	`source` text NOT NULL,
	`source_reference` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rate_currency_date_source_idx` ON `exchange_rates` (`currency_code`,`rate_date`,`source`);--> statement-breakpoint
CREATE INDEX `exchange_rate_date_idx` ON `exchange_rates` (`rate_date`,`currency_code`);--> statement-breakpoint
CREATE TABLE `form_defaults` (
	`id` text PRIMARY KEY NOT NULL,
	`form_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goods_receipt_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`goods_receipt_id` text NOT NULL,
	`item_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_cost_minor` integer NOT NULL,
	`project_id` text,
	`purchase_order_line_id` text,
	`purchase_invoice_line_id` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_line_id`) REFERENCES `purchase_order_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_invoice_line_id`) REFERENCES `purchase_invoice_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `goods_receipt_lines_receipt_idx` ON `goods_receipt_lines` (`goods_receipt_id`);--> statement-breakpoint
CREATE INDEX `goods_receipt_lines_order_line_idx` ON `goods_receipt_lines` (`purchase_order_line_id`);--> statement-breakpoint
CREATE TABLE `goods_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`purchase_order_id` text,
	`purchase_invoice_id` text,
	`date` text NOT NULL,
	`location_id` text NOT NULL,
	`reference` text,
	`project_id` text,
	`notes` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`posted_at` text,
	`voided_at` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goods_receipt_number_idx` ON `goods_receipts` (`receipt_number`);--> statement-breakpoint
CREATE INDEX `goods_receipt_supplier_idx` ON `goods_receipts` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `goods_receipt_order_idx` ON `goods_receipts` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `goods_receipt_invoice_idx` ON `goods_receipts` (`purchase_invoice_id`);--> statement-breakpoint
CREATE TABLE `inbound_einvoice_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_key` text NOT NULL,
	`environment` text NOT NULL,
	`provider_document_id` text,
	`document_type` text NOT NULL,
	`specification_version` text NOT NULL,
	`document_uuid` text NOT NULL,
	`seller_endpoint_id` text,
	`seller_endpoint_scheme` text,
	`seller_trn` text,
	`seller_legal_registration_identifier` text,
	`seller_legal_name` text NOT NULL,
	`buyer_endpoint_id` text,
	`buyer_endpoint_scheme` text,
	`buyer_trn` text,
	`buyer_legal_registration_identifier` text,
	`buyer_legal_name` text,
	`document_number` text NOT NULL,
	`issue_date` text NOT NULL,
	`tax_date` text,
	`due_date` text,
	`currency_code` text NOT NULL,
	`source_invoice_reference` text,
	`status` text DEFAULT 'Received' NOT NULL,
	`network_status` text,
	`raw_xml` text NOT NULL,
	`raw_hash` text NOT NULL,
	`canonical_json` text NOT NULL,
	`validation_result_json` text,
	`subtotal_minor` integer NOT NULL,
	`allowance_total_minor` integer DEFAULT 0 NOT NULL,
	`charge_total_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`amount_due_minor` integer NOT NULL,
	`buyer_identity_verified` integer DEFAULT false NOT NULL,
	`supplier_id` text,
	`purchase_order_id` text,
	`goods_receipt_id` text,
	`purchase_invoice_id` text,
	`duplicate_of_id` text,
	`duplicate_kind` text,
	`last_error` text,
	`rejection_reason` text,
	`received_at` text NOT NULL,
	`validated_at` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`archived_at` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_einvoice_provider_document_idx` ON `inbound_einvoice_documents` (`provider_key`,`environment`,`provider_document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_einvoice_raw_hash_idx` ON `inbound_einvoice_documents` (`raw_hash`);--> statement-breakpoint
CREATE INDEX `inbound_einvoice_status_received_idx` ON `inbound_einvoice_documents` (`status`,`received_at`);--> statement-breakpoint
CREATE INDEX `inbound_einvoice_supplier_number_idx` ON `inbound_einvoice_documents` (`supplier_id`,`document_number`);--> statement-breakpoint
CREATE INDEX `inbound_einvoice_purchase_order_idx` ON `inbound_einvoice_documents` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `inbound_einvoice_goods_receipt_idx` ON `inbound_einvoice_documents` (`goods_receipt_id`);--> statement-breakpoint
CREATE INDEX `inbound_einvoice_purchase_invoice_idx` ON `inbound_einvoice_documents` (`purchase_invoice_id`);--> statement-breakpoint
CREATE TABLE `inbound_einvoice_events` (
	`id` text PRIMARY KEY NOT NULL,
	`inbound_document_id` text NOT NULL,
	`provider_key` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`provider_event_id` text,
	`raw_response` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`inbound_document_id`) REFERENCES `inbound_einvoice_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_einvoice_provider_event_idx` ON `inbound_einvoice_events` (`provider_key`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `inbound_einvoice_event_document_idx` ON `inbound_einvoice_events` (`inbound_document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `inbound_einvoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`inbound_document_id` text NOT NULL,
	`source_line_id` text NOT NULL,
	`order_line_reference` text,
	`supplier_item_identifier` text,
	`erp_item_identifier` text,
	`description` text NOT NULL,
	`item_name` text,
	`quantity_micros` integer NOT NULL,
	`unit_code` text NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`tax_category` text NOT NULL,
	`tax_rate_basis_points` integer NOT NULL,
	`match_status` text DEFAULT 'Unmatched' NOT NULL,
	`purchase_order_line_id` text,
	`item_id` text,
	`expense_account_id` text,
	`tax_code_id` text,
	`project_id` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`inbound_document_id`) REFERENCES `inbound_einvoice_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_order_line_id`) REFERENCES `purchase_order_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_einvoice_line_position_idx` ON `inbound_einvoice_lines` (`inbound_document_id`,`position`);--> statement-breakpoint
CREATE INDEX `inbound_einvoice_line_order_idx` ON `inbound_einvoice_lines` (`purchase_order_line_id`);--> statement-breakpoint
CREATE INDEX `inbound_einvoice_line_item_idx` ON `inbound_einvoice_lines` (`item_id`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text,
	`name` text NOT NULL,
	`description` text,
	`unit_name` text NOT NULL,
	`sales_price_minor` integer,
	`purchase_price_minor` integer,
	`sales_account_id` text NOT NULL,
	`inventory_asset_account_id` text NOT NULL,
	`cost_of_sales_account_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`sales_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_asset_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_of_sales_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_sku_idx` ON `inventory_items` (`sku`) WHERE "inventory_items"."sku" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `inventory_item_name_idx` ON `inventory_items` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_location_code_idx` ON `inventory_locations` (`code`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`item_id` text NOT NULL,
	`location_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`quantity_delta_micros` integer NOT NULL,
	`unit_cost_micros` integer NOT NULL,
	`value_delta_minor` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_line_id` text,
	`project_id` text,
	`description` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_movement_non_zero_quantity" CHECK("inventory_movements"."quantity_delta_micros" <> 0),
	CONSTRAINT "inventory_movement_non_negative_cost" CHECK("inventory_movements"."unit_cost_micros" >= 0)
);
--> statement-breakpoint
CREATE INDEX `inventory_movement_item_location_idx` ON `inventory_movements` (`item_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `inventory_movement_source_idx` ON `inventory_movements` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `inventory_movement_date_idx` ON `inventory_movements` (`date`);--> statement-breakpoint
CREATE INDEX `inventory_movement_project_idx` ON `inventory_movements` (`project_id`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_number` text NOT NULL,
	`date` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_at` text NOT NULL,
	`posted_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entry_number_idx` ON `journal_entries` (`entry_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `journal_source_idx` ON `journal_entries` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `journal_date_idx` ON `journal_entries` (`date`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`journal_entry_id` text NOT NULL,
	`account_id` text NOT NULL,
	`description` text NOT NULL,
	`debit_minor` integer DEFAULT 0 NOT NULL,
	`credit_minor` integer DEFAULT 0 NOT NULL,
	`customer_id` text,
	`supplier_id` text,
	`project_id` text,
	`reference` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journal_line_non_negative" CHECK("journal_lines"."debit_minor" >= 0 AND "journal_lines"."credit_minor" >= 0),
	CONSTRAINT "journal_line_one_side" CHECK(("journal_lines"."debit_minor" > 0 AND "journal_lines"."credit_minor" = 0) OR ("journal_lines"."credit_minor" > 0 AND "journal_lines"."debit_minor" = 0))
);
--> statement-breakpoint
CREATE INDEX `journal_lines_entry_idx` ON `journal_lines` (`journal_entry_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_account_idx` ON `journal_lines` (`account_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_customer_idx` ON `journal_lines` (`customer_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_supplier_idx` ON `journal_lines` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_project_idx` ON `journal_lines` (`project_id`);--> statement-breakpoint
CREATE TABLE `project_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`original_name` text NOT NULL,
	`storage_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_attachments_project_idx` ON `project_attachments` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_attachment_storage_path_idx` ON `project_attachments` (`storage_path`);--> statement-breakpoint
CREATE TABLE `project_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_notes_project_idx` ON `project_notes` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`customer_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`description` text,
	`start_date` text,
	`target_end_date` text,
	`actual_end_date` text,
	`budget_revenue_minor` integer,
	`budget_cost_minor` integer,
	`manager_name` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_code_idx` ON `projects` (`code`);--> statement-breakpoint
CREATE INDEX `project_customer_idx` ON `projects` (`customer_id`);--> statement-breakpoint
CREATE INDEX `project_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `purchase_invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`expense_account_id` text NOT NULL,
	`tax_code_id` text NOT NULL,
	`project_id` text,
	`item_id` text,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` text DEFAULT '0' NOT NULL,
	FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_invoice_lines_invoice_idx` ON `purchase_invoice_lines` (`purchase_invoice_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_lines_project_idx` ON `purchase_invoice_lines` (`project_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_lines_item_idx` ON `purchase_invoice_lines` (`item_id`);--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`internal_number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`project_id` text,
	`supplier_invoice_number` text NOT NULL,
	`invoice_date` text NOT NULL,
	`tax_date` text NOT NULL,
	`due_date` text NOT NULL,
	`reference` text,
	`purchase_order_id` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_subtotal_minor` integer NOT NULL,
	`base_tax_minor` integer NOT NULL,
	`base_total_minor` integer NOT NULL,
	`notes` text,
	`terms` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`posted_at` text,
	`voided_at` text,
	`inbound_einvoice_document_id` text,
	`amounts_include_tax` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoice_number_idx` ON `purchase_invoices` (`internal_number`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_supplier_idx` ON `purchase_invoices` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_order_idx` ON `purchase_invoices` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_project_idx` ON `purchase_invoices` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_invoice_inbound_source_idx` ON `purchase_invoices` (`inbound_einvoice_document_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoice_supplier_document_idx` ON `purchase_invoices` (`supplier_id`,`supplier_invoice_number`,`document_status`);--> statement-breakpoint
CREATE TABLE `purchase_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`expense_account_id` text,
	`tax_code_id` text NOT NULL,
	`project_id` text,
	`item_id` text,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` text DEFAULT '0' NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_order_lines_order_idx` ON `purchase_order_lines` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_lines_project_idx` ON `purchase_order_lines` (`project_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_lines_item_idx` ON `purchase_order_lines` (`item_id`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`project_id` text,
	`date` text NOT NULL,
	`expected_date` text,
	`reference` text,
	`notes` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_subtotal_minor` integer NOT NULL,
	`base_tax_minor` integer NOT NULL,
	`base_total_minor` integer NOT NULL,
	`terms` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`issued_at` text,
	`closed_at` text,
	`cancelled_at` text,
	`amounts_include_tax` integer DEFAULT false NOT NULL,
	`purchase_quote_id` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_order_number_idx` ON `purchase_orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `purchase_order_supplier_idx` ON `purchase_orders` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_project_idx` ON `purchase_orders` (`project_id`);--> statement-breakpoint
CREATE TABLE `purchase_quote_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` text DEFAULT '0' NOT NULL,
	`expense_account_id` text NOT NULL,
	`tax_code_id` text NOT NULL,
	`project_id` text,
	`item_id` text,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `purchase_quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_quote_lines_quote_idx` ON `purchase_quote_lines` (`quote_id`);--> statement-breakpoint
CREATE TABLE `purchase_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_number` text NOT NULL,
	`base_quote_number` text,
	`root_quote_id` text,
	`revision_number` integer DEFAULT 0 NOT NULL,
	`is_latest_revision` integer DEFAULT true NOT NULL,
	`supplier_id` text NOT NULL,
	`project_id` text,
	`quote_date` text NOT NULL,
	`expiry_date` text NOT NULL,
	`reference` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`amounts_include_tax` integer DEFAULT false NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_subtotal_minor` integer NOT NULL,
	`base_tax_minor` integer NOT NULL,
	`base_total_minor` integer NOT NULL,
	`notes` text,
	`terms` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_quote_number_idx` ON `purchase_quotes` (`quote_number`);--> statement-breakpoint
CREATE INDEX `purchase_quote_supplier_idx` ON `purchase_quotes` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_quote_project_idx` ON `purchase_quotes` (`project_id`);--> statement-breakpoint
CREATE INDEX `purchase_quote_root_idx` ON `purchase_quotes` (`root_quote_id`);--> statement-breakpoint
CREATE INDEX `purchase_quote_base_number_idx` ON `purchase_quotes` (`base_quote_number`);--> statement-breakpoint
CREATE TABLE `receipt_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`sales_invoice_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`foreign_amount_allocated` integer NOT NULL,
	`base_carrying_amount_released` integer NOT NULL,
	`settlement_base_amount` integer NOT NULL,
	`realized_fx_amount` integer NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "receipt_allocation_positive" CHECK("receipt_allocations"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_invoice_allocation_idx` ON `receipt_allocations` (`receipt_id`,`sales_invoice_id`);--> statement-breakpoint
CREATE INDEX `receipt_allocation_invoice_idx` ON `receipt_allocations` (`sales_invoice_id`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`date` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_amount_minor` integer NOT NULL,
	`released_carrying_amount_minor` integer NOT NULL,
	`realized_fx_amount_minor` integer NOT NULL,
	`reference` text,
	`description` text,
	`document_status` text DEFAULT 'posted' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`posted_at` text NOT NULL,
	`voided_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_number_idx` ON `receipts` (`receipt_number`);--> statement-breakpoint
CREATE INDEX `receipt_customer_idx` ON `receipts` (`customer_id`);--> statement-breakpoint
CREATE TABLE `sales_credit_note_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_note_id` text NOT NULL,
	`sales_invoice_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`foreign_amount_allocated` integer NOT NULL,
	`base_carrying_amount_released` integer NOT NULL,
	FOREIGN KEY (`credit_note_id`) REFERENCES `sales_credit_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_credit_note_allocation_positive" CHECK("sales_credit_note_allocations"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_credit_note_invoice_allocation_idx` ON `sales_credit_note_allocations` (`credit_note_id`,`sales_invoice_id`);--> statement-breakpoint
CREATE INDEX `sales_credit_note_allocation_invoice_idx` ON `sales_credit_note_allocations` (`sales_invoice_id`);--> statement-breakpoint
CREATE TABLE `sales_credit_note_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_note_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`sales_account_id` text NOT NULL,
	`tax_code_id` text NOT NULL,
	`project_id` text,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` text DEFAULT '0' NOT NULL,
	FOREIGN KEY (`credit_note_id`) REFERENCES `sales_credit_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sales_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_credit_note_lines_note_idx` ON `sales_credit_note_lines` (`credit_note_id`);--> statement-breakpoint
CREATE INDEX `sales_credit_note_lines_project_idx` ON `sales_credit_note_lines` (`project_id`);--> statement-breakpoint
CREATE TABLE `sales_credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_note_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`project_id` text,
	`source_invoice_id` text NOT NULL,
	`date` text NOT NULL,
	`tax_date` text NOT NULL,
	`supply_emirate` text,
	`reference` text,
	`reason` text,
	`einvoice_reason_code` text,
	`einvoice_transaction_flags_json` text DEFAULT '{"freeTradeZone":false,"deemedSupply":false,"marginScheme":false,"summaryInvoice":false,"continuousSupply":false,"agentBilling":false,"eCommerce":false,"export":false}' NOT NULL,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_subtotal_minor` integer NOT NULL,
	`base_tax_minor` integer NOT NULL,
	`base_total_minor` integer NOT NULL,
	`notes` text,
	`terms` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`posted_at` text,
	`voided_at` text,
	`amounts_include_tax` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_invoice_id`) REFERENCES `sales_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_credit_note_number_idx` ON `sales_credit_notes` (`credit_note_number`);--> statement-breakpoint
CREATE INDEX `sales_credit_note_customer_idx` ON `sales_credit_notes` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sales_credit_note_invoice_idx` ON `sales_credit_notes` (`source_invoice_id`);--> statement-breakpoint
CREATE INDEX `sales_credit_note_project_idx` ON `sales_credit_notes` (`project_id`);--> statement-breakpoint
CREATE TABLE `sales_invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`sales_account_id` text NOT NULL,
	`tax_code_id` text NOT NULL,
	`project_id` text,
	`item_id` text,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` text DEFAULT '0' NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `sales_invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sales_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_invoice_lines_invoice_idx` ON `sales_invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `sales_invoice_lines_project_idx` ON `sales_invoice_lines` (`project_id`);--> statement-breakpoint
CREATE INDEX `sales_invoice_lines_item_idx` ON `sales_invoice_lines` (`item_id`);--> statement-breakpoint
CREATE TABLE `sales_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`project_id` text,
	`invoice_date` text NOT NULL,
	`tax_date` text NOT NULL,
	`supply_emirate` text,
	`due_date` text NOT NULL,
	`reference` text,
	`einvoice_transaction_flags_json` text DEFAULT '{"freeTradeZone":false,"deemedSupply":false,"marginScheme":false,"summaryInvoice":false,"continuousSupply":false,"agentBilling":false,"eCommerce":false,"export":false}' NOT NULL,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_subtotal_minor` integer NOT NULL,
	`base_tax_minor` integer NOT NULL,
	`base_total_minor` integer NOT NULL,
	`notes` text,
	`terms` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`posted_at` text,
	`voided_at` text,
	`amounts_include_tax` integer DEFAULT false NOT NULL,
	`sales_order_id` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_invoice_number_idx` ON `sales_invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `sales_invoice_customer_idx` ON `sales_invoices` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sales_invoice_project_idx` ON `sales_invoices` (`project_id`);--> statement-breakpoint
CREATE TABLE `sales_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` text DEFAULT '0' NOT NULL,
	`sales_account_id` text NOT NULL,
	`tax_code_id` text NOT NULL,
	`project_id` text,
	`item_id` text,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `sales_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sales_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_order_lines_order_idx` ON `sales_order_lines` (`order_id`);--> statement-breakpoint
CREATE TABLE `sales_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`sales_quote_id` text,
	`project_id` text,
	`order_date` text NOT NULL,
	`delivery_date` text NOT NULL,
	`reference` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`amounts_include_tax` integer DEFAULT false NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_subtotal_minor` integer NOT NULL,
	`base_tax_minor` integer NOT NULL,
	`base_total_minor` integer NOT NULL,
	`notes` text,
	`terms` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sales_quote_id`) REFERENCES `sales_quotes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_order_number_idx` ON `sales_orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `sales_order_customer_idx` ON `sales_orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sales_order_project_idx` ON `sales_orders` (`project_id`);--> statement-breakpoint
CREATE TABLE `sales_quote_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` text DEFAULT '0' NOT NULL,
	`sales_account_id` text NOT NULL,
	`tax_code_id` text NOT NULL,
	`project_id` text,
	`item_id` text,
	`net_amount_minor` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`gross_amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `sales_quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sales_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_quote_lines_quote_idx` ON `sales_quote_lines` (`quote_id`);--> statement-breakpoint
CREATE TABLE `sales_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_number` text NOT NULL,
	`base_quote_number` text,
	`root_quote_id` text,
	`revision_number` integer DEFAULT 0 NOT NULL,
	`is_latest_revision` integer DEFAULT true NOT NULL,
	`customer_id` text NOT NULL,
	`project_id` text,
	`quote_date` text NOT NULL,
	`expiry_date` text NOT NULL,
	`reference` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`amounts_include_tax` integer DEFAULT false NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_subtotal_minor` integer NOT NULL,
	`base_tax_minor` integer NOT NULL,
	`base_total_minor` integer NOT NULL,
	`notes` text,
	`terms` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_quote_number_idx` ON `sales_quotes` (`quote_number`);--> statement-breakpoint
CREATE INDEX `sales_quote_customer_idx` ON `sales_quotes` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sales_quote_project_idx` ON `sales_quotes` (`project_id`);--> statement-breakpoint
CREATE INDEX `sales_quote_root_idx` ON `sales_quotes` (`root_quote_id`);--> statement-breakpoint
CREATE INDEX `sales_quote_base_number_idx` ON `sales_quotes` (`base_quote_number`);--> statement-breakpoint
CREATE TABLE `schema_migrations` (
	`version` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sent_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`from_address` text NOT NULL,
	`to_addresses` text NOT NULL,
	`cc_addresses` text DEFAULT '' NOT NULL,
	`subject` text NOT NULL,
	`body_html` text NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`related_entity_type` text,
	`related_entity_id` text,
	`related_document_number` text,
	`attachment_filename` text,
	`attachment_size_bytes` integer,
	`sent_at` text,
	`error_message` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sent_emails_created_idx` ON `sent_emails` (`created_at`);--> statement-breakpoint
CREATE INDEX `sent_emails_related_idx` ON `sent_emails` (`related_entity_type`,`related_entity_id`);--> statement-breakpoint
CREATE TABLE `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`adjustment_number` text NOT NULL,
	`date` text NOT NULL,
	`location_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity_delta_micros` integer NOT NULL,
	`unit_cost_minor` integer,
	`reason` text NOT NULL,
	`project_id` text,
	`notes` text,
	`document_status` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`posted_at` text,
	`voided_at` text,
	FOREIGN KEY (`location_id`) REFERENCES `inventory_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_adjustment_number_idx` ON `stock_adjustments` (`adjustment_number`);--> statement-breakpoint
CREATE TABLE `supplier_einvoice_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`identity_type` text NOT NULL,
	`identifier` text NOT NULL,
	`scheme` text DEFAULT '' NOT NULL,
	`confirmed_by` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_einvoice_identity_value_idx` ON `supplier_einvoice_identities` (`identity_type`,`scheme`,`identifier`);--> statement-breakpoint
CREATE INDEX `supplier_einvoice_identity_supplier_idx` ON `supplier_einvoice_identities` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `supplier_item_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`supplier_item_identifier` text NOT NULL,
	`item_id` text NOT NULL,
	`unit_code` text,
	`confirmed_by` text NOT NULL,
	`confirmed_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_item_mapping_value_idx` ON `supplier_item_mappings` (`supplier_id`,`supplier_item_identifier`);--> statement-breakpoint
CREATE INDEX `supplier_item_mapping_item_idx` ON `supplier_item_mappings` (`item_id`);--> statement-breakpoint
CREATE TABLE `supplier_payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`purchase_invoice_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`foreign_amount_allocated` integer NOT NULL,
	`base_carrying_amount_released` integer NOT NULL,
	`settlement_base_amount` integer NOT NULL,
	`realized_fx_amount` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `supplier_payments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "supplier_payment_allocation_positive" CHECK("supplier_payment_allocations"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_payment_invoice_allocation_idx` ON `supplier_payment_allocations` (`payment_id`,`purchase_invoice_id`);--> statement-breakpoint
CREATE INDEX `supplier_payment_allocation_invoice_idx` ON `supplier_payment_allocations` (`purchase_invoice_id`);--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`date` text NOT NULL,
	`bank_account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency_code` text DEFAULT 'AED' NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`exchange_rate_date` text NOT NULL,
	`exchange_rate_source` text DEFAULT 'Base' NOT NULL,
	`base_amount_minor` integer NOT NULL,
	`released_carrying_amount_minor` integer NOT NULL,
	`realized_fx_amount_minor` integer NOT NULL,
	`reference` text,
	`description` text,
	`document_status` text DEFAULT 'posted' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`posted_at` text NOT NULL,
	`voided_at` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_payment_number_idx` ON `supplier_payments` (`payment_number`);--> statement-breakpoint
CREATE INDEX `supplier_payment_supplier_idx` ON `supplier_payments` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`tax_reference` text,
	`address` text,
	`legal_name` text,
	`trn` text,
	`legal_registration_identifier` text,
	`electronic_address` text,
	`electronic_address_scheme` text,
	`registered_address` text,
	`country_code` text,
	`notes` text,
	`default_currency_code` text DEFAULT 'AED' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`default_currency_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tax_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rate_basis_points` integer NOT NULL,
	`direction` text DEFAULT 'both' NOT NULL,
	`vat_category` text,
	`sales_tax_account_id` text,
	`purchase_tax_account_id` text,
	`is_recoverable` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`sales_tax_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_tax_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tax_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tax_date` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_line_id` text NOT NULL,
	`source_number` text NOT NULL,
	`party_name` text,
	`tax_code_id` text NOT NULL,
	`tax_code_name` text NOT NULL,
	`rate_basis_points` integer NOT NULL,
	`vat_category` text NOT NULL,
	`direction` text NOT NULL,
	`net_amount_minor` integer NOT NULL,
	`vat_amount_minor` integer NOT NULL,
	`document_currency` text DEFAULT 'AED' NOT NULL,
	`foreign_net_minor` integer NOT NULL,
	`foreign_vat_minor` integer NOT NULL,
	`exchange_rate_to_base` text DEFAULT '1' NOT NULL,
	`base_net_minor` integer NOT NULL,
	`base_vat_minor` integer NOT NULL,
	`rate_date` text NOT NULL,
	`rate_source` text DEFAULT 'Base' NOT NULL,
	`output_vat_minor` integer DEFAULT 0 NOT NULL,
	`recoverable_vat_minor` integer DEFAULT 0 NOT NULL,
	`supply_emirate` text,
	`project_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tax_code_id`) REFERENCES `tax_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_entry_source_line_idx` ON `tax_entries` (`source_type`,`source_id`,`source_line_id`);--> statement-breakpoint
CREATE INDEX `tax_entry_date_idx` ON `tax_entries` (`tax_date`);--> statement-breakpoint
CREATE INDEX `tax_entry_source_idx` ON `tax_entries` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `tax_entry_bucket_idx` ON `tax_entries` (`direction`,`vat_category`,`tax_date`);--> statement-breakpoint
CREATE INDEX `tax_entry_emirate_idx` ON `tax_entries` (`supply_emirate`,`tax_date`);--> statement-breakpoint
CREATE INDEX `tax_entry_tax_code_idx` ON `tax_entries` (`tax_code_id`);--> statement-breakpoint
CREATE TABLE `vat_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`report_bucket` text NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`vat_amount_minor` integer DEFAULT 0 NOT NULL,
	`reason` text NOT NULL,
	`reference` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`period_id`) REFERENCES `vat_periods`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vat_adjustment_period_idx` ON `vat_adjustments` (`period_id`);--> statement-breakpoint
CREATE TABLE `vat_data_review` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_line_id` text NOT NULL,
	`tax_date` text NOT NULL,
	`issue_type` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vat_data_review_source_issue_idx` ON `vat_data_review` (`source_type`,`source_id`,`source_line_id`,`issue_type`);--> statement-breakpoint
CREATE INDEX `vat_data_review_date_idx` ON `vat_data_review` (`tax_date`,`status`);--> statement-breakpoint
CREATE INDEX `vat_data_review_source_idx` ON `vat_data_review` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `vat_period_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`action` text NOT NULL,
	`reason_or_reference` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`period_id`) REFERENCES `vat_periods`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vat_period_audit_period_idx` ON `vat_period_audit` (`period_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `vat_period_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`snapshot_kind` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`period_id`) REFERENCES `vat_periods`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vat_snapshot_period_idx` ON `vat_period_snapshots` (`period_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `vat_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`period_reference` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`filing_due_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`finalized_at` text,
	`finalized_by` text,
	`filed_at` text,
	`filed_by` text,
	`filing_reference` text,
	`reopened_at` text,
	`reopened_by` text,
	`reopen_reason` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vat_period_reference_idx` ON `vat_periods` (`period_reference`);--> statement-breakpoint
CREATE INDEX `vat_period_date_idx` ON `vat_periods` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `vat_period_status_idx` ON `vat_periods` (`status`);