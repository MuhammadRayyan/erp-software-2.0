# Phase 0 Implementation Plan

## Purpose

Build a fast, attractive, working product shell that proves the architecture and core UX.

Phase 0 is **not** the accounting engine.
Do not implement ledger posting, VAT logic, inventory valuation, bank feeds, UAE e-invoicing,
production deployment, full permissions, or full automated test suites.

Do not stop to test after every task.
Implement the complete phase first, then run the single verification section at the end.

Keep implementation easy for Codex to read:
- small modules
- descriptive names
- no giant generic framework
- no unnecessary repository layers
- no speculative abstractions

---

## Research-Based UI Decisions

These decisions are intentional.

### 1. Saved documents need a strong view page

Manager.io clearly separates editing a transaction from viewing the finished form, and its
workflow exposes document-oriented actions from the saved record.

Zoho Books exposes actions around a saved invoice such as edit, email, print/download,
clone, credit note, journal entry, and related operations.

Xero uses a draft/approval/send lifecycle and exposes actions after an invoice exists.

Odoo treats invoice creation, confirmation/posting, sending, payment, reconciliation,
and reporting as distinct stages.

Therefore our standard transaction flow is:

```text
List
 -> New (full page)
 -> Save
 -> View
 -> Edit (full page)
```

The View page is the action center.

### 2. Major transactions are not dialogs

`New Invoice`, `Edit Invoice`, `New Quote`, `New Purchase Invoice`, etc. must be routes/pages.

Dialogs are reserved for:
- delete confirmation
- rename
- tiny configuration
- quick choice/picker
- email/send form later if compact
- print/PDF options if compact

This avoids cramped forms and supports deep links, browser navigation, responsive layout,
future custom fields, and future document-specific settings.

### 3. Keep list screens dense

QuickBooks and Xero both keep high-value invoice status/amount information directly in
invoice lists. Manager also favors dense record lists.

Our lists should emphasize:
- number
- customer/supplier
- dates
- total
- amount/balance when relevant
- status
- row actions

Avoid dashboard-card design on normal data pages.

### 4. Theme should reduce visual fatigue

Use tinted page backgrounds and clear surface hierarchy instead of a pure-white canvas.
Dark mode uses deep charcoal/slate rather than black.

Tailwind supports manual/system dark-mode selectors.
shadcn/Radix gives us accessible menus, dialogs, focus management, and keyboard behavior.

### 5. Responsive means adaptive, not a mobile clone

Desktop is the primary workflow.
Small screens still need usable:
- business switching
- navigation drawer
- search
- filters
- primary actions
- forms
- horizontally scrollable tables

Do not spend Phase 0 building a unique mobile app.

---

# 0.1 Repository and Docker Development

## Build

Initialize:
- Next.js App Router
- TypeScript
- pnpm
- Tailwind
- shadcn/ui

Add only the packages needed by this phase:
- lucide-react
- drizzle-orm
- drizzle-kit
- better-sqlite3
- zod
- react-hook-form
- @hookform/resolvers
- @tanstack/react-table
- Better Auth packages required for the chosen integration
- next-themes or a tiny equivalent theme provider
- dnd-kit packages needed for template prototype
- pdfme packages needed for designer prototype

Use latest stable packages at initialization and commit `pnpm-lock.yaml`.

## Docker

Create:
- `Dockerfile.dev`
- `compose.yaml`
- `.dockerignore`

Development service:
- Node LTS image
- working directory `/app`
- app port 3000
- persistent `/app/data`
- run `pnpm dev`
- use Compose Watch for source synchronization
- ignore `.next`, `node_modules`, `.git`, and `data`

Preferred command:

```bash
docker compose up --watch
```

Do not create a production Dockerfile unless it is trivial and does not delay Phase 0.

Hot reload is a hard requirement.

---

# 0.2 Minimal Source Structure

Use this as a guide, not an excuse to create empty folders.

```text
src/
  app/
    (auth)/
    businesses/
    b/[businessId]/
  components/
    app-shell/
    ui/
  core/
    auth/
    db/
    businesses/
    permissions/
    theme/
  modules/
    customers/
    sales-invoices/
    document-templates/
```

Rules:
- feature-specific components remain inside their feature where practical;
- shared `components/ui` is primarily shadcn;
- no `utils.ts` dumping ground;
- no file should become a 1,000-line application;
- split by meaningful responsibility, not every 20 lines.

---

# 0.3 Global Theme

Implement `docs/THEME.md`.

Required:
- light / dark / system switch
- semantic CSS variables
- non-glare light background
- non-black dark background
- blue primary accent
- visible focus states
- compact density
- restrained shadows
- clear status colors
- responsive sizing

Add the theme switch to the user/account menu, not as a giant header control.

---

# 0.4 Authentication Shell

