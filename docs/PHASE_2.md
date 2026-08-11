# Phase 2 — Complete Receivables + Purchases / Accounts Payable

## Purpose

Complete the core sales/purchase accounting cycle.

Phase 1 already established:
- Chart of Accounts
- tax codes
- double-entry journals
- Sales Invoices
- Receipts
- Accounts Receivable
- General Ledger
- Trial Balance
- Customer Statements

Phase 2 adds:
- Sales Credit Notes
- Suppliers
- Purchase Orders
- Purchase Invoices / Bills
- Supplier Payments
- Accounts Payable
- Supplier Statements
- Input VAT foundation
- document relationships

Do not add Inventory, Projects, bank feeds, UAE e-invoicing, approval workflows,
advanced permissions, or production infrastructure in this phase.

Implement the full phase first.
Run the final verification only after the phase is complete.

---

# 1. Phase 2 Outcome

At the end of Phase 2 the system should support:

```text
Sales
Customer
 -> Sales Invoice
 -> Receipt
 -> Sales Credit Note

Purchases
Supplier
 -> Purchase Order
 -> Purchase Invoice
 -> Payment
```

Accounting should correctly handle:

```text
Accounts Receivable
Accounts Payable
Sales
Purchases / Expenses
Output VAT
Input VAT
Bank / Cash
```

Core reports should include:

```text
Accounts Receivable
Accounts Payable
Customer Statement
Supplier Statement
General Ledger
Trial Balance
```

---

# 2. Keep Existing Architecture

Continue using the existing stack and project conventions.

Do not:
- add a second backend;
- add Redis;
- add PostgreSQL;
- add queues;
- add Playwright;
- add microservices;
- replace the migration runner;
- revisit webpack/Turbopack during feature work;
- upgrade pdfme during this phase unless required to fix an actual blocker.

Respect the migration decisions documented in the README and pre-Phase 2 fix gate.

---

# 3. Purchase Domain Tables

Add business-level tables as needed:

```text
suppliers

purchase_orders
purchase_order_lines

purchase_invoices
purchase_invoice_lines

supplier_payments
supplier_payment_allocations

sales_credit_notes
sales_credit_note_lines
```

Optional helper/document-link tables are acceptable if they simplify clean relationships.

Keep Drizzle schemas authoritative and upgrade each business DB through the existing
versioned per-business migration runner.

---

# 4. Suppliers

Routes:

```text
/b/[businessId]/suppliers
/b/[businessId]/suppliers/new
/b/[businessId]/suppliers/[supplierId]
/b/[businessId]/suppliers/[supplierId]/edit
```

Minimum fields:

```text
name
email
phone
TRN / tax reference
address
notes
is_active
```

Supplier list:

```text
Suppliers                                      [+ New Supplier]

[Search suppliers...]                    [Filter] [Columns]

Name                 Email              Outstanding        Status
ABC Supplies LLC     accounts@...       AED 18,500         Active
```

Supplier View:

```text
Supplier Name

Outstanding Payable
Total Purchased
Total Paid

Contact Details

Recent Purchase Orders
Recent Purchase Invoices
Recent Payments
```

Actions:

```text
[Edit]
[New Purchase Order]
[New Purchase Invoice]
[Record Payment]
[More]
```

Do not build procurement CRM features.

---

# 5. Accounts Payable System Account

Business accounting settings must include:

```text
accountsPayableAccountId
inputVatAccountId
defaultPurchaseExpenseAccountId
```

Use real account references.

Posting must fail clearly if a required system account is missing.

Recommended seeded accounts:

```text
2000 Accounts Payable
2110 VAT Recoverable / Input VAT
6100 General Purchases / Expenses
```

Use names consistent with the existing Chart of Accounts.

---

# 6. Input VAT Foundation

Extend tax codes so they can support both sales and purchases.

Recommended tax fields:

```text
id
name
rate
sales_tax_account_id
purchase_tax_account_id
is_active
```

Seed:

```text
No VAT      0%
UAE VAT     5%
```

For Purchase Invoices, UAE VAT 5% should post to the configured Input VAT account.

Do not implement UAE VAT return filing in Phase 2.

---

# 7. Purchase Orders

Purchase Orders are operational documents only.

