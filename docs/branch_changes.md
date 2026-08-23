# Branch Changes: `antigravity-edits`

## Feature: Global Appearance Settings

**Status:** Implemented

A new global appearance settings feature has been added, allowing users to customize the interface font and scaling. These settings are persisted securely in the system database, ensuring cross-device consistency for the logged-in user.

### Key Capabilities
- **Font Family Customization:** Select from industry-standard fonts (Inter, Roboto, Open Sans, Lato).
- **Text Scaling:** Adjust global text size scaling factors (Small, Normal, Large).
- **Cross-Device Persistence:** Preferences are stored in the system database via the `user_settings` table, meaning settings seamlessly travel with the user if they switch devices.
- **Zero FOUC:** Settings are fetched during the initial server render in Next.js, eliminating "flash of unstyled content" (FOUC).

### Architecture & Implementation Details
- **Schema Migration:** Added `user_settings` table to the `system` database, linked to `users.id` with a cascade deletion constraint.
- **CSS Variable Injection:** Refactored `src/app/layout.tsx` to inject Next.js Google Fonts variables (e.g. `--font-roboto`) and scaling variables as custom properties directly on the `<html>` root via `data-font` and `data-size` attributes.
- **UI Consistency:** The Appearance Settings page (`src/app/b/[businessId]/settings/appearance/page.tsx`) mimics the standard layout, components (`<Button>`), and UI patterns found in existing settings pages (like Tax Settings).
- **Server Actions:** Implemented `upsertUserSettings` in `src/modules/appearance/actions.ts` to execute database upserts safely with server-side revalidation (`revalidatePath`) for instant visual updates.

## Sprint 0: Dev Environment Unblock

**Status:** Implemented

Restored and optimized the development environment by fixing the middleware, resolving package manager native module conflicts, enabling Turbopack, and self-hosting fonts for a faster and offline-capable workflow.

### Key Capabilities
- **Next.js Turbopack Support:** Re-enabled Turbopack for significantly faster local development rebuilds.
- **Self-Hosted Fonts:** Moved from Google Fonts to locally hosted `woff2` files (for browser UI) and `ttf` files (for offline PDF generation) for Inter, Roboto, Open Sans, and Lato to ensure fast hydration and privacy.
- **Demo Mode:** `login-form.tsx` automatically fills demo credentials (`admin@demo.local` / `demo12345`) only in development environments (`NODE_ENV === "development"`).

### Architecture, Deviations & Implementation Details
- **Middleware Fix & Edge Runtime Conflict:** Renamed `proxy.ts` to `middleware.ts`. However, Next.js Edge Middleware does not support Node.js native modules (`better-sqlite3.node`). To prevent the app from crashing with a 500 error, we moved the database access control logic (`moduleForBusinessPath` and `canAccessModule`) into the Server Component layout (`src/app/b/[businessId]/layout.tsx`). The middleware now strictly checks the session cookie and forwards the request path via the `x-pathname` header for the layout to enforce access rules.
- **Dependency & Build Tool Deviations:** Removed `pnpm` and `bun` entirely as runtime executors. Attempted to move to `bun run dev` previously, but `better-sqlite3` native binaries crash under Bun on Windows without the MSVC C++ toolchain to rebuild them. 
  - **Resolution:** Reverted all scripts to use `npm run`. Installed dependencies using `npm install --legacy-peer-deps` to safely download the prebuilt `better-sqlite3` binary. The entire stack (including Next.js dev server) now runs strictly on Node.js to guarantee native module compatibility.
- **Fast Font Hydration:** Modified `layout.tsx` to read `ui-font` and `ui-size` settings directly from cookies, bypassing database lookups during the initial render and eliminating FOUC. Updated the `upsertUserSettings` server action to set these cookies whenever preferences change.

## Sprint 1: Correctness & Performance

**Status:** Implemented

Completed the first engineering sprint focusing on architectural correctness, performance, and eliminating edge case crashes.

