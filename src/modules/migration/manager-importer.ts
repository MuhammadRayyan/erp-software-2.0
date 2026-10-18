import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { createBusiness } from "@/core/businesses/business-service";
import { openBusinessDatabase, closeBusinessConnection } from "@/core/db/business";
import { extractManagerData, type ManagerExtractedData } from "./manager-extractor";
import { recordActivity } from "@/modules/activity-log/activity-log-service";

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
  purchaseInvoicesCount: number;
  bankTransfersCount: number;
}

export interface ManagerImportResult {
  businessId: string;
  businessName: string;
  summary: ManagerInspectionSummary;
}

/**
 * Validates SQLite header and opens a temporary readonly instance.
 */
function openTempManagerDb(buffer: ArrayBuffer | Buffer): { db: Database.Database; cleanup: () => void } {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");
  if (buf.length < 16 || Buffer.compare(buf.subarray(0, 16), SQLITE_HEADER) !== 0) {
    throw new Error("Invalid Manager.io backup file: missing SQLite format 3 header.");
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), "manager-import-"));
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
 * Pre-flight inspection of a Manager.io backup file.
 */
export function inspectManagerBackup(buffer: ArrayBuffer | Buffer): ManagerInspectionSummary {
  const { db, cleanup } = openTempManagerDb(buffer);
  try {
    const data = extractManagerData(db);
    return {
      businessName: data.business.name,
      trn: data.business.trn,
      phone: data.business.phone,
      email: data.business.email,
      address: data.business.address,
      country: data.business.country,
      currency: data.business.currency,
      customersCount: data.customers.length,
      suppliersCount: data.suppliers.length,
      inventoryItemsCount: data.inventoryItems.length,
      fixedAssetsCount: data.fixedAssets.length,
      projectsCount: data.projects.length,
      accountsCount: data.accounts.length,
      bankAccountsCount: data.bankAccounts.length,
      salesInvoicesCount: data.salesInvoices.length,
      salesQuotesCount: data.salesQuotes.length,
      purchaseInvoicesCount: data.purchaseInvoices.length,
      bankTransfersCount: data.bankTransfers.length,
    };
  } finally {
    cleanup();
  }
}

/**
 * Executes full migration of a Manager.io backup file into a brand new business workspace.
 */
