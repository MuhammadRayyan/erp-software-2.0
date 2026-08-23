# Phase 2 — Duplication Elimination (High Priority)

## Context

This is a Next.js 16 + React 19 + TypeScript 6 + Drizzle ORM + SQLite modular-monolith ERP application inspired by Manager.io. Each business has its own SQLite database under `data/businesses/<id>/business.sqlite`. A system database at `data/system/system.sqlite` stores auth, business registry, and memberships.

**Working commands:** `npm run dev` (Node only, not bun), `npm run typecheck`, `npm run lint`, `npm run test` (83 tests), `npm run test:e2e` (28 Playwright tests).

**Key rules:**
- Never use `drizzle-kit push` on real data — use the explicit migration runner.
- Never import `better-sqlite3` or Node modules in `src/middleware.ts` (Edge runtime).
- UI components never issue direct DB writes — all writes through service functions.
- Money is integer minor units. Quantities are 4-decimal micros.
- `"use server"` for actions, `"use client"` for interactive components, no marker for server components.
- Preserve Light/Dark/System themes. Use semantic CSS variables (`bg-surface`, `text-foreground`, `border-border`), never hard-coded colors.
- The app uses shadcn/ui components from `src/components/ui/` — prefer those over custom HTML.
- **Zero behavior changes.** Every task below is a pure refactor. The 83 tests and 28 E2E tests must pass unchanged after each task.

---

## Task 1 — Extract Shared Zod Schemas

**Problem:** Identical Zod validation schemas are copy-pasted across 6+ document module `*-input.ts` files.

**Specific duplications:**
- `quantitySchema` — identical regex validation defined in `sales-invoices/invoice-input.ts`, `sales-credit-notes/credit-note-input.ts`, `purchase-invoices/purchase-invoice-input.ts`, `purchase-orders/purchase-order-input.ts`
- `moneySchema` / `moneyInputSchema` — identical in the same 4 files
- `projectIdField` — `z.union([z.literal(""), z.string().uuid(...)]).optional().default("")` defined 8+ times across the same 4 files (both header and line level)
- `eInvoiceTransactionFlags` — identical 8-flag boolean object schema in `sales-invoices/invoice-input.ts` and `sales-credit-notes/credit-note-input.ts`
- Customer/Supplier shared fields — `trn` regex (`/^1\d{12}03$/`), `defaultCurrencyCode`, `electronicAddress`, `electronicAddressScheme`, `legalRegistrationIdentifier` are defined in both `customers/customer-input.ts` and `suppliers/supplier-input.ts`

**Fix:**
1. Create `src/core/validation/document-schemas.ts` containing:
   - `quantitySchema`
   - `moneySchema`
   - `projectIdField`
   - `eInvoiceTransactionFlagsSchema`
2. Create `src/core/validation/party-schemas.ts` containing:
   - `trnSchema`
   - `defaultCurrencyCodeSchema`
   - `electronicAddressSchema`
   - `electronicAddressSchemeSchema`
   - `legalRegistrationIdentifierSchema`
3. Update all 4 document input files to import from `@/core/validation/document-schemas` instead of defining locally.
4. Update `customer-input.ts` and `supplier-input.ts` to import from `@/core/validation/party-schemas`.
5. Delete the local definitions from each file.
6. Verify: typecheck, lint, test.

---

## Task 2 — Extract Shared Form UI Components

**Problem:** Repeated UI patterns are copy-pasted across form files instead of being shared components.

### 2a. `FormError` Component
A `<div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">` is repeated in **19 form files**.

**Fix:**
1. Create `src/components/form-error.tsx`:
   ```tsx
   "use client";
   export function FormError({ message }: { message: string }) {
     if (!message) return null;
     return (
       <div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">
         {message}
       </div>
     );
   }
   ```
2. Find and replace all 19 occurrences across form files with `<FormError message={error} />`.
3. Verify: typecheck, lint, visual check on a few forms.

### 2b. `DocumentFormFooter` Component
The sticky bottom action bar is repeated in 5+ document form files:
```tsx
"sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x"
```

**Fix:**
1. Create `src/components/document-form-footer.tsx`:
   ```tsx
   export function DocumentFormFooter({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
     return (
       <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x">
         <Button variant="ghost" onClick={onCancel}>Cancel</Button>
         <div className="flex items-center gap-3">{children}</div>
       </div>
     );
   }
   ```
2. Replace in: `invoice-form.tsx`, `credit-note-form.tsx`, `purchase-invoice-form.tsx`, `purchase-order-form.tsx`, `project-form.tsx`, and any others using the same pattern.
3. Verify: typecheck, lint, visual check on form sticky footer behavior.

