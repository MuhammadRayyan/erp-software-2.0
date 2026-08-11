import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-pre-phase-5-")),
  BETTER_AUTH_SECRET: "pre-phase-5-regression-secret",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createBusiness } = await import("../src/core/businesses/business-service");
const { businessMigrations, migrateBusinessDatabase } = await import(
  "../src/core/db/business-migrations"
);
const { readMigrationState } = await import("../src/core/db/migrations/runner");
const { resolveBetterAuthSecret } = await import("../src/core/auth/auth-config");
const { getDocumentPdfAccess } = await import(
  "../src/core/permissions/document-pdf-access"
);
const { createInvoice, getInvoice, updateInvoice } = await import(
  "../src/modules/sales-invoices/invoice-service"
);
const { saveCreditNote } = await import(
  "../src/modules/sales-credit-notes/credit-note-service"
);
const {
  createReceipt,
  getReceipt,
  listReceipts,
  voidReceipt,
} = await import("../src/modules/receipts/receipt-service");
const { savePurchaseInvoice, getPurchaseInvoice } = await import(
  "../src/modules/purchase-invoices/purchase-invoice-service"
);
const {
  createSupplierPayment,
  getSupplierPayment,
  listAllSupplierPayments,
  voidSupplierPayment,
} = await import("../src/modules/supplier-payments/supplier-payment-service");
const {
  getGoodsReceipt,
  goodsReceiptToInput,
  saveGoodsReceipt,
  voidGoodsReceipt,
} = await import("../src/modules/inventory/goods-receipt-service");
const { saveDeliveryNote } = await import(
  "../src/modules/inventory/delivery-note-service"
);
const {
  averageUnitCostMicros,
  receivedValueMinor,
} = await import("../src/modules/inventory/inventory-valuation");
const { getGeneralLedger } = await import("../src/modules/reports/report-service");

const seeded = await seedDemoData();
const businessId = seeded.business.id;
const adminId = seeded.admin.id;
const standardId = seeded.standard.id;
const { sqlite } = getBusinessDb(businessId, adminId);

const customer = sqlite.prepare("SELECT id FROM customers ORDER BY created_at LIMIT 1").get() as {
  id: string;
};
const supplier = sqlite.prepare("SELECT id FROM suppliers ORDER BY created_at LIMIT 1").get() as {
  id: string;
};
const settings = sqlite.prepare(`
  SELECT default_sales_account_id, default_bank_account_id,
    default_purchase_expense_account_id
  FROM business_accounting_settings LIMIT 1
`).get() as {
  default_sales_account_id: string;
  default_bank_account_id: string;
  default_purchase_expense_account_id: string;
};
const tax = sqlite.prepare(
  "SELECT id FROM tax_codes WHERE vat_category = 'out_of_scope' AND direction = 'both' ORDER BY name LIMIT 1",
).get() as { id: string };

const invoiceInput = {
  customerId: customer.id,
  projectId: "",
  invoiceDate: "2026-01-05",
  dueDate: "2026-01-31",
  reference: "REG-INVOICE",
  lines: [
    {
      itemId: "",
      description: "Regression service",
      quantity: "1",
      unitPrice: "100.00",
      salesAccountId: settings.default_sales_account_id,
      taxCodeId: tax.id,
      projectId: "",
    },
  ],
};

let invoiceId = "";
let purchaseInvoiceId = "";

