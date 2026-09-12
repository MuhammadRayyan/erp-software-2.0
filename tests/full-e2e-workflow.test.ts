import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-full-e2e-")),
  BETTER_AUTH_SECRET: "full-e2e-secret-key-12345",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

// Entities
const { createCustomer, getCustomer } = await import("../src/modules/customers/customer-service");
const { createSupplier, getSupplier } = await import("../src/modules/suppliers/supplier-service");
const { createProject, getProject } = await import("../src/modules/projects/project-service");
const { saveInventoryItem, getInventoryItem } = await import("../src/modules/inventory/inventory-item-service");
const { saveInventoryLocation } = await import("../src/modules/inventory/inventory-location-service");

// Sales Cycle
const {
  saveSalesQuote,
  getSalesQuote,
  createSalesQuoteRevision,
  listSalesQuoteRevisions,
} = await import("../src/modules/sales-quotes/quote-service");
const { saveSalesOrder, getSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
const { createInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { createReceipt } = await import("../src/modules/receipts/receipt-service");
const { saveCreditNote, getCreditNote } = await import("../src/modules/sales-credit-notes/credit-note-service");

// Purchases Cycle
const {
  savePurchaseQuote,
  getPurchaseQuote,
  createPurchaseQuoteRevision,
  listPurchaseQuoteRevisions,
} = await import("../src/modules/purchase-quotes/purchase-quote-service");
const { savePurchaseOrder, getPurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");
const { savePurchaseInvoice, getPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { createSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
const { saveDebitNote, getDebitNote } = await import("../src/modules/debit-notes/debit-note-service");

// Inventory Operations
const { saveGoodsReceipt } = await import("../src/modules/inventory/goods-receipt-service");
const { getStockOnHandReport } = await import("../src/modules/inventory/inventory-report-service");

// Reports & VAT
const { getGeneralLedger, getTrialBalance } = await import("../src/modules/reports/report-service");
const { getVatTransactionDetail } = await import("../src/modules/tax/vat-report-service");

// Custom Fields & Form Defaults
const { createCustomFieldDefinition, saveCustomFieldValues } = await import("../src/modules/custom-fields/custom-field-service");
const { getFormDefaults, saveFormDefaults } = await import("../src/modules/form-defaults/form-defaults-service");

const { quantityMicrosToInput } = await import("../src/modules/accounting/calculations/money");

test("Comprehensive ERP Full In-Depth Functional & Financial Verification", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const { sqlite } = getBusinessDb(businessId, adminId);

  // Retrieve Core Chart of Accounts & Tax Codes
  const salesAccount = (sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' AND is_active = 1 LIMIT 1").get() as any).id;
  const expenseAccount = (sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' AND is_active = 1 LIMIT 1").get() as any).id;
  const assetAccount = (sqlite.prepare("SELECT id FROM accounts WHERE type = 'asset' AND is_active = 1 LIMIT 1").get() as any).id;
  const vatOutput5 = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('sales', 'both') LIMIT 1").get() as any).id;
  const vatInput5 = (sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 AND direction IN ('purchases', 'both') LIMIT 1").get() as any).id;
  const arAccountId = (sqlite.prepare("SELECT accounts_receivable_account_id FROM business_accounting_settings LIMIT 1").get() as any).accounts_receivable_account_id;
  const apAccountId = (sqlite.prepare("SELECT accounts_payable_account_id FROM business_accounting_settings LIMIT 1").get() as any).accounts_payable_account_id;

  assert.ok(salesAccount, "Sales account exists");
  assert.ok(expenseAccount, "Expense account exists");
  assert.ok(assetAccount, "Asset account exists");
  assert.ok(vatOutput5, "5% Sales Tax Code exists");
  assert.ok(vatInput5, "5% Purchase Tax Code exists");

  let customerId = "";
  let foreignCustomerId = "";
  let supplierId = "";
  let projectId = "";
  let locationId = "";
  let itemId = "";

  await suite.test("Phase 1: Master Data, Projects, Custom Fields & Form Defaults", () => {
    // 1.1 Customer creation (Local AED & Foreign USD)
    customerId = createCustomer(businessId, adminId, {
      name: "Global Tech Solutions LLC",
      email: "billing@globaltech.ae",
      taxReference: "100999888777003",
      defaultCurrencyCode: "AED",
      isActive: true,
      billingAddress: "Downtown Burj, Dubai, UAE",
    });
    assert.ok(customerId);

    foreignCustomerId = createCustomer(businessId, adminId, {
      name: "Acme International Inc",
      email: "finance@acme-global.us",
      taxReference: "US-999-1234",
      defaultCurrencyCode: "USD",
      isActive: true,
      billingAddress: "123 Market St, San Francisco, CA, USA",
    });
    assert.ok(foreignCustomerId);

    // 1.2 Supplier creation
    supplierId = createSupplier(businessId, adminId, {
      name: "Apex Heavy Machinery Supplies",
      email: "orders@apexmachinery.ae",
      taxReference: "100111222333003",
      defaultCurrencyCode: "AED",
      isActive: true,
      address: "Industrial Area 1, Sharjah, UAE",
    });
    assert.ok(supplierId);

    // 1.3 Project creation
    projectId = createProject(businessId, adminId, {
      name: "Data Center Infrastructure Expansion",
      code: "PRJ-DC-2026",
      customerId,
      status: "active",
      description: "Expansion project",
      startDate: "2026-08-01",
      targetEndDate: "2026-12-31",
      actualEndDate: "",
      budgetRevenue: "500000.00",
      budgetCost: "300000.00",
      managerName: "Alice Smith",
    });
    assert.ok(projectId);

    // 1.4 Inventory Location & Item
    locationId = saveInventoryLocation(businessId, adminId, {
      name: "Main Warehouse Dubai",
      code: "WH-DXB-01",
      isActive: true,
      isDefault: true,
    });
    assert.ok(locationId);

    itemId = saveInventoryItem(businessId, adminId, {
      name: "High Performance Server Blade X10",
      sku: "SRV-X10",
      description: "Enterprise Server Blade",
      unitName: "unit",
      purchasePrice: "10000.00",
      salesPrice: "15000.00",
      inventoryAssetAccountId: assetAccount,
      costOfSalesAccountId: expenseAccount,
      salesAccountId: salesAccount,
      isActive: true,
    });
    assert.ok(itemId);

    // 1.5 Custom Fields definition & assignment
    const fieldDefId = createCustomFieldDefinition(businessId, adminId, {
      entityType: "customer",
      name: "Client Tier",
      fieldType: "text",
      isRequired: false,
    });
    assert.ok(fieldDefId);
    saveCustomFieldValues(businessId, adminId, "customer", customerId, { [fieldDefId]: "Enterprise Diamond" });

    // 1.6 Form Defaults for Purchase Quote & Sales Quote
    saveFormDefaults(businessId, adminId, "sales-quote", {
      defaultNotes: "Standard proposal validity: 30 days.",
      defaultTerms: "Payment within 15 days of invoice.",
      amountsIncludeTax: false,
      showDiscounts: true,
      showLineNumber: true,
      showDescription: true,
    });
    const defaults = getFormDefaults(businessId, adminId, "sales-quote");
    assert.equal(defaults.showDiscounts, true);
    assert.equal(defaults.defaultNotes, "Standard proposal validity: 30 days.");
  });

  let salesQuoteId = "";
  let salesQuoteRev1Id = "";
  let salesOrderId = "";
  let salesInvoiceId = "";

  await suite.test("Phase 2: Complete Sales Cycle (Quote Rev -> Order -> Invoice -> Receipt -> Credit Note)", () => {
    // 2.1 Create Sales Quote SQ (Rev 0)
    salesQuoteId = saveSalesQuote(
      businessId,
      adminId,
      {
        customerId,
        projectId,
        date: "2026-08-10",
        expectedDate: "2026-09-10",
        reference: "PROPOSAL-2026-01",
        notes: "Initial quote",
        terms: "Standard terms of 30 days",
        amountsIncludeTax: false,
        lines: [
          {
            itemId,
            description: "High Performance Server Blade X10",
            quantity: "2",
            unitPrice: "15000.00",
            discountType: "none",
            discountValue: "0",
            salesAccountId: salesAccount,
            taxCodeId: vatOutput5,
            projectId,
          },
        ],
      },
      "issue",
    );
    const sq0 = getSalesQuote(businessId, adminId, salesQuoteId);
    assert.ok(sq0);
    assert.equal(sq0.quote.revisionNumber, 0);
    assert.equal(sq0.quote.isLatestRevision, true);

    // 2.2 Create Revision 1 of Sales Quote with a 10% discount
    salesQuoteRev1Id = createSalesQuoteRevision(businessId, adminId, salesQuoteId);
    saveSalesQuote(
      businessId,
      adminId,
      {
        customerId,
        projectId,
        date: "2026-08-11",
        expectedDate: "2026-09-11",
        reference: "PROPOSAL-2026-01-REV1",
        notes: "Revised with 10% client discount",
        amountsIncludeTax: false,
        lines: [
          {
            itemId,
            description: "High Performance Server Blade X10",
            quantity: "2",
            unitPrice: "15000.00",
            discountType: "percentage",
            discountValue: "10",
            salesAccountId: salesAccount,
            taxCodeId: vatOutput5,
            projectId,
          },
        ],
      },
      "issue",
      salesQuoteRev1Id,
    );

    const sq1 = getSalesQuote(businessId, adminId, salesQuoteRev1Id);
    assert.ok(sq1);
    assert.equal(sq1.quote.revisionNumber, 1);
    assert.equal(sq1.lines[0].netAmountMinor, 27_000_00); // 2 * 15,000 = 30,000 - 10% = 27,000.00 AED
    assert.equal(sq1.lines[0].taxAmountMinor, 1_350_00); // 5% VAT = 1,350.00 AED
    assert.equal(sq1.lines[0].grossAmountMinor, 28_350_00);

    // Verify SQ0 is superseded
    const sq0Updated = getSalesQuote(businessId, adminId, salesQuoteId);
    assert.equal(sq0Updated?.quote.documentStatus, "superseded");

    // 2.3 Convert Sales Quote Rev 1 to Sales Order
    salesOrderId = saveSalesOrder(
      businessId,
      adminId,
      {
        customerId: sq1.quote.customerId,
        salesQuoteId: salesQuoteRev1Id,
        projectId: sq1.quote.projectId || "",
        date: "2026-08-12",
        expectedDate: "2026-08-25",
        reference: sq1.quote.quoteNumber,
        notes: "Sales Order from SQ",
        terms: "Order terms",
        amountsIncludeTax: sq1.quote.amountsIncludeTax,
        lines: sq1.lines.map((l) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          discountType: (l.discountType as any) || "none",
          discountValue: l.discountValue || "0",
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          salesAccountId: l.salesAccountId,
          taxCodeId: l.taxCodeId,
          projectId: l.projectId || "",
        })),
      },
      "issue",
    );
    assert.ok(salesOrderId);

    // Auto update quote to accepted
    sqlite.prepare("UPDATE sales_quotes SET document_status = 'accepted' WHERE id = ?").run(salesQuoteRev1Id);

    const so = getSalesOrder(businessId, adminId, salesOrderId);
    assert.ok(so);
    assert.equal(so.order.notes, "Sales Order from SQ");
    assert.equal(so.order.terms, "Order terms");
    assert.equal(so.order.salesQuoteId, salesQuoteRev1Id);
    assert.equal(so.lines[0].netAmountMinor, 27_000_00);

    // 2.4 Convert Sales Order to Sales Invoice (Create & Post)
    salesInvoiceId = createInvoice(
      businessId,
      adminId,
      {
        customerId: so.order.customerId,
        salesOrderId: salesOrderId,
        projectId: so.order.projectId || "",
        invoiceDate: "2026-08-14",
        dueDate: "2026-08-28",
        taxDate: "2026-08-14",
        supplyEmirate: "dubai",
        reference: so.order.orderNumber,
        amountsIncludeTax: so.order.amountsIncludeTax,
        lines: so.lines.map((l) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          discountType: (l.discountType as any) || "none",
          discountValue: l.discountValue || "0",
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          salesAccountId: l.salesAccountId,
          taxCodeId: l.taxCodeId,
          projectId: l.projectId || "",
        })),
      },
      "post",
    );
    assert.ok(salesInvoiceId);

    // Auto mark sales order completed
    sqlite.prepare("UPDATE sales_orders SET document_status = 'completed' WHERE id = ?").run(salesOrderId);

    const postedInvoice = getInvoice(businessId, adminId, salesInvoiceId);
    assert.ok(postedInvoice);
    assert.equal(postedInvoice.invoice.documentStatus, "posted");
    assert.equal(postedInvoice.invoice.totalMinor, 28_350_00);
    assert.equal(postedInvoice.balanceMinor, 28_350_00);

    // Check General Ledger Journal Lines for this Invoice
    const journals = sqlite.prepare(`
      SELECT jl.* FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.source_id = ?
    `).all(salesInvoiceId) as any[];
    assert.ok(journals.length >= 3);
    const arLeg = journals.find((j) => j.account_id === arAccountId);
    const revLeg = journals.find((j) => j.account_id === salesAccount);
    const vatLeg = journals.find((j) => j.account_id !== arAccountId && j.account_id !== salesAccount);

    assert.ok(arLeg, "AR journal leg created");
    assert.equal(arLeg.debit_minor, 28_350_00);
    assert.ok(revLeg, "Revenue journal leg created");
    assert.equal(revLeg.credit_minor, 27_000_00);
    assert.ok(vatLeg, "Output VAT journal leg created");
    assert.equal(vatLeg.credit_minor, 1_350_00);

    // 2.5 Record Receipt of 20,000 AED against Invoice
    const bankAcc = (sqlite.prepare("SELECT id FROM accounts WHERE type = 'asset' AND name LIKE '%Bank%' LIMIT 1").get() as any).id;
    const receiptResult = createReceipt(businessId, adminId, {
      customerId,
      invoiceId: salesInvoiceId,
      date: "2026-08-15",
      bankAccountId: bankAcc,
      amount: "20000.00",
      reference: "TRF-REC-001",
      description: "Partial wire transfer",
    });
    assert.ok(receiptResult);

    const invoiceAfterReceipt = getInvoice(businessId, adminId, salesInvoiceId);
    assert.equal(invoiceAfterReceipt?.balanceMinor, 8_350_00); // 28,350 - 20,000 = 8,350 AED

    // 2.6 Issue Sales Credit Note for remaining 8,350 AED to clear balance
    const creditNoteId = saveCreditNote(
      businessId,
      adminId,
      {
        customerId,
        sourceInvoiceId: salesInvoiceId,
        date: "2026-08-20",
        taxDate: "2026-08-20",
        supplyEmirate: "dubai",
        reference: "CN-SETTLE-01",
        reason: "Negotiated Goodwill Credit Adjustment",
        amountsIncludeTax: true,
        lines: [
          {
            description: "Negotiated Goodwill Credit Adjustment",
            quantity: "1",
            unitPrice: "8350.00",
            discountType: "none",
            discountValue: "0",
            salesAccountId: salesAccount,
            taxCodeId: vatOutput5,
            projectId,
          },
        ],
      },
      "post",
    );
    assert.ok(creditNoteId);

    const invoiceFullyCleared = getInvoice(businessId, adminId, salesInvoiceId);
    assert.equal(invoiceFullyCleared?.balanceMinor, 0);
  });

  let purchaseQuoteId = "";
  let purchaseQuoteRev1Id = "";
  let purchaseOrderId = "";
  let purchaseInvoiceId = "";

  await suite.test("Phase 3: Complete Purchases Cycle (Quote Rev -> PO -> Goods Receipt -> PI -> Payment)", () => {
    // 3.1 Create Purchase Quote (RFQ)
    purchaseQuoteId = savePurchaseQuote(
      businessId,
      adminId,
      {
        supplierId,
        projectId,
        date: "2026-08-01",
        expiryDate: "2026-08-30",
        reference: "RFQ-MACH-01",
        notes: "Supplier quotation request",
        terms: "Net 30",
        currencyCode: "AED",
        exchangeRateToBase: "1",
        exchangeRateDate: "2026-08-01",
        exchangeRateSource: "Base",
        amountsIncludeTax: false,
        lines: [
          {
            itemId,
            description: "High Performance Server Blade X10",
            quantity: "5",
            unitPrice: "10000.00",
            discountType: "none",
            discountValue: "0",
            expenseAccountId: expenseAccount,
            taxCodeId: vatInput5,
            projectId,
          },
        ],
      },
      "issue",
    );

    // 3.2 Create Revision 1 with negotiated 5% discount
    purchaseQuoteRev1Id = createPurchaseQuoteRevision(businessId, adminId, purchaseQuoteId);
    savePurchaseQuote(
      businessId,
      adminId,
      {
        supplierId,
        projectId,
        date: "2026-08-02",
        expiryDate: "2026-08-30",
        reference: "RFQ-MACH-01-REV1",
        notes: "Supplier approved 5% volume discount",
        terms: "Net 30",
        currencyCode: "AED",
        exchangeRateToBase: "1",
        exchangeRateDate: "2026-08-02",
        exchangeRateSource: "Base",
        amountsIncludeTax: false,
        lines: [
          {
            itemId,
            description: "High Performance Server Blade X10",
            quantity: "5",
            unitPrice: "10000.00",
            discountType: "percentage",
            discountValue: "5",
            expenseAccountId: expenseAccount,
            taxCodeId: vatInput5,
            projectId,
          },
        ],
      },
      "issue",
      purchaseQuoteRev1Id,
    );

    const pq1 = getPurchaseQuote(businessId, adminId, purchaseQuoteRev1Id);
    assert.ok(pq1);
    assert.equal(pq1.lines[0].netAmountMinor, 47_500_00); // 5 * 10,000 = 50,000 - 5% = 47,500.00 AED
    assert.equal(pq1.lines[0].taxAmountMinor, 2_375_00); // 5% VAT = 2,375.00 AED
    assert.equal(pq1.lines[0].grossAmountMinor, 49_875_00);

    // 3.3 Convert Purchase Quote Rev 1 to Purchase Order
    purchaseOrderId = savePurchaseOrder(
      businessId,
      adminId,
      {
        supplierId: pq1.quote.supplierId,
        projectId: pq1.quote.projectId || "",
        purchaseQuoteId: purchaseQuoteRev1Id,
        date: "2026-08-05",
        expectedDate: "2026-08-20",
        reference: pq1.quote.quoteNumber,
        notes: pq1.quote.notes || "",
        currencyCode: pq1.quote.currencyCode,
        exchangeRateToBase: String(pq1.quote.exchangeRateToBase),
        exchangeRateDate: pq1.quote.exchangeRateDate || "",
        exchangeRateSource: pq1.quote.exchangeRateSource as any,
        amountsIncludeTax: pq1.quote.amountsIncludeTax,
        lines: pq1.lines.map((l) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          discountType: (l.discountType as any) || "none",
          discountValue: l.discountValue || "0",
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          expenseAccountId: l.expenseAccountId || "",
          taxCodeId: l.taxCodeId || "",
          projectId: l.projectId || "",
        })),
      },
      "issue",
    );
    assert.ok(purchaseOrderId);

    // Auto update purchase quote to accepted
    sqlite.prepare("UPDATE purchase_quotes SET document_status = 'accepted' WHERE id = ?").run(purchaseQuoteRev1Id);

    const po = getPurchaseOrder(businessId, adminId, purchaseOrderId);
    assert.ok(po);
    assert.equal(po.order.purchaseQuoteId, purchaseQuoteRev1Id);
    assert.equal(po.lines[0].netAmountMinor, 47_500_00);

    // 3.4 Receive Physical Goods (Goods Receipt for 5 units)
    const goodsReceiptId = saveGoodsReceipt(
      businessId,
      adminId,
      {
        supplierId,
        purchaseOrderId,
        purchaseInvoiceId: "",
        locationId,
        date: "2026-08-12",
        reference: "DN-SUPPLIER-888",
        projectId: "",
        notes: "",
        lines: [
          {
            itemId,
            description: "High Performance Server Blade X10",
            quantity: "5",
            unitCost: "9500.00",
            projectId: "",
            purchaseOrderLineId: po.lines[0].id,
            purchaseInvoiceLineId: "",
          },
        ],
      },
      "post",
    );
    assert.ok(goodsReceiptId);

    // 3.5 Convert Purchase Order to Purchase Invoice
    purchaseInvoiceId = savePurchaseInvoice(
      businessId,
      adminId,
      {
        supplierId: po.order.supplierId,
        purchaseOrderId: purchaseOrderId,
        projectId: po.order.projectId || "",
        supplierInvoiceNumber: "INV-APEX-9901",
        invoiceDate: "2026-08-15",
        taxDate: "2026-08-15",
        dueDate: "2026-08-30",
        reference: po.order.orderNumber,
        currencyCode: po.order.currencyCode,
        exchangeRateToBase: String(po.order.exchangeRateToBase),
        exchangeRateDate: po.order.exchangeRateDate || "",
        exchangeRateSource: po.order.exchangeRateSource as any,
        amountsIncludeTax: po.order.amountsIncludeTax,
        lines: po.lines.map((l) => ({
          itemId: l.itemId || "",
          description: l.description,
          quantity: quantityMicrosToInput(l.quantityMicros),
          discountType: (l.discountType as any) || "none",
          discountValue: l.discountValue || "0",
          unitPrice: (l.unitPriceMinor / 100).toFixed(2),
          expenseAccountId: l.expenseAccountId || "",
          taxCodeId: l.taxCodeId || "",
          projectId: l.projectId || "",
        })),
      },
      "post",
    );
    assert.ok(purchaseInvoiceId);

    // Auto mark purchase order closed
    sqlite.prepare("UPDATE purchase_orders SET status = 'closed' WHERE id = ?").run(purchaseOrderId);

    const postedPi = getPurchaseInvoice(businessId, adminId, purchaseInvoiceId);
    assert.ok(postedPi);
    assert.equal(postedPi.invoice.documentStatus, "posted");
    assert.equal(postedPi.invoice.totalMinor, 49_875_00);

    // Check Purchase Invoice General Ledger Journal Lines
    const piJournals = sqlite.prepare(`
      SELECT jl.* FROM journal_lines jl
      INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.source_id = ?
    `).all(purchaseInvoiceId) as any[];
    assert.ok(piJournals.length >= 3);
    const apLeg = piJournals.find((j) => j.account_id === apAccountId);
    const assetLeg = piJournals.find((j) => j.account_id === assetAccount);
    const vatInputLeg = piJournals.find((j) => j.account_id !== apAccountId && j.account_id !== assetAccount);

    assert.ok(apLeg, "AP journal leg created");
    assert.equal(apLeg.credit_minor, 49_875_00);
    assert.ok(assetLeg, "Inventory Asset journal leg created");
    assert.equal(assetLeg.debit_minor, 47_500_00);
    assert.ok(vatInputLeg, "Input VAT journal leg created");
    assert.equal(vatInputLeg.debit_minor, 2_375_00);

    // 3.6 Record Supplier Payment of 49,875 AED
    const bankAcc = (sqlite.prepare("SELECT id FROM accounts WHERE type = 'asset' AND name LIKE '%Bank%' LIMIT 1").get() as any).id;
    const paymentResult = createSupplierPayment(businessId, adminId, {
      supplierId,
      purchaseInvoiceId,
      date: "2026-08-25",
      bankAccountId: bankAcc,
      amount: "49875.00",
      reference: "WIRE-APEX-001",
      description: "Full payment for server blades",
    });
    assert.ok(paymentResult);

    const piPaid = getPurchaseInvoice(businessId, adminId, purchaseInvoiceId);
    assert.equal(piPaid?.paidMinor, 49_875_00);
    assert.equal(piPaid?.balanceMinor, 0);
  });

  await suite.test("Phase 4: Inventory Moving-Average Valuation & Stock on Hand", () => {
    // We received 5 units in Goods Receipt
    const stockReport = getStockOnHandReport(businessId, adminId, { itemId });
    assert.ok(stockReport.length > 0);
    const itemStock = stockReport.find((i: any) => i.item_id === itemId);
    assert.ok(itemStock, "Inventory item appears in stock on hand");
    assert.equal(itemStock.quantity_micros, 50_000); // 5 units
    assert.equal(itemStock.value_minor, 47_500_00);
  });

  await suite.test("Phase 5: UAE VAT Detail & Tax Reporting Integrity", () => {
    const vatDetail = getVatTransactionDetail(businessId, adminId, {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
    assert.ok(vatDetail.length >= 2);
    // Find output VAT from our sales invoice
    const outputRow = vatDetail.find((r) => r.source_type === "sales_invoice" && r.party_name === "Global Tech Solutions LLC");
    assert.ok(outputRow);
    assert.equal(outputRow.vat_amount_minor, 1_350_00);

    // Find input VAT from our purchase invoice
    const inputRow = vatDetail.find((r) => r.source_type === "purchase_invoice" && r.party_name === "Apex Heavy Machinery Supplies");
    assert.ok(inputRow);
    assert.equal(inputRow.vat_amount_minor, 2_375_00);
  });

  await suite.test("Phase 6: General Ledger & Trial Balance Equilibrium", () => {
    const trialBalance = getTrialBalance(businessId, adminId, "2026-08-31");
    assert.ok(trialBalance);
    assert.equal(
      trialBalance.debitMinor,
      trialBalance.creditMinor,
      "Double-entry bookkeeping invariant: Total Debits == Total Credits",
    );
  });
});



