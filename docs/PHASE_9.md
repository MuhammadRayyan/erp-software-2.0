# Phase 9 — Multi-Currency Accounting Foundation

## Purpose

Implement the original roadmap item of Manager-style multi-currency accounting without destabilizing the accounting, VAT, inventory, banking, or UAE eInvoicing work already completed.

Core flow:

```text
Base Currency
 -> Enabled Foreign Currencies
 -> Explicit Exchange Rates
 -> Foreign Sales/Purchases
 -> Base-Currency Journal Posting
 -> Foreign AR/AP Balances
 -> Same-Currency Settlements
 -> Realized FX Gain/Loss
```

This is the foundation only.

Do not implement:
- unrealized/period-end FX revaluation;
- foreign-currency bank accounts;
- live exchange-rate feeds;
- cross-currency allocations;
- full foreign-currency PINT-AE submission;
- GRNI, purchase-price variance, or landed cost.

Implement the whole phase first. Run final verification only after completion.

---

## 1. Context Strategy

Read only:

```text
README.md
docs/CURRENT_STATE.md
docs/THEME.md
docs/PHASE_9.md
```

Treat `CURRENT_STATE.md` and current code/schema/services as authoritative.

Read an older phase file only for a specific unresolved conflict.

At the end, update `docs/CURRENT_STATE.md` from actual implementation.

---

## 2. Preserve the Original Product Direction

Keep the original product principles:

- compact Manager.io-inspired accounting UX;
- browser-only modular monolith;
- one system SQLite DB plus one isolated SQLite DB per business;
- domain/application services own writes and posting;
- portable `.erpbackup`;
- simple module permissions;
- full-page commercial flow:
  `List -> New -> View -> Edit -> View`;
- Light/Dark/System global theme;
- dense readable tables and keyboard-friendly workflow;
- UAE-first VAT/eInvoicing;
- multi-currency should feel like an extension of normal documents, not a treasury application.

Do not redesign the platform.

---

## 3. Preserve Current Deviations / Compatibility Decisions

Do not undo established implementation choices:

- Next.js App Router + React + strict TypeScript modular monolith;
- Drizzle schema is model authority;
- dynamically located business DBs use the explicit ordered/versioned SQLite migration runner;
- never use `drizzle-kit push` on real business databases;
- accounting/tax/inventory posting remains transactional;
- money uses integer minor units;
- development/build remains on webpack because Turbopack previously broke Compose Watch route manifests;
- keep the documented TypeScript/ESLint pins until a deliberate dependency upgrade;
- keep the pdfme family on the documented compatible pin behind its boundary;
- Docker Compose Watch remains the main dev workflow;
- service-level tests remain the primary regression suite;
- no Redis, queues, PostgreSQL, microservices, second backend, or Playwright;
- eInvoice provider stays Mock/provider-neutral unless a real ASP is separately selected.

Phase 9 is not a dependency-upgrade/refactor phase.

---

## 4. Current Constraints Relevant to Multi-Currency

Today:

- GL and Trial Balance are base-currency only;
- Bank Accounts and reconciliation are base-currency only;
- VAT reports use posting-time tax snapshots;
- outbound eInvoicing supports a deliberately narrow domestic AED subset;
- inbound eInvoices are provider-neutral but only convert supported scenarios;
- Inventory has no GRNI, PPV, landed cost, or historical revaluation;
- there is no manual journal-entry UI;
- backup import has a known limitation where business currency/fiscal metadata is recreated with UAE/AED/January defaults.

Phase 9 must improve currency support without pretending these deferred systems already exist.

---

## 5. Business Base Currency

Every business has exactly one:

```text
base_currency_code
```

For existing businesses, migrate safely to:

```text
AED
```

unless trusted existing metadata already defines otherwise.

Base currency remains the currency of:

- GL;
- Trial Balance;
- financial reporting;
- Project profitability;
- Inventory valuation;
- UAE VAT reports;
- Bank Accounts in Phase 9.

### Base currency change rule

```text
Empty business:
may change base currency.

Business with posted accounting/tax/inventory/banking activity:
base currency is locked.
```

Never convert historical journals because a setting changed.

---

## 6. Currency Master

Add a small per-business currency master:

```text
currencies
```

Recommended fields:

```text
code
name
symbol optional
minor_unit
is_base
is_active
created_at
updated_at
```

Examples:

```text
AED  minor unit 2
USD  minor unit 2
EUR  minor unit 2
JPY  minor unit 0
KWD  minor unit 3
```

