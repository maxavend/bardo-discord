# Phase 3 — Bardo UI: design system and visual migration

Status: PHASE_READY
Date: 2026-08-20
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0

## Scope completed

Phase 3 executed missions 3.1 through 3.8 across Documents, Kanban and Event Planner without deploying the Activity or changing production data.

### 3.1 Visual audit

`docs/bardo-ui-audit.md` records the conserve / unify / retire matrix, module risks and the 390 / 768 / 1440 viewport contract.

### 3.2 Shared tokens and foundations

`src/activity/ui/` now owns the shared visual contract:

- semantic surfaces, text, borders, accent, success/warning/danger and focus;
- spacing scale 4/8/12/16/20/24/32/40;
- shared radii, control heights and typography;
- safe-area handling;
- motion tokens, `prefers-reduced-motion`, light/dark and forced/high-contrast behavior.

### 3.3 Primitives

Shared primitive contracts cover buttons/icon buttons, inputs/textareas/selects/comboboxes, checkbox/switch, avatar/badge/chip, spinner/skeleton/divider, tooltip/toast, menu/popover and modal/sheet/empty-state surfaces. Existing module markup is progressively adapted rather than rewritten wholesale.

### 3.4 Product patterns

Reusable patterns are formalized for entity/member picking, assignee fields, date/time and duration fields, filters/status menus, save state, destructive confirmation, shell/toolbar, resource cards and backlink-ready surfaces.

### 3.5 Unified navigation

The Activity exposes one contextual navigation model: `Inicio · Documentos · Tableros · Agenda`. `Inicio` remains intentionally unavailable until Phase 4 implements the real Bardo Home instead of introducing a placeholder destination.

### 3.6 Documents migration

Documents uses the shared tokens, navigation, controls, focus behavior and responsive modal geometry while preserving its stronger reading/editing hierarchy.

### 3.7 Kanban migration

Kanban now consumes the shared system for shell/topbar/toolbar, search/filter controls, cards, empty states and modals. Horizontal scrolling preserves terminal padding and scroll-padding, drag receives controlled edge auto-scroll, and task cards retain a keyboard path through the edit/status flow.

### 3.8 Planner migration

Planner consumes the same surface/control system for Agenda/Calendario/Live, hero/timeline/cards/actions and responsive modals. Tabs expose semantic state, Live controls have larger targets, status is not encoded by color alone, task assignees use the remote member directory from Phase 2, and participant lists are searchable/capped rather than assuming unbounded rendering.

## Interaction and accessibility behavior

`src/activity/ui/runtime.js` centralizes dialog focus trapping, focus restoration, Escape/backdrop handling and dirty-form protection. Destructive dismissal of a dirty form requires an explicit user decision. Shared adapters add accessible state to legacy consumers without moving new styling responsibility back into the monoliths.

Reduced motion and high contrast are browser-tested. The visual fixture also verifies visible controls have accessible names and that representative layouts do not introduce document-level horizontal overflow.

## Strangler architecture

Phase 3 deliberately does not perform a risky wholesale rewrite of `board.js` or `event.js`. Historical inline CSS remains in those modules where removal would couple visual migration to product/state behavior. New visual authority lives in `src/activity/ui/`, and no new module-specific design system should be added to the legacy blocks. They can be retired incrementally as consumers move to shared primitives.

## Browser and visual gate

CI now runs real headless Chrome evidence for Documents, Kanban and Planner at 390, 768 and 1440 px plus reduced-motion and forced/high-contrast checks. PNG evidence is uploaded as the `phase3-ui-evidence` artifact.

The first raw PNG baseline exposed a two-pixel LCD/subpixel antialiasing difference between GitHub-hosted runners. This was not accepted as a product regression. The harness was hardened with grayscale/non-LCD text rendering (`--disable-lcd-text` and `--font-render-hinting=none`) before freezing the final baseline.

Final stabilized baseline:

- docs-390: `245eb6bf208fc3f0`
- docs-768: `e96dc5a2d5dcae7a`
- docs-1440: `dadd6a210f290f50`
- kanban-390: `9f079862ceaac26a`
- kanban-768: `5358b4c49acf4f7e`
- kanban-1440: `71cdf514080aa9a8`
- planner-390: `aa12ef0f6abe39d5`
- planner-768: `cd60e4a6d7496a18`
- planner-1440: `c65f902e91056830`

CI #294 generated the stabilized baseline successfully. CI #296 then reproduced the exact frozen hashes and passed the full gate.

## Certified tests

At the Phase 3 code gate:

- build/static checks: PASS;
- unit tests: 63 PASS, 0 FAIL;
- Worker integration tests: 41 PASS, 0 FAIL;
- Phase 3 E2E fixture gate: PASS;
- Phase 3 accessibility fixture gate: PASS;
- visual regression at 390/768/1440: PASS;
- reduced motion: PASS;
- forced/high contrast: PASS.

The browser fixture is representative UI evidence, not a deployed Discord end-to-end environment. No staging or production URL was invented for this phase.

## Branch and PR history

- Phase 3A foundations: `codex/p3-bardo-ui-foundations`, PR #10, fast-forward integrated at `7d0ea142e7d72430f64c8c5e72416a8d56c63001`.
- Phase 3B migration: `codex/p3-bardo-ui-migration`, PR #11, targeting `feat/bardo-unified-experience`.
- Final visual baseline code SHA before this handoff: `63b514bf10a01d51f5928b43f03507522ea64d73`.

## Guardrails preserved

- no merge to `main`;
- no production deploy;
- no remote D1 migration;
- no Discord command registration;
- no historical branch deletion.

## Follow-up debt

- legacy CSS inside `board.js` / `event.js` remains a controlled strangler debt, not the source of new UI rules;
- Phase 0 async-ownership warnings and empty catches remain characterized and unchanged;
- package installation still reports the previously known dependency audit findings, to be triaged in the performance/release hardening phases;
- large PDF/library chunks remain a Phase 6 performance target.

## Next phase

Phase 4 — product integration — may start after this closeout commit passes CI and the Phase 3 head is fast-forwarded into `feat/bardo-unified-experience`.
