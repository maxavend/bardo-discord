# Bardo — Implementation State

Updated: 2026-08-20
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0
Current phase: 2 — Domain, time, members, commands and notifications
Phase status: PHASE_READY

## Repository state

- Repository: `maxavend/bardo-discord`
- Frozen technical baseline: `feat/tasks-kanban` @ `b11883e170c051a0879cda2667c4745174bcbae1`
- Integration branch: `feat/bardo-unified-experience`
- Integration PR: #5 (draft)
- Phase 1 certified SHA: `cac810e90f35c37acc3ba840bdcf369eb8addfd4`
- Phase 2 branch: `codex/p2-domain-time-notifications`
- Phase 2 PR: #9 (draft → `feat/bardo-unified-experience`)
- Phase 2 code gate SHA: `057e1ddb324f56be228098f62dc1182416fb44a1`

`main` is not a target of phase work. No production deploy, remote migration, Discord command registration or branch deletion is authorized by this state document.

## Certified phases

### Phase 0 — PHASE_READY

Baseline, branch genealogy, migration history, route characterization, reproducible `npm ci`, split test commands, floating-promise regression check, Wrangler binding types and local Workers/D1/cron harness are established.

### Phase 1 — PHASE_READY

Certified at `cac810e90f35c37acc3ba840bdcf369eb8addfd4` by CI run #239 (`32431819691`).

Delivered:

- centralized Activity authorization and short-lived signed session identity;
- full protection for Documents, Kanban and Events private routes;
- guild/resource binding and UUID-not-authorization behavior;
- authenticated document export;
- custom Kanban columns through forward-only migrations `0009` and `0010`;
- assignee role-helper runtime fix;
- atomic critical D1 writes via `DB.batch()`.

### Phase 2 — PHASE_READY

Implementation is documented in `docs/phase2-domain-time-notifications.md`.

Delivered:

- shared `DocumentService`, `TaskService`, `EventService`, `NotificationService` and `MemberDirectoryService`;
- one flexible timezone-aware temporal parser;
- authorized remote member search and accessible task MemberPicker;
- Discord autocomplete plus guided event modal support;
- shared task creation path for slash command, Kanban Activity and Event Planner;
- notification preferences, idempotent delivery ledger, retries and privacy-safe DM failures;
- event reminder windows and minutes-ready notifications;
- migration `0011_create_notifications.sql`.

The Discord command definitions were updated in source only. `scripts/register-commands.js` was not executed.

The `/bardo` Home command remains intentionally coupled to Phase 4, where the master plan defines the actual Bardo Home experience. Phase 2 does not invent a placeholder Home surface merely to satisfy command registration before its product destination exists.

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
- D1: `DB` → `bardo-db`.
- R2: `BACKUPS` → `bardo-backups`.
- Assets: `ASSETS`.
- Cron: daily snapshot plus five-minute notification/reminder processing.

## Quality gates

Phase 2 has real unit and Worker/runtime coverage for:

- all required duration and clock formats;
- invalid time/duration/date cases and leap years;
- timezone precedence and DST spring/fall behavior;
- authorized remote member lookup and bot filtering;
- notification preference persistence and unique dedupe keys in local D1;
- Discord DM privacy/transient error classification;
- shared task-service wiring across the three task entry points;
- Activity security regression tests from Phase 1;
- all local D1 migrations through `0011`.

The existing `test:e2e` and `test:a11y` commands are still Phase-0 TODO gates and must not be described as real browser/axe coverage. Browser, visual and full accessibility certification remains in the later UI/QA phases.

## Guardrails

- Do not merge or deploy to `main`.
- Do not apply remote migrations.
- Do not execute Discord command registration without explicit authorization.
- Do not delete historical branches.
- Keep PR #5 draft until the human release gate.

## Next phase

Phase 3 — Bardo UI: design system and visual migration — is unlocked after the Phase 2 closeout commit passes CI and is fast-forwarded into `feat/bardo-unified-experience`.
