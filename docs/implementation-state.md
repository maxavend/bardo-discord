# Bardo — Implementation State

Updated: 2026-08-21
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0
Current phase: 7 — QA, release hardening and launch gate
Phase status: AUTOMATED_HARDENING_READY / RELEASE_BLOCKED

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
- Phase 6 integrated SHA: `ae535e7325a500c2b6e8beb26e4ddfe5cb7a169a`
- Phase 7 automatic code gate: CI #530 / `32502635682`
- Phase 7 branch: `codex/p7-release-hardening`
- Phase 7 PR: #16

`main` is not a target of phase work. No production deploy, remote migration, remote staging provisioning, Discord command registration, production tag or branch deletion is authorized by this state document.

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

Certified signatures:

- docs: 390 `2ae61c96`, 768 `2c4dc3ca`, 1440 `9524e007`;
- kanban: 390 `7d94156b`, 768 `748e4556`, 1440 `93980e83`;
- planner: 390 `93780bd7`, 768 `63e56cb2`, 1440 `82b05980`.

### Phase 4 — PHASE_READY

Implementation and verification are documented in `docs/phase4-product-integration.md`. Delivered lightweight Bardo Home; source definition for `/bardo` without remote registration; same-guild `entity_links`; OAuth-derived document↔guild grants; secure cross-module context switching; Document → Task with backlink/safe undo; Event → Task origin traceability; and idempotent Event → Minutes task linking.

Phase 4 implementation SHA `974836ff1fa7d1b37541962e9597fb4682eed438` passed CI #374 (`32445761578`). Frozen Home signatures: 390 `781df15f`, 768 `71327b9d`, 1440 `5de9f1c2`.

### Phase 5 — PHASE_READY

Implementation and verification are documented in `docs/phase5-editor-reliability.md`. Delivered optimistic document versioning with required preconditions, server-confirmed save state, safe dirty exit, recoverable local drafts, bounded 30-revision history, restore-as-new-version semantics, legacy writer version advancement and full long-document pagination preservation.

Phase 5 code gate CI #405 (`32486915409`) passed with 67/67 unit tests and 53/53 Worker/runtime tests. Final closeout CI #411 (`32487246451`) reproduced the complete gate on integrated functional SHA `73394286dc93f6af80c9b919183c02953ad71f4f`.

### Phase 6 — PHASE_READY

Implementation and verification are documented in `docs/phase6-performance-observability.md`.

Delivered route-aware lazy Activity boot, minified split bundles, enforced gzip/image budgets, generated 72/144px avatar assets, ETag/304 Kanban/Planner revalidation, adaptive polling, lean Discord member payloads with remote Planner search, privacy-safe structured telemetry, DM delivery telemetry, `src/p6-entry.js` as real Wrangler entry and isolated staging/production configuration.

Final integrated SHA `ae535e7325a500c2b6e8beb26e4ddfe5cb7a169a` reproduced the complete Phase 6 suite on integration CI #476. Certified gzip remains: shell 59.6 KiB, Home 65.8, Documents 82.9, Kanban 90.1, Planner 77.2.

### Phase 7 — AUTOMATED_HARDENING_READY / RELEASE_BLOCKED

Implementation and evidence are documented in `docs/phase7-release-hardening.md` and `docs/release-runbook.md`.

Repository-side release hardening delivered:

- historical migration SHA freeze;
- clean D1 0001→0015 validation;
- representative pre-plan production upgrade 0001–0008→0015 without data loss;
- forward-only rollback policy with new compensating migrations rather than editing applied history;
- repeat central Activity authorization/security regression;
- explicit environment-only deployment commands;
- rollback and ABORT runbook;
- release checker that cannot silently claim `RELEASE_READY`;
- pinned axe browser audit with matching ChromeDriver;
- 200% text-scale, dark-mode, reduced-motion and high-contrast gates;
- dependency lock refresh and final immutable `npm ci` workflow;
- dependency audit reduced to zero findings.

Automatic code gate CI #530 (`32502635682`) passed:

- `npm ci`: 0 vulnerabilities;
- 77/77 unit tests;
- 57/57 Worker/runtime tests;
- D1 fresh 0001–0015: PASS;
- D1 representative upgrade 0001–0008→0015: PASS;
- E2E + six editor browser recovery scenarios: PASS;
- accessibility contracts: PASS;
- axe Documents/Kanban/Planner/Home: 0 violations, 0 critical, 0 serious;
- deterministic visual signatures unchanged;
- 200% text scale, dark mode, reduced motion and high contrast: PASS;
- dependency audit: critical/high/moderate/low = 0;
- automatic release gate: PASS.

The release checker correctly reports `RELEASE_BLOCKED` because these external gates remain pending:

1. `stagingResourcesProvisioned`;
2. `stagingMigrationsValidated`;
3. `discordPilotValidated`;
4. `humanReleaseApproved`.

Those are real environment/human gates from the master plan and cannot be replaced by local CI evidence.

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
9. `0009_activity_context_authorization.sql`
10. `0010_add_task_column_id.sql`
11. `0011_create_notifications.sql`
12. `0012_create_entity_links.sql`
13. `0013_add_task_due_at.sql`
14. `0014_document_guild_access.sql`
15. `0015_document_version_history.sql`

Phase 7 adds no D1 migration. Migration file contents are regression-frozen by SHA. No remote migration has been applied by this plan.

## Runtime and release tooling

- Worker entry: `src/p6-entry.js`.
- Shared Activity UI authority: `src/activity/ui/`.
- Adaptive polling/revalidation: `src/activity/resource-polling.js`.
- Structured telemetry: `src/lib/observability.js`.
- Release evidence: `scripts/release-readiness.js`.
- Dependency audit: `scripts/dependency-audit.js`.
- Axe browser audit: `scripts/axe-browser-check.js`.
- Release/rollback procedure: `docs/release-runbook.md`.
- Production D1/R2 remain `bardo-db` / `bardo-backups`.
- Staging remains configured but remotely unprovisioned and has no crons.

## Known characterized debt

- 22 legacy async-ownership/empty-catch warnings remain characterized; no new floating promises.
- lazy PDF parser remains ~486 KiB gzip and outside initial route budgets.
- legacy `board.js`/`event.js` remain physically large but lazy-loaded.
- the real Discord pilot and real remote staging evidence do not exist yet; this is a release blocker, not hidden debt.

The earlier npm moderate/high findings are resolved in the committed lockfile; final CI reports zero vulnerabilities.

## Guardrails

- Do not merge or deploy to `main` without explicit human approval.
- Do not provision remote staging resources without explicit authorization.
- Do not apply remote D1 migrations without explicit authorization.
- Do not execute Discord command registration without explicit authorization.
- Do not tag a production release until the full external release gate is approved.
- Do not delete historical branches without confirmation.
- Keep PR #5 draft until the human release gate.

## Next action

The implementation plan is complete up to the boundary that requires real external systems. To transition from `RELEASE_BLOCKED` to `RELEASE_READY`, explicitly authorize the remote staging gate; then validate staging migrations/deployment, execute the real Discord pilot matrix, inspect the evidence and obtain explicit human release approval. No production deployment is automatic.