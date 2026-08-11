# Phase 5 — Banking + Statement Import + Reconciliation

## Purpose

Add a practical banking layer on top of the existing accounting system.

Phase 5 should support:
- bank and cash accounts;
- bank account views and balances;
- imported bank statement lines;
- matching statement lines to existing Receipts and Supplier Payments;
- creating simple bank income/expense transactions from unmatched lines;
- transfers between bank/cash accounts;
- reconciliation;
- bank transaction history and reports.

Do not add live bank feeds, payment gateways, multi-currency revaluation, UAE e-invoicing, payroll, or production infrastructure yet.

Implement the whole phase first. Run the final verification only after Phase 5 is complete.

## 1. Phase 5 Outcome

A user should be able to:

```text
Create Bank Account
 -> Import Statement
 -> Review Imported Lines
 -> Match Existing Transactions
 -> Create Missing Transactions
 -> Reconcile
```

Supported accounting flows:

```text
Customer Receipt
Bank Dr
Accounts Receivable Cr

Supplier Payment
Accounts Payable Dr
Bank Cr

Bank Expense
Expense Dr
Input VAT Dr optional
Bank Cr

Bank Income
Bank Dr
Income Cr
VAT Payable Cr optional

Bank Transfer
Destination Bank Dr
Source Bank Cr
```

Imported statement lines themselves do not create journals until matched or converted into transactions.

## 2. Keep Existing Architecture

Continue:
- Next.js + TypeScript;
- Drizzle + one SQLite DB per business;
- explicit versioned business migration runner;
- existing accounting posting services;
- Docker Compose Watch + webpack;
- existing theme/UI system;
- existing permission model.

Do not add Redis, PostgreSQL, queues, Playwright, a second backend, or change migration strategy.

## 3. Banking Navigation

Use:

```text
BANKING
Bank Accounts
```

Do not add permanent sidebar entries for Statement Imports, Reconciliation, Transfers, or Bank Rules. Access them from Bank Account View.

## 4. Bank Accounts

Routes:

```text
/b/[businessId]/banking/accounts
/b/[businessId]/banking/accounts/new
/b/[businessId]/banking/accounts/[accountId]
/b/[businessId]/banking/accounts/[accountId]/edit
```

Minimum fields:

```text
id
name
account_code optional
bank_name optional
account_number_masked optional
currency_code
ledger_account_id
is_cash_account
is_active
created_at
updated_at
```

Phase 5 rule:

```text
currency_code must equal business base currency
```

Store currency now so multi-currency bank accounts can be added later.

## 5. Bank Account / GL Relationship

Every Bank Account maps to one Asset ledger account.

Examples:

```text
1010 Main Bank
1020 Petty Cash
1030 Savings Account
```

Do not maintain a separate unrelated book balance. Book balance comes from the GL.

## 6. Bank Account View

Example:

```text
Main Bank
Emirates NBD

Book Balance       AED 85,400
Statement Balance  AED 84,950
Unreconciled       6

[Import Statement] [New Transaction] [Transfer] [Reconcile] [More ▾]
```

Sections:

```text
Transactions
Imported
Reconciliation
Details
```

## 7. Statement Import Tables

Add:

```text
bank_statement_imports
bank_statement_lines
```

Statement line fields should include:

```text
id
import_id
bank_account_id
transaction_date
value_date optional
description
reference optional
amount_minor
external_id optional
fingerprint
match_status
matched_source_type optional
matched_source_id optional
created_at
```

Signed amount:

```text
positive = money in
negative = money out
```

## 8. Import Formats

Minimum:

```text
CSV
```

Create a mapping flow for:

```text
Date
Description
Reference
Debit
Credit
Amount
```

Support either separate Debit/Credit columns or one signed Amount column.

OFX/QFX is optional only if easy. Do not delay Phase 5 for it.

## 9. CSV Import Flow

Use a structured full-page flow:

```text
1. Upload
2. Map Columns
3. Preview
4. Import
```

Preview roughly the first 20 rows.

Validate dates, amounts, required columns, duplicates, and base-currency assumption.

Import must not write journals.

## 10. Duplicate Import Protection

Generate a stable fingerprint using fields such as:

```text
bank_account_id
transaction_date
amount
normalized_description
reference
external_id if present
```

Detect likely duplicates and skip/flag them clearly.

## 11. Statement Line Status

Use only:

```text
Unmatched
Matched
Created
Ignored
```

## 12. Matching Existing Transactions

Suggest candidates for unmatched lines.

Money in:
- Customer Receipts;
- other existing bank credits where supported.

Money out:
- Supplier Payments;
- Bank Transactions;
- Transfers.

Matching factors:

```text
same bank account
same direction
same amount
near date
reference/description similarity
not already matched
```

