import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_STATUS,
  POINT_STATUS,
  createLiveSession,
  advanceLiveSession,
  advanceToNextBlock,
  skipActiveBlock,
  skipActivePoint,
  pauseLiveSession,
  migrateLiveSessionState,
  recalculateEstimatedEndTime,
} from '../activity-app/src/planner/session-runner.js';
import {
  reconcileLiveState,
  serializeLiveSessionState,
  stampLiveState,
  isMeaningfulLiveState,
  choosePlannerBootSession,
  normalizeServerSession,
  createEmptyLiveSession,
  loadLiveSessionState,
  LIVE_SESSION_STORE_KEY,
} from '../activity-app/src/planner/planner-store.js';
import {toLocalDateIso, todayLocalIso, parseLocalDateIso} from '../activity-app/src/planner/date-utils.js';

const PLANNER = {
  id: 'sess-1',
  title: 'Weekly',
  startTime: '10:00',
  totalCalculatedDuration: 50,
  blocks: [
    {id: 'b1', title: 'Uno', durationMinutes: 20, subpoints: [{id: 'p1', title: 'A'}, {id: 'p2', title: 'B'}]},
    {id: 'b2', title: 'Dos', durationMinutes: 20, subpoints: [{id: 'p3', title: 'C'}]},
    {id: 'b3', title: 'Tres', durationMinutes: 10, subpoints: []},
  ],
};

const T0 = Date.parse('2026-10-07T13:00:00Z');

// ── Date helpers (finding 13) ──────────────────────────────────────────────

test('date-utils: Chile evening stays on the local civil date (UTC would be tomorrow)', () => {
  // 22:30 in Santiago (UTC-3, DST) is already 01:30 UTC of the next day.
  const instant = new Date('2026-10-08T01:30:00Z');
  assert.equal(instant.toISOString().split('T')[0], '2026-10-08');
  assert.equal(toLocalDateIso(instant, 'America/Santiago'), '2026-10-07');
  // Winter time (UTC-4).
  assert.equal(toLocalDateIso(new Date('2026-07-01T03:30:00Z'), 'America/Santiago'), '2026-06-30');
});

test('date-utils: local helpers use the runtime local date and parse strictly', () => {
  const now = new Date(2026, 9, 7, 23, 59);
  assert.equal(todayLocalIso(now), '2026-10-07');
  assert.equal(parseLocalDateIso('2026-02-30'), null);
  assert.equal(parseLocalDateIso('nope'), null);
  const parsed = parseLocalDateIso('2026-10-07');
  assert.equal(parsed.getDate(), 7);
  assert.equal(parsed.getHours(), 0);
});

// ── Estimated end time (finding 14) ───────────────────────────────────────

test('recalculateEstimatedEndTime takes a planner-like object, not (string, number)', () => {
  assert.equal(recalculateEstimatedEndTime({startTime: '17:45', totalCalculatedDuration: 90}, null), '19:15');
  assert.equal(
    recalculateEstimatedEndTime({startTime: '17:45', totalCalculatedDuration: 90}, {blockExtensions: {b1: {extensionMinutes: 5}}}),
    '19:20'
  );
});

// ── Runner never ends the meeting because of a lost pointer ───────────────

test('advance with a missing active block re-anchors to the first incomplete block instead of completing', () => {
  const session = createLiveSession(PLANNER, T0);
  assert.equal(session.plannerSessionId, 'sess-1');
  const corrupted = {...session, liveActiveBlockId: null, liveActivePointId: null, completedBlockIds: ['b1']};
  const next = advanceLiveSession(PLANNER, corrupted, T0 + 1000);
  assert.equal(next.status, SESSION_STATUS.RUNNING);
  assert.equal(next.liveActiveBlockId, 'b2');
  assert.equal(next.liveActivePointId, 'p3');
});

test('advanceToNextBlock / skipActiveBlock / skipActivePoint also re-anchor on a missing block', () => {
  const session = {...createLiveSession(PLANNER, T0), liveActiveBlockId: 'ghost', liveActivePointId: 'ghost-p'};
  for (const transition of [advanceToNextBlock, skipActiveBlock, skipActivePoint]) {
    const next = transition(PLANNER, session, T0 + 1000);
    assert.equal(next.status, SESSION_STATUS.RUNNING, transition.name);
    assert.equal(next.liveActiveBlockId, 'b1', transition.name);
  }
});

test('advance still completes when every block is genuinely done', () => {
  const session = {...createLiveSession(PLANNER, T0), liveActiveBlockId: null, completedBlockIds: ['b1', 'b2', 'b3']};
  assert.equal(advanceLiveSession(PLANNER, session, T0 + 1).status, SESSION_STATUS.COMPLETED);
});

