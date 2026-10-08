import test from 'node:test';
import assert from 'node:assert/strict';

import {RecordingController, RECORDING_STATUS} from '../activity-app/src/planner/recording-controller.js';
import {recoverInProgressRecordings, createChunkSink} from '../activity-app/src/planner/recording-storage.js';
import {
  extensionForMimeType,
  getRecordingBlob,
  RecordingUnavailableError,
  shouldExportAsZip,
} from '../activity-app/src/planner/audio-exporter.js';

class FakeTrack {
  constructor() {
    this.listeners = {};
    this.stopped = false;
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  stop() {
    this.stopped = true;
  }
  end() {
    this.listeners.ended?.();
  }
}

class FakeMediaRecorder {
  static instances = [];
  static isTypeSupported(type) {
    return type === 'audio/webm;codecs=opus';
  }
  constructor() {
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
    this.autoStop = true;
    FakeMediaRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  emit(text) {
    this.ondataavailable?.({data: new Blob([text], {type: 'audio/webm'})});
  }
  stop() {
    this.state = 'inactive';
    if (this.autoStop) this.onstop?.();
  }
}

async function withFakeMedia(run) {
  const previousNavigator = globalThis.navigator;
  const previousMediaRecorder = globalThis.MediaRecorder;
  const track = new FakeTrack();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {mediaDevices: {getUserMedia: async () => ({getTracks: () => [track]})}},
  });
  globalThis.MediaRecorder = FakeMediaRecorder;
  FakeMediaRecorder.instances = [];
  try {
    await run({track, recorder: () => FakeMediaRecorder.instances.at(-1)});
  } finally {
    if (previousNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', {configurable: true, value: previousNavigator});
    if (previousMediaRecorder === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previousMediaRecorder;
  }
}

test('microphone unplugged mid-recording: captured audio is handed over, not discarded', async () => {
  await withFakeMedia(async ({track, recorder}) => {
    const autoFinalized = [];
    const controller = new RecordingController({onAutoFinalized: (entity) => autoFinalized.push(entity)});
    await controller.startRecording('s1', 'b1', 'Bloque', 'p1', 'Punto');
    recorder().emit('chunk-1');
    recorder().emit('chunk-2');
    track.end();
    assert.equal(autoFinalized.length, 1);
    assert.equal(autoFinalized[0].pointId, 'p1');
    assert.equal(autoFinalized[0].interrupted, true);
    assert.equal(await autoFinalized[0].blob.text(), 'chunk-1chunk-2');
    assert.equal(controller.isActive(), false);
    assert.equal(controller.getStatus(), RECORDING_STATUS.FINALIZED);
  });
});

test('recorder error: user is notified and audio so far is preserved', async () => {
  await withFakeMedia(async ({recorder}) => {
    const errors = [];
    const autoFinalized = [];
    const controller = new RecordingController({
      onError: (error) => errors.push(error),
      onAutoFinalized: (entity) => autoFinalized.push(entity),
    });
    await controller.startRecording('s1', 'b1', 'Bloque');
    recorder().emit('audio');
    recorder().onerror({error: new Error('Hardware error')});
    assert.equal(errors[0].message, 'Hardware error');
    assert.equal(autoFinalized.length, 1);
    assert.match(autoFinalized[0].interruptionReason, /Hardware error/);
  });
});

test('finalize when the recorder is already inactive keeps existing chunks', async () => {
  await withFakeMedia(async ({recorder}) => {
    const controller = new RecordingController();
    await controller.startRecording('s1', 'b1', 'Bloque');
    const fake = recorder();
    fake.emit('kept');
    fake.state = 'inactive'; // stopped, stop event not delivered yet
    const entity = await controller.finalizeRecording();
    assert.ok(entity);
    assert.equal(await entity.blob.text(), 'kept');
  });
});

test('chunk sink receives metadata and every timeslice for incremental persistence', async () => {
  await withFakeMedia(async ({recorder}) => {
    const events = [];
    const controller = new RecordingController({
      chunkSink: {
        begin: (meta) => events.push(['begin', meta.id, meta.sessionId, meta.timesliceMs]),
        append: (id, seq) => events.push(['append', id, seq]),
      },
    });
    const id = await controller.startRecording('s1', 'b1', 'Bloque');
    recorder().emit('a');
    recorder().emit('b');
    assert.deepEqual(events, [['begin', id, 's1', 1000], ['append', id, 0], ['append', id, 1]]);
    const entity = await controller.finalizeRecording();
    assert.equal(entity.id, id);
  });
});

function createMemoryChunkStorage() {
  const audio = new Map();
  const chunks = new Map();
  const inProgress = new Map();
  return {
    audio,
    chunks,
    inProgress,
    async save(id, blob) { audio.set(id, blob); return id; },
    async get(id) { return audio.get(id) || null; },
    async delete(id) { audio.delete(id); },
    async beginInProgress(meta) { inProgress.set(meta.id, meta); },
    async appendChunk(id, seq, blob) { chunks.set(`${id}:${seq}`, {id, seq, blob}); },
    async getChunks(id) {
      return [...chunks.values()].filter((row) => row.id === id).sort((a, b) => a.seq - b.seq).map((row) => row.blob);
    },
    async listInProgress() { return [...inProgress.values()]; },
    async clearInProgress(id) {
      inProgress.delete(id);
      for (const key of [...chunks.keys()]) if (key.startsWith(`${id}:`)) chunks.delete(key);
    },
  };
}

test('Activity closed mid-recording: chunks persisted incrementally are recovered on reopen', async () => {
  const storage = createMemoryChunkStorage();
  const sink = createChunkSink(storage);
  await sink.begin({id: 'rec-a', sessionId: 'session-1', blockId: 'b1', pointTitle: 'Punto A', startedAt: 1000, mimeType: 'audio/webm', timesliceMs: 1000});
  await sink.append('rec-a', 0, new Blob(['hola '], {type: 'audio/webm'}));
  await sink.append('rec-a', 1, new Blob(['mundo'], {type: 'audio/webm'}));
  await sink.begin({id: 'rec-b', sessionId: 'session-2', blockId: 'b1', startedAt: 1000});
  await sink.append('rec-b', 0, new Blob(['otra'], {type: 'audio/webm'}));

  const recovered = await recoverInProgressRecordings('session-1', storage);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].id, 'rec-a');
  assert.equal(recovered[0].status, 'saved');
  assert.equal(recovered[0].durationMs, 2000);
  assert.match(recovered[0].name, /recuperada/);
  assert.equal(await storage.audio.get('rec-a').text(), 'hola mundo');
  assert.equal(storage.inProgress.has('rec-a'), false, 'chunks cleared once the full audio is saved');
  assert.equal(storage.inProgress.has('rec-b'), true, 'other sessions untouched');
});

