# Phase 3 — Standardization & Dead Code Cleanup (Medium Priority)

## Context

This is a Next.js 16 + React 19 + TypeScript 6 + Drizzle ORM + SQLite modular-monolith ERP application inspired by Manager.io. Each business has its own SQLite database under `data/businesses/<id>/business.sqlite`. A system database at `data/system/system.sqlite` stores auth, business registry, and memberships.

**Working commands:** `npm run dev` (Node only, not bun), `npm run typecheck`, `npm run lint`, `npm run test` (83 tests), `npm run test:e2e` (28 Playwright tests).

**Key rules:**
- Never use `drizzle-kit push` on real data — use the explicit migration runner.
- Never import `better-sqlite3` or Node modules in `src/middleware.ts` (Edge runtime).
- UI components never issue direct DB writes — all writes through service functions.
- Money is integer minor units. Quantities are 4-decimal micros.
- `"use server"` for actions, `"use client"` for interactive components, no marker for server components.
- Preserve Light/Dark/System themes. Use semantic CSS variables, never hard-coded colors.
- **Zero behavior changes.** Every task below is a cleanup/standardization refactor. The 83 tests and 28 E2E tests must pass unchanged after each task.

---

## Task 1 — Remove Dead Dependencies

**Problem:** Three packages in `package.json` are either completely unused or used only in a deprecated code path:

| Package | Installed Size | Status |
|---|---|---|
| `@dnd-kit/core` + `@dnd-kit/utilities` | ~50KB | **Zero imports** anywhere in `src/` — fully dead |
| `puppeteer` | ~200-300MB | Only used in `src/modules/document-templates/html-templates/render.ts` for custom HTML template PDF rendering |
| `handlebars` | ~100KB | Same as above — only used alongside puppeteer in `html-templates/render.ts` |

**Fix:**
1. Read `src/modules/document-templates/html-templates/render.ts` and `src/modules/document-templates/template-registry.tsx` to understand how HTML templates are used.
2. Determine if the HTML template rendering path is still active and reachable from the UI. Check if any existing document template is of type `"html"` or `"custom"`.
3. **If the HTML template path is still active:** Keep `puppeteer` and `handlebars` but add a comment in `package.json` and `render.ts` explaining why they exist. Remove only `@dnd-kit/core` and `@dnd-kit/utilities`.
4. **If the HTML template path is dead/unused:** Remove all three packages (`@dnd-kit/core`, `@dnd-kit/utilities`, `puppeteer`, `handlebars`) and their type definitions (`@types/handlebars`). Delete `src/modules/document-templates/html-templates/` directory. Remove any references to the HTML rendering path from `template-registry.tsx`.
5. Run `npm install` to update `package-lock.json`.
6. Run `npm prune` to clean `node_modules`.
7. Verify: typecheck, lint, test. Confirm the remaining PDF template paths (react-pdf modern and classic) still generate PDFs correctly.

---

## Task 2 — Move Mock Data Out of Production Module

**Problem:** `src/modules/inbound-einvoicing/mock-fixtures.ts` and `src/modules/inbound-einvoicing/mock-scenarios.ts` contain test/mock data inside the production `src/modules/` directory. These bloat the production bundle and conflate test concerns with application logic.

**Fix:**
1. Read both files to understand their exports and who imports them.
2. Move `mock-fixtures.ts` and `mock-scenarios.ts` to `tests/inbound-einvoicing/` (create the directory if needed).
3. Update all imports in `src/modules/inbound-einvoicing/` that reference these files to point to the new location. Use relative imports like `../../../../tests/inbound-einvoicing/mock-fixtures` or, if the project has a `tests/` path alias, use that.
4. If no production code imports them (only test files do), simply move them and update test imports.
5. If production code does import them (e.g., a dev-mode-only mock provider), consider adding a runtime check (`if (process.env.NODE_ENV !== 'production')`) or using conditional imports.
6. Verify: typecheck, lint, test.

---

## Task 3 — Create Standardized API Auth Helper

**Problem:** (This builds on Phase 1 Task 2 which added a basic helper. This task ensures full consistency.)

API routes use inconsistent auth patterns:
- Some use `getCurrentSession()` + manual checks
- Some use `requireModule()`  
- Some use `getDocumentPdfAccess()`
- Some use `getBusinessForUser()` + role check

**Fix:**
1. Read the existing auth helper created in Phase 1 (if it exists at `src/core/auth/api-auth.ts`). If Phase 1 was not executed, create it now.
2. Ensure the helper provides a unified function signature:
   ```ts
   export async function requireApiAuth(
     request: Request,
     businessId: string,
     options?: { module?: string; requireAdmin?: boolean; allowPublic?: boolean }
   ): Promise<{ session: Session; access: BusinessAccess }>;
   ```