Do not auto-match without user confirmation.

## 13. Match UI

Example:

```text
09 Aug 2026
ABC TRADING LLC
+ AED 10,500

Suggested match:
Receipt RCPT-00042
ABC Trading LLC
AED 10,500
08 Aug 2026

[Match] [Find Other] [Create Transaction] [Ignore]
```

Keep it compact.

## 14. Matching Rules

Before confirming:
- verify amount;
- verify bank account;
- verify source still exists;
- verify it is not already matched incompatibly.

Store relationship server-side.

## 15. Manual Bank Transactions

Add a simple Bank Transaction document for non-AR/AP activity.

Types:

```text
Money In
Money Out
Transfer
```

Fields:

```text
bank_account
date
type
reference
description
project optional
counter account / lines
tax code optional
amount
status
```

Lifecycle:

```text
Draft
Posted
Void
```

Do not use Bank Transaction to duplicate Customer Receipts or Supplier Payments.

## 16. Money Out Posting

Example:

```text
Office Supplies net AED 1,000
Input VAT            AED 50
Total                AED 1,050
```

Posting:

```text
Debit  Office Supplies   1,000
Debit  Input VAT            50
Credit Bank              1,050
```

## 17. Money In Posting

Example:

```text
Debit  Bank              1,050
Credit Other Income      1,000
Credit VAT Payable          50
```

Tax is optional.

## 18. Create Transaction from Statement Line

Prefill:

```text
Bank Account
Date
Amount
Reference
Description
Direction
```

User selects account, tax code if applicable, and Project optional.

After posting:
- create balanced journal;
- mark line `Created`;
- link line to Bank Transaction.

## 19. Bank Transfers

Route:

```text
/b/[businessId]/banking/transfers/new
```

Fields:

```text
From Account
To Account
Date
Amount
Reference
Description
```

Rules:
- accounts differ;
- same business;
- base currency only in Phase 5.

Posting:

```text
Debit  Destination Bank
Credit Source Bank
```

Use one transfer source/document, not two unrelated transactions.

## 20. Cash Accounts

Allow:

```text
is_cash_account = true
```

Cash accounts participate in accounting and transfers but normally do not need statement import/reconciliation.

## 21. Reconciliation Model

Add:

```text
bank_reconciliations
```

Fields:

```text
id
bank_account_id
statement_date
statement_ending_balance_minor
status
created_at
completed_at optional
```

Statuses:

```text
Draft
Completed
```

## 22. Reconciliation UI

Route:

```text
/b/[businessId]/banking/accounts/[accountId]/reconcile
```

Show:

```text
Statement Date
Statement Ending Balance
Book Balance at Date
Difference
```

Sections:

```text
Matched / Cleared
Outstanding
Unmatched Statement Lines
```

Only allow completion when:

```text
Difference = 0
```

## 23. Reconciliation Rules

Book balance at statement date comes from the mapped bank GL account.

Reconciliation does not create or modify ledger entries. It is a control/comparison process.

Completed reconciliation should preserve statement date, ending balance, matched state, and completion timestamp.

## 24. Bank Transaction History

Bank Account View should show GL-linked activity:

```text
Date
Type
Reference
Description
Money In
Money Out
Balance
Reconciled
```

Include Receipts, Supplier Payments, Bank Transactions, Transfers, and other appropriate journal sources affecting the bank ledger account.

Do not create a disconnected second ledger.

## 25. Receipt / Supplier Payment Integration

Receipt and Supplier Payment View should show:

```text
Bank Account
Reconciliation status
Matched Statement Line optional
```

Do not duplicate them into Bank Transaction records.

## 26. Project Integration

Manual Bank Transaction P&L lines may carry `project_id`.

Example:

```text
Expense       Debit 500   Project A
Bank          Credit 500
```

Project profitability should pick up the P&L line only.

## 27. Tax Handling

Reuse existing Tax Codes.

Money Out may use Input VAT.
Money In may use Output VAT.

Do not build VAT filing yet.

## 28. Reports

Add Banking reports:

```text
Bank Transactions
Reconciliation Summary
```

Bank Transactions filters:
- date;
- account;
- source type;
- reconciled status.

Reconciliation Summary:

```text
Bank Account
Last Reconciled Date
Statement Balance
Book Balance
Difference / Outstanding
```

## 29. Permissions

Use existing Banking module permission.

Without Banking:
- Banking navigation hidden;
- Banking routes rejected;
- import/reconciliation endpoints rejected.

Keep permission rules simple.

## 30. Security

Treat statement uploads as untrusted input.

Validate:
- file type;
- file size;
- row count;
- CSV structure;
- plain-text rendering of descriptions/references.

Do not execute formulas/macros or render imported HTML.