test("pre-Phase-5 service invariants", async (suite) => {
  await suite.test("posted invoice edits replace rather than duplicate journals", () => {
    invoiceId = createInvoice(businessId, adminId, invoiceInput, "post");
    const count = () => (sqlite.prepare(`
      SELECT COUNT(*) AS count FROM journal_entries
      WHERE source_type = 'sales_invoice' AND source_id = ?
    `).get(invoiceId) as { count: number }).count;
    assert.equal(count(), 1);
    updateInvoice(
      businessId,
      adminId,
      invoiceId,
      { ...invoiceInput, reference: "REG-INVOICE-EDITED" },
      "post",
    );
    assert.equal(count(), 1);
  });

  await suite.test("credit notes reduce AR and receipt allocations cannot overpay", () => {
    const before = getInvoice(businessId, adminId, invoiceId);
    assert.ok(before);
    saveCreditNote(
      businessId,
      adminId,
      {
        customerId: customer.id,
        projectId: "",
        sourceInvoiceId: invoiceId,
        date: "2026-01-10",
        reference: "REG-CREDIT",
        reason: "Regression allowance",
        lines: [
          {
            description: "Allowance",
            quantity: "1",
            unitPrice: "10.00",
            salesAccountId: settings.default_sales_account_id,
            taxCodeId: tax.id,
            projectId: "",
          },
        ],
      },
      "post",
    );
    const after = getInvoice(businessId, adminId, invoiceId);
    assert.ok(after);
    assert.ok(after.balanceMinor < before.balanceMinor);
    assert.throws(
      () => createReceipt(businessId, adminId, {
        customerId: customer.id,
        invoiceId,
        date: "2026-01-11",
        bankAccountId: settings.default_bank_account_id,
        amount: "1000.00",
        reference: "REG-OVERPAY",
        description: "Must fail",
      }),
      /cannot exceed the invoice balance/i,
    );
  });

  await suite.test("receipt list/view and reversal restore the invoice balance", () => {
    const before = getInvoice(businessId, adminId, invoiceId)?.balanceMinor;
    assert.equal(typeof before, "number");
    const created = createReceipt(businessId, adminId, {
      customerId: customer.id,
      invoiceId,
      date: "2026-01-12",
      bankAccountId: settings.default_bank_account_id,
      amount: "5.00",
      reference: "REG-RECEIPT",
      description: "Lifecycle regression",
    });
    assert.ok(listReceipts(businessId, adminId).some((entry) => entry.id === created.id));
    assert.equal(getReceipt(businessId, adminId, created.id)?.journals.length, 1);
    assert.equal(getInvoice(businessId, adminId, invoiceId)?.balanceMinor, before! - 500);
    voidReceipt(businessId, adminId, created.id);
    const view = getReceipt(businessId, adminId, created.id);
    assert.equal(view?.receipt.document_status, "void");
    assert.equal(view?.journals.length, 2);
    assert.equal(getInvoice(businessId, adminId, invoiceId)?.balanceMinor, before);
  });

  await suite.test("supplier payments reject over-allocation and reverse cleanly", () => {
    purchaseInvoiceId = savePurchaseInvoice(
      businessId,
      adminId,
      {
        supplierId: supplier.id,
        projectId: "",
        supplierInvoiceNumber: "REG-SUPPLIER-001",
        invoiceDate: "2026-01-15",
        dueDate: "2026-01-31",
        reference: "REG-PURCHASE",
        purchaseOrderId: "",
        lines: [
          {
            itemId: "",
            description: "Regression purchase",
            quantity: "1",
            unitPrice: "80.00",
            expenseAccountId: settings.default_purchase_expense_account_id,
            taxCodeId: tax.id,
            projectId: "",
          },
        ],
      },
      "post",
    );
    assert.throws(
      () => createSupplierPayment(businessId, adminId, {
        supplierId: supplier.id,
        purchaseInvoiceId,
        date: "2026-01-16",
        bankAccountId: settings.default_bank_account_id,
        amount: "1000.00",
        reference: "REG-OVERPAY",
        description: "Must fail",
      }),
      /exceeds the selected payable/i,
    );
    const before = getPurchaseInvoice(businessId, adminId, purchaseInvoiceId)?.balanceMinor;
    assert.equal(typeof before, "number");
    const payment = createSupplierPayment(businessId, adminId, {
      supplierId: supplier.id,
      purchaseInvoiceId,
      date: "2026-01-16",
      bankAccountId: settings.default_bank_account_id,
      amount: "5.00",
      reference: "REG-PAYMENT",
      description: "Lifecycle regression",
    });
    assert.ok(listAllSupplierPayments(businessId, adminId).some((entry) => entry.id === payment.id));
    assert.equal(getSupplierPayment(businessId, adminId, payment.id)?.journals.length, 1);
    assert.equal(
      getPurchaseInvoice(businessId, adminId, purchaseInvoiceId)?.balanceMinor,
      before! - 500,
    );
    voidSupplierPayment(businessId, adminId, payment.id);
    const view = getSupplierPayment(businessId, adminId, payment.id);
    assert.equal(view?.payment.document_status, "void");
    assert.equal(view?.journals.length, 2);
    assert.equal(getPurchaseInvoice(businessId, adminId, purchaseInvoiceId)?.balanceMinor, before);
  });

  await suite.test("filtered General Ledger starts from qualifying opening activity", () => {
    createInvoice(
      businessId,
      adminId,
      {
        ...invoiceInput,
        invoiceDate: "2026-02-05",
        dueDate: "2026-02-28",
        reference: "REG-GL-CURRENT",
      },
      "post",
    );
    const ar = sqlite.prepare(
      "SELECT accounts_receivable_account_id AS id FROM business_accounting_settings LIMIT 1",
    ).get() as { id: string };
    const expectedOpening = (sqlite.prepare(`
      SELECT COALESCE(SUM(jl.debit_minor - jl.credit_minor), 0) AS balance
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.status = 'posted' AND je.date < '2026-02-01' AND jl.account_id = ?
    `).get(ar.id) as { balance: number }).balance;
    const rows = getGeneralLedger(businessId, adminId, {
      dateFrom: "2026-02-01",
      accountId: ar.id,
    });
    assert.ok(rows.length > 0);
    assert.equal(rows[0].openingBalanceMinor, expectedOpening);
    assert.equal(
      rows[0].balanceMinor,
      expectedOpening + rows[0].debit_minor - rows[0].credit_minor,
    );
  });

  await suite.test("business isolation prevents cross-business record and PDF access", () => {
    const other = createBusiness(
      {
        name: "Regression Isolation Business",
        country: "United Arab Emirates",
        currency: "AED",
        financialYearStartMonth: 1,
      },
      adminId,
    );
    assert.equal(getInvoice(other.id, adminId, invoiceId), null);
    assert.equal(getDocumentPdfAccess(other.id, standardId, "sales-invoice"), null);
  });

  await suite.test("inventory valuation and chronology/source guards hold", () => {
    const firstValue = receivedValueMinor(100_000, 300);
    const secondValue = receivedValueMinor(100_000, 500);
    assert.equal(averageUnitCostMicros(firstValue + secondValue, 200_000), 4_000_000);

    const location = sqlite.prepare(
      "SELECT id FROM inventory_locations WHERE is_default = 1 LIMIT 1",
    ).get() as { id: string };
    const copper = sqlite.prepare(
      "SELECT id FROM inventory_items WHERE sku = 'COPPER-CABLE'",
    ).get() as { id: string };
    const oldReceipt = sqlite.prepare(
      "SELECT id FROM goods_receipts WHERE reference = 'DEMO-INVENTORY-RECEIPT'",
    ).get() as { id: string };
    const oldRecord = getGoodsReceipt(businessId, adminId, oldReceipt.id);
    assert.ok(oldRecord);
    const oldInput = goodsReceiptToInput(oldRecord);
    assert.throws(
      () => saveGoodsReceipt(businessId, adminId, oldInput, "post", oldReceipt.id),
      /cannot be edited because later stock movements/i,
    );
    assert.throws(
      () => voidGoodsReceipt(businessId, adminId, oldReceipt.id),
      /cannot be voided because later stock movements/i,
    );
    assert.throws(
      () => saveGoodsReceipt(businessId, adminId, {
        supplierId: supplier.id,
        purchaseOrderId: "",
        purchaseInvoiceId: "",
        date: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10),
        locationId: location.id,
        reference: "REG-BACKDATED",
        projectId: "",
        notes: "Must fail",
        lines: [{
          itemId: copper.id,
          description: "Copper Cable",
          quantity: "1",
          unitCost: "3.00",
          projectId: "",
          purchaseOrderLineId: "",
          purchaseInvoiceLineId: "",
        }],
      }, "post"),
      /cannot be backdated because later stock movements/i,
    );
  });

  await suite.test("PO over-receipt, SI over-delivery, and negative stock are rejected", () => {
    const location = sqlite.prepare(
      "SELECT id FROM inventory_locations WHERE is_default = 1 LIMIT 1",
    ).get() as { id: string };
    const po = sqlite.prepare(`
      SELECT po.id, po.supplier_id, pol.id AS line_id, pol.item_id
      FROM purchase_orders po
      INNER JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
      WHERE po.reference = 'DEMO-INVENTORY-PO'
    `).get() as { id: string; supplier_id: string; line_id: string; item_id: string };
    const today = new Date().toISOString().slice(0, 10);
    saveGoodsReceipt(businessId, adminId, {
      supplierId: po.supplier_id,
      purchaseOrderId: po.id,
      purchaseInvoiceId: "",
      date: today,
      locationId: location.id,
      reference: "REG-PO-RECEIPT",
      projectId: "",
      notes: "",
      lines: [{
        itemId: po.item_id,
        description: "Junction Box",
        quantity: "50",
        unitCost: "7.00",
        projectId: "",
        purchaseOrderLineId: po.line_id,
        purchaseInvoiceLineId: "",
      }],
    }, "post");
    assert.throws(
      () => saveGoodsReceipt(businessId, adminId, {
        supplierId: po.supplier_id,
        purchaseOrderId: po.id,
        purchaseInvoiceId: "",
        date: today,
        locationId: location.id,
        reference: "REG-PO-OVER",
        projectId: "",
        notes: "",
        lines: [{
          itemId: po.item_id,
          description: "Junction Box",
          quantity: "1",
          unitCost: "7.00",
          projectId: "",
          purchaseOrderLineId: po.line_id,
          purchaseInvoiceLineId: "",
        }],
      }, "post"),
      /exceeds the remaining Purchase Order quantity/i,
    );

    const sales = sqlite.prepare(`
      SELECT si.id, si.customer_id, sil.id AS line_id, sil.item_id
      FROM sales_invoices si
      INNER JOIN sales_invoice_lines sil ON sil.invoice_id = si.id
      WHERE si.reference = 'DEMO-INVENTORY-SALES'
    `).get() as { id: string; customer_id: string; line_id: string; item_id: string };
    saveGoodsReceipt(businessId, adminId, {
      supplierId: supplier.id,
      purchaseOrderId: "",
      purchaseInvoiceId: "",
      date: today,
      locationId: location.id,
      reference: "REG-CONDUIT-STOCK",
      projectId: "",
      notes: "",
      lines: [{
        itemId: sales.item_id,
        description: "PVC Conduit",
        quantity: "40",
        unitCost: "2.00",
        projectId: "",
        purchaseOrderLineId: "",
        purchaseInvoiceLineId: "",
      }],
    }, "post");
    const deliveryId = saveDeliveryNote(businessId, adminId, {
      customerId: sales.customer_id,
      salesInvoiceId: sales.id,
      date: today,
      locationId: location.id,
      reference: "REG-SI-DELIVERY",
      projectId: "",
      notes: "",
      lines: [{
        itemId: sales.item_id,
        description: "PVC Conduit",
        quantity: "30",
        projectId: "",
        salesInvoiceLineId: sales.line_id,
      }],
    }, "post");
    assert.throws(
      () => saveDeliveryNote(businessId, adminId, {
        customerId: sales.customer_id,
        salesInvoiceId: sales.id,
        date: today,
        locationId: location.id,
        reference: "REG-SI-OVER",
        projectId: "",
        notes: "",
        lines: [{
          itemId: sales.item_id,
          description: "PVC Conduit",
          quantity: "1",
          projectId: "",
          salesInvoiceLineId: sales.line_id,
        }],
      }, "post"),
      /exceeds the remaining invoiced quantity/i,
    );
    assert.throws(
      () => saveDeliveryNote(businessId, adminId, {
        customerId: sales.customer_id,
        salesInvoiceId: "",
        date: today,
        locationId: location.id,
        reference: "REG-NEGATIVE",
        projectId: "",
        notes: "",
        lines: [{
          itemId: po.item_id,
          description: "Junction Box",
          quantity: "51",
          projectId: "",
          salesInvoiceLineId: "",
        }],
      }, "post"),
      /Only 50 pcs are available/i,
    );
    const cogs = sqlite.prepare(`
      SELECT SUM(jl.debit_minor) AS debit, SUM(jl.credit_minor) AS credit
      FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.source_type = 'delivery_note' AND je.source_id = ?
    `).get(deliveryId) as { debit: number; credit: number };
    assert.equal(cogs.debit, cogs.credit);
  });

  await suite.test("all generated journals balance", () => {
    const unbalanced = sqlite.prepare(`
      SELECT je.id
      FROM journal_entries je
      INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
      GROUP BY je.id
      HAVING SUM(jl.debit_minor) <> SUM(jl.credit_minor)
    `).all();
    assert.deepEqual(unbalanced, []);
  });

  await suite.test("PDF permission mapping and auth-secret policy are server enforced", () => {
    assert.ok(getDocumentPdfAccess(businessId, standardId, "sales-invoice"));
    assert.equal(getDocumentPdfAccess(businessId, standardId, "purchase-invoice"), null);
    assert.equal(getDocumentPdfAccess(businessId, standardId, "goods-receipt"), null);
    assert.equal(
      resolveBetterAuthSecret({ NODE_ENV: "development" }),
      "phase-zero-development-secret-change-me",
    );
    assert.throws(
      () => resolveBetterAuthSecret({ NODE_ENV: "production" }),
      /BETTER_AUTH_SECRET is required/i,
    );
  });

  await suite.test("migration state, adoption, incomplete, and newer schemas are guarded", () => {
    const current = readMigrationState(sqlite, businessMigrations, "current regression DB");
    assert.equal(current.current, true);

    const legacy = new Database(":memory:");
    businessMigrations[0].up(legacy);
    migrateBusinessDatabase(legacy, "valid legacy regression DB");
    assert.equal(
      readMigrationState(legacy, businessMigrations, "valid legacy regression DB").current,
      true,
    );
    legacy.close();

    const incomplete = new Database(":memory:");
    incomplete.exec(`
      CREATE TABLE sales_invoices (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('draft', 'sent'))
      );
    `);
    assert.throws(
      () => migrateBusinessDatabase(incomplete, "incomplete legacy regression DB"),
      /Cannot adopt legacy business schema baseline 0/i,
    );
    incomplete.close();

    const newer = new Database(":memory:");
    newer.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations VALUES (999, 'future', '2026-01-01T00:00:00.000Z');
    `);
    assert.throws(
      () => migrateBusinessDatabase(newer, "future regression DB"),
      /newer than this application understands/i,
    );
    newer.close();
  });
});