test('migrateLiveSessionState maps the legacy server column shape', () => {
  const legacy = {
    sessionId: 'sess-1',
    status: 'running',
    activeBlockId: 'b2',
    activePointId: 'p3',
    blockStartedAt: T0,
    totalPausedMs: 5000,
    recordingsMeta: [{id: 'r1'}],
  };
  const migrated = migrateLiveSessionState(PLANNER, legacy);
  assert.equal(migrated.liveActiveBlockId, 'b2');
  assert.equal(migrated.liveActivePointId, 'p3');
  assert.equal(migrated.activeBlockStartedAt, T0);
  assert.equal(migrated.accumulatedPausedMs, 5000);
  assert.deepEqual(migrated.recordings, [{id: 'r1'}]);
  assert.equal(Object.hasOwn(migrated, 'activeBlockId'), false);
});

// ── Live state reconciliation (findings 1, 2, 3) ──────────────────────────

function runningSessionWithProgress() {
  let session = createLiveSession(PLANNER, T0);
  session = advanceLiveSession(PLANNER, session, T0 + 60_000); // p1 done → p2
  session = advanceLiveSession(PLANNER, session, T0 + 120_000); // p2 done → b2/p3
  session = pauseLiveSession(session, T0 + 180_000);
  session = {
    ...session,
    recordings: [{id: 'rec-1', blockId: 'b1', pointId: 'p1', binaryStorage: 'indexeddb', status: 'saved', blobUrl: 'blob:local', durationMs: 1000}],
  };
  return stampLiveState(session, T0 + 180_000);
}

test('reload mid-meeting: full serialized state restores block, points, completed blocks, pause and recordings', () => {
  const local = runningSessionWithProgress();
  const fromServer = JSON.parse(JSON.stringify(serializeLiveSessionState(local)));
  assert.equal(fromServer.recordings[0].blobUrl, undefined);

  const {state, source} = reconcileLiveState(PLANNER, createEmptyLiveSession(PLANNER), fromServer);
  assert.equal(source, 'remote');
  assert.equal(state.status, SESSION_STATUS.PAUSED);
  assert.equal(state.liveActiveBlockId, 'b2');
  assert.equal(state.liveActivePointId, 'p3');
  assert.deepEqual(state.completedBlockIds, ['b1']);
  assert.equal(state.pointStatuses.p1, POINT_STATUS.DONE);
  assert.equal(state.pointStatuses.p2, POINT_STATUS.DONE);
  assert.equal(state.pausedAt, T0 + 180_000);
  assert.equal(state.sessionStartedAt, T0);
  assert.equal(state.recordings.length, 1);
  assert.equal(state.recordings[0].status, 'pending'); // to be rehydrated from IndexedDB
});

test('reconcile: an older remote never overwrites newer local progress', () => {
  const local = runningSessionWithProgress();
  const stale = stampLiveState({...createLiveSession(PLANNER, T0), plannerSessionId: 'sess-1'}, T0 + 1000);
  const {state, source} = reconcileLiveState(PLANNER, local, stale);
  assert.equal(source, 'local');
  assert.equal(state, local);
});

test('reconcile: newer remote with null/missing structural fields keeps the local values', () => {
  const local = runningSessionWithProgress();
  const remote = {
    plannerSessionId: 'sess-1',
    status: 'running',
    liveActiveBlockId: null,
    updatedAt: new Date(T0 + 999_000).toISOString(),
  };
  const {state, source} = reconcileLiveState(PLANNER, local, remote);
  assert.equal(source, 'remote');
  assert.equal(state.status, SESSION_STATUS.RUNNING);
  assert.equal(state.liveActiveBlockId, 'b2');
  assert.deepEqual(state.completedBlockIds, ['b1']);
  assert.equal(state.recordings[0].blobUrl, 'blob:local');
});

test('reconcile: a remote state for another agenda is ignored, and a local one for another agenda is dropped', () => {
  const local = runningSessionWithProgress();
  const foreign = {...local, plannerSessionId: 'other', updatedAt: new Date(T0 + 999_000).toISOString()};
  assert.equal(reconcileLiveState(PLANNER, local, foreign).state, local);

  const otherPlanner = {...PLANNER, id: 'sess-2'};
  const {state} = reconcileLiveState(otherPlanner, local, null);
  assert.equal(state.plannerSessionId, 'sess-2');
  assert.equal(state.status, SESSION_STATUS.IDLE);
});

