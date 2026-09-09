import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_STATUS,
  POINT_STATUS,
  createLiveSession,
  migrateLiveSessionState,
  getActivePoint,
  getPointStatus,
  getPointCounts,
  getElapsedSessionMs,
  getElapsedActiveBlockMs,
  getBlockPlannedMs,
  getRemainingActiveBlockMs,
  pauseLiveSession,
  resumeLiveSession,
  advanceLiveSession,
  skipActivePoint,
  skipActiveBlock,
  extendActiveBlock,
  setUnlimitedActiveBlock,
  interruptLiveSession,
  resumeInterruptedSession,
  saveFinalizedRecording,
  recalculateEstimatedEndTime,
} from '../activity-app/src/planner/session-runner.js';
import {
  evaluateSessionAssistant,
  getAssistantContextDetails,
  ASSISTANT_EVENT,
  formatMsToClock,
  computeSessionRecap,
} from '../activity-app/src/planner/session-assistant-engine.js';
import {
  persistRecordingBinary,
  hydrateRecordingBinary,
} from '../activity-app/src/planner/recording-storage.js';
import {RecordingController, RECORDING_STATUS} from '../activity-app/src/planner/recording-controller.js';
import {createSessionTransitionGuard} from '../activity-app/src/planner/session-transition-guard.js';

const START = 1_000_000;
const MINUTE = 60_000;

const PLANNER = {
  title: 'Weekly Diseño',
  startTime: '10:00',
  totalCalculatedDuration: 45,
  blocks: [
    {
      id: 'block-1',
      title: 'Revisión ORION',
      durationMinutes: 15,
      introDesc: 'Revisión de los principales flujos.',
      subpoints: [
        {id: 'p1', title: 'Prototipo navegable', status: 'pending'},
        {id: 'p2', title: 'Bloqueo SIM', status: 'pending'},
        {id: 'p3', title: 'Mi Plan', status: 'pending'},
      ],
      decisions: [],
    },
    {
      id: 'block-2',
      title: 'Cierre',
      durationMinutes: 20,
      subpoints: [{id: 'p4', title: 'Feedback final', status: 'pending'}],
      decisions: [],
    },
    {
      id: 'block-3',
      title: 'Break',
      durationMinutes: 10,
      subpoints: [],
      decisions: [],
    },
  ],
};

function createMemoryRecordingStorage() {
  const data = new Map();
  return {
    data,
    async save(id, blob) {
      data.set(id, blob);
      return id;
    },
    async get(id) {
      return data.get(id) || null;
    },
    async delete(id) {
      data.delete(id);
    },
  };
}

test('Active Point: start activates first block and first pending point', () => {
  const session = createLiveSession(PLANNER, START);
  assert.equal(session.status, SESSION_STATUS.RUNNING);
  assert.equal(session.liveActiveBlockId, 'block-1');
  assert.equal(session.liveActivePointId, 'p1');
  assert.equal(getActivePoint(PLANNER, session)?.title, 'Prototipo navegable');
  assert.equal(getPointStatus(session, 'p1'), POINT_STATUS.ACTIVE);
});

test('Active Point + Timer: next advances point without resetting block timer', () => {
  const session = createLiveSession(PLANNER, START);
  const blockStartedAt = session.activeBlockStartedAt;
  const before = getElapsedActiveBlockMs(session, START + 5 * MINUTE);

  const next = advanceLiveSession(PLANNER, session, START + 5 * MINUTE);

  assert.equal(next.liveActiveBlockId, 'block-1');
  assert.equal(next.liveActivePointId, 'p2');
  assert.equal(next.activeBlockStartedAt, blockStartedAt);
  assert.equal(next.pointStatuses.p1, POINT_STATUS.DONE);
  assert.equal(getElapsedActiveBlockMs(next, START + 5 * MINUTE), before);
  assert.deepEqual(next.completedBlockIds, []);
});

