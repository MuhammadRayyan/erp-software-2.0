# Changelog — Ledgerly ERP

All notable changes since the original `erp-software-2.0-antigravity-edits` upload. Grouped by development wave, newest last. Dates use the development environment calendar (August 2026 demo data).

Full per-task detail (file lists, verification transcripts, QA walkthroughs) lives in `worklog.md` at the repository root.

## v2.1.1 — Deployment & sandbox-boot fixes (current release)

Fixes "there was a problem deploying the code" / blank sandbox preview, all verified with a full production-build simulation:

- **`"use client"` directive repaired** in `src/modules/currency/currency-settings-form.tsx` — it sat on line 2 after an import (inert), so `next build` failed with "importing a module that depends on `useState` into a React Server Component" while dev mode masked the error. The file now leads with the directive.
- **Build no longer requires `BETTER_AUTH_SECRET`**: `resolveBetterAuthSecret` now tolerates the `next build` phase (`NEXT_PHASE=phase-production-build`) with a warning; the value is re-resolved at every server boot, so nothing is baked into the deployed bundle. Real production boot still throws without a secret (unchanged guard).
- **`next.config.ts`**: added `output: "standalone"` (container deployment entry `server.js`) and an optional `NEXT_DIST_DIR` override used to validate builds without touching the running dev server's `.next`.
- **`db:push` npm script restored** (aliases the explicit migration runner) — the sandbox boot/deploy scripts run it before starting anything; when it was missing, both the live preview and the publish pipeline aborted.
- **`db:bootstrap` npm script added** (migrate + seed in one shot) for clean checkouts.
- **`.env`** now carries a generated `BETTER_AUTH_SECRET` (plus `BETTER_AUTH_URL`) so builds and local runs sign sessions with a real key; `.env.example` documents both.
- Verified end-to-end: `next build` compiles clean (exit 0), the standalone `server.js` boots with the packaged `data/` directory, `/login` returns 200 with the download affordance, and `POST /api/auth/sign-in/email` authenticates `admin@demo.local` against the bundled database.

## v2.1.0 — Packaging & Documentation

- Version bumped to `2.1.0` in `package.json`.
- Added this changelog and a source-archive download affordance (see "Applying this archive" below).
- `README.md` and `docs/CURRENT_STATE.md` refreshed to match the shipped code.

## Wave 1 — Port & Hardening (Phases A–B)

- **Runtime port**: the app runs on bun as package manager with Node 24 executing scripts (single Next.js 16 app, no Docker/Compose).
- **P0 crash fix — FormError infinite recursion**: the shared error banner rendered itself recursively, crashing every server-action error path including failed login. Rewritten as a simple conditional paragraph.
- **Server-side rate limiting wired into better-auth**: `before`/`after` hooks enforce a per-IP failed-attempt limiter on `/sign-in/email`; built-in `rateLimit` covers all auth endpoints (10 sign-in attempts / 15 min, 100 requests / min elsewhere). The unauthenticated `preLoginCheck`/`clearLoginAttempts` actions were removed; client IPs resolve from the least-spoofable (rightmost) `x-forwarded-for` entry.
- **Custom-HTML template hardening**: Administrator-only; Puppeteer lazily imported; page requests intercepted so templates render fully offline.
- **Appearance settings validation** moved to a Zod enum (no trusting client-provided values).
- **Broken `compose.prod.yaml` removed** (dev-secret fallback risk).
- **Portable structural tests**: `middleware-exists` guards rewritten from Windows `findstr`/`where` to Node `fs` checks.
- **Connection-pool eviction safety**: 32-handle cap, 5-minute idle close, LRU eviction only for handles idle ≥ 10 s.

## Wave 2 — Code Health & Deduplication (Phase C)

- **Single shared document schema**: `src/core/validation/document-schemas.ts` is the one source of money/quantity Zod schemas, wired into all six document input files.
- **Dead code removed**: 12 unused imports in receipt/supplier-payment services, 4 unused `next/link` imports, dead `validateCurrency`, dead template-editor loading state, unused `allowPublic` API-auth option.
- **Shared UI primitives adopted across ~26 files**: `StatusBadge`/`statusLabel` (replaced 13 inline tone maps), `EmptyState` (replaced 16 hand-rolled blocks), `ListToolbar`/`SearchInput`/`ToolbarSelect`.
- **Multi-currency `/100` bug fixed**: line editors and live previews use each currency's configured minor-unit exponent; all form preview calculators share the server's exact money engine, so previews equal posted journal amounts for 3-decimal currencies (KWD) too.

## Wave 3 — Honest UX (Phase D)

