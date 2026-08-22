# Phase 4 — Product integration handoff

Status: PHASE_READY
Certified implementation SHA: `974836ff1fa7d1b37541962e9597fb4682eed438`
Certified CI: #374 / `32445761578`
Phase branch: `codex/p4-product-integration`
Integration target: `feat/bardo-unified-experience`

## Product outcome

Phase 4 turns the previously unified UI into one connected Bardo product. Home, Documents, Kanban and Planner can now move between real entities while keeping authorization bound to verified Discord identity and guild context.

## Delivered contracts

### Bardo Home

`/bardo` is defined in source as the native fast path for launching the Home Activity. Home exposes four bounded, independently loading sections: upcoming events, active tasks assigned to the current user, recent documents and boards. A section failure does not block the rest of Home.

The command definition was not registered remotely during this phase.

### Entity graph

Migration `0012_create_entity_links.sql` adds a generic graph with source type/id, target type/id, relation, guild and creator. `EntityLinkService` validates that both ends belong to the same verified guild and makes repeated link creation idempotent.

Relationships used in Phase 4 include `event_has_task`, `event_has_minutes`, `task_from_document` and `task_references_document`.

### Durable document guild access

A Phase 4 adversarial test found that mutable Activity context alone was insufficient for returning to a document after navigating to another module. Migration `0014_document_guild_access.sql` therefore persists a document↔guild grant only after OAuth identity plus real Discord guild-membership verification. Opaque document IDs remain identifiers, never authorization.

### Document → Task

A document can create a task through the shared task service with a board, optional Discord assignee, optional due date and a bounded source excerpt. The flow creates a backlink and offers undo only while the task remains unchanged, preventing destructive rollback after later edits.

Migration `0013_add_task_due_at.sql` provides the optional due date used by this flow and Home ordering.

### Event → Task → Minutes

Tasks created from Planner retain event, block and item origin in the existing event-task relationship and receive a generic event→task entity link. Generated minutes gain one idempotent linked-task section. Regenerating minutes refreshes task state instead of appending duplicate task sections, and task↔minute entity links preserve navigation.

### Secure navigation

Cross-module navigation validates the destination against the currently verified guild before changing the Activity target. Task deep links resolve through their board. Personal/guildless sessions do not gain same-guild lateral navigation implicitly.

## Verification

CI #374 (`32445761578`) passed:

- Activity build and syntax/static checks;
- no new floating-promise regressions;
- 63/63 unit tests;
- 47/47 Worker/runtime tests with all 14 local D1 migrations;
- explicit Phase 4 E2E contract tests;
- explicit Phase 4 accessibility contract tests;
- headless-Chrome visual reproduction at 390, 768 and 1440 px;
- reduced motion and forced/high contrast.

Phase 3 signatures were reproduced unchanged. New frozen Home signatures are:

- 390: `781df15f`
- 768: `71327b9d`
- 1440: `5de9f1c2`

PNG screenshots remain human-review evidence; deterministic browser-computed layout/style signatures are the pass/fail regression contract.

## Adversarial findings repaired during the phase

1. Home initially introduced five unowned async calls; the floating-promise gate rejected them and ownership was fixed.
2. Document guild association initially disappeared after cross-module context switches; durable OAuth-derived grants replaced that fragile assumption.
3. Invalid due dates could have been discovered after task creation; validation moved before persistence.
4. Early deep-link routing targeted a nonexistent `/bardo` path; navigation now uses the actual Activity route.
5. Minutes status tests initially asserted `200` while the established create/regenerate contract returns `201`; the test was aligned without changing working API semantics.
6. The first explicit Home a11y test asserted serialized attribute names instead of the fixture's real `dataset` contract; the assertion was repaired and the full frozen visual gate reproduced afterward.

## Not performed

- no merge to `main`;
- no production/staging deployment;
- no remote D1 migration;
- no Discord command registration;
- no branch deletion.

## Next phase

Phase 5 owns document-editor reliability: optimistic versioning, one-save-at-a-time state management, conflict/retry UX, recoverable local drafts and bounded revision history so two editing sessions cannot silently overwrite each other.
