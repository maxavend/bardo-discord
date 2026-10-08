import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlannerSyncEngine,
  backoffDelay,
  isRetryableStatus,
  toPlannerPayload,
  plannerPayloadsEquivalent,
  PLANNER_PENDING_KEY,
} from '../activity-app/src/planner/planner-sync.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {get: () => null},
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

function createHarness(responder) {
  const calls = [];
  const timers = [];
  const statuses = [];
  const saved = [];
  const conflicts = [];
  const storageData = new Map();
  const storage = {
    getItem: (key) => (storageData.has(key) ? storageData.get(key) : null),
    setItem: (key, value) => storageData.set(key, String(value)),
    removeItem: (key) => storageData.delete(key),
  };
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({url, method: init.method || 'GET', body});
    const result = await responder({url, method: init.method || 'GET', body, calls});
    if (result instanceof Error) throw result;
    return result;
  };
  const options = {
    fetchImpl,
    storage,
    setTimeoutImpl: (fn, ms) => {
      timers.push({fn, ms});
      return timers.length;
    },
    clearTimeoutImpl: (id) => {
      if (id && timers[id - 1]) timers[id - 1].cancelled = true;
    },
    onStatus: (id, state, message) => statuses.push({id, state, message}),
    onPlannerSaved: (session) => saved.push(session),
    onPlannerConflict: (conflict) => conflicts.push(conflict),
  };
  const engine = createPlannerSyncEngine(options);
  const runTimers = async () => {
    const pendingTimers = timers.filter((timer) => !timer.cancelled && !timer.ran);
    for (const timer of pendingTimers) {
      timer.ran = true;
      timer.fn();
    }
    await engine.whenIdle();
    await engine.whenIdle();
  };
  return {engine, calls, timers, statuses, saved, conflicts, storage, storageData, runTimers, options};
}

const PLANNER = {id: 'sess-1', title: 'Weekly', host: 'Pau', date: '2026-10-07', startTime: '10:00', blocks: [{id: 'b1'}], updatedAt: 'v1'};

test('backoff: 1s, 2s, 4s … capped at 30s, honoring Retry-After', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map((attempt) => backoffDelay(attempt)), [1000, 2000, 4000, 8000, 30000]);
  assert.equal(backoffDelay(0, 5000), 5000);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(0), true);
  for (const status of [400, 401, 403, 404, 409, 413]) assert.equal(isRetryableStatus(status), false);
});

test('payload maps host to hostName and never sends status', () => {
  const payload = toPlannerPayload({...PLANNER, status: 'archived'});
  assert.equal(payload.hostName, 'Pau');
  assert.equal(Object.hasOwn(payload, 'status'), false);
});

test('debounced PATCH: many edits → one request with the latest content and baseUpdatedAt', async () => {
  const h = createHarness(({method}) => (method === 'PATCH'
    ? jsonResponse(200, {session: {...PLANNER, title: 'Weekly 3', updatedAt: 'v2'}})
    : jsonResponse(500, {})));
  h.engine.schedulePlannerSave({...PLANNER, title: 'Weekly 1'});
  h.engine.schedulePlannerSave({...PLANNER, title: 'Weekly 2'});
  h.engine.schedulePlannerSave({...PLANNER, title: 'Weekly 3'});
  assert.equal(h.calls.length, 0);
  assert.ok(JSON.parse(h.storageData.get(PLANNER_PENDING_KEY))['sess-1'], 'pending edit persisted before sending');

  await h.runTimers();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, 'PATCH');
  assert.equal(h.calls[0].body.title, 'Weekly 3');
  assert.equal(h.calls[0].body.baseUpdatedAt, 'v1');
  assert.equal(h.saved[0].updatedAt, 'v2');
  assert.equal(h.storageData.has(PLANNER_PENDING_KEY), false);

  h.engine.schedulePlannerSave({...PLANNER, title: 'Weekly 4'});
  await h.runTimers();
  assert.equal(h.calls[1].body.baseUpdatedAt, 'v2', 'next save uses the new server version');
});

test('POST only on a real 404', async () => {
  const h = createHarness(({method}) => {
    if (method === 'PATCH') return jsonResponse(404, {error: 'not_found'});
    if (method === 'POST') return jsonResponse(201, {session: {...PLANNER, updatedAt: 'v1'}});
    return jsonResponse(500, {});
  });
  await h.engine.ensurePlannerPersisted(PLANNER);
  assert.deepEqual(h.calls.map((call) => call.method), ['PATCH', 'POST']);
  assert.equal(h.statuses.at(-1).state, 'saved');
});