They do not create journal entries.

Routes:

```text
/b/[businessId]/purchases/orders
/b/[businessId]/purchases/orders/new
/b/[businessId]/purchases/orders/[orderId]
/b/[businessId]/purchases/orders/[orderId]/edit
```

Lifecycle:

```text
Draft
Issued
Closed
Cancelled
```

Minimum fields:

```text
supplier
order_number
date
expected_date optional
reference
notes
status
lines
```

Line fields:

```text
description
quantity
unit_price
expense_or_purchase_account_id optional
tax_code_id
net_amount
tax_amount
gross_amount
```

For now:
- no inventory receipt;
- no goods receipt;
- no stock movement.

Purchase Order View actions:

```text
[Edit]
[Create Purchase Invoice]
[Print/PDF]
[More]
```

`Create Purchase Invoice` should prefill supplier, reference, and lines from the order.

Do not force every Purchase Invoice to originate from a Purchase Order.

---

# 8. Purchase Invoice / Bill Lifecycle

Use:

```text
Draft
Posted
Void
```

Payment state is derived:

```text
Unpaid
Partially Paid
Paid
Overdue
```

Do not mix document status and payment status.

Routes:

```text
/b/[businessId]/purchases/invoices
/b/[businessId]/purchases/invoices/new
/b/[businessId]/purchases/invoices/[invoiceId]
/b/[businessId]/purchases/invoices/[invoiceId]/edit
```

Minimum header fields:

```text
supplier
supplier_invoice_number
internal_number
invoice_date
due_date
reference
purchase_order_id optional
document_status
```

Line fields:

```text
description
quantity
unit_price
expense_account_id
tax_code_id
net_amount
tax_amount
gross_amount
```

Totals are always recalculated server-side.

---

# 9. Purchase Invoice Posting

Example:

```text
Expense net: AED 1,000
Input VAT:  AED 50
Total:      AED 1,050
```

Posting:

```text
Debit  Expense / Purchase Account    1,000
Debit  Input VAT                        50
Credit Accounts Payable             1,050
```

If multiple lines use different expense accounts or tax codes,
journal lines should reflect them correctly.

Every generated journal must balance.

---

# 10. Purchase Invoice UI

List:

```text
Purchase Invoices                          [+ New Purchase Invoice]

[Search...]                         [Filter] [Columns]

Bill           Supplier       Date       Due       Total      Balance      Status
PI-00012       ABC Supplies   08 Aug     22 Aug    10,500     10,500       Unpaid
```

New/Edit is a full page.

Recommended form:

```text
New Purchase Invoice

Supplier
Supplier Invoice #
Invoice Date
Due Date
Reference
Purchase Order (optional)

Items
----------------------------------------------------------------
Description     Qty     Rate     Expense Account     VAT     Amount
----------------------------------------------------------------

+ Add line

                                               Subtotal
                                               VAT
                                               Total

[Cancel]                         [Save Draft] [Post Invoice]
```

After save/post:
redirect to dedicated View page.

---

# 11. Purchase Invoice View

Header:

```text
PI-00012       Posted       Unpaid

ABC Supplies LLC
Supplier Invoice: SUP-4451
Invoice Date: 08 Aug 2026
Due: 22 Aug 2026

AED 10,500.00
Balance AED 10,500.00
```

Actions:

```text
[Edit]
[Record Payment]
[Print/PDF]
[More ▾]
```

More:

```text
Duplicate
View Journal Entry
Void
Delete (draft only)
```

Do not expose destructive actions prominently.

---

# 12. Supplier Payments

Common entry path:

```text
Purchase Invoice View
 -> Record Payment
```

Also allow direct route:

```text
/b/[businessId]/purchases/payments/new
```

Fields:

```text
Supplier
Date
Bank / Cash Account
Amount
Reference
Description
Invoice allocations
```

Posting:

```text
Debit  Accounts Payable
Credit Bank / Cash
```

Allocation table:

```text
supplier_payment_allocations
  payment_id
  purchase_invoice_id
  amount_minor
```

When opened from a Purchase Invoice:
- supplier preselected;
- invoice preselected;
- amount defaults to outstanding balance.

---

# 13. Purchase Invoice Balance

