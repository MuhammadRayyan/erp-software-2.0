# UAE Manager

A Manager.io-inspired accounting/ERP application: one Next.js modular monolith with an independent SQLite database for each business.

Package version **2.7.0**. Verified application release: `252093a78db7df9afd9810e96344c1bd237829a9`, 29 October 2026. The owner is testing with a few businesses and **5–10 users**, keeping the repository public and deferring additional hardening.

## Documentation

| File | Purpose |
|---|---|
| [Current state](docs/CURRENT_STATE.md) | Implemented behavior, release and limits |
| [System dossier](SYSTEM_DOSSIER.md) | Architecture and operational specification |
| [Deployment](docs/DEPLOYMENT.md) | Remote work, automated releases and recovery |
| [Next steps](docs/NEXT_STEPS.md) | Testing checklist and deferred decisions |
| [Operations verification](docs/history/TESTING_PHASE_OPERATIONS_2026-10-26.md) | Actual server/OCI/Sentry observations and access |
| [Hardening outcome](docs/history/HARDENING_OUTCOME_2026-10-26.md) | Implemented fixes, tests and rollout evidence |
| [Theme](docs/THEME.md) | Shared UI tokens and layout rules |
| [Flow verification and cleanup](docs/history/FLOW_VERIFICATION_AND_CLEANUP_2026-10-26.md) | Current acceptance results, isolation and retained/archived files |
| [Changelog](docs/CHANGELOG.md) | Feature/release history |

Historical worklogs, branch notes and the 25 October review describe earlier releases. Follow the current state and deployment guide for operational commands. A historical backlog is not authorization to execute it.

## Development

Use **Node 22** (`.nvmrc`) and **npm 10.9.4** with `package-lock.json`, matching CI and Docker. Historical Bun-only/Node 24 instructions are superseded.

```powershell
npm ci --legacy-peer-deps
Copy-Item .env.example .env
# Configure the local .env; never commit it.
npm run db:bootstrap
npm run dev
```

Bootstrap migrates/seeds disposable local data. Never seed production or use customer databases as test fixtures. Development accounts are `admin@demo.local` and `standard@demo.local`, password `demo12345`; these are not production credentials.

```text
npm run typecheck
npm run lint
npm test
npm run check:permissions
npm run db:check
npm run test:hardening
npm run test:e2e
```

`npm test` now preloads `scripts/test-isolation.mjs`, giving each test process a separate temporary database root, including older suites that previously defaulted to local `data/`. The Manager.io import suite still references real backup fixtures and was excluded from the synthetic acceptance round.

`npm run test:e2e` now defaults to the isolated acceptance configuration: 11 browser scenarios, fresh synthetic businesses and in-memory role sessions. It requires the `.next-validate` production build; use the workflow's build setup before running it. The workflow uses this complete suite for the source gate; `npm run test:browser:hardening` remains a five-scenario focused check. Older browser specs are retained as reference but are not selected by the default configuration. Their generated screenshots now go under ignored `test-results/visual/`.

CI sets `NEXT_PHASE=phase-production-build`, allowing builds without production secrets. Production startup requires strong runtime authentication/setup configuration. Generated reports and local archives stay ignored. Historical logs now live in [docs/history](docs/history/README.md).

## Releases and repository rules

Create a short branch and PR to protected `main`. Pass **Verify source and financial regressions** and **Verify ARM64 production image**. Merge repeats verification, publishes the tested image to GHCR and deploys its immutable digest. The VM does not build code or reset a checkout. Deployment serializes migrations, verifies snapshots/restoration and tenant readiness, checks HTTPS/revision, and retains the previous release. A single instance has a maintenance interval; failed builds are blocked, not guaranteed never to occur.

- Read `AGENTS.md` and relevant installed Next.js documentation before framework changes.
- Preserve system SQLite plus separate business databases/attachments on local storage.
- Enforce permissions at entry points and domain services. Use shared checked money helpers and explicit migrations; never `drizzle-kit push` on real data.
- Follow shared UI rules; main transaction create/edit flows use full pages.
- Keep secrets, operational credentials and new business backups out of Git/image contexts. Ignore rules do not erase the existing tracked Manager.io backup; cleanup remains owner-deferred.
- Documentation changes do not authorize deployment, reboot, notifications or deferred infrastructure work.
