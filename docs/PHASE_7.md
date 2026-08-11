# Phase 7 — UAE e-Invoicing Readiness + PINT-AE / ASP Boundary

## Purpose

Prepare the ERP for the UAE Electronic Invoicing System without tying it to one Accredited Service Provider (ASP).

Phase 7 adds:
- eInvoicing readiness/settings;
- customer eInvoice data;
- a versioned canonical eInvoice model;
- Sales Invoice and Sales Credit Note mapping to PINT-AE;
- structured XML generation;
- real validation for the supported PINT-AE subset;
- immutable eInvoice snapshots;
- eInvoice UUID/spec-version/hash/archive;
- submission/status history;
- a provider-neutral ASP adapter boundary;
- a Mock provider for development;
- clear UI for readiness, validation, submission and rejection.

Do not connect directly to the FTA.
Do not hard-code one commercial ASP.
Do not treat a PDF as an eInvoice.

Implement the whole phase first. Run the final verification only after completion.

## 1. Current UAE baseline

Design against the current UAE programme:

```text
OpenPeppol / PINT-AE
Accredited Service Providers
structured XML eInvoices
five-corner exchange/reporting model
message-level exchange/reporting statuses
```

Current rollout context:

```text
Pilot started: 1 July 2026

Annual revenue >= AED 50m:
ASP appointment: 30 October 2026
Mandatory implementation: 1 January 2027

Annual revenue < AED 50m:
ASP appointment: 31 March 2027
Mandatory implementation: 1 July 2027

In-scope government entities:
Mandatory implementation: 1 October 2027
```

Keep regulatory dates/configuration isolated from transaction services because rules/specifications can change.

## 2. Phase scope

Implement outbound electronic documents for:

```text
Posted Sales Invoice
Posted Sales Credit Note
```

Leave architecture ready for later:
- incoming supplier eInvoices;
- self-billing;
- additional Peppol documents.

Do not implement those fully now.

## 3. Architecture

Use:

```text
ERP document
 -> canonical eInvoice snapshot
 -> PINT-AE mapper
 -> PINT-AE XML
 -> ASP provider interface
 -> Mock / future real ASP
```

Keep existing:
- Next.js/TypeScript;
- Drizzle;
- one SQLite DB per business;
- explicit migration runner;
- existing VAT/accounting services;
- Docker webpack workflow;
- current UI/theme;
- service-level tests.

Do not add Redis, queues, microservices, PostgreSQL or Playwright.

## 4. eInvoicing Settings

Route:

```text
/b/[businessId]/settings/einvoicing
```

Fields as needed:

```text
einvoicing_enabled
legal_name
trn
legal_registration_identifier optional
registered_address
country_code = AE
participant_identifier optional
participant_scheme optional
endpoint_identifier optional
endpoint_scheme optional
asp_provider_key optional
asp_environment
specification_version
```

Environment:

```text
Disabled
Mock
Sandbox
Production
```

Phase 7 must work fully with Mock.

## 5. Readiness UI

Show:

```text
UAE eInvoicing Readiness

[✓] Legal business name
[✓] TRN
[✓] Registered address
[ ] Electronic endpoint
[ ] Accredited Service Provider

Data Ready
PINT-AE Ready
ASP Connected
```

Do not claim legal compliance merely because setup is complete.

## 6. Customer eInvoice Data

Add only necessary secondary fields:

```text
legal_name
trn optional
legal_registration_identifier optional
electronic_address optional
electronic_address_scheme optional
address fields
country_code
buyer_reference optional
```

Keep them in a collapsible/secondary `Electronic Invoicing` section so normal customer forms remain compact.

## 7. Canonical eInvoice Model

Create a provider-neutral TypeScript model:

```text
EInvoiceDocument
  specificationVersion
  documentType
  uuid
  documentNumber
  issueDate
  taxPointDate
  dueDate
  currency
  seller
  buyer
  references
  payment
  delivery
  transactionFlags
  lines
  allowances
  charges
  taxTotals
  monetaryTotals
```

Do not let this model depend on one ASP API.

## 8. Versioning

PINT-AE is versioned.

Persist:

```text
specification_version
```

Provide a registry pattern:

```text
getPintAeMapper(version)
getPintAeValidator(version)
```

