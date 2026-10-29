# Flow verification and repository cleanup — 26 October 2026

## Outcome and scope

**341 service/regression checks passed across 45 suites; 11 production-build browser scenarios passed.** No application defect was reproduced in the tested paths. The actual HTML-template renderer produced a valid 39,314-byte PDF. A fresh production build, TypeScript, lint and permission coverage checks were also exercised; final command results are retained in ignored `test-results/acceptance/`.

Final static checks passed, including 147-command permission coverage and Windows actionlint validation of the updated workflow. Documentation link/whitespace and deployment-skill metadata checks also passed. Runtime source under `src/` and the production database/configuration were unchanged by this follow-up.

Application baseline: `32df273e5eeecec3db15f95bd8ba8d0f1cc1cd93`. Runtime used for this round: **Node 22.23.4 / npm 10.9.4** with the existing native SQLite binding. Browser tests used the freshly built `.next-validate` bundle, not production or a normal development database. The final browser run reported 11 expected, zero unexpected, zero skipped and zero flaky scenarios.

All fixtures were synthetic and isolated in temporary directories. Production was not mutated or deployed. The existing real-data Manager.io import suite was deliberately excluded; this report is not import acceptance or a load/penetration/accessibility certification. The already tracked backup remains unchanged under the owner's earlier decision.

## Flow evidence

| Requested area | Verification | Result |
|---|---|---|
| Business access | Browser: unassigned business absent from list; direct business/module routes and export rejected. A valid Server Action payload creates a customer for a creator, while the same payload is denied for a viewer and creates no record. Service suites also exercise cross-business actors, suspended accounts and action permissions. | Passed |
| Sales | Browser: save draft quote → issue on saved view → convert to order → activate → convert to invoice → post → record receipt. Assert persisted upstream IDs, AED 200.00 total, balanced posting/settlement journals and full allocation. Service suites separately cover credit notes, advance allocations, FX/carrying amounts, voids and reconciliation. | Passed |
| Purchases | Browser: save draft quote → issue → order → issue → bill → post → supplier payment. Assert persisted links, totals, allocation and journals. Service suites cover debit notes in balances/aging and reversal behavior, prepayments and FX. | Passed |
| Inventory/projects | Existing isolated suites create goods receipts/deliveries, check moving-average/stock effects, project/customer assignments, cross-links and ledger/report equilibrium. This round did not add a browser walkthrough of every warehouse/project operation. | Service/integration passed |
| Payroll | Browser: draft → post → void, one source journal and final reconciliation. Service regression additionally repeats posting, checks idempotency, rejects forged status/posted edits and reconciles reversal. | Passed |
| UI/PDF | Browser: missing employee validation preserves period input; keyboard activation/tab movement; long customer list and restricted overview at 390 px remain within page width. Sales and purchase invoice PDF responses are valid PDFs; service suites cover other document extraction/rendering; real Chromium HTML renderer tested separately. Screenshots visually inspected. | Passed within listed scope |

The user task is daily financial document creation/review/posting/settlement by administrators and restricted operators. Success requires correct stored state, understandable feedback and recoverable input, not just a visible page. The tested state matrix includes permission denial, draft/posted/void, invalid input with preservation and mobile containment. Complete keyboard-only journeys, every screen, assistive technology, large-volume performance and human-user acceptance remain separate work.

## Test-harness corrections

- Added `scripts/test-isolation.mjs` to `npm test`. Each Node test process receives a new temporary database root before imports. Several older suites previously used normal `data/` if no environment was provided; their assertions now run without polluting that directory.
- Added an acceptance fixture/config/spec that reuses the existing hardening fixture and tests the actual current UI sequence. The forms save drafts; issuing/posting happens from the saved document view. Old browser specs assumed buttons that are no longer on those forms.
- Browser role login is shared and sessions stay in memory. Repeated logins initially hit the real auth rate limit; session reuse fixes the test harness without disabling or widening that limit.
- The fixture uses new sales/purchase parties without pre-existing balances, a separate payroll business, and the same GL Bank/Cash option service the forms use. Bank-account records and posting GL account IDs are different objects; the fixture now uses the correct ID type.
- `playwright.config.ts` now selects this isolated suite by default. `npm run test:e2e` no longer reuses an arbitrary local development server/data directory. The local workflow update uses the eleven scenarios for its source/browser gate and uploads the matching failure-artifact directory. The five-scenario focused command remains available. No new GitHub run or deployment is claimed for these unpushed edits.
- Local test build/server DSNs use a loopback synthetic destination; shared browser login blocks Sentry/tunnel requests. No operational token was copied into fixtures and no deliberate external email/event test was sent.