Do not globally assume 2 decimal places.

Settings route:

```text
/b/[businessId]/settings/currencies
```

Keep UI compact.

---

## 7. Exchange Rate Convention

Use one convention throughout the domain:

```text
rate_to_base = base-currency units for 1 unit of foreign currency
```

Example:

```text
Base currency: AED
1 USD = 3.672500 AED
rate_to_base = 3.672500
```

Never mix reciprocal conventions internally.

---

## 8. Exchange Rate Storage

Add:

```text
exchange_rates
```

Fields:

```text
id
currency_code
rate_date
rate_to_base
source
source_reference optional
created_by optional
created_at
```

Sources:

```text
Manual
CBUAE
Imported
FutureProvider
```

Phase 9 implements Manual and manually maintained `CBUAE` source only.

Do not add a live API.

Store rate as deterministic decimal text/fixed precision and use Decimal.js.

Never use JavaScript floating-point `number` as authoritative FX math.

---

## 9. Rate Snapshots

Supported foreign-currency documents store:

```text
currency_code
exchange_rate_to_base
exchange_rate_date
exchange_rate_source
```

A posted document's rate is a historical snapshot.

Changing the exchange-rate table later must not change:
- journal;
- VAT tax rows;
- AR/AP carrying amount;
- document base equivalent.

---

## 10. UAE VAT Foreign-Currency Rule

For UAE VAT-registered businesses, foreign-currency VAT documents require a specific tax conversion policy.

Phase 9 rule:

```text
VAT-relevant foreign-currency documents require an explicit CBUAE-labelled rate for the relevant tax date.
```

Use the exact stored rate precision for both:
- accounting conversion;
- Phase 6 VAT base/AED snapshot.

Do not maintain separate accounting and VAT rates in this phase.

Do not auto-download CBUAE rates yet.

If the required rate is missing, block posting with a clear error.

For non-VAT/out-of-scope transactions, a normal Manual rate may be used.

---

## 11. Central Currency Module

Create one shared domain boundary, for example:

```text
src/modules/currency/
  currency.ts
  exchange-rate.ts
  conversion.ts
  validation.ts
```

Centralize:

```text
convertToBase()
convertFromBase()
roundCurrencyAmount()
validateCurrency()
validateExchangeRate()
```

Do not duplicate FX formulas across Sales, Purchases, VAT, Receipts, Projects, or reports.

---

## 12. Phase 9 Document Scope

Add foreign-currency support to:

```text
Customers
Suppliers
Sales Invoices
Sales Credit Notes
Receipts
Purchase Orders
Purchase Invoices
Supplier Payments
Customer Statements
Supplier Statements
AR Ageing
AP Ageing
VAT tax snapshots
Project source postings
```

Keep base-currency-only:

```text
Bank Accounts
Statement Import
Bank Reconciliation
Manual Bank Transactions
Bank Transfers
Inventory movement valuation
General Ledger reporting
Trial Balance
```

---

## 13. Customer / Supplier Currency

Add optional:

```text
default_currency_code
```

Document creation defaults from the party.

Draft currency may be changed.

Posted currency may not be changed through a normal edit.

---

## 14. Sales Invoice

Foreign Sales Invoice UI:

```text
Currency        USD
Exchange Rate   1 USD = 3.672500 AED
Rate Date       10 Aug 2026
Source          CBUAE

Net             USD 1,000.00
VAT             USD    50.00
Total           USD 1,050.00
Base Equivalent AED 3,856.13
```

Customer-facing values remain in document currency.

GL remains base currency.

Posting:

```text
Dr AR          base gross
Cr Revenue     base net
Cr Output VAT  base VAT
```

Source stores native amounts + rate snapshot.

Journal/source drilldown may show transaction currency/rate/base equivalent.

---

## 15. Sales Credit Notes

Foreign Sales Credit Note rules:

- same currency as the linked original invoice;
- default to original invoice exchange rate when correcting that invoice;
- reduce foreign and base carrying amount consistently.

Do not create artificial FX simply because a Credit Note corrects an earlier invoice.

---

## 16. Purchase Orders

POs may use foreign currency.

PO rate is an operational/commitment snapshot only because PO does not post.

Project commitment:
- preserve native PO amount;
- show base commitment using PO snapshot rate.

Later Purchase Invoice uses its own posting/tax rate.

---

## 17. Purchase Invoices

Support foreign-currency Purchase Invoices.

Service/expense posting:

```text
Dr Expense/Asset  base net
Dr Input VAT      base recoverable VAT
Cr AP             base gross
```

Inventory line posting:

```text
Dr Inventory Asset  base historical amount
Dr Input VAT        base recoverable VAT
Cr AP               base gross
```

Purchase Invoice still does not move stock.

---

## 18. Inventory Interaction

Inventory movement valuation remains base currency.

Do not add:

```text
GRNI
PPV
landed cost
inventory FX revaluation
```

The existing physical-vs-financial timing split remains documented.

Foreign purchases may make that difference more visible; do not hide it.

---

## 19. Receipts Against Foreign Invoices

A foreign Customer Receipt may settle invoices in the same transaction currency while depositing the base equivalent into a base-currency Bank/Cash account.

Example:

```text
Invoice:
USD 1,000
original base carrying amount AED 3,670

Receipt:
USD 1,000
settlement value AED 3,680
```

Journal:

```text
Dr Bank                 3,680
Cr Accounts Receivable  3,670
Cr Realized FX Gain        10
```

Receipt stores:
- currency;
- foreign amount;
- settlement rate;
- base bank amount;
- released AR carrying amount;
- realized FX.

---

## 20. Supplier Payments

Mirror Receipts.

If payable carrying amount is AED 3,670 and settlement costs AED 3,680:

```text
Dr Accounts Payable  3,670
Dr Realized FX Loss     10
Cr Bank              3,680
```

Use one central settlement engine.

---

## 21. Realized FX Accounts

Add accounting mappings:

```text
Realized FX Gain
Realized FX Loss
```

Recommended classifications:
- Gain -> Other Income / Income;
- Loss -> Other Expense / Expense.

Posting must fail if required mappings are missing.

Do not bury FX in Revenue or Purchase Expense.

---

## 22. Allocation Rule

Phase 9 simplification:

```text
one Receipt/Supplier Payment = one transaction currency
```

Allocated invoice currency must equal payment/receipt currency.

Do not support one payment across USD + EUR + AED documents.

---

## 23. Partial Settlements

Allocation records must preserve:

```text
foreign_amount_allocated
base_carrying_amount_released
settlement_base_amount
realized_fx_amount
```

For non-final allocations:
- release carrying value proportionally and deterministically.

For final allocation:
- consume exact remaining base carrying value so no 1-fils residual remains.

Reversal must reverse:
- Bank;
- AR/AP;
- realized FX;
- allocation.

Historical FX must never be recomputed using current rates.

---

## 24. AR / AP Balance Model

Open foreign receivables/payables track both:

```text
foreign_open_amount
base_carrying_amount
```

Do not revalue open balances at today's rate in normal AR/AP.

That is unrealized FX and is deferred.

---

## 25. Customer / Supplier Statements

Do not create meaningless mixed-currency running balances.

If a party has multiple currencies:

- provide a currency filter; or
- show separate sections by currency.

Columns may include:

```text
Date
Document
Currency
Debit
Credit
Foreign Balance
Base Carrying Amount optional
```

---

## 26. AR / AP Ageing

Show:

```text
Document Currency
Foreign Open Amount
Base Carrying Amount
Age Bucket
```

Overall summary may aggregate base carrying amounts.

Native amounts must be grouped by currency.

Never sum USD + EUR directly.

---

## 27. GL / Trial Balance

Remain base-currency reports.

Optionally show source currency/rate in drilldown.

Do not redesign GL into mixed-currency debit/credit columns.

---

## 28. Projects

Project profitability stays journal-derived in base currency.

Foreign Revenue/Expense converts at posting time and existing Project P&L logic consumes the base posting.

Do not revalue Project profit at current FX rates.

---

## 29. VAT Tax Entries

Extend Phase 6 tax snapshots for foreign documents to preserve:

```text
document_currency
foreign_net
foreign_vat
exchange_rate_to_base
base_net
base_vat
rate_date
rate_source
```

VAT working papers remain AED/base currency.

Historical VAT reports must not depend on today's rate table.

Reverse-charge foreign services should reuse existing Phase 6 reverse-charge logic after base conversion.

---

## 30. Outbound UAE eInvoicing

Do not automatically broaden the Phase 7 PINT-AE subset.

Foreign-currency Sales Invoice should show:

```text
Electronic Invoice: Unsupported in current PINT-AE ERP subset
```

unless the existing mapper/validator genuinely supports that exact FX scenario and new tests prove it.

Do not guess PINT-AE FX requirements.

---

## 31. Inbound UAE eInvoices

