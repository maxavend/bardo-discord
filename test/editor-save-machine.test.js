import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorSaveCoordinator } from '../src/activity/editor-save-machine.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('save coordinator keeps one write in flight and coalesces queued changes onto the next version', async () => {
  const calls = [];
  const gates = [];
  const coordinator = new EditorSaveCoordinator({
    version: 1,
    fingerprint: (payload) => payload.value,
    transport(payload, version) {
      calls.push({ payload, version });
      const gate = deferred(); gates.push(gate); return gate.promise;
    },
  });
  coordinator.sync({ version: 1, payload: { value: 'base' } });
  coordinator.markDirty();
  const first = coordinator.enqueue({ value: 'uno' });
  coordinator.markDirty();
  const second = coordinator.enqueue({ value: 'dos' });
  coordinator.markDirty();
  const third = coordinator.enqueue({ value: 'tres' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].version, 1);
  assert.equal(coordinator.state, 'saving');

  gates[0].resolve({ version: 2 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].payload.value, 'tres');
  assert.equal(calls[1].version, 2);
  gates[1].resolve({ version: 3 });
  await Promise.all([first, second, third]);
  assert.equal(coordinator.version, 3);
  assert.equal(coordinator.state, 'saved');
});

test('save coordinator enters conflict instead of retrying a stale version silently', async () => {
  const coordinator = new EditorSaveCoordinator({
    version: 4,
    transport: async () => {
      const error = new Error('stale'); error.code = 'DOCUMENT_VERSION_CONFLICT'; error.currentVersion = 5; throw error;
    },
  });
  coordinator.markDirty();
  await assert.rejects(() => coordinator.enqueue({ title: 'A' }), /stale/);
  assert.equal(coordinator.state, 'conflict');
  assert.equal(coordinator.version, 4);
  assert.equal(coordinator.retryJob?.error?.currentVersion, 5);
});

test('network error retains a retry job and retry uses the same known version until the server confirms', async () => {
  let attempts = 0;
  const coordinator = new EditorSaveCoordinator({
    version: 2,
    transport: async (_payload, version) => {
      attempts += 1;
      assert.equal(version, 2);
      if (attempts === 1) { const error = new Error('offline'); error.code = 'DOCUMENT_SAVE_NETWORK_ERROR'; throw error; }
      return { version: 3 };
    },
  });
  coordinator.markDirty();
  await assert.rejects(() => coordinator.enqueue({ title: 'A' }), /offline/);
  assert.equal(coordinator.state, 'error');
  await coordinator.retry();
  assert.equal(coordinator.version, 3);
  assert.equal(coordinator.state, 'saved');
});

test('identical confirmed payload is deduplicated without creating another document version', async () => {
  let calls = 0;
  const coordinator = new EditorSaveCoordinator({
    version: 7,
    fingerprint: (payload) => payload.value,
    transport: async () => { calls += 1; return { version: 8 }; },
  });
  coordinator.sync({ version: 7, payload: { value: 'same' } });
  const result = await coordinator.enqueue({ value: 'same' });
  assert.equal(result.deduped, true);
  assert.equal(calls, 0);
  assert.equal(coordinator.version, 7);
});
