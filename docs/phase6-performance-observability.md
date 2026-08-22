# Phase 6 — Performance, observability and scalability handoff

Status: PHASE_READY
Code gate SHA: `8e7cfa59d742fe8debe837ff996de570a9c285f5`
Code gate CI: #470 / `32495874910`
Phase branch: `codex/p6-performance-observability`
Phase PR: #15
Integration target: `feat/bardo-unified-experience`

## Product outcome

Phase 6 turns performance and runtime diagnostics into explicit contracts instead of assumptions. Bardo now ships the Activity as route-aware lazy modules, enforces gzip/image budgets, revalidates collaborative resources with ETag/304, reduces directory payloads and idle polling, emits privacy-safe structured telemetry, and defines isolated production/staging configuration without remotely provisioning or deploying staging.

## Mission 6.1 — Bundles and route budgets

`src/activity/main.js` is now a small route-aware bootloader. Documents, Kanban and Planner are dynamically imported only for the active Activity mode; Home does not pay for those product modules. PDF/DOCX parsing remains lazy behind the document workflow.

The build is minified and emits a transitive gzip report per initial route. `scripts/check-activity-budgets.js` fails CI when the Phase 6 contract is exceeded:

- critical shell: <= 80 KiB gzip;
- each initial product route: <= 250 KiB gzip;
- unjustified individual chunk: <= 500 KiB gzip;
- served avatar variants: <= 50 KiB each.

Code gate #470 measured:

- critical shell: **59.6 KiB gzip**;
- Home: **65.8 KiB gzip**;
- Documents: **82.9 KiB gzip**;
- Kanban: **90.1 KiB gzip**;
- Planner: **77.2 KiB gzip**.

The Planner measurement includes `planner-member-directory.js`; the adversarial pass explicitly repaired an earlier report that omitted that lazy chunk.

The existing PDF parser is approximately 486.3 KiB gzip. It is a justified lazy exception: it is below the individual-chunk ceiling and is not part of Home, Kanban or Planner initial load.

## Mission 6.2 — Assets

The original 1024px Bardo avatar remains a build source rather than a served runtime payload. Build generates fingerprinted 72px and 144px variants and `index.html` exposes intrinsic dimensions plus `srcset`.

Code gate #470 measured:

- 72px avatar: **6.7 KiB**;
- 144px avatar: **23.1 KiB**.

This replaces the former ~821 KiB source image on the Activity network path without changing visual identity.

## Mission 6.3 — Polling, revalidation and payloads

`src/activity/resource-polling.js` owns conditional revalidation for exact Kanban/Planner resource reads. It stores ETags, sends `If-None-Match`, and reuses the locally cached response when the Worker returns `304`.

Legacy 7.5/8 second intervals are adapted without rewriting the large product modules:

- ~5 seconds immediately after user activity;
- ~12 seconds after initial idle;
- ~30 seconds after prolonged idle;
- exponential failure backoff capped at 60 seconds;
- no polling request while the document is hidden;
- prompt revalidation when the Activity becomes visible again.

Successful mutations invalidate the relevant resource cache.

`src/p6-entry.js` provides ETag-aware resource reads. Board polling returns board/tasks without guild member or role directories. Planner polling returns the event graph, boards and only people already referenced by the event (participants, leads, speakers and linked-task assignees), not the full Discord directory.

`src/activity/planner-member-directory.js` searches `/api/member-directory` only when a people field needs new members. Search is debounced, cancellable, capped at 25 and keyboard-accessible. Selecting a remote member bridges it into the existing Planner submit contract. Empty participant/lead/speaker lists can add their first member; this was found and repaired during the adversarial closeout.

Runtime tests prove Board and Planner `200 + ETag -> 304`, lean payloads and continued authorization.

## Mission 6.4 — Privacy-safe observability

`src/lib/observability.js` emits structured JSON through an explicit allowlist. Observable routes are normalized (`/api/documents/:id`, `/api/boards/:id`, `/api/events/:id`, etc.) so entity identifiers are never embedded in route telemetry.

Logged fields are limited to operational metadata such as request ID, normalized route, status, duration, entity type, error code, environment, delivery status and reminder lag. Guild identity is emitted only as a salted hash when `BARDO_LOG_HASH_SALT` is configured.

The logger does not accept document titles/content, task/event titles, arbitrary payload data, raw user IDs or DM recipients.

The Phase 6 Worker emits contracts for:

