# Current State (accounting through Phase 9 · engineering through Sprint 2)

This is the compact source of truth for the code that exists now. Historical phase files describe intent; use them only for targeted archaeology.

## Stack and architecture

- Node 24 container, npm, Next.js 16 App Router, React 19, strict TypeScript 6, Tailwind CSS 4, Radix/shadcn-style components, React Hook Form, Zod, and TanStack Table.
- One Next.js application owns UI, server components/actions, authenticated download routes, domain services, and persistence; there is no separate API or worker service.
- Better Auth provides local email/password auth. The system SQLite database stores auth tables, businesses, and memberships. Each business has a separate SQLite database and attachment directory, accessed with `better-sqlite3`/Drizzle through membership-aware services.
- Domain logic is server-side; multi-row document posting and accounting/tax/inventory effects use SQLite transactions. Document money remains integer currency-minor units, exchange rates are canonical decimal strings evaluated with `decimal.js`, and quantities support four decimals (`10_000` scale) despite historical `*_micros` names.
- Docker Compose Watch is the primary development path. Light, Dark, and System themes use the shared tokens in `docs/THEME.md`.
- `.erpbackup` v2 files contain a checksummed business database plus attachments and portable country/base-currency/fiscal metadata. Import creates a new isolated business, restores that metadata and the business-local currency/rate state, runs pending migrations, makes the importer Administrator, and disables eInvoice provider execution.

## Implemented modules

- Foundation: authentication, business create/switch/rename/archive/delete, memberships and module permissions, responsive app shell, themes, seed data, backup/import, project attachments, and permission-checked file/PDF/XML/CSV routes.
- Master data/settings: customers and suppliers with legal, tax, registration, electronic-address, registered-address identity fields, and optional default currencies; business-local currency master/rates; realized FX account mappings; Chart of Accounts; accounting mappings; tax codes; document numbering; UAE VAT registration; Electronic Invoicing settings; and a @react-pdf/renderer and Puppeteer-based document-template designer.
- Sales/AR: base- or foreign-currency draft/posted/void Sales Invoices, same-currency Receipts with base Bank/Cash postings and allocations/reversals, inherited-rate Sales Credit Notes and allocations, multi-currency customer statements, base-carrying AR ageing, PDFs, and source/eInvoice views.
- Purchases/AP: base- or foreign-currency non-posting Purchase Orders, draft/posted/void Purchase Invoices, same-currency Supplier Payments with base Bank/Cash postings and reversals, multi-currency supplier statements, base-carrying AP ageing, and PDFs.
- Accounting/reporting: base-currency source-generated journal entries/lines, journal drill-down, General Ledger with pre-period opening balances, Trial Balance, bank/cash balance reporting, and mapped Realized FX Gain/Loss. There is no manual journal-entry workflow.
- Projects: customer-linked projects, numbering/status/dates/budgets/manager, notes/files, header and line tagging, linked operational documents, commitments, payment attribution, and ledger-derived profitability.
- Inventory: items, locations, Goods Receipts, Delivery Notes, Stock Adjustments/opening balances, movement-derived history, moving-average valuation, Stock on Hand, Inventory Movement, Items to Receive, and Items to Deliver.
- Banking: GL-mapped Bank Accounts, CSV statement import/mapping/deduplication, matching/ignore controls, Money In/Out Bank Transactions, one-document Bank Transfers, reconciliation, transaction history, and reconciliation reports.
- UAE VAT: signed posting snapshots, working papers, explicit periods, review issues, manual adjustments, drill-down/export/reconciliation, finalization/locking/reopening, audit history, and Filed Externally snapshots.
- Outbound UAE Electronic Invoicing: posted Sales Invoices/Credit Notes to a provider-neutral canonical model, versioned PINT-AE UBL XML, official Schematron validation, immutable payload archive/hash, register/detail/status UI, append-only submission history, and a local Mock ASP.
- Inbound UAE Electronic Invoicing: a purchases inbox and review detail for Mock-received PINT-AE supplier Invoices/Credit Notes, safe XML parsing and official validation, immutable originals/hashes/canonical snapshots/history, hard and likely duplicate controls, server-verified buyer/Supplier identities, deterministic PO/Goods Receipt/line matching, comparison views, and human-reviewed Purchase Invoice Draft creation.
- Multi-currency foundation: per-business currency master, configurable minor units, one pre-activity base currency, dated Manual/CBUAE-labelled rates, immutable posting snapshots, deterministic base conversion, foreign AR/AP carrying values, realized settlement FX, base-valued inventory/projects/reports/VAT, currency-aware PDFs, and demo USD/EUR workflows. There are no live-rate calls.