test('403 is reported and not retried, no POST fallback', async () => {
  const h = createHarness(() => jsonResponse(403, {error: 'forbidden'}));
  await h.engine.ensurePlannerPersisted(PLANNER);
  assert.deepEqual(h.calls.map((call) => call.method), ['PATCH']);
  assert.equal(h.statuses.at(-1).state, 'error');
  assert.equal(h.timers.filter((timer) => !timer.cancelled && !timer.ran).length, 0);
});

test('503 / network errors retry with backoff until saved', async () => {
  let attempt = 0;
  const h = createHarness(() => {
    attempt += 1;
    if (attempt === 1) return jsonResponse(503, {error: 'discord_unavailable', retryAfterMs: 1500});
    if (attempt === 2) return new TypeError('Failed to fetch');
    return jsonResponse(200, {session: {...PLANNER, updatedAt: 'v9'}});
  });
  await h.engine.ensurePlannerPersisted(PLANNER);
  assert.equal(h.statuses.at(-1).state, 'error');
  const firstRetry = h.timers.at(-1);
  assert.equal(firstRetry.ms, 1500);
  await h.runTimers();
  assert.equal(h.statuses.at(-1).state, 'offline');
  assert.equal(h.timers.at(-1).ms, 2000);
  await h.runTimers();
  assert.equal(h.statuses.at(-1).state, 'saved');
  assert.equal(h.calls.length, 3);
});

test('409 conflict hands both versions to the caller and clears the pending edit', async () => {
  const server = {...PLANNER, title: 'Editado por otra persona', updatedAt: 'v5'};
  const h = createHarness(() => jsonResponse(409, {error: 'conflict', session: server}));
  await h.engine.ensurePlannerPersisted({...PLANNER, title: 'Mi versión'});
  assert.equal(h.conflicts.length, 1);
  assert.equal(h.conflicts[0].local.title, 'Mi versión');
  assert.equal(h.conflicts[0].server.title, 'Editado por otra persona');
  assert.equal(h.statuses.at(-1).state, 'conflict');
  assert.equal(h.engine.hasPendingPlanner('sess-1'), false);
});

test('409 whose server content equals ours (earlier keepalive landed) counts as saved', async () => {
  const h = createHarness(() => jsonResponse(409, {error: 'conflict', session: {...PLANNER, hostName: 'Pau', updatedAt: 'v7'}}));
  await h.engine.ensurePlannerPersisted(PLANNER);
  assert.equal(h.conflicts.length, 0);
  assert.equal(h.statuses.at(-1).state, 'saved');
  assert.equal(plannerPayloadsEquivalent(PLANNER, {...PLANNER, id: 'x'}), true);
});

test('live pushes use the explicit session id, coalesce, and wait for agenda saves', async () => {
  const h = createHarness(() => jsonResponse(200, {ok: true, session: {...PLANNER, updatedAt: 'v2'}}));
  h.engine.schedulePlannerSave(PLANNER);
  h.engine.pushLiveState('sess-1', {status: 'running', n: 1});
  h.engine.pushLiveState('sess-1', {status: 'running', n: 2});
  await h.engine.whenIdle();
  const methods = h.calls.map((call) => `${call.method} ${call.url}`);
  assert.equal(methods[0], 'PATCH /api/planner/sessions/sess-1', 'agenda first so the row exists');
  const liveCalls = h.calls.filter((call) => call.url.endsWith('/live'));
  assert.equal(liveCalls.length, 1, 'only the latest live state is sent');
  assert.equal(liveCalls[0].body.n, 2);
  assert.equal(liveCalls[0].url, '/api/planner/sessions/sess-1/live');
});

test('live push to an agenda that only exists locally creates it from the snapshot, then retries', async () => {
  let liveAttempts = 0;
  const h = createHarness(({url, method}) => {
    if (url.endsWith('/live')) {
      liveAttempts += 1;
      return liveAttempts === 1 ? jsonResponse(404, {error: 'not_found'}) : jsonResponse(200, {ok: true});
    }
    if (method === 'POST') return jsonResponse(201, {session: PLANNER});
    return jsonResponse(500, {});
  });
  h.engine.rememberSnapshot(PLANNER);
  await h.engine.pushLiveState('sess-1', {status: 'running'});
  assert.deepEqual(h.calls.map((call) => call.method), ['POST', 'POST', 'POST']);
  assert.equal(h.calls[1].url, '/api/planner/sessions');
  assert.equal(h.statuses.at(-1).state, 'saved');
});