Historical submitted payloads must remain tied to their original specification version.

Never silently regenerate old accepted eInvoices under a new version.

## 9. PINT-AE XML

Generate correct UBL roots:

```text
Invoice
CreditNote
```

Suggested module:

```text
src/modules/einvoicing/
  model.ts
  service.ts
  validation.ts
  pint-ae/
    mapper.ts
    xml.ts
    code-lists.ts
    versions/
  providers/
    provider.ts
    mock-provider.ts
```

Do not concatenate XML manually across route/service files.

## 10. Central code lists

Centralize official codes needed by the supported mapping:

```text
AE VAT categories
currency
country
unit
payment means
electronic address schemes
tax exemption reasons
credit-note reasons
transaction type
item type
```

UI uses friendly labels; generated payload uses official codes.

## 11. Transaction type

Support UAE transaction-type flags centrally:

```text
Free Trade Zone
Deemed Supply
Profit Margin Scheme
Summary Invoice
Continuous Supply
Agent Billing
E-Commerce
Export
```

Default normal invoice to all false.

Only expose this in advanced eInvoice fields.

## 12. Sales Invoice mapping

Map existing ERP data where supported:

```text
invoice number
UUID
issue date
tax point date
due date
currency
seller/buyer
buyer/order/contract/project references
delivery reference
payment means/terms
lines
tax categories
tax totals
monetary totals
```

Do not expose every PINT-AE field on the normal invoice form.

Use Business/Customer/Invoice/VAT/Project defaults.

## 13. Credit Note mapping

Map Sales Credit Note to PINT-AE Credit Note.

Include:
- credit-note number;
- UUID;
- issue/tax date;
- original invoice reference;
- reason/reason code where required;
- buyer/seller;
- lines/tax/totals.

## 14. Validation layers

Use three levels:

### ERP readiness
Examples:
- missing seller legal data;
- missing buyer mandatory data;
- unsupported tax scenario;
- unsupported currency.

### Semantic validation
Check:
- mandatory fields;
- totals;
- tax categories;
- code-list values;
- references.

### PINT-AE XML/Schematron validation
Use official/versioned validation artifacts or a genuine compatible server-side validator.

Do not fake a green validation result.

## 15. Validation UI

Invoice View:

```text
Electronic Invoice
Status: Needs Data / Ready / Accepted / Rejected

[Validate]
```

Errors should be actionable:

```text
Buyer electronic address is missing.
Invalid unit code.
Tax exemption reason is required.
```

Technical rule IDs may appear in expandable details.

## 16. Electronic document tables

Add:

```text
einvoice_documents
einvoice_submissions
```

`einvoice_documents` fields:

```text
id
source_type
source_id
document_type
einvoice_uuid
specification_version
status
canonical_json
xml_payload
payload_hash
created_at
validated_at optional
submitted_at optional
accepted_at optional
rejected_at optional
last_error optional
```

`einvoice_submissions`:

```text
id
einvoice_document_id
provider_key
environment
attempt_number
status
provider_request_id optional
submitted_at optional
response_at optional
response_code optional
response_payload optional
error_message optional
created_at
```

Do not overwrite prior attempts.

## 17. Status model

Electronic status is separate from accounting status.

Use:

```text
NotPrepared
NeedsData
ValidationFailed
Ready
Submitted
Accepted
Rejected
```

Accounting remains:

```text
Draft
Posted
Void
```

## 18. Immutable snapshot

Before submission:
1. build canonical model;
2. generate XML;
3. calculate SHA-256 payload hash;
4. persist model/XML/hash/spec version.

The hash is an audit checksum, not a digital signature.

Submitted/accepted snapshots are immutable.

## 19. ASP provider interface

Create a provider-neutral interface such as:

```text
validateConnection()
submitInvoice()
getSubmissionStatus()
```

Normalize provider responses:

```text
providerRequestId
status
exchangeStatus
reportingStatus
errors
rawResponse
```

Provider-specific formats must stay inside provider adapters.

## 20. Mock provider

Implement `MockEInvoiceProvider`.

Support:
- Accepted;
- validation/provider rejection;
- exchange rejection;
- reporting rejection/pending where useful.

Clearly label all Mock results as MOCK.