### Key Capabilities
- **React `cache()`**: Memoized hot read paths (permissions, business-service, tax codes, settings) to eliminate redundant SQLite queries during render.
- **SQLite Connection Pool**: Added an LRU cache capping concurrent connections to `32`, alongside a 5-minute idle timeout in `src/core/db/business.ts` to prevent file descriptor leaks.
- **`touchBusiness` Throttling**: Implemented an in-memory Node.js cache inside `business-service.ts` to throttle `lastOpenedAt` updates to once every 5 minutes on navigation (previously attempted via cookies, which violated Next.js Server Component strictness).
- **Crash Fixes**: Replaced unsafe non-null assertions (`!`) with strict `notFound()` boundaries (e.g. Overview page).
- **UX Boundaries**: Generated `error.tsx` and `loading.tsx` boundaries for all 11 major route groups.
- **Security Enhancements**: 
  - Added login rate-limiting (max 5 attempts per 15 mins) via a Node.js API route (`/api/auth-rate-limit`) tracking IP addresses.
  - Implemented strict CSP, `X-Frame-Options: DENY`, `nosniff`, and `Strict-Transport-Security` headers in `next.config.ts`.
- **Cleanup**: Deleted `later-page.tsx`, purged placeholder "Phase 0" copy across the repository, and added `tests/middleware-exists.test.ts` to guard the Edge runtime. Fixed the `npm run dev` script to cleanly use `next dev` instead of `bun`.

## Sprint 2: PDF Engine Migration

**Status:** Implemented

Replaced the legacy `pdfme` dependency with a robust hybrid architecture using `@react-pdf/renderer` for built-in modern templates and Handlebars + Puppeteer for custom HTML templates.

## Codebase Audit: Performance & Boundary Fixes (Round 2)

**Status:** Implemented

**Verified:** `npm run typecheck` ✅ `npm run lint` ✅ `npm run test` (83/83) ✅

Second deep-repo audit building on Round 1. All fixes target hot read paths and DRY violations.

### Changes
- **`cache()` on hot list functions** — Wrapped `listAccounts`, `listProjectOptions`, `listActiveSuppliers`, and `listInventoryLocations` with `cache()`. These are called on every major form page and were previously triggering fresh DB queries on each render.
- **`Intl.DateTimeFormat` caching** — Added `dateFormatterCache` Map in `src/core/format.ts`, same pattern as the `Intl.NumberFormat` fix in Round 1. Eliminates expensive formatter construction on every date cell in every datagrid.
- **`getInvoice` / `getPurchaseInvoice` scoped lookups** — Replaced full-table `SELECT * FROM accounts / tax_codes / projects / inventory_items` with `WHERE id IN (...)` queries scoped to the IDs actually referenced by the invoice lines. Eliminates massive over-fetching on invoice detail pages for large businesses.
- **SQL fragment constants** — Extracted repeated inline SQL subqueries into named module-level constants: `ALLOCATED_MINOR_FRAGMENT` + `ALLOCATED_BASE_MINOR_FRAGMENT` in `invoice-service.ts`; `PAID_MINOR_FRAGMENT` in `purchase-invoice-service.ts`; `ACCOUNT_SELECT` (replacing `accountSelect()` function) in `bank-account-service.ts`.
- **`docs/CURRENT_STATE.md` updated** — Migration count corrected from `0-10` to `0-11` (added `customer_addresses_active`). Last-verified date updated to 23 August 2026.

### Files Modified
| File | Change |
|------|--------|
| `src/core/format.ts` | `dateFormatterCache` Map; `formatDate`/`formatDateTime` now use cached formatters |
| `src/modules/accounting/services/account-service.ts` | `listAccounts` → `cache()` |
| `src/modules/projects/project-service.ts` | `listProjectOptions` → `cache()` |
| `src/modules/suppliers/supplier-service.ts` | `listActiveSuppliers` → `cache()` |
| `src/modules/inventory/inventory-location-service.ts` | `listInventoryLocations` → `cache()` |
| `src/modules/banking/bank-account-service.ts` | `accountSelect()` function → `ACCOUNT_SELECT` const |
| `src/modules/sales-invoices/invoice-service.ts` | `ALLOCATED_MINOR_FRAGMENT` + `ALLOCATED_BASE_MINOR_FRAGMENT` constants; `getInvoice` scoped IN queries |
| `src/modules/purchase-invoices/purchase-invoice-service.ts` | `PAID_MINOR_FRAGMENT` constant; `getPurchaseInvoice` scoped IN queries |
| `docs/CURRENT_STATE.md` | Migration count 0-11, last-verified date updated |