test('Active Point + Timer: last point starts next block and resets block timer', () => {
  let session = createLiveSession(PLANNER, START);
  session = advanceLiveSession(PLANNER, session, START + 2 * MINUTE);
  session = advanceLiveSession(PLANNER, session, START + 4 * MINUTE);

  const transitionAt = START + 7 * MINUTE;
  session = advanceLiveSession(PLANNER, session, transitionAt);

  assert.equal(session.liveActiveBlockId, 'block-2');
  assert.equal(session.liveActivePointId, 'p4');
  assert.equal(session.activeBlockStartedAt, transitionAt);
  assert.equal(getElapsedActiveBlockMs(session, transitionAt), 0);
  assert.deepEqual(session.completedBlockIds, ['block-1']);
  assert.equal(session.pointStatuses.p3, POINT_STATUS.DONE);
});

test('Block with 0 Points: active point is null and next advances the block/session', () => {
  const planner = {
    title: 'Break only',
    startTime: '10:00',
    totalCalculatedDuration: 10,
    blocks: [{id: 'break', title: 'Break', durationMinutes: 10, subpoints: []}],
  };
  let session = createLiveSession(planner, START);
  assert.equal(session.liveActivePointId, null);
  session = advanceLiveSession(planner, session, START + MINUTE);
  assert.equal(session.status, SESSION_STATUS.COMPLETED);
  assert.deepEqual(session.completedBlockIds, ['break']);
});

test('Point Skip: skipped is distinct from done and block timer continues', () => {
  let session = createLiveSession(PLANNER, START);
  const blockStartedAt = session.activeBlockStartedAt;
  session = skipActivePoint(PLANNER, session, START + 3 * MINUTE);

  assert.equal(session.pointStatuses.p1, POINT_STATUS.SKIPPED);
  assert.equal(getPointStatus(session, 'p1'), POINT_STATUS.SKIPPED);
  assert.equal(session.liveActivePointId, 'p2');
  assert.equal(session.activeBlockStartedAt, blockStartedAt);
  assert.deepEqual(session.completedBlockIds, []);
});

test('Block skip does not mark pending Points done', () => {
  let session = createLiveSession(PLANNER, START);
  session = skipActiveBlock(PLANNER, session, START + MINUTE);
  assert.equal(session.liveActiveBlockId, 'block-2');
  assert.equal(session.liveActivePointId, 'p4');
  assert.deepEqual(session.skippedBlockIds, ['block-1']);
  assert.equal(session.pointStatuses.p1, POINT_STATUS.PENDING);
  assert.equal(session.pointStatuses.p2, POINT_STATUS.PENDING);
  assert.equal(session.pointStatuses.p3, POINT_STATUS.PENDING);
});

test('Time model: extensions belong to Block and update estimated Session end', () => {
  let session = createLiveSession(PLANNER, START);
  const block = PLANNER.blocks[0];
  assert.equal(getBlockPlannedMs(block, session), 15 * MINUTE);

  session = extendActiveBlock(session, 'block-1', 10);
  assert.equal(getBlockPlannedMs(block, session), 25 * MINUTE);
  assert.equal(recalculateEstimatedEndTime(PLANNER, session), '10:55');
  assert.equal(session.liveActivePointId, 'p1');
});

test('Time expired: does not auto-advance the active Point and overtime remains navigable', () => {
  let session = createLiveSession(PLANNER, START);
  const expiredAt = START + 16 * MINUTE;
  const evaluation = evaluateSessionAssistant(PLANNER, session, expiredAt);

  assert.equal(evaluation.event, ASSISTANT_EVENT.BLOCK_TIME_EXPIRED);
  assert.equal(evaluation.isExpired, true);
  assert.equal(evaluation.overtimeMs, MINUTE);
  assert.equal(session.liveActivePointId, 'p1');

  session = extendActiveBlock(session, 'block-1', 10);
  assert.equal(session.liveActivePointId, 'p1');
  assert.equal(getRemainingActiveBlockMs(PLANNER.blocks[0], session, expiredAt), 9 * MINUTE);
});

