# PHASE_READY — Phase 2: Domain, time, members, commands and notifications

Date: 2026-08-20
Base: `feat/bardo-unified-experience` @ `cac810e90f35c37acc3ba840bdcf369eb8addfd4`
Phase branch: `codex/p2-domain-time-notifications`
Phase PR: #9 (draft)
Code gate SHA: `057e1ddb324f56be228098f62dc1182416fb44a1`

## Result

Phase 2 unifies the rules used by Discord commands, Kanban Activity and Event Planner without replacing the entire legacy Worker/UI at once. A strangler orchestration layer owns new shared contracts and delegates untouched paths to the Phase 1-secured Worker chain.

## Mission 2.1 — Shared domain services

Added:

- `DocumentService`
- `TaskService`
- `EventService`
- `NotificationService`
- `MemberDirectoryService`

Task creation from `/tarea`, Kanban `POST /api/boards/:id/tasks` and Planner `POST /api/events/:id/tasks` passes through `TaskService`. Planner adds the event backlink only after the common task service succeeds.

Event create/update/participant replacement passes through `EventService`. Participant replacement, including participant persistence during event creation, uses the Phase 1 atomic D1 batch contract.

## Mission 2.2 — Unified temporal parser

`src/lib/time.js` implements:

- `parseDuration()`
- `parseClock()`
- `parseLocalDate()`
- `localDateTimeToInstant()`
- `resolveTimezone()`
- `formatRelativeTime()`

Covered product inputs:

- duration: `60m`, `90m`, `3h`, `3:30h`, `3h30m`, `3h 30m`, plain `90`;
- time: `15`, `15:30`, `3pm`, `3:30pm`, `3:30 pm`, `12 am`, `12 pm`.

Invalid minutes, negative/over-limit durations, nonexistent calendar dates and nonexistent DST wall times fail with actionable errors. Timezone precedence is event → user → guild → explicit fallback. The new service does not hard-code Santiago as the global fallback.

## Mission 2.3 — Member Directory + MemberPicker

Backend:

- authorized `/api/member-directory` endpoint;
- query begins after two characters;
- Discord member-search endpoint rather than a 1,000-member board poll;
- 25 results by default, hard cap 50;
- 20-second short cache by guild/query;
- bots excluded by default;
- unified member model with Discord ID, display name, username, avatar, role IDs/label and source.

Frontend task MemberPicker:

- combobox/listbox semantics;
- 200 ms debounce;
- `AbortController` for stale requests;
- Arrow Up/Down, Enter, Escape and Tab;
- loading, empty and error states;
- real Discord ID stored separately from display name;
- assigning a task no longer needs to turn the assignee into a configured board member.

The normal Kanban board payload remains free of the full guild directory. The broad visual migration of Planner/board-settings person fields into the eventual shared Bardo UI picker remains a Phase 3 consumer migration; the scalable directory and reusable behavior contract are established here.

## Mission 2.4 — Discord autocomplete and guided modal

Prepared command definitions and handlers for:

- `/documento abrir documento:<autocomplete>`
- `/tablero abrir tablero:<autocomplete>`
- `/tarea tablero:<autocomplete> estado:<autocomplete> responsable:<User>`
- `/evento abrir evento:<autocomplete>`
- `/evento duplicar evento:<autocomplete>`
- `/evento crear` fast path or guided native modal when name/date/time are missing.

Autocomplete is guild-scoped and capped at 25. Configurable board columns use autocomplete rather than fixed choices. Priority remains a fixed enum.

The command registration source was updated but not executed. `/bardo` Home remains deferred to Phase 4 because that phase owns the actual Home product surface; no placeholder Home was introduced.

## Mission 2.5 — Notifications and DMs

Forward-only migration: `0011_create_notifications.sql`.

Tables:

- `notification_preferences`
- `notification_deliveries`

Implemented types:

- `task.assigned`
- `task.reassigned`
- `task.due_soon`
- `event.invited`
- `event.updated`
- `event.cancelled`
- `event.reminder`
- `event.minutes_ready`

Delivery behavior:

- unique `dedupe_key` per relevant entity/user/version;
- explicit pending/sending/sent/failed/skipped states;
- bounded retries for transient 429/5xx-style failures;
- closed/private DMs become skipped rather than breaking the originating action;
- request-triggered network delivery is owned by `ctx.waitUntil()`;
- DM content is generated from current entity data and is not stored wholesale in the delivery table;
- preference-disabled notifications are recorded as skipped;
- event reminders use narrow scheduler windows and custom reminder offsets when configured;
- minutes-ready delivery is post-response and deduplicated by event/user/minute-document ID.

## Verification

Green Phase 2 CI checkpoints:

- #246 / `32432409381` — connected strangler Worker, services and UI wiring.
- #248 / `32432532614` — Phase 2 time/member/notification tests.
- #252 / `32432888675` — canonical session signature hardening and notification gates.
- #254 / `32433123804` — final code gate including atomic event participant creation.

The final documentation closeout commit must pass one additional CI run before fast-forward integration.

Real checks include:

- reproducible `npm ci`;
- Activity build and syntax checks;
- floating-promise regression gate;
- Wrangler binding type generation;
- unit tests;
- Worker integration tests;
- local D1 migrations through `0011`;
- Cloudflare runtime scheduled handler smoke.

The existing E2E/a11y scripts are executable TODO gates from Phase 0, not browser/axe certification.

## Rollback

Phase 2 is additive and can be rolled back by reverting its commits and using the Phase 1 Worker entry point. `0011_create_notifications.sql` is forward-only; after any future remote application, rollback would require a compensating migration rather than editing the file. No remote migration has been run as part of this phase.

## Guardrails preserved

- no merge to `main`;
- no production deployment;
- no remote migration;
- no Discord command registration;
- no historical branch deletion.

## Next phase

Phase 3 — Bardo UI: design system and visual migration.