Inbound foreign-currency PINT-AE documents may still be:
- received;
- validated;
- archived.

Allow Purchase Invoice Draft conversion only when the new Phase 9 currency/VAT model can represent the source exactly and safely.

Otherwise keep:

```text
Needs Review / Unsupported Currency Scenario
```

Never silently convert the source document to AED.

---

## 32. Banking

Bank Accounts remain base-currency-only.

Foreign Receipt/Supplier Payment uses:
- native foreign settlement amount;
- settlement rate;
- base Bank/Cash equivalent.

Do not implement:
- foreign bank accounts;
- FX statement import;
- foreign reconciliation;
- bank revaluation.

---

## 33. Rate Management UI

Route:

```text
/b/[businessId]/settings/currencies
```

or a child Exchange Rates section.

Example:

```text
Date          Currency     Rate                     Source
10 Aug 2026   USD          1 USD = 3.672500 AED    CBUAE
10 Aug 2026   EUR          1 EUR = ... AED         Manual
```

No charts/live ticker.

---

## 34. Formatting

Centralize currency formatting using each currency's minor unit.

Examples:

```text
AED 1,234.50
USD 1,234.50
JPY 1,235
KWD 1,234.567
```

Use currency codes where symbols could be ambiguous.

---

## 35. PDF / Documents

Printed/PDF commercial documents show native document currency.

For foreign UAE VAT tax invoices, expose the posted AED tax/base equivalent and exact stored rate as required by the supported tax-document output.

Document-template fields may include:

```text
currency code
exchange rate
base total
AED VAT total
```

Do not redesign pdfme.

---

## 36. Backup Portability Fix

Use Phase 9 to fix the known backup metadata limitation.

New backup/import must preserve at least:

```text
base_currency_code
financial_year_start
country/jurisdiction metadata already represented
currency configuration
```

Do not include external provider secrets.

Version the backup manifest if needed.

Older backups without this metadata must still import using a documented legacy default.

Do not reinterpret old journals as foreign currency.

---

## 37. Migration

Use the explicit business migration runner.

Expected next business schema:

```text
9
```

Add as required:
- base currency metadata;
- currencies;
- exchange rates;
- Customer/Supplier default currency;
- source-document currency/rate snapshots;
- allocation carrying/settlement fields;
- FX account mappings;
- VAT foreign/base fields;
- indexes/constraints.

Existing posted documents migrate safely as:

```text
currency = base currency
exchange rate = 1
```

Never infer a historical foreign currency from free text.

---

## 38. Permissions

Keep permissions simple.

Admin/Settings:
- manage currencies/rates;
- configure FX accounts.

Sales/Purchases:
- use enabled document currencies and valid rates.

All critical validation remains server-side.

Do not introduce a Treasury role.

---

## 39. Error Messages

Use clear errors:

```text
This currency is not enabled.

Base currency cannot be changed after accounting activity exists.

An exchange rate is required for USD on 10 Aug 2026.

A UAE VAT foreign-currency document requires the applicable CBUAE rate for its tax date.

This USD Receipt can only allocate USD invoices.

Realized FX Gain/Loss accounts are not configured.

This foreign-currency scenario is not yet supported for UAE electronic invoicing.
```

---

## 40. Tests

Extend service-level tests.

Minimum:

### Currency
- existing business base = AED;
- base rate = 1;
- 0/2/3-decimal currency rounding;
- base currency locked after activity;
- exchange-rate precision preserved.

### Sales/Purchases
- foreign Sales Invoice -> correct base AR/Revenue/VAT;
- foreign PI -> correct base Expense/Input VAT/AP;
- inventory PI -> base Inventory Asset, no stock movement;
- rate-table changes never change posted history;
- linked foreign Credit Note uses compatible currency/rate rule.

### Settlements
- Receipt gain;
- Receipt loss;
- Supplier Payment gain/loss;
- partial carrying release;
- final residual clears exactly;
- reversal reverses FX;
- cross-currency allocation rejected.

### VAT
- missing CBUAE-labelled rate blocks foreign VAT document;
- exact rate appears in tax snapshot;
- VAT working paper remains AED;
- foreign reverse-charge service converts correctly;
- finalized VAT locks still work.

### Reports
- statements do not mix currencies incorrectly;
- AR/AP base carrying values reconcile to controls;
- Project profitability remains base-journal-derived;
- GL/Trial Balance remain balanced.

### Backup
- base currency/fiscal metadata/currency configuration survives export/import;
- legacy backup still imports with documented fallback;
- provider secrets remain excluded.

