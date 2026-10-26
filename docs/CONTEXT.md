# Product context — current decisions

Updated 26 October 2026. [CURRENT_STATE.md](CURRENT_STATE.md) describes implementation; [SYSTEM_DOSSIER.md](../SYSTEM_DOSSIER.md) explains architecture; [NEXT_STEPS.md](NEXT_STEPS.md) owns the immediate checklist. Old Phase 0 and 1,000-business targets are historical.

The owner is testing with a few businesses and **5–10 users**. Preserve compact Manager.io-style workflows, portable businesses, multi-user business access, clear document lifecycles, projects and customizable documents. The product is a responsive browser app, English first and UAE-oriented; full regulatory certification and active e-invoicing integration are not established.

Keep one Next.js modular monolith, system SQLite and a database/attachment directory per business. No rebuild or external database/queue/Redis migration is selected. Development uses Node 22/npm; production uses the tested native ARM64 container and canonical Compose definition.

Use business/account terminology in UI. Group navigation by permissions; action-level server/domain guards are already implemented. Main transactions follow list → full-page create → saved view/action hub → full-page edit. Dialogs suit small settings, pickers and confirmations. Preserve shared tables/toolbars, financial formatting, statuses, error recovery and Light/Dark/System tokens in [THEME.md](THEME.md).

Accounting records are the source of truth and PDFs are presentation. Reuse financial calculations, migrations, permissions and reconciliation; avoid abstractions without repeated concrete uses. Validate restricted roles, keyboard behavior and mobile containment when changing a flow.

Keep the repository public. The real tracked Manager.io backup/history exposure remains owner-deferred despite ignore rules. Retain implemented fixes and PR/image/deployment gates. Additional hardening, offsite automation, SMTP, import redesign, broader audit controls, deployment privilege reduction and load testing remain deferred. A pending reboot requires a chosen maintenance window; none is performed by a documentation update.

Separate read-only OCI/Sentry operational access is configured privately; current-release Sentry delivery and settled cloud billing remain unproven. See [operations evidence](TESTING_PHASE_OPERATIONS_2026-10-26.md). The next product work is closed acceptance testing and defect-driven fixes through PRs. Revisit wider readiness before public onboarding. Plans and documentation are not authorization for new resources, sends, access expansion, deployment or reboot.
