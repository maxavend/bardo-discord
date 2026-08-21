# Phase 5 — Editor reliability and collaboration handoff

Status: PHASE_READY
Code gate SHA: `27a1911f92954a16e0053d1a9fafe277e5b240f1`
Code gate CI: #405 / `32486915409`
Phase branch: `codex/p5-editor-reliability`
Integration target: `feat/bardo-unified-experience`

## Product outcome

Phase 5 removes silent overwrite/loss paths from the document editor. Editing now has an explicit server-confirmed version contract, a single-flight save coordinator, recoverable local drafts, conflict/error UX and bounded revision history.

## Delivered contracts

### Optimistic document versioning

Migration `0015_document_version_history.sql` adds document version metadata and bounded revision history. Document GET responses expose the current version and ETag. Editor PATCH requires `If-Match` and/or `expectedVersion`; missing preconditions return `428`, while stale editors receive `409 DOCUMENT_VERSION_CONFLICT` with minimal current-version metadata rather than the other editor's document body.

The versioned update path uses a conditional D1 write against the expected version. Two editing sessions starting from the same base therefore cannot silently overwrite each other.

Legacy/system document rewrites also advance the version through the migration trigger, so non-editor writes cannot bypass the concurrency contract.

### Save state machine

`EditorSaveCoordinator` owns the state progression `clean → dirty → saving → saved`, with explicit `error` and `conflict` states. Only one network write is in flight. Later edits are queued/coalesced onto the next known version, and an unchanged confirmed payload is deduplicated.

The UI never claims `saved` until the server confirms the write.

### Safe exit and local recovery

The Activity wrapper protects leaving edit mode while state is dirty/saving/error/conflict. A dirty exit triggers the real editor Ctrl/Cmd+S path on `#document-body`, subscribes before dispatching the save and waits for a terminal state. If more edits arrive during an in-flight save, the exit path waits for that save and then flushes the remaining dirty state before leaving.

Network/error/conflict states keep the user in the document. `beforeunload` warns for unsafe states and `pagehide` writes a bounded local draft rather than pretending a network save succeeded.

Local drafts use a document-scoped key and expire after seven days. Recovery is explicit: discard or recover for review.

### Conflict and failure UX

Failure and conflict surfaces are accessible alerts. Users can copy their own local changes. Network failures expose retry behavior; version conflicts offer reloading the current server version rather than silently forcing an automatic merge.

### Bounded history and restore

Document history is authorized with the same document access guard. The revision ledger keeps at most 30 historical versions. History exposes version, author/time/reason when available. Restoring a revision creates a new current version and preserves prior history instead of rewinding/deleting the ledger.

### Long-document persistence

The adversarial pass found that the initial versioned writer generated `pages` with `.slice(0, 1)`. Because `documents.pages` is persisted product data, this could degrade long documents after an edit. The slice was removed; the runtime gate now edits a multi-page document and proves that multiple generated pages and the final section survive persistence.

## Verification

CI #405 (`32486915409`) passed on code gate SHA `27a1911f92954a16e0053d1a9fafe277e5b240f1`:

- Activity build/static/syntax checks;
- no new floating-promise regressions;
- 67/67 unit tests;
- 53/53 Worker/runtime tests with all 15 local D1 migrations;
- optimistic-concurrency tests for two simultaneous editor sessions;
- required-precondition, restore/history and legacy-writer versioning tests;
- long-document pagination preservation test;
- browser E2E gate;
- accessibility gate;
- deterministic Phase 3/4 visual signatures and PNG evidence.

The browser editor gate now covers six scenarios:

- `queue` — coalesced writes remain single-flight;
- `conflict` — stale base transitions to conflict;
- `retry` — transient failure retries from the same known version;
- `ui-error` — the real reliability UI renders one bounded failure surface without recursive timers;
- `ui-conflict` — the real conflict UI exposes safe recovery actions;
- `exit-dirty` — clicking Guardar/Salir while dirty triggers a real save, waits for server confirmation and exits once.

## Adversarial findings repaired during closeout

1. Error/conflict rendering recursively scheduled `renderState()` inside a zero-delay timer, creating an unbounded timer loop whenever a save failed. It now schedules only the issue-panel render.
2. Dirty exit dispatched Ctrl+S on `document`, while the actual editor shortcut handler is attached to `#document-body`. The manual save now targets the real handler.
3. Dirty exit called `waitForSettled()` before asynchronous Markdown serialization had transitioned the coordinator to `saving`, so it could immediately observe `dirty` and refuse to complete the exit. The exit flow now subscribes before triggering save and waits through dirty/saving to a terminal state.
4. Versioned edits initially truncated persisted `pages` to one generated page. Full pagination is now retained and regression-tested with a long document.

## Migration history addition

- `0015_document_version_history.sql`

The migration has only been exercised against local CI D1. No remote migration was applied.

## Runtime

- Worker entry after this phase: `src/p5-entry.js`.
- Phase 5 delegates non-editor behavior through the existing Phase 4 → Phase 2/security strangler stack.
- Editor coordination: `src/activity/editor-save-machine.js`.
- Editor reliability/recovery UI: `src/activity/editor-reliability.js`.
- Version/history service: `src/services/document-versioning.js`.

## Not performed

- no merge to `main`;
- no production/staging deployment;
- no remote D1 migration;
- no Discord command registration;
- no branch deletion.

## Next phase

Phase 6 owns performance and observability: reduce expensive/static bundle work, improve runtime diagnostics and cost visibility, and turn characterized performance debt into measurable budgets without weakening the reliability contracts certified here.
