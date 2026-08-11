# Phase 6 — UAE VAT Reporting + Tax Period Controls

## Purpose

Turn the existing VAT-aware accounting into a practical UAE VAT compliance working-paper system.

Phase 6 should support:
- UAE VAT registration settings;
- explicit VAT tax periods;
- VAT/tax dates on relevant transactions;
- expanded VAT tax-code classifications;
- VAT return working papers from posted accounting data;
- standard-rated sales reporting by Emirate;
- output VAT, input VAT, zero-rated, exempt, out-of-scope and reverse-charge/import foundations;
- manual VAT adjustments with audit trail;
- VAT reconciliation to control accounts;
- period finalization / tax locks;
- detailed transaction drill-down;
- CSV/PDF working-paper exports.

This phase does not submit VAT returns to the FTA / EmaraTax.
Do not add UAE e-invoicing yet.

Implement the whole phase first.
Run the final verification only after the phase is complete.

## 1. Current UAE Basis

Use the current FTA structure as the Phase 6 baseline:

- standard UAE VAT rate: 5%;
- VAT returns and related payments are generally due within 28 days after the assigned tax period ends;
- VAT reporting separates sales/output VAT, purchases/input VAT, adjustments and net VAT;
- standard-rated supplies can require Emirate-level reporting.

Do not scatter legal/form rules through transaction code.
Keep VAT return mappings in one small configurable tax module so they can be updated later.

The ERP is a preparation/accounting tool, not a substitute for professional tax advice.

## 2. Keep Existing Architecture

Continue:
- Next.js + TypeScript;
- Drizzle;
- one SQLite DB per business;
- explicit versioned migration runner;
- existing accounting services;
- Sales, Purchases, Banking, Projects and Inventory;
- Docker Compose Watch + webpack;
- existing UI/theme system.

Do not add PostgreSQL, Redis, queues, a second backend, Playwright, EmaraTax integration,
or UAE e-invoicing in this phase.

## 3. VAT Registration Settings

Add business tax settings:

```text
vat_registered
trn
vat_registration_effective_date
vat_deregistration_date optional
default_supply_emirate
tax_lock_date optional
```

Settings route:

```text
/b/[businessId]/settings/tax
```

If VAT is disabled:
- normal accounting continues;
- VAT working-paper screens show Not VAT Registered / Disabled clearly.

TRN is stored as text.
Do not call external FTA verification services in Phase 6.

## 4. Explicit VAT Periods

Do not assume monthly or quarterly filing.

Add:

```text
vat_periods
```

Fields:

```text
id
period_reference
start_date
end_date
filing_due_date
status
finalized_at optional
filed_at optional
notes optional
created_at
updated_at
```

Statuses:

```text
Open
Prepared
Finalized
FiledExternally
Reopened
```

Periods must match the business's actual assigned FTA periods.

Provide a due-date helper suggesting:

```text
period end + 28 days
```

but allow explicit correction.

## 5. VAT Tax Date

Add `tax_date` where VAT reporting needs it:

```text
Sales Invoice
Sales Credit Note
Purchase Invoice
VAT-bearing Bank Transaction
other VAT-relevant sources
```

Default:

```text
tax_date = document/accounting date
```

VAT reports use `tax_date`, not record creation timestamp.

Tax-date changes must respect period locks.

## 6. Expand Tax Codes

Extend tax-code classification.

Recommended fields:

```text
id
name
rate
direction
vat_category
sales_tax_account_id
purchase_tax_account_id
is_recoverable
is_active
```

Categories:

```text
STANDARD
ZERO_RATED
EXEMPT
OUT_OF_SCOPE
REVERSE_CHARGE
IMPORT
```

Direction:

```text
Sales
Purchases
Both
```

Do not infer behavior from the display name.

## 7. Seed Practical UAE Tax Codes

Seed a small useful set:

```text
UAE VAT 5% Sales
UAE VAT 5% Purchases
Zero Rated
Exempt
Out of Scope
No VAT
```

Only seed reverse-charge/import codes after their posting/reporting behavior is safely implemented.

## 8. Emirate Reporting

Support:

```text
Abu Dhabi
Dubai
Sharjah
Ajman
Umm Al Quwain
Ras Al Khaimah
Fujairah
```

Add a reviewable `supply_emirate` field for standard-rated Sales reporting.

Default order:
1. explicit document value;
2. business default Emirate.

