---
name: oracle-cloud-deployment
description: Operational runbook for Ledgerly ERP on Oracle Cloud: verified immutable releases, Docker, Caddy, GitHub Actions, backups and recovery.
---

# Oracle production operations

Use the canonical guide at docs/DEPLOYMENT.md. Host: ubuntu@84.235.255.173; application: https://erp-portal.rapidtss.com; root: /opt/modern-erp; data: /opt/modern-erp/data. The inspected machine is ARM64, two CPUs and approximately 12 GiB RAM with a 100 GB block boot volume. OCI entitlement and volume performance require control-plane verification.

## Read-only diagnostics

Use the existing local SSH key with BatchMode=yes, ConnectTimeout=10, and StrictHostKeyChecking=yes. Never disable host-key verification. Inspect container status, public HTTPS /api/health, and bounded logs without printing environment values, cookies, private keys or customer records. Health exposes status/revision; detailed integrity/reconciliation is checked with the bundled tools.

## Normal release flow

Work on a branch, open a PR, and wait for the required source/browser and ARM64-image checks. Merge to protected main. GitHub Actions publishes and deploys the exact tested image digest automatically. The production environment allows protected branches; workflow conditions restrict deployment to main. Manual workflow dispatch on main uses the same verification path.

The workflow streams a job-scoped GHCR token over verified SSH into a temporary Docker login directory. It transfers the exact revision's configuration to releases/<sha>, takes a host deployment lock, drains the old app, snapshots and verifies data, rehearses migrations on a copy, migrates/checks all tenants, starts the image, and verifies HTTPS plus revision. It retains the previous image/configuration/static assets. Do not git reset, build on the live VM, prune rollback images during deployment, or run a parallel migration process.

## Secrets and initial setup

Runtime secrets are in /opt/modern-erp/runtime.env, mode 0600, injected through Compose. They must never enter image builds or Git. scripts/provision-runtime.py generates initial replacement secrets on the VM without printing them and schedules session invalidation. It refuses to overwrite existing runtime configuration. Rotate compromised keys without retaining them as grace-period keys. The initial rotation signs users out.

## Recovery

Production Compose requires an explicit ERP_IMAGE digest in .release.env. Supply both runtime.env and .release.env when invoking Compose manually. Operations are bundled as node /app/tools/ops.cjs; see docs/DEPLOYMENT.md for validate-env, migrate, check, compatible, schema-fingerprint, backup, verify-backup, rehearse and invalidate-sessions.

Full backups require a coordinated write stop. Never tar the active SQLite directory as the default online backup procedure. Deployment snapshots include databases and attachments plus checksums. Local snapshots are not offsite disaster recovery; scheduled offsite backups and a replacement-host restore drill remain separate work.

Snapshotting uses a private writable copy of the stopped application's database files and WAL/SHM sidecars, then SQLite's backup API. Do not run that API directly against the production read-only bind mount. CI verifies committed system/tenant WAL and attachment recovery on Linux ARM64. Backup/checksum, rehearsal and migration operations have bounded execution and named-container cleanup; timeout remains a failed release and invokes compatibility-aware recovery.

After failure, restart the old image only when schema compatibility is verified. Never automatically restore a database after users have resumed writes. If compatibility fails, stop for a forward repair or explicitly coordinated restore. Report the failed release and backup location; a successful fallback must not turn a failed deployment green.

## DNS and TLS

Hostinger DNS administration and OCI networking are separate from SSH access. Verify control-plane/session access before claiming changes or coverage. Caddy serves the configured HTTPS domain; direct HTTP IP access is limited to health probes. Validate Caddy configuration before reloading. Caddy retry settings do not guarantee zero downtime or safe replay of mutations.
