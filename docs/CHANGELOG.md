# Changelog — Ledgerly ERP

All notable changes since the original `erp-software-2.0-antigravity-edits` upload. Grouped by development wave, newest last. Dates use the development environment calendar (August 2026 demo data).

Full historical task detail is retained in [history/WORKLOG.md](history/WORKLOG.md). Current acceptance and cleanup evidence is in [FLOW_VERIFICATION_AND_CLEANUP_2026-10-26.md](FLOW_VERIFICATION_AND_CLEANUP_2026-10-26.md).


## Core Commercial Flow Verification, Deep Accounting Audit & Hardening (improvements-settings-v1)

- **Comprehensive End-to-End Deep Audit Verification Suite (`tests/deep-audit-verification.test.ts`)**:
  - Implemented exhaustive 9-stage verification test covering core mathematical invariants, multi-tenant isolation, concurrency numbering sequences, commercial pipelines (Quotes → Revisions → Orders → Delivery/Goods Receipts → Invoices → Payments/Receipts), double-entry balance equilibrium ($\sum \text{Debits} \equiv \sum \text{Credits}$), and lifecycle guards.
  - Successfully added to root `npm test` script; all 176 automated regression tests passing with 0 failures.

- **Sales Order Lifecycle Guard & Error Message Accuracy**:
  - Corrected copy-paste error messages in `sales-order-service.ts` where `closeSalesOrder` and `cancelSalesOrder` erroneously referenced "Purchase order".
  - Strictly enforce proper lifecycle transitions: only active sales orders can be closed, and completed orders cannot be cancelled.

- **Sales Invoice Voiding Delivery Note Guard**:
  - Hardened `voidInvoice` in `invoice-service.ts` to actively query and block voiding if any active (non-void) delivery notes exist.
  - Guarantees inventory COGS and stock movement integrity by preventing orphaned delivery notes.

- **Purchase Invoice Lifecycle Hardening & Accurate Settled Math**:
  - Updated `paidForPurchaseInvoice` in `purchase-invoice-service.ts` to include linked posted debit notes alongside supplier payment allocations, ensuring invoice balance properly reflects debit adjustments.
  - Hardened `voidPurchaseInvoice` to reject voiding if active goods receipts or debit notes are attached to the bill.

- **Debit Note Multi-Currency & Minor Unit Precision**:
  - Replaced manual unscaled calculation `Math.round(amounts.totalMinor * parseFloat(...))` in `debit-note-service.ts` with `base.baseTotalMinor` evaluated through `convertDocumentLinesToBase`.
  - Ensures accurate multi-currency carrying amounts and eliminates rounding discrepancies across currencies with different minor units (e.g. 0-decimal JPY vs 3-decimal BHD).

- **Multi-Currency Dynamic Minor Unit Input Formatting**:
  - Updated `minorToInput` in `money.ts` to accept configurable `minorUnit` (0 to 6, default 2) for precision formatting across all world currencies.

## Find & Recode, Liquidity & Cash Flow Forecast Engine, and Inline Customer Credit / Supplier Prepayment Drawdown (improvements-settings-v1)

- **Option 4: Inline Customer Advance Credit & Supplier Prepayment Drawdown**:
  - **Inline Retainer & Prepayment Detection**: Proactive detection of customer and supplier unallocated credit pool balances when drafting or viewing sales invoices and purchase bills.
  - **Contextual Alert Banner & Instant Post Toggle**: Displays a contextual notice (`✨ Customer has $X.XX available in unallocated advance credit`) and a toggle `[x] Apply customer credit automatically upon posting` (defaulted to active).
  - **Live Dynamic Math in Document Footer**: `DocumentFormFooter` dynamically displays subtotal, tax, gross total, less credit applied, and net balance due before submission.
  - **Automatic FIFO Settlement upon Posting**: `applyAvailableCredit` and `applyAvailablePrepayment` automatically settle new invoices and bills against credit pools on post, reducing balance due and recording settlement audit history.
  - **Regression Verification**: 100% passing tests in `tests/inline-credit-and-prepayment.test.ts`.

- **Option 3: 30/60/90-Day Cash Flow & Liquidity Forecast Engine & Dashboard**:
  - **Treasury Forecasting Engine (`cash-flow-forecast-service.ts`)**:
    - Aggregates liquid starting balances across all GL-mapped Bank and Cash accounts.
    - Projects scheduled receivables inflows from posted unpaid sales invoices according to due dates and customer payment terms.
    - Projects scheduled payables outflows from posted unpaid purchase invoices/bills according to due dates and supplier payment terms.
    - Computes day-by-day cash trajectory over configurable horizons (30, 60, or 90 days), calculating daily net change, cumulative closing balance, minimum cash trough date/amount, and deficit days count.
    - Groups projected flows into standard liquidity buckets: 1–7 days (Immediate), 8–14 days, 15–30 days, 31–60 days, and 61–90 days, flagging past-due receivables and payables.
  - **Interactive Treasury Dashboard (`/reports/cash-flow-forecast`)**:
    - Horizon switcher (30d / 60d / 90d) with instant calculation reactivity.
    - Top KPI cards: Starting Cash, Projected Inflows, Projected Outflows, Net Cash Change, Ending Projected Cash, and Lowest Balance Trough (with deficit warning).
    - Visual daily liquidity trajectory bar chart with interactive day tooltips and baseline zero axis.
    - Horizon bucket matrix and tabbed detail ledgers: Daily Runway Ledger, Inflows, Outflows, and Liquid Accounts breakdown.
    - Client-side CSV export of daily runway ledger with OWASP formula injection protection.
  - **Integrated Navigation**: Added to Financial Statements report index under `/reports` and quick action on Bank Accounts (`/banking/accounts`).
  - **Regression Verification**: 100% passing tests in `tests/cash-flow-forecast.test.ts`.

- **Option 2: Find & Recode / Bulk Transaction Editor (Manager.io & Xero Parity)**:
  - **Universal Multi-Document Line Search (`find-and-recode-service.ts`)**:
    - Searches lines across Sales Invoices, Purchase Invoices, Bank Transactions, and Manual Journals.
    - Multi-dimensional filtering by source document type, GL account, tax code, project tag, date range, and free-text search across descriptions and party names.
  - **Atomic Batch Reclassification Engine**:
    - Reclassifies GL Account, Project Tag, or Tax Code across any selection of transaction lines.
    - Updates underlying document line rows and atomically re-posts double-entry ledger journals with `replace = true` (zero orphaned journal lines).
    - When reclassifying tax codes, dynamically recalculates line tax minor, adjusts document gross/tax amounts, and replaces tax entries via `replaceTaxEntries`.
    - Strictly enforces financial period locks (`assertFinancialLock`) and VAT lock dates (`assertVatDateUnlocked`).
  - **Interactive Client View (`/accounting/find-and-recode`)**:
    - Filter panel with live count badges, row checkboxes, and "Select All" toggle.
    - Floating sticky batch action bar displaying selected lines count, net amount total, and action triggers: *Recode Account*, *Recode Project*, and *Recode Tax Code*.
    - Radix modal dialogs with safety confirmation, destination selection, and atomic execution via server action `recodeLinesAction`.
  - **Integrated Navigation**: Added to sidebar under Accounting and header shortcut button on Journal Entries (`/accounting/journal`).
  - **Regression Verification**: 100% passing tests in `tests/find-and-recode.test.ts`.

## Bank Rules & Auto-Categorization Engine + Settings Hub Compact Overhaul (improvements-settings-v1)

- **Main Settings Hub Compact Overhaul & Sub-Settings Layout Alignment**:
  - **Compact, Balanced 3-Column Card Layout**: Refactored `SettingsHubClient` from bulky 2-column cards to a crisp, high-density `grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3` layout. Reduced card padding to `p-3`, resized icon badges to `size-8` with `size-4` icons, refined typography to `text-xs font-semibold` and `text-[11px] leading-relaxed`, and added subtle border hover interactions.
  - **Streamlined Top Snapshot Banner**: Compacted organization profile banner with `p-4` padding, `size-9` initials badge, and crisp badge chips for Base Currency, VAT registration / TRN, and Date format.
  - **Category Counts**: Added option count badges (e.g. "6 options") to category headers with clean bottom dividers.
  - **Sub-Settings Width Constraints Fixed (`SettingsShell`)**: Updated `SettingsShell` to accept configurable `maxWidth` (defaulting to a comfortable `max-w-4xl` instead of rigid `max-w-3xl`) and optional `actions` slot. Standardized back navigation across all sub-settings using `<BackLink href="...">Settings</BackLink>`.
  - **Document Templates Workspace Expansion**: Set `maxWidth="max-w-7xl"` in `document-templates/page.tsx` giving the side-by-side template code editor and live PDF preview ample horizontal space.

- **Option A: Bank Rules & Auto-Categorization Engine (Inspired by Manager.io "Bank Rules")**:
  - **Database Migration 30 (`bank_rules`)**: Added table `bank_rules` in `business-schema.ts` and `business-migrations.ts` with columns: `id`, `name`, `rule_order`, `direction` (`money_in`, `money_out`, `both`), `match_field` (`description`, `reference`, `any`), `match_type` (`contains`, `exact`, `starts_with`), `match_text`, `bank_account_id` (nullable for all banks), `target_account_id` (GL account to debit/credit), `target_tax_code_id`, `auto_description`, and `is_active`. Indexed by `(is_active, rule_order)` and `bank_account_id`.
  - **Bank Rule Service (`bank-rule-service.ts`)**:
    - Complete CRUD operations: `createBankRule`, `updateBankRule`, `deleteBankRule`, `listBankRules`, `getBankRule`, `toggleBankRuleActive`, `reorderBankRules`.
    - Pattern matching engine: `matchRuleAgainstLine` and `findMatchingBankRule` supporting case-insensitive text matching against description and reference, direction filtering, and bank account scoping.
    - Single-line application (`applyBankRule`): Automatically creates and posts a Bank Transaction via `saveBankTransaction`, linking and reconciling the statement line (`match_status = 'created'`), creating posted GL journal lines, and honoring tax codes with zero-tax fallback.
    - Batch auto-categorization (`batchApplyBankRules`): Scans all unmatched statement lines for a bank account, evaluates active rules, and atomically categorizes and posts matching transactions.
    - Match diagnostics (`getRuleMatchesCount`): Computes live counts and matched IDs for imported statement lines.
  - **Bank Rules Management UI (`/settings/bank-rules`)**:
    - Created dedicated settings page and interactive client component (`bank-rules-manager.tsx`) with search, active status toggle, edit modal with `SelectNative` and `DialogRoot`, and "+ New Bank Rule" flow.
    - Added "Bank Rules & Categorization" card to the main Settings Hub under "Accounting & Tax".
  - **Statement Reconciliation Integration**:
    - Added `BatchAutoCategorizeButton` in `bank-account-view-page`: When viewing imported statement lines, displays a highlighted action banner: `✨ N unmatched statement lines match your bank rules` with a 1-click `Auto-Categorize All (N)` button.
    - Added 1-click `✨ Apply Rule: [Rule Name]` button directly inside `StatementLineActions` for any line matching an active rule.
    - Added quick shortcut: `Create Rule` pre-populating pattern text and direction directly from an unmatched statement line.
  - **Automated Verification**:
    - Comprehensive test suite `tests/bank-rules.test.ts` covering CRUD, pattern matching, single-line posting, batch execution, and void reversal symmetry.
    - 153/153 automated tests passing, 0 TypeScript errors, 0 ESLint warnings, clean Next.js build.