## Important domain rules

### Database, accounting, and projects

- Draft commercial/inventory documents have no ledger or VAT effect. All generated journals must have at least two valid active-account lines, exactly one side per line, positive equal debit/credit totals, and a unique `(source_type, source_id)`.
- Posting, source-journal replacement, tax snapshots, and related movements are atomic. Editing a posted supported source replaces its journal lines instead of adding a second source journal; void/reversal paths retain the original and create opposite audit postings where implemented.
- Line net and tax are deterministically rounded to minor units. AR/AP balances are derived from posted document totals less live posted allocations/credits; allocations cannot exceed the remaining balance, and reversing a Receipt/Supplier Payment releases its allocation.
- Sales post AR / Revenue / Output VAT. Service purchases post Expense / recoverable Input VAT / AP; non-recoverable purchase tax is added to expense. Inventory Purchase Invoice lines post Inventory Asset / Input VAT / AP but do not move stock. Reverse-charge purchases keep VAT out of the supplier gross total and post both supported output and recoverable input VAT legs.
- Purchase Orders never post. Project profitability reads only posted income/expense journal lines. Revenue/cost lines may carry a Project; control, bank, Inventory Asset, AR/AP, and VAT lines remain untagged. Delivery COGS and adjustment P&L lines preserve the effective Project.

### Multi-currency accounting

- The single rate convention everywhere is **base-currency units per 1 foreign-currency unit**. Rates are stored as precise text decimals, validated as positive, and converted with `decimal.js`; authoritative values are rounded once to the target currency's configured minor unit.
- Every business owns its currency master and dated exchange-rate rows. AED, USD, EUR, and JPY are seeded examples, not global mutable records. The base currency can be selected before accounting activity but is locked once posted accounting/tax/inventory activity exists. Base Bank/Cash accounts and the general ledger remain base-currency only.
- Sales Invoices, Sales Credit Notes, Purchase Orders, and Purchase Invoices store native currency plus rate/date/source snapshots. Posted invoices, credit notes, purchase invoices, their base totals, tax snapshots, and journals are immutable with respect to later rate-table edits. Linked foreign Sales Credit Notes inherit the source invoice's compatible snapshot.
- Foreign Sales post AR, revenue, and VAT in base currency while AR retains both the foreign open amount and base carrying amount. Foreign Purchases do the same for AP, expense/inventory, and VAT. Inventory acquisition cost, moving-average valuation, Project profitability, Trial Balance, General Ledger, VAT working papers, and dashboard controls remain base-valued.
- Receipts and Supplier Payments allocate only to documents in the same currency. The selected settlement rate determines the base Bank/Cash movement; each allocation releases proportional base carrying value, and the exact final allocation clears the stored residual. The difference posts to mapped Realized FX Gain or Loss. Reversal restores the exact foreign open and base carrying amounts and reverses the original journal.
- No foreign Bank Accounts, cross-currency allocation, unrealized revaluation, rate download, background rate refresh, or FX translation reserve exists. These are deliberate Phase 9 boundaries.

### Inventory and banking

- Physical stock is the sum of movements per item/location. Receipts and positive adjustments add value; Delivery Notes and negative adjustments issue at the current moving-average value and cannot create negative stock. A latest posted source may atomically rebuild/remove its movements; later dependent movements prevent that change.
- A posting cannot be backdated before a later movement for the same item/location. A posted inventory source cannot be edited or voided when later valuation-dependent movements exist. Linked PO/Purchase Invoice/Sales Invoice ownership, party, item, status, line identity, and cumulative receive/deliver quantities are revalidated inside the transaction.
- Goods Receipts change physical quantity/value but do not post AP or a journal. Purchase Invoices can post Inventory Asset without changing physical stock. This deliberate timing split can temporarily separate movement valuation from the Inventory Asset ledger.
- Bank Accounts map one-to-one to active base-currency bank/cash Asset accounts; Book Balance is the mapped GL balance. Foreign Receipts/Payments therefore show native settlement value alongside their base Bank/Cash movement, while imported statements and reconciliation remain base currency. Statement import never posts. Matching stores control relationships without mutating or duplicating the source journal. Transfers use one source journal across two accounts. Reconciliation can complete only at zero difference and never changes the ledger; completed reconciliations block destructive changes to included items.