- `http.request`;
- `auth.denied`;
- `editor.conflict`;
- `export.failure`;
- `api.error` / `worker.exception` / `d1.failure`;
- `reminder.lag` / `cron.tick`.

Notification delivery now emits `notification.delivery` with `sent`, `skipped` or `failed`, notification/entity type and safe error code only. Recipient and entity IDs are deliberately omitted. Post-response telemetry is owned through `ctx.waitUntil` when available.

## Mission 6.5 — Environment isolation

`wrangler.jsonc` now executes `src/p6-entry.js` and has explicit production/staging environments.

Production retains the established resources:

- Worker: `bardo-discord`;
- D1: `bardo-db`;
- R2: `bardo-backups`;
- two existing cron schedules.

Staging is an isolated configuration contract:

- Worker: `bardo-discord-staging`;
- D1 name: `bardo-db-staging`;
- R2: `bardo-backups-staging`;
- no cron triggers by default;
- `ENVIRONMENT=staging`;
- `BARDO_STAGING_RESOURCE_STATE=unprovisioned`.

The staging D1 ID is intentionally a sentinel rather than a real remote database ID. No staging resources were created and no staging Worker was deployed, because remote provisioning/deployment is outside the authorized phase scope. `scripts/check-environment-isolation.js` fails if staging points to production DB/R2 or gains scheduled reminders accidentally.

Generated Wrangler types confirm the Phase 6 entry and distinct staging/production environment types.

## Verification

Code gate CI #470 (`32495874910`) passed on SHA `8e7cfa59d742fe8debe837ff996de570a9c285f5`:

- reproducible `npm ci`;
- Activity build/minification/lazy chunks;
- bundle, image and environment-isolation budgets;
- syntax validation across 66 JavaScript files;
- no new floating-Promise debt (22 pre-existing characterized warnings remain visible);
- Wrangler binding/type generation with `src/p6-entry.js` as main module;
- **72/72 unit tests**;
- **55/55 Worker/runtime tests** with all 15 local migrations;
- Board and Planner ETag/304 + lean-payload runtime tests;
- 3/3 source E2E contracts plus six real-headless-Chrome editor reliability scenarios;
- 3/3 accessibility contracts;
- deterministic visual signatures for Documents, Kanban, Planner and Home unchanged at 390/768/1440;
- Phase 6 performance/environment evidence artifact `9451617780`, digest `sha256:69d086d9225e5409f5d3c1798b6609c8845ccd521ca6cd58152785aa7b4292b3`.

## Adversarial findings repaired during closeout

1. Phase 6 observability existed in source while Wrangler still pointed to `p5-entry.js`. `wrangler.jsonc` now makes `p6-entry.js` the real Worker entry and CI asserts it.
2. The Planner payload was made lean, but an empty people list initially had no checkbox name from which the remote adapter could infer the legacy submit field. The adapter now infers `member`, `lead` or `speaker` from the modal/field context and can add the first person.
3. The first performance report omitted the new Planner directory chunk. The route graph now includes it and the certified Planner budget is 77.2 KiB gzip.
4. Structured route cleaning initially replaced `/` with `_`, making normalized operational routes harder to query. The route sanitizer now preserves safe `/` and `:` separators while still excluding resource IDs/payload text.

## Known debt / intentional boundaries

- Real remote staging resources are **not provisioned** and staging is **not deployed**. The isolation/configuration contract is ready; provisioning requires a separate explicitly authorized action.
- The large PDF parser remains ~486.3 KiB gzip but is lazy and excluded from unrelated initial routes.
- `board.js` and `event.js` remain physically large legacy modules. Phase 6 contains their cost through lazy loading and lean network contracts rather than undertaking another risky product rewrite.
- 22 pre-existing async ownership/empty-catch warnings remain characterized; Phase 6 introduced no new floating-Promise debt.
- `npm ci` continues to report two pre-existing audit findings (1 moderate, 1 high). No dependencies were added by Phase 6; dependency/security release review belongs to Phase 7 hardening.

## Not performed

- no merge to `main`;
- no production or staging deploy;
- no remote D1 migration or staging database creation;
- no R2 bucket creation;
- no Discord command registration;
- no branch deletion.

## Next phase

Phase 7 — QA and release hardening. It owns full cross-phase regression, permission/security re-audit, staging migration validation once provisioning is explicitly authorized, real Discord pilot/smoke evidence, rollback documentation and the final human release gate. Its terminal state is `RELEASE_READY`, not automatic deployment.