Never represent Mock acceptance as FTA/government acceptance.

## 21. UAE exchange/reporting statuses

Track normalized:

```text
exchange_status
reporting_status
```

Conceptual values:

```text
Pending
Accepted
Rejected
```

Store raw provider responses too.

Core ERP code should not depend on commercial provider status strings.

## 22. TDD boundary

The UAE network reports Tax Data Documents through the network.

Core ERP should track reporting status but must not submit TDD directly to the FTA.

Any ASP-specific reporting calls belong inside the future provider adapter.

## 23. Submission workflow

Server-side only:

```text
validate eligibility
 -> load/create immutable Ready snapshot
 -> persist submission attempt
 -> call provider
 -> persist normalized/raw response
 -> update eInvoice status
```

No browser-to-ASP API calls.

## 24. Eligibility

Only allow submission when:
- source is posted;
- not void;
- eInvoicing enabled;
- business/customer data ready;
- VAT/tax scenario supported;
- PINT-AE validation passes.

Drafts cannot be submitted.

## 25. Edit/correction rules

Before submission:
- source financial edit invalidates the Ready snapshot;
- regenerate before submission.

After Accepted:
- do not silently modify/regenerate the accepted eInvoice;
- block material financial edits;
- guide user to Sales Credit Note/correction workflow.

Internal non-financial notes may remain editable.

## 26. Invoice View integration

Keep accounting primary.

Example:

```text
Electronic Invoice
Accepted

UUID: ...
PINT-AE: <stored version>
ASP: Mock / Provider
Exchange: Accepted
Reporting: Accepted

[View eInvoice] [Download XML] [Submission History]
```

Keep:

```text
Print / PDF
```

separate.

PDF is not the electronic invoice.

## 27. eInvoice list/detail

Add a compact list:

```text
Electronic Invoices
```

Columns:

```text
Document
Customer
Issue Date
Total
PINT Status
Exchange
Reporting
Provider
Last Update
```

Filters:

```text
Needs Data
Ready
Submitted
Accepted
Rejected
Date
Customer
```

Optional detail route:

```text
/b/[businessId]/einvoicing/[id]
```

Show snapshot/version/hash/status/history without exposing credentials.

## 28. VAT integration

Reuse Phase 6:
- tax dates;
- normalized VAT categories;
- tax codes;
- tax totals.

Do not create a second VAT classification engine.

If an ERP tax category cannot map to the supported PINT-AE rules, fail validation.

## 29. Project/references

Reuse existing source relationships for:
- Project;
- buyer reference;
- PO/order;
- delivery;
- original invoice.

Map where supported by PINT-AE.

Do not duplicate source references unnecessarily.

## 30. Currency

Generate the document currency correctly.

Where PINT-AE requires UAE tax-accounting currency data, map it only when the ERP has reliable values.

If current accounting cannot safely support a non-AED eInvoice scenario:
- mark it unsupported;
- fail validation clearly.

Do not build full FX/revaluation in this phase.

## 31. Security

Provider secrets:
- env/external secret configuration;
- server-only;
- never returned to clients;
- never included in business backups;
- never logged.

Raw XML/responses contain business data.
Do not place them in normal logs.

Every view/download/submit route must enforce business/module permission server-side.

## 32. Backup/restore

Backup should preserve:
- settings excluding secrets;
- canonical snapshot;
- XML;
- hash;
- statuses;
- submission history;
- responses.

Restore must:
- never auto-resubmit;
- default provider execution to Disabled/Mock unless safe external configuration exists.

## 33. Self-billing and inbound invoices

Do not implement now.

Architecture must leave room for:

```text
Self-Billed Invoice
Self-Billed Credit Note

Incoming eInvoice
 -> validation
 -> supplier match
 -> Purchase Invoice draft
```

No automatic AP posting.

## 34. Tests

Add service-level tests for:

### Mapping/XML
- valid invoice maps correctly;
- credit note references source invoice;
- source totals equal canonical/XML totals;
- correct Invoice/CreditNote root;
- UUID/spec version preserved;
- deterministic snapshot/XML;
- unsupported tax scenario fails.

### Validation
- missing seller rejected;
- missing buyer mandatory data rejected;
- invalid code rejected;
- invalid totals rejected.