### UAE VAT and Electronic Invoicing

- Posted tax detail is a posting-time classification snapshot and the source for VAT working papers and eInvoice tax mapping; reports do not recompute it from current tax-code names/settings. While unlocked, a posted source edit replaces its tax rows transactionally; voids add signed reversal rows. Categories are `standard`, `zero_rated`, `exempt`, `out_of_scope`, `reverse_charge`, and `import`; directions and recoverability are explicit.
- UAE VAT-relevant foreign-currency documents require an explicit rate labelled `CBUAE` for the exact tax date before posting. Tax entries retain native taxable/tax amounts plus the immutable CBUAE-labelled rate snapshot and AED equivalents. Foreign reverse-charge purchases snapshot equal base output and recoverable input VAT legs. A generic Manual rate cannot satisfy this VAT rule.
- Standard-rated Sales require an explicit/default supply Emirate when VAT registered. Historical standard-rate rows are backfilled only when safe; ambiguous historical 0% classifications and missing Emirates remain review items rather than being guessed.
- VAT periods are explicit, non-overlapping date ranges, not assumed monthly/quarterly periods. Finalization requires cleared review items, stores an immutable snapshot, and locks VAT-affecting transactions through the latest finalized/filed period. Administrator reopening requires a reason and recalculates the lock. `Filed Externally` records an outside filing and never represents ERP submission to EmaraTax/FTA.
- The provider-neutral PINT-AE boundary still supports only posted outbound Sales Invoices and Sales Credit Notes for domestic AED, normal transaction flags, UAE parties, and Phase 6 `standard` 5% or `zero_rated` 0% lines. Foreign-currency sources fail preparation honestly; Phase 9 does not broaden PINT-AE FX mapping. Missing seller/buyer identity, address, endpoints, tax snapshot, unit mapping, credit reason, or unsupported VAT/transaction flags blocks preparation; data is not guessed.
- Mapping is `ERP source + Phase 6 tax snapshot -> canonical document -> PINT-AE 1.0.4 Invoice/CreditNote XML`. Both stored official PINT-UBL and PINT-AE Saxon-JS validators run; XML and canonical JSON, UUID, version, SHA-256, validation report, and source identity are archived.
- A Ready snapshot is invalidated by an unsubmitted financial edit but retains its UUID/spec identity for regeneration. Submitted, Accepted, and Rejected source snapshots are immutable; rejected retries append an attempt and reuse the same XML. Accepted corrections require a new Credit Note/correction document. Provider activity never changes journals, AR/AP, VAT, stock, receipts, or allocations.
- Only the Mock ASP is executable. Storage is provider-neutral and can represent disabled/mock/sandbox/production, but current settings accept only Disabled or Mock. PDF and Electronic Invoice XML are separate artifacts.
- Inbound receipt accepts UTF-8 PINT-AE 1.0.4 Invoice or CreditNote XML up to 2 MiB through the enabled Mock provider only. DTDs, entities, external includes, extra processing instructions, malformed roots/namespaces, and uninstalled specification versions are rejected before archival. Both official Phase 7 validation layers run before business review.
- Development Mock intake provides explicitly labelled valid Invoice, invalid Invoice, hard duplicate, unknown Supplier, PO-matched, Goods-Receipt-matched, VAT-mismatch, and unsupported Credit Note scenarios. Fixtures are local only and never contact a network or government service.
- Every accepted inbound payload retains its original XML, SHA-256, canonical facts, validation report, provider/network identity, and append-only event history. Original facts are database-immutable and documents are archived rather than deleted. Provider event/document IDs, raw hash, and UUID plus strong seller identity are hard duplicate keys; Supplier invoice number and same Supplier/date/currency/total checks surface reviewable duplicates.
- Buyer identity is verified against server-held business Electronic Invoicing/VAT identity. Supplier matching uses exact endpoint plus scheme, then exact TRN, legal registration identifier, and confirmed identity mappings; legal-name-only matching is never automatic. Ambiguous or missing identities require a human selection, and confirmed strong identities can be retained.
- Explicit PO and Goods Receipt references are matched exactly and must belong to the confirmed Supplier. Line matching accepts an exact PO line reference/position, Supplier item mapping, or ERP item identifier; an exact description/quantity/unit-price triple is only a `Possible Match` and requires confirmation. Review shows ordered, posted received, previously invoiced, current, and variance quantities.
- Inbound Phase 6 VAT mapping supports standard-rated 5% and zero-rated 0% purchase codes when a unique compatible code exists. Unsupported categories/rates, locked VAT dates, allowances/charges, amount-due differences, unresolved lines, duplicates, identity failures, and validation findings block draft creation.
- Receiving or reviewing an inbound document never posts AP, journals, VAT, or stock. A Ready document can create one normal Purchase Invoice in `draft` status only. Final posting remains a separate human action through the existing Purchase Invoice service, which revalidates source identity, dates, totals, quantities, prices, VAT category/rate, duplicate invoice number, and VAT-period locks before using the established accounting/tax posting path.