test('Unlimited time remains a Block setting without changing active Point', () => {
  const session = createLiveSession(PLANNER, START);
  const unlimited = setUnlimitedActiveBlock(session, 'block-1');
  const evaluation = evaluateSessionAssistant(PLANNER, unlimited, START + 40 * MINUTE);
  assert.equal(evaluation.event, ASSISTANT_EVENT.BLOCK_UNLIMITED);
  assert.equal(evaluation.isExpired, false);
  assert.equal(unlimited.liveActivePointId, 'p1');
});

test('Session pause/resume freezes Block timer and does not mutate Point', () => {
  let session = createLiveSession(PLANNER, START);
  session = pauseLiveSession(session, START + 3 * MINUTE);
  assert.equal(session.status, SESSION_STATUS.PAUSED);
  assert.equal(session.liveActivePointId, 'p1');
  assert.equal(getElapsedActiveBlockMs(session, START + 8 * MINUTE), 3 * MINUTE);

  session = resumeLiveSession(session, START + 8 * MINUTE);
  assert.equal(session.status, SESSION_STATUS.RUNNING);
  assert.equal(session.liveActivePointId, 'p1');
  assert.equal(session.accumulatedPausedMs, 5 * MINUTE);
  assert.equal(getElapsedActiveBlockMs(session, START + 10 * MINUTE), 5 * MINUTE);
});

test('Interrupted: resume restores same Block and same Point without re-marking progress', () => {
  let session = createLiveSession(PLANNER, START);
  session = advanceLiveSession(PLANNER, session, START + 2 * MINUTE);
  const beforeStatuses = {...session.pointStatuses};

  session = interruptLiveSession(session, START + 4 * MINUTE);
  assert.equal(session.status, SESSION_STATUS.INTERRUPTED);
  assert.equal(session.liveActiveBlockId, 'block-1');
  assert.equal(session.liveActivePointId, 'p2');

  session = resumeInterruptedSession(session, START + 14 * MINUTE);
  assert.equal(session.status, SESSION_STATUS.RUNNING);
  assert.equal(session.liveActiveBlockId, 'block-1');
  assert.equal(session.liveActivePointId, 'p2');
  assert.deepEqual(session.pointStatuses, beforeStatuses);
  assert.equal(getElapsedSessionMs(session, START + 16 * MINUTE), 6 * MINUTE);
});

test('Migration: old live Session without liveActivePointId infers first pending point safely', () => {
  const oldState = {
    status: SESSION_STATUS.RUNNING,
    sessionId: 'legacy-session',
    sessionStartedAt: START,
    liveActiveBlockId: 'block-1',
    activeBlockStartedAt: START,
    completedBlockIds: [],
    skippedBlockIds: [],
    recordings: [{id: 'legacy-rec', blockId: 'block-1'}],
    decisions: [],
  };

  const migrated = migrateLiveSessionState(PLANNER, oldState);
  assert.equal(migrated.sessionId, 'legacy-session');
  assert.equal(migrated.liveActiveBlockId, 'block-1');
  assert.equal(migrated.liveActivePointId, 'p1');
  assert.equal(migrated.recordings.length, 1);
  assert.equal(migrated.pointStatuses.p1, POINT_STATUS.PENDING);
});

test('Recording + Next: recording remains associated with outgoing Point A', () => {
  let session = createLiveSession(PLANNER, START);
  const recording = {
    id: 'rec-p1',
    sessionId: session.sessionId,
    blockId: session.liveActiveBlockId,
    blockTitle: 'Revisión ORION',
    pointId: session.liveActivePointId,
    pointTitle: 'Prototipo navegable',
    durationMs: 90_000,
    status: 'saved',
    binaryStorage: 'indexeddb',
  };

  session = saveFinalizedRecording(session, recording);
  session = advanceLiveSession(PLANNER, session, START + 90_000);

  assert.equal(session.liveActivePointId, 'p2');
  assert.equal(session.recordings[0].pointId, 'p1');
  assert.equal(session.recordings[0].pointTitle, 'Prototipo navegable');
  assert.equal(session.pointStatuses.p1, POINT_STATUS.DONE);
});

