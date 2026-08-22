# Discord-native UI implementation handoff

## Result

Bardo now has one authoritative Discord-native presentation layer while preserving its existing Worker, D1/R2, authorization, SDK integration, API contracts and product behavior. React 19 owns the shared shell, Home and new interaction islands; Tailwind CSS v4 consumes Bardo semantic tokens; Base UI owns mature accessible behavior. shadcn remains a local source convention, not the visual identity.

## Architecture delivered

- `app/`: React bootstrap and route-aware mounting.
- `components/ui/`: locally owned Base UI wrappers for Button, Dialog, DropdownMenu, Popover, Tooltip, Select, Tabs, ScrollArea, Checkbox, Switch and inputs.
- `components/bardo/`: product-language components for shell/navigation, empty states and remote member selection.
- `features/`: authoritative Home and lazy document interaction flows.
- `styles/`: semantic tokens, Tailwind projection and the Discord-native visual layer.
- Existing `app.js`, `board.js` and `event.js` remain behavior controllers for Reader/Editor, Kanban and Planner. Migration adapters provide shared semantics and the new theme is visually authoritative.

## Legacy removed or superseded

- Imperative Home rendering in `product-integration.js`.
- Custom document-to-task modal, toast and duplicate focus handling.
- Multiple generated CSS entry files; the Activity now serves one Tailwind-backed semantic stylesheet.
- The 1024 px source avatar from the shipped Activity; resized 72 px and 144 px assets are emitted instead.
- The old visual harness's false 390 px screenshots, caused by Chrome's minimum window width.

## Legacy intentionally retained

- Reader/Editor controller and save coordinator: they encode proven parsing, pagination, conflict, history and dirty-state behavior.
- Kanban controller: it contains mature CRUD, drag/drop, filters, keyboard alternatives and board settings orchestration.
- Planner controller: it contains agenda/calendar/live behavior, participant search and event editing orchestration.
- Module-local CSS remains as compatibility input where those controllers depend on structural selectors. It may not introduce new visual tokens; `theme.css` and `discord-native.css` override the presentation.

This is a strangler boundary, not a second design system. Future behavioral migrations can replace one controller at a time without changing the visual contract.

## Product changes

| Module | Visual and UX result |
| --- | --- |
| Shared shell | Compact contextual navigation, safe-area support, skip link, stable selected/hover/focus states and narrow-container overflow behavior. |
| Home | React-owned entry surface with useful resource groups, compact quick actions and explicit loading, empty, error and ready states. |
| Documents / Reader | Quieter document cards, editorial reading measure, contained actions and links, responsive overflow and lazy task creation. |
| Editor | Contained toolbar, compact operational density and clear dirty, saving, saved, error, conflict, retry and history states. |
| Kanban | Aligned compact columns/cards, restrained metadata, natural horizontal scrolling and preserved initial/terminal padding. |
| Planner | Scannable temporal hierarchy, compact agenda blocks, integrated participants and responsive action hierarchy. |
| Dialogs / forms | Base UI focus trap/restoration and keyboard behavior, desktop dialog to constrained sheet, dirty-close protection and consistent fields/actions. |
| MemberPicker | Remote, debounced, cancellable search with bounded results, avatar/context and Base UI combobox keyboard semantics. |
| Feedback | Themed Sonner feedback, concise Spanish microcopy, recoverable errors and Undo where the existing API permits it. |

## Performance

All figures are gzip route costs reported by the existing Phase 6 budget gate.

| Route | Baseline | Final | Budget |
| --- | ---: | ---: | ---: |
| Critical shell | 59.6 KiB | 66.5 KiB | 80 KiB |
| Home | 65.8 KiB | 198.4 KiB | 250 KiB |
| Documents | 82.9 KiB | 214.3 KiB | 250 KiB |
| Kanban | 90.1 KiB | 210.7 KiB | 250 KiB |
| Planner | 77.2 KiB | 197.8 KiB | 250 KiB |

Home does not load Kanban or Planner. The document dialog/member picker loads after interaction, and PDF/DOCX parsing remains lazy.

## Verification

| Gate | Final result |
| --- | --- |
| `npm run check` | PASS; bundles, environment isolation, syntax, promise ownership and Worker types |
| `npm run test:unit` | PASS — 77/77 |
| `npm run test:worker` | PASS — 55/55 |
| `npm run test:e2e` | PASS — phase contracts plus editor queue/conflict/retry/error/dirty browser flows |
| `npm run test:a11y` | PASS — 3/3 |
| `npm run test:visual` | PASS — Home, Documents, Kanban and Planner at 390, 768 and 1440 px; reduced motion and forced colors also checked |

The Worker suite can emit a benign asynchronous local R2 socket warning while still completing 55/55. Wrangler can also report that its user-level debug-log directory is unavailable in a sandbox; type generation itself succeeds.

## Remaining debt and review risks

- Run a human review inside the real Discord Desktop/Web Activity frame; fixture evidence cannot reproduce every host chrome and SDK resize sequence.
- The retained Kanban and Planner controllers are large. Their eventual React migration should be behavioral-only and preserve this design contract.
- Structural module CSS can be retired incrementally after each retained controller is replaced.
- Visual baselines are deterministic layout signatures plus PNG evidence; a future pixel-diff service would provide stronger cross-platform regression detection.
- `npm audit` reports one moderate direct advisory on `discord.js@14.23.2` and one high transitive advisory on `undici@6.21.3`. The suggested resolution upgrades Discord runtime dependencies (`discord.js` 14.27 and `undici` 6.28), so it is intentionally left for a separate compatibility-tested security change rather than folded into the UI branch.

## Local review

```bash
git switch feat/bardo-discord-native-ui
npm ci
npm run check
npm run dev
```

No deployment, command registration, remote D1 migration or remote staging operation was performed.
