# Production releases and recovery

The supported production path is a pull request to `main`, required verification, an immutable ARM64 container image, and a serialized deployment to the Oracle VM. Use Node 22 and npm with `package-lock.json`; `.nvmrc` selects the supported major. `docker-compose.yml` is the canonical production definition. `compose.prod.yaml` includes it for compatibility.

## Everyday remote work

Current scope: a few businesses and 5–10 users in closed testing. The owner is keeping the repository public and deferring additional hardening/maintenance automation. Existing release gates remain enabled. See [NEXT_STEPS.md](NEXT_STEPS.md) for testing and deferred decisions; this runbook does not authorize a reboot or new infrastructure by itself.

1. Create a short branch from current `main`, make the change, and open a pull request.
2. The **Verify source and financial regressions** check validates the workflow and deployment failure recovery, performs a locked install, typechecks, lints, tests, audits production dependencies, builds production, and runs isolated browser scenarios.
3. **Verify ARM64 production image** builds the actual Linux ARM64 image and exercises its runtime validation, migrations, checks, readiness, login route, non-root user, and secret-file exclusions. A deliberately interrupted synthetic process leaves committed system/tenant WAL files; CI snapshots the read-only source, checksums the backup, confirms committed rows/attachments survived, and rehearses restoration/migration.
4. Merge only after both required checks pass. A push to `main` repeats verification, publishes the tested image to GHCR, then deploys its exact digest. The image carries the Git revision in its labels and health response.
5. Deployment is serialized by GitHub concurrency and a host `flock`. It pulls before maintenance, retains the prior image/assets, stops and drains the app, snapshots data, verifies checksums, rehearses restore/migration on a copy, migrates production, starts the release, and verifies every registered tenant plus public HTTPS/revision.

The `production` GitHub environment must allow only protected branches. Protect `main` with the two check names above, strict up-to-date checks, required pull requests, no force pushes/deletion, and resolved conversations. A single-maintainer repository can require PRs with zero additional approvals; a second reviewer can be required when collaborators are available.

The acceptance/cleanup follow-up expands the source job's browser command to `npm run test:e2e`: eleven isolated scenarios covering business/action boundaries, sales/purchase settlement flows, payroll, PDFs and keyboard/mobile behavior. Failure evidence is collected from `test-results/acceptance`. The smaller `test:browser:hardening` command remains available for focused checks. Historical release results describe their original five browser scenarios; each new release must pass the expanded gate before promotion.

The workflow uses the existing `SERVER_HOST`, `SERVER_USER`, and `SSH_PRIVATE_KEY` secrets. `SERVER_KNOWN_HOSTS` is a repository variable containing the verified public SSH host key entry, not a key obtained blindly during deployment. Third-party Actions and base images are pinned; Dependabot proposes updates.

Each image includes `tools/release.json` with application/revision/schema versions and `tools/production-dependencies.cdx.json`, a CycloneDX inventory of locked production npm dependencies. CI validates and retains both as release evidence for 30 days. The inventory describes the production dependency graph; it is not a complete operating-system package inventory or proof that every dependency is traced into the standalone runtime.

The image test also invokes the application's actual HTML-template PDF renderer in an isolated, non-root, read-only container with no network, a writable temporary filesystem and bounded memory/PIDs. Chromium's XDG config/cache directories live under `/tmp`, allowing its profile/crash-report initialization without a writable application filesystem. `node tools/verify-html-pdf.cjs` runs the same synthetic render diagnostic manually.

Builds can fail. The guarantee provided by the workflow is that an unverified build is not promoted, and a deployment failure is reported as a failure. A single application instance has a short maintenance interval; measure it rather than claiming zero downtime.

## Operational access — verified 26 October 2026

GitHub and verified SSH access work. The owner workstation also has separately approved read-only Oracle/Sentry API credentials; they are independent of the deployment secrets above. Check existing private configuration before asking for another login or creating another credential. Other workstations need their own authorized access.

- **OCI:** named profile `ERP_OPERATIONS` in `~/.oci/config`; API-only user `erp-operations-api`, group/policy `erp-operations-readonly`. The key/user are ACTIVE. Console login, auth tokens, customer secret keys, database/OAuth2/SMTP credentials are disabled. Infrastructure/monitoring reads and IAM metadata inspection are granted across the tenancy; ordinary self-service management of this user's own keys still applies. Thirteen actual local read-only checks passed with zero failures.
- **Local OCI usage:** `~/.oci/ERP_API_SETUP.md` contains usage/revocation instructions; `~/.oci/ERP_API_VERIFICATION.json` contains dated results. The isolated CLI is `~/.oci/cli/Scripts/oci.exe`. On this Windows workstation, `~/.oci/oci.ps1` supplies compatible process-only module paths for the CLI's Windows ACL check. Use `--profile ERP_OPERATIONS`; no DEFAULT profile was created.
- **Sentry:** private `~/.sentryclirc`, project `personal-bv0 / erp-20`, scopes `alerts:read`, `event:read`, `org:read`, `project:read`. Project/historical events and existing monitors/email workflow were verified. Current-release ingestion/association, source-map upload and notification delivery remain unproven. The DSN is not a management token, and the read-only token is not a CI write credential.
- Private keys/tokens remain outside Git and have restricted Windows ACLs. Never copy them into a report, workflow, image or production environment merely to run operational checks. Do not widen permissions to resolve a read error without identifying the missing operation first.

