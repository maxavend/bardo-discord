import test from 'node:test';
import assert from 'node:assert/strict';
import {DOCS_KEYS, docsScopeFor, scopedDocsKey, setDocsStorageScope, hasUnownedLocalData} from '../activity-app/src/docs-storage.js';
import {createPlannerSyncEngine, readPendingPlannerEdits, readPendingLiveStates, PLANNER_PENDING_KEY, PLANNER_PENDING_LIVE_KEY} from '../activity-app/src/planner/planner-sync.js';
import {loadPlannerState, savePlannerState} from '../activity-app/src/planner/planner-store.js';
import {createDocsSync} from '../activity-app/src/production-docs-sync.js';

function memoryStorage() {
  const data = new Map();
  return {data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key)};
}

test('account changes isolate Docs draft, editing journal, cache and unsent queue without deleting either account', () => {
  const storage = memoryStorage();
  const alice = docsScopeFor('guild', 'channel', 'alice');
  const bob = docsScopeFor('guild', 'channel', 'bob');
  for (const base of Object.values(DOCS_KEYS)) storage.setItem(scopedDocsKey(base, alice), 'Alice private content');
  const pending = {secret: {doc: {id: 'secret', title: 'Private'}, version: 1, baseUpdatedAt: '2026-01-01'}};
  storage.setItem(scopedDocsKey(DOCS_KEYS.pending, alice), JSON.stringify(pending));
  storage.setItem(DOCS_KEYS.draft, 'unowned old draft');
  const preserved = new Map(storage.data);
  setDocsStorageScope(bob);
  try {
    for (const base of Object.values(DOCS_KEYS)) assert.equal(storage.getItem(scopedDocsKey(base)), null);
    const sync = createDocsSync({storage, request: async () => {throw Error('must not sync another account');}, pendingKey: scopedDocsKey(DOCS_KEYS.pending), legacyPendingKey: null});
    sync.loadPending();
    assert.equal(sync.pending.size, 0);
    assert.equal(hasUnownedLocalData(storage, 'guild', 'channel'), true);
    assert.deepEqual(storage.data, preserved, 'old and other-account content remain byte-for-byte');
    setDocsStorageScope(alice);
    assert.equal(storage.getItem(scopedDocsKey(DOCS_KEYS.draft)), 'Alice private content');
    assert.equal(storage.getItem(scopedDocsKey(DOCS_KEYS.pending)), JSON.stringify(pending));
  } finally {setDocsStorageScope(null);}
});

test('Planner drafts and pending agenda/live writes are isolated by account and channel', async () => {
  const storage = memoryStorage();
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  const alice = docsScopeFor('g', 'c', 'alice');
  const bob = docsScopeFor('g', 'c', 'bob');
  setDocsStorageScope(alice);
  try {
    savePlannerState({id: 'meeting-alice', title: 'Alice private agenda', blocks: []});
    storage.setItem(scopedDocsKey(PLANNER_PENDING_KEY), JSON.stringify({secret: {payload: {id: 'secret', title: 'Alice'}}}));
    storage.setItem(scopedDocsKey(PLANNER_PENDING_LIVE_KEY), JSON.stringify({secret: {status: 'running'}}));
    storage.setItem(PLANNER_PENDING_KEY, JSON.stringify({unowned: {payload: {id: 'unowned'}}}));
    for (const scope of [bob, docsScopeFor('g', 'other-channel', 'alice')]) {
      setDocsStorageScope(scope);
      assert.notEqual(loadPlannerState().title, 'Alice private agenda');
      assert.deepEqual(readPendingPlannerEdits(storage), {});
      assert.deepEqual(readPendingLiveStates(storage), {});
      const requests = [];
      const engine = createPlannerSyncEngine({storage, fetchImpl: async url => {requests.push(url); return Response.json({});}, setTimeoutImpl: () => 1, clearTimeoutImpl: () => {}});
      engine.resumePending();
      await engine.whenIdle();
      assert.deepEqual(requests, [], 'no previous-account queue may replay');
      // Capture ownership at engine construction, even if a later scope changes.
      setDocsStorageScope(alice);
      await engine.schedulePlannerSave({id: 'new', title: 'New', blocks: []});
      assert.ok(JSON.parse(storage.getItem(scopedDocsKey(PLANNER_PENDING_KEY, scope))).new);
      assert.ok(readPendingPlannerEdits(storage).secret);
    }
    assert.equal(loadPlannerState().title, 'Alice private agenda');
    assert.ok(storage.getItem(PLANNER_PENDING_KEY), 'ownerless queue retained without adopting it');
  } finally {setDocsStorageScope(null); globalThis.localStorage = oldStorage;}
});

