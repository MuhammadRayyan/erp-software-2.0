# Current state — Ledgerly ERP

Updated **29 October 2026** from source, release evidence and authenticated operational checks. Historical implementation narratives remain in [CHANGELOG.md](CHANGELOG.md), [history](history/README.md) and Git history.

## Release and scope

- Package **2.7.0**; verified live deployment baseline: `252093a78db7df9afd9810e96344c1bd237829a9`. For the current live revision, query [public health](https://erp-portal.rapidtss.com/api/health) and compare with the latest successful [release run](https://github.com/MuhammadRayyan/erp-software-2.0/actions/workflows/deploy.yml).
- Image: `ghcr.io/muhammadrayyan/erp-software-2.0@sha256:4d0a94e8eb49e34e93ca3a43b5c93fd859b59832532cabfe49cb7bce6461be50`.
- Successful release verified live on Oracle Cloud VM. HTTPS health returned that revision.
- Closed testing: a few businesses, **5–10 users**. Keep the public repository, current architecture and implemented checks. Additional hardening/backlog is owner-deferred.

## Implemented architecture

Node **22**, npm **10.9.4**, Next.js **16.4.3**, React **19.2.8**, TypeScript **6.0.3**, Tailwind **4.3.3**, Better Auth **1.7.14**, better-sqlite3 **13.0.3**, Drizzle **0.45.2**, decimal.js **10.6.0**, Sentry SDK **10.75.2**. Pins/lockfile and Docker/workflow are authoritative when versions change.

One application owns UI, actions/routes, domain services, databases, attachments and React PDF/Chromium rendering. Production is a native ARM64 standalone image, non-root UID/GID 10001, read-only root, writable temporary/cache/data mounts, 3 GiB app memory, PID limit 256 and bounded logs. There is no separate backend, Redis, queue or database cluster.

`ERP_DATA_DIR` defaults to `data/`; production host data is `/opt/modern-erp/data`. System file: `system/system.sqlite`, schema **6**. Each business has `businesses/<trusted-directory-key>/business.sqlite`, schema **35**, and `attachments/`. Last deep live check covered the system and six businesses and passed integrity, foreign keys and reconciliation.

Membership/account checks select trusted business directories. Connections use WAL, foreign keys, **synchronous FULL**, a 5-second busy timeout, and a 50-entry tenant connection cache with idle eviction. Same-database writes serialize; synchronous work can block the Node event loop. File separation complements authorization and does not sandbox a compromised process. Explicit migration history/schema checks replace schema push; production migration is external and serialized.

## Product and correctness

Implemented: sales quotes/revisions, orders, invoices, receipts/advance allocations and credit notes; purchase quotes/orders/bills/payments/prepayments/debit notes; customers/suppliers and statements/aging; accounts/journals/financial reports; bank imports/rules/transfers/reconciliation; inventory/locations/receipts/deliveries/adjustments; multi-customer projects/profitability; employees/payroll/EOSB; administration, permissions, currencies, numbering, custom fields, templates/PDFs and business backup/import.

Money uses checked currency-minor-unit integers, BigInt intermediates and canonical decimal FX rates. Quantities use **10,000** scale despite legacy `micros` naming. Shared rational/decimal helpers repair rounding, cash-basis aggregation, payroll/FX and purchase settlement/aging including posted debit notes. Journals and payroll/document linkage are reconciled. Posted payroll is immutable/idempotent; other document correction rules remain module-specific.

Shared mutation guards cover **147 commands**, with action/batch/conversion/export/settings checks and active-user enforcement. Dashboard/email-history reads filter by module permissions; trusted origins come from explicit configuration. Runtime keys were replaced on the VM and initial sessions/tokens revoked; `/opt/modern-erp/runtime.env` is mode 0600 and excluded from images.

Targeted shared UI, permission, form-error and mobile fixes are verified. A complete screen-by-screen accessibility/UX review, universal immutable financial audit trail and regulatory accounting certification are not claimed. VAT period/calculation data does not establish cryptographically signed snapshots. Active PINT-AE/provider integration is absent; legacy schema is not an active feature.

## Delivery and evidence

Protected PR → source/browser checks → tested native ARM64 image → merge/reverification → GHCR digest → serialized snapshot/rehearsal/migration → tenant and HTTPS/revision checks. Previous image/configuration/assets are retained; fallback requires schema compatibility. Never automatically restore databases after writes resume. [DEPLOYMENT.md](DEPLOYMENT.md) owns the procedure.

Last release passed **345** unit/integration tests, **5** browser scenarios, **8** deployment failure/recovery scenarios, source checks, production dependency audit and real native PDF/WAL-backup gates. These are release results, not tests rerun for this documentation update. Corrected deployments observed about 6–8 seconds of maintenance, not a general zero-downtime guarantee.

Local snapshots are under `/opt/modern-erp/backups`. Scheduled offsite recovery and a replacement-host drill remain unestablished. Proposed 15-minute RPO/one-hour RTO are recommendations, not measured guarantees.

## Verified operations

- OCI: `modern-erp`, `me-dubai-1`, A1 Flex ARM64, **2 OCPUs / 12 GB RAM**, boot volume **100 GB / 10 VPUs per GB**, no autotune policy, attachment encryption enabled, IMDSv2 only.
- VNIC has no NSGs; subnet security list permits TCP 22/80/443. No assigned boot-volume backup policy, existing boot-volume backups or root alarms were returned.
- Private local OCI profile **ERP_OPERATIONS** in `~/.oci/config` passed **13 read-only checks, zero failures**. API-only user `erp-operations-api` belongs to `erp-operations-readonly`; Console login/other credentials are disabled. Standard self-service management of its own signing keys still applies.
- Sentry token in `~/.sentryclirc`: alerts/event/org/project read scopes. Project `personal-bv0 / erp-20`, historical events, three enabled monitors and one email workflow were verified. Current-release ingestion/association, source maps and delivered notifications remain unproven.
- SSH/GitHub work. OCI/Sentry credentials stay outside the repository and are separate from deployment credentials. Trial credit was observed; settled billing/free-tier entitlement is unestablished. Kernel reboot remains pending/unperformed.

Read [operations evidence](history/TESTING_PHASE_OPERATIONS_2026-10-26.md), [hardening outcome](history/HARDENING_OUTCOME_2026-10-26.md) and [next steps](NEXT_STEPS.md). The already tracked real Manager.io backup remains public under the owner's ignore-only decision.

## Local acceptance and cleanup follow-up

The requested synthetic acceptance round passed **341 service/regression checks across 45 suites** and **11 production-build browser scenarios** on Node 22.23.4/npm 10.9.4. The real-data Manager.io import suite was excluded. Direct Server Action permission denial, quote/order/invoice/settlement linkage and journals, payroll post/void reconciliation, error recovery, keyboard interaction, mobile containment and invoice PDFs were exercised. The actual HTML PDF renderer also passed. See [the verification and cleanup report](history/FLOW_VERIFICATION_AND_CLEANUP_2026-10-26.md) for scope and limits.

Service tests now have a shared isolation preload; the default browser command uses temporary synthetic fixtures. Historical logs are under `docs/history`; generated screenshots, old source archive, obsolete Bun lockfile and inactive build/pnpm cache are retained locally in ignored folders. All **656 existing local SQLite files** matched their pre-run hashes, with none added or removed under local `data/`. These are local development files, not a count of production businesses. Real Manager.io backups were retained. Cleanup did not reclaim quarantined cache space and was not deployed.
