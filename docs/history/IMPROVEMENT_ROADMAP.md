> **Archived Historical Document:** Superseded by [CHANGELOG.md](../CHANGELOG.md) and the [active 5-document hierarchy](../../README.md). Retained under `docs/history/` for traceability.

# UAE Manager — Modernization & Improvement Blueprint

**Scope:** Architecture, Frontend UI/UX & HCI, Forms & Ergonomics, Modules & Navigation, Settings & Admin Consolidation, Backend & SQLite Performance, Local Dev / Production Ops, Testing, and Documentation.  
**Baseline:** Package `2.7.0` (`next@16.4.3`, `react@19.2.8`, `better-sqlite3@13.0.3`, `drizzle-orm@0.45.2`, `tailwindcss@4.3.3`) running in a modular monolith targeting isolated per-business SQLite databases and an OCI Ampere A1 ARM64 VM (`1 OCPU / 6 GB RAM`, `3 GiB` app container limit).

---

## 1. Executive Architectural Verdict

UAE Manager has strong financial and operational foundations: isolated per-business SQLite databases (`WAL` + `foreign_keys = ON`), minor-unit integer/BigInt accounting math with `10,000`-scale quantities, double-entry journal reconciliation (`reconcileBusinessDatabase`), atomic sequence numbering, `159` server-guarded mutations, Next.js 16 standalone Docker builds, and real CI + recovery verification.

**Key Modernization Targets:**
1. **Production & UI Correctness Bugs:** Broken server-pagination vs client-filtering mismatches, broken `business_settings` SQL queries in Customer/Supplier statements *(fixed in Sprint 1)*, three dead 404 routes in `/modules` *(fixed in Sprint 1)*, missing CSS `--color-destructive` tokens breaking error borders *(fixed in Sprint 1)*, `--text-scale` failing to scale Tailwind `rem` classes *(fixed in Sprint 1)*, and keyboard focus traps inside `DocumentGrid` / `SearchableItemSelect` *(fixed in Sprint 1)*.
2. **Form Pitch & Visual Ergonomics:** Commercial forms suffer from tall ~480px+ headers above the fold, dynamic FX grid shifts, duplicated totals across top/bottom panels and sticky footers, inconsistent input heights (`h-9` vs documented `h-8`), and sparse `40/48/56px` table rows.
3. **Structural Duplication & Fragmentation:** `ReceiptForm` (552 LOC) and `SupplierPaymentForm` (551 LOC) duplicate nearly identical allocation engines outside React Hook Form; Settings bounces users across 23 standalone `<BackLink>` cards; `/admin` vs `/super-admin` vs `/settings/system-health` overlap.
4. **Server & Dev Performance Drag:** A `6000ms` polling loop (`useLiveRefresh`) firing full RSC re-renders per open visible tab *(disabled in Sprint 1)*; `requireUser()` and `getBusinessDb()` un-memoized across Layout → Page boundaries *(memoized in Sprint 1)*; SQLite running `synchronous = FULL` without bounded memory tuning *(tuned in Sprint 1)*; `OverviewPage` scanning unpaginated invoices up to 3× and computing hidden charts synchronously; `AdminPage` running N+1 business queries across all tabs; `renderHtmlTemplate` spawning a fresh Chromium process per PDF; backups and batch PDFs buffering whole binaries/ZIPs on the Node heap.
5. **Developer Experience & Docs Sprawl:** 55 test files hardcoded in a single `package.json` CLI string, redundant TS scan globs (`.next-validate`), and ~488 KB of overlapping docs (`CHANGELOG.md`, `WORKLOG.md`, drifted specs).

> Keeping the modular monolith + isolated per-business SQLite topology matches the current workload (closed rollout, 5–10 users, 1 OCPU VM). The project does **not** need microservices or PostgreSQL today—fixing query shape, caching, PRAGMAs, pooling, and UI primitives delivers order-of-magnitude gains cleanly within this footprint.

---

## 2. Prioritized Impact Matrix

