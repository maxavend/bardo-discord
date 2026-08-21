# Bardo — Release and rollback runbook

Status: pre-release operational contract. This document does not authorize a deployment.

## Release invariants

- `main` is not changed until the human release gate is explicitly approved.
- Staging and production use different Worker names, D1 databases and R2 buckets.
- Every deploy names its environment explicitly.
- Historical D1 migrations are immutable and forward-only.
- A failed migration is recovered with a new compensating migration when schema/data correction is required; never rewrite an already-applied migration.
- Discord command registration is a separate explicit operation.
- No release gate may depend on document contents, DM bodies or private names appearing in logs.

## Preflight

Before any remote action:

1. Confirm PR #5 and the Phase 7 PR point at the intended SHA.
2. Confirm CI is green for build/static, unit, Worker/runtime, E2E, accessibility, visual regression and release evidence.
3. Confirm there are no open P0/P1 release issues.
4. Run `npm run check:release`; automatic gates must pass.
5. Confirm a fresh local D1 migration and the representative 0001–0008 → 0015 upgrade gate both pass.
6. Capture the current production Worker deployment/version identifier and the current D1 backup/snapshot reference.
7. Do not continue if the staging binding still contains the zero placeholder database ID.

## Provision staging — explicit human-authorized action only

The repository intentionally ships with staging marked `unprovisioned`. When explicitly authorized:

1. Create `bardo-db-staging` and `bardo-backups-staging` in the same Cloudflare account used for the pilot.
2. Replace only the staging placeholder D1 ID in `wrangler.jsonc`; never point staging to the production D1 ID or production R2 bucket.
3. Store secrets with Cloudflare secret mechanisms, never in Git.
4. Keep staging crons disabled during migration validation and destructive-smoke preparation.
5. Verify `npm run check:env` before deploying.

## Staging migration validation

1. Take a sanitized representative fixture or isolated copy appropriate for staging.
2. Validate a fresh migration path from 0001 through 0015.
3. Validate an upgrade path representing the pre-plan production schema (0001 through 0008) followed by 0009 through 0015.
4. Compare counts for documents, boards, tasks and events before/after the upgrade.
5. Verify task `column_id`, `due_at`, notification tables, entity links, document guild grants and document revision/version metadata.
6. Only after the above passes, run the remote staging migration with an explicit staging environment.
7. Record the migration output and resulting schema evidence. Set the release-gate evidence only after inspection.

## Staging deploy

Use only the explicit command:

`npm run deploy:staging`

Never use a default `wrangler deploy` invocation for release work.

## Discord pilot matrix

The real pilot must exercise observable friction, not only visual appearance:

- small guild and large guild;
- administrator and normal member;
- DMs open and DMs closed;
- desktop and mobile;
- light/dark presentation where Discord exposes it;
- slow/intermittent network;
- two simultaneous document editors.

Critical flows:

1. Open Home, Documents, Kanban and Planner from Discord.
2. Create/edit/export a document.
3. Create a board column, create/move/reload a task and search/assign a Discord member.
4. Create an event using multiple accepted time/duration formats.
5. Event → task → minutes, including retry/idempotency.
6. DM success, closed-DM skip and transient failure behavior.
7. Two editors change the same document and the stale editor receives a recoverable conflict rather than silent overwrite.
8. Keyboard-only modal/picker navigation and focus restoration.

Record steps, failures, latency/friction and abandonment. A pilot is not approved by “se ve bien”.

## ABORT conditions

Stop the release immediately if any of these occur:

- authorization allows cross-guild/private resource access;
- a migration loses or corrupts representative data;
- a D1/R2 staging binding resolves to production resources;
- document conflicts can silently overwrite newer content;
- task/event/minutes retry creates duplicate linked entities or duplicate DMs;
- CI regression or bundle budget gate fails;
- accessibility regression blocks keyboard/focus operation;
- logs expose private content or direct user/entity identifiers beyond the approved allowlist;
- staging smoke produces unexplained 5xx, D1 failures or reminder lag.

## Worker rollback

If code deployment is bad but schema remains compatible:

1. Stop further rollout.
2. Re-deploy the previously recorded known-good Worker version/source using the explicit production environment.
3. Verify Home and one authorized read per product, then one safe write flow.
4. Do not roll back D1 by editing migration files.

## D1 rollback / recovery

D1 migrations in this project are forward-only. If a newly applied migration is defective:

1. Preserve evidence and take/retain the latest usable backup.
2. Decide whether code can be rolled back while leaving the additive schema in place.
3. If schema/data repair is required, create a new compensating migration with a new sequence number.
4. Validate that compensating migration in staging against a representative fixture.
5. Apply remotely only after explicit approval.
6. For catastrophic data loss, use the documented R2/D1 backup restoration path rather than ad-hoc destructive SQL.

## Production release gate

Production remains blocked until all are true:

- complete CI green;
- zero open P0/P1 release blockers;
- repeated permission/security audit green;
- staging resources provisioned and isolated;
- staging migrations validated remotely;
- real Discord pilot approved;
- rollback references captured;
- human release approval explicit.

Only then may `npm run check:release -- --require-release-ready` report `RELEASE_READY` when the corresponding evidence variables are deliberately supplied.

## Post-release

After production is verified, and only with explicit authorization:

- update changelog/release notes;
- tag the release;
- close superseded PRs where appropriate;
- archive/delete redundant branches only after confirmation;
- keep historical migrations and certification handoffs intact.
