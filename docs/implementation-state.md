# Bardo — Implementation State

Updated: 2026-08-20
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0
Current phase: 3 — Bardo UI design system and visual migration
Phase status: PHASE_READY

## Repository state

- Repository: `maxavend/bardo-discord`
- Frozen technical baseline: `feat/tasks-kanban` @ `b11883e170c051a0879cda2667c4745174bcbae1`
- Integration branch: `feat/bardo-unified-experience`
- Integration PR: #5 (draft)
- Phase 1 certified SHA: `cac810e90f35c37acc3ba840bdcf369eb8addfd4`
- Phase 2 certified SHA: `4a0855fbb40328687f3d582c213915989af2b59c`
- Phase 3A foundations SHA: `7d0ea142e7d72430f64c8c5e72416a8d56c63001`
- Phase 3B migration integrated SHA: `728c07a470dd8c416fcd08b99d4f6cdbf9b9a45f`
- Phase 3 visual-gate hardening branch: `codex/p3-visual-gate-fix`
- Phase 3 visual-gate PR: #12 (draft → `feat/bardo-unified-experience`)

`main` is not a target of phase work. No production deploy, remote migration, Discord command registration or branch deletion is authorized by this state document.

## Certified phases

### Phase 0 — PHASE_READY

Baseline, branch genealogy, migration history, route characterization, reproducible `npm ci`, split test commands, floating-promise regression check, Wrangler binding types and local Workers/D1/cron harness are established.

### Phase 1 — PHASE_READY

Certified at `cac810e90f35c37acc3ba840bdcf369eb8addfd4` by CI run #239 (`32431819691`). Delivered centralized Activity authorization and short-lived signed session identity; full protection for Documents, Kanban and Events private routes; guild/resource binding; authenticated document export; custom Kanban columns through forward-only migrations `0009` and `0010`; assignee role-helper runtime fix; and atomic critical D1 writes via `DB.batch()`.

### Phase 2 — PHASE_READY

Implementation is documented in `docs/phase2-domain-time-notifications.md`. Delivered shared domain services, one timezone-aware temporal parser, authorized remote member search and accessible MemberPicker, Discord autocomplete/guided event modal support, one task creation path across slash/Kanban/Planner, and idempotent notification/DM infrastructure via migration `0011_create_notifications.sql`.

The Discord command definitions were updated in source only. `scripts/register-commands.js` was not executed.

### Phase 3 — PHASE_READY

Implementation and verification are documented in `docs/phase3-bardo-ui.md` and the audit in `docs/bardo-ui-audit.md`.

Delivered:

- one shared `src/activity/ui/` design-system authority for Documents, Kanban and Planner;
- semantic tokens, spacing/radius/control contracts, light/dark, high contrast and reduced motion;
- reusable primitives and product patterns;
- unified `Inicio · Documentos · Tableros · Agenda` contextual navigation;
- centralized dialog focus trap, focus restoration and dirty-form dismissal protection;
- Documents migration to shared controls/navigation;
- Kanban shell/cards/filter/overflow migration, terminal padding and controlled drag auto-scroll;
- Planner Agenda/Calendario/Live migration, accessible tabs, scalable member selection and larger Live targets;
- real headless-Chrome UI evidence at 390, 768 and 1440 px;
- deterministic visual regression based on browser-computed layout/style signatures;
- PNG screenshots retained as human-review evidence rather than fragile binary pass/fail hashes.

Visual-gate hardening characterized two false positives from raw PNG hashes: subpixel antialiasing and transient modal focus rendering. The final signature gate explicitly fixes representative focus, snapshots stable geometry/computed styles and rounds geometry before hashing.

Certified deterministic signatures:

- docs: 390 `2ae61c96`, 768 `2c4dc3ca`, 1440 `9524e007`;
- kanban: 390 `7d94156b`, 768 `748e4556`, 1440 `93980e83`;
- planner: 390 `93780bd7`, 768 `63e56cb2`, 1440 `82b05980`.

CI #313 generated the signature baseline successfully and CI #315 reproduced the frozen signatures while passing the surrounding build/unit/Worker/E2E/accessibility pipeline. The final integration-PR reproduction remains the last release-independent closeout gate before Phase 4 begins.

The Phase 3 browser gate is representative Activity UI evidence, not a deployed Discord environment. No staging/production deployment was invented for certification. `Inicio` remains intentionally unavailable until Phase 4 implements the real Bardo Home surface.

## Migration history

Immutable historical migrations:

1. `0001_create_documents.sql`
2. `0002_create_activity_contexts.sql`
3. `0003_add_import_sources.sql`
4. `0004_create_kanban.sql`
5. `0005_add_task_priority.sql`
6. `0006_add_board_columns.sql`
7. `0007_add_board_members.sql`
8. `0008_create_events.sql`

Forward-only plan migrations so far:

9. `0009_activity_context_authorization.sql`
10. `0010_add_task_column_id.sql`
11. `0011_create_notifications.sql`

No remote migration has been applied by this plan.

## Runtime

- Worker entry: `src/p2-entry.js`.
- Phase 2 orchestrator: `src/p2-worker.js`.
- Legacy Workers remain behind the strangler layer for untouched routes.
- Shared Activity UI authority: `src/activity/ui/`.
- D1: `DB` → `bardo-db`.
- R2: `BACKUPS` → `bardo-backups`.
- Assets: `ASSETS`.
- Cron: daily snapshot plus five-minute notification/reminder processing.

## Quality gates

Current CI includes reproducible `npm ci`, Activity build/static checks, floating-promise regression characterization, Wrangler binding types, unit tests, Worker/runtime + local D1 migration tests, Phase 3 browser fixture E2E/accessibility, deterministic layout/style signatures at 390/768/1440, PNG evidence artifacts, reduced motion and forced/high contrast.

Known characterized debt remains visible rather than silently hidden: legacy async-ownership/empty-catch warnings, package audit findings and large PDF/library bundle chunks.

## Guardrails

- Do not merge or deploy to `main`.
- Do not apply remote migrations.
- Do not execute Discord command registration without explicit authorization.
- Do not delete historical branches.
- Keep PR #5 draft until the human release gate.

## Next phase

Phase 4 — product integration: Bardo Home, linked entities, Documents → tasks, Events → tasks → minutes and cross-module deep links/backlinks — is unlocked after PR #12 is fast-forwarded into `feat/bardo-unified-experience` and PR #5 reproduces the full green gate.