## 31. Backup / Restore

Banking data stored in business SQLite should automatically be included in business backups.

If original statement files are retained, include them in backup attachments/files too.

Restore must preserve bank accounts, statement imports, matching, and reconciliation state.

## 32. Migration

Use the existing explicit versioned business migration runner.

Add:
- bank accounts;
- statement imports;
- statement lines;
- bank transactions + lines;
- transfer storage if separate;
- reconciliations;
- numbering/settings;
- matching fields.

Preserve all Phase 0–4 data.

Do not automatically create duplicate Bank Account records for existing GL accounts unless mapping is explicit and safe.

## 33. UI / UX

Follow `docs/THEME.md`.

Banking rules:
- money in/out clearly separated;
- do not rely only on color for direction;
- difference is visible but not giant;
- unmatched lines are easy to scan;
- suggestions are assistive, not automatic;
- Match / Create / Ignore actions are explicit;
- compact tables;
- no generic fintech dashboard styling.

Use full pages for Import, Reconciliation, Bank Transaction, and Transfer flows.

## 34. Responsive

On narrow screens:
- metrics stack;
- secondary actions collapse into More;
- tables scroll horizontally;
- Match/Create actions remain reachable.

## 35. Demo Data

Seed:

```text
Main Bank
Petty Cash

1 Customer Receipt
1 Supplier Payment
1 Bank Expense
1 Transfer

Statement import with 5-8 lines:
- matching Receipt
- matching Supplier Payment
- expense to create
- transfer
- unmatched line
```

## 36. Do Not Build in Phase 5

Defer:

```text
Live Bank Feeds
Open Banking / PSD2
Plaid / Salt Edge / Yodlee
Automatic Sync
Bank Rules Engine
ML Categorization
Payment Gateways
Cheque Management
Multi-Currency Bank Accounts
FX Revaluation
Credit Card Workflow
Loan Schedules
Cash Flow Forecasting
Approval Workflows
UAE VAT Return
UAE E-Invoicing
Payroll
Production Deployment
PostgreSQL
Playwright
```

## 37. Final Verification

Run once after Phase 5 is complete.

### A. Baseline

```bash
docker compose up --watch
pnpm typecheck
pnpm lint
pnpm db:check
pnpm test
```

Confirm hot reload works.

### B. Bank Account

Create Main Bank mapped to a Bank Asset ledger account.
Confirm Book Balance equals GL balance.

### C. CSV Import

Import a statement containing:
- incoming Receipt;
- outgoing Supplier Payment;
- one expense;
- one transfer;
- one unmatched line.

Confirm preview, mapping, duplicate detection, and no journals created from import alone.

### D. Match Receipt

Match incoming line to existing Customer Receipt.
Confirm no duplicate journal.

### E. Match Supplier Payment

Match outgoing line to existing Supplier Payment.
Confirm no duplicate journal.

### F. Create Expense

Create expense from unmatched outgoing line.
Confirm balanced Expense/Input VAT/Bank journal and statement linkage.

### G. Create Income

Create Money In transaction.
Confirm balanced journal and linkage.

### H. Transfer

Transfer AED 1,000 from Main Bank to Petty Cash.
Confirm one source document and both ledger histories update correctly.

### I. Project Expense

Create bank expense tagged to a Project.
Confirm P&L line carries Project and Project Cost updates.

### J. Reconciliation

Match/create until Difference = 0.
Complete reconciliation.
Confirm completion persists and reconciliation itself does not change the ledger.

### K. Duplicate Import

Import the same CSV again.
Confirm duplicates are skipped/flagged.

### L. Permissions

User without Banking:
- no Banking nav;
- direct Banking routes rejected;
- import/reconciliation endpoints rejected.

### M. Business Isolation

Banking data in Business A must not appear in Business B.

### N. Backup

Export/import business backup.
Confirm banking and reconciliation state survives.

### O. UI / Theme

Check Light, Dark, desktop, and narrow/mobile.
Confirm tables scroll and matching actions remain reachable.

## Phase 5 Definition of Done

Phase 5 is complete when:
- Bank Accounts map to GL accounts;
- book balance comes from GL;
- CSV statement import works;
- duplicate protection works;
- statement import does not post accounting automatically;
- Receipts/Supplier Payments can be matched;
- unmatched lines can create Bank Transactions;
- Transfers post correctly;
- reconciliation completes only at zero difference;
- Project-tagged bank P&L entries affect profitability correctly;
- permissions and business isolation work;
- backup preserves banking data;
- Docker hot reload remains usable;
- final verification passes.

Stop after Phase 5.

Do not automatically start Phase 6.

Recommended next phase:
**UAE VAT reporting + tax-period controls**, followed by UAE e-invoicing preparation.
