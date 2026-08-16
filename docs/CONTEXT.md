# Product Context

## Product North Star

Build a modern accounting/ERP product that keeps the best qualities of Manager.io:
simplicity, compact screens, direct workflows, portable businesses, and optional modules.

Improve it with:
- stronger UI/UX
- responsive layouts
- multi-user and multi-business access
- clearer document lifecycle
- better project visibility
- customizable fields and layouts
- visual PDF/document templates
- clean audit-friendly architecture
- UAE-first localization later
- cloud hosting later without abandoning self-hosting

This is not an Odoo clone. Avoid enterprise complexity unless the product truly needs it.

## Target

- Mid-sized businesses
- Initially around 1,000 businesses across the hosted platform
- English first
- UAE first
- Responsive desktop-first UI
- Browser application only; no desktop app
- SaaS and self-hosted Docker should use the same product code

## Product Hierarchy

Keep the user-facing model simple:

```text
Platform
  -> Customer Account
      -> Businesses
          -> Users with business access
```

Do not show the word "tenant" in normal product UI.

The platform owner can later control:
- allowed number of businesses
- allowed number of users
- enabled licensed modules

A customer administrator can:
- create businesses within entitlement
- invite users
- grant users access to one or multiple businesses
- assign simple permissions

## Permissions Direction

Do not build deep ERP permissions now.

Phase 0 needs:
- Administrator
- Standard User
- module visibility/access toggles

Design storage so action permissions can be expanded later, but do not build field-level,
approval-chain, row-level, or complicated conditional permissions now.

If a module is unavailable to a user, hide it from navigation instead of showing disabled clutter.

## Architecture

Use a modular monolith.

```text
Browser
  -> Next.js application
      -> application/domain services
          -> system SQLite DB
          -> one SQLite DB per business
          -> local attachment storage abstraction
```

### System database

Stores platform/account-level information such as:
- users
- sessions
- customer account/workspace
- business registry
- business memberships/access
- simple permission assignments
- later: licenses/entitlements

### Business databases

Each business has an independent SQLite file.

Example:

```text
data/
  system/system.sqlite
  businesses/<business-id>/business.sqlite
  businesses/<business-id>/attachments/
```

Never put all businesses into one SQLite database.

Never use an active SQLite business database over a shared network filesystem.

## Data Access Rule

UI components do not issue arbitrary Drizzle writes.

Use small application services/functions:

```text
UI / Server Action
    -> service function
        -> validation
        -> database transaction
```

Keep the service layer simple. Do not create Java-style class hierarchies.

## Transaction UX

Core financial/business documents follow this pattern:

```text
List
 -> New full page
 -> Save
 -> View page
 -> Edit full page
```

The View page is a stable action hub.

Example invoice view actions:

```text
Edit
Print / PDF
Email
Record Payment (later)
Copy / Duplicate
More
```

This deliberately combines Manager.io's clear View/Edit distinction with modern
accounting products that keep send/print/clone/payment actions attached to the saved document.

Do not create invoices, quotes, purchase invoices, purchase orders, etc. in modal dialogs.

## Modules

Keep navigation grouped and uncluttered.

Target structure:

```text
Overview

Sales
  Customers
  Quotes
  Invoices

Purchases
  Suppliers
  Purchase Orders
  Purchase Invoices

Banking
  Bank Accounts

Projects
  Projects

Accounting
  Journal Entries

Reports
  Reports

Settings
```

Do not expose every possible sub-document in the sidebar.
Related actions can live inside document pages and contextual menus.

Later modules may include Civil Contracting, Automotive, and Technical Services.
They must reuse the common accounting/customer/project/document foundations.

## Projects Direction

Projects should eventually be richer than Manager.io without becoming project-management software.

A project can link:
- customer
- sales documents
- purchase documents
- expenses
- payments
- attachments
- notes
- accounting allocations

Later it should support project revenue, cost, budget, profitability, progress, and industry-specific features.

## Custom Fields Direction

Custom fields should eventually work on major records and documents.

Field configuration should be separable into:
- data definition
- form placement
- list/search visibility
- PDF/document placement

Edit-form placement should use a responsive grid.
PDF placement may use free positioning.

## PDF / Document Direction

The accounting record is the source of truth.
The PDF is only a rendered presentation.

Document templates should be stored as versionable JSON/schema data.

Document rendering relies on a hybrid `@react-pdf/renderer` and Puppeteer engine.
Do not deeply couple business data to rendering engine internals.

## Backup Direction

Users should experience one portable business backup file.

Internally it can package:
- business SQLite database
- attachments
- template assets/schema
- manifest/version/checksum metadata

Manager.io import is a later migration feature and should use a dedicated adapter.
Do not copy Manager's internal schema.

## UAE Direction

UAE VAT/e-invoicing is not Phase 0, but architecture must not block it.

Important future rule:
PDF output and structured e-invoice data are separate representations of the same invoice.

English first. Arabic/RTL comes later, so avoid UI assumptions that make RTL impossible.

## Development Priorities

1. Fast iteration
2. Clear code
3. Correct business isolation
4. Good UI flow
5. Minimal dependencies
6. Easy Docker setup
7. Maintainability by one developer + AI
8. Strict Node.js execution: Use `npm run` for all commands (never `bun run`, `pnpm`, or `yarn`) to prevent Windows native binary crashes with SQLite.

Production hardening is explicitly not a Phase 0 goal.
