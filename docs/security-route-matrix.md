# Security Route Matrix — Phase 0 Characterization

Baseline: `b11883e170c051a0879cda2667c4745174bcbae1`
Status: characterization only — **this document describes current behavior, not desired security policy**.

## Fixture vocabulary

Every private route must eventually be exercised against the following identities/context fixtures:

- `VALID_INSTANCE`: existing Activity instance tied to the requested resource and guild.
- `MISSING_INSTANCE`: no `x-bardo-instance-id`.
- `UNKNOWN_INSTANCE`: syntactically valid instance id not present in D1.
- `OTHER_RESOURCE_INSTANCE`: valid instance tied to a different document/board/event.
- `OTHER_GUILD_INSTANCE`: valid instance whose resolved entity belongs to another guild.
- `RESOURCE_MISSING`: requested resource does not exist.
- `USER_WITHOUT_PERMISSION`: real guild member without the permission required for the action.
- `UUID_ONLY`: caller knows a valid private resource UUID but has no authorized Activity context.

Phase 0 explicitly records where `USER_WITHOUT_PERMISSION` cannot yet be tested because the current architecture does not resolve actor permissions for Activity API requests. Phase 1 must convert that gap into a real authorization contract.

## Documents

| Route | Method | Current identity check | Current cross-resource/guild check | Current UUID-only result | Desired negative tests in Phase 1 | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/documents/:id` | GET | None | None | `200` when document exists | missing, unknown, other-resource, other-guild, no-permission | **UNSAFE / TEMP DEBT** |
| `/api/documents/:id` | PATCH | None | None | write succeeds when payload is valid | missing, unknown, other-resource, other-guild, no-permission | **UNSAFE / TEMP DEBT** |
| `/api/documents/:id/export` | GET | None | None | download succeeds | missing, unknown, other-resource, other-guild, no-permission, expired export token | **UNSAFE / TEMP DEBT** |
| `/api/documents/:id/download` | GET | None | None | download succeeds | same as export | **UNSAFE / TEMP DEBT** |
| `/api/documents/:id/source` | GET | `verifyActivityDocumentAccess` | exact document match in `activity_contexts` | `401` without instance | unknown, other-resource, other-guild, no-permission | Partial guard |
| `/api/documents/:id/normalize` | POST | `verifyActivityDocumentAccess` | exact document match in `activity_contexts` | `401` without instance | unknown, other-resource, other-guild, no-permission | Partial guard |
| `/api/activity-context/:instanceId` | GET | None | None | context metadata returned for a valid instance id | missing/unknown caller identity, no-permission | **UNSAFE / TEMP DEBT** |

Current document guard verifies instance→document linkage only. It does not establish the Discord actor or action permission.

## Kanban

| Route | Method | Current identity check | Current guild/resource check | Current UUID-only result | Desired negative tests in Phase 1 | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/boards/:boardId` | GET | None | board id only; optional `guild_id` query may populate missing guild | board + tasks + members + roles can be returned | missing, unknown, other-board, other-guild, no-permission | **UNSAFE / TEMP DEBT** |
| `/api/boards/:boardId/guild-members` | GET | None | board lookup only | member directory can be returned | missing, unknown, other-guild, no-permission | **UNSAFE / TEMP DEBT** |
| `/api/boards/:boardId/guild-roles` | GET | None | board lookup only | role directory can be returned | missing, unknown, other-guild, no-permission | **UNSAFE / TEMP DEBT** |
| `/api/boards/:boardId/tasks` | POST | `verifyBoardActivityAccess` | exact board target in Activity context | `401` without instance | unknown, other-board, other-guild, no-permission | Partial guard |
| `/api/boards/:boardId` | PATCH | `verifyBoardActivityAccess` | exact board target | `401` without instance | unknown, other-board, other-guild, no-permission | Partial guard |
| `/api/boards/:boardId/columns` | PATCH/PUT | `verifyBoardActivityAccess` | exact board target | `401` without instance | unknown, other-board, other-guild, no-permission | Partial guard |
| `/api/tasks/:taskId` | PATCH | `verifyBoardActivityAccess` after task lookup | task→board then exact board target | `401` without instance when task exists | unknown, other-board, other-guild, no-permission | Partial guard |
| `/api/tasks/:taskId` | DELETE | `verifyBoardActivityAccess` after task lookup | task→board then exact board target | `401` without instance when task exists | unknown, other-board, other-guild, no-permission | Partial guard |

