---
target: activity-app/src/planner
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-27T16-57-36Z
slug: activity-app-src-planner
---
# Design Critique: Bardo Planner

Method: dual-agent (Assessment A: UX Design Review · Assessment B: Impeccable Detector Engine)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Time Budget and status chips update reactively; minor gap in live session timer |
| 2 | Match System / Real World | 4/4 | Natural meeting terminology (Agenda, Minuta, Conduce, Presupuesto, Acuerdos) |
| 3 | User Control and Freedom | 3/4 | Clean cancellation and navigation; subpoint deletion lacks immediate undo |
| 4 | Consistency and Standards | 4/4 | High fidelity to HeroUI v3 compound tokens and Bardo Docs baseline |
| 5 | Error Prevention | 3/4 | AlertDialog safeguards destructive block removal; smart duration parsing handles edge formats |
| 6 | Recognition Rather Than Recall | 4/4 | Presets (10m, 15m, 20m, 30m), auto-calculated block totals, visible conductor tags |
| 7 | Flexibility and Efficiency | 3/4 | Fast markdown copy and Discord export; lacks keyboard accelerator for adding next subpoint |
| 8 | Aesthetic and Minimalist Design | 3/4 | Action clutter removed; side-tab borders on captured notes remain an aesthetic artifact |
| 9 | Error Recovery | 3/4 | Clean cancellation restores intact session state; toast notifications confirm operations |
| 10 | Help and Documentation | 3/4 | Contextual empty states and built-in demo fixture provide self-guided discovery |
| **Total** | | **34/40** | **Good** |

---

## Design Specificity Verdict

**LLM Assessment**: The Bardo Planner interface is well tailored to Discord activity sessions, structured around the unified Session object with two complementary views (`Agenda` for live execution, `Minuta` for post-meeting documentation). The recent simplification removed top-level button sprawl.

**Deterministic Scan**: `detect.mjs` identified 2 warnings:
- `side-tab` in `PlannerAgendaView.jsx` (lines 262, 299): `border-l-2` colored left borders on decision and task items.

---

## Overall Impression
Solid architecture and clean component composition matching Bardo Docs. The interface is scan-friendly and responsive. Main opportunities lie in eliminating subtle visual tells (side-tab borders), streamlining keyboard-driven subpoint entry in the editor, and refining mobile timeline density.

---

## What's Working
1. **Unambiguous `Agenda | Minuta` Navigation:** HeroUI `Tabs` provide clear mental models without redundant action buttons.
2. **Predictable Time Budgeting:** Native `ProgressBar` and duration presets (`ToggleButtonGroup`) give immediate feedback on session allocation.
3. **Cohesive Theming:** Unified `--field-background`, `--field-border`, and surface tokens ensure high legibility in dark and light modes.

---

## Priority Issues

- **[P1] Side-tab colored borders in Captured Notes**:
  - *Why it matters*: Left border stripes (`border-l-2 border-success/accent`) create visual clutter and resemble AI-generated template styling.
  - *Fix*: Replace with clean semantic HeroUI `Chip` indicators and subtle soft surface fills.
  - *Suggested command*: `$impeccable polish`

- **[P2] Rapid Subpoint Creation Flow (Alex Persona)**:
  - *Why it matters*: Adding multiple discussion points requires mouse clicks on "+ Añadir Punto" rather than pressing `Enter` on the title field.
  - *Fix*: Add `onKeyDown` handler to automatically append and focus the next subpoint on `Enter`.
  - *Suggested command*: `$impeccable polish`

- **[P3] Mobile Timeline Layout Density**:
  - *Why it matters*: The 84px left column on narrow viewports (<380px) squeezes block card content.
  - *Fix*: Collapse the timestamp into an inline badge above the card on extra-small screens.
  - *Suggested command*: `$impeccable layout`

---

## Persona Red Flags

- **Alex (Power User)**: Adding 5 agenda points requires 5 roundtrips between mouse and keyboard. Needs `Enter` key progression.
- **Jordan (First-Timer)**: May not immediately realize checkboxes in Agenda mode update status live during the meeting without opening the editor.

---

## Minor Observations
- Tooltip/explanation for automatic block duration calculation when points exist.
- Inline undo action on toast when removing a subpoint.

---

## Questions to Consider
- Should pressing `Enter` in a subpoint title automatically instantiate the next subpoint?
- Would replacing the colored left borders on decisions/tasks with soft semantic chips improve alignment with Bardo Docs?
