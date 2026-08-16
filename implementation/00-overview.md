# Implementation Overview

## How to use these files

This folder contains step-by-step implementation specs for each sprint of the Ledgerly ERP improvement plan. Each file is **self-contained** — implement and verify one before moving to the next.

## Ordering

| Order | File | Sprint | Effort | Dependencies |
|---|---|---|---|---|
| 1 | `sprint-0-dev-unblock.md` | 0 | ~1.5 hrs | None |
| 2 | `sprint-1-correctness-perf.md` | 1 | ~1 day | Sprint 0 |
| 3 | `sprint-2-pdf-engine.md` | 2 | ~5 days | Sprint 0 |

**Do not skip Sprint 0.** It unblocks the dev loop and fixes a critical security bug (dead middleware). Sprints 1 and 2 depend on the fast dev loop to be productive.

## Conventions

### Code style
- **TypeScript strict** — zero `any`, zero `TODO`, zero `FIXME`.
- **ES6+ imports** — `import { x } from "@/..."` for internal, `import { x } from "pkg"` for external.
- **Server/client markers** — `"use server"` for actions, `"use client"` for interactive components, no marker for server components.
- **Naming** — camelCase for variables/functions, PascalCase for types/components, kebab-case for filenames.

### Architecture rules (from project docs)
- One Next.js app, one system SQLite + one SQLite per business. No Redis, no Postgres, no microservices.
- UI components never issue direct DB writes — all writes through services with validation + transaction.
- Server Actions for mutations, API routes only for PDF/XML/backup/import.
- Explicit ordered migration runner — never `drizzle-kit push` on real data.
- Money in integer minor units (BigInt math), quantities in 4-decimal micros.
- Preserve Light/Dark/System themes and the UI rules in `docs/THEME.md`.

### Theme consistency
- Use semantic CSS variables (`bg-surface`, `text-foreground`, `border-border`), never hard-coded colors.
- Blue primary (`--primary: #356fd0`) is the documented design choice — keep it.
- Compact density: `p-4`/`p-6` for content, `gap-4`/`gap-6` for spacing.
- Tables: `data-table` class, `max-h-96 overflow-y-auto` for long lists with custom scrollbar.
- Status badges: use `Badge` component with semantic tones (success/warning/danger/info/neutral).
- Right-align money: `className="money text-right"`.

### Verification after each step
After each numbered step in a sprint file:
1. Run `npm run typecheck` — must pass with zero errors.
2. Run `npm run lint` — must pass.
3. If the step touches DB or posting: run `npm run test` — all 82 tests must pass.
4. If the step touches UI: run `npm run dev`, open the affected page, verify it renders.
5. Commit with message format: `sprint-N: short description`.

### File references
All file paths in these specs are relative to the project root (e.g., `src/app/layout.tsx`). The project root is the folder containing `package.json`.

## Model recommendation (Antigravity)

**Use Gemini 3.1 Pro (High)** for all sprints.

Reasons:
1. **Accounting correctness is non-negotiable.** Money math, journal balancing, VAT calculations — a subtle bug here is costly. Pro's stronger reasoning reduces regression risk.
2. **Large codebase (368 files).** Pro handles the broader context better when refactoring cross-cutting concerns (cache(), error boundaries, PDF engine).
3. **UAE compliance complexity.** VAT periods, PINT-AE e-invoicing, CBUAE rate rules — Pro follows complex rules more reliably.
4. **Strict TypeScript.** Pro is better at maintaining type safety during refactors.

**Gemini 3.7 Flash High** is acceptable for Sprint 0 only (config changes, file renames, font files) if you want faster iteration. Switch to Pro for Sprint 1+.

## What NOT to do

- **Do not** use `drizzle-kit push` on business databases.
- **Do not** add Redis, Postgres, queues, or a second backend.
- **Do not** create invoices/transactions in modal dialogs (full pages only).
- **Do not** use indigo or blue colors beyond the documented primary.
- **Do not** skip the verification steps — each step must typecheck and lint.
- **Do not** start Sprint 1 before Sprint 0 is verified.
- **Do not** implement features from later sprints while working on an earlier one.
- **Do not** import `better-sqlite3`, `drizzle`, `auth`, or any Node native module in `src/middleware.ts` — Next.js middleware runs on the Edge Runtime and will crash with `Module not found: Can't resolve better_sqlite3.node`. Middleware is cookie-check only. All DB-backed checks go in layouts/pages/actions (Node runtime).
- **Do not** use in-memory `Map` or `setInterval` in middleware — Edge Runtime doesn't support them. Rate-limiting and similar stateful logic belongs in API routes (`export const runtime = "nodejs"`).
- **Do not** add rate-limiting or DB logic to `src/middleware.ts` — it stays as the Edge-safe cookie check from Sprint 0.