Implement simple email/password authentication.

Routes:

```text
/login
/logout
```

First-run developer experience may create/seed a demo admin account.

Login layout:

```text
┌──────────────────────────────────────────────────────────┐
│                                                        │
│   ERP BRAND                 Welcome back                │
│   Simple accounting        Email                       │
│   for real businesses.     [____________________]      │
│                            Password                    │
│                            [____________________]      │
│                                                        │
│                            [ Sign in ]                 │
│                                                        │
└──────────────────────────────────────────────────────────┘
```

Desktop may use a subtle split layout.
Mobile becomes a single centered form.

Do not build signup/billing/onboarding in Phase 0.

---

# 0.5 Business Selection

Route:

```text
/businesses
```

Page:

```text
My Businesses                         [Import] [+ New Business]

[ Search businesses... ]

┌─────────────────────────────────────────────────────────┐
│ ★ ABC Technical Services LLC                    Open → │
│   UAE · AED · Last opened today                     ⋮ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│   XYZ Automotive LLC                           Open → │
│   UAE · AED · Last opened yesterday                 ⋮ │
└─────────────────────────────────────────────────────────┘
```

Overflow menu:
- Open
- Rename
- Backup
- Duplicate (can be disabled/placeholder if needed)
- Archive
- Delete

Do not show six permanent buttons on each row/card.

New Business is a full page:

```text
/businesses/new
```

Fields:
- business name
- country (default United Arab Emirates)
- currency (default AED)
- financial year start month

On save:
1. create business registry entry in system DB;
2. create isolated business directory;
3. create/migrate business SQLite;
4. redirect into that business.

---

# 0.6 Business Data Isolation

Create:

```text
data/system/system.sqlite
data/businesses/<id>/business.sqlite
data/businesses/<id>/attachments/
```

System database minimally stores:
- user
- account/workspace
- business registry
- business membership/access

Create a small business DB resolver/service:

```text
getBusinessDb(businessId, userId)
```

It must:
1. verify user has business access;
2. resolve the business DB path from trusted registry data;
3. open/reuse that SQLite connection.

Never accept a database file path directly from URL/user input.

Use WAL for active business DBs.

Keep connection management simple for Phase 0.

---

# 0.7 Application Shell

Business routes use:

```text
/b/[businessId]/...
```

Desktop layout:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Business Name ▾                 Search / ⌘K          Help  User ▾   │
├───────────────┬──────────────────────────────────────────────────────┤
│ Overview      │                                                      │
│               │                                                      │
│ SALES         │                  PAGE CONTENT                        │
│ Customers     │                                                      │
│ Quotes        │                                                      │
│ Invoices      │                                                      │
│               │                                                      │
│ PURCHASES     │                                                      │
│ Suppliers     │                                                      │
│ Orders        │                                                      │
│ Bills         │                                                      │
│               │                                                      │
│ BANKING       │                                                      │
│ Bank Accounts │                                                      │
│               │                                                      │
│ PROJECTS      │                                                      │
│ Projects      │                                                      │
│               │                                                      │
│ REPORTS       │                                                      │
│ Reports       │                                                      │
│               │                                                      │
│ Settings      │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
```

For Phase 0:
- implemented pages can be real;
- future modules may route to tasteful "Coming later" placeholders;
- do not add every future feature to navigation.

Mobile:
- top bar
- navigation button opens a left sheet
- current business remains visible
- primary page action remains visible

---

# 0.8 Overview Page

Route:

```text
/b/[businessId]/overview
```

Keep it pleasant but not overbuilt.

Use four compact summary cards with demo/prototype data:

```text
Sales
Purchases
Outstanding Receivables
Bank Balance
```

Then:
- Recent Invoices table
- Recent Activity list

Optional small chart only if it can be implemented quickly.

Do not build a customizable dashboard system.

---

# 0.9 Customers Prototype

Routes:

```text
/b/[businessId]/customers
/b/[businessId]/customers/new
/b/[businessId]/customers/[customerId]
/b/[businessId]/customers/[customerId]/edit
```

Implement minimal customer fields:
- name
- email
- phone
- TRN/reference optional

Use real business DB persistence.

List page:

```text
Customers                                      [+ New Customer]

[Search...]                         [Filter] [Columns]

Name                 Email                    Phone          Status
ABC Trading          accounts@...             ...            Active
```

New/edit is a full page.

View page has:
- customer heading
- contact information
- edit action
- placeholder related invoices section

---

# 0.10 Sales Invoice Prototype

This is a UX/architecture prototype, not an accounting posting engine.

Routes:

```text
/b/[businessId]/sales/invoices
/b/[businessId]/sales/invoices/new
/b/[businessId]/sales/invoices/[invoiceId]
/b/[businessId]/sales/invoices/[invoiceId]/edit
```

Implement minimal relational storage:
- invoice header
- invoice lines
- link to customer
- status: draft / sent / partial / paid / overdue (prototype states)
- totals calculated for the prototype
- no general-ledger posting

## Invoice List

```text
Sales Invoices                                   [+ New Invoice]