The verified VM is A1 Flex ARM64, 2 OCPUs/12 GB RAM, with a 100 GB boot volume at 10 VPUs/GB. No boot-volume backup policy/backups, VNIC NSGs or root alarms were returned by the scoped checks. These are separate from local application deployment snapshots. Trial credit was observed; settled billing/free-tier eligibility remains unestablished. See [dated operations evidence](TESTING_PHASE_OPERATIONS_2026-10-26.md) for limits and the pending reboot.

## Runtime secrets

Production credentials live in `/opt/modern-erp/runtime.env`, mode 0600. They are injected at runtime and excluded from Docker's build context. The image must contain no `.env`, local keys, or business backup. Authentication refuses missing, short, and known placeholder secrets. Trusted origins come only from explicit configured origins, with HTTPS required for public production hosts.

For the initial migration to this setup, copy `scripts/provision-runtime.py` to the VM and execute it there with Python 3. It generates independent random authentication and setup secrets locally, preserves supported SMTP/Sentry environment settings, tightens the old `.env` permissions, and schedules invalidation of existing sessions/verification tokens on deployment. It does not print the new values. The script intentionally refuses to overwrite an existing runtime file.

This initial rotation signs users out. Later ordinary image deployments keep the same runtime secrets and do not require a secret rotation. For a future rotation, coordinate a maintenance window, update the mode-0600 runtime file locally on the VM, schedule session invalidation with the marker, deploy, and verify. Never retain a known compromised signing key as a grace-period key.

Next.js Server Action encryption is separate from authentication. Each promoted image contains one consistent build key. `deploymentId` is set from the revision, and prior hashed assets are retained to help browser tabs navigate across releases. This does not make different schema versions interchangeable.

## Rollback and backups

The release directory stores the deployed digest and previous configuration; the prior image is tagged locally for recovery. No automatic image pruning runs during deployment. Backup directories contain SQLite snapshots, attachments, and a SHA-256 manifest.

The stopped application's database files and SQLite sidecars are first copied to a private writable staging directory. SQLite recovers/checks that copy and consolidates each database through its backup API; the original read-only data mount is untouched. Snapshot databases use DELETE journal mode so a read-only restore source does not need new WAL/SHM sidecars. Temporary snapshot/rehearsal data is removed. Deployment bounds backup/checksum operations to 60 seconds, restoration rehearsal to 120 seconds, and migration to 300 seconds, with named-container cleanup and the same compatibility-aware failure recovery. Investigate a timeout before increasing limits for larger data.

Failure before production migration restarts the previous release. After a migration, automatic fallback requires an unchanged schema fingerprint or a successful compatibility check by the old image. An incompatible schema stops automatic fallback and reports the backup location. Do not automatically restore a database after users have resumed writing: that can discard new transactions. Use a tested forward repair or an explicit coordinated restore.

Operations are bundled in the image as `/app/tools/ops.cjs`:

```text
validate-env                 validate runtime secrets and origins
migrate                      migrate all registered databases and reconcile
check                        integrity, foreign keys, schema, journal/payroll checks
compatible                   read-only schema compatibility check
schema-fingerprint           identify registered schema history
backup <directory>           full snapshot; requires coordinated write stop
verify-backup <directory>    verify the manifest and file checksums
rehearse <directory>         restore/migrate/check an isolated copy
invalidate-sessions          revoke sessions and pending verification tokens
```

Keep writes stopped for a coordinated full backup. Never tar a live SQLite directory as the default backup method. Every-release local snapshots improve deployment recovery, but they do not provide offsite disaster recovery. Scheduled encrypted offsite copies, retention, backup-age alerts, and a replacement-host drill remain required to establish the proposed 15-minute RPO / one-hour RTO.

For an emergency rebuild of the latest main release, dispatch `deploy.yml` on `main`. This reruns the same required build and image verification before deployment. Recovery still requires access to runtime secrets and the backup destination.

## Making the repository private

- The running app, users, domain, HTTPS certificate, and database paths do not change.
- Developers and collaborators need explicit repository access. Update integrations that previously depended on anonymous access.
- GitHub Actions remains available, but private repository minutes/storage use the account's included quota and can incur charges beyond it. [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage)
- Private repository branch protection requires an eligible plan such as GitHub Pro/Team; verify the account plan before relying on the same protection after a visibility change. [Protected branch availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- This release path does not fetch Git on the server. Actions transfers the release configuration over SSH and streams its short-lived package token into a temporary Docker login configuration. This supports private GHCR pulls without keeping a permanent GitHub token on the VM. Manual private-image recovery needs an authorized short-lived login or a narrowly scoped `read:packages` credential. [GHCR authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- GHCR package visibility/access is separate from repository visibility. Confirm that the package remains private and that the workflow repository has package access. [Package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages)
- Visibility changes do not retract historical downloads, clones, or public forks. Ignore rules stop future accidental additions; they do not untrack or erase an already committed backup. [GitHub visibility effects](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)

Repository visibility is an owner decision and is not changed by this implementation.