3. Audit every API route under `src/app/api/` and ensure each uses this helper. For any route that has unique auth needs (like `getDocumentPdfAccess`), ensure it still delegates to the same base session/access check.
4. Ensure consistent error responses: `401 Unauthorized` for no session, `403 Forbidden` for insufficient permissions.
5. Verify: typecheck, lint, test.

---

## Task 4 — Add Missing `runtime = "nodejs"` Declarations

**Problem:** Some API routes use Node.js APIs but may not declare `export const runtime = "nodejs"`. If Next.js ever defaults these to Edge runtime, they will crash.

**Fix:**
1. List all API route files: `find src/app/api -name 'route.ts'`
2. For each route, check if it imports any Node.js-only APIs (fs, path, better-sqlite3, JSZip, etc.) or calls functions that internally use Node APIs (like `getBusinessDb`).
3. Ensure every such route has `export const runtime = "nodejs";` declared.
4. Routes that only use `NextResponse.json()` and web APIs don't need it, but adding it is harmless and defensive.
5. Verify: typecheck, lint.

---

## Task 5 — Consolidate eInvoicing Validation Types

**Problem:** Two separate but structurally identical validation issue type hierarchies exist:
- `src/modules/einvoicing/einvoice-types.ts` — defines `EInvoiceValidationIssue` with layers: readiness, mapping, pint-ubl, pint-ae
- `src/modules/inbound-einvoicing/inbound-types.ts` — defines `InboundValidationIssue` with layers: security, parsing, pint-ubl, pint-ae, business, mapping

The inbound module already imports some things from the einvoicing module but not the validation types.

**Fix:**
1. Read both type definitions carefully. Document the exact differences (inbound has extra `security`, `parsing`, `business` layers).
2. Create a shared type in `src/modules/einvoicing/einvoice-types.ts`:
   ```ts
   export interface ValidationIssue {
     layer: string;      // e.g. "readiness", "mapping", "pint-ubl", "pint-ae", "security", "parsing", "business"
     severity: 'error' | 'warning';
     message: string;
     details?: string;
   }
   ```
3. Update the outbound einvoicing code to use `ValidationIssue[]` instead of its specific type.
4. Update the inbound einvoicing code to use `ValidationIssue[]` instead of `InboundValidationIssue`.
5. If there are inbound-specific fields (like `security` layer details), keep them as optional fields on the shared type.
6. Verify: typecheck, lint, test. Confirm eInvoice validation reports still render correctly in the UI.

---

## Task 6 — Fix Inconsistent CSP Headers on XML Routes

**Problem:** Two eInvoice XML download endpoints have inconsistent security headers:
- `src/app/api/businesses/[businessId]/einvoicing/[documentId]/xml/route.ts` — **NO** Content-Security-Policy header
- `src/app/api/businesses/[businessId]/purchases/einvoices/[documentId]/xml/route.ts` — **HAS** CSP: `default-src 'none'; sandbox`

**Fix:**
1. Read both files.
2. Add the same CSP header to the outbound eInvoice XML route:
   ```ts
   "Content-Security-Policy": "default-src 'none'; sandbox"
   ```
3. Verify: lint, visual check (download an eInvoice XML from both routes and confirm headers).

---

## Task 7 — Fix Schema Architecture Inversion

**Problem:** `src/core/db/business-schema.ts` imports and re-exports `accountSubtypes` and `accountTypes` from `@/modules/accounting/account-types`. The database schema module should not depend on application-level business logic modules. This creates a circular dependency risk.

**Fix:**
1. Read `src/modules/accounting/account-types.ts` to understand what `accountSubtypes` and `accountTypes` are (they are likely string literal union types or enum-like constants used in Zod schemas and Drizzle column definitions).
2. Move the type definitions for `accountTypes` and `accountSubtypes` to `src/core/db/account-types.ts` (a new file in the `core/db` package where they belong).
3. Update `business-schema.ts` to import from `./account-types` instead of `@/modules/accounting/account-types`.
4. Update `src/modules/accounting/account-types.ts` to re-export from `@/core/db/account-types` so all existing imports in the accounting module continue to work without changes.
5. Verify: typecheck, lint, test. Ensure the chart of accounts and all accounting features still work.

---

## Task 8 — Unify the `StoredLine` Type

**Problem:** Each document service defines its own `StoredLine` type with slight field variations:

| Service | Unique fields |
|---|---|
| `invoice-service.ts` | `salesAccountId`, `itemId` |
| `credit-note-service.ts` | `salesAccountId`, no `itemId` |
| `purchase-invoice-service.ts` | `expenseAccountId`, `itemId` |
| `purchase-order-service.ts` | `expenseAccountId`, `itemId` |
| `delivery-note-service.ts` | `salesInvoiceLineId`, no amounts |
| `goods-receipt-service.ts` | `purchaseOrderLineId`, `unitCostMinor` |

**Fix:**
1. Create `src/modules/documents/document-types.ts` with a base type:
   ```ts
   export interface BaseStoredLine {
     id: string;
     lineIndex: number;
     description: string;
     quantityMicros: number;
     unitPriceMinor: number;
     netAmountMinor: number;
     taxCodeId: string;
     taxAmountMinor: number;
     grossAmountMinor: number;
     projectId: string | null;
     // --- Document-specific optional fields ---
     salesAccountId?: string;
     expenseAccountId?: string;
     itemId?: string | null;
     salesInvoiceLineId?: string | null;
     purchaseOrderLineId?: string | null;
     unitCostMinor?: number;
   }
   ```
2. Update each service file to import `BaseStoredLine` and use it (either directly or as `type StoredLine = BaseStoredLine & { /* module-specific required fields */ }` where needed for type narrowing).
3. Ensure all SQL column mappings remain correct for each service.
4. Verify: typecheck, lint, test. **All 83 tests must pass.**

---

## Task 9 — Clean Up Silent Error Swallowing

**Problem:** `src/modules/einvoicing/einvoice-service.ts` has a `parseJson()` helper that returns `null` on JSON parse failure. Corrupted stored validation data would silently appear as "no validation" rather than surfacing a data integrity issue.

**Fix:**
1. Read the `parseJson()` function and all its call sites.
2. If the parsed data is optional/display-only (e.g., rendering a validation report that may not exist), keep the `null` return but add `console.warn` with the parse error so issues are visible in server logs:
   ```ts
   export function parseJson<T>(value: string | null): T | null {
     if (!value) return null;
     try {
       return JSON.parse(value) as T;
     } catch (e) {
       console.warn(`[eInvoicing] Failed to parse stored JSON: ${(e as Error).message}`);
       return null;
     }
   }
   ```
3. If any call site relies on `null` to mean "no data" vs "corrupted data" and the distinction matters (e.g., deciding whether to show a validation badge), consider returning a discriminated union or adding a `parseError` flag.
4. Keep the change minimal — just add the warning. Do not change the return type or call-site logic.
5. Verify: typecheck, lint, test.

---

## Task 10 — Audit and Fix the `selectClass` Residual

**Problem:** Phase 2 Task 3 should have eliminated the `const selectClass` constant from all 35 files and replaced it with a `SelectNative` component. This task verifies the cleanup was complete and fixes any remaining inconsistencies.

**Fix:**
1. Search for any remaining `const selectClass` in `src/`. If Phase 2 was executed, there should be zero. If not, note the count but do not fix (that's Phase 2's job).
2. Search for any remaining raw `<select` elements in `src/modules/` that don't use either the shadcn `Select` component or the `SelectNative` component. List them.
3. If Phase 2 was executed, verify the `SelectNative` component exists at `src/components/ui/select-native.tsx` and is used consistently.
4. If Phase 2 was not executed, skip this task.
5. Verify: typecheck, lint.

---

## Verification Checklist (Run After EACH Task, and Again After ALL Tasks)

```bash
npm run typecheck    # Zero errors
npm run lint         # Zero errors  
npm run test        # 83/83 pass
```

After all tasks, also run:
```bash
npm run test:e2e    # 28/28 pass
npm install         # Clean package-lock.json
npm prune           # Clean node_modules
```

Manual checks:
1. `npm install` completes without errors and node_modules is smaller (if puppeteer was removed).
2. PDF generation for sales invoice still works.
3. eInvoice validation report displays correctly.
4. Chart of accounts page loads and account types display properly.
5. XML download headers are consistent for both inbound and outbound routes.

---

## What NOT to do

- Do NOT change any business logic, accounting math, or posting behavior.
- Do NOT add new features, new modules, or new pages.
- Do NOT refactor beyond what is specified above.
- Do NOT use `drizzle-kit push` on any database.
- Do NOT import `better-sqlite3` or Node modules in middleware.ts.
- Do NOT use `bun run` — use `npm run` for all commands.
- Do NOT start Phase 4 work.
- Do NOT rename any database tables or columns.
- Do NOT change any API route signatures or return formats.
- Do NOT remove or alter the existing eInvoice validation layer architecture (PINT-UBL + PINT-AE).