Do not automatically decide legal place-of-supply solely from customer address.

## 9. VAT Working Paper

Routes:

```text
/b/[businessId]/tax/vat
/b/[businessId]/tax/vat/periods/[periodId]
```

Header example:

```text
VAT Return Working Paper

01 Apr 2026 – 30 Jun 2026
Due: 28 Jul 2026
Status: Open

Output VAT
Recoverable Input VAT
Net VAT Due / Recoverable
```

This is a working paper, not direct FTA submission.

## 10. Working-Paper Structure

Use configurable reporting buckets.

Minimum:

```text
Sales / Outputs
- Standard-rated supplies
- Standard-rated supplies by Emirate
- Zero-rated supplies
- Exempt supplies
- Reverse-charge / other supported outputs
- Output VAT adjustments

Purchases / Inputs
- Standard-rated purchases/expenses
- Recoverable input VAT
- Reverse-charge/import supported categories
- Input VAT adjustments

Net VAT
- Total Output VAT
- Total Recoverable Input VAT
- Net VAT Due / Recoverable
```

Current VAT201 box references may be displayed where verified, but mappings must stay in
a dedicated configuration module.

## 11. Tax Detail Ledger

Use posted source-document tax data as the VAT reporting authority.

If current source data is not sufficient, add:

```text
tax_entries
```

Fields:

```text
id
tax_date
source_type
source_id
source_line_id optional
tax_code_id
vat_category
direction
net_amount_minor
vat_amount_minor
recoverable_vat_minor optional
supply_emirate optional
project_id optional
created_at
```

Rules:
- Drafts create no tax entries;
- posting creates journal + tax entries transactionally;
- posted edits rebuild them;
- void reverses/removes them using the existing safe posting pattern;
- UI never inserts tax entries directly.

Do not use only VAT control-account balances as the return source because zero-rated/exempt
amounts and reporting classifications must also be represented.

## 12. Standard-Rated Sales

Example:

```text
Net AED 1,000
VAT AED 50
Emirate Dubai
```

Tax entry:

```text
direction Sales
category STANDARD
net 1,000
vat 50
emirate Dubai
```

Sales Credit Notes should naturally reverse/reduce the relevant values.

## 13. Purchases / Recoverable VAT

Example:

```text
Net AED 1,000
VAT AED 50
Recoverable VAT AED 50
```

Tax entry:

```text
direction Purchases
category STANDARD
net 1,000
vat 50
recoverable_vat 50
```

Default normal purchase VAT to fully recoverable.

Support a simple non-recoverable purchase tax code if implemented correctly.
Do not build complex partial-exemption calculations yet.

## 14. Zero / Exempt / Out-of-Scope

Keep these distinct.

```text
Zero Rated:
reportable taxable supply, VAT = 0

Exempt:
reportable exempt supply, VAT = 0

Out of Scope:
excluded from normal VAT-return taxable-supply totals
```

Never treat every 0% transaction as equivalent.

## 15. Reverse-Charge / Import Foundation

Implement a controlled generic reverse-charge foundation only if accounting/reporting remains correct.

For supported reverse-charge purchases:
- output VAT side is recognized;
- recoverable input VAT follows tax-code rules.

Support import classification/reference for VAT working papers without customs integration.

Do not attempt every specialist UAE VAT scenario.

## 16. VAT Adjustments

Add:

```text
vat_adjustments
```

Fields:

```text
id
period_id
report_bucket
amount_minor
vat_amount_minor
reason
reference optional
created_by
created_at
```

Require reason/user/timestamp.

Show separately:

```text
Calculated
Adjustments
Return Total
```

Do not silently overwrite calculated figures.

## 17. Drill-Down

Every working-paper total should drill to supporting transactions.

Example columns:

```text
Tax Date
Document
Customer / Supplier
Tax Code
Category
Emirate
Net
VAT
Recoverable VAT
```

Totals must reconcile to the selected working-paper bucket.

## 18. VAT Reconciliation

Compare working-paper VAT totals to mapped VAT control-account movements.

Example:

```text
Output VAT per tax entries     AED 25,000
VAT Payable GL movement        AED 25,000
Difference                     AED 0

Recoverable VAT                AED 14,000
Input VAT GL movement          AED 14,000
Difference                     AED 0
```

Flag differences.
Do not automatically post entries to force reconciliation.