test('export never substitutes missing audio with a synthetic tone', async () => {
  const emptyStorage = {get: async () => null};
  await assert.rejects(
    getRecordingBlob({id: 'rec-lost', durationMs: 60_000}, {storage: emptyStorage}),
    RecordingUnavailableError
  );
  const demo = await getRecordingBlob({id: 'rec-demo', durationMs: 100}, {storage: emptyStorage, allowSynthetic: true});
  assert.equal(demo.type, 'audio/wav');
  const real = new Blob(['x'], {type: 'audio/mp4'});
  assert.equal(await getRecordingBlob({id: 'r', blob: real}), real);
});

test('file extension follows the real MIME type and long blocks fall back to ZIP', () => {
  assert.equal(extensionForMimeType('audio/mp4'), 'm4a');
  assert.equal(extensionForMimeType('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionForMimeType('audio/ogg;codecs=opus'), 'ogg');
  assert.equal(extensionForMimeType('audio/wav'), 'wav');
  assert.equal(shouldExportAsZip([{durationMs: 30 * 60_000}, {durationMs: 20 * 60_000}]), true);
  assert.equal(shouldExportAsZip([{durationMs: 10 * 60_000}]), false);
});

test('recovery also matches captures by agenda id (run id changed) without duplicating saved audio', async () => {
  const storage = createMemoryChunkStorage();
  const sink = createChunkSink(storage);
  await sink.begin({id: 'rec-old-run', sessionId: 'session-old', plannerSessionId: 'sess-1', blockId: 'b1', startedAt: 0, timesliceMs: 1000});
  await sink.append('rec-old-run', 0, new Blob(['parcial'], {type: 'audio/webm'}));
  // Already finalized and stored completely; only leftover chunks remain.
  await storage.save('rec-done', new Blob(['completo'], {type: 'audio/webm'}));
  await sink.begin({id: 'rec-done', sessionId: 'session-new', plannerSessionId: 'sess-1', blockId: 'b1', startedAt: 0});
  await sink.append('rec-done', 0, new Blob(['par'], {type: 'audio/webm'}));

  const recovered = await recoverInProgressRecordings('session-new', storage, {
    plannerSessionId: 'sess-1',
    existingRecordingIds: ['rec-done'],
  });
  assert.deepEqual(recovered.map((recording) => recording.id), ['rec-old-run']);
  assert.equal(recovered[0].plannerSessionId, 'sess-1');
  assert.equal(await storage.audio.get('rec-done').text(), 'completo', 'complete audio not replaced by partial chunks');
  assert.equal(storage.inProgress.size, 0);
});

test('captures are tagged with the agenda id for later recovery', async () => {
  await withFakeMedia(async ({recorder}) => {
    const begins = [];
    const controller = new RecordingController({chunkSink: {begin: (meta) => begins.push(meta), append: () => {}}});
    await controller.startRecording('session-1', 'b1', 'Bloque', null, null, ['microphone'], {plannerSessionId: 'sess-1'});
    recorder().emit('x');
    const entity = await controller.finalizeRecording();
    assert.equal(begins[0].plannerSessionId, 'sess-1');
    assert.equal(entity.plannerSessionId, 'sess-1');
  });
});