Additional characterization: normal `GET /api/boards/:boardId` currently fetches up to 1,000 Discord members plus roles and embeds them in the board payload. This is both a privacy/auth concern and a Phase 2/6 scalability concern.

## Events / Planner

| Route family | Methods | Current identity check | Current guild/resource check | UUID-only result | Desired negative tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/events` | GET/POST | `activityGuild` | context resolves to event guild; explicit `guild_id` must match | `401` without valid Activity context | unknown, other-guild, no-permission | Partial guard |
| `/api/events/:eventId` | GET/PATCH/DELETE | `verifyEventAccess` | target event guild must equal Activity guild | `401/403` | unknown, other-event/guild, no-permission | Partial guard |
| `participants` | PUT | inherited `verifyEventAccess` | event guild | `401/403` | same + invalid participants | Partial guard |
| `blocks`, `reorder-blocks` | POST/PATCH/DELETE | inherited `verifyEventAccess` | child ownership checks on edits/deletes | `401/403` | cross-event child, no-permission | Partial guard |
| `items`, `reorder-items` | POST/PATCH/DELETE | inherited `verifyEventAccess` | block/item ownership checks | `401/403` | cross-event child, no-permission | Partial guard |
| `notes` | POST/PATCH/DELETE | inherited `verifyEventAccess` | block/item refs + note ownership | `401/403` | cross-event child, no-permission | Partial guard |
| `decisions` | POST/DELETE | inherited `verifyEventAccess` | decision ownership on delete | `401/403` | cross-event child, no-permission | Partial guard |
| `tasks` | POST | inherited `verifyEventAccess` | child refs + board lookup in event guild | `401/403` | cross-event child, cross-guild board, no-permission | Partial guard |
| `start`, `finish`, `duplicate`, `publish`, `minutes`, `publish-minutes` | POST | inherited `verifyEventAccess` | event guild | `401/403` | other-guild, no-permission | Partial guard |

Event access is currently stronger than Documents/Kanban reads, but still equates possession of a valid Activity instance in the same guild with authorization for every event action. Phase 1 must introduce explicit action permission semantics.

## Discord interaction entry point

POST interaction requests require `x-signature-ed25519`, `x-signature-timestamp` and `DISCORD_PUBLIC_KEY`; invalid or missing signatures return `401`. This is transport authenticity for Discord interactions and is separate from Activity resource authorization.

## Phase 0 automated characterization

`test/security-characterization.test.js` intentionally locks in selected current behavior so Phase 1 can demonstrate security fixes by flipping expectations:

1. Document read, edit and export currently work with `UUID_ONLY`.
2. Document source and normalize currently reject `MISSING_INSTANCE`.
3. Activity-context metadata is currently readable by instance id alone.
4. Kanban board/member/role read branches currently contain no board Activity guard, while mutating branches do.
5. Events collection/entity handlers currently require Activity-derived guild access.

These are characterization tests, not endorsements. Tests named `TEMP DEBT` must be rewritten or removed when the corresponding Phase 1 fix lands.

## Target response semantics for Phase 1

- `401`: no usable Activity identity/authentication context.
- `403`: authenticated Activity context exists but is not authorized for the action/guild/resource.
- `404`: resource absence only after authorization rules permit revealing that distinction; otherwise use a normalized non-enumerating response.
- Error bodies must not leak private title/content/member metadata.