## Statement Date-Range & Aging Period Filter (Customer & Supplier) (improvements-settings-v1)

- **Statement Date-Range Filtering with "Balance Brought Forward"**:
  - Implemented `StatementOptions` (`fromDate`, `toDate`, `currencyCode`) in both `customer-statement-service.ts` and `supplier-statement-service.ts`.
  - When `fromDate` is specified, all historical movements prior to `fromDate` are summed into an opening balance:
    - Customer: $\text{openingBalanceMinor} = \sum (\text{debit\_minor} - \text{credit\_minor})$ for movements prior to `fromDate`.
    - Supplier: $\text{openingBalanceMinor} = \sum (\text{credit\_minor} - \text{debit\_minor})$ for movements prior to `fromDate`.
    - Prepend an opening balance row (`entry_number: "OPENING"`, `source_type: "opening_balance"`, `description: "Balance Brought Forward"`).
    - Period movements accumulate running balances starting from the opening balance.
  - Full backward compatibility maintained for string currency arguments and unbounded statements.

- **Aged Receivables & Aged Payables Analysis Engine (`getCustomerAging`, `getSupplierAging`)**:
  - Automatically categorizes unpaid posted invoices and bills by overdue days against `asOfDate` (or statement end date):
    - Current (not yet due)
    - 1 – 30 days overdue
    - 31 – 60 days overdue
    - 61 – 90 days overdue
    - 90+ days overdue
  - Nets unallocated customer receipts, credit notes, vendor prepayments, and debit notes against the aging buckets.
  - Strict accounting invariant: $\sum \text{buckets} \equiv \text{totalMinor}$ (always matches total statement outstanding/payable).

- **Interactive Statement UI/UX**:
  - **Statement Date Presets (`STATEMENT_DATE_PRESETS`)**: Added quick period presets ("This Month", "Last Month", "This Quarter", "This Year", and "All Time" via Clear) to `ListDateFilter`.
  - **Aging Analysis Summary Bar (`statement-aging-bar.tsx`)**: Created responsive visual summary strip at the top of statement pages with color-coded buckets and total outstanding balance.
  - **Table Period Totals Footer**: Added summary footer row to statement tables displaying Period Total Debits, Total Credits, and Period Closing Balance.
  - **Dynamic PDF Export**: Export PDF button now passes active date range and currency query parameters.

- **PDF Statement Template (`statement-template.tsx`) & API Routes**:
  - Added period metadata label in the boxed header and an Aging Analysis grid table at the bottom of the statement.
  - Statement PDF API routes (`/customers/[customerId]/statement/pdf` and `/suppliers/[supplierId]/statement/pdf`) extract date parameters and render matching PDF statements.

- **Automated Verification**:
  - Enhanced `tests/statements-and-pdf-preview.test.ts` to verify date-range filtering, opening balance brought forward, aging calculations, and PDF generation with aging. All 147 tests pass.

## Table Kebab (3-Dot) Menus Audit, Void Document Clarity & Command Palette Expansion (improvements-settings-v1)

- **Cross-Module Table Kebab (3-Dot) Menus & Row Actions Audit**:
  - Audited all table surfaces across modules to ensure complete consistency, working contextual actions, and lifecycle status guards:
    - **Suppliers List**: Added missing "Statement" action in the 3-dot dropdown menu linking to `/suppliers/[supplierId]/statement`.
    - **Projects List**: Added quick operational actions: "New Invoice" (prefilled with project ID), "New Bill" (prefilled with project ID), and "Profitability Report" (`/reports/project-profitability?projectId=${prj.id}`).
    - **Receipts List**: Created dedicated `ReceiptRowActions` component with 3-dot kebab menu: "View Receipt", "Customer Profile", and "Customer Statement".
    - **Supplier Payments List**: Created dedicated `SupplierPaymentRowActions` component with 3-dot kebab menu: "View Payment", "Supplier Profile", and "Supplier Statement".
    - **Bank Accounts List**: Created dedicated `BankAccountRowActions` component with 3-dot kebab menu: "View Transactions", "Edit Account", "Reconcile" (if not cash), "Import Statement" (if not cash), and "New Transaction".
    - **Inventory Items List**: Created dedicated `InventoryItemRowActions` component with 3-dot kebab menu: "View Item Details", "Edit Item", "Adjust Stock", and "Stock Movement Report".
    - **Delivery Notes List**: Created dedicated `DeliveryNoteRowActions` component with 3-dot kebab menu: "View Details", "Edit Note" (guarded for draft status), and "Download PDF".
    - **Goods Receipts List**: Created dedicated `GoodsReceiptRowActions` component with 3-dot kebab menu: "View Details", "Edit Receipt" (guarded for draft status), and "Download PDF".
    - **Inventory Locations List**: Created dedicated `InventoryLocationRowActions` component with 3-dot kebab menu: "View Details" and "Edit Location".
    - **Chart of Accounts**: Added 1-click "General Ledger" shortcut directly to each account's kebab menu (`/reports/general-ledger?accountId=${account.id}`).
    - **General Journal**: Added quick hover chevron navigation link to view journal entry details.
- **Void Document Balance vs. Total Amount Clarity**:
  - In `sales/invoices/[invoiceId]` and `purchases/invoices/[invoiceId]`:
    - Added strike-through styling to the historical total amount (`line-through text-muted-foreground`).
    - Added explicit callout badge: `Voided · 0.00 Balance (GL Reversal Posted)`.
    - In bottom totals breakdown: rendered strike-through total with explicit `Voided Balance: 0.00` line item.
- **Command Palette (`Ctrl+K`) Shortcuts**:
  - In `AppShell`, expanded quick action palette:
    - "Record Receipt" (`/sales/receipts/new`)
    - "Record Supplier Payment" (`/purchases/payments/new`)
    - "New Sales Quote" (`/sales/quotes/new`)
    - "New Sales Order" (`/sales/orders/new`)
    - "New Purchase Order" (`/purchases/orders/new`)
    - "New Bank Account" (`/banking/accounts/new`)

## PDF Live Preview Fix, Full Supplier Statements & Bank Reconciliation 1-Click Actions (improvements-settings-v1)

- **Template Studio Live PDF Preview ("localhost failed to connect" fix)**:
  - Diagnosed and resolved Chromium browser security boundary where raw `<iframe>` pointing to localhost PDF endpoints triggered extension sandbox framing blocks or blank canvases.
  - Replaced direct iframe embed with client-side blob streaming via `fetch(previewUrl)` and in-memory `URL.createObjectURL(blob)`, providing instant same-origin rendering via `<object>` with an iframe fallback.
  - Added compilation-time loading spinner overlay ("Compiling PDF preview...") and dedicated error boundary with "Retry" and "Open in New Tab" actions.
  - Set `X-Frame-Options: SAMEORIGIN` on preview PDF API endpoint.

- **Full Supplier Statements & Customer Statement Accounting Parity**:
  - **Supplier Statements Subroute (`/suppliers/[supplierId]/statement`)**: Created dedicated statement view for vendors with date, source type, reference, description, debit, credit, and running payable balance.
  - **Supplier Statement PDF Export (`/api/.../suppliers/[supplierId]/statement/pdf`)**: Created PDF export endpoint backed by `@react-pdf/renderer`.
  - **Generalized Statement Template (`statement-template.tsx`)**: Upgraded `ClassicStatementDocument` to support both Customer and Supplier statements with customizable `partyLabel` ("Customer" vs "Supplier"), `title` ("STATEMENT OF ACCOUNT" vs "SUPPLIER STATEMENT OF ACCOUNT"), and `balanceLabel` ("Total Due:" vs "Payable Balance:").
  - **Supplier Statement Service Defect Fix (`supplier-statement-service.ts`)**:
    - Replaced `INNER JOIN supplier_payment_allocations` with full `supplier_payments` query (`sp.amount_minor`), ensuring pure vendor prepayments and surplus credits appear on vendor statements.
    - Added `debit_notes` to supplier statement movements as debits against Accounts Payable.
    - Updated `getSupplierAccountingSummary` to compute:
      $$\text{outstandingMinor} = \text{totalPurchasedMinor} - \text{totalPaidMinor} - \text{totalDebitedMinor}$$
  - **Customer Statement Service Defect Fix (`customer-statement-service.ts`)**:
    - Replaced `INNER JOIN receipt_allocations` and `sales_credit_note_allocations` with full `receipts` and `sales_credit_notes`, ensuring customer advance retainer deposits and unallocated credits appear on customer statements and running balances.
    - Updated `getCustomerAccountingSummary` to compute:
      $$\text{outstandingMinor} = \text{totalInvoicedMinor} - \text{totalReceivedMinor} - \text{totalCreditedMinor}$$
  - **Supplier Detail Link Parity**: Updated Statement button on `/suppliers/[supplierId]` from broken reports URL to dedicated `/suppliers/[supplierId]/statement` route.

- **Bank Statement Reconciliation 1-Click Settlement Shortcuts (`statement-line-actions.tsx`)**:
  - Upgraded unmatched statement line actions to inspect transaction direction:
    - **Money In (+)**: Surfaces 1-click **Record Receipt** shortcut pre-filling the selected bank account, transaction amount, date, and reference.
    - **Money Out (−)**: Surfaces 1-click **Record Payment** shortcut pre-filling the selected bank account, withdrawal amount, date, and reference.
    - Non-AR/AP bank transactions remain accessible via "Bank Transaction" button.
  - Enhanced `NewReceiptPage` and `NewSupplierPaymentPage` to accept and prefill `bankAccountId`, `amount`, `date`, `reference`, and `description` from query parameters.

