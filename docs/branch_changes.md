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