[ Search invoices... ]                [Filter] [Columns]

Invoice      Customer       Date       Due        Total       Status
INV-0001     ABC Trading    08 Aug     22 Aug     12,400      Draft
```

Use row click to open the invoice.
Use `⋮` only for a few quick actions.

## New Invoice Full Page

Header:

```text
New Sales Invoice
```

Main form:

```text
Customer             Invoice Date        Due Date
[______________]     [___________]       [___________]

Reference             Project (future)
[______________]     [______________]
```

Line table:

```text
Item/Description               Qty       Rate       VAT       Amount
[____________________]         [1]       [0.00]     [5%]      0.00
```

Allow:
- add line
- remove line
- keyboard-friendly tab order

Totals on lower right:
- subtotal
- VAT
- total

Bottom actions:

```text
[Cancel]                         [Save Draft] [Save]
```

No popup.

After save, redirect to View page.

## Invoice View Page

This is a core design pattern.

```text
← Sales Invoices

INV-0001        [Draft]

ABC Trading
08 Aug 2026
AED 12,400

                         [Edit] [Email] [Print/PDF] [More ▾]

────────────────────────────────────────────────────────────

Bill To
ABC Trading
...

Items
...

                                      Subtotal
                                      VAT
                                      Total

────────────────────────────────────────────────────────────
Activity
Created by ...
```

`Email` may be a non-sending prototype action/toast in Phase 0.
`Print/PDF` should open a useful preview or use the template prototype where possible.

More menu can contain:
- Duplicate (placeholder allowed)
- Mark status (prototype only if easy)
- Delete

## Invoice Edit

Same full-page form as New, prefilled.

After save, return to View page.

Do not mix View and Edit states into one permanently editable screen.

---

# 0.11 Simple Permissions

Phase 0 roles:
- Administrator
- Standard User

For Standard User, support module toggles such as:
- Sales
- Purchases
- Banking
- Projects
- Reports
- Settings

The important behavior:
**unavailable modules disappear from navigation**.

No deep permission matrix yet.

A simple user/business access screen may live under:

```text
/b/[businessId]/settings/users
```

Do not build invite-email infrastructure if it slows the phase.
A local create/assign prototype is sufficient.

---

# 0.12 Backup / Import Prototype

Export a single business package.

Use a custom extension such as:

```text
my-business.erpbackup
```

It may be a ZIP containing:

```text
manifest.json
business.sqlite
attachments/
```

Manifest minimally includes:
- format version
- application version
- original business name
- export timestamp

Import route/action from `/businesses`.

On import:
- validate package shape
- create a new internal business ID
- create a new directory
- restore DB and attachments
- register the imported business
- do not overwrite an existing business by ID

Do not implement encryption or cloud backups in Phase 0.

---

# 0.13 PDF Template Designer Proof of Concept

Route:

```text
/b/[businessId]/settings/document-templates
```

Only prove one Invoice template.

Suggested layout:

```text
┌──────────────┬──────────────────────────────────┬──────────────────┐
│ FIELDS       │          PAGE CANVAS             │ PROPERTIES       │
│              │                                  │                  │
│ Company      │      [Logo]           INVOICE    │ Selected field   │
│ Customer     │                                  │ X / Y            │
│ Invoice No   │      Customer: [...]             │ Width / Height   │
│ Date         │                                  │ Font             │
│ Items Table  │      [Items table ........]      │ Alignment        │
│ Totals       │                                  │                  │
│ Custom Text  │                       Total ...  │                  │
└──────────────┴──────────────────────────────────┴──────────────────┘
```

Phase 0 requirements:
- open designer
- move at least basic text fields
- save template JSON in business DB
- reopen and preserve layout
- preview with a sample invoice
- render multi-line items
- try a long invoice to judge pagination

Do not build the complete final editor.
Do not build custom-field placement here yet unless it is trivial.

If pdfme pagination/design is clearly unsuitable, document that finding rather than forcing it.

---

# 0.14 Responsive Rules for Phase 0

Apply to every implemented screen.

## >= desktop

- expanded sidebar
- one-line page toolbar where space permits
- wide tables
- invoice header fields in 2-3 columns
- line items remain table-like

## tablet

- collapsible/sidebar sheet
- toolbar may wrap
- forms reduce columns
- tables horizontally scroll

## small/mobile

- navigation in sheet
- page title and primary action remain clear
- search gets its own row if required
- secondary list controls can move to overflow
- invoice header becomes single column
- invoice lines may use horizontal scroll rather than awkward stacked cards in Phase 0

Do not hide core information purely to make screenshots look clean.

---

# 0.15 Error / Empty / Loading States

Every real Phase 0 list needs:
- loading state or skeleton
- empty state
- error message
- no-search-results state

Example empty invoice page:

```text
No sales invoices yet

