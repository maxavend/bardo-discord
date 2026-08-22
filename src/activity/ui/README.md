# Bardo UI foundations

Phase 3 is a strangler design system: existing modules remain functional while shared tokens, primitives and patterns become authoritative.

## Primitive contract

Buttons and IconButtons: default/primary/danger/disabled/loading states; visible focus; press feedback 80–120ms; 44px targets on coarse pointers. Icon-only controls require an accessible name.

Inputs/Textareas/Selects/Comboboxes: default/hover/focus/error/disabled states; labels remain visible; error text is not encoded by color alone. Comboboxes use `role=combobox`, `aria-controls`, `aria-expanded`, listbox/option semantics and Arrow/Enter/Escape/Tab behavior.

Modal/Sheet: `role=dialog`, `aria-modal=true`, labelled heading, focus enters the surface, Tab is trapped, focus returns to the trigger. On mobile the same surface becomes a bottom sheet. A dirty form cannot be dismissed by backdrop or Escape; Cancel/Close requires a second explicit discard action.

Toast/Status: `role=status` + polite live region by default; failures use `role=alert`/assertive. Never announce decorative changes.

Spinner/Skeleton/EmptyState: loading content must not replace a recoverable error with a permanent spinner. Empty states explain the next action.

## Product patterns

`bardo-context-nav`, `bardo-save-status`, MemberPicker, filter bars, destructive confirmation, module topbars and responsive modal/sheet behavior use the same tokens.

## Motion

Press 100ms, micro 140ms, standard 200ms, surface 260ms. `prefers-reduced-motion: reduce` collapses transitions/animations to 1ms and disables smooth scrolling. Bounce is not used for menus/modals/destructive actions.

## Anti-patterns

Do not add new hard-coded module color systems when a semantic token exists. Do not use UUIDs as identity labels. Do not close dirty surfaces silently. Do not render a full guild member directory for an assignment picker. Do not solve horizontal overflow by removing the wrapper's terminal padding.