- **Automated Verification Suite (`tests/statements-and-pdf-preview.test.ts`)**:
  - Full automated integration suite covering Customer Statements (invoices + pure advance retainers + credit notes), Supplier Statements (bills + pure vendor prepayments + debit notes), and PDF generation across both statement types and Template Studio document types.
  - Added test suite to `package.json` test script. All 147 unit and integration tests passing (`npm test`).

## Multi-Invoice Supplier Payments, Vendor Prepayment Pool & 1-Click Bill Drawdown (improvements-settings-v1)

- **Multi-Invoice Supplier Settlement Engine (`settlement-service.ts`)**:
  - Upgraded `createSettlement` for supplier payments (`partyType === "supplier"`) to accept multi-bill `allocations` arrays, settling multiple purchase invoices in a single transaction with atomic ledger posting.
  - Added support for vendor prepayment surplus: unallocated payment amounts are cleanly held as unallocated advance credit in the vendor's Accounts Payable subledger.
  - Implemented `applySettlementCredit`: enables subsequent purchase bills to absorb unallocated vendor prepayments via 1 click without creating duplicate cash-out transactions.
  - Double-Entry Reversal Symmetry: voiding a multi-invoice supplier payment atomically restores open balances across all allocated purchase invoices and reverses vendor prepayments.
  - Exact error message compatibility maintained with legacy regression suites (`Payment amount exceeds the selected payable`).

- **Supplier Payment Input & Services (`supplier-payment-input.ts`, `supplier-payment-service.ts`, `actions.ts`)**:
  - Implemented `supplierPaymentAllocationInputSchema` and `applySupplierPaymentCreditInputSchema`.
  - Preserved 100% backward compatibility for single-invoice payment callers (`purchaseInvoiceId` / `invoiceId`).
  - Added `getSupplierUnallocatedCredit` discovering all unallocated prepayments and surplus credits on account for any vendor.
  - Upgraded `getSupplierPayment` and `listSupplierPayments` (handling pure prepayments with `COALESCE(pi.invoice_number, 'Unallocated Prepayment')`).

- **Interactive UI/UX Across Supplier Payments & Purchase Invoices**:
  - **Multi-Bill Allocation Register (`supplier-payment-form.tsx`)**: Replaced single-invoice selector with an interactive open bills table showing Bill #, Supplier Reference, Bill Date, Due Date (with overdue badges), Bill Total, Open Balance, and Allocation Amount.
  - **1-Click Auto-Allocate FIFO (Oldest First)**: Automatically distributes supplier payment funds chronologically starting from the oldest open bill until the payment amount is exhausted.
  - **1-Click Pay All Open Bills**: Calculates total open balance, populates 100% allocation across all bills, and auto-fills payment amount.
  - **Live Financial Summary**: Displays Total Paid, Total Allocated to Bills, and Unallocated Vendor Prepayment Surplus.
  - **Pure Vendor Prepayment Empty State**: Dedicated informative prompt for recording advance deposits to suppliers prior to receiving bills.
  - **Purchase Invoice 1-Click Prepayment Banner & Modal (`apply-prepayment-modal.tsx`, `invoices/[invoiceId]/page.tsx`)**: When viewing an unpaid bill for a supplier who holds unallocated prepayments, an alert banner opens an interactive modal to draw down credit directly.
  - **Supplier Payment View Page (`payments/[paymentId]/page.tsx`)**: Added unallocated prepayment notice and multi-bill allocation breakdown table.

- **Automated Regression Suite (`tests/multi-invoice-supplier-payments.test.ts`)**:
  - 6-stage end-to-end integration test suite verifying 3-bill lump-sum settlement (90k AED settling 25k, 35k, 30k), partial bill settlement with unallocated vendor prepayment surplus, pure vendor prepayment deposit (0 bills), 1-click credit application, and void symmetry. All 6 tests pass.

## Multi-Invoice Lump-Sum Receipts, Advance Retainer Credit Pool & 1-Click Settlement (improvements-settings-v1)

- **Multi-Invoice Lump-Sum Settlement Engine (`settlement-service.ts`)**:
  - Refactored `createSettlement` to accept an `allocations` array, allowing a single lump-sum receipt or supplier payment to settle multiple open invoices simultaneously with atomic ledger posting.
  - Added native support for advance surplus deposits: any receipt amount exceeding invoice allocations is cleanly held as unallocated advance credit in the customer's Accounts Receivable subledger.
  - Implemented `applySettlementCredit`: enables subsequent invoices to absorb available customer advance credit via 1 click without requiring new bank transaction entries.
  - Double-Entry Reversal Symmetry: voiding a multi-invoice receipt atomically restores open balances across all allocated invoices and frees or voids unallocated advance credits.

- **Receipt Input & Services (`receipt-input.ts`, `receipt-service.ts`, `actions.ts`)**:
  - Implemented `receiptAllocationInputSchema` and `applyReceiptCreditInputSchema`.
  - Full backward compatibility for single-invoice receipt callers and legacy test suites.
  - Implemented `getCustomerUnallocatedCredit` discovering all available advance deposits on account for any customer.
  - Upgraded `getReceipt` and `listReceiptsForCustomer` to report total allocated amount and remaining unallocated advance credit.

- **Interactive UI/UX Across Receipts & Invoices**:
  - **Multi-Invoice Allocation Register (`receipt-form.tsx`)**: Replaced single-invoice dropdown with an interactive table showing Invoice #, Issue Date, Due Date (with overdue badges), Invoice Total, Open Balance, and Allocation Amount.
  - **1-Click Auto-Allocate FIFO (Oldest First)**: Automatically distributes received payments across open invoices starting from the oldest invoice until the payment amount is exhausted.
  - **1-Click Pay All Open Invoices**: Calculates total open balance, populates 100% allocation across all invoices, and sets the receipt amount to match.
  - **Live Financial Summary**: Displays Total Received, Total Allocated to Invoices, and Advance Deposit Surplus (Customer Credit Pool).
  - **Pure Advance Retainer Empty State**: Clear informational prompt for recording unallocated retainer deposits when a customer has no open invoices.
  - **Invoice View 1-Click Credit Banner & Modal (`apply-credit-modal.tsx`, `invoices/[invoiceId]/page.tsx`)**: When viewing an unpaid invoice for a customer who holds advance credit, a prominent banner alerts the user and opens an interactive modal to apply credit directly.

- **Automated Regression Suite (`tests/multi-invoice-receipts.test.ts`)**:
  - 6-stage end-to-end integration test suite verifying 3-invoice lump-sum settlement (100k AED settling 30k, 40k, 30k), partial invoice settlement with advance deposit surplus, pure customer advance retainer deposit (0 invoices), 1-click credit application, and void symmetry. All 6 tests pass.

## Multi-Customer Projects & Enterprise Stakeholder Collaboration (improvements-settings-v1)

- **Migration 29 (`project_customers_multi_client`)**:
  - Installed `project_customers` junction table (`id`, `project_id`, `customer_id`, `role`, `billing_percentage`, `is_primary`, `notes`, `created_at`, `updated_at`, unique index on `(project_id, customer_id)`).
  - Automatically backfilled all existing projects into `project_customers` with `role = 'primary_client'` and `is_primary = 1`, ensuring zero data loss and total backwards compatibility.

- **Multi-Stakeholder Enterprise Roles**:
  - Implemented 7 industry-standard stakeholder roles: `primary_client`, `co_client`, `joint_venture`, `tenant`, `bill_to`, `sponsor`, `consultant` in `project-input.ts`.

- **Commercial Reference Validation & Flow Hardening (`project-validation.ts`)**:
  - Updated `validateProjectReferences` to allow billing any customer associated with the project, while strictly rejecting unassociated third parties with clear domain errors.

- **Financial Ledger Segregation vs Unified Project P&L (`project-service.ts`, `project-view-service.ts`)**:
  - `listProjectCustomers` calculates granular financial metrics per stakeholder (`invoicedMinor`, `collectedMinor`, `outstandingMinor`), using gross billing to match customer AR statements and receipts.
  - Project operational view and profitability reports aggregate unified revenue, costs, and margins across all stakeholders on the project.
  - Added relational deletion guards to `removeProjectCustomer` preventing removal of stakeholders with active billed transactions under the project.

- **Interactive UI/UX Across Projects Module**:
  - **Project Detail Page**: Added dedicated **"Clients & Stakeholders"** card (`src/modules/projects/project-stakeholders.tsx`) displaying stakeholder table, role badges, split %, financial breakdown, "Bill Invoice" shortcut per customer, and "Add Client / Stakeholder" modal dialog.
  - **Project Header & Quick Actions**: Multi-stakeholder badge in header, direct links to co-client profiles, and smart "New Invoice" dropdown prompt allowing selection of which customer to bill when multiple exist.
  - **Project List Table**: Primary customer name supplemented by an interactive `+X co-clients` pill with full hover tooltip.
  - **Customer Profile Integration**: Customer's linked projects table displays their specific role badge (e.g. `Joint Venture (40%)`, `Tenant`, `Co-Client`).
  - **Document Creation Forms**: Project selector dynamically filters to projects where the selected customer is either primary or an associated co-client.

- **Automated Regression Suite (`tests/multi-customer-projects.test.ts`)**:
  - 8-stage comprehensive test suite covering JV partner creation, split %, multi-customer invoice issuance on the same project, unrelated customer rejection, receipt allocation, co-client project filtering, deletion guards, and General Ledger equilibrium. All 9 assertions pass.

## System Flow Hardening, Relational Linkage Preservation, Void/Delete Symmetry & Interactive Testing Guides (improvements-settings-v1)

- **Party Phone Number Validation (`party-schemas.ts`)**:
  - Added robust validation across `customerInputSchema`, `supplierInputSchema`, and `businessProfileInputSchema` supporting international E.164 and localized phone formats while rejecting gibberish.

- **Sales & Purchase Lifecycle Relational Linkage Preservation**:
  - Editing Quotes, Orders, Invoices, or Debit Notes preserves upstream reference foreign keys (`salesQuoteId`, `salesOrderId`, `purchaseQuoteId`, `purchaseOrderId`), keeping status pills and conversion steppers visible throughout the entire document lifecycle.