test('bridge refuses a denied library before reading or rendering an offline cache', async () => {
  const {prepareBardoProduction} = await import('../activity-app/src/production-bridge.js');
  const storage = memoryStorage();
  const scope = docsScopeFor('g', 'c', 'alice');
  storage.setItem(scopedDocsKey(DOCS_KEYS.store, scope), JSON.stringify({docs: [{id: 'secret', title: 'Revoked document'}]}));
  const snapshot = new Map(storage.data);
  const original = {window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch};
  globalThis.window = {location: {search: ''}, __BARDO_GUILD_ID__: 'g', __BARDO_CHANNEL_ID__: 'c',
    __BARDO_USER__: {id: 'alice'}, __BARDO_SESSION_TOKEN__: 'session', dispatchEvent: () => {}};
  globalThis.localStorage = storage;
  globalThis.fetch = async () => Response.json({message: 'No tienes permiso para acceder al canal.'}, {status: 403});
  try {
    await assert.rejects(prepareBardoProduction({sdk: {}, guildId: 'g', channelId: 'c'}), error => error.status === 403);
    assert.equal(window.__BARDO_INITIAL_STORE__, undefined);
    assert.deepEqual(storage.data, snapshot, 'denied content is preserved, not rendered or overwritten');
  } finally {Object.assign(globalThis, original); setDocsStorageScope(null);}
});

test('IndexedDB binaries and in-progress recovery cannot cross accounts or adopt ownerless audio', async () => {
  const {createRecordingStorage} = await import('../activity-app/src/planner/recording-storage.js');
  const databases = new Map();
  const idb = {open(name) {
    if (!databases.has(name)) databases.set(name, new Map());
    const stores = databases.get(name);
    const request = {};
    const respond = result => {const req = {result}; queueMicrotask(() => req.onsuccess?.()); return req;};
    request.result = {close() {}, transaction() {return {objectStore(storeName) {
      if (!stores.has(storeName)) stores.set(storeName, new Map());
      const data = stores.get(storeName);
      return {put: value => {data.set(value.id, value); return respond(value.id);},
        get: key => respond(data.get(key)), getAll: () => respond([...data.values()])};
    }};}};
    queueMicrotask(() => request.onsuccess?.());
    return request;
  }};
  const audio = createRecordingStorage(idb);
  try {
    setDocsStorageScope(null);
    await audio.beginInProgress({id: 'legacy', plannerSessionId: 'shared-meeting'});
    setDocsStorageScope('g:c:alice');
    const blob = new Blob(['private recording']);
    await audio.save('same-id', blob);
    await audio.beginInProgress({id: 'same-id', plannerSessionId: 'shared-meeting'});
    setDocsStorageScope('g:c:bob');
    assert.equal(await audio.get('same-id'), null);
    assert.deepEqual(await audio.listInProgress(), []);
    setDocsStorageScope('g:other:alice');
    assert.deepEqual(await audio.listInProgress(), []);
    setDocsStorageScope('g:c:alice');
    assert.equal(await (await audio.get('same-id')).text(), 'private recording');
    assert.deepEqual((await audio.listInProgress()).map(meta => meta.id), ['same-id']);
    setDocsStorageScope(null);
    assert.equal((await audio.listInProgress())[0].id, 'legacy', 'ownerless audio preserved without adoption');
  } finally {setDocsStorageScope(null);}
});