### Isolation
- Business A currencies/rates never appear in Business B.

No Playwright.

---

## 41. Demo Data

Base:

```text
AED
```

Enable:

```text
USD
EUR
JPY optional
```

Create clearly labelled demo/manual rates.

Include:
- foreign Customer;
- foreign Supplier;
- USD Sales Invoice;
- Receipt at different rate;
- USD Purchase Invoice;
- Supplier Payment at different rate.

Do not imply demo rates are live CBUAE rates.

---

## 42. UI / Responsive

Follow `docs/THEME.md`.

Use:
- shared selects/inputs/buttons;
- shared money formatting;
- compact exchange-rate detail;
- right-aligned tabular money;
- no new visual language.

At ~390px:
- Currency/Rate fields stack;
- native/base totals remain readable;
- reports/tables scroll;
- actions remain reachable.

Do not redesign tables into cards.

---

## 43. Do Not Build in Phase 9

Defer:

```text
Unrealized FX Revaluation
Period-End Revaluation Journals
Foreign-Currency Bank Accounts
FX Bank Statement Import/Reconciliation
Live Exchange-Rate APIs
Automatic CBUAE Rate Download
Cross-Currency Payment Allocation
One Payment Across Multiple Currencies
Full Foreign-Currency PINT-AE Expansion
GRNI
Purchase Price Variance
Landed Cost
Inventory FX Revaluation
Manual Journal UI
Group/Consolidation Currency
Redis / Queues / PostgreSQL
Playwright
Production Infrastructure
```

---

## 44. Final Verification

Run once after the full phase:

```bash
docker compose up --watch
pnpm db:migrate
pnpm db:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Also verify prolonged multi-route Compose Watch stability.

### Currency setup
- base AED;
- enable USD/EUR/JPY;
- confirm minor units;
- active business base-currency change blocked.

### Rate
Create a clearly labelled demo CBUAE USD rate:

```text
1 USD = 3.672500 AED
```

Confirm full precision persists.

### Foreign Sales
Post:

```text
USD 1,000 net
USD 50 VAT
USD 1,050 total
```

Confirm native source, base journal, VAT snapshot and AR carrying amount.

### Immutability
Change rate table after posting.
Historical source/journal/tax values must not change.

### Receipt
Settle at a different rate.
Confirm Bank/base AR/realized FX and zero foreign/base balance.

### Partial Receipt
Verify proportional carrying amount and exact final residual clearance.

### Purchases
Post foreign expense PI and Supplier Payment.
Verify AP/Input VAT/realized FX.

### Inventory purchase
Verify base Inventory Asset posting and no physical stock movement.

### Reports
Check Customer/Supplier Statements and AR/AP ageing.
No mixed-currency arithmetic.

### Projects
Verify foreign project postings contribute base journal values.

### VAT
Foreign VAT document without CBUAE-labelled rate must fail.
With rate, VAT working paper remains AED.

### eInvoicing
Unsupported foreign outbound/inbound scenarios must fail or remain Needs Review honestly.

### Banking
Existing Bank Account/import/reconciliation behavior remains base-currency and unchanged.

### Backup
Export/import a business with non-default fiscal metadata and currency configuration.
Confirm metadata/config/documents persist and provider execution/secrets remain safe.

### Isolation / UI
Verify business isolation, Light/Dark/System, desktop/tablet/mobile and no runtime/hydration errors.

---

# Phase 9 Definition of Done

Phase 9 is complete when:

- each business has a safe base-currency foundation;
- multiple transaction currencies can be enabled;
- rate convention and precision are centralized;
- foreign Sales/Purchase documents retain native values and post balanced base journals;
- UAE VAT foreign documents require explicit CBUAE-labelled rates;
- foreign AR/AP tracks native open amount + base carrying amount;
- same-currency Receipts/Payments post correct realized FX, including partial/reversal cases;
- statements/ageing avoid mixed-currency arithmetic;
- GL, Projects, VAT and Inventory remain base-currency authoritative;
- Banking remains intentionally base-currency-only;
- unsupported PINT-AE FX cases fail honestly;
- backup/import preserves actual base currency/fiscal metadata;
- migrations/tests/isolation/theme/Compose Watch remain healthy.

Stop after Phase 9.

Update `docs/CURRENT_STATE.md`.

Do not automatically start Phase 10.

Recommended Phase 10:
**Foreign-Currency Banking + Period-End FX Revaluation**.