### Status/provider
- Ready -> Submitted -> Accepted;
- Ready -> Submitted -> Rejected;
- retry adds submission history;
- provider failure never changes accounting.

### Edit rules
- pre-submission financial edit invalidates snapshot;
- accepted eInvoice financial edit is blocked.

### Security/backup
- cross-business access blocked;
- unauthorized submission/download blocked;
- provider secret absent from client/backup;
- restore preserves archive without resubmission.

No Playwright.

## 35. Demo workflow

Demo business:

```text
eInvoicing enabled
Environment: Mock
```

Seed:
- one complete eInvoice-ready customer;
- one customer missing required endpoint/data;
- one eligible posted Sales Invoice;
- one eligible Sales Credit Note.

Mock scenarios:
- Accepted;
- Rejected;
- Pending/reporting rejection if useful.

## 36. Migration

Use the existing versioned business migration runner.

Add:
- eInvoicing settings;
- customer eInvoice fields;
- only necessary source-document fields;
- `einvoice_documents`;
- `einvoice_submissions`;
- indexes/status fields.

Preserve Phase 0–6 data.

Do not automatically submit or generate eInvoices for all historical invoices.

## 37. UI/UX

Follow `docs/THEME.md`.

Keep eInvoicing:
- compact;
- status-driven;
- understandable without Peppol expertise;
- consistent in Light/Dark/mobile.

Use friendly states:

```text
Needs Data
Ready
Submitted
Accepted
Rejected
```

Technical validation details may expand below.

Do not create a giant compliance dashboard.

## 38. Do Not Build in Phase 7

Defer:

```text
Direct FTA API
Direct Corner-5/TDD submission
Hard-coded commercial ASP
Incoming AP automation
Self-billing
B2C eReceipt workflow
Automatic endpoint discovery
Full multi-currency/FX support
Background retry workers
Redis/queues
Production deployment
PostgreSQL
Playwright
```

## 39. Final Verification

Run once after the whole phase.

### Baseline

```bash
docker compose up --watch
pnpm typecheck
pnpm lint
pnpm db:check
pnpm test
```

### Readiness
Enable eInvoicing and confirm missing/complete setup is identified correctly.

### Valid Sales Invoice
Prepare a posted invoice and confirm:
- canonical snapshot;
- immutable UUID;
- spec version;
- exact totals;
- genuine PINT-AE validation;
- XML;
- SHA-256 hash.

### Invalid Customer
Prepare invoice with missing required buyer data.
Confirm Needs Data/Validation Failed and submission blocked.

### Credit Note
Confirm correct PINT Credit Note mapping and original invoice reference.

### Mock Accepted
Confirm:

```text
Ready -> Submitted -> Accepted
```

and accounting/AR/VAT do not change from transmission.

### Mock Rejected
Confirm:
- Rejected;
- error/raw response retained;
- retry creates a new attempt;
- accounting unchanged.

### Edit rules
- Ready snapshot + source financial edit -> snapshot invalidated;
- Accepted eInvoice + source financial edit -> blocked/correction workflow.

### PDF/XML
Confirm UI clearly separates `Print/PDF` and `Electronic Invoice XML`.

### Version archive
Confirm historical spec version/XML does not silently change.

### Permissions/isolation
Confirm unauthorized and cross-business payload/status access is blocked.

### Backup
Backup/import and confirm archive/history preserved, secrets excluded, no auto-resubmission.

### Theme/responsive
Check Light, Dark, desktop and narrow/mobile.

## Phase 7 Definition of Done

Phase 7 is complete when:
- readiness/settings work;
- Sales Invoices and Sales Credit Notes map to a versioned provider-neutral model;
- supported PINT-AE XML is genuinely validated;
- snapshots/XML/hash/history are auditable;
- Mock provider proves submission/status/rejection flows;
- core code is independent of commercial ASPs;
- accounting remains independent from eInvoice transmission;
- accepted electronic invoices cannot be silently rewritten;
- PDF and eInvoice XML are clearly distinct;
- backup/security/business isolation/tests pass.

Stop after Phase 7.

Recommended next phase:
**Inbound supplier eInvoices + Purchase Invoice review/draft automation**, or a real ASP adapter after a provider is selected.