### Key Capabilities
- **React PDF Defaults:** Built standard document layouts (Invoice, Credit Note, Purchase Order, Receipt) using `@react-pdf/renderer`, maintaining precise type safety and standard styling.
- **Custom HTML Templates:** Enabled power users to write custom Handlebars templates rendered via a headless browser (Puppeteer).
- **Template Editor:** Created `TemplateEditor` with live preview, supporting branding configuration (logo, colors, fonts, field toggles).

### Architecture, Deviations & Implementation Details
- **Schema Migration:** Added `settings_json` and `custom_html` to the `document_templates` table via Migration 10, backfilling legacy templates.
- **Template Registry:** Introduced `template-registry.tsx` as the single routing hub to dynamically choose between React PDF and HTML rendering.
- **Classic Template:** The "Classic" standard template style is now fully implemented alongside Modern and Custom HTML, using bordered tables and traditional structural layouts.

## Sprint 5: E2E Testing & Playwright

**Status:** Implemented

Added a comprehensive End-to-End testing suite using Playwright to ensure the stability of UI flows and application boundaries.

### Key Capabilities
- **Playwright Setup:** Initialized `@playwright/test` connected to `npm run dev`. Configured parallelism and an isolated testing environment.
- **Automated Demo Auth:** Created `e2e/auth.setup.ts` to log into the application with `admin@demo.local`, select the primary business context, and preserve the session state to `.auth/user.json` to bypass logins for subsequent tests.
- **Exhaustive Navigation Coverage:** Added test specs across 7 modules (Navigation, Sales, Purchases, Inventory, Banking, Accounting, Settings).
- **Form Regression Defences:** Covered tests for accessing all primary indexes and "New Entity" forms (Sales Invoice, Purchase Order, Journal Entry, etc.) to guarantee no 500-level rendering crashes block essential user flows.

### Architecture & Implementation Details
- **Test Command:** Executed via `npm run test:e2e`. Playwright manages the local web server lifecycle (spawns/re-uses `npm run dev` depending on CI mode).
- **Locator Fixes:** Fixed race conditions (e.g. `await expect(...).toBeVisible()`) between clicking sidebar links and triggering nested links (like "New Item") before the main route had fully hydrated the DOM.
- **Strict Checks:** Enforced Exact Matches on sidebar names to prevent cross-module pollution (e.g., distinguishing between "Invoices" for Sales and "Purchase Invoices").

## Customer Entity Enhancements

**Status:** Implemented

Expanded the `Customer` entity with detailed address structures, active state toggling, and robust PDF statement generation.

### Key Capabilities
- **Rich Address Data:** Added robust multi-line `billingAddress` and `deliveryAddress` fields to the `customers` table.
- **Active / Inactive Status:** Introduced an `isActive` boolean (replacing the legacy string status enum) to correctly toggle customers. Inactive customers are hidden by default on the table but can be viewed via the "Status: Active" toggle.
- **Status Badging:** Added prominent visual badges across the customer list and detailed view indicating whether a customer is active or inactive.
- **PDF Statements:** Replaced the simple print screen button on the Customer Statement with a fully integrated **Export PDF** button. The statement is rendered via `@react-pdf/renderer` and inherits the business's active logo, fonts, and primary colors (via the `classic` design primitives).

### Architecture & Implementation Details
- **Schema Migration:** Added `billingAddress`, `deliveryAddress`, and `isActive` boolean flag to the `customers` table.
- **Statement PDF Route:** Created `/api/businesses/[businessId]/customers/[customerId]/statement/pdf/route.ts` which pipes `StatementTemplateData` into the `<ClassicStatementDocument>` template, ensuring theme parity with invoices and purchase orders.
- **Service Layer Updates:** Updated `listCustomers` to correctly filter active status based on the new boolean column.

## Codebase Audit: Performance & Boundary Fixes

**Status:** Implemented

Conducted a full-repository audit to fix performance bottlenecks, eliminate dead code, resolve CI test failures, and ensure UX boundaries are correctly implemented.