test('isMeaningfulLiveState: an empty idle state is never worth pushing', () => {
  assert.equal(isMeaningfulLiveState(createEmptyLiveSession(PLANNER)), false);
  assert.equal(isMeaningfulLiveState(createLiveSession(PLANNER, T0)), true);
  assert.equal(isMeaningfulLiveState({...createEmptyLiveSession(PLANNER), decisions: [{id: 'd'}]}), true);
});

test('loadLiveSessionState rejects a stored live state that belongs to another agenda', () => {
  const previous = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  try {
    data.set(LIVE_SESSION_STORE_KEY, JSON.stringify(runningSessionWithProgress()));
    const other = loadLiveSessionState({...PLANNER, id: 'sess-2'});
    assert.equal(other.status, SESSION_STATUS.IDLE);
    assert.equal(other.plannerSessionId, 'sess-2');
    const same = loadLiveSessionState(PLANNER);
    assert.equal(same.liveActiveBlockId, 'b2');
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

// ── Boot selection / server shape (findings 5, 15) ────────────────────────

test('choosePlannerBootSession prefers live, then the last opened, and keeps unsynced local edits', () => {
  const sessions = [
    {id: 'future', status: 'scheduled', updatedAt: '2026-10-01T00:00:00Z'},
    {id: 'mine', status: 'scheduled', updatedAt: '2026-10-02T00:00:00Z'},
    {id: 'running', status: 'live', updatedAt: '2026-10-03T00:00:00Z'},
  ];
  assert.equal(choosePlannerBootSession(sessions, {id: 'mine'}).session.id, 'running');
  const withoutLive = sessions.slice(0, 2);
  assert.equal(choosePlannerBootSession(withoutLive, {id: 'mine'}).session.id, 'mine');
  assert.equal(choosePlannerBootSession(withoutLive, null).session.id, 'future');
  assert.equal(choosePlannerBootSession(withoutLive, {id: 'mine'}, {mine: {payload: {}}}).keepLocal, true);
  assert.equal(choosePlannerBootSession(withoutLive, {id: 'mine', updatedAt: '2026-09-01T00:00:00Z'}).keepLocal, false);
  assert.deepEqual(choosePlannerBootSession([], null), {session: null, keepLocal: false});
});

test('normalizeServerSession maps hostName → host and drops server status', () => {
  const normalized = normalizeServerSession({id: 's', hostName: 'Pau', status: 'live', blocks: [{id: 'b'}]});
  assert.equal(normalized.host, 'Pau');
  assert.equal(normalized.eventId, 's');
  assert.equal(Object.hasOwn(normalized, 'status'), false);
});

// ── Review fixes ───────────────────────────────────────────────────────────

import {toPlannerEvent} from '../activity-app/src/planner/planner-store.js';

test('list entries carry the full agenda (blocks, mentions, duration) so reopening is never stale', () => {
  const event = toPlannerEvent({id: 's', title: 'T', hostName: 'Pau', mentions: '@a', targetDuration: 90, blocks: [{id: 'b9'}], updatedAt: 'v3'});
  assert.deepEqual(event.blocks, [{id: 'b9'}]);
  assert.equal(event.mentions, '@a');
  assert.equal(event.targetDuration, 90);
  assert.equal(event.host, 'Pau');
  assert.equal(event.updatedAt, 'v3');
});

test('a planner-session launch target wins but keeps unsynced local edits', () => {
  const sessions = [
    {id: 'running', status: 'live', updatedAt: '2026-10-03T00:00:00Z'},
    {id: 'target', status: 'scheduled', updatedAt: '2026-10-02T00:00:00Z'},
  ];
  const chosen = choosePlannerBootSession(sessions, {id: 'target'}, {target: {payload: {}}}, 'target');
  assert.equal(chosen.session.id, 'target');
  assert.equal(chosen.keepLocal, true);
  assert.equal(choosePlannerBootSession(sessions, {id: 'other'}, {}, 'target').keepLocal, false);
  assert.equal(choosePlannerBootSession(sessions, null, {}, 'missing').session.id, 'running');
});

test('reconcile keeps the local run sessionId while captures are in progress', () => {
  const local = runningSessionWithProgress();
  const remote = {...serializeLiveSessionState(local), sessionId: 'session-remote', updatedAt: new Date(T0 + 999_000).toISOString()};
  assert.equal(reconcileLiveState(PLANNER, local, remote).state.sessionId, 'session-remote');
  assert.equal(reconcileLiveState(PLANNER, local, remote, {keepLocalSessionId: true}).state.sessionId, local.sessionId);
});
