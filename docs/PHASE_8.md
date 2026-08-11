# Phase 8 — Inbound Supplier eInvoices + AP Draft Review

## Purpose

Add the inbound half of UAE eInvoicing without allowing external electronic documents to post accounting automatically.

Core flow:

```text
ASP / Mock Provider
 -> Receive PINT-AE Invoice
 -> Store Immutable Original
 -> Validate
 -> Detect Duplicate
 -> Match Supplier
 -> Suggest PO / Goods Receipt
 -> Review
 -> Create Purchase Invoice Draft
 -> User Reviews
 -> User Posts through Existing AP Service
```

Critical rule:

```text
Receiving an eInvoice NEVER creates a journal entry automatically.
```

Do not implement a real commercial ASP unless one has explicitly been selected.
Do not auto-post Purchase Invoices.
Do not add AI/OCR in this phase.

Implement the whole phase first.
Run the final verification only after Phase 8 is complete.

## 1. Context Strategy

Codex should normally read only:

```text
README.md
docs/CURRENT_STATE.md
docs/THEME.md
docs/PHASE_8.md
```

Inspect the current code/schema/services as the authority for implemented behavior.

Only open an older phase file when a specific unresolved implementation conflict requires it.

At the end of Phase 8, update `docs/CURRENT_STATE.md`.

## 2. Current UAE / PINT-AE Basis

The inbound design should follow the current UAE/OpenPeppol model:

- structured electronic invoices are exchanged through Accredited Service Providers;
- the buyer receives structured invoice data through its provider;
- PINT-AE Invoice and Credit Note are versioned specifications;
- message-level exchange/reporting statuses are part of the network;
- PDF/image/email attachments are not the authoritative electronic invoice.

Keep specification handling versioned and isolated.

## 3. Scope

Fully support inbound:

```text
Supplier PINT-AE Invoice
```

For inbound PINT-AE Credit Notes in Phase 8:

```text
receive
validate
archive
display
```

but do not convert them into accounting unless a Purchase Credit Note document already exists.

If Purchase Credit Notes are not implemented, show:

```text
Valid electronic credit note — accounting conversion not yet supported.
```

Do not invent an incorrect AP workaround.

## 4. Architecture

Use:

```text
Inbound Provider Payload
 -> Provider Adapter
 -> Raw XML Archive
 -> PINT-AE Parser / Validator
 -> Canonical Inbound eInvoice
 -> Supplier / PO / GR Matching
 -> Human Review
 -> Purchase Invoice Draft
 -> Existing Purchase Invoice Posting Service
```

Reuse the Phase 7:
- PINT-AE version registry;
- code lists;
- XML validation;
- canonical party/tax concepts;
- provider abstraction.

Do not build a second PINT engine.

## 5. Provider-Neutral Inbound Boundary

Extend the existing provider boundary with normalized inbound support.

Conceptual interface:

```text
receiveDocument(...)
normalizeInbound(...)
acknowledgeReceipt(...) optional
getInboundStatus(...) optional
```

Provider-specific authentication, signatures, webhook/event format, request IDs, and response codes stay inside adapters.

Core AP code receives normalized inbound documents only.

## 6. Mock Inbound Provider

Phase 8 must work end-to-end using Mock.

Provide development/testing fixtures for:

```text
valid PINT-AE Invoice
invalid Invoice
duplicate Invoice
unknown Supplier
PO-matched Invoice
Goods-Receipt-matched Invoice
VAT mismatch
unsupported Credit Note
```

Clearly label all Mock events as `MOCK`.

No public production webhook is required yet.

## 7. Inbound eInvoice Storage

Add or extend tables such as:

```text
inbound_einvoice_documents
inbound_einvoice_events
```

Recommended document fields:

```text
id
provider_key
environment
provider_document_id optional
document_type
specification_version
document_uuid
seller_endpoint_id optional
seller_trn optional
seller_legal_name
document_number
issue_date
tax_date optional
currency_code
status
raw_xml
raw_hash
canonical_json
validation_result_json optional
received_at
validated_at optional
supplier_id optional
purchase_order_id optional
goods_receipt_id optional
purchase_invoice_id optional
last_error optional
```

Events/history:

```text
id
inbound_document_id
event_type
status
provider_event_id optional
raw_response optional
created_at
```