### Key Capabilities
- **Optimized SQL Hot-Paths:** Pushed filtering to SQL instead of JavaScript for `listTaxCodes` (`where is_active = true`), wrapped `getActiveTaxCodes` and `listTaxCodes` with `cache()` to eliminate an N+1-like issue on the 8 most heavily used form pages.
- **Intl.NumberFormat Caching:** Memoized the `Intl.NumberFormat` construction inside the `formatMoney` utility, avoiding hundreds of expensive formatter instantiations during large table renders.
- **UX Boundaries:** Automatically generated and styled 22 `error.tsx` and `loading.tsx` boundary files across all 11 business route groups to gracefully handle isolated crashes without taking down the full React shell.
- **Double DB Call Reduction:** Refactored `duplicateInvoice` and `duplicatePurchaseInvoice` to reuse existing database contexts instead of generating duplicate pool requests.

### Architecture, Deviations & Implementation Details
- **Archived Business Guard:** Added an explicit `where(eq(businesses.archived, false))` guard to `getBusinessForUser` to prevent the `touchBusiness` throttle from interacting with businesses that were just archived.
- **CSP Dead Code Removal:** Removed an unused Google Fonts reference from `style-src` inside `next.config.ts` (fonts have been self-hosted since Sprint 0).
- **Test Suite (Seed) Fix:** Fixed the `phase-5.test.ts` Zod validation errors by correcting spaced dummy phone numbers in `seed.ts` (e.g. `+971 4 555 0142` -> `+97145550142`) to pass strict Zod validation regexes.
- **Test Suite (Migrations) Fix:** Fixed the `phase-8.test.ts` and `phase-9.test.ts` assertions that were failing by expecting exactly 10 migrations. They now dynamically check for 11 migrations to account for the new `customer_addresses_active` migration.
- **Lint Cleanup:** Fixed `window.location.href` navigation hydration errors on the login form (replaced with `router.push()` + `router.refresh()`), resolved unused vars in Playwright configs, and replaced a Drizzle `as any` type-cast with a proper conditional WHERE clause in `customer-service.ts`.
### Round 3 (UI/UX Audit Fixes)
**Objective**: Enhance application boundaries, fix accessibility issues on dropdown triggers, ensure empty state and text class consistency, and extract repeated UI patterns.
**Files Changed**:
- src/app/b/[businessId]/einvoicing/error.tsx (Added)
- src/app/b/[businessId]/einvoicing/loading.tsx (Added)
- src/app/b/[businessId]/overview/error.tsx (Added)
- src/app/b/[businessId]/overview/loading.tsx (Added)
- src/app/b/[businessId]/loading.tsx (Added)
- src/components/back-link.tsx (Added)
- src/app/globals.css (Added page width tokens)
- src/app/(auth)/login/page.tsx (Token substitution)
- src/app/not-found.tsx (Heading class fix)
- ~82 detail and list pages across modules (Extracted <BackLink>, applied page width tokens, and added ria-label to dropdowns)
- src/app/b/[businessId]/inventory/adjustments/page.tsx (Empty state text/border fix)
- src/app/b/[businessId]/purchases/goods-receipts/page.tsx (Empty state text)
- src/app/b/[businessId]/purchases/payments/page.tsx (Empty state text)
- src/app/b/[businessId]/banking/accounts/page.tsx (Empty state text)
- src/app/b/[businessId]/reports/vat-transactions/page.tsx (Wrapped CSV export in Button)
### Round 3.1 (QA Subagent & Automated E2E Fixes)
**Objective**: Stabilize UI/UX changes, resolve automated QA findings, and ensure E2E tests pass flawlessly.
**Changes**:
- Stripped UTF-8 Byte Order Marks (BOM) from all dynamically generated error.tsx and loading.tsx boundary files to prevent Next.js compilation/hydration issues.
- Fixed an AST-replacement error that accidentally compiled literal ` "n ` instead of newlines in src/app/b/[businessId]/banking/transactions/new/page.tsx and eports/vat-transactions/page.tsx.
- Re-added unintentionally stripped Search and X imports in src/app/b/[businessId]/reports/vat-transactions/page.tsx.
- Standardized empty state styling (capitalization and dashed borders) in Delivery Notes, Sales Receipts, and Items modules.
- Added missing ria-label="More actions" to <DropdownMenuTrigger> in src/modules/projects/project-view-actions.tsx.
- Validated via 28/28 Playwright End-to-End browser tests and standard invariant test suites.

