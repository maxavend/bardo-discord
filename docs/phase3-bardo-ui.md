# Phase 3 — Bardo UI: design system and visual migration

Status: PHASE_READY
Date: 2026-08-20
Plan: Plan maestro de implementación agéntica — Bardo para Discord v1.0

## Scope completed

Phase 3 executed missions 3.1 through 3.8 across Documents, Kanban and Event Planner without deploying the Activity or changing production data.

### 3.1 Visual audit

`docs/bardo-ui-audit.md` records the conserve / unify / retire matrix, module risks and the 390 / 768 / 1440 viewport contract.

### 3.2 Shared tokens and foundations

`src/activity/ui/` owns the shared visual contract: semantic surfaces/text/borders/accent/status/focus colors, spacing 4/8/12/16/20/24/32/40, shared radii/control heights/typography, safe-area handling, motion tokens, reduced motion, light/dark and high-contrast behavior.

### 3.3 Primitives

Shared primitive contracts cover buttons/icon buttons, inputs/textareas/selects/comboboxes, checkbox/switch, avatar/badge/chip, spinner/skeleton/divider, tooltip/toast, menu/popover and modal/sheet/empty-state surfaces. Existing module markup is progressively adapted rather than rewritten wholesale.

### 3.4 Product patterns

Reusable patterns are formalized for entity/member picking, assignee fields, date/time and duration fields, filters/status menus, save state, destructive confirmation, shell/toolbar, resource cards and backlink-ready surfaces.

### 3.5 Unified navigation

The Activity exposes one contextual navigation model: `Inicio · Documentos · Tableros · Agenda`. `Inicio` remains intentionally unavailable until Phase 4 implements the real Bardo Home instead of introducing a placeholder destination.

### 3.6 Documents migration

Documents uses the shared tokens, navigation, controls, focus behavior and responsive modal geometry while preserving its stronger reading/editing hierarchy.

### 3.7 Kanban migration

Kanban consumes the shared system for shell/topbar/toolbar, search/filter controls, cards, empty states and modals. Horizontal scrolling preserves terminal padding and scroll-padding, drag receives controlled edge auto-scroll, and task cards retain a keyboard path through the edit/status flow.

### 3.8 Planner migration

Planner consumes the same surface/control system for Agenda/Calendario/Live, hero/timeline/cards/actions and responsive modals. Tabs expose semantic state, Live controls have larger targets, status is not encoded by color alone, task assignees use the remote member directory from Phase 2, and participant lists are searchable/capped rather than assuming unbounded rendering.

## Interaction and accessibility behavior

`src/activity/ui/runtime.js` centralizes dialog focus trapping, focus restoration, Escape/backdrop handling and dirty-form protection. Destructive dismissal of a dirty form requires an explicit user decision. Shared adapters add accessible state to legacy consumers without moving new styling responsibility back into the monoliths.

Reduced motion and high contrast are browser-tested. The visual fixture also verifies visible controls have accessible names and representative layouts do not introduce document-level horizontal overflow.

## Strangler architecture

Phase 3 deliberately does not perform a risky wholesale rewrite of `board.js` or `event.js`. Historical inline CSS remains where removal would couple visual migration to product/state behavior. New visual authority lives in `src/activity/ui/`, and no new module-specific design system should be added to the legacy blocks. They can be retired incrementally as consumers move to shared primitives.

## Browser and visual gate

CI runs real headless Chrome coverage for Documents, Kanban and Planner at 390, 768 and 1440 px, plus reduced-motion and forced/high-contrast checks. PNG screenshots are always uploaded as the `phase3-ui-evidence` artifact for human review.

Raw PNG hashes are intentionally **not** the regression pass/fail contract. During closeout they exposed two kinds of runner noise despite unchanged product geometry: a two-pixel LCD/subpixel antialiasing difference and, later, a Planner modal screenshot captured with a different transient focus rendering on the integration PR. Those failures were characterized rather than accepted as product regressions.

The final CI gate therefore uses browser-computed **layout/style signatures**. The fixture deterministically focuses the representative modal control, captures stable geometry and selected computed-style properties for the module surfaces, rounds geometry to half-pixel precision, and hashes that structured snapshot. PNG hashes remain informational only.

Final deterministic signature baseline:

- docs-390: `2ae61c96`
- docs-768: `2c4dc3ca`
- docs-1440: `9524e007`
- kanban-390: `7d94156b`
- kanban-768: `748e4556`
- kanban-1440: `93980e83`
- planner-390: `93780bd7`
- planner-768: `63e56cb2`
- planner-1440: `82b05980`

CI #313 generated this deterministic signature baseline successfully. CI #315 reproduced the frozen signatures while retaining the PNG evidence path.

## Certified tests

At the Phase 3 gate:

- build/static checks: PASS;
- unit tests: 63 PASS, 0 FAIL;
- Worker integration tests: 41 PASS, 0 FAIL;
- Phase 3 E2E fixture gate: PASS;
- Phase 3 accessibility fixture gate: PASS;
- layout/style visual regression at 390/768/1440: PASS;
- PNG evidence generation: PASS;
- reduced motion: PASS;
- forced/high contrast: PASS.

The browser fixture is representative UI evidence, not a deployed Discord end-to-end environment. No staging or production URL was invented for this phase.

## Branch and PR history

- Phase 3A foundations: `codex/p3-bardo-ui-foundations`, PR #10, fast-forward integrated at `7d0ea142e7d72430f64c8c5e72416a8d56c63001`.
- Phase 3B migration: `codex/p3-bardo-ui-migration`, PR #11, fast-forward integrated at `728c07a470dd8c416fcd08b99d4f6cdbf9b9a45f`.
- Phase 3 visual-gate hardening: `codex/p3-visual-gate-fix`, PR #12, replacing flaky raw-pixel gating with deterministic layout/style signatures while retaining screenshots as evidence.

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

Phase 4 — product integration — is unlocked once the Phase 3 visual-gate hardening head is fast-forwarded into `feat/bardo-unified-experience` and the master integration PR reproduces the full green gate.
