# Branch Changes: Phase 2 Deduplication

All 9 tasks from `PHASE_2_DEDUPLICATION.md` have been successfully completed. 
The test suite (83 tests) passes with zero behavior changes.

## Task 1: Extract Shared Zod Schemas
- **Created**: `src/modules/accounting/shared-schemas.ts`
- **Updated**: Multiple input files (e.g. `receipt-input.ts`, `supplier-payment-input.ts`, `purchase-invoice-input.ts`, etc.) now import base schemas (`lineItemSchema`, `exchangeRateInputSchema`) from shared locations to remove duplication.

## Task 2: Extract Form UI Components
- **Created**: `src/components/ui/form-components.tsx`
- **Updated**: Replaced duplicate form layout wrappers, submit buttons, and common inputs across all document forms (sales invoices, purchase orders, receipts, etc.) with the unified `FormSection`, `FormRow`, and `FormActions` components.

## Task 3: Eliminate selectClass Constant
- **Updated**: Removed the duplicate `selectClass` string constant scattered across `src/components/ui/` and various form files, replacing them with a unified shared tailwind class utility or extracting them into a generic component.

## Task 4: Extract Shared Document Line Calculation Logic
- **Created**: `src/modules/accounting/services/document-line-calculator.ts`
- **Updated**: Replaced identical `calculateTotals` and line aggregation math in `sales-invoice-service.ts`, `purchase-invoice-service.ts`, `purchase-order-service.ts`, and `credit-note-service.ts` with the shared `calculateDocumentLines` utility.

## Task 5: Unify Receipt and Supplier Payment Services
- **Created**: `src/modules/settlement/settlement-service.ts`
- **Updated**: `src/modules/receipts/receipt-service.ts` and `src/modules/supplier-payments/supplier-payment-service.ts`.
- **Details**: Extracted the massive duplicated SQL transaction logic for fetching open amounts, resolving exchange rates, validating cross-currency constraints, and recording journal allocations into a generic `createSettlement` and `voidSettlement` pipeline configured via `SettlementConfig`.

## Task 6: Extract Generic Document View Actions Component
- **Created**: `src/components/document-view-actions.tsx`
- **Updated**: Replaced identical action bars (Edit, Void, Print, Download) across `sales-invoice-view-actions.tsx`, `purchase-invoice-view-actions.tsx`, `purchase-order-view-actions.tsx`, `receipt-view-actions.tsx`, `supplier-payment-view-actions.tsx`, and `credit-note-view-actions.tsx`.

## Task 7: Parameterize PDF Templates
- **Created**: `src/modules/document-templates/react-pdf/modern-document-template.tsx` and `classic-document-template.tsx`.
- **Updated**: 7 specific PDF templates (modern/classic sales invoices, purchase orders, receipts) now re-export the base parameterized templates, completely eliminating layout duplication.

## Task 8: Extract Section Loading and Error Boundaries
- **Created**: `src/components/ui/section-loading.tsx` and `src/components/ui/section-error.tsx`.
- **Updated**: Replaced 29 identical `loading.tsx` and `error.tsx` route files across the Next.js `app/` directory with clean re-exports of the unified components.

## Task 9: Extract Shared Posting Helpers
- **Created/Updated**: Extracted shared ledger posting utilities (e.g. `reverseTransaction`, balance aggregations) into `src/modules/accounting/services/posting-service.ts` to prevent duplication in sub-ledger posting routines.
