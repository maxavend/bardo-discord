---
target: navbar superior (header) web y móvil
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-10-28T17-02-21Z
slug: activity-app-src-app-jsx
---
Method: dual-agent (A: design review · B: detector + browser + technical audit). Target: top navbar on `main` (889e7ae, #36).

## Heuristics: 24/40
1 Status 2 (no location on mobile; "Subiendo…" text only) · 2 Real world 3 ("CV" tile mimics Discord, does nothing) · 3 Control 3 ("Volver" without destination) · 4 Consistency 2 (tabs shift x=272/150/105; Tareas header jumps 11px) · 5 Errors 3 · 6 Recognition 2 (icon-only upload/+ on mobile) · 7 Efficiency 2 (no ⌘K/shortcuts) · 8 Minimalism 2 (beta band; ~190px chrome on 844) · 9 Recovery 3 · 10 Help 2.

## Audit: 13/20
A11y 3 · Perf 3 (double backdrop blur on 96% opaque glass) · Responsive 2 (profile trigger off-canvas 768–860px with long name) · Theming 3 (inactive tab light 4.64:1) · Integrity 2 (glass declared 3x; .doc-topbar overrides .app-host-header; dead CSS; class string repeated 4x).

## Specificity
Partial: punto, Lexend, glass lens, safe-area material are Bardo; composition is stock SaaS header; inside Discord the Bardo mark is replaced by server initials. Detector: CLI 0; overlay 3 (2 false positives: brand punto gradient, sr-only text; bounce easing intentional).

## Priority issues
1. [P1] Profile/Ajustes trigger pushed off-canvas 768–~860px (26px at 768). Fix: flex:none on .topbar-right and .user-menu-trigger. /impeccable adapt
2. [P1] Module tabs move between routes; Tareas drops scrollbar gutter (styles:502). Fix: 3-col grid, centered tabs, reserve gutter. /impeccable layout
3. [P2] Mobile header: no module title on Docs/Reuniones, dead "CV" tile, icon-only actions. Fix: Lexend title with punto, context chip, label "Nuevo" ≥360px. /impeccable adapt
4. [P2] Mobile vertical chrome: beta notice band 46–63px. Fix: Beta chip + popover. /impeccable distill
5. [P2] A11y: focusable 1×1 file input (App.jsx:702, :798), 32px reader touch targets (data-slot selector misses Base UI triggers), safe-area strip unblurred (backdrop root). /impeccable harden

## Personas
Power user: no ⌘K, tabs jump, 2-line identity wastes left third. First-timer phone: dead CV tile, unlabeled circles, no title, beta pushes content, 10.5px bottom labels. Low vision/keyboard: invisible focus stop, truncated name without title, 28px tablet tabs.

## Minor
Docs vs Documentos naming; 12px tabs vs 14px buttons, dead text-xs; doc title never reaches header; share icon ambiguous; weak avatar fallback; header re-renders per search keystroke.

## Questions
Repeat server/channel or carry Bardo + module? Collapsing large title on mobile? One global "+" instead of per-module primary?

## Direction proposed
"Renglón" navbar: centered fixed tabs on a hairline, sliding punto indicator, compact-on-scroll with Lexend title reveal, "#canal ▾" context chip, Beta chip; mobile 44px bar + collapsing large title; ⌘K later.