test('Recording persistence: metadata + binary are retrievable after reload simulation', async () => {
  const storage = createMemoryRecordingStorage();
  const blob = new Blob(['bardo-audio'], {type: 'audio/webm'});
  const transient = {
    id: 'rec-durable',
    sessionId: 'session-1',
    blockId: 'block-1',
    pointId: 'p1',
    pointTitle: 'Prototipo navegable',
    durationMs: 12_000,
    status: 'pending',
    blob,
    blobUrl: 'blob:current-page',
  };

  const saved = await persistRecordingBinary(transient, storage);
  assert.equal(saved.status, 'saved');
  assert.equal(saved.binaryStorage, 'indexeddb');
  assert.equal(Object.hasOwn(saved, 'blob'), false);
  assert.equal(await storage.get('rec-durable'), blob);

  const metadataAfterReload = {...saved, blobUrl: '', status: 'pending'};
  const hydrated = await hydrateRecordingBinary(metadataAfterReload, storage, () => 'blob:rehydrated');
  assert.equal(hydrated.status, 'saved');
  assert.equal(hydrated.blobUrl, 'blob:rehydrated');
});

test('Recording persistence error never reports saved', async () => {
  const failingStorage = {
    async save() { throw new Error('quota exceeded'); },
    async get() { return null; },
    async delete() {},
  };
  const result = await persistRecordingBinary({
    id: 'rec-error',
    blob: new Blob(['x'], {type: 'audio/webm'}),
    status: 'pending',
  }, failingStorage);
  assert.equal(result.status, 'error');
  assert.equal(result.binaryStorage, null);
  assert.match(result.persistenceError, /quota exceeded/);
});

test('Recording pause/resume keeps the same recordingId', async () => {
  const previousNavigator = globalThis.navigator;
  const previousMediaRecorder = globalThis.MediaRecorder;

  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor() {
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
    }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({data: new Blob(['audio'], {type: 'audio/webm'})});
      this.onstop?.();
    }
  }

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({getTracks: () => [{stop() {}}]}),
      },
    },
  });
  globalThis.MediaRecorder = FakeMediaRecorder;

  try {
    const controller = new RecordingController();
    const recordingId = await controller.startRecording('s1', 'block-1', 'ORION', 'p1', 'Prototipo');
    assert.equal(controller.getStatus(), RECORDING_STATUS.RECORDING);
    assert.equal(controller.getCurrentRecordingId(), recordingId);

    controller.pauseRecording();
    assert.equal(controller.getStatus(), RECORDING_STATUS.PAUSED);
    assert.equal(controller.getCurrentRecordingId(), recordingId);

    controller.resumeRecording();
    assert.equal(controller.getStatus(), RECORDING_STATUS.RECORDING);
    assert.equal(controller.getCurrentRecordingId(), recordingId);

    controller.pauseRecording();
    const entity = await controller.finalizeRecording();
    assert.equal(entity.id, recordingId);
    assert.equal(entity.pointId, 'p1');
    assert.equal(entity.status, 'pending');
    assert.ok(entity.blob instanceof Blob);
  } finally {
    if (previousNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', {configurable: true, value: previousNavigator});
    if (previousMediaRecorder === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previousMediaRecorder;
  }
});

test('Atomic Next: double invocation executes only one transition while finalize/persist is pending', async () => {
  const guard = createSessionTransitionGuard();
  let transitions = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });

  const first = guard.run(async () => {
    transitions += 1;
    await pending;
    return 'advanced-once';
  });
  const second = guard.run(async () => {
    transitions += 1;
    return 'advanced-twice';
  });

  assert.equal(guard.isActive, true);
  const secondResult = await second;
  assert.equal(secondResult.executed, false);
  assert.equal(transitions, 1);

  release();
  const firstResult = await first;
  assert.equal(firstResult.executed, true);
  assert.equal(firstResult.value, 'advanced-once');
  assert.equal(guard.isActive, false);
  assert.equal(transitions, 1);
});

