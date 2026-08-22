# Presentation architecture decision

## Single ownership chain

```text
Base UI behavior
  → components/ui local source
  → components/bardo product language
  → features product-specific composition
  → existing API/domain contracts
```

- `@base-ui/react` owns accessible behavior for overlays, menus, popovers, tooltips, select-like controls and tabs.
- shadcn is scaffolding and a component distribution convention, not Bardo's visual identity.
- Bardo CSS custom properties are the semantic source of truth.
- Tailwind v4 exposes those decisions as utilities; it does not create a parallel palette.
- React 19 owns the shared shell, Home and newly migrated interaction islands.
- The Reader/Editor, Kanban and Planner retain their proven imperative behavior controllers in this branch. Their visual authority comes from the semantic theme and migration adapters; they may not introduce new visual tokens or primitives.
- Base UI dialogs are explicitly excluded from the legacy focus/dirty adapter so focus trapping and restoration are not implemented twice.

## Build decisions

- Keep esbuild and route-level dynamic imports.
- Add React/JSX without introducing a repository-wide TypeScript or Vite migration.
- Generate Tailwind CSS as a build artifact before esbuild bundles the Activity.
- Update bundle reporting when feature paths move so budgets cannot silently omit new chunks.
- The visual harness uses CDP device metrics. Chrome's 500 px minimum headless window no longer produces cropped “390 px” screenshots.

## Performance budgets

- Critical shell: 80 KiB gzip.
- Initial product route: 250 KiB gzip.
- Unjustified chunk: 500 KiB gzip.
- Heavy document parsing remains lazy and excluded from Home, Kanban and Planner.

## Responsive model

- The Activity root establishes a size container.
- Components respond to their container first and use viewport/safe-area signals only where necessary.
- Required evidence: 390, 768, 1024 and 1440 px plus a short-height pass.
- Dialog becomes sheet when width or usable height cannot contain it.

## Motion model

- Press: 100 ms; micro: 140 ms; standard: 180–220 ms; surfaces: 240–280 ms.
- Frequent and keyboard-initiated operations remain instant.
- Entrances use strong ease-out; movement uses ease-in-out; no arbitrary bounce.
- Only transform and opacity are used for spatial motion unless a measured exception is documented.