Derived:

```text
invoice total
- posted allocated supplier payments
= balance
```

Payment status:

```text
balance == total        -> Unpaid
0 < balance < total     -> Partially Paid
balance == 0            -> Paid
past due + balance > 0  -> Overdue
```

Do not manually save arbitrary payment-state values.

---

# 14. Sales Credit Notes

Add real Sales Credit Notes.

Routes:

```text
/b/[businessId]/sales/credit-notes
/b/[businessId]/sales/credit-notes/new
/b/[businessId]/sales/credit-notes/[creditNoteId]
/b/[businessId]/sales/credit-notes/[creditNoteId]/edit
```

Preferred entry path:

```text
Sales Invoice View
 -> More
 -> Create Credit Note
```

Prefill:
- customer
- source invoice
- eligible invoice lines
- tax codes
- accounts

Allow full or partial credit.

Lifecycle:

```text
Draft
Posted
Void
```

---

# 15. Credit Note Posting

Example original credit:

```text
Net credit: AED 500
VAT credit: AED 25
Total:      AED 525
```

Posting:

```text
Debit  Sales / Revenue Reversal        500
Debit  VAT Payable                      25
Credit Accounts Receivable             525
```

The exact revenue reversal account can normally be the original Sales account used by
the credited invoice line.

Do not create a separate "Sales Returns" account unless needed later.

---

# 16. Credit Note Allocation to Invoice

When created from an invoice, apply the credit against that invoice balance.

Recommended storage:

```text
sales_credit_note_allocations
  credit_note_id
  sales_invoice_id
  amount_minor
```

Invoice balance becomes:

```text
invoice total
- receipts
- applied credit notes
= balance
```

Credit Notes should therefore affect:
- invoice balance;
- Customer Statement;
- Accounts Receivable report.

Do not allow an applied credit to push invoice balance below zero.

Unallocated customer credits can come later.

---

# 17. Customer Statement Upgrade

Include:

```text
Sales Invoice
Receipt
Sales Credit Note
```

Columns:

```text
Date
Type
Reference
Description
Debit
Credit
Running Balance
```

Invoice -> Debit

Receipt -> Credit

Credit Note -> Credit

---

# 18. Supplier Statement

Add:

```text
/b/[businessId]/reports/supplier-statement
```

Columns:

```text
Date
Type
Reference
Description
Debit
Credit
Running Balance
```

For supplier/AP presentation:

```text
Purchase Invoice -> increases payable
Supplier Payment -> reduces payable
```

Choose debit/credit presentation consistent with the accounting ledger and label clearly.

When opened from Supplier View, supplier should be preselected.

---

# 19. Accounts Payable Report

Add:

```text
/b/[businessId]/reports/accounts-payable
```

Minimum:

```text
Supplier
Unpaid
Overdue
Total Outstanding
```

If easy, add aging:

```text
Current
1-30
31-60
61-90
90+
```

Do not delay Phase 2 if aging buckets complicate implementation.

---

# 20. Accounts Receivable Upgrade

Update AR calculations so Sales Credit Notes reduce receivables correctly.

AR report should be based on source documents/allocations or ledger data consistently,
not duplicated stored balances.

Do not maintain multiple competing balance sources.

---

# 21. Document Numbering

Extend the existing numbering mechanism.

Add sequences for:

```text
Sales Credit Note
Purchase Order
Purchase Invoice
Supplier Payment optional
```

Example defaults:

```text
CN-00001
PO-00001
PI-00001
PAY-00001
```

Keep configuration simple.

Do not add branch numbering yet.

---

# 22. Document Relationships

Show related document links where useful.

Examples:

Sales Invoice View:

```text
Related
Credit Notes
Receipts
Journal Entry
```

Purchase Order View:

```text
Related
Purchase Invoices
```

Purchase Invoice View:

```text
Related
Purchase Order
Payments
Journal Entry
```

Use compact sections or tabs.

Do not build a generic graph engine.

---

# 23. Navigation

Keep sidebar uncluttered.

Recommended:

```text
SALES
Customers
Quotes
Invoices

PURCHASES
Suppliers
Purchase Orders
Purchase Invoices

BANKING
Bank Accounts

PROJECTS
Projects

ACCOUNTING
Chart of Accounts
Journal

REPORTS
Reports

Settings
```