Never overwrite the original received XML.

## 8. Inbound Status Model

Use:

```text
Received
ValidationFailed
Validated
NeedsSupplier
NeedsReview
ReadyForDraft
DraftCreated
Processed
Rejected
Archived
```

Keep provider/network status separate from review status and Purchase Invoice status.

## 9. Secure XML Intake

Treat incoming XML as untrusted.

Required:
- payload size limits;
- supported XML/UTF-8 only;
- disable DTD/external entities;
- no network fetches from XML;
- validate document root;
- validate supported PINT-AE version;
- never render raw XML as HTML.

Reject malformed/unsafe documents before business processing.

## 10. Duplicate Detection

Use strong identifiers where available:

```text
document UUID
seller electronic endpoint
seller TRN
document number
provider document ID
raw payload hash
```

Hard duplicate:
```text
same supported UUID + seller identity
```

Likely duplicate:
```text
same supplier + invoice number + issue date/currency/total
```

Never create a second Purchase Invoice draft automatically for the same inbound document.

## 11. PINT-AE Validation

Reuse Phase 7 validators.

Validate:
- XML/Schematron;
- mandatory fields;
- code lists;
- totals;
- tax categories;
- currency;
- supplier/buyer identities;
- invoice-line semantics.

Persist validation results and rule IDs.

Do not modify the incoming invoice to make it validate.

## 12. Buyer Identity Check

Before accepting an inbound invoice for this business, validate buyer identity using supported identifiers such as:

```text
electronic endpoint
TRN
legal registration ID
legal name where appropriate
```

If clearly intended for another entity:

```text
reject / quarantine
```

Do not convert it into a Purchase Invoice.

## 13. Supplier Matching

Match deterministically.

Priority:

```text
1. electronic endpoint + scheme
2. TRN
3. legal registration identifier
4. previously confirmed identity mapping
5. manual selection
```

Do not auto-match only by fuzzy supplier name.

If no reliable match:

```text
NeedsSupplier
```

Allow:
- select existing Supplier;
- create Supplier;
- save confirmed identity mapping.

Supplier creation remains user-confirmed.

## 14. Supplier eInvoice Master Data

Extend Supplier only where needed:

```text
legal_name
trn
legal_registration_identifier optional
electronic_address optional
electronic_address_scheme optional
registered_address
country_code
```

Keep these in a secondary `Electronic Invoicing` section.

## 15. Inbound Inbox

Route:

```text
/b/[businessId]/purchases/einvoices
```

Example:

```text
Supplier eInvoices

[Search...]                   [Status] [Supplier] [Date]

Received     Supplier        Invoice      Date       Total       Status
10 Aug       ABC Supplies    A-1044       09 Aug     10,500      Needs Review
10 Aug       Unknown         X-992        10 Aug      4,200      Needs Supplier
```

Filters:

```text
Needs Supplier
Needs Review
Ready for Draft
Draft Created
Validation Failed
Processed
```

Keep it compact.

## 16. Inbound Detail / Review Page

Route:

```text
/b/[businessId]/purchases/einvoices/[id]
```

Suggested sections:

```text
Summary
Lines
Tax
Matching
Source XML
History
```

Do not show raw XML by default.

## 17. Purchase Order Matching

Use explicit source references first.

If inbound invoice references a Purchase Order:

Validate:
- PO exists;
- supplier matches;
- PO not cancelled;
- currency compatible;
- referenced lines/items plausible.

Show a compact PO comparison.

Do not silently link another supplier's PO.

## 18. Goods Receipt Matching

Show:

```text
Ordered
Received
Previously Invoiced
Current eInvoice
Variance
```

Provide deterministic review information.

Do not add a complex tolerance/approval engine yet.

## 19. Line Matching

Try deterministic matching using:

```text
PO line reference
supplier item identifier
ERP item identifier if previously mapped
description
quantity
unit
unit price
```

Classify:

```text
Matched
Possible Match
Unmatched
```

Do not use AI/fuzzy auto-acceptance.

## 20. Inventory / Expense Mapping

Each inbound line must map to:

```text
Inventory Item
or
Expense / Service
```

If linked PO already contains Inventory Item/account/project, reuse it.

Otherwise user selects:
- Inventory Item;
- expense account;
- Project optional;
- tax code where required.

