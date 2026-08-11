# Phase 3 — Projects + Operational Linking

## Purpose

Add a strong Project module on top of the completed accounting foundation.

Phase 3 should make Projects useful for technical services, contracting, consulting,
and future industry modules without turning the ERP into a full project-management suite.

Projects should connect real business activity:

```text
Customer
 -> Project
    -> Sales Quotes / Invoices
    -> Purchase Orders / Purchase Invoices
    -> Receipts / Payments
    -> Notes
    -> Attachments
    -> Revenue / Cost / Profitability
```

Do not add Inventory, task boards, timesheets, bank feeds, UAE e-invoicing,
advanced approvals, payroll, or production infrastructure in this phase.

Implement the whole phase first.
Run the final verification only after the phase is complete.

## 1. Phase 3 Outcome

At the end of Phase 3 the system should support:
- create/edit/view Projects;
- assign a customer to a Project;
- link sales and purchase documents to Projects;
- header-level Project with optional line-level override;
- derive Project revenue from posted sales;
- derive Project cost from posted purchases;
- derive gross profit and margin;
- show quoted, invoiced, collected, committed, purchased, and paid amounts where reliable;
- show Project activity and related documents;
- store Project notes and attachments;
- show a compact Project dashboard;
- filter relevant lists by Project.

Projects must not create journal entries by themselves.

## 2. Keep Existing Architecture

Continue the existing modular monolith and per-business SQLite architecture.

Do not add Redis, Postgres, queues, Playwright, a second backend, a plugin system,
or change the migration strategy.

Keep webpack hot reload and the existing pdfme pin.

## 3. Project Data Model

Add:
```text
projects
project_notes
```

Reuse the existing attachment abstraction for Project files.

Recommended Project fields:
```text
id
code
name
customer_id optional
status
description optional
start_date optional
target_end_date optional
actual_end_date optional
budget_revenue_minor optional
budget_cost_minor optional
manager_name optional
is_active
created_at
updated_at
```

Statuses:
```text
Draft
Active
On Hold
Completed
Cancelled
```

## 4. Project Numbering

Add simple configurable Project numbering:
```text
PRJ-00001
PRJ-00002
```

Manual override may be allowed if unique.

## 5. Routes

```text
/b/[businessId]/projects
/b/[businessId]/projects/new
/b/[businessId]/projects/[projectId]
/b/[businessId]/projects/[projectId]/edit
```

New/Edit are full pages.

## 6. Project List UI

```text
Projects                                         [+ New Project]

[Search projects...]                    [Filter] [Columns]

Project        Customer         Status       Revenue       Cost       Profit
PRJ-00012      ABC Trading      Active       120,000       78,000     42,000
```

Useful filters:
- Status
- Customer
- Start date
- End date
- Active / Completed

Keep optional metrics out of the default columns.

## 7. New Project Page

```text
New Project

Project Details
------------------------------------------------
Project Name
Project Code
Customer
Status
Start Date
Target End Date

Description

Budget
------------------------------------------------
Revenue Budget
Cost Budget

Optional
------------------------------------------------
Project Manager / Contact Name

[Cancel]                              [Create Project]
```

Redirect to Project View after creation.

## 8. Project View

Header:
```text
PRJ-00012
Dubai Villa Fit-Out

ABC Trading LLC
Active

[Edit] [New Invoice] [New Purchase Order] [More ▾]
```

Responsive actions:
- desktop shows key actions;
- smaller widths keep Edit + primary action;
- move secondary actions into More.

## 9. Project Summary Metrics

Compact metrics:
```text
Revenue       AED 120,000
Costs         AED 78,000
Gross Profit  AED 42,000
Margin        35.0%
```

Operational metrics:
```text
Quoted        AED 150,000
Invoiced      AED 120,000
Collected     AED 90,000
Outstanding   AED 30,000

PO Committed  AED 85,000
Purchased     AED 78,000
Paid          AED 60,000
```

Do not use oversized dashboard cards.

## 10. Profitability Definitions

Revenue:
```text
posted sales net amounts excluding VAT
```

Cost:
```text
posted purchase/expense net amounts excluding recoverable VAT
```

Gross Profit:
```text
Revenue - Cost
```

Margin:
```text
Gross Profit / Revenue * 100
```

Do not permanently store these derived totals unless later caching is necessary.

## 11. Project Assignment

Add optional `project_id` at document header to:
- Sales Invoice
- Sales Credit Note
- Purchase Order
- Purchase Invoice
- Sales Quote if already implemented cleanly

Header Project is the default for lines.

Add optional line-level Project override to:
- Sales Invoice Lines
- Sales Credit Note Lines
- Purchase Order Lines
- Purchase Invoice Lines

Example:
```text
Document Project = Project A

Line 1 -> Project A
Line 2 -> Project A
Line 3 -> Project B
```

Do not force a Project on every line.

## 12. Transaction Form UX

Header:
```text
Customer                 Project
[ABC Trading ▾]          [Dubai Villa ▾]
```

Do not show a Project column in line tables by default.

Expose line override through:
- optional Columns control; or
- a compact "Show Project per line" option.