export function importManagerBackupToNewBusiness(
  buffer: ArrayBuffer | Buffer,
  userId: string,
  overrideBusinessName?: string,
): ManagerImportResult {
  const { db: sourceDb, cleanup } = openTempManagerDb(buffer);
  let extracted: ManagerExtractedData;
  try {
    extracted = extractManagerData(sourceDb);
  } finally {
    cleanup();
  }

  const nameToUse = overrideBusinessName?.trim() || extracted.business.name;

  // 1. Create new isolated business workspace (automatically runs all 32 migrations)
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

  try {
    // 3. Populate business within an atomic transaction
    context.sqlite.transaction(() => {
      // 3.1 Update Business Profile
      context.sqlite.prepare(`
        INSERT OR REPLACE INTO business_profile (
          id, legal_name, trading_name, tax_id, phone, email, address_line_1, city, state_or_emirate, country, country_code, financial_year_start_month, created_at, updated_at
        ) VALUES (
          'default', ?, ?, ?, ?, ?, ?, ?, 'Dubai', 'United Arab Emirates', 'AE', ?, ?, ?
        )
      `).run(
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

      // 3.2 Insert Chart of Accounts
      const insertAccount = context.sqlite.prepare(`
        INSERT OR IGNORE INTO accounts (id, name, type, subtype, is_system, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 1, ?, ?)
      `);
      for (const acc of extracted.accounts) {
        insertAccount.run(acc.id, acc.name, acc.type, acc.subtype, now, now);
      }

      // 3.3 Insert Bank & Cash Accounts
      const insertBankAccount = context.sqlite.prepare(`
        INSERT OR IGNORE INTO bank_accounts (
          id, name, account_code, bank_name, account_number_masked, currency_code, ledger_account_id, is_cash_account, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 1, ?, ?)
      `);
      for (const b of extracted.bankAccounts) {
        // Also ensure an account row exists in GL
        insertAccount.run(b.id, b.name, "asset", "bank", now, now);
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

      // 3.4 Insert Customers
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

      // 3.5 Insert Suppliers
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

      // 3.6 Insert Projects / Job Cards
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

      // 3.7 Insert Inventory Items
      const insertItem = context.sqlite.prepare(`
        INSERT OR IGNORE INTO inventory_items (
          id, sku, name, description, unit_name, sales_price_minor, purchase_price_minor,
          sales_account_id, inventory_asset_account_id, cost_of_sales_account_id, is_active, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          'acct-sales-4000', 'acct-inventory-1210', 'acct-cost-sales-5000', 1, ?, ?
        )
      `);
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
          Math.max(0, Math.round((item.salesUnitPrice || 0) * 100)),
          Math.max(0, Math.round((item.purchaseUnitPrice || 0) * 100)),
          now,
          now,
        );
      }

      // 3.8 Insert Fixed Assets as tracked equipment items
      for (let i = 0; i < extracted.fixedAssets.length; i++) {
        const asset = extracted.fixedAssets[i];
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

      // 3.9 Insert Universal Vehicle Custom Fields Definitions
      const insertCustomFieldDef = context.sqlite.prepare(`
        INSERT OR IGNORE INTO custom_field_definitions (
          id, entity_type, name, field_type, select_options, position, is_required, show_in_list, created_at, updated_at
        ) VALUES (?, ?, ?, 'text', '[]', ?, 0, 1, ?, ?)
      `);
      insertCustomFieldDef.run(randomUUID(), "sales_invoice", "Vehicle Plate", 0, now, now);
      insertCustomFieldDef.run(randomUUID(), "sales_invoice", "Vehicle Model", 1, now, now);
      insertCustomFieldDef.run(randomUUID(), "sales_invoice", "CHASIS NO", 2, now, now);
      insertCustomFieldDef.run(randomUUID(), "sales_invoice", "SERVICE KMS", 3, now, now);

      // Fallback customer & supplier IDs if needed
      const defaultCustomerId = extracted.customers[0]?.id || "default-customer";
      if (!extracted.customers.length) {
        insertCustomer.run(defaultCustomerId, "General Customer", "General Customer", null, null, null, null, extracted.business.currency, now, now);
      }
      const defaultSupplierId = extracted.suppliers[0]?.id || "default-supplier";
      if (!extracted.suppliers.length) {
        insertSupplier.run(defaultSupplierId, "General Supplier", "General Supplier", null, null, null, null, extracted.business.currency, now, now);
      }

      // 3.10 Insert Sales Quotes
      const insertQuote = context.sqlite.prepare(`
        INSERT OR IGNORE INTO sales_quotes (
          id, quote_number, customer_id, project_id, quote_date, expiry_date,
          reference, document_status, amounts_include_tax,
          subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, NULL, ?, ?,
          NULL, 'draft', 0,
          ?, ?, ?,
          ?, '1', ?, 'Base',
          ?, ?, ?,
          ?, ?, ?
        )
      `);
      const insertQuoteLine = context.sqlite.prepare(`
        INSERT INTO sales_quote_lines (
          id, quote_id, description, quantity_micros, unit_price_minor,
          discount_type, discount_value, sales_account_id, tax_code_id, project_id, item_id,
          net_amount_minor, tax_amount_minor, gross_amount_minor, position
        ) VALUES (
          ?, ?, ?, ?, ?,
          'none', '0', 'acct-sales-4000', 'tax-uae-vat-5', NULL, NULL,
          ?, ?, ?, ?
        )
      `);

      const usedQuoteNumbers = new Set<string>();
      for (let i = 0; i < extracted.salesQuotes.length; i++) {
        const sq = extracted.salesQuotes[i];
        let qNum = sq.quoteNumber?.trim() || `SQ-${i + 1}`;
        if (usedQuoteNumbers.has(qNum.toLowerCase())) {
          qNum = `${qNum}-${i + 1}`;
        }
        usedQuoteNumbers.add(qNum.toLowerCase());

        const targetCustId = extracted.customers.find((c) => c.id === sq.customerId)?.id || defaultCustomerId;
        const qDate = sq.issueDate || now.split("T")[0];

        let subtotalMinor = 0;
        let taxMinor = 0;
        const computedLines = sq.lines.map((l, lineIdx) => {
          const qty = l.quantity > 0 ? l.quantity : 1;
          const unitPrice = l.unitPrice >= 0 ? l.unitPrice : 0;
          const net = Math.round(qty * unitPrice * 100);
          const tax = Math.round(net * 0.05);
          subtotalMinor += net;
          taxMinor += tax;
          return {
            id: randomUUID(),
            description: l.description || "Quote Line Item",
            quantityMicros: Math.round(qty * 1_000_000),
            unitPriceMinor: Math.round(unitPrice * 100),
            netAmountMinor: net,
            taxAmountMinor: tax,
            grossAmountMinor: net + tax,
            position: lineIdx + 1,
          };
        });

        const totalMinor = subtotalMinor + taxMinor;
        insertQuote.run(
          sq.id,
          qNum,
          targetCustId,
          qDate,
          qDate,
          subtotalMinor,
          taxMinor,
          totalMinor,
          extracted.business.currency,
          qDate,
          subtotalMinor,
          taxMinor,
          totalMinor,
          userId,
          now,
          now,
        );

        for (const cl of computedLines) {
          insertQuoteLine.run(
            cl.id,
            sq.id,
            cl.description,
            cl.quantityMicros,
            cl.unitPriceMinor,
            cl.netAmountMinor,
            cl.taxAmountMinor,
            cl.grossAmountMinor,
            cl.position,
          );
        }
      }

      // 3.11 Insert Purchase Invoices
      const insertBill = context.sqlite.prepare(`
        INSERT OR IGNORE INTO purchase_invoices (
          id, internal_number, supplier_id, project_id, supplier_invoice_number,
          invoice_date, tax_date, due_date, reference, purchase_order_id,
          document_status, subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at, amounts_include_tax
        ) VALUES (
          ?, ?, ?, NULL, ?,
          ?, ?, ?, NULL, NULL,
          'draft', ?, ?, ?,
          ?, '1', ?, 'Base',
          ?, ?, ?,
          ?, ?, ?, 0
        )
      `);
      const insertBillLine = context.sqlite.prepare(`
        INSERT INTO purchase_invoice_lines (
          id, purchase_invoice_id, description, quantity_micros, unit_price_minor,
          expense_account_id, tax_code_id, project_id, item_id,
          net_amount_minor, tax_amount_minor, gross_amount_minor, position,
          discount_type, discount_value
        ) VALUES (
          ?, ?, ?, ?, ?,
          'acct-operating-expenses-6000', 'tax-uae-vat-5', NULL, NULL,
          ?, ?, ?, ?,
          'none', '0'
        )
      `);

      const usedBillNumbers = new Set<string>();
      for (let i = 0; i < extracted.purchaseInvoices.length; i++) {
        const bill = extracted.purchaseInvoices[i];
        let billNum = bill.invoiceNumber?.trim() || `BILL-${i + 1}`;
        if (usedBillNumbers.has(billNum.toLowerCase())) {
          billNum = `${billNum}-${i + 1}`;
        }
        usedBillNumbers.add(billNum.toLowerCase());

        const targetSuppId = extracted.suppliers.find((s) => s.id === bill.supplierId)?.id || defaultSupplierId;
        const bDate = bill.issueDate || now.split("T")[0];

        let subtotalMinor = 0;
        let taxMinor = 0;
        const computedLines = bill.lines.map((l, lineIdx) => {
          const qty = l.quantity > 0 ? l.quantity : 1;
          const unitPrice = l.unitPrice >= 0 ? l.unitPrice : 0;
          const net = Math.round(qty * unitPrice * 100);
          const tax = Math.round(net * 0.05);
          subtotalMinor += net;
          taxMinor += tax;
          return {
            id: randomUUID(),
            description: l.description || "Purchase Line Item",
            quantityMicros: Math.round(qty * 1_000_000),
            unitPriceMinor: Math.round(unitPrice * 100),
            netAmountMinor: net,
            taxAmountMinor: tax,
            grossAmountMinor: net + tax,
            position: lineIdx + 1,
          };
        });

        const totalMinor = subtotalMinor + taxMinor;
        insertBill.run(
          bill.id,
          billNum,
          targetSuppId,
          billNum,
          bDate,
          bDate,
          bDate,
          subtotalMinor,
          taxMinor,
          totalMinor,
          extracted.business.currency,
          bDate,
          subtotalMinor,
          taxMinor,
          totalMinor,
          userId,
          now,
          now,
        );

        for (const cl of computedLines) {
          insertBillLine.run(
            cl.id,
            bill.id,
            cl.description,
            cl.quantityMicros,
            cl.unitPriceMinor,
            cl.netAmountMinor,
            cl.taxAmountMinor,
            cl.grossAmountMinor,
            cl.position,
          );
        }
      }

      // 3.12 Insert Sales Invoices
      const insertInvoice = context.sqlite.prepare(`
        INSERT OR IGNORE INTO sales_invoices (
          id, invoice_number, customer_id, project_id,
          invoice_date, tax_date, supply_emirate, due_date, reference,
          einvoice_transaction_flags_json, document_status,
          subtotal_minor, tax_minor, total_minor,
          currency_code, exchange_rate_to_base, exchange_rate_date, exchange_rate_source,
          base_subtotal_minor, base_tax_minor, base_total_minor,
          created_by, created_at, updated_at, amounts_include_tax
        ) VALUES (
          ?, ?, ?, NULL,
          ?, ?, 'dubai', ?, NULL,
          '{"freeTradeZone":false,"deemedSupply":false,"marginScheme":false,"summaryInvoice":false,"continuousSupply":false,"agentBilling":false,"eCommerce":false,"export":false}', 'draft',
          ?, ?, ?,
          ?, '1', ?, 'Base',
          ?, ?, ?,
          ?, ?, ?, 0
        )
      `);
      const insertInvoiceLine = context.sqlite.prepare(`
        INSERT INTO sales_invoice_lines (
          id, invoice_id, description, quantity_micros, unit_price_minor,
          sales_account_id, tax_code_id, project_id, item_id,
          net_amount_minor, tax_amount_minor, gross_amount_minor, position
        ) VALUES (
          ?, ?, ?, ?, ?,
          'acct-sales-4000', 'tax-uae-vat-5', NULL, NULL,
          ?, ?, ?, ?
        )
      `);

      const usedInvNumbers = new Set<string>();
      for (let i = 0; i < extracted.salesInvoices.length; i++) {
        const inv = extracted.salesInvoices[i];
        let invNum = inv.invoiceNumber?.trim() || `INV-${i + 1}`;
        if (usedInvNumbers.has(invNum.toLowerCase())) {
          invNum = `${invNum}-${i + 1}`;
        }
        usedInvNumbers.add(invNum.toLowerCase());

        const targetCustId = extracted.customers.find((c) => c.id === inv.customerId)?.id || defaultCustomerId;
        const iDate = inv.issueDate || now.split("T")[0];

        let subtotalMinor = 0;
        let taxMinor = 0;
        const computedLines = inv.lines.map((l, lineIdx) => {
          const qty = l.quantity > 0 ? l.quantity : 1;
          const unitPrice = l.unitPrice >= 0 ? l.unitPrice : 0;
          const net = Math.round(qty * unitPrice * 100);
          const tax = Math.round(net * 0.05);
          subtotalMinor += net;
          taxMinor += tax;
          return {
            id: randomUUID(),
            description: l.description || "Invoice Line Item",
            quantityMicros: Math.round(qty * 1_000_000),
            unitPriceMinor: Math.round(unitPrice * 100),
            netAmountMinor: net,
            taxAmountMinor: tax,
            grossAmountMinor: net + tax,
            position: lineIdx + 1,
          };
        });

        const totalMinor = subtotalMinor + taxMinor;
        insertInvoice.run(
          inv.id,
          invNum,
          targetCustId,
          iDate,
          iDate,
          iDate,
          subtotalMinor,
          taxMinor,
          totalMinor,
          extracted.business.currency,
          iDate,
          subtotalMinor,
          taxMinor,
          totalMinor,
          userId,
          now,
          now,
        );

        for (const cl of computedLines) {
          insertInvoiceLine.run(
            cl.id,
            inv.id,
            cl.description,
            cl.quantityMicros,
            cl.unitPriceMinor,
            cl.netAmountMinor,
            cl.taxAmountMinor,
            cl.grossAmountMinor,
            cl.position,
          );
        }
      }

      // 3.13 Insert Bank Transfers
      const insertTransfer = context.sqlite.prepare(`
        INSERT OR IGNORE INTO bank_transfers (
          id, transfer_number, from_bank_account_id, to_bank_account_id,
          date, amount_minor, reference, description, document_status,
          created_by, created_at, posted_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'posted', ?, ?, ?)
      `);

      const availableBanks = extracted.bankAccounts;
      for (let i = 0; i < extracted.bankTransfers.length; i++) {
        const tr = extracted.bankTransfers[i];
        const fromId = availableBanks.find((b) => b.id === tr.fromAccountId)?.id || availableBanks[0]?.id;
        let toId = availableBanks.find((b) => b.id === tr.toAccountId)?.id;
        if (!toId || toId === fromId) {
          toId = availableBanks.find((b) => b.id !== fromId)?.id;
        }

        if (fromId && toId && fromId !== toId) {
          const amountMinor = Math.max(1, Math.round((tr.amount || 0) * 100));
          const transferNum = `BT-${String(i + 1).padStart(4, "0")}`;
          insertTransfer.run(
            tr.id,
            transferNum,
            fromId,
            toId,
            tr.transferDate || now.split("T")[0],
            amountMinor,
            tr.description || "Inter-account transfer",
            userId,
            now,
            now,
          );
        }
      }
    })();

    // 4. Log migration event in the new business activity log
    recordActivity(businessId, {
      userId,
      entityType: "business_profile",
      entityId: businessId,
      entityNumber: nameToUse,
      action: "created",
      summary: `Imported business '${nameToUse}' from Manager.io backup with ${extracted.customers.length} customers, ${extracted.suppliers.length} suppliers, and ${extracted.salesInvoices.length} invoices.`,
      details: {
        source: "manager.io",
        customers: extracted.customers.length,
        suppliers: extracted.suppliers.length,
        items: extracted.inventoryItems.length,
        invoices: extracted.salesInvoices.length,
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
      purchaseInvoicesCount: extracted.purchaseInvoices.length,
      bankTransfersCount: extracted.bankTransfers.length,
    };

    return {
      businessId,
      businessName: nameToUse,
      summary,
    };
  } catch (err) {
    closeBusinessConnection(directoryKey);
    throw err;
  }
}