- **Void / Delete Double-Entry Ledger Symmetry**:
  - Deleting or voiding an invoice, debit note, or credit note completely reverses associated journal lines, accounts receivable / accounts payable carrying values, and VAT liability without leaving orphaned balances in Trial Balance or General Ledger.

- **Lifecycle Stage Guards & Edit Restrictions**:
  - Enforced strict transition guards: completed/cancelled sales orders cannot be modified; sales invoices with issued delivery notes or credit notes cannot be modified; purchase invoices with goods receipts or debit notes cannot be modified.

- **Interactive Module Flow Guide (`src/components/module-flow-guide.tsx`)**:
  - Non-intrusive interactive info button (`<ModuleFlowGuide />`) embedded in page headers across all modules (Invoices, Quotes, Orders, Credit Notes, Debit Notes, Receipts, Payments, Inventory, Banking, Projects, Settings).
  - Displays expected lifecycle steps, business rules, status transitions, downstream linkages, and double-entry accounting effects for manual and QA testing.

- **Table Totals Bar Aggregations (`src/components/table-totals-bar.tsx`)**:
  - Multi-currency live aggregations dock across commercial registers displaying row counts, net subtotal, tax amount, and gross totals.

- **Automated Flow Hardening Suite (`tests/flow-verification-and-hardening.test.ts`)**:
  - Comprehensive end-to-end integration test suite verifying phone validation, linkage preservation, lifecycle stage guards, double-entry void symmetry, and multi-currency reporting.

## System Audit, Security & Business Logic Correctness Remediation (improvements-settings-v1)

- **Database Concurrency & Busy Timeout (`system.ts`, `business.ts`)**:
  - Configured `{ timeout: 5000 }` and `PRAGMA busy_timeout = 5000` on both system and business SQLite connections, eliminating transient lock errors during concurrent write transactions.

- **Authentication & Rate Limiting Hardening (`actions.ts`)**:
  - Neutralized `reportFailedLogin()` and `clearLoginAttempts()` to safe no-ops, ensuring brute-force rate limit tracking is strictly server-authoritative via Better-Auth hooks on `/sign-in/email`.
  - Standardized client IP resolution to extract the rightmost entry of `x-forwarded-for` (consistent with `auth.ts`), closing header spoofing vectors.

- **Document Emailing Object-Level Authorization (`email/actions.ts`)**:
  - Added module resolution via `getDocumentPdfModule(documentType)` in `sendDocumentEmailAction`.
  - Enforced `requireApiAuth` module checks, preventing unauthorized cross-module document email dispatch.

- **Debit Notes Module Alignment & Broken Routing (`debit-notes/actions.ts`, `document-pdf-access.ts`)**:
  - Corrected `requireModule` calls from `"sales"` to `"purchases"` across all debit note server actions.
  - Fixed redirect and revalidation routes from non-existent `/sales/debit-notes` to `/purchases/debit-notes`.
  - Added `"debit-note": "purchases"` to `documentModules` mapping, enabling debit note PDF generation.
  - Standardized PDF API route to return `authError` directly.

- **Cash-Basis Multi-Currency P&L Integrity (`report-service.ts`)**:
  - Updated cash-basis revenue and expense queries to multiply line proportions by `COALESCE(ra.base_carrying_amount_released, ra.amount_minor)` and `COALESCE(spa.base_carrying_amount_released, spa.amount_minor)` rather than nominal invoice currency, ensuring accurate base-currency reporting.

- **Settlement Bank Reconciliation Guard (`settlement-service.ts`)**:
  - Fixed party type ternary check in `voidSettlement` from `"supplierPayment"` to snake_case `"supplier_payment"`.
  - Prevents voiding of supplier payments reconciled in completed bank reconciliations.

- **Zero-Price / 100% Discount Tax-Inclusive Line Resilience (`money.ts`)**:
  - Allowed `grossMinor === 0` in `splitTaxInclusive()`, returning `{ netMinor: 0, taxMinor: 0 }` without error.

- **Automated Regression Suite (`tests/remediation-verification.test.ts`)**:
  - Added comprehensive test suite verifying busy timeout pragma, zero tax-inclusive splitting, debit note PDF access & generation, supplier payment bank reconciliation void guard, and cash-basis multi-currency reporting. All 100 tests pass.

## Manager.io & Modern ERP Feature Suite (improvements-settings-v1)

- **Migration 27 (`manager_features_lock_uom_terms_email`)**:
  - Added `financial_lock_date` and `opening_balances_date` to `business_accounting_settings`.
  - Created `units_of_measure` table (pre-seeded with `pcs`, `hrs`, `days`, `kg`, `m`, `box`, `set`, `ltr`, `ton`, `sqm`).
  - Added `unit_of_measure` to `inventory_items` and commercial line tables (`sales_invoice_lines`, `purchase_invoice_lines`, `sales_quote_lines`, `sales_order_lines`, `purchase_quote_lines`, `purchase_order_lines`, `delivery_note_lines`, `goods_receipt_lines`).
  - Created `payment_terms` table (pre-seeded with `Due on Receipt`, `Net 15`, `Net 30`, `Net 45`, `Net 60`, `End of Month`) and foreign key column `payment_terms_id` on `customers` and `suppliers`.
  - Created `email_templates` table (pre-seeded with standard templates for 7 document types).

- **Global Financial Lock Date (Period Closing) (`/settings/lock-date`)**:
  - Created `financial-lock-service.ts` with `getFinancialLockDate`, `setFinancialLockDate`, and `assertFinancialLock`.
  - Enforced in `posting-service.ts` (`postTransaction`): blocks posting, editing, or voiding transactions dated on or prior to the financial lock date.
  - Dedicated settings page with quick preset buttons (End of Last Month, End of Last Quarter, End of Last Fiscal Year).

- **Universal Clickable Balance Drill-Down**:
  - Upgraded `listAccountsWithBalances` in `account-service.ts`.
  - Made account balances interactive links across the Chart of Accounts (`/accounting/chart-of-accounts`), Trial Balance (`/reports/trial-balance`), Balance Sheet (`/reports/balance-sheet`), and Profit & Loss (`/reports/profit-loss`).
  - Clicking any balance navigates directly to the General Ledger (`/accounting/general-ledger?accountId=...`), preserving date ranges.

- **Cash Basis vs. Accrual Basis Toggle in Profit & Loss (`/reports/profit-loss`)**:
  - Enhanced `getProfitAndLoss` in `report-service.ts` supporting `basis: "accrual" | "cash"`.
  - Accrual basis: calculates revenue and expenses from posted sales and purchase invoices.
  - Cash basis: recognizes revenue and expenses strictly upon realized cash receipts and supplier payments, apportioning receipts/payments proportionally across invoice line accounts.
  - Added an interactive basis switcher toggle to the report UI.

- **Guided Opening Balances Onboarding Engine (`/settings/opening-balances`)**:
  - Implemented `opening-balances-service.ts` with `getOpeningBalances` and `saveOpeningBalances`.
  - UI groups accounts by type (Assets, Liabilities, Equity, Historical Income, Historical Expenses).
  - Live debit/credit summary banner: automatically creates an opening balance journal entry, offsetting any imbalance to Retained Earnings / Equity.

- **Units of Measure (UOM) Standard (`/settings/units-of-measure`)**:
  - Created `uom-service.ts` and interactive UOM management interface.
  - Standardized measurement units across inventory items, line items, and document forms.

- **Multi-Select Batch Operations Bar (`src/components/batch-action-bar.tsx`)**:
  - Floating bottom action dock appearing whenever rows are selected in registers.
  - Integrated into Sales Invoices (`/sales-invoices`), Purchase Invoices (`/purchase-invoices`), and Sales Quotes (`/sales-quotes`).
  - Supports multi-select, select-all, batch CSV export, and batch print triggers.

- **Sticky Action Dock on Long Forms (`src/components/document-form-footer.tsx`)**:
  - Modernized document form footer with sticky bottom positioning, frosted glass backdrop blur, and responsive layout.
  - Displays document status badge, live running subtotal, tax amount, and formatted total always in view.
  - Integrated across Sales Invoices, Purchase Invoices, and Sales Quotes.

- **Payment Terms Presets & Auto Due Dates (`/settings/payment-terms`)**:
  - Implemented `payment-terms-service.ts` with flexible calculation (`calculateDueDate`) supporting fixed days (`Net 15`, `Net 30`, `Net 45`, `Net 60`) and End of Month (`EOM`, `EOM + X days`).
  - Selecting a customer or supplier with default payment terms automatically computes and populates invoice due dates based on issue date.

- **Email Templates with Dynamic Variables (`/settings/email-templates`)**:
  - Implemented `email-template-service.ts` with variable placeholder interpolation (`{{customer_name}}`, `{{document_number}}`, `{{total_amount}}`, `{{balance_due}}`, `{{due_date}}`, `{{business_name}}`).
  - Studio UI with quick variable insertion chips, live sample preview, and per-document-type configuration.

- **Settings Hub Centralization**:
  - Integrated all new configuration views into `SettingsHubClient` with quick search indexing and badges.

- **Automated Verification Suite (`tests/manager-erp-features.test.ts`)**:
  - Comprehensive automated tests covering all new features, expanding the test suite to 83 passing tests (0 failures, 0 TypeScript errors).

- **Playwright End-to-End Real Browser Suite (`e2e/manager-features-browser.spec.ts`)**:
  - Validated all 10 interactive flows and scenarios across the application in Chromium:
    1. Settings Hub live search filtering and module navigation.
    2. Payment Terms Presets Manager CRUD and dynamic due date calculation.
    3. Units of Measure (UOM) Catalog CRUD and active toggle.
    4. Email Templates Studio dynamic token insertion, live interpolated preview card, and save action.
    5. Guided Opening Balances Onboarding Engine debit/credit self-balancing.
    6. Global Financial Lock Date period closing controls and period unlock.
    7. Chart of Accounts universal clickable balance drill-down into General Ledger.
    8. Profit & Loss reports drill-down, CSV export, and Cash vs Accrual basis toggle.
    9. Commercial register multi-select batch operations floating dock.
    10. Sticky Action Dock on commercial forms with running subtotal, tax, and total.
  - All 19 Playwright tests (10 new flows + 9 settings tests) passing cleanly.

