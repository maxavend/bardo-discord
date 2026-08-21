# Bardo — Implementation State

Updated: 2026-08-21
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0
Current phase: 4 — Product integration
Phase status: PHASE_READY

## Repository state

- Repository: `maxavend/bardo-discord`
- Frozen technical baseline: `feat/tasks-kanban` @ `b11883e170c051a0879cda2667c4745174bcbae1`
- Integration branch: `feat/bardo-unified-experience`
- Integration PR: #5 (draft)
- Phase 1 certified SHA: `cac810e90f35c37acc3ba840bdcf369eb8addfd4`
- Phase 2 certified SHA: `4a0855fbb40328687f3d582c213915989af2b59c`
- Phase 3 certified integration SHA: `50351a19fcb0a0b0c27a9e9cbc10f35037925146`
- Phase 4 implementation certified SHA: `974836ff1fa7d1b37541962e9597fb4682eed438`
- Phase 4 branch: `codex/p4-product-integration`
- Phase 4 PR: #13 (draft → `feat/bardo-unified-experience`)

`main` is not a target of phase work. No production deploy, remote migration, Discord command registration or branch deletion is authorized by this state document.

## Certified phases

### Phase 0 — PHASE_READY

Baseline, branch genealogy, migration history, route characterization, reproducible `npm ci`, split test commands, floating-promise regression check, Wrangler binding types and local Workers/D1/cron harness are established.

### Phase 1 — PHASE_READY

Certified at `cac810e90f35c37acc3ba840bdcf369eb8addfd4` by CI run #239 (`32431819691`). Delivered centralized Activity authorization and short-lived signed session identity; full protection for Documents, Kanban and Events private routes; guild/resource binding; authenticated document export; custom Kanban columns through forward-only migrations `0009` and `0010`; assignee role-helper runtime fix; and atomic critical D1 writes via `DB.batch()`.

### Phase 2 — PHASE_READY

Implementation is documented in `docs/phase2-domain-time-notifications.md`. Delivered shared domain services, one timezone-aware temporal parser, authorized remote member search and accessible MemberPicker, Discord autocomplete/guided event modal support, one task creation path across slash/Kanban/Planner, and idempotent notification/DM infrastructure via migration `0011_create_notifications.sql`.

Discord command definitions were updated in source only. `scripts/register-commands.js` was not executed.

### Phase 3 — PHASE_READY

Implementation and verification are documented in `docs/phase3-bardo-ui.md` and `docs/bardo-ui-audit.md`. Delivered the shared Activity design-system authority, semantic tokens/primitives/patterns, unified navigation, dialog/focus protections, responsive Documents/Kanban/Planner migration and deterministic browser-computed visual signatures at 390/768/1440 with reduced-motion/high-contrast evidence.

Certified Phase 3 signatures remain unchanged in Phase 4:

- docs: 390 `2ae61c96`, 768 `2c4dc3ca`, 1440 `9524e007`;
- kanban: 390 `7d94156b`, 768 `748e4556`, 1440 `93980e83`;
- planner: 390 `93780bd7`, 768 `63e56cb2`, 1440 `82b05980`.

### Phase 4 — PHASE_READY

Implementation and verification are documented in `docs/phase4-product-integration.md`.

Delivered:

- lightweight Bardo Home with independently loading sections for upcoming events, current-user tasks, recent documents and boards;
- source definition for `/bardo` to launch Home, without running command registration;
- generic, idempotent, same-guild `entity_links` graph;
- durable document↔guild grants created only after Discord OAuth identity and real guild-membership verification;
- secure context switching/deep links between Home, Documents, Boards, Tasks and Events without treating opaque IDs as authorization;
- Document → Task creation with board, assignee, due date, bounded excerpt, backlink and safe undo;
- Event → Task origin traceability down to block/item;
- Event → Minutes live task section with idempotent regeneration and task↔minute links;
- no new floating-promise regressions from the Phase 4 Activity code.

Phase 4 implementation SHA `974836ff1fa7d1b37541962e9597fb4682eed438` passed CI #374 (`32445761578`): build/static checks, 63/63 unit tests, 47/47 Worker/runtime tests, E2E contract, accessibility contract and deterministic browser visual reproduction.

Frozen Home signatures:

- home: 390 `781df15f`, 768 `71327b9d`, 1440 `5de9f1c2`.

The browser gate uses a representative Activity fixture plus real headless Chrome; it is not a production Discord deployment. No staging/production deployment was invented for certification.

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

Forward-only plan migrations:

9. `0009_activity_context_authorization.sql`
10. `0010_add_task_column_id.sql`
11. `0011_create_notifications.sql`
12. `0012_create_entity_links.sql`
13. `0013_add_task_due_at.sql`
14. `0014_document_guild_access.sql`

No remote migration has been applied by this plan.

## Runtime

- Worker entry: `src/p4-entry.js`.
- Phase 4 product-integration layer delegates untouched behavior through the Phase 2/security strangler stack.
- Shared Activity UI authority: `src/activity/ui/`.
- D1: `DB` → `bardo-db`.
- R2: `BACKUPS` → `bardo-backups`.
- Assets: `ASSETS`.
- Cron: daily snapshot plus five-minute notification/reminder processing.

## Quality gates

Current CI includes reproducible `npm ci`, Activity build/static checks, floating-promise regression characterization, Wrangler binding types, unit tests, Worker/runtime + all local D1 migrations, cross-product Phase 4 flow tests, browser E2E/accessibility contracts, deterministic layout/style signatures for Documents/Kanban/Planner/Home at 390/768/1440, PNG human-review evidence, reduced motion and forced/high contrast.

Known characterized debt remains visible rather than silently hidden: legacy async-ownership/empty-catch warnings, package audit findings and large PDF/library bundle chunks. Phase 5 specifically owns the legacy document-editor save/concurrency debt.

## Guardrails

- Do not merge or deploy to `main`.
- Do not apply remote migrations.
- Do not execute Discord command registration without explicit authorization.
- Do not delete historical branches.
- Keep PR #5 draft until the human release gate.

## Next phase

Phase 5 — editor reliability and collaboration: optimistic versioning, save-state machine, conflict/retry UX, recoverable local drafts and bounded revision history.