Do not automatically create Inventory Items.

## 21. VAT Mapping

Reuse Phase 6 VAT classifications.

Map supported PINT-AE VAT categories into existing ERP tax codes.

Validate:
- net;
- VAT;
- category;
- recoverability;
- tax date;
- VAT period lock.

If mapping is unsafe:

```text
Needs Review
```

Do not invent a tax code.

## 22. Totals Comparison

Before draft creation, compare inbound and ERP draft totals:

```text
Net
Allowances/Charges
VAT
Total
Amount Due
```

Draft creation requires no unexplained monetary difference.

## 23. Purchase Invoice Draft Creation

Action:

```text
Create Purchase Invoice Draft
```

Rules:
- one inbound eInvoice -> at most one active linked Purchase Invoice draft;
- Supplier confirmed;
- validation acceptable;
- duplicates resolved;
- line/account/item mappings complete;
- tax mapping valid;
- totals reconcile.

Prefill the normal Purchase Invoice draft.

Result:

```text
Purchase Invoice status = Draft
```

No journal.
No AP.
No physical stock movement.

## 24. Human Review Before Posting

User must review the normal Purchase Invoice page.

Show source banner:

```text
Created from electronic supplier invoice A-1044
[PINT-AE Valid] [View Source]
```

Posting uses the existing Purchase Invoice service.

Before posting revalidate:
- supplier invoice duplicate;
- supplier;
- accounting/VAT locks;
- mappings;
- totals;
- AP/tax settings.

Do not create a parallel eInvoice posting path.

## 25. Source Provenance

Purchase Invoice View retains:

```text
Electronic Source
UUID
Supplier document number
Specification version
Received date
Validation status
```

Link back to inbound source.

## 26. Draft Edit Behavior

Allow ERP-specific mapping edits such as:
- account;
- Inventory Item;
- Project;
- internal description.

Do not silently alter supplier-origin monetary facts.

For Phase 8:

```text
Purchase Invoice monetary/tax totals must equal the inbound eInvoice.
```

If not, block posting until resolved.

## 27. Supplier Invoice Number Duplicate Check

Before Draft creation and before Post:

```text
supplier_id + supplier_invoice_number
```

must be checked against non-void Purchase Invoices.

If duplicate exists, show the linked existing Purchase Invoice and do not create/post another.

## 28. Message-Level Status Boundary

Retain provider/network event data.

If a provider supports buyer acknowledgement/status, keep those calls inside its adapter.

Mock may simulate them.

Do not claim a real MLS was transmitted unless a real provider actually did it.

## 29. Rejection / Archive

Inbound document may be:

```text
Rejected
Archived
```

Require a reason for manual rejection.

Examples:
- wrong buyer;
- duplicate;
- invalid supplier invoice;
- commercial dispute;
- unsupported document.

No accounting effect.

## 30. Incoming Credit Notes

Receive and validate PINT-AE Credit Notes.

If Purchase Credit Note accounting does not exist:
- display source invoice reference;
- keep archive/history;
- allow Supplier match;
- explicitly state conversion is deferred.

Do not create a negative Purchase Invoice shortcut.

## 31. Permissions

Recommended:

Purchases users:
- view inbox;
- review;
- create Purchase Invoice Draft.

Admin:
- provider configuration;
- electronic identity mappings;
- reject/archive if needed.

Posting uses existing Purchase permissions/rules.

Server-side enforcement required.

## 32. Business Isolation

Every inbound document belongs to one Business.

Future real provider routing must map a trusted provider account/endpoint to the internal business.
Do not trust a client-supplied business ID alone.

Cross-business access must fail.

## 33. Security

Protect against:
- XML entity attacks;
- oversized payloads;
- malformed encoding;
- unsupported roots/versions;
- duplicate provider events;
- HTML/script injection in supplier text;
- unsafe attachments.

Raw XML/download routes require permission.

## 34. Backup / Restore

Backup preserves:
- raw XML;
- hash;
- canonical snapshot;
- validation result;
- matching links;
- Purchase Invoice source link;
- history.

Restore must not:
- replay provider events;
- generate duplicate drafts;
- auto-post;
- restore provider secrets.

## 35. UI / UX

Follow `docs/THEME.md`.

Primary flow:

