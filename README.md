# Ledgerly ERP

A compact, Manager.io-inspired multi-business accounting/ERP application for local and self-hosted use.

**Current release: v2.1.1** — Phases 0-9 (foundation through multi-currency + UAE eInvoicing), the Phase 10 code-health/security/customizability pass, plus seven QA/feature review rounds: Custom Fields on customers/suppliers/invoices/PDFs, per-account server-side preferences, server-side pagination with date filters on every major list, email delivery with PDF attachments, and a responsive command palette with a mobile trigger. See `docs/CHANGELOG.md` for the full history and `docs/CURRENT_STATE.md` for authoritative behavior.

## Working context for future phases

For normal phase work, read only these files in order:

1. `README.md`
2. `docs/CHANGELOG.md` (what changed, newest waves last)
3. `docs/CURRENT_STATE.md`
4. `docs/THEME.md`
5. The current phase file, for example `docs/PHASE_9.md`

`docs/CURRENT_STATE.md` is authoritative for existing behavior. A phase file defines only the requested delta. Do not reread `docs/CONTEXT.md` or completed phase files unless the current task needs targeted historical context, migration archaeology, or an explicitly referenced earlier decision.

At the end of each phase, update `docs/CURRENT_STATE.md` from the implemented and verified code rather than copying the phase plan.

## Development

Runtime is Node 24; bun is the package manager and script runner (dependencies install with `bun install`, scripts run with `bun run <script>`).

```bash
bun install
cp .env.example .env   # set BETTER_AUTH_SECRET for non-dev runs
bun run db:migrate
bun run db:seed
bun run dev   # http://localhost:3000
```

`scripts/bootstrap.ts` (`npx tsx --env-file=.env scripts/bootstrap.ts`) runs migrate + seed in one shot. On hosts where the bun shell wrapper crashes on the better-sqlite3 NAPI binding, run the dev server through pure Node: `node node_modules/next/dist/bin/next dev -p 3000`.

Seeded local accounts:

```text
Administrator: admin@demo.local / demo12345
Standard User: standard@demo.local / demo12345
```

The seeded Standard User is limited to Sales and Projects so module hiding and direct-route rejection can be checked.

Useful commands:

```bash
bun run dev          # next dev on port 3000
bun run typecheck    # tsc --noEmit
bun run lint         # eslint .
bun run db:migrate   # explicit ordered SQLite migrations (never drizzle-kit push on real data)
bun run db:check     # schema + foreign-key validation across business DBs
bun run db:seed      # demo data
bun run test         # unit/structural regression suite
bun run test:e2e     # Playwright browser suite
bun run build        # requires BETTER_AUTH_SECRET
```

`db:*` scripts load variables from `.env` (copy `.env.example` first). A non-development run, including `bun run build`, must have `BETTER_AUTH_SECRET` set.

## Repository rules

- Preserve one system SQLite database plus one isolated SQLite database per business.
- Use the explicit ordered migration runner; never use `drizzle-kit push` against real business data.
- Keep domain and database logic out of React components. Prefer feature-local services/components and avoid abstractions without multiple real uses.
- Keep one Next.js application; do not add a second backend, queues, Redis, PostgreSQL, microservices, or production infrastructure unless a future phase explicitly changes that decision.
- Main transaction create/edit flows use full pages. Dialogs are for confirmations, small settings, quick pickers, and destructive actions.
- Preserve Light, Dark, and System themes and the UI rules in `docs/THEME.md`.
- Implement only the current phase delta, verify proportionally, and do not start later phases implicitly.
- Use `bun run` for all package scripts (bun as manager, Node 24 runtime executes them). Do not reintroduce Docker Compose, `pnpm`, or npm-only assumptions.
