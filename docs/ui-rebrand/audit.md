# Bardo Discord-native UI — baseline audit

Base: `origin/feat/bardo-unified-experience` at `ae535e7`.

## Product contract

Bardo already works. This mission preserves capabilities, authorization, API contracts, Discord Activity integration, editor reliability, Entity Links, backups, notifications, D1/R2 and domain services. The change is limited to the presentation architecture and user experience.

## Baseline gates

| Gate | Baseline | Notes |
| --- | --- | --- |
| `npm run check` | PASS | Shell 59.6 KiB gzip; Home 65.8; Documents 82.9; Kanban 90.1; Planner 77.2 |
| `npm run test:unit` | PASS | 72/72 |
| `npm run test:worker` | PASS | 55/55 outside the sandbox because Miniflare binds localhost |
| `npm run test:e2e` | PASS | 3 static contracts plus editor queue/conflict/retry/error/dirty browser flows |
| `npm run test:a11y` | PASS | Existing static contracts; no full axe browser run in this base branch |
| `npm run test:visual` | BASELINE DRIFT | Chrome 151 exposed that the old harness cropped a 500 px viewport to a 390 px PNG; the implementation replaces it with true CDP metrics |

## Current presentation inventory

### Primitives

- Buttons, icon buttons, inputs, textareas, selects, checkbox, switch, avatar, badge, chip, spinner, skeleton and divider in `src/activity/ui/primitives.*`.
- Dialog focus management and announcements are custom DOM utilities.
- Several product modules still define separate button/input/modal primitives in embedded CSS.

### Patterns

- Context navigation, save status, entity picker, date/time and duration fields, filters, status menus, app shells, resource cards and backlink lists.
- Dirty-dialog protection, focus restoration, live announcements, responsive modal-to-sheet behavior and terminal horizontal-scroll padding are established UX contracts.
- Remote member search and bounded results are established performance/security contracts.

### Product surfaces

- Home is generated imperatively by `product-integration.js`.
- Document reader/editor combines static HTML with imperative rendering and `contenteditable` behavior.
- Kanban is a 4,000+ line imperative module with embedded CSS, rendering, drag/drop, filters, settings and forms.
- Planner is an imperative module with embedded CSS and modal forms.

## Confirmed visual and UX debt

| Before | After target | Why |
| --- | --- | --- |
| Four overlapping CSS systems and module-local variables | One semantic Bardo token graph projected through Tailwind | Prevents visual drift and duplicated decisions |
| Context navigation clips at 390 px | Compact, horizontally safe navigation with an accessible overflow strategy | Every destination must remain reachable inside Discord |
| Document actions separate unpredictably and content overflows | Stable entity header and bounded editorial measure | Reading is the primary task |
| Modal fields/actions overflow at narrow widths | Base UI dialog/sheet with contained body, sticky actions and focus restoration | Fixes layout and interaction reliability together |
| Kanban toolbar and columns use unrelated spacing systems | Shared toolbar and terminally padded horizontal board track | Keeps the board compact without clipping the last column |
| Planner top navigation and agenda overflow | Container-aware agenda layout and responsive action hierarchy | Discord Activities resize independently of viewport assumptions |
| `transition: all` and duplicated keyframes | Explicit transform/opacity/color transitions with shared timing/easing | Improves interruptibility and avoids layout work |
| Generic empty/loading/error blocks | Product-specific, recoverable feedback states | Makes the product feel complete in non-happy paths |

## UX rules that must survive

1. Dirty forms do not close accidentally.
2. Focus enters dialogs and returns to the trigger.
3. Save state represents the real coordinator state: dirty, saving, saved, error and conflict.
4. Member search remains remote, debounced, cancellable and keyboard operable.
5. Kanban keeps natural horizontal scrolling, keyboard alternatives and terminal padding.
6. Reduced motion preserves functionality and removes spatial movement.
7. Status updates use polite live regions; urgent failures use alerts.
8. Existing authorization boundaries and target validation remain outside React presentation code.

## Baseline evidence

Screenshots are generated in `.artifacts/ui/` for Home, Documents, Kanban and Planner at 390, 768 and 1440 px. They show narrow-width clipping in navigation, document/editor overflow and incomplete containment in Planner/Kanban.