test('Assistant: CTA predicts point, block and session transitions', () => {
  let session = createLiveSession(PLANNER, START);
  let details = getAssistantContextDetails(PLANNER, session, START + MINUTE);
  assert.equal(details.blockProgressLabel, 'Bloque 1 de 3');
  assert.equal(details.pointProgressLabel, 'Punto 1 de 3');
  assert.equal(details.primaryAction.label, 'Siguiente punto');
  assert.equal(details.stateTitle, 'Prototipo navegable');

  session = advanceLiveSession(PLANNER, session, START + 2 * MINUTE);
  session = advanceLiveSession(PLANNER, session, START + 3 * MINUTE);
  details = getAssistantContextDetails(PLANNER, session, START + 4 * MINUTE);
  assert.equal(details.primaryAction.label, 'Siguiente bloque');

  session = advanceLiveSession(PLANNER, session, START + 5 * MINUTE);
  details = getAssistantContextDetails(PLANNER, session, START + 6 * MINUTE);
  assert.equal(details.primaryAction.label, 'Siguiente bloque');

  session = advanceLiveSession(PLANNER, session, START + 7 * MINUTE);
  details = getAssistantContextDetails(PLANNER, session, START + 8 * MINUTE);
  assert.equal(details.primaryAction.label, 'Finalizar sesión');
});

test('Assistant: expired Block keeps current Point and presents overtime context', () => {
  const session = createLiveSession(PLANNER, START);
  const details = getAssistantContextDetails(PLANNER, session, START + 16 * MINUTE);
  assert.equal(details.stateVariant, 'expired');
  assert.equal(details.activePoint.id, 'p1');
  assert.equal(details.nextAction.label, 'Siguiente punto');
  assert.match(details.contextualHelperText, /sigue activo/);
});

test('Point progress counts done and skipped separately', () => {
  let session = createLiveSession(PLANNER, START);
  session = advanceLiveSession(PLANNER, session, START + MINUTE);
  session = skipActivePoint(PLANNER, session, START + 2 * MINUTE);
  const counts = getPointCounts(PLANNER, session);
  assert.equal(counts.total, 4);
  assert.equal(counts.done, 1);
  assert.equal(counts.skipped, 1);
});

test('Recap: blocks, treated Points, skipped Points and recordings use exact semantics', () => {
  let session = createLiveSession(PLANNER, START);
  session = saveFinalizedRecording(session, {
    id: 'rec-1',
    sessionId: session.sessionId,
    blockId: 'block-1',
    blockTitle: 'Revisión ORION',
    pointId: 'p1',
    pointTitle: 'Prototipo navegable',
    durationMs: 3 * MINUTE,
    status: 'saved',
  });
  session = advanceLiveSession(PLANNER, session, START + MINUTE);
  session = skipActivePoint(PLANNER, session, START + 2 * MINUTE);
  session = interruptLiveSession(session, START + 13 * MINUTE);

  const recap = computeSessionRecap(PLANNER, session);
  assert.equal(recap.isInterrupted, true);
  assert.equal(recap.actualDurationMinutes, 13);
  assert.equal(recap.completedCount, 0);
  assert.equal(recap.totalBlocksCount, 3);
  assert.equal(recap.completedPointsCount, 1);
  assert.equal(recap.skippedPointsCount, 1);
  assert.equal(recap.totalPointsCount, 4);
  assert.equal(recap.totalRecordingsCount, 1);
  assert.equal(recap.groupedRecordings[0].block.id, 'block-1');
  assert.equal(recap.groupedRecordings[0].pointGroups[0].point.id, 'p1');
  assert.equal(recap.groupedRecordings[0].pointGroups[0].recordings[0].id, 'rec-1');
});