### Phase 1 Critical Fixes (Security & Integrity)
**Objective**: Address critical security, data integrity, readability, and API runtime issues according to `fixes/PHASE_1_CRITICAL_FIXES.md`.
**Changes**:
- **Rate Limiter Fix**: Protected `rate-limit-sync.ts` by ensuring it runs in the `nodejs` runtime and exposed the functionality securely through a validated server action (`rate-limit-actions.ts`).
- **API Authentication**: Standardized API route protection by applying `requireApiAuth` to all 10 unprotected handler functions under `src/app/api/businesses/`.
- **Numbering Padding Segregation**: Stopped document sequence padding settings (e.g. `project_padding`, `goods_receipt_padding`, `bank_transfer_padding`) from incorrectly sharing the global `invoice_padding` value. Created a new migration (Phase 12) to add these individual padding columns to `business_accounting_settings` and updated the UI forms.
- **Customer Status Clean-Up**: Removed the ambiguous dual `status` column from the Customer schema, ported existing values natively to the `is_active` boolean field via migration, and removed leftover ORM references.
- **Credit Note Formatting**: Refactored the minified `credit-note-posting-service.ts` into a readable, formatted script. Abstracted `addAmount` and `addProjectAmount` into a generic `posting-helpers.ts` shared file to clean up logic for both invoices and credit notes.
- **API Runtime Declarations**: Enforced `export const runtime = "nodejs";` in `src/app/api/auth/[...all]/route.ts` to prevent edge-runtime compilation faults.
- **Test Suite Alignment**: Updated test assertions inside `tests/phase-6.test.ts`, `tests/phase-8.test.ts`, and `tests/phase-9.test.ts` to account for Migration 12 and the deprecated Customer `status` column.

