# Next steps — closed testing phase

Updated **14 November 2026**. Audience: a few businesses and 5–10 users. Keep the current architecture and implemented release checks. This checklist does not authorize deferred operations.

## Complete

- Permission/dashboard/origin checks, payroll transitions, shared financial fixes, legal-entity snapshotting (`schema v36`), reversible document lifecycles, zero-scroll `DocumentGrid` with 2D keyboard navigation and TSV paste, and reconciliation are deployed (`797b679e476c90a1b7d60bef387fedc85004a587`).
- Financial analytics (report/VAT drill-down, comparative P&L/Balance Sheet, `saved_reports`, line-level custom fields and `showOnPdf` PDF filtering), UAE regulatory workflows (WPS `.SIF`, Post-Dated Cheques with clearing accounts `1120`/`2020`, FTA `FAF` export and 15-digit TRN Luhn validation), and Maker-Checker approvals (`schema v7` / `v37`) with selectable `requires_approval` and bidirectional notifications are implemented and verified locally.
- Protected PR/source/browser/native ARM64 image checks and immutable merge-to-deploy flow are active, with serialized migrations, snapshot/restore verification, tenant readiness and prior-release retention.
- Runtime keys were replaced/excluded from images; actual Chromium PDF and SQLite WAL recovery paths were tested.
- GitHub/SSH work; private read-only Sentry access and OCI profile **ERP_OPERATIONS** are configured. OCI verification passed 14 checks, zero failures.
- Current documentation and the deployment skill are synchronized; credentials remain outside Git.

See [current state](CURRENT_STATE.md), [hardening outcome](history/HARDENING_OUTCOME_2026-10-26.md) and [operations evidence](history/TESTING_PHASE_OPERATIONS_2026-10-26.md).

## Next: one small acceptance round

**Automated round completed:** 409 service/regression checks across 54 test files (`npm test`) and 15 production-build browser scenarios passed using isolated synthetic businesses. [Results and cleanup](history/FLOW_VERIFICATION_AND_CLEANUP_2026-10-26.md) records layer-by-layer evidence and exclusions. The table below remains useful for representative human-user testing; automated checks do not establish that every screen or interaction has been reviewed.

Use an identified disposable test business with synthetic records. Assign Administrator and restricted-user testers. Do not run destructive scenarios or fixture scripts in customer businesses.

| Flow | Pass evidence |
|---|---|
| Business access | Assigned businesses/modules only; direct routes/actions respect permissions. |
| Sales | Quote → order → invoice → receipt/credit: correct status, balance, links and journals. |
| Purchases | Quote → order → bill → payment/debit note: settlements/reversals reconcile. |
| Inventory/projects | Receipts/deliveries and project assignments agree with source documents/reports. |
| Payroll | Draft/post/repeated-post/void produces the expected journal and status. |
| UI/PDF | Common PDFs render; invalid entries recover; long tables, keyboard use and phone-width layouts remain usable. |
| Portable business backup | Export/import a synthetic business into a separate test copy; compare balances, attachments and ownership. This is not a full-host recovery drill. |
| Next genuine code fix | PR → both gates → merge → successful deployment → matching public health revision. Avoid a needless production deployment just to repeat a proven gate. |

Record pass/fail, role, fixture, steps, expected/actual result and release revision. Fix reproducible defects in bounded changes through the existing PR flow. Automated tests support this round but do not replace user acceptance.

## Outstanding verification and maintenance

| Item | Status / next decision |
|---|---|
| OCI billing | Trial credit observed; independently confirm entitlement/billing before the trial ends. Read-only API setup does not establish Always Free eligibility. |
| Sentry delivery | Historical events and enabled monitors/workflow verified. Current-release event/association, source maps and actual delivery remain unproven. Describe a controlled check before sending an event or notification. |
| Docker disk & release retention | `docker system df` on `193.123.65.48` shows ~18.3 GB of reclaimable historical images and ~3.2 GB of build cache across 14 retained releases. Schedule `docker image prune -a --filter "until=168h"` and release/backup rotation during a maintenance window. Kernel `7.0.0-1013-oracle` is already active (`REBOOT_REQUIRED=no`). |

## Deferred by owner

Offsite backup scheduling/retention/alerts and replacement-host restore; SMTP; large/untrusted import staging and quotas; immutable financial audit controls; narrower deployment SSH identity; load/performance work; dependency/peer cleanup. No recurring maintenance automation has been added.

Before wider onboarding or relying on real transaction recovery, revisit these decisions. Proposed **15-minute RPO / one-hour RTO** are unverified targets. Local deployment snapshots do not protect against host loss or bound loss between releases; no OCI boot-volume backup/policy was returned.

The repository and its tracked real Manager.io backup remain public. Ignore rules do not remove existing data/history; cleanup remains owner-deferred.

Mark tasks complete only with observed evidence. Keep credentials in private local config, maintain PR verification for changes, and follow [DEPLOYMENT.md](DEPLOYMENT.md) for release/recovery procedures.