test('pending agenda edits survive a reload and are re-sent by the next engine', async () => {
  const first = createHarness(() => jsonResponse(503, {}));
  first.engine.schedulePlannerSave({...PLANNER, title: 'Sin guardar'});
  first.engine.dispose();
  const stored = first.storageData.get(PLANNER_PENDING_KEY);
  assert.ok(stored);

  const second = createHarness(() => jsonResponse(200, {session: {...PLANNER, updatedAt: 'v3'}}));
  second.storageData.set(PLANNER_PENDING_KEY, stored);
  const engine = createPlannerSyncEngine({...second.options, storage: second.storage});
  engine.resumePending();
  await engine.whenIdle();
  const patch = second.calls.find((call) => call.method === 'PATCH');
  assert.equal(patch.body.title, 'Sin guardar');
});

// ── Review fixes ───────────────────────────────────────────────────────────

import {PLANNER_PENDING_LIVE_KEY, KEEPALIVE_BUDGET_BYTES} from '../activity-app/src/planner/planner-sync.js';

test('equivalence applies the server defaults to both sides (no false conflict copy)', () => {
  const local = {id: 'sess-1', title: '  ', host: '', date: '', startTime: '', targetDuration: '', description: '', mentions: '', blocks: []};
  const server = {id: 'sess-1', title: 'Nueva sesión', hostName: null, date: '2026-10-07', startTime: '10:00', targetDuration: 60, description: '', mentions: '', blocks: []};
  assert.equal(plannerPayloadsEquivalent(local, server), true);
  assert.equal(plannerPayloadsEquivalent({...local, title: 'Otra'}, server), false);
  assert.equal(plannerPayloadsEquivalent({...local, date: '2026-10-08'}, server), false);
});

test('unsent live state is persisted per agenda and re-sent on resume only if newer than the server', async () => {
  const first = createHarness(() => new TypeError('offline'));
  await first.engine.pushLiveState('sess-1', {status: 'running', updatedAt: '2026-10-07T10:00:00.000Z'});
  first.engine.stageLiveState('sess-2', {status: 'paused', updatedAt: '2026-10-07T10:05:00.000Z'});
  const stored = JSON.parse(first.storageData.get(PLANNER_PENDING_LIVE_KEY));
  assert.equal(stored['sess-1'].status, 'running');
  assert.equal(stored['sess-2'].status, 'paused');
  first.engine.dispose();

  const second = createHarness(({url, method}) => {
    if (method === 'GET' && url.includes('sess-1')) return jsonResponse(200, {liveState: {status: 'running', updatedAt: '2026-10-07T09:00:00.000Z'}});
    if (method === 'GET' && url.includes('sess-2')) return jsonResponse(200, {liveState: {status: 'completed', updatedAt: '2026-10-07T11:00:00.000Z'}});
    return jsonResponse(200, {ok: true});
  });
  second.storageData.set(PLANNER_PENDING_LIVE_KEY, first.storageData.get(PLANNER_PENDING_LIVE_KEY));
  const engine = createPlannerSyncEngine({...second.options, storage: second.storage});
  engine.resumePending();
  await engine.whenIdle();
  await engine.whenIdle();
  const posts = second.calls.filter((call) => call.method === 'POST');
  assert.deepEqual(posts.map((call) => call.url), ['/api/planner/sessions/sess-1/live'], 'stale sess-2 not sent over newer server state');
  assert.equal(second.storageData.has(PLANNER_PENDING_LIVE_KEY), false);
});

test('keepalive flush includes live state and skips bodies over the ~60 KB budget', () => {
  const h = createHarness(() => jsonResponse(200, {}));
  h.engine.schedulePlannerSave({...PLANNER, blocks: [{id: 'big', notes: 'x'.repeat(KEEPALIVE_BUDGET_BYTES)}]});
  h.engine.stageLiveState('sess-1', {status: 'running', updatedAt: 'now'});
  const report = h.engine.flushAllKeepalive();
  const planner = report.find((item) => item.kind === 'planner');
  const live = report.find((item) => item.kind === 'live');
  assert.equal(planner.sent, false, 'oversized agenda stays pending for next boot');
  assert.ok(planner.bytes > KEEPALIVE_BUDGET_BYTES);
  assert.equal(live.sent, true);
  assert.equal(h.calls.filter((call) => call.method === 'PATCH').length, 0);
  assert.equal(h.calls.filter((call) => call.url.endsWith('/live')).length, 1);
  assert.ok(h.storageData.get(PLANNER_PENDING_KEY), 'agenda edit still pending');
});