## Current Sprints Status

- [x] Sprint 0: Foundation & Edge Safety
- [x] Sprint 1: Correctness & Performance
- [x] Sprint 2: PDF Engine Migration (React PDF + Puppeteer hybrid)
- [ ] Sprint 3: Document Uploads & GCS
- [ ] Sprint 4: Theming & UX Polish
- [ ] Sprint 5: E2E Testing & Playwright

## Migrations and compatibility deviations

- The system schema is version `1`. Business migrations are ordered versions `0`-`10`: baseline, accounting, AR/AP, projects, inventory, banking, UAE VAT, outbound eInvoicing, inbound supplier eInvoicing, multi-currency foundation, and document template settings. Each database has its own `schema_migrations`; pending migrations run once in individual immediate transactions and perform foreign-key checks.
- Migration `9` creates business-local currencies/rates, base-currency and realized-FX settings, document/rate/base snapshots, native/base tax snapshots, and foreign/base allocation fields. It backfills existing data as base-currency facts and installs immutability/validation triggers. SQLite cannot add a non-null `REFERENCES` column to a populated table with foreign keys enabled, so legacy document currency columns are backfilled additive columns guarded by equivalent insert/update currency-existence triggers; newly created schema still declares the references in the Drizzle model.
- `npm run db:migrate` uses the explicit SQLite runner for dynamically located business databases. Do not use `drizzle-kit push` on real data. Missing/out-of-order/renamed/unknown/newer migration histories are rejected. A history-less legacy database is adopted only after its complete recognized baseline passes schema/index/foreign-key/unique/practical CHECK validation.
- Next development and builds intentionally use webpack because Turbopack produced missing route manifests under Compose Watch. Webpack memory optimizations are enabled, and the Compose development process uses a 6 GiB V8 old-space ceiling so sustained multi-route compilation remains below Next's automatic memory-restart threshold within Docker Desktop's configured memory limit. TypeScript is pinned to `6.0.3`; ESLint is pinned to EOL `9.39.5` because `10.8.1` failed with the current Next lint stack. Revisit these together during a deliberate dependency upgrade.
- Document templates use `@react-pdf/renderer` for built-in templates (Modern, Classic) and Handlebars + Puppeteer for custom HTML templates. The legacy `pdfme` dependency has been completely removed.
- Compose Watch expects one controller and the app container uses `init: true`. A stale interrupted controller may require `docker compose down` before restart. Development may use the logged Better Auth fallback secret; every non-development process must provide `BETTER_AUTH_SECRET`.

## Permissions and business isolation