test('formatMsToClock formats remaining and overtime clocks', () => {
  assert.equal(formatMsToClock(300_000), '05:00');
  assert.equal(formatMsToClock(75_000), '01:15');
  assert.equal(formatMsToClock(45_000, true), '+00:45');
  assert.equal(formatMsToClock(-125_000), '-02:05');
});

test('End-to-end domain scenario: 3 Blocks (3 Points, 4 Points, 0 Points) converges predictably', () => {
  const planner = {
    title: 'Product validation',
    startTime: '19:00',
    totalCalculatedDuration: 35,
    blocks: [
      {id: 'b1', title: 'ORION', durationMinutes: 10, subpoints: [
        {id: 'a1', title: 'Prototype', status: 'pending'},
        {id: 'a2', title: 'SIM', status: 'pending'},
        {id: 'a3', title: 'Plan', status: 'pending'},
      ]},
      {id: 'b2', title: 'Review', durationMinutes: 15, subpoints: [
        {id: 'b1p', title: 'One', status: 'pending'},
        {id: 'b2p', title: 'Two', status: 'pending'},
        {id: 'b3p', title: 'Three', status: 'pending'},
        {id: 'b4p', title: 'Four', status: 'pending'},
      ]},
      {id: 'b3', title: 'Break', durationMinutes: 10, subpoints: []},
    ],
  };

  let session = createLiveSession(planner, START);
  assert.deepEqual([session.liveActiveBlockId, session.liveActivePointId], ['b1', 'a1']);

  session = advanceLiveSession(planner, session, START + 2 * MINUTE);
  assert.equal(session.liveActivePointId, 'a2');

  assert.equal(evaluateSessionAssistant(planner, session, START + 11 * MINUTE).isExpired, true);
  assert.equal(session.liveActivePointId, 'a2');

  session = extendActiveBlock(session, 'b1', 10);
  assert.equal(recalculateEstimatedEndTime(planner, session), '19:45');
  session = advanceLiveSession(planner, session, START + 12 * MINUTE);
  session = advanceLiveSession(planner, session, START + 13 * MINUTE);
  assert.deepEqual([session.liveActiveBlockId, session.liveActivePointId], ['b2', 'b1p']);

  session = {
    ...session,
    decisions: [...session.decisions, {
      id: 'decision-1',
      sessionId: session.sessionId,
      blockId: session.liveActiveBlockId,
      pointId: session.liveActivePointId,
      timestamp: START + 14 * MINUTE,
      content: 'Decision in current Point',
    }],
  };
  assert.equal(session.decisions.at(-1).pointId, 'b1p');

  session = interruptLiveSession(session, START + 15 * MINUTE);
  const interruptedBlock = session.liveActiveBlockId;
  const interruptedPoint = session.liveActivePointId;
  session = resumeInterruptedSession(session, START + 20 * MINUTE);
  assert.equal(session.liveActiveBlockId, interruptedBlock);
  assert.equal(session.liveActivePointId, interruptedPoint);

  session = advanceLiveSession(planner, session, START + 21 * MINUTE);
  session = advanceLiveSession(planner, session, START + 22 * MINUTE);
  session = skipActivePoint(planner, session, START + 23 * MINUTE);
  assert.equal(session.liveActivePointId, 'b4p');
  session = advanceLiveSession(planner, session, START + 24 * MINUTE);
  assert.deepEqual([session.liveActiveBlockId, session.liveActivePointId], ['b3', null]);
  session = advanceLiveSession(planner, session, START + 25 * MINUTE);

  assert.equal(session.status, SESSION_STATUS.COMPLETED);
  assert.equal(session.liveActiveBlockId, null);
  assert.equal(session.liveActivePointId, null);
  assert.deepEqual(session.completedBlockIds, ['b1', 'b2', 'b3']);
  assert.equal(session.pointStatuses.b3p, POINT_STATUS.SKIPPED);
  assert.equal(getPointCounts(planner, session).done, 6);
  assert.equal(getPointCounts(planner, session).skipped, 1);
});
