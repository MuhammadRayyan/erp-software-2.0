# Modern ERP / Accounting

A compact, Manager.io-inspired multi-business accounting/ERP application for local and self-hosted use. Phases 0-8 are implemented.

## Working context for future phases

For normal phase work, read only these files in order:

1. `README.md`
2. `docs/CURRENT_STATE.md`
3. `docs/THEME.md`
4. The current phase file, for example `docs/PHASE_9.md`

`docs/CURRENT_STATE.md` is authoritative for existing behavior. A phase file defines only the requested delta. Do not reread `docs/CONTEXT.md` or completed phase files unless the current task needs targeted historical context, migration archaeology, or an explicitly referenced earlier decision.

At the end of each phase, update `docs/CURRENT_STATE.md` from the implemented and verified code rather than copying the phase plan.

## Development

Primary workflow:

```bash
docker compose up --watch
```

Open `http://localhost:3000`.

Seeded local accounts:

```text
Administrator: admin@demo.local / demo12345
Standard User: standard@demo.local / demo12345
```

The seeded Standard User is limited to Sales and Projects so module hiding and direct-route rejection can be checked.

Useful commands:

```bash
npm run dev
npm run typecheck
npm run lint
npm run db:migrate
npm run db:check
npm run db:seed
npm run test
npm run build
```

Docker equivalents use `docker compose exec app npm run <command>`. A non-development run, including `npm run build`, must have `BETTER_AUTH_SECRET` set.

## Repository rules

- Preserve one system SQLite database plus one isolated SQLite database per business.
- Use the explicit ordered migration runner; never use `drizzle-kit push` against real business data.
- Keep domain and database logic out of React components. Prefer feature-local services/components and avoid abstractions without multiple real uses.
- Keep one Next.js application; do not add a second backend, queues, Redis, PostgreSQL, microservices, or production infrastructure unless a future phase explicitly changes that decision.
- Main transaction create/edit flows use full pages. Dialogs are for confirmations, small settings, quick pickers, and destructive actions.
- Preserve Light, Dark, and System themes and the UI rules in `docs/THEME.md`.
- Implement only the current phase delta, verify proportionally, and do not start later phases implicitly.
