# Bardo — Implementation State

Updated: 2026-08-21
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0
Current phase: 6 — Performance, observability and scalability
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
- Phase 5 integrated functional SHA: `73394286dc93f6af80c9b919183c02953ad71f4f`
- Phase 6 code-gate SHA: `8e7cfa59d742fe8debe837ff996de570a9c285f5`
- Phase 6 code-gate CI: #470 / `32495874910`
- Phase 6 branch: `codex/p6-performance-observability`
- Phase 6 PR: #15 (ready for fast-forward into integration after final documentation CI)

`main` is not a target of phase work. No production deploy, remote migration, remote staging provisioning, Discord command registration or branch deletion is authorized by this state document.

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

Delivered optimistic document versioning with ETag/required preconditions, server-confirmed save state, safe dirty exit, recoverable local drafts, bounded 30-revision history, restore-as-new-version semantics, legacy writer version advancement and full long-document pagination preservation.

Phase 5 code gate CI #405 (`32486915409`) passed with 67/67 unit tests and 53/53 Worker/runtime tests. Final closeout CI #411 (`32487246451`) reproduced the complete gate on integrated functional SHA `73394286dc93f6af80c9b919183c02953ad71f4f`.

### Phase 6 — PHASE_READY

Implementation and verification are documented in `docs/phase6-performance-observability.md`.

Delivered:

- route-aware lazy Activity boot and minified split bundles;
- enforced gzip/image performance budgets and CI evidence;
- generated 72/144px Bardo avatar assets instead of serving the 821 KB source;
- ETag/`If-None-Match`/`304` resource revalidation for Kanban and Planner;
- adaptive polling at ~5s / 12s / 30s with hidden-page suppression and failure backoff up to 60s;
- Kanban polling without guild member/role directories;
- Planner payloads with referenced people only plus remote member search on demand, including empty-list first-member support;
- privacy-safe structured request/error/auth/editor/export/cron telemetry;
- `sent`/`skipped`/`failed` notification-delivery telemetry without recipient/entity IDs;
- `src/p6-entry.js` as the real Wrangler entry;
- explicit isolated staging/production configuration and a CI environment-isolation contract.

Phase 6 code gate SHA `8e7cfa59d742fe8debe837ff996de570a9c285f5` passed CI #470 (`32495874910`): 72/72 unit tests, 55/55 Worker/runtime tests with all 15 local migrations, E2E, six real editor-browser scenarios, accessibility and the complete deterministic visual suite.

Certified Phase 6 performance evidence:

- critical shell: 59.6 KiB gzip (budget <= 80 KiB);
- Home: 65.8 KiB gzip;
- Documents: 82.9 KiB gzip;
- Kanban: 90.1 KiB gzip;
- Planner: 77.2 KiB gzip;
- initial-route budget: <= 250 KiB each;
- avatar 72px: 6.7 KiB;
- avatar 144px: 23.1 KiB.

The lazy PDF parser remains ~486.3 KiB gzip as a justified non-initial-route chunk. Staging is configured but intentionally **unprovisioned and undeployed** until a separate remote action is explicitly authorized.

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

Phase 6 adds no D1 migration. No remote migration has been applied by this plan.

## Runtime

- Worker entry: `src/p6-entry.js`.
- Phase 6 delegates product/domain behavior through the existing Phase 5 → Phase 4 → Phase 2/security strangler stack.
- Shared Activity UI authority: `src/activity/ui/`.
- Route-aware Activity boot: `src/activity/main.js`.
- Adaptive polling/revalidation: `src/activity/resource-polling.js`.
- Planner remote people search: `src/activity/planner-member-directory.js`.
- Structured telemetry: `src/lib/observability.js`.
- D1 production binding: `DB` → `bardo-db`.
- R2 production binding: `BACKUPS` → `bardo-backups`.
- Assets: `ASSETS`.
- Production cron: daily snapshot plus five-minute notification/reminder processing.
- Staging contract: `bardo-discord-staging` + `bardo-db-staging` + `bardo-backups-staging`, no crons, remote resources intentionally unprovisioned.

## Quality gates

Current CI includes reproducible `npm ci`, Activity minified build, transitive gzip/image budgets, staging/production isolation checks, floating-promise regression characterization, Wrangler binding types, 72 unit tests, 55 Worker/runtime tests + all local D1 migrations, ETag/304 and lean-payload tests, cross-product flow tests, Phase 5 concurrency/history/long-document tests, real-headless-Chrome editor scenarios, browser accessibility contracts, deterministic layout/style signatures for Documents/Kanban/Planner/Home at 390/768/1440, PNG human-review evidence, reduced motion and forced/high contrast.

Known characterized debt remains visible rather than silently hidden: 22 legacy async-ownership/empty-catch warnings, a lazy ~486.3 KiB PDF parser, physically large legacy `board.js`/`event.js` modules contained by lazy loading, and two pre-existing npm audit findings (1 moderate, 1 high). Phase 7 owns release hardening rather than weakening the Phase 6 budgets or earlier reliability/security guarantees.

## Guardrails

- Do not merge or deploy to `main`.
- Do not apply remote migrations.
- Do not create/provision remote staging resources without explicit authorization.
- Do not execute Discord command registration without explicit authorization.
- Do not delete historical branches.
- Keep PR #5 draft until the human release gate.

## Next phase

Phase 7 — QA and release hardening. Run the complete cross-phase regression matrix, repeat authorization/security review, validate migrations in an explicitly authorized staging environment, perform the real Discord pilot/smoke matrix, document rollback/release procedures and reach `RELEASE_READY` only after the human release gate. No automatic production deployment.