Keep normal invoices uncluttered.

## 13. Journal Project Metadata

Projects do not create extra journal lines.

Add optional `project_id` to relevant journal lines.

Sales Invoice example:
```text
Accounts Receivable      Debit   10,500
Sales                    Credit  10,000   Project A
VAT Payable              Credit     500
```

Purchase Invoice:
```text
Expense Account          Debit   10,000   Project A
Input VAT                Debit      500
Accounts Payable         Credit  10,500
```

Project profitability should be based on tagged P&L journal lines.

Do not use VAT, AR, or AP control lines as the profitability source.

## 14. Authoritative Project Financial Source

Use:
```text
posted journal lines with project_id on Income/Expense accounts
```

This ensures:
- Credit Notes naturally reduce revenue;
- reposted edits stay correct;
- future manual Project journals can work;
- the GL remains the financial source of truth.

Operational metrics such as Quoted and PO Committed come from source documents.

## 15. Sales Credit Notes

When a Sales Credit Note is linked to Project A:
```text
Sales                    Debit   1,000   Project A
VAT Payable              Debit      50
Accounts Receivable      Credit  1,050
```

Project Revenue decreases automatically.

## 16. Purchase Order Commitment

Purchase Orders do not affect the ledger.

Project View should show:
```text
PO Committed
```

Phase 3 definition:
```text
net total of non-cancelled Purchase Order lines allocated to the Project
```

Do not build complex remaining-commitment logic yet.

## 17. Quoted Amount

If Sales Quotes already have real persisted data:
```text
Quoted = active/non-cancelled quote net amount allocated to Project
```

If Sales Quotes are still placeholders, add only minimal Project linkage and do not expand the phase.

## 18. Collected / Paid Metrics

Only show exact Project-level Collected/Paid amounts when allocation is reliable.

Simple rule:
- single-Project invoice -> receipt belongs to that Project;
- mixed-Project invoice -> do not invent a misleading split unless an explicit allocation method exists.

Revenue/Cost/Profit are higher priority than Collected/Paid precision in Phase 3.

## 19. Related Documents

Project View uses at most:
```text
Overview
Sales
Purchases
Activity
Files
```

Sales:
- Quotes
- Sales Invoices
- Sales Credit Notes
- attributable Receipts

Purchases:
- Purchase Orders
- Purchase Invoices
- attributable Supplier Payments

Each row links to the existing document View page.

## 20. Activity

Show a simple derived activity feed:
```text
09 Aug 2026
Sales Invoice INV-00023 posted
AED 10,500

08 Aug 2026
Purchase Invoice PI-00014 posted
AED 4,200

07 Aug 2026
Project note added
```

Reuse existing audit/activity foundations if available.

Do not build an event platform.

## 21. Notes

Add simple Project notes:
```text
id
project_id
body
created_by
created_at
updated_at optional
```

Textarea is enough.

## 22. Attachments

Reuse existing attachment storage.

Support:
- upload
- open/download
- delete with confirmation

No versioning yet.

## 23. Budget

Simple fields:
```text
Revenue Budget
Cost Budget
```

Project View:
```text
Revenue Budget     AED 150,000
Actual Revenue     AED 120,000
Variance           AED 30,000

Cost Budget        AED 90,000
Actual Cost        AED 78,000
Variance           AED 12,000
```

No budget line items or cost codes yet.

## 24. Customer View Integration

Add compact Projects section:
```text
Projects

PRJ-00012   Dubai Villa        Active       AED 42,000 profit
PRJ-00018   Office Upgrade     Completed    AED 18,000 profit
```

Add:
```text
[New Project]
```

with customer prefilled.

## 25. Sales/Purchase View Integration

Show linked Project as a clickable field on:
- Sales Invoice View
- Sales Credit Note View
- Purchase Order View
- Purchase Invoice View

If multiple Projects exist across lines, show a concise multiple-project indicator or list.

## 26. Filters

Add Project filter to:
- Sales Invoices
- Sales Credit Notes
- Purchase Orders
- Purchase Invoices

A document should match if its header or any relevant line belongs to the selected Project.

## 27. Project Profitability Report

Add:
```text
/b/[businessId]/reports/project-profitability
```

Columns:
```text
Project
Customer
Revenue
Cost
Gross Profit
Margin %
```

Filters:
- Date range
- Project status
- Customer

Use posted project-tagged P&L journal lines.

## 28. Migration

Use the existing explicit versioned business migration runner.

Migration should:
- add Projects;
- add Project Notes;
- add Project linkage fields;
- add nullable `project_id` to journal lines;
- add Project numbering/budget settings;
- preserve all Phase 0-2 data.

Do not infer Projects for existing historical records.

## 29. Posting Changes

Update posting functions so:
- Sales Invoice revenue lines carry Project;
- Sales Credit Note reversed revenue lines carry Project;
- Purchase Invoice expense lines carry Project.

If one document contains multiple Projects, preserve the split in generated journal lines.

Do not collapse lines in a way that loses Project granularity.

## 30. Validation