- **Real Ctrl/Cmd+K command palette**: 16 module-filtered navigation commands + 5 create actions; keyboard navigation, filtering, Escape/close behavior.
- **Real Help dialog** replacing the disabled placeholder.
- **Honest overview**: fake "Recent Activity" panel and misleading invoice "Created by" block removed; archive actions confirm before destructive changes.

## Wave 4 — Customizability (Phase E)

- **Custom Fields engine** (business migration 13): per-business definitions (text/number/date/select/checkbox; required + show-in-list flags) managed under Settings → Custom Fields, with atomic saves inside entity transactions.
- **Custom Fields on customers & suppliers**: forms, list columns, view pages.
- **Custom Fields on sales invoices**: form section, list columns (visible in the Columns menu), view page card.
- **Custom Fields on PDFs**: per-template settings toggle; values render in both Modern and Classic react-pdf layouts.
- **Persisted column visibility** via a hydration-safe `useColumnVisibility` hook.
- **Configurable overview**: URL-driven date range with presets, per-card show/hide toggles, honest "as of today" captions.

## Wave 5 — Test & Docs wiring (Phase F)

- `tests/custom-fields.test.ts` wired into `bun run test`; `--test-force-exit` prevents hangs after the suite completes.
- Final full QA pass (browser-verified end-to-end flows, mobile 390×844 spot checks).

## Review rounds 1–7 (scheduled QA + feature rounds)

### review-1
- Mobile palette trigger button in the app header; Custom Fields extended to sales invoices; KPI card styling polish (tinted icon badges, tooltips, sticky table headers, tap feedback).

### review-2 / review-3
- Turbopack parse-error fix on the invoice form page.
- Custom Fields rendered on Sales Invoice **PDFs** (template-settings toggle, Modern + Classic layouts) — verified end-to-end through the PDF viewer.
- Custom Fields card styling normalized across invoice/customer/supplier view pages.

### review-4
- **Per-account server-side preferences** end-to-end: system DB migration v3 (`user_preferences`), GET/PUT/DELETE API (`/api/businesses/[businessId]/preferences`), server action, Settings → Preferences page with reset-to-defaults, debounced PUT hook with localStorage fallback.
- **Server-side pagination** on the sales-invoices list: `listInvoicesPaginated` + count helper, LIMIT/OFFSET, URL-driven `?page`, shared `<ListPagination>` component.

### review-5
- Pagination extended to purchase invoices, receipts, and supplier payments; **page-size selector** (25/50/100/200) in `<ListPagination>`.
- **`<ListDateFilter>`** reusable component (calendar inputs, 4 presets, Clear, URL-driven `?from`/`?to`, debounced commit) wired into all four paginated lists.
- Server-side preferences extended to the suppliers list and purchase-invoices table (Columns dropdown, inactive-row dimming, Clear filters).

### review-6
- **Email delivery end-to-end** (business migration 14, `sent_emails` table): service + pluggable driver interface (log driver default, SMTP-ready) + invoice email template (HTML + text) + `sendInvoiceEmailAction` with generated PDF attachment + compose modal on invoice view + Sent Emails list/view pages + nav entry + overview "Recent Emails" widget.

### review-7
- **Server-side pagination on customers + suppliers** (Drizzle `.limit().offset()` + count helpers) — every major list table is now URL-paginated.
- **Responsive command palette**: mobile bottom-sheet dialog + floating action button (safe-area aware, 44 px touch targets); desktop top-centered card.
- **Overview date-range server preference**: server snapshot seeds the URL on fresh navigation; changes PUT to the preferences API (debounced 600 ms) with localStorage as fast-cache mirror.
- Styling polish: Filter-button consistency, double-border removal in customer/supplier tables, normalized in-table empty states.

## Applying this archive to a new branch

1. Unzip into your repository worktree on a new branch.
2. Install dependencies: `bun install`.
3. Copy `.env.example` → `.env`, set `BETTER_AUTH_SECRET` (any long random value; required whenever `NODE_ENV` is not `development`), and optionally `ERP_DATA_DIR` (defaults to `./data`).
4. Initialize databases: `bun run db:migrate && bun run db:seed` (or `bun run db:bootstrap` for both).
5. Run the dev server: `bun run dev` → http://localhost:3000.
6. Verify: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run db:check`.

Seeded demo accounts: `admin@demo.local / demo12345` (all modules) and `standard@demo.local / demo12345` (Sales + Projects only).

Runtime data (SQLite databases, attachments) lives under `data/` and is created by the migrate/seed scripts; it is intentionally absent from this archive. The `public/downloads/` folder is a delivery artifact for the hosted preview and can be deleted safely — the login page download link auto-hides when the archive file is not present.