- Roles are `administrator` and `standard`. Administrators always receive all modules; Standard users receive a filtered subset of `sales`, `purchases`, `banking`, `projects`, `inventory`, `accounting`, `reports`, and `settings`. Navigation hiding is not the security boundary.
- Business database lookup requires an unarchived system-registry business plus membership for the current user; the trusted UUID directory key comes from that registry. IDs from another business therefore resolve only against the authorized business database.
- Pages, server actions, and payload routes enforce the relevant module. Sales controls outbound eInvoice preparation/submission/XML; Purchases controls inbound inbox/review/XML and draft creation; Reports controls VAT reading/period creation/preparation/export; Settings controls tax-code/numbering/settings pages. Inbound reject/archive, membership administration, backup export, business rename/archive/delete, VAT registration/adjustments/finalize/reopen/filed transitions, and eInvoice settings require Administrator.
- Backups contain no auth users/memberships or external secrets. Backup manifest v2 preserves the original country, base currency, fiscal-year start, business DB, schema history, attachments, currency master/rates, VAT/eInvoice archives, attempts, inbound originals, matches, mappings, and history. Import resets provider key/environment and never submits or replays receipt. Legacy manifests remain importable with the documented UAE/AED/January fallback only when the older archive lacks metadata.

## Verification commands

```bash
docker compose up --watch
npm run typecheck
npm run lint
npm run db:check
npm run test
npm run build
```

`npm run build` requires `BETTER_AUTH_SECRET`. `npm run test` runs 83 service/migration regressions in `tests/pre-phase-5.test.ts` and `tests/phase-{5,6,7,8,9}.test.ts`; 22 tests specifically cover Phase 9 migration, Decimal math, Sales/Purchases/VAT posting, immutable snapshots, partial/final residuals, FX gains/losses/reversals, cross-currency rejection, inventory, reports, permissions/isolation, PINT boundaries, and backup portability. There is no committed E2E suite. Database setup commands are `npm run db:migrate` and `npm run db:seed`. Inside Docker use `docker compose exec app npm run <command>`.

Last verified after Phase 9 on 11 August 2026: explicit migration and database check passed (system `1`, business `9`, valid foreign keys); TypeScript, ESLint, all 82 tests, and the production webpack build passed. The build used a disposable verification-only `BETTER_AUTH_SECRET`; production still requires its own secret. Compose Watch remained up through sustained compilation/navigation, served the currency settings, Sales Invoice, Receipt, Purchase Invoice, and AR routes with `200` responses, and recorded no application runtime error. Browser QA covered desktop `1440x900` and mobile `390x844`, Light/Dark/System appearance, visible keyboard focus, a non-writing currency-edit interaction, foreign totals/rate/VAT snapshots, base settlement and realized FX detail, report/table containment, zero page-root horizontal overflow after repair, and empty warning/error console output. No accounting document was created or posted during browser QA.

## Known limitations and deferred work

- The PDF document route (`document-pdf/route.ts`) is currently a single large function with multiple branches for handling different document types. This should be refactored to extract per-document-type data-fetching functions if/when new document types are added.
- Customer email delivery and the Help center are not implemented; their visible controls are intentionally labelled and disabled. Command search and business duplication remain explicitly labelled future placeholders.
- Inventory has no GRNI/received-not-invoiced clearing, purchase-price variance, landed-cost allocation, lot/serial tracking, transfers, or historical revaluation engine. The physical/financial timing split and chronology rejection are intentional until those are designed.
- The GL and Bank/Cash accounts intentionally remain base-currency only. There are no foreign bank accounts, cross-currency allocations, unrealized revaluation, translation reserve, live/automatic rates, or background FX processing.
- Electronic Invoicing has no real ASP adapter, direct FTA/Corner-5/TDD call, credential/certificate/key management, endpoint discovery, webhooks, background retry policy, self-billing, B2C eReceipts, automatic AP posting, or broader PINT-AE FX scenarios. Mock acceptance/receipt is never government acceptance or production network receipt.
- Inbound Credit Notes are validated, archived, identity-matched, and reviewable but cannot create a Purchase Credit Note because that accounting document does not exist. The current Purchase Invoice model also cannot represent source-level allowances/charges or a payable amount different from the invoice total, so those documents remain in review. Prior-invoiced comparison uses deterministic linked-PO line position because Purchase Invoice lines have no PO-line foreign key.
- There are no queues, Redis, PostgreSQL, microservices, GraphQL/NestJS backend, committed Playwright/UI automation, production deployment, or production observability.