| Priority | Category | Issue / Opportunity | Primary Evidence | Sprint / Status |
|---|---|---|---|---|
| **P0** | Correctness | Server-paginated tables filter & total only the current 50-row slice on the client | `src/app/b/[businessId]/sales/invoices/page.tsx`, `src/modules/sales-invoices/invoice-table.tsx` | Sprint 2 (Planned) |
| **P0** | Correctness | Statements query non-existent `business_settings` table | `src/modules/reports/customer-statement-service.ts`, `supplier-statement-service.ts` | **Sprint 1 (Done)** |
| **P0** | Navigation | 3 dead 404 routes in `/modules` + unguarded module tiles | `src/app/b/[businessId]/modules/page.tsx` | **Sprint 1 (Done)** |
| **P0** | UI Tokens | Missing `--color-destructive` in CSS breaks line-item error rings; `--text-scale` on `body` misses `rem` utilities | `src/app/globals.css`, `src/components/documents/document-line-table.tsx` | **Sprint 1 (Done)** |
| **P0** | Form HCI | `Tab` on last grid cell traps keyboard focus; `SearchableItemSelect` drops focus on `Tab`; `customValues` / `selectItem` / `updateGlobalTax` bypass `isDirty` | `document-grid.tsx`, `searchable-item-select.tsx`, document & party forms | **Sprint 1 (Done)** |
| **P1** | Server Perf | Remove 6s `router.refresh()` timer in `useLiveRefresh` | `src/components/use-live-refresh.ts`, `src/components/live-refresh.tsx` | **Sprint 1 (Done)** |
| **P1** | DB & Auth | Wrap `getCurrentSession` / `requireUser` / `getBusinessDb` access resolution in `React.cache()`; cache Drizzle wrapper in `system.ts` | `src/core/auth/session.ts`, `src/core/db/business.ts`, `src/core/db/system.ts` | **Sprint 1 (Done)** |
| **P1** | SQLite | Tune PRAGMAs (`NORMAL`, `temp_store=MEMORY`, bounded `cache_size` & `mmap_size`, `optimize`, `TRUNCATE` on close); index `receipts`, `supplier_payments`, `sales_credit_notes` `(date)` / `(document_status, date)` | `src/core/db/pragmas.ts`, `business-schema.ts`, `business-migrations.ts` (`v38`) | **Sprint 1 (Done)** |
| **P1** | RSC Queries | Eliminate 5-subquery invoice lists, `OverviewPage` 3× invoice scans + blocking chart queries, 23 sequential `COUNT(*)` calls, and `AdminPage` N+1 + eager tabs | `invoice-service.ts`, `overview/page.tsx`, `admin/page.tsx` | Sprint 2 (Planned) |
| **P1** | UI & HCI | Tighten field pitch (`h-8`, tighter header Z-pattern), build shared Radix + `cmdk` + `nuqs` primitives, collapsible `AppShell` | `invoice-form.tsx`, `app-shell.tsx` | Sprint 3 (Planned) |
| **P1** | PDF & I/O | Pool headless Chromium via `createBrowserContext()` + semaphore; stream ZIP backups & batch PDFs instead of buffering heap copies | `render.ts`, `backup-service.ts` | Sprint 2 (Planned) |
| **P2** | IA & Cleanups | Persistent left Settings shell, consolidate Personal vs Business prefs & Admin/Health routes, merge Receipt/Payment forms, reorganize `tests/` & `docs/` | `settings-shell.tsx`, `receipt-form.tsx`, `package.json` | Sprint 3–4 (Planned) |

---

## 3. Sprint Roadmap