Do not add Credit Notes, Receipts, or Supplier Payments as permanent sidebar items unless
the existing product UX clearly benefits from it.

Access them from:
- document actions;
- related sections;
- Reports/All Transactions later.

This preserves Manager-style simplicity.

---

# 24. Reports Page

Keep it grouped:

```text
Receivables
  Accounts Receivable
  Customer Statement

Payables
  Accounts Payable
  Supplier Statement

Accounting
  General Ledger
  Trial Balance
```

No giant report catalog.

---

# 25. Search / Filters

Sales Invoice filters should include:
- customer
- date range
- document status
- payment status

Purchase Invoice filters:
- supplier
- date range
- document status
- payment status

Purchase Order filters:
- supplier
- status
- date range

Keep active filters as compact removable chips.

Do not show a large filter form above every table.

---

# 26. Status Badges

Use existing theme semantics.

Document:

```text
Draft
Posted
Void
Issued
Closed
Cancelled
```

Payment:

```text
Unpaid
Partial
Paid
Overdue
```

Do not create a new color for every possible status.

---

# 27. Editing Posted Purchase Invoices

Follow the existing posted Sales Invoice strategy.

Within one DB transaction:
- validate change;
- update source document;
- rebuild generated journal for that source;
- preserve allocations;
- reject financially invalid changes.

Rule:

```text
Do not allow total to fall below amount already paid.
```

Non-financial metadata edits remain allowed.

Keep all logic in services, not UI.

---

# 28. Voiding

For posted Purchase Invoices and Sales Credit Notes:
- do not hard-delete;
- reverse or remove accounting impact using the existing safe source-posting approach;
- mark document Void;
- retain the record.

Drafts may be deleted.

Do not build closed-period controls yet.

---

# 29. Purchase Orders Do Not Post

Explicit rule:

```text
Purchase Order != accounting transaction
```

No GL effect.

No AP effect.

No Input VAT effect.

Only a posted Purchase Invoice creates those accounting effects.

---

# 30. PDF / Print

Reuse the existing document template/PDF boundary.

Phase 2 only needs practical print/PDF output for:
- Purchase Order
- Purchase Invoice
- Sales Credit Note

If the current template system is invoice-specific, generalize only enough to support these
document types.

Do not redesign the PDF editor.

---

# 31. Demo Data

Update demo seed with a small realistic data set:

```text
3 suppliers
2 purchase orders
3 posted purchase invoices
1 draft purchase invoice
1 partially paid purchase invoice
1 fully paid purchase invoice
1 sales credit note
```

Keep it small.

---

# 32. Migration

Use the existing explicit versioned business migration runner.

Migration should:
- add supplier tables;
- add purchase tables;
- add payment allocation tables;
- add credit-note tables;
- extend tax-code fields if required;
- add system-account settings;
- add numbering settings.

Preserve all Phase 1 data.

Run migrations transactionally.

Do not use `drizzle-kit push` against real business DBs.

---

# 33. Error Messages

Add business-readable errors for:

```text
Accounts Payable account is not configured.
Input VAT account is not configured.
Purchase invoice line has no expense account.
Purchase invoice total cannot be lower than amount already paid.
Credit note cannot exceed the remaining invoice balance.
Supplier payment exceeds the selected payable amount.
Journal entry is not balanced.
Purchase order has already been cancelled.
```

Do not surface raw SQLite errors.

---

# 34. Keep Files Small

Do not create giant purchase modules.

Prefer:

```text
purchase-invoice-service.ts
purchase-invoice-posting.ts
purchase-invoice-form.tsx
purchase-invoice-table.tsx
supplier-service.ts
supplier-statement.ts
```

Avoid:
- 1,500-line service files;
- one generic "documents engine" for everything;
- speculative shared abstractions.

Reuse proven Phase 1 patterns where they genuinely match.

---

# 35. Do Not Build in Phase 2

Explicitly defer:

```text
Inventory
Goods Receipts
Stock Movement
Projects
Project Profitability
Bank Statement Import
Bank Reconciliation
Bank Feeds
Multi-Currency Revaluation
Purchase Credit Notes / Supplier Debit Notes if they materially expand scope
UAE VAT Return
UAE E-Invoicing
Branches
Payroll
Approvals
Advanced Permissions
Recurring Invoices
Email Infrastructure
Production Deployment
Cloud Object Storage
PostgreSQL
Playwright
```

A simple Purchase Credit Note can be Phase 3 if needed with inventory/project expansion.

---

# 36. Final Verification

Run once after all Phase 2 implementation is complete.

## A. Hot Reload / Baseline

1. `docker compose up --watch`
2. edit one visible TSX file
3. confirm hot refresh
4. run:

```bash
pnpm typecheck
pnpm lint
pnpm db:check
```

## B. Supplier

1. create supplier
2. edit supplier
3. confirm Supplier View loads
4. confirm supplier is business-local

## C. Purchase Order

Create PO:

```text
Supplier: ABC Supplies
Net: AED 1,000
VAT: AED 50
Total: AED 1,050
```

Confirm:
- PO saves;
- no journal entry exists;
- Trial Balance is unchanged.

## D. Convert PO to Purchase Invoice

From PO View:
1. Create Purchase Invoice
2. confirm supplier and lines are prefilled
3. Post Invoice

Expected journal:

```text
Expense / Purchases    Debit   1,000
Input VAT              Debit      50
Accounts Payable       Credit  1,050
```

Confirm balanced.

## E. Accounts Payable

Confirm posted purchase invoice:
- appears in AP report;
- balance = AED 1,050;
- payment status = Unpaid.

## F. Partial Supplier Payment

Record AED 400.

Expected:

```text
Accounts Payable       Debit   400
Bank                   Credit  400
```

Confirm:
- balance = AED 650;
- status = Partially Paid.

## G. Final Supplier Payment

Record remaining AED 650.

Confirm:
- balance = 0;
- status = Paid;
- Supplier Statement ends at correct balance.

## H. Draft Purchase Invoice

Create a draft Purchase Invoice.

Confirm:
- no GL impact;
- no AP impact;
- can be deleted.

## I. Posted Purchase Invoice Edit

Create a fresh unpaid posted purchase invoice.

Edit amount.

Confirm:
- old generated journal is replaced/rebuilt;
- no duplicate journal remains;
- Trial Balance remains balanced.

## J. Sales Credit Note

Use existing Sales Invoice:

```text
Original remaining balance: AED 1,050
Create credit note: AED 525
```

Expected posting:

```text
Sales                  Debit   500
VAT Payable            Debit    25
Accounts Receivable    Credit  525
```

Confirm:
- invoice remaining balance decreases by 525;
- Customer Statement contains the credit;
- AR report decreases;
- Trial Balance remains balanced.

## K. Invalid Credit

Attempt credit note greater than remaining invoice balance.

Confirm rejection with business-readable error.

## L. Reports

Confirm:
- General Ledger shows purchase and credit-note postings;
- Trial Balance balances;
- AR reflects Sales Credit Notes;
- AP reflects Purchase Invoices and Payments;
- Customer Statement is correct;
- Supplier Statement is correct.

## M. Numbering

Confirm unique sequences for:
- Sales Credit Notes
- Purchase Orders
- Purchase Invoices

## N. PDF

Generate/preview:
- one Purchase Order
- one Purchase Invoice
- one Sales Credit Note

Basic readable output is sufficient.

## O. Business Isolation

Create supplier/purchase invoice in Business A.

Switch to Business B.

Confirm records and AP balances are absent.

---

# Phase 2 Definition of Done

Phase 2 is complete when:

- Sales Credit Notes reduce AR correctly;
- Purchase Orders work without GL effect;
- posted Purchase Invoices create correct AP journals;
- Input VAT posts correctly;
- Supplier Payments reduce AP correctly;
- Supplier Statements work;
- AP report works;
- Trial Balance remains balanced;
- document relationships are visible;
- numbering works;
- business isolation remains intact;
- Docker hot reload remains fast;
- final verification passes.

Stop after Phase 2.

Do not automatically start Phase 3.

Recommended next phase after completion:
**Projects + basic operational linking**, or **Inventory foundation**, depending on which business workflow is more important next.
