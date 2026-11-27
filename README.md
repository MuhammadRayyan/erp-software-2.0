# UAE Manager

Multi-tenant ERP & UAE VAT/Payroll accounting monolith built with Next.js 16 (App Router), React 19, TypeScript, Drizzle ORM, Better Auth, Tailwind CSS, and isolated per-business SQLite WAL databases.

## Documentation Map

Active living documentation follows a streamlined 5-document hierarchy:

| Document | Scope |
| :--- | :--- |
| **README** ([README.md](README.md)) | Quickstart, local scripts, test suites, and repository rules |
| **Architecture** ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)) | System topology, SQLite schemas/PRAGMAs, security/CSP, streaming ZIP/PDF engines, and domain test structure |
| **Design System** ([docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)) | CSS tokens, App Shell, `Ctrl/Cmd+K` Command Palette, Radix primitives, 3 table paradigms, and document/settlement UX |
| **Deployment** ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) | CI release gates, ARM64 Docker image, Caddy, OCI/Sentry read-only diagnostics, backups, recovery, and closed-UAT scope |
| **Changelog** ([docs/CHANGELOG.md](docs/CHANGELOG.md)) | Chronological log across modernization sprints and feature waves |

Superseded point-in-time reviews, specs, and sprint planning artifacts are preserved in [docs/history/](docs/history/README.md).

## Requirements & Local Setup

- **Runtime:** Node `24` LTS (see [.nvmrc](.nvmrc)) and npm with locked dependencies (`package-lock.json`).
- **Bootstrap:**
  ```bash
  npm ci
  cp .env.example .env
  npm run db:migrate
  npm run db:bootstrap
  npm run dev
  ```
- Open `http://localhost:3000`. Customer/workspace SQLite databases and attachments live under `data/`.

## Verification & Test Commands

Automated service/unit tests run in isolated temporary directories via [scripts/test-isolation.mjs](scripts/test-isolation.mjs) and never touch local `data/`.

| Command | Purpose |
| :--- | :--- |
| `npm test` | Full Node domain suite (`tests/{unit,accounting,platform,integration}/**/*.test.ts`) |
| `npm run test:unit` | Pure math, FIFO allocation, grid layout, UI helpers, and CSP/config checks |
| `npm run test:accounting` | Double-entry GL, FX, VAT/FAF, payroll/WPS, PDC, banking rules, and reports |
| `npm run test:platform` | Auth, RBAC, multi-tenant quotas, approvals, activity logs, backups, and PDF pool |
| `npm run test:integration` | Multi-module commercial lifecycles, audits, and Manager.io migration |
| `npm run test:hardening` | Targeted production hardening & recovery suite |
| `npm run test:e2e` | Isolated Playwright acceptance suite (`tests/e2e/acceptance.spec.ts` & `pillars.spec.ts`) |
| `npm run typecheck` | Generate `.next` route types and check `tsconfig.json` |
| `npm run typecheck:validate` | Isolated validation typecheck (`tsconfig.validate.json` against `.next-validate`) |
| `npm run lint` | ESLint across source and test trees |
| `npm run check:permissions` | Static verification that all 159 business command functions enforce RBAC guards |
| `npm run check:schema` | Migrate a fresh temporary data directory, seed a business, and fail on any drift between the Drizzle schema and SQLite (tables, columns, indexes, UNIQUE constraints, foreign keys); runs in CI |
| `npm run db:verify-schema` | The same comparison against the databases under `ERP_DATA_DIR` |
| `NEXT_DIST_DIR=.next-validate npm run build` | Production validation build without overwriting `.next` or mutating `tsconfig.json` |

## Repository Rules

1. Never commit secrets (`.env`, private keys, cookies) or production/customer SQLite snapshots.
2. Run migrations or schema checks against test fixtures rather than live `data/` unless performing an explicit maintenance step.
3. Prefer extending existing module boundaries under `src/core/`, `src/modules/`, `src/components/`, and domain folders under `tests/` (`unit/`, `accounting/`, `platform/`, `integration/`, `e2e/`).
