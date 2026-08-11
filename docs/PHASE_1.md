# Phase 1 — Accounting Core + Accounts Receivable

## Purpose

Turn the Phase 0 product shell into a real accounting foundation.

Phase 1 should make Sales Invoices, Receipts, Customers, and the General Ledger
financially meaningful using a correct double-entry posting engine.

Do not expand into Purchases, Inventory, Projects, Bank Feeds, UAE e-invoicing,
advanced permissions, or production infrastructure yet.

Implement the whole phase first.
Run the verification checklist only after the phase is complete.

---

# Phase 1 Outcome

At the end of this phase, the system should be able to:

1. maintain a Chart of Accounts;
2. define simple tax/VAT codes;
3. create and post Sales Invoices;
4. generate balanced journal entries automatically;
5. record customer Receipts;
6. reduce Accounts Receivable correctly;
7. calculate invoice balance/status;
8. show customer account activity;
9. show General Ledger and Trial Balance reports;
10. preserve the existing full-page List -> New -> View -> Edit flow;
11. keep accounting UI compact, clear, and consistent with `docs/THEME.md`.

The most important invariant is:

```text
TOTAL DEBITS = TOTAL CREDITS
```

Every posted accounting transaction must satisfy this.

---

# 1. Keep the Existing Architecture

Continue using:

```text
Next.js
TypeScript
Drizzle
SQLite
better-sqlite3
Zod
React Hook Form
TanStack Table
shadcn/ui
Docker Compose Watch
```

Do not add a second backend.

Do not add:
- Redis
- queues
- PostgreSQL
- GraphQL
- microservices
- Playwright
- production deployment tooling

Keep Docker hot reload working exactly as in Phase 0.

---

# 2. Accounting Domain Structure

Add a small domain/application layer.

Suggested structure:

```text
src/
  modules/
    accounting/
      db/
      services/
      calculations/
      components/
    customers/
    sales-invoices/
    receipts/
    reports/
```

Do not create large class hierarchies.

Prefer small functions/services such as:

```text
createSalesInvoice()
updateSalesInvoice()
postSalesInvoice()
voidSalesInvoice()

createReceipt()
postReceipt()

buildJournalForSalesInvoice()
buildJournalForReceipt()

getTrialBalance()
getGeneralLedger()
```

The UI must never directly construct journal entries.

Only accounting services create or modify ledger postings.

---

# 3. Accounting Database Tables

Create real business-level accounting tables.

Minimum recommended schema:

```text
accounts
tax_codes

journal_entries
journal_lines

customers

sales_invoices
sales_invoice_lines

receipts
receipt_allocations
```

Optional helper tables are fine when justified.

---

# 4. Chart of Accounts

Create:

```text
accounts
```

Minimum fields:

```text
id
code
name
type
subtype
is_system
is_active
created_at
updated_at
```

Account types:

```text
Asset
Liability
Equity
Income
Expense
```

Useful subtypes initially:

```text
Cash
Bank
Accounts Receivable
Accounts Payable
Current Asset
Fixed Asset
Current Liability
Tax Payable
Equity
Sales
Other Income
Cost of Sales
Operating Expense
Other Expense
```

Seed a simple UAE-oriented default chart for new businesses.

Example:

```text
1000 Cash
1010 Bank
1100 Accounts Receivable
1200 Other Current Assets
1500 Fixed Assets

2000 Accounts Payable
2100 VAT Payable
2110 VAT Recoverable / Input VAT control if needed later

3000 Owner's Equity / Retained Earnings

4000 Sales
4100 Other Income

5000 Cost of Sales

6000 Operating Expenses
```

Do not overbuild the default chart.

---

# 5. System Account Settings

Each business needs mappings for system-controlled accounts.

Add settings such as:

```text
accountsReceivableAccountId
defaultSalesAccountId
defaultBankAccountId
vatOutputAccountId
```

These should point to actual accounts.

Do not hardcode account IDs inside posting code.

If a required system account mapping is missing,
posting should fail with a clear business-readable error.

---

# 6. Money and Precision

Do not use JavaScript binary floats as the source of truth.

