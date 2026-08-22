# Bardo UI audit — Phase 3 baseline

Date: 2026-08-20
Scope: Documents, Kanban and Event Planner Activity surfaces.

## Executive finding

Bardo already has a recognizable dark Discord-adjacent identity, compact controls and a consistent accent, but the three modules currently implement that identity independently. The main structural risk is not color choice: it is duplicated UI behavior and layout rules. `styles.css` owns Documents, while Kanban and Planner inject large CSS strings from `board.js` and `event.js`. That makes spacing, control height, focus, modal behavior, responsive breakpoints and motion drift by module.

## Conserve / unify / retire

### Conserve
- Bardo avatar and name.
- Dark neutral surfaces with blur used sparingly.
- Blurple accent for primary actions.
- Compact, information-dense productivity layout.
- Existing document reading hierarchy.
- Kanban column color accents and task priority semantics.
- Planner Agenda / Calendario / Live mental model.

### Unify
- Semantic colors and contrast behavior.
- Spacing scale: 4/8/12/16/20/24/32/40.
- Control radii, heights and focus rings.
- Buttons, icon buttons, inputs, selects, comboboxes and toasts.
- Modal/sheet focus behavior and mobile presentation.
- Loading, empty, error, retry and save states.
- Topbar/shell geometry and safe-area handling.
- Motion durations and reduced-motion behavior.
- Horizontal overflow contract: wrapper padding must remain visually present at both ends.

### Retire
- Hover scale on Bardo avatars.
- Module-specific hard-coded color systems when a semantic token exists.
- Artificial minimum column heights used only to equalize appearance.
- Full guild-directory payloads as a UI dependency.
- Silent error swallowing for interactive save flows.
- Decorative bounce/pulse motion in menus and destructive controls.

## Baseline risks by module

### Documents
- Strongest typography/readability baseline, but actions and editor toolbar use a separate control system.
- Sticky toolbar can visually compete with content on narrow screens.
- Save state should use one shared status pattern rather than ad-hoc text.

### Kanban
- `board.js` is a large UI/CSS/state/API/render monolith.
- Horizontal scrolling needs explicit terminal space so right padding remains visible after the final column.
- Desktop drag, touch drag and keyboard activation are separate paths; motion must not create release jumps.
- Board configuration and task assignment use overlapping but historically different member-selection logic.

### Planner
- CSS is injected from `event.js`, duplicating surface/input/modal/button definitions.
- Agenda timeline is good candidate for tabular numerics.
- Live controls need larger targets and state must never be encoded by color alone.
- Mobile modal should behave as a bottom sheet.

## Viewport contract

Phase 3 validates representative Documents, Kanban and Planner surfaces at 390px, 768px and 1440px widths. The automated browser fixture checks horizontal overflow, visible dialog semantics and accessibility labels, and writes PNG evidence in CI. The real Activity remains undeployed; no production/staging environment is invented for this phase.

## Target

One Bardo design language, not three skins: shared tokens and primitives establish the contract; module adapters preserve existing product identity while legacy monoliths are progressively strangled rather than rewritten in a single risky change.
