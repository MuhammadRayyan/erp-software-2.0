import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";

const testDataDir = mkdtempSync(path.join(tmpdir(), "compliance-and-ergonomics-audit-"));

Object.assign(process.env, {
  ERP_DATA_DIR: testDataDir,
  BETTER_AUTH_SECRET: "audit-test-secret-64-characters-long-minimum-for-compliance-audit",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");
const { createCustomer, updateCustomer } = await import("../src/modules/customers/customer-service");
const { createSupplier, listSuppliers } = await import("../src/modules/suppliers/supplier-service");
const { saveSalesQuote, getSalesQuote } = await import("../src/modules/sales-quotes/quote-service");
const { saveSalesOrder, getSalesOrder, deleteSalesOrder } = await import("../src/modules/sales-orders/sales-order-service");
const { savePurchaseQuote, getPurchaseQuote } = await import("../src/modules/purchase-quotes/purchase-quote-service");
const { savePurchaseOrder, getPurchaseOrder, deletePurchaseOrder } = await import("../src/modules/purchase-orders/purchase-order-service");
const { createInvoice, getInvoice, deleteInvoice, voidInvoice, updateInvoice, duplicateInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { savePurchaseInvoice, getPurchaseInvoice, deletePurchaseInvoice, voidPurchaseInvoice, duplicatePurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { saveCreditNote, getCreditNote, duplicateCreditNote } = await import("../src/modules/sales-credit-notes/credit-note-service");
const { saveDebitNote, getDebitNote, duplicateDebitNote } = await import("../src/modules/debit-notes/debit-note-service");
const { updateAccount, createAccount, deleteAccount } = await import("../src/modules/accounting/services/account-service");
const { buildDocumentTemplateData } = await import("../src/modules/document-templates/document-data-extractor");
const { saveFormDefaults, getFormDefaults } = await import("../src/modules/form-defaults/form-defaults-service");
const { formatZodFieldErrors } = await import("../src/lib/zod-errors");
const { z } = await import("zod");
const { salesQuotes, purchaseQuotes, purchaseOrders } = await import("../src/core/db/business-schema");

test("Compliance, Legal Entity Snapshotting & Document Lifecycle Reversals", async (suite) => {
  const seeded = await seedDemoData();
  const businessId = seeded.business.id;
  const adminId = seeded.admin.id;
  const context = getBusinessDb(businessId, adminId);

  const incomeAccount = (
    context.sqlite.prepare("SELECT default_sales_account_id FROM business_accounting_settings LIMIT 1").get() as any
  ).default_sales_account_id;
  const expenseAccount = (
    context.sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as any
  ).id;
  const vatCode = (
    context.sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get() as any
  ).id;

  await suite.test("1. Reversible Lifecycle: Sales Order deletion reverts Quote from accepted back to sent", () => {
    const customerId = createCustomer(businessId, adminId, {
      name: "Cycle Client LLC",
      email: "cycle@client.ae",
      defaultCurrencyCode: "AED",
      isActive: true,
    });

    // Create & issue quote
    const quoteId = saveSalesQuote(businessId, adminId, {
      customerId,
      date: "2026-11-01",
      expectedDate: "2026-11-15",
      amountsIncludeTax: false,
      lines: [{ description: "Consulting", quantity: "1", unitPrice: "1000.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "issue");

    const quoteBefore = getSalesQuote(businessId, adminId, quoteId);
    assert.equal(quoteBefore?.quote.documentStatus, "sent");

    // Create draft sales order linked to quote
    const orderId = saveSalesOrder(businessId, adminId, {
      customerId,
      salesQuoteId: quoteId,
      date: "2026-11-02",
      amountsIncludeTax: false,
      lines: [{ description: "Consulting", quantity: "1", unitPrice: "1000.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "draft");

    // Mark quote accepted (as conversion does)
    context.db.update(salesQuotes).set({ documentStatus: "accepted" }).where(eq(salesQuotes.id, quoteId)).run();
    const quoteAccepted = getSalesQuote(businessId, adminId, quoteId);
    assert.equal(quoteAccepted?.quote.documentStatus, "accepted");

    // Delete the draft sales order
    deleteSalesOrder(businessId, adminId, orderId);

    // Quote should be restored to "sent"
    const quoteRestored = getSalesQuote(businessId, adminId, quoteId);
    assert.equal(quoteRestored?.quote.documentStatus, "sent", "Quote should revert to sent after order deletion");
  });

  await suite.test("2. Reversible Lifecycle: Sales Invoice deletion reverts Order from completed back to active", () => {
    const customerId = createCustomer(businessId, adminId, {
      name: "Invoice Client LLC",
      email: "inv@client.ae",
      defaultCurrencyCode: "AED",
      isActive: true,
    });

    const orderId = saveSalesOrder(businessId, adminId, {
      customerId,
      date: "2026-11-01",
      amountsIncludeTax: false,
      lines: [{ description: "Design", quantity: "2", unitPrice: "500.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "issue");

    const orderBefore = getSalesOrder(businessId, adminId, orderId);
    assert.equal(orderBefore?.order.documentStatus, "active");

    // Create draft sales invoice linked to order
    const invoiceId = createInvoice(businessId, adminId, {
      customerId,
      salesOrderId: orderId,
      invoiceDate: "2026-11-02",
      dueDate: "2026-11-16",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      amountsIncludeTax: false,
      lines: [{ description: "Design", quantity: "2", unitPrice: "500.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "draft");

    // Order should have transitioned to "completed"
    const orderCompleted = getSalesOrder(businessId, adminId, orderId);
    assert.equal(orderCompleted?.order.documentStatus, "completed");

    // Delete the draft sales invoice
    deleteInvoice(businessId, adminId, invoiceId);

    // Order should be restored to "active"
    const orderRestored = getSalesOrder(businessId, adminId, orderId);
    assert.equal(orderRestored?.order.documentStatus, "active", "Sales order should revert to active after draft invoice deletion");
  });

  await suite.test("3. Reversible Lifecycle: Purchase Order deletion reverts Purchase Quote from accepted back to sent", () => {
    const supplierId = createSupplier(businessId, adminId, {
      name: "Vendor Reversal FZE",
      email: "vendor@rev.ae",
      defaultCurrencyCode: "AED",
    });

    const pqId = savePurchaseQuote(businessId, adminId, {
      supplierId,
      date: "2026-11-01",
      expiryDate: "2026-11-20",
      amountsIncludeTax: false,
      lines: [{ description: "Materials", quantity: "5", unitPrice: "200.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "issue");

    const pqBefore = getPurchaseQuote(businessId, adminId, pqId);
    assert.equal(pqBefore?.quote.documentStatus, "sent");

    const poId = savePurchaseOrder(businessId, adminId, {
      supplierId,
      purchaseQuoteId: pqId,
      date: "2026-11-02",
      amountsIncludeTax: false,
      lines: [{ description: "Materials", quantity: "5", unitPrice: "200.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "draft");

    // Mark quote accepted (as conversion does)
    context.db.update(purchaseQuotes).set({ documentStatus: "accepted" }).where(eq(purchaseQuotes.id, pqId)).run();

    // Delete the draft PO
    deletePurchaseOrder(businessId, adminId, poId);

    // Quote should revert to "sent"
    const pqRestored = getPurchaseQuote(businessId, adminId, pqId);
    assert.equal(pqRestored?.quote.documentStatus, "sent", "Purchase quote should revert to sent after order deletion");
  });

  await suite.test("4. Reversible Lifecycle: Purchase Invoice deletion reverts Purchase Order from closed back to issued", () => {
    const supplierId = createSupplier(businessId, adminId, {
      name: "PO Bill Supplier LLC",
      email: "pobill@vendor.ae",
      defaultCurrencyCode: "AED",
    });

    const poId = savePurchaseOrder(businessId, adminId, {
      supplierId,
      date: "2026-11-01",
      amountsIncludeTax: false,
      lines: [{ description: "Steel Rods", quantity: "10", unitPrice: "50.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "issue");

    // Save draft purchase invoice linked to PO
    const billId = savePurchaseInvoice(businessId, adminId, {
      supplierId,
      purchaseOrderId: poId,
      supplierInvoiceNumber: "BILL-REV-01",
      invoiceDate: "2026-11-02",
      dueDate: "2026-12-02",
      amountsIncludeTax: false,
      lines: [{ description: "Steel Rods", quantity: "10", unitPrice: "50.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "draft");

    // Simulate the order being closed (e.g. converted or completed)
    context.db.update(purchaseOrders).set({ status: "closed" }).where(eq(purchaseOrders.id, poId)).run();
    const poClosed = getPurchaseOrder(businessId, adminId, poId);
    assert.equal(poClosed?.order.status, "closed", "Purchase order should be closed");

    // Delete draft purchase invoice
    deletePurchaseInvoice(businessId, adminId, billId);

    // PO should be restored to "issued"
    const poRestored = getPurchaseOrder(businessId, adminId, poId);
    assert.equal(poRestored?.order.status, "issued", "Purchase order should revert to issued after draft bill deletion");
  });

  await suite.test("5. Purchase Invoice rejects billing an explicitly closed or cancelled Purchase Order", () => {
    const supplierId = createSupplier(businessId, adminId, {
      name: "Closed PO Supplier LLC",
      email: "closedpo@vendor.ae",
      defaultCurrencyCode: "AED",
    });

    const poId = savePurchaseOrder(businessId, adminId, {
      supplierId,
      date: "2026-11-01",
      amountsIncludeTax: false,
      lines: [{ description: "Items", quantity: "1", unitPrice: "100.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "issue");

    // Explicitly close the order
    context.db.update(purchaseOrders).set({ status: "closed" }).where(eq(purchaseOrders.id, poId)).run();

    assert.throws(
      () => {
        savePurchaseInvoice(businessId, adminId, {
          supplierId,
          purchaseOrderId: poId,
          supplierInvoiceNumber: "BILL-CLOSED-TEST",
          invoiceDate: "2026-11-02",
          dueDate: "2026-12-02",
          amountsIncludeTax: false,
          lines: [{ description: "Items", quantity: "1", unitPrice: "100.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
        }, "draft");
      },
      /Cannot create an invoice for a closed or cancelled purchase order/
    );
  });

  await suite.test("6. Legal Entity Snapshotting (UAE VAT Article 59): Invoices preserve historical legal details", () => {
    // 1. Set specific profile and tax settings
    context.sqlite.prepare(`
      UPDATE business_profile
      SET legal_name = 'Original Entity LLC',
          address_line_1 = 'Building 12, Business Bay',
          city = 'Dubai'
    `).run();

    context.sqlite.prepare(`
      UPDATE business_tax_settings
      SET trn = '100123456789003'
    `).run();

    const customerId = createCustomer(businessId, adminId, {
      name: "Original Customer FZE",
      email: "original@cust.ae",
      defaultCurrencyCode: "AED",
      trn: "100987654321003",
      billingAddress: "Suite 404, Silicon Oasis, Dubai",
      addressLine1: "Suite 404, Silicon Oasis",
      city: "Dubai",
      isActive: true,
    });

    // Create and post invoice
    const invoiceId = createInvoice(businessId, adminId, {
      customerId,
      invoiceDate: "2026-11-01",
      dueDate: "2026-11-30",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      amountsIncludeTax: false,
      lines: [{ description: "Consulting Services", quantity: "1", unitPrice: "2000.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "post");

    // Verify snapshot fields in database
    const dbInvoice = context.sqlite.prepare(`
      SELECT seller_legal_name, seller_trn, seller_address,
             customer_legal_name, customer_trn, customer_address
      FROM sales_invoices WHERE id = ?
    `).get(invoiceId) as any;

    assert.equal(dbInvoice.seller_legal_name, "Original Entity LLC");
    assert.equal(dbInvoice.seller_trn, "100123456789003");
    assert.ok(dbInvoice.seller_address.includes("Business Bay"));
    assert.equal(dbInvoice.customer_legal_name, "Original Customer FZE");
    assert.equal(dbInvoice.customer_trn, "100987654321003");
    assert.ok(dbInvoice.customer_address.includes("Silicon Oasis"));

    // 2. NOW MUTATE the business profile, tax settings, and customer details!
    context.sqlite.prepare(`
      UPDATE business_profile
      SET legal_name = 'Completely Changed Company PJSC',
          address_line_1 = 'Different Address, Abu Dhabi',
          city = 'Abu Dhabi'
    `).run();

    context.sqlite.prepare(`
      UPDATE business_tax_settings
      SET trn = '100888888888003'
    `).run();

    updateCustomer(businessId, adminId, customerId, {
      name: "Mutated Customer Name",
      email: "mutated@cust.ae",
      trn: "100777777777003",
      billingAddress: "Al Ain Road, Al Ain",
      addressLine1: "Al Ain Road",
      city: "Al Ain",
      isActive: true,
    });

    // 3. Extract document data for PDF rendering
    const docData = buildDocumentTemplateData(businessId, adminId, "Acme", "AED", "sales-invoice", invoiceId);
    assert.ok(docData);

    // UAE VAT Article 59: The historical document MUST return the original frozen details!
    assert.equal(docData.data.companyName, "Original Entity LLC", "Document must return frozen seller legal name");
    assert.equal(docData.data.sellerTrn, "100123456789003", "Document must return frozen seller TRN");
    assert.ok(docData.data.companyAddress?.includes("Business Bay"), "Document must return frozen seller address");

    assert.equal(docData.data.customerName, "Original Customer FZE", "Document must return frozen customer legal name");
    assert.equal(docData.data.customerTrn, "100987654321003", "Document must return frozen customer TRN");
    assert.ok(docData.data.customerAddress?.includes("Silicon Oasis"), "Document must return frozen customer address");
  });

  await suite.test("7. Chart of Accounts Protection: Cannot alter account type/subtype when journal lines exist", () => {
    const customAccountId = createAccount(businessId, adminId, {
      name: "Custom Consulting Income",
      type: "income",
      subtype: "sales",
    });

    const testCustomer = createCustomer(businessId, adminId, {
      name: "COA Test Customer LLC",
      email: "coatest@customer.ae",
      defaultCurrencyCode: "AED",
      isActive: true,
    });

    // Create and post invoice using this custom account so journal entries exist
    createInvoice(businessId, adminId, {
      customerId: testCustomer,
      invoiceDate: "2026-11-03",
      dueDate: "2026-11-20",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      amountsIncludeTax: false,
      lines: [{ description: "Custom Service", quantity: "1", unitPrice: "500.00", salesAccountId: customAccountId, taxCodeId: vatCode }],
    }, "post");

    // Attempting to change type from income to expense must fail
    assert.throws(
      () => {
        updateAccount(businessId, adminId, customAccountId, {
          name: "Custom Consulting Income",
          type: "expense",
          subtype: "operating_expense",
        });
      },
      /Cannot change account type or subtype because journal entries exist for this account/
    );

    // Modifying only the name should succeed cleanly
    updateAccount(businessId, adminId, customAccountId, {
      name: "Custom Consulting Income (Renamed)",
      type: "income",
      subtype: "sales",
    });
    const renamed = context.sqlite.prepare("SELECT name FROM accounts WHERE id = ?").get(customAccountId) as any;
    assert.equal(renamed.name, "Custom Consulting Income (Renamed)");
  });

  await suite.test("8. Dynamic Payment Terms & Resettable Dates on Duplication", () => {
    const customerId = createCustomer(businessId, adminId, {
      name: "Terms Client LLC",
      email: "terms@client.ae",
      defaultCurrencyCode: "AED",
      paymentTermsDays: 45,
      isActive: true,
    });

    // Create invoice with 10% discount and tax-inclusive
    const invoiceId = createInvoice(businessId, adminId, {
      customerId,
      invoiceDate: "2026-01-01",
      taxDate: "2026-01-01",
      dueDate: "2026-01-15",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      amountsIncludeTax: true,
      notes: "Important custom notes",
      terms: "Payment terms text",
      lines: [{
        description: "Package",
        quantity: "2",
        unitPrice: "500.00",
        discountType: "percentage",
        discountValue: "10",
        salesAccountId: incomeAccount,
        taxCodeId: vatCode,
      }],
    }, "post");

    // Duplicate the invoice
    const copyId = duplicateInvoice(businessId, adminId, invoiceId);
    const copy = getInvoice(businessId, adminId, copyId);
    assert.ok(copy);

    const today = new Date().toISOString().split("T")[0];
    assert.equal(copy.invoice.invoiceDate, today, "Duplicated invoice date should be reset to today");
    
    // Due date should be today + 45 days (from customer payment terms)
    const expectedDue = new Date(Date.now() + 45 * 86400000).toISOString().split("T")[0];
    assert.equal(copy.invoice.dueDate, expectedDue, "Duplicated due date should use customer terms");

    // Discounts, notes, terms, and amountsIncludeTax preserved!
    assert.equal(copy.invoice.notes, "Important custom notes");
    assert.equal(copy.invoice.terms, "Payment terms text");
    assert.equal(Boolean(copy.invoice.amountsIncludeTax), true);
    assert.equal(copy.lines[0].discountType, "percentage");
    assert.equal(copy.lines[0].discountValue, "10");
  });

  await suite.test("9. Form Defaults persistence and retrieval across documents", () => {
    saveFormDefaults(businessId, adminId, "sales-invoice", {
      defaultNotes: "Default invoice payment notes",
      defaultTerms: "Strict 30 days credit policy",
      defaultTaxCodeId: vatCode,
    });

    const defaults = getFormDefaults(businessId, adminId, "sales-invoice");
    assert.ok(defaults);
    assert.equal(defaults.defaultNotes, "Default invoice payment notes");
    assert.equal(defaults.defaultTerms, "Strict 30 days credit policy");
    assert.equal(defaults.defaultTaxCodeId, vatCode);
  });

  await suite.test("10. 0-Day Payment Terms: Due date equals document date (immediate / COD)", () => {
    const codCustomer = createCustomer(businessId, adminId, {
      name: "Cash On Delivery LLC",
      email: "cod@client.ae",
      defaultCurrencyCode: "AED",
      paymentTermsDays: 0,
      isActive: true,
    });

    const today = new Date().toISOString().split("T")[0];
    const invoiceId = createInvoice(businessId, adminId, {
      customerId: codCustomer,
      invoiceDate: today,
      dueDate: today,
      currencyCode: "AED",
      exchangeRateToBase: "1",
      amountsIncludeTax: false,
      lines: [{ description: "COD Services", quantity: "1", unitPrice: "500.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "draft");

    const copyInvoiceId = duplicateInvoice(businessId, adminId, invoiceId);
    const copyInvoice = getInvoice(businessId, adminId, copyInvoiceId);
    assert.ok(copyInvoice);
    assert.equal(copyInvoice.invoice.invoiceDate, today);
    assert.equal(copyInvoice.invoice.dueDate, today, "0-day customer payment terms must calculate due date as document date (not 30 days default)");

    const codSupplier = createSupplier(businessId, adminId, {
      name: "COD Supplier LLC",
      email: "cod@supplier.ae",
      defaultCurrencyCode: "AED",
      paymentTermsDays: 0,
    });

    const billId = savePurchaseInvoice(businessId, adminId, {
      supplierId: codSupplier,
      supplierInvoiceNumber: "COD-BILL-001",
      invoiceDate: today,
      dueDate: today,
      amountsIncludeTax: false,
      lines: [{ description: "Immediate Parts", quantity: "1", unitPrice: "250.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "draft");

    const copyBillId = duplicatePurchaseInvoice(businessId, adminId, billId);
    const copyBill = getPurchaseInvoice(businessId, adminId, copyBillId);
    assert.ok(copyBill);
    assert.equal(copyBill.invoice.invoiceDate, today);
    assert.equal(copyBill.invoice.dueDate, today, "0-day supplier payment terms must calculate due date as document date (not 30 days default)");
  });

  await suite.test("11. Credit & Debit Note Duplication Date Reset & Invariants", () => {
    const custId = createCustomer(businessId, adminId, {
      name: "Note Duplication Customer",
      email: "notedup@client.ae",
      defaultCurrencyCode: "AED",
      isActive: true,
    });

    const origInvId = createInvoice(businessId, adminId, {
      customerId: custId,
      invoiceDate: "2026-01-01",
      dueDate: "2026-01-30",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      amountsIncludeTax: true,
      lines: [{ description: "Historical Widget", quantity: "2", unitPrice: "100.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "post");

    const origCnId = saveCreditNote(businessId, adminId, {
      customerId: custId,
      sourceInvoiceId: origInvId,
      date: "2026-01-05",
      taxDate: "2026-01-05",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: "2026-01-05",
      exchangeRateSource: "Base",
      amountsIncludeTax: true,
      lines: [{
        description: "Damaged Widget",
        quantity: "1",
        unitPrice: "100.00",
        discountType: "percentage",
        discountValue: "15",
        salesAccountId: incomeAccount,
        taxCodeId: vatCode,
      }],
    }, "draft");

    const copyCnId = duplicateCreditNote(businessId, adminId, origCnId);
    const copyCn = getCreditNote(businessId, adminId, copyCnId);
    assert.ok(copyCn);
    const today = new Date().toISOString().split("T")[0];
    assert.equal(copyCn.note.date, today, "Duplicated credit note date must be reset to today");
    assert.equal(copyCn.note.taxDate, today, "Duplicated credit note tax date must be reset to today");
    assert.equal(Boolean(copyCn.note.amountsIncludeTax), true, "Tax-inclusive flag must be preserved");
    assert.equal(copyCn.lines[0].discountType, "percentage");
    assert.equal(copyCn.lines[0].discountValue, "15");

    const suppId = createSupplier(businessId, adminId, {
      name: "DN Supplier LLC",
      email: "dn@supplier.ae",
      defaultCurrencyCode: "AED",
    });

    const origBillId = savePurchaseInvoice(businessId, adminId, {
      supplierId: suppId,
      supplierInvoiceNumber: "SUPP-HIST-01",
      invoiceDate: "2026-01-01",
      dueDate: "2026-01-30",
      amountsIncludeTax: false,
      lines: [{ description: "Materials", quantity: "1", unitPrice: "500.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "post");

    const origDnId = saveDebitNote(businessId, adminId, {
      supplierId: suppId,
      purchaseInvoiceId: origBillId,
      date: "2026-01-10",
      taxDate: "2026-01-10",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      exchangeRateDate: "2026-01-10",
      exchangeRateSource: "Base",
      amountsIncludeTax: false,
      lines: [{
        description: "Returned Materials",
        quantity: "1",
        unitPrice: "500.00",
        discountType: "none",
        discountValue: "0",
        expenseAccountId: expenseAccount,
        taxCodeId: vatCode,
      }],
    }, "draft");

    const copyDnId = duplicateDebitNote(businessId, adminId, origDnId);
    const copyDn = getDebitNote(businessId, adminId, copyDnId);
    assert.ok(copyDn);
    assert.equal(copyDn.note.debitNoteDate, today, "Duplicated debit note date must be reset to today");
    assert.equal(copyDn.note.taxDate, today, "Duplicated debit note tax date must be reset to today");
  });

  await suite.test("12. Synchronized Form Conversions & Duplicate Prevention", () => {
    const custId = createCustomer(businessId, adminId, {
      name: "Sync Client LLC",
      email: "sync@client.ae",
      defaultCurrencyCode: "AED",
      isActive: true,
    });

    const sqId = saveSalesQuote(businessId, adminId, {
      customerId: custId,
      date: "2026-11-01",
      expectedDate: "2026-11-15",
      amountsIncludeTax: false,
      lines: [{ description: "Sync Quote Line", quantity: "1", unitPrice: "300.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "issue");

    const sqBefore = getSalesQuote(businessId, adminId, sqId);
    assert.equal(sqBefore?.quote.documentStatus, "sent");

    // Saving Sales Order via form pathway with salesQuoteId must synchronize quote status to accepted
    saveSalesOrder(businessId, adminId, {
      customerId: custId,
      salesQuoteId: sqId,
      date: "2026-11-02",
      amountsIncludeTax: false,
      lines: [{ description: "Sync Quote Line", quantity: "1", unitPrice: "300.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "draft");

    const sqAccepted = getSalesQuote(businessId, adminId, sqId);
    assert.equal(sqAccepted?.quote.documentStatus, "accepted", "Quote should automatically transition to accepted when order is created");

    // Creating another order for the accepted quote must throw
    assert.throws(
      () => {
        saveSalesOrder(businessId, adminId, {
          customerId: custId,
          salesQuoteId: sqId,
          date: "2026-11-03",
          amountsIncludeTax: false,
          lines: [{ description: "Duplicate Order", quantity: "1", unitPrice: "300.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
        }, "draft");
      },
      /Cannot create a sales order for an accepted or cancelled sales quote/
    );

    // Purchase Quote -> Purchase Order
    const suppId = createSupplier(businessId, adminId, {
      name: "PQ Sync Supplier",
      email: "pqsync@supp.ae",
      defaultCurrencyCode: "AED",
    });

    const pqId = savePurchaseQuote(businessId, adminId, {
      supplierId: suppId,
      date: "2026-11-01",
      expiryDate: "2026-11-20",
      amountsIncludeTax: false,
      lines: [{ description: "PQ Line", quantity: "2", unitPrice: "150.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "issue");

    savePurchaseOrder(businessId, adminId, {
      supplierId: suppId,
      purchaseQuoteId: pqId,
      date: "2026-11-02",
      amountsIncludeTax: false,
      lines: [{ description: "PQ Line", quantity: "2", unitPrice: "150.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "draft");

    const pqAccepted = getPurchaseQuote(businessId, adminId, pqId);
    assert.equal(pqAccepted?.quote.documentStatus, "accepted", "Purchase quote should automatically transition to accepted when PO is created");

    assert.throws(
      () => {
        savePurchaseOrder(businessId, adminId, {
          supplierId: suppId,
          purchaseQuoteId: pqId,
          date: "2026-11-03",
          amountsIncludeTax: false,
          lines: [{ description: "Duplicate PO", quantity: "2", unitPrice: "150.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
        }, "draft");
      },
      /Cannot create a purchase order for an accepted or cancelled purchase quote/
    );
  });

  await suite.test("13. Zod Error Path Formatting: Flattens nested array paths for line-item cell highlighting", () => {
    const lineSchema = z.object({
      customerId: z.string().min(1, "Customer required"),
      lines: z.array(
        z.object({
          description: z.string().min(1, "Description required"),
          taxCodeId: z.string().min(1, "Tax code required"),
        })
      ).min(1),
    });

    const parseResult = lineSchema.safeParse({
      customerId: "",
      lines: [
        { description: "Valid", taxCodeId: "" },
        { description: "", taxCodeId: "tax-123" },
      ],
    });

    assert.equal(parseResult.success, false);
    if (!parseResult.success) {
      const formatted = formatZodFieldErrors(parseResult.error);
      assert.deepEqual(formatted["customerId"], ["Customer required"]);
      assert.deepEqual(formatted["lines.0.taxCodeId"], ["Tax code required"]);
      assert.deepEqual(formatted["lines.1.description"], ["Description required"]);
    }
  });

  await suite.test("14. Lifecycle Reversibility on Void: Voiding an invoice reverts the linked order", () => {
    const custId = createCustomer(businessId, adminId, {
      name: "Void Reversal Client LLC",
      email: "voidrev@client.ae",
      defaultCurrencyCode: "AED",
      isActive: true,
    });

    // 1. Sales Order -> Posted Invoice -> Void Invoice
    const soId = saveSalesOrder(businessId, adminId, {
      customerId: custId,
      date: "2026-11-01",
      amountsIncludeTax: false,
      lines: [{ description: "Service", quantity: "1", unitPrice: "500.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "issue");

    const soBefore = getSalesOrder(businessId, adminId, soId);
    assert.equal(soBefore?.order.documentStatus, "active");

    const invId = createInvoice(businessId, adminId, {
      customerId: custId,
      salesOrderId: soId,
      invoiceDate: "2026-11-02",
      dueDate: "2026-11-20",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      amountsIncludeTax: false,
      lines: [{ description: "Service", quantity: "1", unitPrice: "500.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "post");

    const soCompleted = getSalesOrder(businessId, adminId, soId);
    assert.equal(soCompleted?.order.documentStatus, "completed");

    // Void the posted invoice
    voidInvoice(businessId, adminId, invId);

    // Sales order must revert to "active"
    const soRestored = getSalesOrder(businessId, adminId, soId);
    assert.equal(soRestored?.order.documentStatus, "active", "Sales order must revert to active after posted invoice is voided");

    // 2. Purchase Order -> Posted Bill -> Void Bill
    const suppId = createSupplier(businessId, adminId, {
      name: "Void Bill Supplier FZE",
      email: "voidbill@supp.ae",
      defaultCurrencyCode: "AED",
    });

    const poId = savePurchaseOrder(businessId, adminId, {
      supplierId: suppId,
      date: "2026-11-01",
      amountsIncludeTax: false,
      lines: [{ description: "Parts", quantity: "2", unitPrice: "100.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "issue");

    const poBefore = getPurchaseOrder(businessId, adminId, poId);
    assert.equal(poBefore?.order.status, "issued");

    const billId = savePurchaseInvoice(businessId, adminId, {
      supplierId: suppId,
      purchaseOrderId: poId,
      supplierInvoiceNumber: "BILL-VOID-01",
      invoiceDate: "2026-11-02",
      dueDate: "2026-11-20",
      amountsIncludeTax: false,
      lines: [{ description: "Parts", quantity: "2", unitPrice: "100.00", expenseAccountId: expenseAccount, taxCodeId: vatCode }],
    }, "post");

    // Simulate the order being closed (e.g. converted or completed)
    context.db.update(purchaseOrders).set({ status: "closed" }).where(eq(purchaseOrders.id, poId)).run();
    const poClosed = getPurchaseOrder(businessId, adminId, poId);
    assert.equal(poClosed?.order.status, "closed");

    // Void the posted bill
    voidPurchaseInvoice(businessId, adminId, billId);

    // Purchase order must revert to "issued"
    const poRestored = getPurchaseOrder(businessId, adminId, poId);
    assert.equal(poRestored?.order.status, "issued", "Purchase order must revert to issued after posted bill is voided");
  });

  await suite.test("15. Legal Entity Snapshot Immutability on Posted Document Edits", () => {
    const custId = createCustomer(businessId, adminId, {
      name: "Immutable Customer LLC",
      email: "immutable@client.ae",
      trn: "100111222333003",
      billingAddress: "Al Saada Tower, Dubai",
      isActive: true,
    });

    // Create and post invoice
    const invId = createInvoice(businessId, adminId, {
      customerId: custId,
      invoiceDate: "2026-11-01",
      dueDate: "2026-11-30",
      currencyCode: "AED",
      exchangeRateToBase: "1",
      amountsIncludeTax: false,
      lines: [{ description: "Design Work", quantity: "1", unitPrice: "1500.00", salesAccountId: incomeAccount, taxCodeId: vatCode }],
    }, "post");

    // Mutate customer in master
    updateCustomer(businessId, adminId, custId, {
      name: "Radically Changed Customer Name",
      email: "changed@client.ae",
      trn: "100999999999003",
      billingAddress: "Changed Address, Sharjah",
      isActive: true,
    });

    const record = getInvoice(businessId, adminId, invId)!;
    // Edit posted invoice (e.g. updating notes)
    updateInvoice(businessId, adminId, invId, {
      customerId: record.invoice.customerId,
      currencyCode: record.invoice.currencyCode,
      exchangeRateToBase: record.invoice.exchangeRateToBase,
      exchangeRateDate: record.invoice.exchangeRateDate,
      exchangeRateSource: record.invoice.exchangeRateSource as any,
      invoiceDate: record.invoice.invoiceDate,
      taxDate: record.invoice.taxDate,
      dueDate: record.invoice.dueDate,
      notes: "Updated internal delivery memo",
      amountsIncludeTax: Boolean(record.invoice.amountsIncludeTax),
      lines: record.lines.map((l) => ({
        description: l.description,
        quantity: "1",
        unitPrice: "1500.00",
        salesAccountId: l.salesAccountId,
        taxCodeId: l.taxCodeId,
      })),
    }, "post");

    // Snapshot in DB must STILL have original customer details!
    const row = context.sqlite.prepare(`
      SELECT customer_legal_name, customer_trn, customer_address
      FROM sales_invoices WHERE id = ?
    `).get(invId) as any;

    assert.equal(row.customer_legal_name, "Immutable Customer LLC", "Posted invoice customer legal name must remain immutable on edit");
    assert.equal(row.customer_trn, "100111222333003", "Posted invoice customer TRN must remain immutable on edit");
    assert.ok(row.customer_address.includes("Al Saada Tower"), "Posted invoice customer address must remain immutable on edit");
  });

  await suite.test("16. Chart of Accounts Protection for Bank Accounts, Settings & Debit Notes, plus Supplier Terms", () => {
    // 1. Bank ledger account cannot change type/subtype
    const bankCustomAccId = createAccount(businessId, adminId, {
      name: "Corporate Current Account Ledger",
      type: "asset",
      subtype: "bank",
    });

    context.sqlite.prepare(`
      INSERT INTO bank_accounts (id, name, currency_code, ledger_account_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run("bank-test-123", "Corporate Bank", "AED", bankCustomAccId);

    assert.throws(
      () => {
        updateAccount(businessId, adminId, bankCustomAccId, {
          name: "Corporate Current Account Ledger",
          type: "income",
          subtype: "sales",
        });
      },
      /Cannot change account type or subtype for a bank ledger account/
    );

    // 2. Account referenced in debit note line cannot be deleted
    const suppForDn = createSupplier(businessId, adminId, {
      name: "DN Protect Supplier LLC",
      email: "dnprotect@supplier.ae",
      defaultCurrencyCode: "AED",
      paymentTermsDays: 14,
    });

    const dnExpAccId = createAccount(businessId, adminId, {
      name: "Special Maintenance Expense",
      type: "expense",
      subtype: "operating_expense",
    });

    const billForDn = savePurchaseInvoice(businessId, adminId, {
      supplierId: suppForDn,
      supplierInvoiceNumber: "BILL-DN-PROT",
      invoiceDate: "2026-11-01",
      dueDate: "2026-11-15",
      amountsIncludeTax: false,
      lines: [{ description: "Maintenance", quantity: "1", unitPrice: "300.00", expenseAccountId: dnExpAccId, taxCodeId: vatCode }],
    }, "post");

    saveDebitNote(businessId, adminId, {
      supplierId: suppForDn,
      purchaseInvoiceId: billForDn,
      date: "2026-11-02",
      amountsIncludeTax: false,
      lines: [{ description: "Maintenance Refund", quantity: "1", unitPrice: "300.00", expenseAccountId: dnExpAccId, taxCodeId: vatCode }],
    }, "draft");

    assert.throws(
      () => {
        deleteAccount(businessId, adminId, dnExpAccId);
      },
      /Cannot delete this account because it has transactions or is configured for accounting/
    );

    // 3. Supplier paymentTermsDays populated on listSuppliers
    const suppliersList = listSuppliers(businessId, adminId);
    const foundSupplier = suppliersList.find((s) => s.id === suppForDn);
    assert.ok(foundSupplier);
    assert.equal(foundSupplier.paymentTermsDays, 14, "listSuppliers must expose paymentTermsDays");
  });
});
