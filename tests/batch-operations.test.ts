import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-batch-ops-")),
  BETTER_AUTH_SECRET: "batch-ops-secret-test-key",
  NODE_ENV: "test",
});

const { seedDemoData } = await import("../src/core/db/seed");
const { getBusinessDb } = await import("../src/core/db/business");

const { createCustomer } = await import("../src/modules/customers/customer-service");
const { createSupplier } = await import("../src/modules/suppliers/supplier-service");
const {
  createInvoice,
  getInvoice,
  batchPostInvoices,
  batchVoidInvoices,
  batchDeleteInvoices,
} = await import("../src/modules/sales-invoices/invoice-service");
const { createReceipt } = await import("../src/modules/receipts/receipt-service");

const {
  savePurchaseInvoice,
  getPurchaseInvoice,
  batchPostPurchaseInvoices,
  batchVoidPurchaseInvoices,
  batchDeletePurchaseInvoices,
} = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { createSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
const { generateDocumentPdf } = await import("../src/modules/document-templates/pdf-service");

test("Batch Operations & Bulk Document Actions Suite", async (t) => {
  const seed = await seedDemoData();
  const businessId = seed.business.id;
  const userId = seed.admin.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const incomeAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' LIMIT 1").get() as { id: string };
  const standardVat = sqlite.prepare("SELECT id FROM tax_codes WHERE vat_category = 'standard' LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM accounts WHERE subtype IN ('bank', 'cash') LIMIT 1").get() as { id: string };

  assert.ok(incomeAccount, "income account found");
  assert.ok(expenseAccount, "expense account found");
  assert.ok(standardVat, "standard vat code found");
  assert.ok(bankAccount, "bank account found");

  const customerId = createCustomer(businessId, userId, {
    name: "Batch Operations Customer LLC",
    email: "billing@batchcustomer.com",
    defaultCurrencyCode: "AED",
  });

  const supplierId = createSupplier(businessId, userId, {
    name: "Batch Operations Supplier Ltd",
    defaultCurrencyCode: "AED",
  });

  await t.test("1. Sales Invoices: Batch Post Drafts to General Ledger", async () => {
    // Create 3 draft sales invoices
    const inv1Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-01",
        dueDate: "2026-10-15",
        currencyCode: "AED",
        lines: [
          {
            description: "Consulting Service A",
            quantity: "2",
            unitPrice: "500", // 500.00 AED
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "draft",
    );

    const inv2Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-02",
        dueDate: "2026-10-16",
        currencyCode: "AED",
        lines: [
          {
            description: "Consulting Service B",
            quantity: "1",
            unitPrice: "750",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "draft",
    );

    const inv3Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-03",
        dueDate: "2026-10-17",
        currencyCode: "AED",
        lines: [
          {
            description: "Consulting Service C",
            quantity: "3",
            unitPrice: "200",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "draft",
    );

    assert.equal(getInvoice(businessId, userId, inv1Id)?.invoice.documentStatus, "draft");
    assert.equal(getInvoice(businessId, userId, inv2Id)?.invoice.documentStatus, "draft");
    assert.equal(getInvoice(businessId, userId, inv3Id)?.invoice.documentStatus, "draft");

    // Before posting, no GL lines should exist for these invoices
    const glCountBefore = sqlite
      .prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id IN (?, ?, ?)")
      .get(inv1Id, inv2Id, inv3Id) as { c: number };
    assert.equal(glCountBefore.c, 0, "Draft invoices must not have journal entries");

    // Perform batch post
    const result = batchPostInvoices(businessId, userId, [inv1Id, inv2Id, inv3Id]);
    assert.equal(result.successCount, 3, "All 3 draft invoices should post successfully");
    assert.equal(result.failedCount, 0, "No failures expected");

    // Verify all 3 invoices are posted now
    const posted1 = getInvoice(businessId, userId, inv1Id);
    const posted2 = getInvoice(businessId, userId, inv2Id);
    const posted3 = getInvoice(businessId, userId, inv3Id);
    assert.equal(posted1?.invoice.documentStatus, "posted");
    assert.equal(posted2?.invoice.documentStatus, "posted");
    assert.equal(posted3?.invoice.documentStatus, "posted");

    // Verify GL entries exist and balance for all 3
    for (const invId of [inv1Id, inv2Id, inv3Id]) {
      const entries = sqlite
        .prepare("SELECT id FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?")
        .all(invId) as { id: string }[];
      assert.ok(entries.length >= 1, `GL entry should exist for invoice ${invId}`);

      const lines = sqlite
        .prepare("SELECT debit_minor, credit_minor FROM journal_lines WHERE journal_entry_id = ?")
        .all(entries[0].id) as { debit_minor: number; credit_minor: number }[];
      const sumDr = lines.reduce((acc, l) => acc + l.debit_minor, 0);
      const sumCr = lines.reduce((acc, l) => acc + l.credit_minor, 0);
      assert.equal(sumDr, sumCr, "GL transaction must balance (Debits === Credits)");
      assert.ok(sumDr > 0, "GL transaction amounts must be positive");
    }

    // Idempotency: re-posting already posted invoices should be a safe success without duplicates
    const repostResult = batchPostInvoices(businessId, userId, [inv1Id]);
    assert.equal(repostResult.successCount, 1);
    const glCountAfter = sqlite
      .prepare("SELECT COUNT(*) AS c FROM journal_entries WHERE source_type = 'sales_invoice' AND source_id = ?")
      .get(inv1Id) as { c: number };
    assert.equal(glCountAfter.c, 1, "Must not create duplicate journal entries when already posted");
  });

  await t.test("2. Sales Invoices: Batch Void with Allocation Safety Guards", async () => {
    // Create and post 2 invoices
    const invAId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-05",
        dueDate: "2026-10-19",
        currencyCode: "AED",
        lines: [
          {
            description: "Service A",
            quantity: "1",
            unitPrice: "100",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "post",
    );

    const invBId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-06",
        dueDate: "2026-10-20",
        currencyCode: "AED",
        lines: [
          {
            description: "Service B",
            quantity: "1",
            unitPrice: "200",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "post",
    );

    // Allocate payment receipt to invB (200 + 5% = 210 AED)
    createReceipt(businessId, userId, {
      customerId,
      invoiceId: invBId,
      bankAccountId: bankAccount.id,
      date: "2026-10-07",
      currencyCode: "AED",
      amount: "210.00",
    });

    // Now attempt batch void on [invAId, invBId]
    const voidResult = batchVoidInvoices(businessId, userId, [invAId, invBId]);
    assert.equal(voidResult.successCount, 1, "invA without allocations should succeed");
    assert.equal(voidResult.failedCount, 1, "invB with allocations should fail");
    assert.ok(voidResult.errors[0], "Error must be recorded for invB");
    assert.match(voidResult.errors[0].error, /receipt allocations/i);

    // Verify invA is void and has GL reversal journal entry
    const voidedA = getInvoice(businessId, userId, invAId);
    assert.equal(voidedA?.invoice.documentStatus, "void");

    const reversalEntry = sqlite
      .prepare("SELECT id FROM journal_entries WHERE source_type = 'sales_invoice_void' AND source_id = ?")
      .get(invAId) as { id: string } | undefined;
    assert.ok(reversalEntry, "GL reversal entry should exist for voided sales invoice");

    // invB remains posted
    const stillPostedB = getInvoice(businessId, userId, invBId);
    assert.equal(stillPostedB?.invoice.documentStatus, "posted");
  });

  await t.test("3. Sales Invoices: Batch Delete Drafts and Refuse Posted Invoices", async () => {
    const draft1Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-08",
        dueDate: "2026-10-22",
        currencyCode: "AED",
        lines: [
          {
            description: "Draft Item 1",
            quantity: "1",
            unitPrice: "50",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "draft",
    );

    const draft2Id = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-09",
        dueDate: "2026-10-23",
        currencyCode: "AED",
        lines: [
          {
            description: "Draft Item 2",
            quantity: "1",
            unitPrice: "60",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "draft",
    );

    const postedInvId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-10",
        dueDate: "2026-10-24",
        currencyCode: "AED",
        lines: [
          {
            description: "Posted Item",
            quantity: "1",
            unitPrice: "70",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "post",
    );

    // Attempt batch delete with mixed draft and posted
    const deleteResult = batchDeleteInvoices(businessId, userId, [draft1Id, draft2Id, postedInvId]);
    assert.equal(deleteResult.successCount, 2, "Both draft invoices should be deleted");
    assert.equal(deleteResult.failedCount, 1, "Posted invoice must be rejected from deletion");
    assert.ok(deleteResult.errors[0], "Error must be recorded for posted invoice");
    assert.match(deleteResult.errors[0].error, /draft/i);

    // Verify drafts are deleted from DB
    assert.equal(getInvoice(businessId, userId, draft1Id), null);
    assert.equal(getInvoice(businessId, userId, draft2Id), null);
    assert.ok(getInvoice(businessId, userId, postedInvId) !== null, "Posted invoice must still exist");
  });

  await t.test("4. Purchase Invoices: Batch Post, Void, and Delete", async () => {
    // Create 2 draft purchase invoices (bills)
    const bill1Id = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "SUP-001",
        invoiceDate: "2026-10-01",
        dueDate: "2026-10-15",
        currencyCode: "AED",
        lines: [
          {
            description: "Office Supplies",
            quantity: "5",
            unitPrice: "120",
            expenseAccountId: expenseAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "draft",
    );

    const bill2Id = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "SUP-002",
        invoiceDate: "2026-10-02",
        dueDate: "2026-10-16",
        currencyCode: "AED",
        lines: [
          {
            description: "Software License",
            quantity: "1",
            unitPrice: "450",
            expenseAccountId: expenseAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "draft",
    );

    assert.equal(getPurchaseInvoice(businessId, userId, bill1Id)?.invoice.documentStatus, "draft");
    assert.equal(getPurchaseInvoice(businessId, userId, bill2Id)?.invoice.documentStatus, "draft");

    // Batch post bills
    const postRes = batchPostPurchaseInvoices(businessId, userId, [bill1Id, bill2Id]);
    assert.equal(postRes.successCount, 2, "Both draft purchase invoices should post");
    assert.equal(postRes.failedCount, 0);

    const postedBill1 = getPurchaseInvoice(businessId, userId, bill1Id);
    const postedBill2 = getPurchaseInvoice(businessId, userId, bill2Id);
    assert.equal(postedBill1?.invoice.documentStatus, "posted");
    assert.equal(postedBill2?.invoice.documentStatus, "posted");

    // Verify GL entries exist for both purchase invoices
    for (const bId of [bill1Id, bill2Id]) {
      const entry = sqlite
        .prepare("SELECT id FROM journal_entries WHERE source_type = 'purchase_invoice' AND source_id = ?")
        .get(bId) as { id: string } | undefined;
      assert.ok(entry, `GL entry should exist for purchase bill ${bId}`);

      const lines = sqlite
        .prepare("SELECT debit_minor, credit_minor FROM journal_lines WHERE journal_entry_id = ?")
        .all(entry.id) as { debit_minor: number; credit_minor: number }[];
      const sumDr = lines.reduce((acc, l) => acc + l.debit_minor, 0);
      const sumCr = lines.reduce((acc, l) => acc + l.credit_minor, 0);
      assert.equal(sumDr, sumCr, "Purchase invoice GL entry must balance");
    }

    // Allocate payment to bill2 (450 + 5% = 472.50 AED)
    createSupplierPayment(businessId, userId, {
      supplierId,
      purchaseInvoiceId: bill2Id,
      bankAccountId: bankAccount.id,
      date: "2026-10-05",
      amount: "472.50",
      currencyCode: "AED",
    });

    // Batch void: bill1 should succeed, bill2 with allocations should fail
    const voidRes = batchVoidPurchaseInvoices(businessId, userId, [bill1Id, bill2Id]);
    assert.equal(voidRes.successCount, 1, "Bill 1 without payments should void");
    assert.equal(voidRes.failedCount, 1, "Bill 2 with payment allocation must fail");
    assert.ok(voidRes.errors[0], "Error must be recorded for bill2");
    assert.match(voidRes.errors[0].error, /payment allocations/i);

    assert.equal(getPurchaseInvoice(businessId, userId, bill1Id)?.invoice.documentStatus, "void");
    assert.equal(getPurchaseInvoice(businessId, userId, bill2Id)?.invoice.documentStatus, "posted");

    // Test batch delete on a new draft bill
    const draftBillId = savePurchaseInvoice(
      businessId,
      userId,
      {
        supplierId,
        supplierInvoiceNumber: "SUP-DRAFT",
        invoiceDate: "2026-10-10",
        dueDate: "2026-10-24",
        currencyCode: "AED",
        lines: [
          {
            description: "Draft Item",
            quantity: "1",
            unitPrice: "100",
            expenseAccountId: expenseAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "draft",
    );

    const delRes = batchDeletePurchaseInvoices(businessId, userId, [draftBillId, bill2Id]);
    assert.equal(delRes.successCount, 1, "Draft bill should delete successfully");
    assert.equal(delRes.failedCount, 1, "Posted bill2 cannot be deleted");
    assert.equal(getPurchaseInvoice(businessId, userId, draftBillId), null);
  });

  await t.test("5. Batch PDF ZIP Packing Integration", async () => {
    // Generate 2 sales invoice PDFs using generateDocumentPdf and verify JSZip packages them properly
    const invAId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-11",
        dueDate: "2026-10-25",
        currencyCode: "AED",
        lines: [
          {
            description: "Archive Product 1",
            quantity: "2",
            unitPrice: "250",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "post",
    );

    const invBId = createInvoice(
      businessId,
      userId,
      {
        customerId,
        invoiceDate: "2026-10-12",
        dueDate: "2026-10-26",
        currencyCode: "AED",
        lines: [
          {
            description: "Archive Product 2",
            quantity: "1",
            unitPrice: "400",
            salesAccountId: incomeAccount.id,
            taxCodeId: standardVat.id,
          },
        ],
      },
      "post",
    );

    const pdfResA = await generateDocumentPdf(
      businessId,
      userId,
      "Batch Operations Customer LLC",
      "AED",
      "sales-invoice",
      invAId,
    );

    const pdfResB = await generateDocumentPdf(
      businessId,
      userId,
      "Batch Operations Customer LLC",
      "AED",
      "sales-invoice",
      invBId,
    );

    assert.ok(pdfResA.pdf.byteLength > 500, "PDF A should have content");
    assert.ok(pdfResB.pdf.byteLength > 500, "PDF B should have content");
    assert.ok(pdfResA.filename.endsWith(".pdf"));
    assert.ok(pdfResB.filename.endsWith(".pdf"));

    const zip = new JSZip();
    zip.file(pdfResA.filename, pdfResA.pdf);
    zip.file(pdfResB.filename, pdfResB.pdf);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    assert.ok(zipBuffer.byteLength > 1000, "ZIP buffer should contain both PDFs");

    // Read back zip to verify integrity
    const readZip = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(readZip.files);
    assert.equal(files.length, 2, "ZIP should contain exactly 2 files");
    assert.ok(files.includes(pdfResA.filename));
    assert.ok(files.includes(pdfResB.filename));
  });
});