Initial failed attempts were test-selector/fixture issues, not hidden successful passes. Logs retain those attempts alongside the final successful run. The Next/APM listener warning and the local `next start` standalone warning remain recorded; no new production incident or application memory leak is inferred from them.

## Cleanup decisions and verification

Each candidate was checked for tracked status, references, role in builds/tests and content metadata before moving. Absolute source/destination paths were verified inside this workspace. Moved history files initially matched their pre-move SHA-256 values; all 11 old screenshots matched their tracked Git objects after relocation.

| Candidate | Action and reason |
|---|---|
| Root `worklog.md` | Moved intact to `docs/history/WORKLOG.md`; historical material remains available. |
| `docs/branch_changes.md` | Moved intact to `docs/history/BRANCH_CHANGES.md`. Current links and archive index updated. |
| Root `screenshots/` | Eleven generated captures moved to ignored `test-results/legacy-screenshots/`. Old visual test output paths now target `test-results/visual/`; `/screenshots/` is also ignored. |
| `public/downloads/ledgerly-erp-v2.1.0-source.zip` | Moved to ignored `scratch/archive/`. The login code references a different version, so this ZIP was unused. Inspection found only `.env.example`, no actual environment file or database entry. Generated download ZIPs are also excluded from Docker context. |
| `bun.lock` | Moved to ignored `scratch/archive/bun.lock`; npm/`package-lock.json` is the supported installer/CI graph, and no active build/test referenced this lockfile. |
| Inactive `.next/` and `.pnpm-store/` | Moved to ignored `scratch/archive/dev-next` and `scratch/archive/pnpm-store` after checking no dev listener on port 3000 and that current testing uses `.next-validate`. Approximately 14 GB decimal of old build/cache data is retained, not reclaimed. |
| Empty `fixes/` | Verified empty and moved into the same ignored archive. |
| Local databases/attachments and three real Manager backups | Retained. Hash comparison of **656 existing local SQLite files** found zero changes, missing files or newly added local databases. This is a local development-file count, not the production tenant count. Backup files still have active import-test references. No guessed test/customer data was deleted. |
| Drizzle baselines, dependencies, active validation build/tools, npm/native build cache | Retained because they remain referenced or useful to the supported toolchain. Existing ignored Playwright auth state was retained; normal tests no longer depend on it. |

Automatic approval review rejected permanent deletion of the obsolete lockfile/auth/build/cache targets without a detailed reason. Recoverable archival moves were used instead. This cleanup does not claim those archived bytes were freed or that public Git history was erased. The ignored local cleanup manifest records retained files and hash checks.

## Repeating the checks and next work

Use Node 22/npm 10 and the committed lockfile. `npm test` is isolated; the real Manager fixture suite remains a distinct data-dependent part of that command and was excluded from this synthetic round. For browser verification, prepare the `.next-validate` production build using the workflow's build environment, then run `npm run test:e2e`. `npm run test:browser:hardening` is the smaller focused browser check. Generated reports/images are under ignored `test-results/`; do not commit local cookies, credentials or real fixtures.

Next: representative human-user testing, then fix reproducible defects through the existing PR/check/merge/deploy path. Additional hardening and operational backlog remain deferred in [NEXT_STEPS.md](NEXT_STEPS.md). At the close of the initial acceptance round, this verification/cleanup work had not been committed, pushed or deployed.

## Authorized release follow-up

The owner subsequently requested final verification and deployment through the protected PR flow. The exact full `npm test` command passed **348 checks with zero failures or skips** locally under Node 22/npm 10, including all three existing Manager import fixtures and native business backup round-trip checks in isolated temporary databases. This extends the earlier synthetic-only 341-check round; it does not change those historical results. Typecheck, lint, all 147 permission boundaries, workflow validation and the production dependency audit also passed; the audit returned zero vulnerabilities. A fresh comparison again found all 656 existing local SQLite files unchanged, with none missing or added.

Promotion requires the hosted source/browser and native ARM64 image gates, followed by merge verification and the serialized deployment's snapshot, rehearsal, migration, tenant reconciliation and HTTPS/revision checks. Use the [release workflow](https://github.com/MuhammadRayyan/erp-software-2.0/actions/workflows/deploy.yml) and [public health revision](https://erp-portal.rapidtss.com/api/health) for the final rollout outcome; these local preflight results alone do not establish deployment success. No runtime application or schema changes are included in this acceptance/cleanup release.