Create your first invoice to start billing customers.

[+ New Invoice]
```

Keep empty states compact; no giant illustrations required.

---

# 0.16 Toasts and Confirmations

Use toast feedback for:
- saved
- updated
- backup created
- import completed
- theme/template saved

Use confirmation dialogs for:
- delete business
- delete invoice
- destructive irreversible actions

Never rely on a toast as the only place an error can be understood.

---

# 0.17 Final Phase 0 Verification — Run Only After Implementation

Do not interrupt implementation to execute this entire checklist repeatedly.

Run one final pass when all Phase 0 tasks are done.

## A. Startup / Hot Reload

1. `docker compose up --watch`
2. open `http://localhost:3000`
3. edit visible text in a TSX file
4. confirm browser updates without manual image rebuild/restart
5. edit a theme class/token and confirm visual refresh

PASS if the inner development loop feels fast.

## B. Authentication

1. sign in as demo admin
2. sign out
3. sign back in

PASS if protected business routes require auth.

## C. Business Isolation

1. create Business A
2. create Customer A
3. create Business B
4. confirm Customer A is absent in B
5. return to A and confirm Customer A exists
6. restart containers and confirm data remains

PASS only if the business data is isolated and persistent.

## D. Business UX

1. search businesses
2. create a business from the full page
3. switch businesses from the in-app switcher
4. test overflow menu
5. verify layout at desktop and narrow browser widths

## E. Theme

1. select Light
2. select Dark
3. select System
4. reload
5. verify tables/forms/dialogs are comfortable and readable

PASS if neither theme is harsh, washed out, or illegible.

## F. Invoice Workflow

1. open invoice list
2. click New Invoice
3. confirm it is a full page
4. create invoice with several lines
5. save
6. confirm redirect to invoice View page
7. use Edit
8. change value and save
9. return to View
10. trigger Print/PDF preview
11. trigger Email placeholder/action
12. inspect status and action hierarchy

PASS if the flow is clearly:
`List -> New -> View -> Edit -> View`.

## G. Responsive UX

Check:
- 1440px-ish desktop
- 1024px-ish laptop/tablet
- ~390px mobile viewport

Verify:
- no unusable clipped primary actions
- sidebar becomes usable drawer/sheet
- tables can scroll
- forms reflow
- primary action remains obvious

## H. Permissions

1. create/use Standard User
2. allow Sales and Projects only
3. confirm hidden modules are absent
4. confirm direct navigation to forbidden module is rejected

## I. Backup / Import

1. export Business A
2. import backup
3. confirm new business appears
4. open it
5. confirm customers/invoices are present
6. confirm original business remains untouched

## J. PDF Template Prototype

1. open invoice template
2. move fields
3. save
4. reload designer
5. confirm positions persist
6. preview short invoice
7. preview long invoice
8. record any pdfme limitations in a short comment/issue

---

# Phase 0 Done

Stop after Phase 0 verification.

Do not automatically continue into:
- accounting engine
- UAE VAT
- e-invoicing
- inventory
- bank reconciliation
- projects
- advanced permissions
- production deployment
- subscription billing

Report:
1. what was implemented;
2. any intentional deviations;
3. any PDF-engine issue;
4. any failed final verification item;
5. the next recommended step, without implementing it.

---

## Research References Used for UI Direction

These are product/design references, not code dependencies.

- Manager guides: https://www2.manager.io/guides
- Manager themes/custom form presentation: https://www2.manager.io/guides/10366
- QuickBooks Online invoice workflow: https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/create-invoices-quickbooks-online/L7gSzvCld_US_en_US
- Xero invoice creation/editing: https://central.xero.com/s/article/Invoice-a-customer
- Xero approve/send workflow: https://central.xero.com/s/article/Approve-and-send-a-customer-invoice
- Zoho Books invoice lifecycle/actions: https://www.zoho.com/en-fr/books/help/invoice/
- Odoo customer invoice lifecycle: https://www.odoo.com/documentation/17.0/applications/finance/accounting/customer_invoices.html
- Tailwind dark mode: https://tailwindcss.com/docs/dark-mode
- Tailwind responsive design: https://tailwindcss.com/docs/responsive-design
- Radix accessibility: https://www.radix-ui.com/primitives/docs/overview/accessibility
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Docker Compose Watch: https://docs.docker.com/compose/how-tos/file-watch/
- Next.js deployment/self-hosting: https://nextjs.org/docs/app/getting-started/deploying
