# Testing and quality gates

Phase 0 establishes one reproducible verification surface without changing product behavior.

## Commands

- `npm run check` — builds the Activity, syntax-checks all source/scripts, runs the conservative floating-promise ownership check and generates Wrangler binding types into ignored `.wrangler/` output.
- `npm run test:unit` — deterministic Node unit tests for pure/domain/storage helpers.
- `npm run test:worker` — Worker/API characterization plus a real local Cloudflare runtime smoke test.
- `npm run test:e2e` — executable browser-gate placeholder in Phase 0. It is intentionally `todo`; real browser coverage is introduced with the unified UI and final QA phases.
- `npm run test:a11y` — executable accessibility-gate placeholder in Phase 0. It is intentionally `todo`; axe, keyboard, focus, zoom and reduced-motion coverage are introduced in UI/QA phases.
- `npm run analyze` — runs `wrangler check startup` for local bundle/startup profiling.
- `npm test` — builds and runs every Node-discovered test, including characterization/runtime tests and explicit TODO gates.

## Worker integration harness

`test/worker-runtime.test.js` uses the Cloudflare `createTestHarness()` API already shipped by the pinned Wrangler dependency. It:

1. boots the configured `src/event-worker.js` in the Workers runtime;
2. creates local configured bindings;
3. applies the repository's D1 migrations through the `DB` binding;
4. verifies representative migrated tables;
5. sends a request through the complete Worker chain; and
6. dispatches the five-minute scheduled handler locally.

No production/staging database or bucket is contacted by this test.

## Promise ownership check

`scripts/check-floating-promises.js` is intentionally conservative because the project is JavaScript and Phase 0 adds no new lint/type dependencies. It fails on definite discarded Promise expressions and direct one-line calls to locally-declared async functions that have no owner.

Phase 0 also freezes an explicit quota for the pre-existing async ownership debt found by the first CI run: 9 unowned async call sites. Those exact calls emit warnings instead of failing so this characterization phase does not silently change product behavior. Any additional occurrence fails CI, and later phases must remove allowlist entries as they establish the correct `await`, `void`, retry or error-handling semantics.

Owned Promises with empty `.catch(() => {})` handlers are separately surfaced as warnings because the Promise is not floating, but the lost error is still an observability/reliability concern. The Phase 0 baseline contains 10 such warnings.

This is an initial regression guard, not a semantic replacement for TypeScript-aware `no-floating-promises`. If the project adopts a typed lint stack later, that stronger check should replace this script rather than coexist indefinitely.

## Wrangler types

`scripts/generate-worker-types.js` creates the ignored `.wrangler/` output directory and runs Wrangler type generation for configured bindings with runtime-library types disabled. This validates that the D1, R2 and Assets bindings can be represented from the checked-in `wrangler.jsonc` without committing generated files.

## CI

GitHub Actions uses `npm ci` against the committed lockfile and executes each gate separately. Pushes to `main`, `feat/**` and `codex/**`, plus pull requests into `main` or `feat/bardo-unified-experience`, run verification.

Phase 0 adds no deployment, command registration or remote migration job.

The executable E2E and accessibility steps are intentionally TODO-only in Phase 0 and therefore must not be cited as real browser or axe coverage. Their presence establishes stable CI command names so later phases can replace the TODOs without redesigning the workflow.
