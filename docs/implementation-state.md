# Bardo — Implementation State

Updated: 2026-08-21
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0
Current phase: 5 — Editor reliability and collaboration
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
- Phase 5 code-gate SHA: `27a1911f92954a16e0053d1a9fafe277e5b240f1`
- Phase 5 integrated functional SHA: `73394286dc93f6af80c9b919183c02953ad71f4f`
- Phase 5 branch: `codex/p5-editor-reliability`
- Phase 5 PR: #14 (merged by fast-forward into `feat/bardo-unified-experience`)

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

Certified Phase 3 signatures remain unchanged:

- docs: 390 `2ae61c96`, 768 `2c4dc3ca`, 1440 `9524e007`;
- kanban: 390 `7d94156b`, 768 `748e4556`, 1440 `93980e83`;
- planner: 390 `93780bd7`, 768 `63e56cb2`, 1440 `82b05980`.

### Phase 4 — PHASE_READY

Implementation and verification are documented in `docs/phase4-product-integration.md`.

Delivered lightweight Bardo Home; source definition for `/bardo` without remote registration; same-guild `entity_links`; OAuth-derived document↔guild grants; secure cross-module context switching; Document → Task with backlink/safe undo; Event → Task origin traceability; and idempotent Event → Minutes task linking.

Phase 4 implementation SHA `974836ff1fa7d1b37541962e9597fb4682eed438` passed CI #374 (`32445761578`) with 63/63 unit tests, 47/47 Worker/runtime tests, E2E/accessibility and deterministic browser visual reproduction.

Frozen Home signatures:

- home: 390 `781df15f`, 768 `71327b9d`, 1440 `5de9f1c2`.

### Phase 5 — PHASE_READY

Implementation and verification are documented in `docs/phase5-editor-reliability.md`.

Delivered:

- optimistic document versioning with ETag + required `If-Match`/`expectedVersion`;
- `409 DOCUMENT_VERSION_CONFLICT` with minimal metadata rather than silent overwrite;
- one-save-at-a-time/coalescing editor state machine: `clean → dirty → saving → saved`, plus `error` and `conflict`;
- explicit safe-exit behavior that triggers the real Ctrl/Cmd+S editor path and waits for server confirmation;
- document-scoped seven-day local drafts for recoverable failure/pagehide scenarios;
- accessible conflict/error recovery surfaces with copy/retry/reload choices;
- bounded 30-revision document history with author/time/reason where available;
- restore-as-new-version semantics that preserve prior history;
- legacy/system writer version advancement so concurrency cannot be bypassed;
- full long-document pagination preservation after versioned edits.

Phase 5 code gate SHA `27a1911f92954a16e0053d1a9fafe277e5b240f1` passed CI #405 (`32486915409`): build/static checks, 67/67 unit tests, 53/53 Worker/runtime tests with all 15 local migrations, browser E2E, accessibility and the existing deterministic visual regression suite. Final closeout CI #411 (`32487246451`) reproduced the complete gate on integrated functional SHA `73394286dc93f6af80c9b919183c02953ad71f4f`.

The Phase 5 browser gate covers six scenarios: queue/coalescing, conflict, retry, real UI network failure, real UI conflict and dirty Guardar/Salir waiting for a confirmed save.

The adversarial closeout repaired three reliability defects that the earlier isolated save-machine gate did not catch: recursive error/conflict timers, Ctrl+S dispatched to the wrong DOM target during exit, and a dirty→save timing race. It also repaired a backend long-document regression where the versioned writer retained only the first generated `pages` chunk.

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
15. `0015_document_version_history.sql`

No remote migration has been applied by this plan.

## Runtime

- Worker entry: `src/p5-entry.js`.
- Phase 5 editor/version layer delegates untouched behavior through the Phase 4 → Phase 2/security strangler stack.
- Shared Activity UI authority: `src/activity/ui/`.
- Editor save coordination: `src/activity/editor-save-machine.js`.
- Editor reliability/recovery UI: `src/activity/editor-reliability.js`.
- Version/history service: `src/services/document-versioning.js`.
- D1: `DB` → `bardo-db`.
- R2: `BACKUPS` → `bardo-backups`.
- Assets: `ASSETS`.
- Cron: daily snapshot plus five-minute notification/reminder processing.

## Quality gates

Current CI includes reproducible `npm ci`, Activity build/static checks, floating-promise regression characterization, Wrangler binding types, unit tests, Worker/runtime + all local D1 migrations, cross-product Phase 4 flow tests, Phase 5 concurrency/history/long-document tests, real-headless-Chrome editor scenarios, browser accessibility contracts, deterministic layout/style signatures for Documents/Kanban/Planner/Home at 390/768/1440, PNG human-review evidence, reduced motion and forced/high contrast.

Known characterized debt remains visible rather than silently hidden: legacy async-ownership/empty-catch warnings, package audit findings and large PDF/library bundle chunks. Phase 6 owns performance and observability rather than weakening the Phase 5 reliability guarantees.

## Guardrails

- Do not merge or deploy to `main`.
- Do not apply remote migrations.
- Do not execute Discord command registration without explicit authorization.
- Do not delete historical branches.
- Keep PR #5 draft until the human release gate.

## Next phase

Phase 6 — performance and observability: establish measurable performance/cost budgets, reduce avoidable work and improve diagnostics while preserving the security, UI, product-integration and editor-reliability contracts already certified.
