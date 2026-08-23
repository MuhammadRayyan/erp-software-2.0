# Phase 1 — Critical Fixes (Security, Data Integrity, Readability)

## Context

This is a Next.js 16 + React 19 + TypeScript 6 + Drizzle ORM + SQLite modular-monolith ERP application inspired by Manager.io. Each business has its own SQLite database under `data/businesses/<id>/business.sqlite`. A system database at `data/system/system.sqlite` stores auth, business registry, and memberships.

**Working commands:** `npm run dev` (Node only, not bun), `npm run typecheck`, `npm run lint`, `npm run test` (83 tests), `npm run test:e2e` (28 Playwright tests).

**Key rules:**
- Never use `drizzle-kit push` on real data — use the explicit migration runner.
- Never import `better-sqlite3` or Node modules in `src/middleware.ts` (Edge runtime).
- UI components never issue direct DB writes — all writes through service functions.
- Money is integer minor units. Quantities are 4-decimal micros.
- `"use server"` for actions, `"use client"` for interactive components, no marker for server components.

---

## Task 1 — Fix Unprotected Rate Limiter API

**Files:** `src/app/api/auth-rate-limit/route.ts`, `src/core/auth/rate-limiter.ts`, `src/app/(auth)/login/login-form.tsx`

**Problem:**
- The PUT (recordFailedAttempt) and DELETE (clearAttempts) handlers in the rate-limit API route have **zero authentication**. Any unauthenticated client can call them to exhaust or reset someone's login attempts.
- The rate limiter is **not wired into the actual auth handler** at `src/app/api/auth/[...all]/route.ts`. The login form calls the rate-limit API separately, but the Better Auth handler ignores it entirely. The rate limiter is decorative.

**Fix:**
1. Add session validation to the rate-limit route (GET may remain sessionless for the login page to check; PUT and DELETE must require a valid session or at minimum only allow the login page to call them — simplest: remove the API route entirely and integrate rate checking directly into a server action called from the login form, which naturally runs server-side with access to the request context).
2. The cleanest approach: convert rate limiting to a **server action** (`src/core/auth/actions.ts` or similar) that checks attempts before processing login, and records failures after. Remove the standalone API route. The login form should call this server action instead of calling Better Auth's client-side handler + a separate API.
3. Verify: typecheck, lint, manual test that login still works and rate limiting actually blocks after 5 failures.

---

## Task 2 — Secure All API Routes with Standardized Auth

**Files:** All routes under `src/app/api/`

**Problem:**
- `src/middleware.ts` only covers `/businesses/*` and `/b/*`. All `/api/*` routes rely on manual per-route auth. Any new API route added without an explicit auth check is **publicly accessible**.
- Auth patterns are inconsistent: some routes use `getCurrentSession()`, some use `requireModule()`, some use `getDocumentPdfAccess()`, some use `getBusinessForUser()`.

**Fix:**
1. Create a **standardized API auth helper** at `src/core/auth/api-auth.ts`:
   ```ts
   // Returns { session, businessId, access } or throws/returns 401/403
   // Handles: get session, get business access, check module permission
   // All API routes call this single function at the top
   ```
2. Audit every API route under `src/app/api/` and refactor each to use the new helper. Ensure every single route returns 401 for no session and 403 for insufficient permissions.
3. The helper should accept optional `{ module?: string; requireAdmin?: boolean }` config.
4. **Do NOT** add Node.js imports to middleware.ts — it runs on Edge. The auth stays per-route.
5. Verify: typecheck, lint, test. Optionally add a test that unauthenticated requests to API routes return 401.

---

## Task 3 — Fix Numbering Service Padding Sharing Bug

**File:** `src/modules/accounting/services/numbering-service.ts`

**Problem:**
- Project, goods receipt, delivery note, stock adjustment, bank transaction, and bank transfer numbering all reference `padding: "invoice_padding"` from the `business_document_settings` table.
- This means changing the invoice number padding (e.g., from 4 to 5 digits) **silently changes padding for 7 other document types**.

**Fix:**
1. Read the current `business_document_settings` table schema in `src/core/db/business-schema.ts` to understand existing columns.
2. Create a new migration (version 12) that adds individual padding columns for each document type that currently shares `invoice_padding`:
   - `project_padding` (integer, default 4)
   - `goods_receipt_padding` (integer, default 4)
   - `delivery_note_padding` (integer, default 4)
   - `stock_adjustment_padding` (integer, default 4)
   - `bank_transaction_padding` (integer, default 4)
   - `bank_transfer_padding` (integer, default 4)
   - Backfill each from the current `invoice_padding` value.