- **Next.js RSC Boundary & Client Bundle Hardening**:
  - Refactored `ExportCsvButton` and `exportCsv` to support serialized `accessorKey` properties across React Server Component (RSC) boundaries without function serialization errors.
  - Extracted `src/modules/email/email-template-types.ts` to separate pure client-side types and string interpolation helpers from server-side database code (`better-sqlite3`, `node:crypto`).

- **Security & Data Integrity Hardening Overhaul**:
  - Edge Proxy Auth Protection (`src/proxy.ts`): Intercepts unauthenticated requests to protected business paths (`/b/*`, `/businesses/*`) at the Next.js proxy boundary, redirecting to `/login` before server execution.
  - Numbering Allocation Concurrency Lock (`numbering-service.ts`): Implemented atomic write lock upgrade prior to sequence queries, preventing duplicate document numbers during concurrent requests.
  - Exact Basis-Point Decimal Discount Parsing (`money.ts`): Eliminated `parseFloat` in `calculateDiscount`, standardizing on exact integer BigInt basis points (`parseScaledDecimal`).
  - Atomic Account Deletion (`account-service.ts`): Wrapped multi-table dependency checks and account removal inside an immediate transaction (`transaction.immediate()`).
  - Strict SQL Whitelisting & Parameterization (`revision-engine.ts`): Enforced header/line table whitelisting, column name sanitization (`/^[a-zA-Z0-9_]+$/`), and parameterized SQL values.
  - Draft Revision Status Collision Guard (`revision-engine.ts`): Fixed aliased `as status` lookup in draft detection query to prevent concurrent duplicate draft revisions.
  - Database WAL Checkpointing (`business.ts`): Added passive WAL checkpointing before closing SQLite connections to ensure clean state and avoid uncheckpointed WAL frames.
  - Financial Lock Error Boundary (`financial-lock-service.ts`): Refined catch block to only tolerate missing schema columns during baseline migrations, rethrowing real SQLite database exceptions.

- **Comprehensive Edge-Case & Stress Invariants Test Suite (`tests/comprehensive-edge-cases.test.ts`)**:
  - Expanded test coverage across 11 edge case categories:
    1. Precision money & discount boundary conditions ($0\%$, $100\%$, $0.01\%$, $19.99\%$, negative discount throws, fixed discounts capped at line totals, fractional micro quantities, zero quantity guards).
    2. Multi-currency split tax conversions with zero rounding drift ($baseTotalMinor \equiv baseSubtotalMinor + baseTaxMinor$).
    3. Payment terms due date leap year (Feb 29), month-end transitions, year roll-overs, and Net 30 calculations.
    4. SQL injection attack immunity with strict table/column whitelisting rejection.
    5. Unicode & Arabic string preservation and script tag safety in email token interpolation.
    6. Financial lock date boundary enforcement (strict rejection on or before lock date, clearance restoration).
    7. Account relational integrity enforcement guarding non-system configured accounts and system accounts from deletion.
    8. Document numbering auto-collision recovery detecting sequence gaps and advancing cleanly past existing rows.
    9. Multi-line mixed document double-entry general ledger balancing invariant down to the penny.
    10. Guided opening balances self-balancing equity offset integrity.
    11. Document revision lifecycle, active draft duplication guard, and clean rollback upon draft deletion.
  - Test suite status: 95/95 unit/integration assertions passing across 16 test suites; 58/58 Playwright end-to-end browser tests passing in Chromium. Zero TypeScript errors.


## Settings Hub, Business Profile, Localization & Numbering Overhaul (improvements-settings-v1)
- **Centralized Settings Hub (`/settings`)**:
  - Replaced flat unorganized settings grid with a categorized 4-section architecture:
    1. *Organization & Branding*: Business Profile, Organization Branding, Document Templates.
    2. *Financial & Accounting*: Chart of Accounts, Accounting Mappings, Tax Codes, UAE VAT Registration, Currency Rates, Realized FX.
    3. *Document Flow & Defaults*: Document Numbering Sequences, Form Defaults, Payment Terms.
    4. *System & Preferences*: Appearance & Theming, Electronic Invoicing (PINT-AE), Audit Log, Backup & Export.
  - Interactive live search bar to filter settings cards in real-time by name, tag, or description.
  - Company quick summary banner displaying Legal Name, Base Currency badge, VAT TRN badge, and Date Format.
- **Dedicated Business Profile & Branding (`/settings/business-profile`)**:
  - Created `businessProfile` table in database schema and Migration 25 (`business_profile_and_localization`).
  - Stores Legal Business Name, Trading Name, Company Registration Number, Tax ID / TRN, Contact Email, Phone, Website, Full Street Address, City, State/Emirate, Country, Postal Code, and Brand Logo URL.
  - Instant synchronization with core system business name (`businesses.name`), UAE VAT settings (`business_tax_settings.trn`), and electronic invoice settings (`business_einvoice_settings`).
  - Interactive live company letterhead preview card rendering the logo and formatted address in real time.
- **Regional & Localization Controls (`/settings/localization`)**:
  - Full control over date formatting: `DD/MM/YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`, and `DD MMM YYYY`.
  - Time formatting (12-hour AM/PM vs 24-hour military).
  - Financial Year Start Month configuration (January through December).
  - Extended core formatting engine (`src/core/format.ts`) to honor localized date formats across the ERP.
- **Complete 16-Sequence Document Numbering & Debit Note Fix (`/settings/numbering`)**:
  - Added full prefix, next number, and atomic padding configuration for all 16 document types in the ERP:
    - Sales: Sales Quotes, Sales Orders, Sales Invoices, Credit Notes, Delivery Notes, Customer Receipts.
    - Purchases: Purchase Quotes, Purchase Orders, Purchase Invoices, Debit Notes, Goods Receipts, Supplier Payments.
    - Inventory & Banking: Stock Adjustments, Bank Transfers, Bank Transactions, Manual Journals.
  - Fixed `debitNote` sequence allocation in `numbering-service.ts` so Debit Notes generate distinct `DN-XXXX` identifiers instead of sharing `purchaseInvoice` sequences.
  - Upgraded UI into 4 accordion category groups with real-time sequence preview badges (e.g. `INV-000042`).
- **Expanded Form Defaults & Manager.io Options (`/settings/form-defaults`)**:
  - Added form default support for Delivery Notes, Goods Receipts, and Stock Adjustments.
  - Added default payment terms days (`defaultPaymentTermsDays`) and Tax Code column toggle (`showTaxCode`).
  - Reorganized list page into categorized document groups.
- **Appearance & Modern Theme Studio (`/settings/appearance`)**:
  - Integrated theme switcher: Light, Dark, and System (auto-detect OS preference) using `next-themes`.
  - Table grid density settings (Compact, Default, Comfortable) hooked into table styling.
  - Interactive live preview card simulating invoices, status pills, and buttons.
- **PDF Template Integration & Customization Studio (`/settings/document-templates`)**:
  - Transformed the template editor into a responsive side-by-side Live Studio:
    - Left column: 5 categorized configuration tabs (*Style & Engine*, *Logo & Branding*, *Content & Details*, *Columns*, *HTML Source*).
    - Right column: Sticky Live Document Preview with real-time embedded PDF viewer, full-tab preview, and direct sample PDF download.
  - **New Minimal / Swiss Typography Template Engine (`minimal`)**:
    - Introduced an ultra-clean editorial layout featuring Swiss typography, subtle hairline rules, generous white space, and compact totals.
  - **Color Palette & Typography Controls**:
    - 7 curated one-click color palette presets (*Executive Navy*, *Modern Indigo*, *Corporate Slate*, *Emerald Green*, *Crimson Wine*, *Sleek Charcoal*, *Sky Blue*) + custom hex picker.
    - Font family selection (*Inter*, *Roboto*, *Open Sans*, *Lato*) and document density scaling (*Small/Compact*, *Normal*, *Large/Spacious*).
  - **Advanced Branding & Layout Controls**:
    - Logo positioning (*Left*, *Center*, *Right*) and sizing (*Small*, *Medium*, *Large*) with live upload/clear.
    - Full-width header and footer graphic banner support for official corporate stationery.
    - Remittance bank instructions & payment details editor (Bank Name, IBAN, SWIFT, Account Number) rendered cleanly on PDFs.
    - Authorized Signature & Company Stamp block with custom signature label and scanned signature/stamp image upload.
    - Document Watermark support (preset or custom text: *None*, *DRAFT*, *PAID*, *COPY*, *ORIGINAL*, *CONFIDENTIAL*).
    - Notes & Remarks and Terms & Conditions dynamically extracted from documents and formatted on PDFs.
    - Dynamic Page Numbering (`Page X of Y`) on multi-page PDF output.
    - Granular table column toggles: Tax/VAT, Discount, Project, Client TRN, Company address, Company TRN, Custom fields.
  - **Brand Inheritance Fallback (`template-service.ts`)**:
    - Unconfigured document types automatically inherit company logo, font family, color scheme, watermark, and footer notes from the primary sales-invoice template while allowing custom layout overrides.
- **Migration 26 & Debit Note Parity (`align_debit_note_lines_expense_account`)**:
  - Added Migration 26 to reconcile `debit_note_lines` column naming (`purchase_account_id` -> `expense_account_id`), ensuring complete alignment with purchase invoices and general ledger expense accounts.
  - Fixed `s.default_currency_code` resolution in `getDebitNote` to prevent SQLite runtime lookup errors.
- **Complete System Code Audit & Verification Suite (`tests/complete-system-audit.test.ts`)**:
  - Implemented end-to-end audit test suite covering:
    1. *Mathematical & Precision Invariants*: Currency minor unit conversions, 4-decimal quantity micros (`10_000` scale), line discounts, and UAE 5% VAT calculations.
    2. *Universal Double-Entry Bookkeeping Audit*: Asserts that every posted journal entry in the database has debits equal to credits with 0 imbalance, and trial balance matches.
    3. *Complete Sales Cycle*: Revision lifecycle (Rev 0 -> Rev 1 -> Rev 2), conversion to Sales Order, transformation to Sales Invoice, partial receipt allocation, and credit note issuance.
    4. *Complete Purchases Cycle*: RFQ -> Purchase Order -> Purchase Invoice -> Debit Note -> Supplier Payment settlement.
    5. *UAE FTA VAT Form 201 Return*: Multi-emirate reporting across 7 UAE Emirates with working papers reconciliation.
    6. *Multi-Format PDF Engine*: Buffer generation validation for Modern, Classic, and Minimal Swiss layouts.
  - Full suite expanded to 13 test suites (72 passing tests) alongside 27 passing Playwright browser E2E tests.
    - Unconfigured document types (Quotes, Orders, Delivery Notes, etc.) automatically inherit company branding from the primary invoice template, eliminating unbranded documents across the ERP.
  - **Rich Document Context in `pdf-service.ts`**:
    - All 10 supported document types now extract and supply full party address, TRN, contact email, phone, notes, terms, discounts, taxes, and status to the PDF generator.