---

## Task 3 — Eliminate the `selectClass` Constant (35 Files)

**Problem:** `const selectClass = "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"` is defined in **35 files** with 3 inconsistent variants (`px-2.5` vs `px-3`, `rounded-[6px]` vs `rounded-md`, missing `w-full` in 2 files, extra `disabled:opacity-60` in 2 files).

**Fix:**
1. Create `src/components/ui/select-native.tsx`:
   ```tsx
   export function SelectNative({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
     return (
       <select
         className={cn(
           "h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60",
           className
         )}
         {...props}
       />
     );
   }
   ```
   Note: This is for native `<select>` elements (the project uses custom shadcn `Select` in some places and native `<select>` in others — unify the native ones here).
2. Search all 35 files for `const selectClass` and replace `<select className={selectClass}` with `<SelectNative`. Remove the local `const selectClass` from each file.
3. Standardize the class string to the canonical version above (includes `disabled:opacity-60` and `disabled:cursor-not-allowed`).
4. Verify: typecheck, lint. Open several forms in the browser and confirm dropdowns look and behave identically.

---

## Task 4 — Extract Shared Document Line Calculation Logic

**Problem:** `calculateLines()` (validates accounts, tax codes, computes net/tax/gross) and `totalsFromLines()` (sums subtotal/tax/total) are implemented 4 times each across:
- `src/modules/sales-invoices/invoice-service.ts`
- `src/modules/sales-credit-notes/credit-note-service.ts`
- `src/modules/purchase-invoices/purchase-invoice-service.ts`
- `src/modules/purchase-orders/purchase-order-service.ts`

All follow the same pattern:
1. Fetch active accounts/tax codes/projects/items from DB
2. For each input line: validate account exists, tax code exists, direction matches, compute `quantityMicros`, `unitPriceMinor`, `netAmountMinor`, `taxAmountMinor`, `grossAmountMinor`
3. Sum lines into subtotal/tax/total

**Fix:**
1. Read all 4 implementations carefully. Note the differences:
   - Sales uses `salesAccountId`, purchases use `expenseAccountId`
   - Sales invoices and credit notes check `direction = 'output'`, purchases check `direction = 'input'`
   - Credit notes don't have `itemId`
   - The SQL for fetching accounts differs by account type (`income` vs `expense`)
2. Create `src/modules/accounting/services/document-line-calculator.ts`:
   ```ts
   // Generic parameters:
   // - accountTypeFilter: 'income' | 'expense'
   // - taxDirection: 'output' | 'input'
   // - supportItems: boolean
   // - accountFieldOnLine: 'salesAccountId' | 'expenseAccountId' (for error messages)
   ```
   The function should:
   - Accept a DB connection, input lines, and config
   - Fetch accounts (filtered by type), tax codes, projects, items (if needed)
   - Return `{ storedLines: StoredLine[], subtotalMinor, taxMinor, totalMinor }`
3. Refactor each of the 4 services to call this shared function with their specific config.
4. The `StoredLine` type should be defined once in the shared file with all possible optional fields.
5. Keep the `totals()` helper as a simple exported pure function in the same file.
6. Verify: typecheck, lint, test. **All 83 tests must pass.**

---

## Task 5 — Unify Receipt and Supplier Payment Services

**Problem:** `src/modules/receipts/receipt-service.ts` (292 lines) and `src/modules/supplier-payments/supplier-payment-service.ts` (284 lines) are near-structural clones. They share:
- `invoiceOpenState()` ↔ `payableOpenState()` — same SQL, different tables
- `createXxx()` — identical flow: validate party → validate invoice → resolve rate → parse amount → check open balance → `calculateSettlementAllocation` → allocate number → INSERT header → INSERT allocation → post
- `voidXxx()` — identical: check statement line → check reconciliation → `reverseTransaction` → update status → unmatch statement line
- `listXxx()` / `getXxx()` — identical SQL structure
- The bank statement unmatch SQL and reconciliation check SQL are byte-for-byte identical

**Fix:**
1. Create `src/modules/settlement/settlement-service.ts` containing a parameterized base:
   ```ts
   type SettlementConfig = {
     partyType: 'customer' | 'supplier';
     partyTable: string;
     partyIdColumn: string;
     documentTable: string;        // sales_invoices or purchase_invoices
     documentIdColumn: string;     // invoice_id or purchase_invoice_id
     documentNumberColumn: string; // invoice_number or purchase_invoice_number
     openAmountExpr: string;       // SQL fragment for computing open amount
     paymentTable: string;         // customer_receipts or supplier_payments
     paymentNumberColumn: string;
     allocationTable: string;
     // ... account mappings (AR/AP, Bank/Cash, Realized FX)
   };
   ```