```text
Inbox
 -> Review
 -> Resolve Supplier / Matching
 -> Create Draft
 -> Purchase Invoice
 -> Post
```

Use compact summaries, readable differences, right-aligned money, consistent statuses, and clear validation warnings.

No giant procurement dashboard.

## 36. Responsive

Desktop/tablet primary.

At small widths:
- summary stacks;
- comparison tables scroll;
- validation remains readable;
- Create Draft stays reachable.

## 37. Tests

Extend service tests.

Minimum:

### Intake
- valid Invoice stored/validated;
- unsafe XML rejected;
- unsupported version rejected;
- raw XML/hash immutable.

### Duplicate
- duplicate UUID/seller blocked;
- duplicate supplier invoice cannot create second payable.

### Supplier
- endpoint match;
- TRN fallback;
- name-only never auto-confirms;
- wrong buyer rejected/quarantined.

### Matching
- correct PO match;
- wrong supplier PO rejected;
- GR quantities shown correctly;
- unresolved line requires review.

### Draft
- valid inbound creates Draft only;
- no journal/AP on receipt/draft creation;
- mappings/totals copied;
- final Post uses existing PI service.

### VAT
- supported VAT maps correctly;
- unsupported VAT blocks draft/post;
- finalized VAT period lock still works.

### Security/isolation
- cross-business access blocked;
- unauthorized XML access blocked.

### Backup
- archive survives restore;
- no replay/repost.

No Playwright.

## 38. Migration

Use the existing explicit business migration runner.

Add:
- inbound eInvoice tables/history;
- supplier eInvoice identifiers/mappings;
- Purchase Invoice source link if needed;
- indexes for UUID, supplier invoice number, status and received date.

Preserve Phase 0–7 data.

Do not invent inbound records from historical Purchase Invoices.

## 39. Do Not Build in Phase 8

Defer:

```text
Automatic AP Posting
AI/OCR Invoice Extraction
ML/Fuzzy Auto-Matching
Automatic Item Creation
Tolerance/Approval Engine
Purchase Credit Note Accounting unless already present
Self-Billing
Real ASP unless explicitly selected
Background Workers / Queues
Redis
PostgreSQL
Playwright
Production Infrastructure
```

## 40. Final Verification

Run once after full Phase 8 implementation.

### Baseline

```bash
docker compose up --watch
pnpm typecheck
pnpm lint
pnpm db:check
pnpm test
```

### Valid inbound
Inject valid Mock PINT-AE supplier invoice.
Confirm XML/hash/validation stored and no AP/journal created.

### Supplier
Confirm endpoint match and unknown Supplier -> Needs Supplier.

### Duplicate
Inject same document again.
Confirm no duplicate draft.

### PO / GR
Confirm source matching, quantities and variances.

### Draft
Create Purchase Invoice Draft.
Confirm source provenance and still no journal/AP.

### Post
Post through normal Purchase Invoice workflow.
Confirm AP/VAT/Project/Inventory behavior remains correct.

### Invalid VAT
Confirm unsafe VAT mapping blocks draft/post.

### Wrong buyer
Confirm document cannot become Purchase Invoice.

### Credit Note
Confirm unsupported accounting conversion is stated honestly if Purchase Credit Notes do not exist.

### Permissions/isolation
Confirm unauthorized/cross-business inbox/XML access fails.

### Backup
Confirm archive links persist and nothing replays.

### Theme/responsive
Check Light, Dark, desktop and narrow/mobile.

## Phase 8 Definition of Done

Phase 8 is complete when:
- inbound PINT-AE supplier invoices can be received through Mock/provider-neutral boundary;
- original XML and validation evidence are immutable;
- duplicates are prevented;
- buyer identity is verified;
- suppliers are matched deterministically;
- PO/GR matching helps review;
- line/account/item/project/tax mappings can be resolved;
- valid inbound invoices create Purchase Invoice Drafts only;
- inbound receipt never creates AP/journals automatically;
- final posting uses the existing Purchase Invoice service;
- source provenance remains attached;
- unsupported inbound Credit Notes are handled honestly;
- permissions, business isolation, backup and tests pass.

Stop after Phase 8.

Update `docs/CURRENT_STATE.md`.

Recommended next phase:
**Multi-Currency Accounting Foundation**, unless a real UAE ASP has been selected first.