## 19. Period Workflow

Use:

```text
Open
 -> Prepared
 -> Finalized
 -> FiledExternally
```

Prepared:
- reviewed but still editable.

Finalized:
- save a return snapshot;
- apply VAT tax lock through period end.

FiledExternally:
- user confirms filing occurred outside the ERP / in EmaraTax;
- store filing date/reference.

Never label the action `Submit VAT Return`.

Use:

```text
Mark as Filed Externally
```

## 20. VAT Tax Lock

When period is Finalized:

```text
tax_lock_date = period.end_date
```

Block VAT-affecting changes with `tax_date <= tax_lock_date`:

- new posting;
- financial edit;
- void;
- tax-code change;
- tax-date change;
- VAT-bearing Bank Transaction change.

Error example:

```text
This VAT period is finalized. Reopen the period before changing VAT-affecting transactions dated on or before 30 Jun 2026.
```

Non-tax metadata edits may remain allowed.

## 21. Reopen Period

Admin may reopen a Finalized period.

Require:

```text
reason
```

Store:

```text
reopened_by
reopened_at
reopen_reason
```

Recalculate the applicable tax lock based on earlier still-finalized periods.

Do not auto-reopen from transaction forms.

## 22. Filed Snapshot

Store exact figures considered filed:

```text
period
reporting buckets
Emirate breakdown
adjustments
output VAT
recoverable input VAT
net VAT
filed_at
filed_by
filing_reference optional
snapshot data
```

A Filed snapshot must not silently change when later data changes.

Source changes require explicit reopen/review.

## 23. VAT Period List

Example:

```text
VAT Periods                                      [New Period]

Period                 Due          Status          Net VAT
Apr–Jun 2026           28 Jul       Filed           AED 12,450
Jul–Sep 2026           28 Oct       Open             AED 8,200
```

Keep compact.

## 24. Exports

Add:

```text
Export Working Paper
Export Transaction Detail
```

Minimum:
- CSV.

Optional:
- readable PDF summary using existing PDF boundary.

Do not generate a file claiming to be directly uploadable to EmaraTax unless an official
current format is implemented and separately verified later.

## 25. Tax Code UI

Upgrade Tax Codes settings.

Columns:

```text
Tax Code
Rate
Direction
VAT Category
Recoverable
Status
```

Warn before changing classification on a tax code already used.

Historical tax entries must preserve the classification needed for old reports.

## 26. Historical Data Migration

Preserve Phase 1–5 VAT transactions.

Backfill tax entries only where classification can be determined safely.

Do not guess:
```text
0% -> Zero Rated
```

because historical 0% may instead mean Exempt, Out-of-Scope, or another classification.

Create a lightweight `VAT Data Review` list for ambiguous historical records.

Examples:
- missing Emirate;
- ambiguous old 0% code;
- missing classification.

Flag affected period:

```text
Needs Review
```

rather than silently inventing data.

## 27. Permissions

Use existing permissions.

Recommended:
- Reports permission may view VAT working papers;
- Admin only can:
  - edit VAT registration settings;
  - finalize/reopen periods;
  - mark Filed Externally;
  - create manual VAT adjustments.

Enforce server-side.

## 28. Audit Metadata

Store explicit history for:
- Finalize;
- Reopen;
- Filed Externally;
- manual VAT adjustments.

Include:
```text
user
timestamp
action
reason/reference
```

Do not build a full global audit-trail platform unless already present.

## 29. UI / UX

Follow `docs/THEME.md`.

VAT screens should feel like accounting reports:
- compact;
- readable;
- right-aligned amounts;
- strong totals;
- subtle status badges;
- drill-down links;
- Light/Dark consistency;
- no oversized compliance dashboard.

Do not visually imitate the FTA website.

Use terms:

```text
Calculated
Adjustment
Return Total
Net VAT Due
Net VAT Recoverable
Finalized
Filed Externally
Needs Review
```

## 30. Reports

Add:

```text
Tax
  VAT Return
  VAT Transaction Detail
```

VAT Transaction Detail filters:
- period/date;
- tax code;
- category;
- direction;
- Emirate;
- source type;
- party.

## 31. Rounding / Validation

Centralize VAT calculations.

Before posting:
- tax code active;
- tax date valid;
- period unlocked;
- required Emirate available where applicable;
- VAT amount recalculated server-side;
- VAT control account configured;
- reverse-charge configuration valid where used.