2. Implement generic functions:
   - `getOpenState(db, config, partyId)` — replaces both `invoiceOpenState` and `payableOpenState`
   - `calculateAllocation(db, config, paymentAmount, partyId, allocations)` — replaces both allocation calculators
   - `createSettlement(db, config, input)` — replaces both `createReceipt` and `createSupplierPayment`
   - `voidSettlement(db, config, paymentId)` — replaces both `voidReceipt` and `voidSupplierPayment`
3. Refactor `receipt-service.ts` and `supplier-payment-service.ts` to be thin wrappers that call the shared service with their config.
4. Keep the list/get functions that return module-specific data (like `listReceipts` returning receipt-shaped rows) in the original files — only extract the duplicated logic.
5. Verify: typecheck, lint, test. **All 83 tests must pass.**

---

## Task 6 — Extract Generic Document View Actions Component

**Problem:** Six view-actions files are near-identical:
- `sales-invoices/invoice-view-actions.tsx`
- `sales-credit-notes/credit-note-view-actions.tsx`
- `purchase-invoices/purchase-invoice-view-actions.tsx`
- `purchase-orders/purchase-order-view-actions.tsx`
- `receipts/receipt-view-actions.tsx`
- `supplier-payments/supplier-payment-view-actions.tsx`

All share: `useState<Confirm>(null)`, `useState(false)` (pending), `useState("")` (error), `useRouter()`, identical confirm dialog markup with error alert, identical duplicate/void function structure.

**Fix:**
1. Create `src/components/document-view-actions.tsx`:
   ```tsx
   "use client";
   // Generic props:
   type DocumentViewActionsProps = {
     documentNumber: string;
     documentType: string;         // e.g. "Invoice", "Credit Note"
     editHref: string;
     pdfHref?: string;
     xmlHref?: string;
     emailHref?: string;
     onDuplicate: () => Promise<void>;
     onVoid?: { label: string; description: string; action: () => Promise<void> };
     onDelete?: { label: string; description: string; action: () => Promise<void> };
     extraActions?: React.ReactNode;  // module-specific actions (e.g. eInvoice)
   };
   ```
   The component renders: Edit button, PDF button (if href), email button (if href), XML button (if href), More dropdown (Duplicate, Void, Delete, extraActions).
2. Refactor each of the 6 files to use `<DocumentViewActions>` with module-specific props.
3. Some modules have additional custom actions (e.g., eInvoice preparation on sales invoices). These go into the `extraActions` slot.
4. Verify: typecheck, lint. Open invoice view, credit note view, purchase invoice view in the browser. Confirm all buttons work, duplicate/void dialogs function correctly.

---

## Task 7 — Parameterize PDF Templates

**Problem:** Seven PDF template files share ~90% identical JSX:
- Modern: `invoice-template.tsx`, `credit-note-template.tsx`, `purchase-order-template.tsx`
- Classic: `classic-invoice-template.tsx`, `classic-credit-note-template.tsx`, `classic-purchase-order-template.tsx`, `classic-receipt-template.tsx`

Differences are only: title text, party label, whether to show due date/TRN, and "Total" vs "Total Credit".

**Fix:**
1. Read `src/modules/document-templates/react-pdf/primitives.tsx` to understand the shared styles and color system.
2. For the **Modern** family, create `src/modules/document-templates/react-pdf/modern-document-template.tsx`:
   ```tsx
   type DocumentTemplateVariant = {
     title: string;           // "INVOICE" | "CREDIT NOTE" | "PURCHASE ORDER" | "RECEIPT"
     partyLabel: string;      // "Bill To" | "Credit To" | "Supplier"
     showDueDate: boolean;
     showBuyerTrn: boolean;
     totalLabel: string;      // "Total" | "Total Credit"
     showTax: boolean;
   };
   ```
   The component takes `InvoiceTemplateData` (already shared) + variant config and renders the document.
3. Replace the 3 modern template files with re-exports from the unified template.
4. Do the same for the **Classic** family: `src/modules/document-templates/react-pdf/classic-document-template.tsx`.
5. Replace the 4 classic template files with re-exports.
6. Ensure `src/modules/document-templates/template-registry.tsx` still correctly resolves templates.
7. Verify: typecheck, lint. Generate a PDF for at least: sales invoice, credit note, purchase order, and receipt. Confirm visual output is identical to before.