3. Update the `numbering-service.ts` lookup map to use the correct column for each document type.
4. Update the Drizzle schema in `business-schema.ts` to include the new columns.
5. Add a setting UI row for each new padding field in the numbering settings form (find where `invoice_padding` is configured and extend it).
6. Verify: typecheck, lint, `npm run db:migrate`, `npm run test`. Ensure existing document numbers are unaffected.

---

## Task 4 — Fix Customer Schema Dual Status

**Files:** `src/core/db/business-schema.ts`, migration script, customer-service.ts, customer-form.tsx, customer-input.ts, customer-table.tsx

**Problem:**
- The `customers` table has **both** `status: text("status", { enum: ["active", "archived"] })` AND `isActive: integer("is_active", { mode: "boolean" })`.
- The `suppliers` table only has `isActive`.
- If a customer has `status: "archived"` but `isActive: true` (or vice versa), behavior is undefined.

**Fix:**
1. Read `src/modules/customers/customer-service.ts` to understand which field is actually used for filtering and logic.
2. Create a migration (can be part of migration 12 or a separate 13) that:
   - Sets `is_active = 0` for all rows where `status = 'archived'`.
   - Sets `is_active = 1` for all rows where `status = 'active'` or `status IS NULL`.
   - Drops the `status` column from `customers`.
3. Update the Drizzle schema: remove `status` from the `customers` table definition.
4. Search for any remaining references to `customer.status` or `status: "archived"` in the codebase and replace with `isActive: false`.
5. Verify: typecheck, lint, `npm run db:migrate`, `npm run test`. Ensure customer list filtering still works correctly.

---

## Task 5 — Format & Read the Credit Note Posting Service

**File:** `src/modules/accounting/services/credit-note-posting-service.ts`

**Problem:**
- The entire file is minified — multiple statements crammed on single lines, making the accounting posting logic completely unreadable. This is **auditing-critical code** that generates journal entries.

**Fix:**
1. Read the file carefully.
2. Compare its structure with `src/modules/accounting/services/invoice-posting-service.ts` (which is properly formatted and follows the same pattern — debit/credit reversal of sales invoice posting).
3. Reformat the entire file with proper line breaks, consistent indentation (2-space), and readable variable names matching the invoice posting service conventions.
4. Extract the shared `addProjectAmount` / `addAmount` helpers into a shared file (e.g., `src/modules/accounting/services/posting-helpers.ts`) since the same pattern exists in `purchase-invoice-posting-service.ts` too.
5. Verify: `npm run typecheck`, `npm run lint`, `npm run test`. The 83 tests must still pass — this is a formatting-only + extraction refactor with zero behavior change.

---

## Task 6 — Add `runtime = "nodejs"` to Missing API Routes

**File:** `src/app/api/businesses/import/route.ts`

**Problem:** This route uses Node.js APIs (`fs`, `JSZip`) but doesn't declare `export const runtime = "nodejs"`. If Next.js defaults to Edge runtime for API routes, this will crash.

**Fix:** Add `export const runtime = "nodejs";` at the top of the file (after imports, before the handler). Check all other API routes for the same missing declaration.

---

## Verification Checklist (Run After ALL Tasks)

```bash
npm run typecheck    # Zero errors
npm run lint         # Zero errors  
npm run test        # 83/83 pass
npm run db:migrate   # No errors on fresh + existing DB
npm run db:check     # Schema validation passes
```

Then start dev server (`npm run dev`) and manually verify:
1. Login rate limiting works (5 failed attempts → blocked)
2. Unauthenticated API access returns 401
3. Customer list filtering (active/inactive) works
4. Document numbering settings show per-type padding
5. All existing 28 E2E tests still pass (`npm run test:e2e`)

---

## What NOT to do

- Do NOT change any business logic, accounting math, or posting behavior.
- Do NOT add new features, new modules, or new pages.
- Do NOT refactor anything beyond what is specified above.
- Do NOT use `drizzle-kit push` on any database.
- Do NOT import `better-sqlite3` or Node modules in middleware.ts.
- Do NOT use `bun run` — use `npm run` for all commands.
- Do NOT start Phase 2 (duplication elimination) work.