## Commercial Document Entry, Table Layout, Versioning & Manager.io Options Sprint
- **Line Item Entry Horizontal Scroll Resolution**:
  - Eliminated the horizontal scrollbar bug in `DocumentLineTable` by removing rigid `min-w-max` (`min-width: max-content`) that expanded beyond the viewport.
  - Refined table column sizing to fluid proportional layout (`w-full`) with compact minimums (`Item`: `w-[18%] min-w-[130px]`, `Description`: `min-w-[140px]`, `Qty`: `w-20 min-w-[68px]`, `Rate`: `w-24 min-w-[80px]`, `Discount`: `w-32 min-w-[105px]`, `Account`: `w-[16%] min-w-[125px]`, `VAT`: `w-[12%] min-w-[95px]`, `Project`: `w-[14%] min-w-[105px]`).
  - Added `min-w-0` to table inputs, selects, and description cells so typing long descriptions never causes the table to horizontally overflow.
  - Streamlined `.line-item-table` CSS cell padding (`7px 8px`), row spacing (`0 6px`), and table styling in `src/app/globals.css`.
  - Replaced narrow `max-w-4xl` containers with `max-w-none` on `invoice-form.tsx`, `delivery-note-form.tsx`, `goods-receipt-form.tsx`, and `stock-adjustment-form.tsx`.
- **Manager.io-Inspired Document Options & Column Toggles**:
  - Redesigned `DocumentColumnToggles` into a modern options panel with `SlidersHorizontal` header and structured 2-column grid.
  - Added full support for toggling `Column · Tax code` (VAT) across all 8 commercial documents (`quote-form`, `sales-order-form`, `invoice-form`, `credit-note-form`, `purchase-quote-form`, `purchase-order-form`, `purchase-invoice-form`, `debit-note-form`).
  - When line tax codes are unticked, the VAT column is neatly hidden and default/global tax is applied via a hidden input, keeping tables uncluttered. When ticked, per-line tax code dropdowns are rendered.
  - Added user-facing `notes` and `terms` (Terms & Conditions) input fields to `invoice-form`, `quote-form`, `sales-order-form`, `purchase-quote-form`, `purchase-order-form`, and `purchase-invoice-form`.
- **Document Versioning & Revision Engine Fixes**:
  - Fixed SQLite column error in `deleteDraftRevision` (`src/core/versioning/revision-engine.ts`) where `document_status` was hardcoded; updated to use dynamic `statusCol` so deleting draft revisions on purchase orders (which use `status`) executes cleanly.
  - Fixed multi-currency unit price conversion across all 4 conversion actions (`sales-quotes/actions.ts`, `sales-orders/actions.ts`, `purchase-quotes/actions.ts`, `purchase-orders/actions.ts`): replaced hardcoded `/ 100` division with new `minorToDecimalString(unitPriceMinor, currencyCode, minorUnit)` helper in `src/core/format.ts` supporting 0-minor (JPY), 2-minor (AED, USD, EUR), and 3-minor (KWD, BHD, OMR) currencies.
- **Automated 1-Click Conversion Pipeline**:
  - Full end-to-end verification of Quotes -> Orders -> Invoices pipelines for both Sales and Purchases, including automatic status transitions (quotes marked accepted, orders marked completed/closed).
- **Comprehensive Quality Verification**:
  - TypeScript compilation: 0 errors (`npx tsc --noEmit`).
  - Unit & invariant tests: 57/57 passed (`npm test`).
  - Playwright E2E suites: 14/14 passed (`sales.spec.ts`, `purchases.spec.ts`, `purchases-workflow.spec.ts`, `eval-tax-vat.spec.ts`, `deep-workflow.spec.ts`).

## Table & Filter Bar Modernization Sprint (Verified & Standardized)
- **Visual Border & Grid Cleanliness**:
  - Removed arbitrary `box-shadow: inset -1px 0 0` on `.data-table th.sticky-col` and `td.sticky-col` in `globals.css` that was drawing harsh vertical hairline dividers down column 1 in half the app.
  - Standardized all 11 list tables to use clean borderless columns with subtle horizontal row dividers (`border-b border-border/40`) and smooth row hover transitions (`hover:bg-muted/40`).
- **Standardized Filter Toolbar (`src/components/list-toolbar.tsx`)**:
  - **`SearchInput`**: Replaced greedy `flex-1 min-w-[220px]` layout with dedicated responsive widths (`w-56 sm:w-64 md:w-72`) and added an instant `✕` clear button when search text is entered.
  - **`ToolbarSelect`**: Standardized to `h-9` height, consistent compact widths (`min-w-36 max-w-52`), and subtle active state highlighting (`border-primary/50 bg-primary/5 text-primary`) when a filter value is selected.
  - **`DateRangeFilter`**: Created unified, modern inline date range pill with `Calendar` icon, `From:` input, separator `—`, `To:` input, and an instant clear `✕` button, replacing disjointed raw `<input type="date">` boxes that broke onto 2 lines.
  - **`StatusFilterSelect`**: Standardized native select supporting both flat status lists and optgroup hierarchies (e.g. Document vs Payment).
  - **`ActiveFiltersRow`**: Standardized active filters chip row with `Active filters:` label, dismissible tags, and a `Reset all` button with rotate icon.
- **DataTable Polish (`src/components/ui/data-table.tsx`)**:
  - Upgraded empty state with a centered search icon, clear title, subtext, and a prominent "Clear filters" action button.
  - Enhanced column header sorting indicators with subtle hover transitions and active sort highlights.
- **11 Modules Fully Standardized**:
  - Standardized toolbar layout, active filters row, clearFilters, and borderless tables across Sales Quotes, Sales Orders, Sales Invoices, Sales Credit Notes, Purchase Quotes, Purchase Orders, Purchase Invoices, Debit Notes, Customers, Suppliers, and Projects without duplicate code.
- **Comprehensive Verification**:
  - Verified 100% type safety (`npx tsc --noEmit` = 0 errors).
  - Verified all 57 backend and invariant unit tests pass (`npm test`).
  - Verified all Playwright test suites pass (`sales.spec.ts`, `purchases.spec.ts`, `purchases-workflow.spec.ts`, `eval-ar-financial.spec.ts`, `eval-document-lifecycle.spec.ts`, `deep-workflow.spec.ts`, `deep-ui.spec.ts`).

## UX & Quality Polish Sprint (Verified & Standardized)
- **Financial Reports**:
  - Added dedicated `/reports/profit-loss` statement with categorized sales, other income, cost of sales, and operating expenses.
  - Added dedicated `/reports/balance-sheet` statement with Assets, Liabilities, and Equity (including automated Current Period Retained Earnings).
  - Extended `getTrialBalance` with `subtype` property and full TypeScript safety.
- **Enterprise CSV Export Engine**:
  - Added reusable `exportCsv` utility (`src/lib/export-csv.ts`) and `<ExportCsvButton>` component.
  - Hardened against CSV formula injection (OWASP recommendation: escaping `=+\-@\t\r` prefixes).
  - Deployed native CSV export to Bank Transactions, Profit & Loss, and Balance Sheet reports.
- **Interactive Overview KPI Drill-downs**:
  - All Overview KPI cards (`Posted Sales`, `Outstanding Receivables`, `Overdue`, `Bank & Cash`) now feature direct interactive drill-down links to filtered lists.
  - Added server-side status filtering (`overdue`, `unpaid`, `paid`, `draft`, `void`) to `listInvoicesPaginated` with allocation subqueries.
- **Customer Payment Terms & Auto Due Dates**:
  - Added `paymentTermsDays` and `creditLimitMinor` to `customers` and `suppliers` schema.
  - Added migration v23 (`add_customer_terms`) and migration v24 (`add_supplier_terms`) with safe PRAGMA column checks.
  - Customer Edit and View pages now fully preserve and display Payment Terms and Credit Limit.
  - Invoice Form automatically recalculates and sets the `dueDate` whenever the Customer or `invoiceDate` changes.
- **Chart of Accounts Code Deprecation Standardization**:
  - Completely purged all residual `code` queries across services (`exchange-rate.ts`, `currency-settings-form.tsx`, `bank-account-service.ts`, `purchase-invoice-service.ts`, `purchase-order-service.ts`, `purchase-quote-service.ts`, `sales-credit-notes/credit-note-service.ts`, `sales-invoices/invoice-service.ts`, `sales-orders/sales-order-service.ts`, `sales-quotes/quote-service.ts`, and test fixtures).
  - Standardized accounts ordering to `ORDER BY name`.
- **Bank Transactions Pagination**:
  - Implemented 100-rows-per-page pagination with URL search params persistence on `/reports/bank-transactions`.

## v2.4.1 - Universal Document Email System

### Email Capabilities Extended
- **Universal Email Action (`sendDocumentEmailAction`)**: Created a generic server action capable of handling emails for any commercial document (Sales Quotes, Sales Orders, Purchase Quotes, Purchase Orders, Sales Invoices).
- **PDF Generation Extracted**: Refactored the monolithic API-route PDF generation logic into a versatile `pdf-service.ts` (`generateDocumentPdf`), allowing server actions to effortlessly generate and attach high-fidelity PDFs.
- **Universal Composer Dialog**: Transformed `InvoiceEmailDialog` into `DocumentEmailDialog`, allowing Quotes and Orders to present a rich Email Compose modal with pre-filled default context (Subject, Client Email, Due Dates) without reinventing the UI.
- **View Action Wiring**: Injected the "Email" dropdown button dynamically across `SalesQuoteViewActions`, `SalesOrderViewActions`, `PurchaseQuoteViewActions`, and `PurchaseOrderViewActions`.
- **Database Schema Upgrades**: Appended `purchase_quote` and missing documents to the `sentEmailRelatedEntityTypes` schema Enum to correctly route Audit Logs and allow users to view sent email records per entity.