---

## Task 8 — Extract Section Loading and Error Boundaries

**Problem:** 14 `loading.tsx` and 15 `error.tsx` files under `src/app/b/[businessId]/*/` are identical except for the section label text (e.g., "Loading Sales…", "Loading Purchases…").

**Fix:**
1. Create `src/components/section-loading.tsx`:
   ```tsx
   export function SectionLoading({ label }: { label: string }) {
     return (
       <div className="flex items-center justify-center py-12">
         <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
         <span className="ml-2 text-sm text-muted-foreground">Loading {label}…</span>
       </div>
     );
   }
   ```
2. Create `src/components/section-error.tsx`:
   ```tsx
   "use client";
   export function SectionError({ label, error, reset }: { label: string; error: Error & { digest?: string }; reset: () => void }) {
     return (
       <div className="mx-auto max-w-prose px-4 py-12 text-center">
         <h2 className="text-lg font-medium text-foreground">Something went wrong</h2>
         <p className="mt-1 text-sm text-muted-foreground">Could not load {label}.</p>
         {process.env.NODE_ENV === 'development' && (
           <pre className="mt-4 text-left text-xs text-danger">{error.message}</pre>
         )}
         <Button variant="outline" onClick={reset} className="mt-4">Try again</Button>
       </div>
     );
   }
   ```
3. Replace all 14 `loading.tsx` files with:
   ```tsx
   import { SectionLoading } from "@/components/section-loading";
   export default function Loading() { return <SectionLoading label="Sales" />; }
   ```
   Use the appropriate label for each module (Sales, Purchases, Inventory, Banking, Accounting, Projects, Reports, eInvoicing, Overview).
4. Replace all 15 `error.tsx` files similarly with `<SectionError>`.
5. Verify: typecheck, lint. Navigate to several modules and confirm loading spinners and error states still render correctly (trigger an error by temporarily breaking a component, then revert).

---

## Task 9 — Extract Shared Posting Helpers

**Problem:** Three posting service files define identical helper functions:
- `src/modules/accounting/services/invoice-posting-service.ts` — defines `addCredit()` (lines 47-60)
- `src/modules/accounting/services/credit-note-posting-service.ts` — defines `addProjectAmount()` + `addAmount()` (minified on lines 10-11)
- `src/modules/accounting/services/purchase-invoice-posting-service.ts` — defines `addAmount()` + `addProjectAmount()` (lines 10-19)

All three are the same: aggregate amounts into a `Map<string, ProjectAmount>` grouped by `accountId\0projectId`.

**Fix:**
1. Create `src/modules/accounting/services/posting-helpers.ts`:
   ```ts
   export type ProjectAmount = { accountId: string; projectId: string | null; amountMinor: number };

   export function addProjectAmount(
     group: Map<string, ProjectAmount>,
     accountId: string,
     projectId: string | null,
     amountMinor: number,
   ): void {
     const key = `${accountId}\u0000${projectId ?? ""}`;
     const current = group.get(key);
     group.set(key, {
       accountId,
       projectId,
       amountMinor: addMinor([current?.amountMinor ?? 0, amountMinor]),
     });
   }

   export function addAmount(
     group: Map<string, number>,
     accountId: string,
     amountMinor: number,
   ): void {
     group.set(accountId, addMinor([group.get(accountId) ?? 0, amountMinor]));
   }
   ```
2. Import from `./posting-helpers` in all 3 posting services.
3. Remove the local definitions.
4. Verify: typecheck, lint, test. **All 83 tests must pass.**

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
```

Visual spot-checks in the browser:
1. Open sales invoice form — confirm select dropdowns, sticky footer, error display work
2. Open purchase invoice form — same checks
3. Open a sales invoice view — confirm Edit/PDF/Duplicate/Void actions work
4. Generate a sales invoice PDF — confirm visual output unchanged
5. Navigate between modules — confirm loading spinners appear
6. Create + void a receipt — confirm settlement flow works

---

## What NOT to do

- Do NOT change any business logic, accounting math, or posting behavior.
- Do NOT add new features, new modules, or new pages.
- Do NOT refactor beyond what is specified above (e.g., do not touch the void pattern in document services, do not consolidate customer/supplier CRUD — those belong to a later phase).
- Do NOT use `drizzle-kit push` on any database.
- Do NOT import `better-sqlite3` or Node modules in middleware.ts.
- Do NOT use `bun run` — use `npm run` for all commands.
- Do NOT start Phase 3 work.
- Do NOT rename any database tables or columns.
- Do NOT change any API route signatures or return formats.