Recommended approach for Phase 1:

- use Decimal.js for calculations;
- store monetary values as integer minor units when currency precision is fixed;
- store tax rates and quantities with explicit decimal precision.

For AED:

```text
AED 123.45
=> 12345 minor units
```

Create central helpers:

```text
money.add()
money.subtract()
money.multiply()
money.round()
money.format()
```

If a simpler Decimal-only storage implementation is chosen for Phase 1,
document it clearly and keep arithmetic centralized.

Never scatter rounding rules across UI components.

---

# 7. Tax Codes

Implement simple tax codes.

Minimum fields:

```text
id
name
rate
sales_tax_account_id
is_active
```

Seed:

```text
No VAT      0%
UAE VAT     5%
```

For Phase 1 only implement output VAT on Sales Invoices.

Do not implement full UAE VAT returns yet.

Do not implement recoverable purchase VAT yet.

---

# 8. Journal Entries

Create:

```text
journal_entries
journal_lines
```

Journal Entry fields:

```text
id
entry_number
date
source_type
source_id
description
status
created_at
posted_at
```

Journal Line fields:

```text
id
journal_entry_id
account_id
description
debit_minor
credit_minor
customer_id optional
reference optional
```

Rules:

```text
debit_minor >= 0
credit_minor >= 0
one side per line
journal total debit == journal total credit
```

Use one DB transaction when:
- posting source document
- writing journal
- updating source posting state

If posting fails, nothing should partially save.

---

# 9. Posting Engine

Build a small central posting layer.

Example contract:

```text
postTransaction({
  sourceType,
  sourceId,
  date,
  description,
  lines
})
```

Before commit:

1. validate all accounts exist and are active;
2. validate all monetary amounts;
3. validate journal is balanced;
4. validate required references;
5. save journal entry and lines;
6. mark source as posted.

Never allow React pages to insert `journal_lines` directly.

---

# 10. Sales Invoice Lifecycle

Use:

```text
Draft
Posted
Void
```

Payment state is derived separately:

```text
Unpaid
Partially Paid
Paid
Overdue
```

Do not use one status field to represent everything.

Recommended fields:

```text
document_status
payment_status
```

### Draft

- no ledger entry
- fully editable
- can be deleted

### Posted

- ledger entry exists
- invoice participates in AR and reports
- editable only through accounting service
- re-post safely if edited

### Void

- retained for history
- accounting impact reversed/removed according to chosen implementation
- do not hard-delete posted invoices

For Phase 1, keep void logic simple but auditable.

---

# 11. Sales Invoice Posting

For a basic invoice:

```text
Net sales: AED 1,000
VAT 5%:    AED 50
Total:     AED 1,050
```

Posting:

```text
Debit  Accounts Receivable    1,050
Credit Sales                  1,000
Credit VAT Payable               50
```

Each invoice line should contain:

```text
description
quantity
unit_price
sales_account_id
tax_code_id
net_amount
tax_amount
gross_amount
```

Invoice header totals are derived from invoice lines.

Do not trust user-supplied total fields.

Recalculate server-side before save/post.

---

# 12. Invoice Numbering

Implement business-configurable simple numbering.

Phase 1 setting:

```text
prefix: INV-
next_number: 1
padding: 5
```

Output:

```text
INV-00001
INV-00002
```

Number allocation must happen safely on the server.

Do not calculate next number in the browser.

Add Settings page:

```text
Settings
 -> Numbering
```

Only Sales Invoice numbering is required now.

Later the same concept can support:
- Quotes
- Purchase Orders
- Receipts
- Credit Notes
- branches

---

# 13. Sales Invoice UI

Preserve the Phase 0 full-page pattern.

## List

Route:

```text
/b/[businessId]/sales/invoices
```

Suggested columns:

```text
Invoice
Customer
Invoice Date
Due Date
Total
Balance
Payment Status
Document Status
```

Toolbar:

```text
[Search invoices...]             [Filter] [Columns] [+ New Invoice]
```

Useful filters:

```text
Draft
Posted
Unpaid
Partial
Paid
Overdue
Customer
Date range
```