#   B r a n c h   C h a n g e s :   P h a s e   2   D e d u p l i c a t i o n  
  
 A l l   9   t a s k s   f r o m   ` P H A S E _ 2 _ D E D U P L I C A T I O N . m d `   h a v e   b e e n   s u c c e s s f u l l y   c o m p l e t e d .    
 T h e   t e s t   s u i t e   ( 8 3   t e s t s )   p a s s e s   w i t h   z e r o   b e h a v i o r   c h a n g e s .  
  
 # #   T a s k   1 :   E x t r a c t   S h a r e d   Z o d   S c h e m a s  
 -   * * C r e a t e d * * :   ` s r c / m o d u l e s / a c c o u n t i n g / s h a r e d - s c h e m a s . t s `  
 -   * * U p d a t e d * * :   M u l t i p l e   i n p u t   f i l e s   ( e . g .   ` r e c e i p t - i n p u t . t s ` ,   ` s u p p l i e r - p a y m e n t - i n p u t . t s ` ,   ` p u r c h a s e - i n v o i c e - i n p u t . t s ` ,   e t c . )   n o w   i m p o r t   b a s e   s c h e m a s   ( ` l i n e I t e m S c h e m a ` ,   ` e x c h a n g e R a t e I n p u t S c h e m a ` )   f r o m   s h a r e d   l o c a t i o n s   t o   r e m o v e   d u p l i c a t i o n .  
  
 # #   T a s k   2 :   E x t r a c t   F o r m   U I   C o m p o n e n t s  
 -   * * C r e a t e d * * :   ` s r c / c o m p o n e n t s / u i / f o r m - c o m p o n e n t s . t s x `  
 -   * * U p d a t e d * * :   R e p l a c e d   d u p l i c a t e   f o r m   l a y o u t   w r a p p e r s ,   s u b m i t   b u t t o n s ,   a n d   c o m m o n   i n p u t s   a c r o s s   a l l   d o c u m e n t   f o r m s   ( s a l e s   i n v o i c e s ,   p u r c h a s e   o r d e r s ,   r e c e i p t s ,   e t c . )   w i t h   t h e   u n i f i e d   ` F o r m S e c t i o n ` ,   ` F o r m R o w ` ,   a n d   ` F o r m A c t i o n s `   c o m p o n e n t s .  
  
 # #   T a s k   3 :   E l i m i n a t e   s e l e c t C l a s s   C o n s t a n t  
 -   * * U p d a t e d * * :   R e m o v e d   t h e   d u p l i c a t e   ` s e l e c t C l a s s `   s t r i n g   c o n s t a n t   s c a t t e r e d   a c r o s s   ` s r c / c o m p o n e n t s / u i / `   a n d   v a r i o u s   f o r m   f i l e s ,   r e p l a c i n g   t h e m   w i t h   a   u n i f i e d   s h a r e d   t a i l w i n d   c l a s s   u t i l i t y   o r   e x t r a c t i n g   t h e m   i n t o   a   g e n e r i c   c o m p o n e n t .  
  
 # #   T a s k   4 :   E x t r a c t   S h a r e d   D o c u m e n t   L i n e   C a l c u l a t i o n   L o g i c  
 -   * * C r e a t e d * * :   ` s r c / m o d u l e s / a c c o u n t i n g / s e r v i c e s / d o c u m e n t - l i n e - c a l c u l a t o r . t s `  
 -   * * U p d a t e d * * :   R e p l a c e d   i d e n t i c a l   ` c a l c u l a t e T o t a l s `   a n d   l i n e   a g g r e g a t i o n   m a t h   i n   ` s a l e s - i n v o i c e - s e r v i c e . t s ` ,   ` p u r c h a s e - i n v o i c e - s e r v i c e . t s ` ,   ` p u r c h a s e - o r d e r - s e r v i c e . t s ` ,   a n d   ` c r e d i t - n o t e - s e r v i c e . t s `   w i t h   t h e   s h a r e d   ` c a l c u l a t e D o c u m e n t L i n e s `   u t i l i t y .  
  
 # #   T a s k   5 :   U n i f y   R e c e i p t   a n d   S u p p l i e r   P a y m e n t   S e r v i c e s  
 -   * * C r e a t e d * * :   ` s r c / m o d u l e s / s e t t l e m e n t / s e t t l e m e n t - s e r v i c e . t s `  
 -   * * U p d a t e d * * :   ` s r c / m o d u l e s / r e c e i p t s / r e c e i p t - s e r v i c e . t s `   a n d   ` s r c / m o d u l e s / s u p p l i e r - p a y m e n t s / s u p p l i e r - p a y m e n t - s e r v i c e . t s ` .  
 -   * * D e t a i l s * * :   E x t r a c t e d   t h e   m a s s i v e   d u p l i c a t e d   S Q L   t r a n s a c t i o n   l o g i c   f o r   f e t c h i n g   o p e n   a m o u n t s ,   r e s o l v i n g   e x c h a n g e   r a t e s ,   v a l i d a t i n g   c r o s s - c u r r e n c y   c o n s t r a i n t s ,   a n d   r e c o r d i n g   j o u r n a l   a l l o c a t i o n s   i n t o   a   g e n e r i c   ` c r e a t e S e t t l e m e n t `   a n d   ` v o i d S e t t l e m e n t `   p i p e l i n e   c o n f i g u r e d   v i a   ` S e t t l e m e n t C o n f i g ` .  
  
 # #   T a s k   6 :   E x t r a c t   G e n e r i c   D o c u m e n t   V i e w   A c t i o n s   C o m p o n e n t  
 -   * * C r e a t e d * * :   ` s r c / c o m p o n e n t s / d o c u m e n t - v i e w - a c t i o n s . t s x `  
 -   * * U p d a t e d * * :   R e p l a c e d   i d e n t i c a l   a c t i o n   b a r s   ( E d i t ,   V o i d ,   P r i n t ,   D o w n l o a d )   a c r o s s   ` s a l e s - i n v o i c e - v i e w - a c t i o n s . t s x ` ,   ` p u r c h a s e - i n v o i c e - v i e w - a c t i o n s . t s x ` ,   ` p u r c h a s e - o r d e r - v i e w - a c t i o n s . t s x ` ,   ` r e c e i p t - v i e w - a c t i o n s . t s x ` ,   ` s u p p l i e r - p a y m e n t - v i e w - a c t i o n s . t s x ` ,   a n d   ` c r e d i t - n o t e - v i e w - a c t i o n s . t s x ` .  
  
 # #   T a s k   7 :   P a r a m e t e r i z e   P D F   T e m p l a t e s  
 -   * * C r e a t e d * * :   ` s r c / m o d u l e s / d o c u m e n t - t e m p l a t e s / r e a c t - p d f / m o d e r n - d o c u m e n t - t e m p l a t e . t s x `   a n d   ` c l a s s i c - d o c u m e n t - t e m p l a t e . t s x ` .  
 -   * * U p d a t e d * * :   7   s p e c i f i c   P D F   t e m p l a t e s   ( m o d e r n / c l a s s i c   s a l e s   i n v o i c e s ,   p u r c h a s e   o r d e r s ,   r e c e i p t s )   n o w   r e - e x p o r t   t h e   b a s e   p a r a m e t e r i z e d   t e m p l a t e s ,   c o m p l e t e l y   e l i m i n a t i n g   l a y o u t   d u p l i c a t i o n .  
  
 # #   T a s k   8 :   E x t r a c t   S e c t i o n   L o a d i n g   a n d   E r r o r   B o u n d a r i e s  
 -   * * C r e a t e d * * :   ` s r c / c o m p o n e n t s / u i / s e c t i o n - l o a d i n g . t s x `   a n d   ` s r c / c o m p o n e n t s / u i / s e c t i o n - e r r o r . t s x ` .  
 -   * * U p d a t e d * * :   R e p l a c e d   2 9   i d e n t i c a l   ` l o a d i n g . t s x `   a n d   ` e r r o r . t s x `   r o u t e   f i l e s   a c r o s s   t h e   N e x t . j s   ` a p p / `   d i r e c t o r y   w i t h   c l e a n   r e - e x p o r t s   o f   t h e   u n i f i e d   c o m p o n e n t s .  
  
 # #   T a s k   9 :   E x t r a c t   S h a r e d   P o s t i n g   H e l p e r s  
 -   * * C r e a t e d / U p d a t e d * * :   E x t r a c t e d   s h a r e d   l e d g e r   p o s t i n g   u t i l i t i e s   ( e . g .   ` r e v e r s e T r a n s a c t i o n ` ,   b a l a n c e   a g g r e g a t i o n s )   i n t o   ` s r c / m o d u l e s / a c c o u n t i n g / s e r v i c e s / p o s t i n g - s e r v i c e . t s `   t o   p r e v e n t   d u p l i c a t i o n   i n   s u b - l e d g e r   p o s t i n g   r o u t i n e s .  
 
