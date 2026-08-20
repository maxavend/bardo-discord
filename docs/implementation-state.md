# Bardo — Implementation State

Updated: 2026-08-20
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0
Current phase: 0 — Baseline, execution safety and characterization
Phase status: PHASE_READY

## Frozen baseline

- Repository: `maxavend/bardo-discord`
- Integration branch: `feat/bardo-unified-experience`
- Phase branch: `codex/p0-baseline`
- Technical base: `feat/tasks-kanban`
- Frozen base SHA: `b11883e170c051a0879cda2667c4745174bcbae1`
- Integration PR: #5 (draft)
- Phase PR: #6 (draft, `codex/p0-baseline` → `feat/bardo-unified-experience`)
- Temporary CI-validation PR: #7 (draft, do not merge)
- Reference PR: #3 (draft, `feat/tasks-kanban` → `main`)
- Related PR: #4 (draft, `feat/events-planner` → `main`)

## Branch comparison

At phase start:

- `feat/tasks-kanban` is exactly at `b11883e170c051a0879cda2667c4745174bcbae1`.
- `feat/tasks-kanban` is 9 commits ahead of `feat/events-planner` and 0 commits behind it. The Event Planner work is therefore already contained in the chosen technical base; PR #4 must not be merged into the integration branch as a block.
- `feat/document-editor` and `feat/tasks-kanban` have diverged. Their merge base is `642c9d6ec7680edea19b34c83bf79eba7a8ce1d4`; the Kanban branch is 50 commits ahead of that branch while `feat/document-editor` has 15 commits not in the Kanban branch. Any editor capability must be ported selectively after comparison, never by blind merge.

## Existing migrations

The frozen baseline contains these applied-history files and they are immutable references for this plan:

1. `0001_create_documents.sql`
2. `0002_create_activity_contexts.sql`
3. `0003_add_import_sources.sql`
4. `0004_create_kanban.sql`
5. `0005_add_task_priority.sql`
6. `0006_add_board_columns.sql`
7. `0007_add_board_members.sql`
8. `0008_create_events.sql`

Future migrations start at the next free number after re-checking the repository. Existing migrations are never edited to implement new behavior.

## Current command surface

The baseline implements these command families in the Worker chain:

- Documents: `/doc` with temporary compatibility for `/documento`.
- Kanban: `/tablero` and `/tarea`.
- Events: `/evento`.

Registration details remain owned by `scripts/register-commands.js`; global command registration is outside Phase 0 and requires explicit authorization before any remote registration.

## Runtime and storage baseline

- Worker entry point: `src/event-worker.js`.
- Worker composition: Events wraps Kanban, which wraps Documents.
- D1 binding: `DB` → `bardo-db`.
- R2 binding: `BACKUPS` → `bardo-backups`.
- Static Activity binding: `ASSETS`.
- Cron baseline: daily snapshot (`0 3 * * *`) plus five-minute scheduled processing (`*/5 * * * *`).
- Node engine: `>=22.12.0`.
- Wrangler baseline: `^4.124.0`.

## Phase 0 characterization findings

The route matrix in `docs/security-route-matrix.md` is the source of truth for Phase 1 security work. The most important baseline findings are:

- Document GET, PATCH, export/download and Activity-context lookup currently allow UUID/instance-only access without a complete Activity authorization guard.
- Document source/normalize use an instance→document guard, but it does not establish actor/action permissions.
- Kanban board, guild-member and guild-role reads currently execute before board Activity authorization; the normal board payload can also include a large member/role directory.
- Kanban mutations and Event Planner routes have partial Activity guards, but permission semantics still need centralization and cross-guild/action-level tests.
- The initial async ownership scan characterized 9 pre-existing unowned async call sites and 10 owned-but-empty catch handlers. Phase 0 prevents new occurrences while preserving product behavior; later implementation phases must shrink this baseline debt.
- `npm ci` currently reports two dependency audit findings (one moderate and one high). Phase 0 records them rather than applying an unreviewed dependency upgrade; they require explicit dependency-path triage before release.

## Phase 0 verification

Validated code head before this status-only closeout: `58ad92bf39703e74264eec81a9011c837347aaa9`.

Two independent GitHub Actions runs completed successfully against the phase branch:

- CI run #223 / run id `32428453018`: success.
- CI run #224 / run id `32428454321`: success.

Both completed the full `verify` job:

- `npm ci` installation.
- Activity build and syntax checks.
- Floating-promise regression check.
- Wrangler binding type generation.
- Unit test suite.
- Worker integration suite.
- Cloudflare `createTestHarness()` runtime smoke with local D1 migrations and scheduled dispatch.
- Executable E2E and accessibility gate scripts.

The Phase 0 E2E and accessibility files are explicit `todo` gates, not claims of browser/axe coverage. Real browser, visual and accessibility execution is introduced by the later UI/QA phases defined in the master plan.

## Preview / staging

No staging or preview URL is encoded in the repository baseline. Phase 0 does not invent one and does not deploy. Environment isolation and preview deployment are deferred to Phase 6.

## Rollback for Phase 0

Phase 0 is documentation, characterization tests and local/CI tooling only. It does not change product behavior or schema. Rollback is therefore a normal Git revert of Phase 0 commits or resetting `feat/bardo-unified-experience` to the frozen SHA. No D1/R2 rollback is required.

## Phase gate

Phase 0 is `PHASE_READY` because:

- the baseline is frozen and reproducible;
- branch relationships and migration history are documented;
- the private-route characterization matrix exists with positive/negative fixture vocabulary;
- unsafe current behavior is explicitly marked as temporary debt rather than desired contract;
- CI installs reproducibly with `npm ci`;
- quality/test commands are separated and runnable;
- a real local Workers/D1/cron integration harness is in place; and
- the phase code passed two full CI runs.

Phase 1 — Security, integrity and blocking bugs — is unlocked.

## Guardrails

- Do not merge or deploy to `main`.
- Do not apply remote migrations.
- Do not register global Discord commands.
- Do not delete historical branches.
- Do not treat resource UUIDs as authorization.
- Keep PR #5 as draft until a later human release gate.