Use existing Decimal/money helpers.

Do not trust browser-calculated VAT values.

## 32. Tests

Extend the small service-level regression suite.

Minimum:
- Draft creates no tax entries;
- standard-rated Sales Invoice creates correct output VAT entry;
- Credit Note reverses/reduces VAT;
- Purchase Invoice creates recoverable input VAT;
- Zero Rated and Exempt remain separate;
- Out-of-Scope excluded from return taxable totals;
- Emirate breakdown is correct;
- journal + tax-entry generation is transactional;
- finalized period blocks VAT-affecting changes;
- authorized reopen works;
- Filed snapshot stays stable;
- VAT reconciliation catches a deliberate difference;
- rounding deterministic;
- business isolation for VAT periods/entries.

No Playwright required.

## 33. Do Not Build in Phase 6

Defer:

```text
Direct EmaraTax Submission
UAEPass / FTA API Integration
UAE E-Invoicing
PINT-AE / Peppol
Voluntary Disclosure Submission
Complex Partial Exemption
Capital Asset Scheme
Tax Group Consolidation
Tourist Refund Scheme
Customs Integration
Special Sector VAT Engines
Corporate Tax
Automatic Legal-Rule Updates
Production Deployment
PostgreSQL
Playwright
```

## 34. Final Verification

Run once after full Phase 6 implementation.

### Baseline

```bash
docker compose up --watch
pnpm typecheck
pnpm lint
pnpm db:check
pnpm test
```

### VAT Settings / Period

Enable VAT and set:
```text
TRN
Effective Date
Default Emirate = Dubai
```

Create:
```text
01 Apr 2026 – 30 Jun 2026
Due 28 Jul 2026
```

### Standard-Rated Sales

Post Dubai sale:
```text
Net AED 1,000
VAT AED 50
```

Confirm:
- journal balances;
- tax entry exists;
- working paper includes Dubai AED 1,000 / AED 50.

Post Abu Dhabi sale and confirm Emirate separation.

### Credit Note

Credit:
```text
Net AED 200
VAT AED 10
```

Confirm output VAT decreases.

### Purchase

Post:
```text
Net AED 1,000
VAT AED 50
Recoverable AED 50
```

Confirm input VAT.

### Zero / Exempt / Out-of-Scope

Create one of each.

Confirm:
- Zero and Exempt separate;
- VAT = 0;
- Out-of-Scope excluded from normal return taxable totals.

### Bank VAT

Post VAT-bearing Bank Expense.
Confirm journal, tax entry and recoverable VAT agree.

### Reconciliation / Drill-Down

Confirm VAT tax-entry totals reconcile to control-account movements.
Drill into a return bucket and verify detail total.

### Adjustment

Add manual VAT adjustment with reason.
Confirm Calculated remains unchanged and Return Total changes separately.

### Finalize / Lock

Finalize period.
Confirm snapshot and tax lock.

Try to edit/post/void an in-period VAT transaction.
Confirm rejection.

### Reopen

Admin reopens with reason.
Confirm history and recalculation.

### Filed Externally

Finalize again and mark Filed Externally.

Confirm:
- filing metadata stored;
- snapshot stable;
- UI does not claim direct FTA submission.

### Historical Review

Confirm safely classifiable old records are backfilled and ambiguous records are flagged.

### Permissions / Isolation / Backup

Confirm Admin-only VAT actions, business isolation, and backup/restore of VAT data.

### Theme / Responsive

Check Light, Dark, desktop and narrow/mobile.

## Phase 6 Definition of Done

Phase 6 is complete when:
- VAT registration settings and explicit tax periods work;
- tax dates work;
- tax codes distinguish Standard/Zero/Exempt/Out-of-Scope and supported reverse-charge/import categories;
- posted VAT transactions generate auditable tax entries;
- standard-rated Sales can report by Emirate;
- working papers derive from posted data;
- output/input VAT reconcile to accounting;
- adjustments are separate/auditable;
- finalized periods lock VAT changes;
- authorized reopen works;
- Filed Externally snapshots remain stable;
- ambiguous historical VAT data is flagged rather than guessed;
- tests, business isolation and backup pass.

Stop after Phase 6.

Do not automatically start Phase 7.

Recommended next phase:
**UAE e-Invoicing architecture + PINT-AE document model / ASP integration boundary**.