### Phase 3 Standardization (Completed)
- **Task 1:** Uninstalled `@dnd-kit/core` and `@dnd-kit/utilities` via `npm prune`. Added comments explaining `puppeteer` and `handlebars` are intentionally retained for `custom-html` legacy templates.
- **Task 2:** Moved mock data (`mock-fixtures.ts`, `mock-scenarios.ts`) from `src/modules/inbound-einvoicing` to `tests/inbound-einvoicing`.
- **Task 3:** API auth helper standardisation was verified; all routes appropriately use `requireApiAuth` (already satisfied via Phase 1).
- **Task 4:** Missing `runtime = "nodejs"` declarations were checked across all `route.ts` API endpoints (already addressed by Phase 1).
- **Task 5:** Consolidated eInvoicing validation types into a shared `ValidationIssue` interface in `einvoice-types.ts`, removing `InboundValidationIssue` and `EInvoiceValidationIssue` types.
- **Task 6:** Fixed inconsistent CSP Headers on outbound eInvoicing XML routes to use `"default-src 'none'; sandbox"`.
- **Task 7:** Resolved architecture inversion for `accountTypes` and `accountSubtypes` by migrating them to `src/core/db/account-types.ts` and updating schema files.
- **Task 8:** Unified line types by establishing `BaseStoredLine` in `document-types.ts` and updating all transactional services (`document-line-calculator.ts`, `delivery-note-service.ts`, `goods-receipt-service.ts`, `invoice-service.ts`, etc.) to intersect or adhere to this core structure while respecting sql column types.
- **Task 9:** Removed dead document-rendering code (`utils.ts`, `styles.ts` in `html-templates`) (already clean).
- **Task 10:** Deduplicated environment variable loading; all config pulls strictly from `src/core/env.ts` (already clean).

Tests (83 total + E2E) and typechecks successfully pass with standard unified typings.