Do not show every filter permanently.
Use a filter popover/sheet and active filter chips.

---

# 14. New Invoice Page

Route:

```text
/b/[businessId]/sales/invoices/new
```

Page sections:

```text
New Sales Invoice

Customer
Invoice Date
Due Date
Reference

Items
-------------------------------------------------------------
Description        Qty      Rate      Account      VAT     Amount
-------------------------------------------------------------

+ Add line

                                             Subtotal
                                             VAT
                                             Total

[Cancel]                           [Save Draft] [Post Invoice]
```

Use:

```text
Post Invoice
```

instead of a vague `Save` now that accounting is real.

After `Post Invoice`:
- validate
- create invoice
- create journal posting
- redirect to invoice View page

After `Save Draft`:
- save without posting
- redirect to View page

---

# 15. Invoice View Page

Route:

```text
/b/[businessId]/sales/invoices/[invoiceId]
```

Header example:

```text
INV-00023       Posted       Unpaid

ABC Trading LLC
Invoice date: 08 Aug 2026
Due: 22 Aug 2026

AED 10,500.00
Balance AED 10,500.00
```

Primary actions:

```text
[Edit]
[Record Receipt]
[Email]
[Print / PDF]
[More ▾]
```

`Record Receipt` is only visible for a posted invoice with balance > 0.

`Email` may remain a placeholder if sending infrastructure is not built.

`Print / PDF` can continue using the Phase 0 document-template prototype.

More menu:

```text
Duplicate
View Journal Entry
Void
Delete (draft only)
```

Do not expose destructive actions as primary buttons.

---

# 16. Editing Posted Invoices

Keep the workflow practical.

If a posted invoice is edited:

1. load invoice;
2. user edits through full page;
3. server validates;
4. accounting service updates invoice;
5. old journal effect is replaced/rebuilt safely;
6. audit-friendly history can be added later.

For Phase 1, a simple safe strategy is acceptable:

```text
within one DB transaction:
delete/replace generated journal lines for that source
recalculate
re-post
```

Do not allow edits if the invoice has receipt allocations that would create invalid accounting
unless the edit remains logically safe.

A simple rule for Phase 1:

```text
If invoice has receipts:
- allow non-financial metadata edits;
- block edits that reduce total below amount paid;
- otherwise rebuild invoice journal safely.
```

Keep this logic centralized.

---

# 17. Receipts

Add:

```text
/b/[businessId]/sales/receipts/new
```

The common entry path should be from Invoice View:

```text
Record Receipt
```

Receipt fields:

```text
Customer
Date
Bank / Cash Account
Amount
Reference
Description
```

When launched from an invoice:
- customer preselected
- invoice preselected
- amount defaults to outstanding balance

Posting:

```text
Debit  Bank/Cash
Credit Accounts Receivable
```

Create allocation:

```text
receipt_allocations
  receipt_id
  sales_invoice_id
  amount_minor
```

Phase 1 only needs one or several invoice allocations if implementation stays simple.

---

# 18. Invoice Balance

Invoice balance must be derived:

```text
invoice total
- allocated posted receipts
= balance
```

Payment status:

```text
if balance == total:
  Unpaid

if 0 < balance < total:
  Partially Paid

if balance == 0:
  Paid

if due_date < today and balance > 0:
  Overdue
```

Do not manually save arbitrary payment statuses.

---

# 19. Customers

Upgrade the Phase 0 Customer page.

Customer View should show:

```text
Customer name

Outstanding Balance
Total Invoiced
Total Received

Contact Details

Recent Invoices
Recent Receipts
```

Actions:

```text
[Edit]
[New Invoice]
[Record Receipt]
[More]
```

Do not create a huge CRM.

---

# 20. Customer Statement

Add a simple customer statement page/report.

Suggested columns:

```text
Date
Type
Reference
Description
Debit
Credit
Running Balance
```

Sources:
- posted Sales Invoices
- posted Receipts

This is useful immediately and validates AR behavior.

---

# 21. Chart of Accounts UI

Route:

```text
/b/[businessId]/accounting/chart-of-accounts
```

Group accounts by type.

Example:

```text
Assets
  1000 Cash
  1010 Bank
  1100 Accounts Receivable

Liabilities
  2100 VAT Payable

Income
  4000 Sales

Expenses
  6000 General Expenses
```

Actions:

```text
+ New Account
```

Account creation/edit should be a normal page or compact dialog.
Because an Account is a small configuration object, a dialog is acceptable here.

System accounts should show a small badge:

```text
System
```

Prevent deleting accounts that are required or already used.

---

# 22. Journal Entry Viewer

Do not build manual journal entry creation yet unless it is trivial.

Required:

```text
/b/[businessId]/accounting/journal
```

List:

```text
Entry
Date
Source
Description
Debit
Credit
```

Click entry:

```text
JE-00018
Source: Sales Invoice INV-00023

Account                      Debit          Credit
Accounts Receivable          10,500
Sales                                         10,000
VAT Payable                                     500

Total                        10,500          10,500
```

The page is primarily diagnostic/accounting visibility.

---

# 23. General Ledger Report

Route:

```text
/b/[businessId]/reports/general-ledger
```

Filters:

```text
Date from
Date to
Account
Customer optional
```

Columns:

```text
Date
Entry
Source
Description
Debit
Credit
Balance
```

Keep filter toolbar compact.

No visual report builder.

---

# 24. Trial Balance

Route:

```text
/b/[businessId]/reports/trial-balance
```

Filter:
- date or period through date

Columns:

```text
Account
Debit
Credit
```

Footer:

```text
TOTAL DEBITS
TOTAL CREDITS
```

They must match.

This report is a key Phase 1 integrity check.

---

# 25. Reports Navigation

Keep Reports uncluttered.

Reports page:

```text
Accounting
  General Ledger
  Trial Balance

Sales
  Customer Statement
  Accounts Receivable
```

Do not add placeholder reports for every future feature.

---

# 26. Basic Accounts Receivable Report

Add:

```text
/b/[businessId]/reports/accounts-receivable
```

Minimum columns:

```text
Customer
Unpaid
Overdue
Total Outstanding
```

Click customer -> Customer View / Statement.

Full aging buckets can come later.

If easy, add:

```text
Current
1-30
31-60
61-90
90+
```

but do not delay the phase for it.

---

# 27. UI / UX Rules for Phase 1

Continue `docs/THEME.md`.

Additional accounting-specific rules:

## Amounts

- right align
- tabular numbers
- consistent currency formatting
- negative values clearly indicated
- no excessive decimal places

## Totals

Use stronger typography but no giant KPI styling inside normal documents.

## Status

Use text badges:
- Draft = neutral
- Posted = info/subtle
- Unpaid = warning
- Partial = warning
- Paid = success
- Overdue = danger
- Void = neutral/danger-muted

Do not rely on color alone.

## Document View

The saved document View page should feel deliberate and clean, not like an edit form with disabled inputs.

Use:
- document title/number
- status
- main actions
- customer block
- dates/reference
- readable line table
- totals
- payment/activity section

## Forms

New/Edit remain full pages.

Use sticky action footer only if useful.

Do not put account/tax advanced fields in the most visually prominent position.
Keep accounting power available but keep the main invoice form friendly.

---

# 28. Responsive Behavior

Desktop remains primary.

Invoice line table:
- desktop: full table
- tablet: horizontal scroll if necessary
- mobile: horizontal scroll is acceptable in Phase 1

Do not create a totally separate mobile invoice editor.

Keep:
- customer
- dates
- totals
- post/save actions
easy to access on narrow screens.

---

# 29. Seed / Demo Data

Update demo business seed with:

```text
Chart of Accounts
UAE VAT 5%
No VAT
3 customers
3 posted sales invoices
1 draft invoice
1 partial receipt
1 paid invoice
```

This gives useful screens immediately for development.

Do not create hundreds of fake records.

---

# 30. Migration Rules

Use versioned Drizzle migrations.

Do not recreate DB from scratch when running Phase 1 against an existing Phase 0 business.

Phase 1 migration should:
- add accounting tables;
- add real invoice fields/tables as required;
- migrate or safely replace Phase 0 prototype invoice data;
- preserve customers;
- preserve business identity/settings.