### Universal Revision Engine
- **Centralized Engine (`src/core/versioning/revision-engine.ts`)**: Extracted custom revision logic into a highly robust, database-transactional engine that supports any document with headers and lines.
- **Support for Orders**: Extended the `-R1`, `-R2` sequential revision numbering system to Sales Orders and Purchase Orders (e.g., `SO-XXXX-R1`, `PO-XXXX-R1`).
- **Draft Concurrency Locks**: Engine safely rejects simultaneous draft branching (locking a document from revisions if an unfinalized draft already exists).
- **Line & Custom Field Cloning**: Automatically carries forward all document lines, item foreign keys, descriptions, and dynamic `custom_field_values` seamlessly using schema-agnostic extraction.
- **Superseding State Verification**: When an order revision transitions out of `draft`, previous active orders automatically degrade to a `superseded` state, releasing the `is_latest_revision` flag securely.
- **Database Migrations (`order_revisions` Phase 21)**: Retroactively patched legacy `CHECK` constraints on `sales_orders.document_status` and `purchase_orders.status` to safely accept the `'superseded'` lifecycle stage.

### UI Reusability
- **Order Revision Switchers**: Built `OrderRevisionSwitcher` components for both Sales and Purchase orders mimicking the exact visual functionality of the Quote Revision Switchers (dropdown histories, superseded banners, etc).
- **Bug Fixes**: Removed deprecated `headers()` context usage in backend standalone testing and Next.js middleware deprecations.


## v2.3.0 â€” Purchase Quotes (RFQ) Module & Full Procurement Parity

### Purchase Quotes (Supplier Quotes / RFQ)
- **Full Procurement Parity**: Complete supplier quote lifecycle mirroring sales quotes: Purchase Quote (RFQ) $\rightarrow$ Purchase Order (PO) $\rightarrow$ Purchase Invoice (PI) $\rightarrow$ Supplier Payment / Debit Note.
- **Sequential Revision Numbering & Versioning**: Quotes allocate `PQ-XXXX` (`Rev 0`) and increment cleanly to `PQ-XXXX-R1`, `PQ-XXXX-R2`, etc.
- **Interactive Revision Switcher**: Built `PurchaseQuoteRevisionSwitcher` dropdown component displaying full family version history with statuses, dates, and amounts.
- **Superseded Alert Banner**: Automatic transition of prior issued quote versions to `superseded` when a new revision is created, with an alert banner and 1-click switcher.
- **One-Click Conversion (PQ $\rightarrow$ PO)**: "Convert to Order" action duplicates line items, carrying forward unit prices, fixed/percentage discounts, expense accounts, and tax codes into draft Purchase Orders, and auto-marks the quote as `accepted`.
- **Manager.io-Style Form Controls**: Full-width quote editor with bottom-left toggle controls (`amountsIncludeTax`, `showDiscounts`, `showLineNumber`, `showDescription`, `showLineProjects`).
- **Database Migration 19 (`purchase_quotes`)**: Added `purchase_quotes` and `purchase_quote_lines` tables, `purchase_quote_id` foreign key on `purchase_orders`, and `purchase_quote_prefix`/`next_number` in settings.
- **Sidebar & Settings Integration**: Added Purchase Quotes to the primary sidebar navigation (`/purchases/quotes`), Form Defaults settings (`/settings/form-defaults/purchase-quote`), PDF generation endpoint, and "New Purchase Quote" button on supplier details.

## v2.2.0 â€” Sales Quote Revisions, One-Click Conversions & Clean Architecture

### Sales Quote Revisions & Versioning
- **Sequential Revision Numbering**: Quotes start as `SQ-XXXX` (`Rev 0`) and increment cleanly to `SQ-XXXX-R1`, `SQ-XXXX-R2`, etc. when revised.
- **Quote Family State Management**: Creating a new revision automatically marks older active family versions as `superseded` (`is_latest_revision = false`) and opens the new revision in `draft` (`is_latest_revision = true`).
- **Interactive Revision Switcher**: Added `QuoteRevisionSwitcher` dropdown in document view headers to review version history, dates, and amounts with 1-click navigation.
- **Superseded Warning Banner**: Displays an alert banner on historical versions with a direct link to jump to the latest revision.
- **Quote List Badging**: Renders `Rev {n}` pill badges on multi-revision quotes in `/sales/quotes`.
- **Database Migration 18 (`sales_quote_revisions`)**: Added `base_quote_number`, `root_quote_id`, `revision_number`, `is_latest_revision` columns to `sales_quotes` and `"superseded"` status.

### One-Click Document Conversions & Status Automations
- **Sales Quote to Sales Order**: "Convert to Order" action duplicates line items, preserving discounts and tax configurations, updates quote status to `accepted`, and creates draft Sales Order.
- **Sales Order to Sales Invoice**: "Convert to Invoice" action maps orders into draft Sales Invoices with linked reference and marks order `completed`.
- **Purchase Order to Purchase Invoice**: "Convert to Invoice" action maps POs into draft Purchase Invoices and closes the purchase order.
- **Document Linking**: Linked `salesOrderId` and `salesQuoteId` through Drizzle schema, Zod validation, and SQL queries.

### Navigation & Architecture Streamlining
- **E-Invoicing Removal**: Removed outbound/inbound e-invoicing modules, routes, and `saxon-js` dependency.
- **Sidebar Restoration**: Restored missing navigation links for Receipts, Supplier Payments, Delivery Notes, Goods Receipts, and Debit Notes.
- **Form Defaults Sub-Pages**: Added `/settings/form-defaults/[formId]` page with toggle controls for amountsIncludeTax, showDiscounts, showLineNumber, and showDescription.
- **Mathematical Accuracy**: Ensured accurate decimal and micro scaling (`quantityMicrosToInput`, minor currency conversion) across document generation.

## v2.1.1

### Observability & Infrastructure
* **Sentry SDK Integration**: Successfully instrumented @sentry/nextjs across the application boundaries (Edge, Node server, and Client). Added global-error.tsx boundary and withSentryConfig to track unhandled server and client exceptions to the cloud dashboard.
 â€” Deployment & sandbox-boot fixes (current release)

Fixes "there was a problem deploying the code" / blank sandbox preview, all verified with a full production-build simulation:

- **`"use client"` directive repaired** in `src/modules/currency/currency-settings-form.tsx` â€” it sat on line 2 after an import (inert), so `next build` failed with "importing a module that depends on `useState` into a React Server Component" while dev mode masked the error. The file now leads with the directive.
- **Build no longer requires `BETTER_AUTH_SECRET`**: `resolveBetterAuthSecret` now tolerates the `next build` phase (`NEXT_PHASE=phase-production-build`) with a warning; the value is re-resolved at every server boot, so nothing is baked into the deployed bundle. Real production boot still throws without a secret (unchanged guard).
- **`next.config.ts`**: added `output: "standalone"` (container deployment entry `server.js`) and an optional `NEXT_DIST_DIR` override used to validate builds without touching the running dev server's `.next`.
- **`db:push` npm script restored** (aliases the explicit migration runner) â€” the sandbox boot/deploy scripts run it before starting anything; when it was missing, both the live preview and the publish pipeline aborted.
- **`db:bootstrap` npm script added** (migrate + seed in one shot) for clean checkouts.
- **`.env`** now carries a generated `BETTER_AUTH_SECRET` (plus `BETTER_AUTH_URL`) so builds and local runs sign sessions with a real key; `.env.example` documents both.
- Verified end-to-end: `next build` compiles clean (exit 0), the standalone `server.js` boots with the packaged `data/` directory, `/login` returns 200 with the download affordance, and `POST /api/auth/sign-in/email` authenticates `admin@demo.local` against the bundled database.

## v2.1.0 â€” Packaging & Documentation

- Version bumped to `2.1.0` in `package.json`.
- Added this changelog and a source-archive download affordance (see "Applying this archive" below).
- `README.md` and `docs/CURRENT_STATE.md` refreshed to match the shipped code.

## Wave 1 â€” Port & Hardening (Phases Aâ€“B)

- **Runtime port**: the app runs on bun as package manager with Node 24 executing scripts (single Next.js 16 app, no Docker/Compose).
- **P0 crash fix â€” FormError infinite recursion**: the shared error banner rendered itself recursively, crashing every server-action error path including failed login. Rewritten as a simple conditional paragraph.
- **Server-side rate limiting wired into better-auth**: `before`/`after` hooks enforce a per-IP failed-attempt limiter on `/sign-in/email`; built-in `rateLimit` covers all auth endpoints (10 sign-in attempts / 15 min, 100 requests / min elsewhere). The unauthenticated `preLoginCheck`/`clearLoginAttempts` actions were removed; client IPs resolve from the least-spoofable (rightmost) `x-forwarded-for` entry.
- **Custom-HTML template hardening**: Administrator-only; Puppeteer lazily imported; page requests intercepted so templates render fully offline.
- **Appearance settings validation** moved to a Zod enum (no trusting client-provided values).
- **Broken `compose.prod.yaml` removed** (dev-secret fallback risk).
- **Portable structural tests**: `middleware-exists` guards rewritten from Windows `findstr`/`where` to Node `fs` checks.
- **Connection-pool eviction safety**: 32-handle cap, 5-minute idle close, LRU eviction only for handles idle â‰¥ 10 s.

## Wave 2 â€” Code Health & Deduplication (Phase C)

- **Single shared document schema**: `src/core/validation/document-schemas.ts` is the one source of money/quantity Zod schemas, wired into all six document input files.
- **Dead code removed**: 12 unused imports in receipt/supplier-payment services, 4 unused `next/link` imports, dead `validateCurrency`, dead template-editor loading state, unused `allowPublic` API-auth option.
- **Shared UI primitives adopted across ~26 files**: `StatusBadge`/`statusLabel` (replaced 13 inline tone maps), `EmptyState` (replaced 16 hand-rolled blocks), `ListToolbar`/`SearchInput`/`ToolbarSelect`.
- **Multi-currency `/100` bug fixed**: line editors and live previews use each currency's configured minor-unit exponent; all form preview calculators share the server's exact money engine, so previews equal posted journal amounts for 3-decimal currencies (KWD) too.

## Wave 3 â€” Honest UX (Phase D)