### Sprint 1 — Critical Fixes & Instant Performance Wins *(Implemented Locally)*
- Replaced broken `business_settings` fallback SQL queries in Customer and Supplier aging services with shared `resolveBaseCurrencyCode(sqlite, business?.currency)` querying `businesses` / `currencies`.
- Fixed 3 broken 404 routes in `src/app/b/[businessId]/modules/page.tsx` (`purchases/goods-receipts`, `sales/delivery-notes`, `sales/receipts`) and enforced `getBusinessAccess` module visibility filtering.
- Aliased `--color-destructive` / `--color-destructive-foreground` in `src/app/globals.css`, moved `--text-scale` root sizing onto `html`, and added `aria-invalid` attributes on `DocumentLineTable` controls.
- Fixed `DocumentGrid` trailing `Tab` exit, restored `Enter` trigger + `Tab` grid-coordinate focus forwarding in `SearchableItemSelect`, removed `fields` from `DocumentLineTable` `columns` `useMemo`, and wired `shouldDirty`/`customValues` dirty tracking across commercial and party forms.
- Disabled `6000ms` blind polling in `useLiveRefresh` / `LiveRefresh` (gated passive `focus`/`visibility`/`pageshow` behind `minStaleMs = 60_000` while keeping `BroadcastChannel` and `popstate` immediate).
- Wrapped `getCurrentSession` / `requireUser` / `resolveBusinessDbAccess` in `React.cache()`, cached `getSystemDb()`, centralized crash-safe `NORMAL` WAL PRAGMAs + bounded memory tuning + `optimize` / `wal_checkpoint(TRUNCATE)` in `src/core/db/pragmas.ts` (with `ERP_SQLITE_SYNCHRONOUS=FULL` override), and added Schema `v38` (`38_settlement_date_indexes`) on `receipts`, `supplier_payments`, and `sales_credit_notes`.

### Sprint 2 — Backend Query & PDF/Backup Pipeline Hardening *(Next)*
- Push list search, status/counterparty/date filters, sorting, and `SUM()` totals to SQLite via `nuqs` URL query state across `SalesInvoices`, `PurchaseInvoices`, `Customers`, and `Suppliers`.
- Upgrade `/sales/receipts` and `/purchases/payments` from raw HTML tables to unified `DataTable` + `ListToolbar`.
- Replace correlated per-row subqueries in `invoice-service.ts` and `purchase-invoice-service.ts` with paginated ID selection + batch `WHERE id IN (...) GROUP BY` settlement/project lookups.
- Deduplicate `OverviewPage` unpaginated `listInvoices()` scans into one SQL `SUM / CASE` KPI query and move heavy chart/forecast widgets behind React `<Suspense>` or conditional `view === "charts"` rendering.
- Collapse `getDashboardCounts` 23 sequential queries and fix `AdminPage` N+1 per-business queries + unconditional multi-tab fetching.
- Pool headless Chromium via lazy singleton + semaphore + `browser.createBrowserContext()`, and stream backup/batch-PDF ZIP archives (`archiver` / `yazl` → Web `ReadableStream`).

### Sprint 3 — Design System Primitives, Form Pitch & Navigation Overhaul
- Add headless UI primitives: `@radix-ui/react-popover`, `cmdk`, `@radix-ui/react-checkbox`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `nuqs`, and `@tanstack/react-virtual`.
- Replace custom item portals with a unified `<Combobox>` primitive across customers, suppliers, items, accounts, tax codes, and projects, plus a global `Cmd/Ctrl+K` command palette.
- Tighten ERP density tokens (`th` `32–34px`, `td` `32/38/44px`, `.form-section` `16px 20px`, grid inputs `h-8`, numeric column widths for large AED amounts, semantic status colors).
- Redesign `InvoiceForm` & commercial forms around a high-visibility Z-pattern (compact header above the line grid, Notes/Terms & Totals below), isolate row preview calculations, unify `<SettlementAllocationForm direction="receipt" | "payment" />` with FIFO auto-allocation, and harmonize save/issue actions across quotes/orders/invoices.
- Render `AppShell` business switcher, add persisted `64px` collapsible rail + collapsible nav groups, move mobile search off the footer into the top header, add persistent two-column `settings/layout.tsx`, and unify `/admin` sub-navigation.

### Sprint 4 — Test Reorganization, DX & Documentation Consolidation
- Reorganize `tests/` by domain (`unit/`, `accounting/`, `platform/`, `integration/`, `e2e/`) with glob discovery instead of a monolithic CLI string in `package.json`.
- Scope base `tsconfig.json` `include` globs to active source/test/script trees and isolate `.next-validate` checks into `tsconfig.validate.json`.
- Tighten production CSP `'unsafe-eval'` guard in `next.config.ts` to non-production builds.
- Consolidate active documentation into a clean 5-document hierarchy (`README.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `docs/DEPLOYMENT.md`, `docs/CHANGELOG.md`).