If Phase 0 invoice prototype schema is too different:
- write one explicit migration;
- do not create permanent compatibility hacks.

---

# 31. Error Handling

Business-readable errors should exist for:

```text
Cannot post invoice because Accounts Receivable is not configured.
Cannot post invoice because a line has no sales account.
Cannot delete this account because it has transactions.
Cannot reduce invoice total below amount already received.
Journal entry is not balanced.
```

Do not expose raw SQLite errors to users.

Developer logs may contain technical details.

---

# 32. Do Not Build in Phase 1

Stop yourself from adding:

```text
Purchase Invoices
Accounts Payable
Inventory
Projects
Bank Reconciliation
Bank Feeds
Credit Notes
UAE VAT Return
UAE E-Invoicing
Multi-currency revaluation
Branches
Payroll
Approvals
Advanced permissions
Automated email sending
Production deployment
Cloud object storage
PostgreSQL
Playwright
```

Credit Notes are important but belong in the next receivables/purchases expansion phase.

---

# 33. Final Phase 1 Verification

Run only after the full Phase 1 implementation is complete.

## A. Startup

1. `docker compose up --watch`
2. verify application starts
3. edit one TSX file
4. confirm hot refresh still works

## B. Chart of Accounts

1. open Chart of Accounts
2. confirm seeded accounts exist
3. create one Expense account
4. edit it
5. confirm system accounts cannot be improperly deleted

## C. Tax Codes

1. confirm `No VAT`
2. confirm `UAE VAT 5%`

## D. Post Invoice

Create:

```text
Customer: ABC Trading
Net: AED 1,000
VAT: AED 50
Total: AED 1,050
```

Post invoice.

Confirm View page shows:
- Posted
- Unpaid
- Total 1,050
- Balance 1,050

Open generated Journal Entry.

Expected:

```text
Accounts Receivable   Debit  1,050
Sales                 Credit 1,000
VAT Payable           Credit    50
```

Confirm debit = credit.

## E. Trial Balance

Open Trial Balance.

Confirm:
- Sales credit includes 1,000
- VAT Payable credit includes 50
- AR debit includes 1,050
- total debits = total credits

## F. Receipt

From invoice View:
1. click Record Receipt
2. choose Bank
3. enter AED 400
4. post

Expected journal:

```text
Bank                  Debit   400
Accounts Receivable   Credit  400
```

Invoice:
- Balance = 650
- Payment Status = Partially Paid

## G. Final Receipt

Record remaining AED 650.

Confirm:
- Balance = 0
- Payment Status = Paid

## H. Customer Statement

Confirm it shows:
- invoice debit 1,050
- receipt credit 400
- receipt credit 650
- running balance ends at 0

## I. Overdue

Create a posted invoice with due date in the past and no receipt.

Confirm:
- Payment Status = Overdue
- AR report includes it

## J. Draft

Create draft invoice.

Confirm:
- appears as Draft
- no journal entry exists
- Trial Balance is unaffected

## K. Edit Posted Invoice

Create a fresh unpaid posted invoice.

Edit the amount.

Confirm:
- invoice total updates
- generated journal updates
- there is no duplicate posting
- journal remains balanced

## L. Business Isolation

Create/post an invoice in Business A.

Switch to Business B.

Confirm:
- invoice does not exist in B
- Chart of Accounts and accounting reports are business-local

## M. Theme / Responsive Regression

Check:
- Light
- Dark
- System
- desktop
- narrow laptop
- mobile viewport

Confirm new accounting screens follow the existing theme and remain usable.

---

# Phase 1 Definition of Done

Phase 1 is complete when:

- Sales Invoice posting is real double-entry accounting;
- Receipts correctly reduce Accounts Receivable;
- Trial Balance balances;
- General Ledger works;
- Customer Statement works;
- draft documents do not affect accounting;
- posted document edits do not duplicate journal impact;
- business isolation remains intact;
- Docker hot reload remains fast;
- the final verification passes.

Stop after reporting results.

Do not automatically start Phase 2.