- **Real Ctrl/Cmd+K command palette**: 16 module-filtered navigation commands + 5 create actions; keyboard navigation, filtering, Escape/close behavior.
- **Real Help dialog** replacing the disabled placeholder.
- **Honest overview**: fake "Recent Activity" panel and misleading invoice "Created by" block removed; archive actions confirm before destructive changes.

## Wave 4 â€” Customizability (Phase E)

- **Custom Fields engine** (business migration 13): per-business definitions (text/number/date/select/checkbox; required + show-in-list flags) managed under Settings â†’ Custom Fields, with atomic saves inside entity transactions.
- **Custom Fields on customers & suppliers**: forms, list columns, view pages.
- **Custom Fields on sales invoices**: form section, list columns (visible in the Columns menu), view page card.
- **Custom Fields on PDFs**: per-template settings toggle; values render in both Modern and Classic react-pdf layouts.
- **Persisted column visibility** via a hydration-safe `useColumnVisibility` hook.
- **Configurable overview**: URL-driven date range with presets, per-card show/hide toggles, honest "as of today" captions.

## Wave 5 â€” Test & Docs wiring (Phase F)

- `tests/custom-fields.test.ts` wired into `bun run test`; `--test-force-exit` prevents hangs after the suite completes.
- Final full QA pass (browser-verified end-to-end flows, mobile 390Ã—844 spot checks).

## Review rounds 1â€“7 (scheduled QA + feature rounds)

### review-1
- Mobile palette trigger button in the app header; Custom Fields extended to sales invoices; KPI card styling polish (tinted icon badges, tooltips, sticky table headers, tap feedback).

### review-2 / review-3
- Turbopack parse-error fix on the invoice form page.
- Custom Fields rendered on Sales Invoice **PDFs** (template-settings toggle, Modern + Classic layouts) â€” verified end-to-end through the PDF viewer.
- Custom Fields card styling normalized across invoice/customer/supplier view pages.

### review-4
- **Per-account server-side preferences** end-to-end: system DB migration v3 (`user_preferences`), GET/PUT/DELETE API (`/api/businesses/[businessId]/preferences`), server action, Settings â†’ Preferences page with reset-to-defaults, debounced PUT hook with localStorage fallback.
- **Server-side pagination** on the sales-invoices list: `listInvoicesPaginated` + count helper, LIMIT/OFFSET, URL-driven `?page`, shared `<ListPagination>` component.

### review-5
- Pagination extended to purchase invoices, receipts, and supplier payments; **page-size selector** (25/50/100/200) in `<ListPagination>`.
- **`<ListDateFilter>`** reusable component (calendar inputs, 4 presets, Clear, URL-driven `?from`/`?to`, debounced commit) wired into all four paginated lists.
- Server-side preferences extended to the suppliers list and purchase-invoices table (Columns dropdown, inactive-row dimming, Clear filters).

### review-6
- **Email delivery end-to-end** (business migration 14, `sent_emails` table): service + pluggable driver interface (log driver default, SMTP-ready) + invoice email template (HTML + text) + `sendInvoiceEmailAction` with generated PDF attachment + compose modal on invoice view + Sent Emails list/view pages + nav entry + overview "Recent Emails" widget.

### review-7
- **Server-side pagination on customers + suppliers** (Drizzle `.limit().offset()` + count helpers) â€” every major list table is now URL-paginated.
- **Responsive command palette**: mobile bottom-sheet dialog + floating action button (safe-area aware, 44 px touch targets); desktop top-centered card.
- **Overview date-range server preference**: server snapshot seeds the URL on fresh navigation; changes PUT to the preferences API (debounced 600 ms) with localStorage as fast-cache mirror.
- Styling polish: Filter-button consistency, double-border removal in customer/supplier tables, normalized in-table empty states.

## Manager.io Architecture Refactor

- **Global Math Engine Refactor**: Updated line-level calculations to support Manager.io-style mechanics (dynamic Discount subtractions as percentage/fixed, and complex tax inclusivity splitting via mountsIncludeTax).
- **Core Form UI Remodel**: Overhauled Sales Invoices, Credit Notes, Purchase Orders, and Purchase Invoices forms to a full-width tabular experience mimicking Manager.io. Added a global Default Tax selector, bottom-left line toggles (showDescription, showLineNumber, showDiscounts), and dynamic amount/tax columns driven by the mountsIncludeTax state.
- **New Modules (Sales Quotes & Orders)**: Cloned and fully spun up Sales Quotes and Sales Orders modules, including DB schemas, tracking preferences in usinessSettings, NumberKind registrations, and full TS integration.
- **Enhanced PDF Generation Engine**: Added support for configuring full-width headerImageUrl and ooterImageUrl banners in Template Settings. Modern and Classic PDF layouts now dynamically render Discount and Tax columns if they are utilized on the specific form. Added Sales Quotes and Sales Orders to the PDF service.
- **Strict Type Safety**: Deep codebase scrub enforcing documentStatus typing (draft | sent | accepted | rejected | cancelled vs issued | closed) and SQL schema exactness across all clones, achieving 0 errors on un run typecheck.

## Applying this archive to a new branch

1. Unzip into your repository worktree on a new branch.
2. Install dependencies: `bun install`.
3. Copy `.env.example` â†’ `.env`, set `BETTER_AUTH_SECRET` (any long random value; required whenever `NODE_ENV` is not `development`), and optionally `ERP_DATA_DIR` (defaults to `./data`).
4. Initialize databases: `bun run db:migrate && bun run db:seed` (or `bun run db:bootstrap` for both).
5. Run the dev server: `bun run dev` â†’ http://localhost:3000.
6. Verify: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run db:check`.

Seeded demo accounts: `admin@demo.local / demo12345` (all modules) and `standard@demo.local / demo12345` (Sales + Projects only).

Runtime data (SQLite databases, attachments) lives under `data/` and is created by the migrate/seed scripts; it is intentionally absent from this archive. The `public/downloads/` folder is a delivery artifact for the hosted preview and can be deleted safely â€” the login page download link auto-hides when the archive file is not present.


## Modern Chart of Accounts & Dashboard Overhaul (2026-09-30)

### Remove Account Codes — Full Stack Elimination
Following the modern accounting software industry standard (e.g., Xero, FreeAgent), account codes have been fully removed from the system. They were replaced with name-based sorting and display.

- **Database Schema** (`business-schema.ts`): Dropped `code: text("code").notNull()` field and `uniqueIndex("account_code_idx")` from the `accounts` table.
- **DB Migration v22** (`business-migrations.ts`): Safe idempotent migration using `PRAGMA table_info(accounts)` guard before executing `ALTER TABLE accounts DROP COLUMN code`. Runs automatically on next server start for all existing business databases.
- **Account Validation** (`account-input.ts`): Removed `code` field from `accountInputSchema` Zod schema entirely. Accounts are now validated only by name, type, subtype, and isActive.
- **Account Service** (`account-service.ts`): Changed `ORDER BY code` to `ORDER BY name`; removed all code insert/update/UNIQUE-conflict handling.
- **Chart of Accounts UI** (`account-manager.tsx`): Removed "Code" column from the accounts table, removed Code input field from the create/edit dialog.
- **All Form Pages** (20+ files across sales, purchases, banking, settings): Fixed `AccountOption` type definitions from `{ id, code, name }` to `{ id, name }`. Removed all account code JSX interpolation and SQL references.
- **Banking Service** (`bank-account-service.ts`): Removed `ledger_code` from `BankAccountRow` type; removed `ba.account_code` from SELECT queries; fixed `listBankLedgerOptions` return type.
- **Banking Detail Views**: Replaced `account.ledger_code` references with `account.ledger_name`.
- **Document Detail Views** (invoices, orders, quotes, credit notes): Replaced code-prefixed account display with name-only.
- **Tax Codes Manager**: Removed `code: string` from account prop types; removed code prefixes from account display.

### Dashboard Overview Modernized
- Replaced the `ManagerSummary` module-directory grid on the Overview page with the `FinancialSummary` component (Balance Sheet + P&L at-a-glance).
- Overview page now shows: KPI cards -> Financial Summary (Balance Sheet / P&L) -> Recent Invoices -> Recent Emails.
- Removed `getDashboardCounts` import from overview page (no longer needed there).


## 2026-10-26 — Verified release, operational access and current documentation

- Application release `32df273e5eeecec3db15f95bd8ba8d0f1cc1cd93` merged/deployed through the protected PR and native ARM64 image pipeline. Source/browser/image gates, immutable digest promotion, serialized snapshot/migration/recovery and public revision verification are active.
- Deployed shared mutation permissions and restricted financial reads, configured production origins, payroll lifecycle and financial calculation/reconciliation fixes, private runtime secrets, non-root image controls and real Chromium/WAL recovery checks. See [implementation evidence](HARDENING_OUTCOME_2026-10-26.md).
- Historical release validation passed 345 unit/integration tests, five isolated browser scenarios and eight deployment recovery scenarios. These were not rerun for the documentation-only follow-up.
- Owner-approved OCI API-only user/read-only policy and local profile ERP_OPERATIONS passed 13 read-only checks with zero failures. Read-only Sentry access verified the project, historical events and existing monitors/workflow. Keys/tokens remain outside Git and production.
- Updated README/current state/product context to Node 22/npm and the small closed rollout. Consolidated the dossier at the repository root; the docs copy is a compatibility link. Updated runbook/skill, evidence status and [next steps](NEXT_STEPS.md).
- Repository remains public; tracked real-data backup cleanup and additional hardening/backlog remain owner-deferred. Remaining verification includes settled OCI entitlement and current-release Sentry ingestion/source maps/delivery. No reboot, new monitoring automation or deployment was performed by this documentation follow-up.


## 2026-10-26 — Isolated acceptance testing and repository organization

- Passed 341 synthetic service/regression checks and eleven production-build browser scenarios covering access/action denial, sales/purchase settlement, payroll and keyboard/mobile/PDF behavior. Real Manager import fixtures were excluded from this round.
- Added per-process service isolation, an isolated default browser suite, shared role-session reuse and current workflow selectors. The local CI change runs the expanded browser suite and collects its failure evidence.
- Moved historical records to docs/history, old generated screenshots to ignored test output, and unused ZIP/Bun lock/inactive caches to ignored local archive. Existing business data and real Manager backups remain intact; quarantine does not reclaim disk space.
- Updated [flow verification and cleanup evidence](FLOW_VERIFICATION_AND_CLEANUP_2026-10-26.md). Changes remain local and undeployed; optional hardening remains deferred.
