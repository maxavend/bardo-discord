# Phase 7 — QA, release hardening and launch gate

Status: AUTOMATED_HARDENING_READY / RELEASE_BLOCKED
Automated code gate: CI #530 / `32502635682`
Phase branch: `codex/p7-release-hardening`
Integration target: `feat/bardo-unified-experience`
Release PR: #16 (draft during hardening)

## Meaning of this status

The repository-side and local/CI release-hardening work is complete. Bardo must **not** be labeled `RELEASE_READY` yet because the master plan requires four pieces of evidence that cannot be truthfully produced by local CI alone:

1. remote staging resources provisioned and isolated;
2. migrations validated against that real staging environment;
3. the real Discord pilot/smoke matrix completed and approved;
4. explicit human release approval.

`npm run check:release` is intentionally fail-closed: without those evidence values it reports `RELEASE_BLOCKED`, even when every automatic gate passes.

## Automated hardening delivered

### Final test pyramid

CI now covers the complete accumulated product contract:

- reproducible `npm ci`;
- Activity build/static/syntax/promise ownership checks;
- performance and environment-isolation budgets;
- 77 unit tests;
- 57 Worker/runtime integration tests;
- all 15 D1 migrations from an empty database;
- representative pre-plan production upgrade from migrations 0001–0008 through 0015 without data loss;
- central Activity authorization/security regression suite;
- cross-product Home/Document/Task/Event/Minutes flows;
- editor optimistic-concurrency/history/long-document gates;
- six real headless-Chrome editor recovery scenarios;
- browser E2E;
- accessibility contract tests;
- axe-core browser audit;
- deterministic visual regression at 390/768/1440;
- 200% text-scale, dark mode, reduced-motion and forced/high-contrast checks;
- dependency audit evidence;
- explicit release-readiness evidence artifact.

### Security and permissions re-audit

The release suite preserves and reruns the security contracts established in Phase 1 and expanded in Phase 4:

- Activity session tokens remain instance-bound, tamper-resistant and expiring;
- UUID-only/anonymous access is rejected before private-resource disclosure;
- exact document authorization remains enforced;
- board/event cross-guild access remains denied;
- OAuth guild authorization remains derived server-side;
- same-guild cross-product navigation does not turn knowledge of an entity ID into authorization;
- document history and editor writes retain authorization and version preconditions;
- structured telemetry remains privacy-allowlisted.

### Migration integrity and rollback

Phase 7 freezes historical migration contents by hash and validates two migration paths:

- clean database → migrations 0001 through 0015;
- representative production-era schema/data at 0001 through 0008 → migrations 0009 through 0015.

The upgrade fixture retains representative documents, boards, tasks and events and verifies the expected release fields/relationships after migration.

Rollback is explicitly forward-only for D1. Applied migrations are never rewritten. Schema/data repair uses a new **migración compensatoria**, validated in staging first. Worker rollback is documented separately from D1 recovery.

Runbook: `docs/release-runbook.md`.

### Deployment safety

Release work can no longer rely on an ambiguous default deploy command. The package scripts expose explicit staging and production deployment targets, and the runbook requires environment naming and preflight validation.

No deployment command was executed during this phase.

### Dependency hardening

The lockfile was refreshed within the existing semver contract and then returned to an immutable `npm ci` CI workflow. The final code gate installs the committed lockfile without mutation and reports:

- critical: 0;
- high: 0;
- moderate: 0;
- low: 0.

`discord.js` resolves to 14.27.0 in the committed lockfile. The earlier high/moderate audit findings are no longer present.

### Accessibility closeout

The browser accessibility gate uses pinned axe CLI tooling with a ChromeDriver matching the runner browser. Final CI #530 reports for Documents, Kanban, Planner and Home:

- axe violations: 0;
- critical: 0;
- serious: 0.

The same run also passes 200% text-scale for all four views, dark-mode contract, reduced motion and forced/high contrast.

### Visual and performance preservation

All certified deterministic visual signatures remain unchanged:

- Documents: `2ae61c96`, `2c4dc3ca`, `9524e007`;
- Kanban: `7d94156b`, `748e4556`, `93980e83`;
- Planner: `93780bd7`, `63e56cb2`, `82b05980`;
- Home: `781df15f`, `71327b9d`, `5de9f1c2`.

Phase 6 performance budgets also remain green:

- critical shell 59.6 KiB gzip;
- Home 65.8 KiB;
- Documents 82.9 KiB;
- Kanban 90.1 KiB;
- Planner 77.2 KiB.

## Final automatic gate — CI #530

CI run #530 (`32502635682`) passed the complete repository-side release matrix on the committed immutable lockfile:

- `npm ci`: PASS, 0 vulnerabilities;
- build/static: PASS;
- unit: 77/77 PASS;
- Worker/runtime: 57/57 PASS;
- fresh D1 0001–0015: PASS;
- upgrade D1 0001–0008 → 0015: PASS;
- E2E: PASS;
- editor browser scenarios: PASS;
- accessibility contracts: PASS;
- axe: 0 violations;
- deterministic visual regression: PASS;
- 200% text / dark / reduced-motion / high-contrast: PASS;
- dependency audit: 0 findings;
- automatic release gate: PASS.

The release evidence correctly reports:

`external=PENDING:stagingResourcesProvisioned,stagingMigrationsValidated,discordPilotValidated,humanReleaseApproved`

and therefore:

`state=RELEASE_BLOCKED`

This is intentional and is the correct terminal state before the human/remote release gate.

## External release gates still required

### 1. Provision isolated staging

Requires explicit authorization to create/configure remote Cloudflare staging resources. The repository currently keeps staging deliberately marked unprovisioned and with an inert placeholder D1 identifier.

### 2. Validate migrations remotely in staging

After provisioning, execute the staging migration validation described in the runbook and capture schema/data evidence. No production migration is implied.

### 3. Execute the real Discord pilot

The pilot matrix must cover small/large guilds, admin/member, DMs open/closed, desktop/mobile, presentation variants where available, slow/intermittent network and two simultaneous document editors. It must record friction/failures rather than simply assert visual correctness.

### 4. Human release approval

Only after the preceding gates are inspected may a human explicitly approve release. That approval is what permits the release checker to transition from `RELEASE_BLOCKED` to `RELEASE_READY` when the evidence variables are deliberately supplied.

## Explicitly not performed

- no merge to `main`;
- no staging or production deployment;
- no remote staging provisioning;
- no remote D1 migration;
- no Discord command registration;
- no production tag/release;
- no branch deletion.

## Release decision

Repository/CI hardening: **READY**.

Production release: **BLOCKED pending external/human evidence**.

This distinction is deliberate: passing local CI is necessary but not sufficient to claim that a Discord/Cloudflare deployment has been validated in the real environment.