Customer-facing document rule:
- if Project belongs to Customer B, it cannot be selected on a document for Customer A.

Validate server-side.

Purchase documents can use any valid Project.

Project with financial/document references cannot be hard-deleted.

## 31. Errors

Business-readable errors:
```text
Project code already exists.
Cannot delete this project because it has related documents.
Selected project belongs to a different customer.
Project is cancelled.
```

Do not expose raw SQLite errors.

## 32. Responsive UX

Desktop-first.

Project View:
- compact metrics;
- responsive action collapse;
- horizontal scrolling for document tables;
- tabs/sections remain usable on mobile.

Do not create a separate mobile workflow.

## 33. Sidebar

Keep only:
```text
PROJECTS
Projects
```

Do not add Project Notes, Files, Dashboard, or Project Reports to sidebar.

## 34. Demo Data

Seed:
```text
Dubai Villa Fit-Out
  Customer: ABC Trading
  Active
  Revenue Budget: AED 150,000
  Cost Budget: AED 90,000

Office Upgrade
  Customer: Delta LLC
  Completed
```

Link a few existing sales/purchase documents.

Keep seed small.

## 35. Do Not Build in Phase 3

Defer:
```text
Tasks
Kanban
Timesheets
Employees
Resource Planning
Inventory
Warehouses
Goods Receipts
Delivery Notes
Stock Reservations
BOQ
Retention
Progress Claims
Variation Orders
Cost Codes
Subcontractor Management
Bank Reconciliation
Bank Feeds
UAE VAT Return
UAE E-Invoicing
Advanced Permissions
Approval Workflows
Branches
Payroll
Production Deployment
PostgreSQL
Playwright
```

## 36. Final Verification

Run once after full Phase 3 implementation.

### A. Baseline

1. `docker compose up --watch`
2. confirm hot refresh
3. run:
```bash
pnpm typecheck
pnpm lint
pnpm db:check
```

### B. Project Creation

Create:
```text
PRJ-00001
Dubai Villa
Customer: ABC Trading
Revenue Budget: AED 100,000
Cost Budget: AED 60,000
```

Confirm redirect to Project View.

### C. Sales Invoice Project Posting

Post:
```text
Customer: ABC Trading
Project: Dubai Villa
Net: AED 10,000
VAT: AED 500
Total: AED 10,500
```

Expected:
```text
Accounts Receivable   Debit  10,500
Sales                 Credit 10,000   Project Dubai Villa
VAT Payable           Credit    500
```

Confirm Project Revenue = AED 10,000.

### D. Purchase Invoice Project Posting

Post:
```text
Project: Dubai Villa
Net Cost: AED 4,000
VAT: AED 200
Total: AED 4,200
```

Expected:
```text
Expense               Debit   4,000   Project Dubai Villa
Input VAT             Debit     200
Accounts Payable      Credit  4,200
```

Confirm:
- Cost = AED 4,000
- Gross Profit = AED 6,000
- Margin = 60%

### E. Credit Note

Create Sales Credit Note:
```text
Project: Dubai Villa
Net: AED 1,000
VAT: AED 50
```

Confirm Project Revenue = AED 9,000 and Gross Profit = AED 5,000.

### F. Purchase Order

Create Project PO with net AED 7,500.

Confirm:
- PO Committed includes AED 7,500;
- GL unchanged.

### G. Mixed Project Lines

Create Projects A and B.

Post Sales Invoice:
- Line 1 -> Project A
- Line 2 -> Project B

Confirm journal preserves Project split and Trial Balance remains balanced.

### H. Project View

Confirm:
- Revenue
- Cost
- Gross Profit
- Margin
- Budget
- Sales documents
- Purchase documents
- Activity
- Notes
- Files

### I. Filters / Customer Integration

Confirm:
- Customer View shows related Projects;
- Sales Invoices filter by Project;
- Purchase Invoices filter by Project;
- Purchase Orders filter by Project.

### J. Profitability Report

Confirm project Revenue/Cost/Profit match tagged P&L journal lines.

### K. Notes / Files

Add note and attachment, reload, verify persistence, then delete attachment with confirmation.

### L. Delete Protection / Validation

- attempt delete Project with activity -> blocked;
- try Customer A invoice with Customer B Project -> rejected.

### M. Business Isolation

Create Project in Business A.
Switch to Business B.
Confirm absent.

### N. Responsive / Theme Regression

Check Project list and View in Light, Dark, desktop, and narrow/mobile viewport.

## Phase 3 Definition of Done

Phase 3 is complete when:
- Projects can be created and linked to customers;
- sales/purchase documents support header and optional line-level Project;
- posting preserves Project on P&L journal lines;
- Project Revenue/Cost/Profit derive correctly from ledger;
- Credit Notes reduce Project Revenue;
- Purchase Orders show commitment without GL impact;
- Project View shows useful linked documents and compact metrics;
- Notes and attachments work;
- Project Profitability report works;
- business isolation remains intact;
- Docker hot reload remains fast;
- final verification passes.

Stop after Phase 3.

Recommended next phase:
**Basic Inventory + Delivery/Goods Receipt flows**.
