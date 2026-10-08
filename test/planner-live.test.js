import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_STATUS,
  POINT_STATUS,
  createLiveSession,
  advanceLiveSession,
  pauseLiveSession,
  completeLiveSession,
  setPointStatus,
  reopenLiveSession,
  extendActiveBlock,
  setUnlimitedActiveBlock,
  dismissRecordingPrompt,
  getElapsedSessionMs,
} from '../activity-app/src/planner/session-runner.js';
import {
  getLivePrimaryAction,
  getLiveBlockClock,
  getAssistantContextDetails,
  computeSessionRecap,
} from '../activity-app/src/planner/session-assistant-engine.js';
import {
  RecordingController,
  RECORDING_STATUS,
  describeMicrophoneError,
  isMobileUserAgent,
} from '../activity-app/src/planner/recording-controller.js';

const MINUTE = 60_000;
const T0 = 5_000_000;

const PLANNER = {
  id: 'sess-live',
  title: 'Reunión semanal',
  startTime: '10:00',
  totalCalculatedDuration: 40,
  blocks: [
    {id: 'b1', title: 'Novedades', type: 'block', durationMinutes: 10, subpoints: [{id: 't1', title: 'Uno'}, {id: 't2', title: 'Dos'}]},
    {id: 'b2', title: 'Descanso', type: 'break', isBreak: true, durationMinutes: 10, subpoints: []},
    {id: 'b3', title: 'Cierre', type: 'block', durationMinutes: 20, subpoints: [{id: 't3', title: 'Tres'}]},
  ],
};

// ── Decision 10: adaptive primary action ──────────────────────────────────

test('primary action: Siguiente tema → Siguiente bloque → Terminar descanso → Terminar reunión', () => {
  let session = createLiveSession(PLANNER, T0);
  assert.equal(getLivePrimaryAction(PLANNER, session).label, 'Siguiente tema');

  session = advanceLiveSession(PLANNER, session, T0 + MINUTE); // t1 → t2
  assert.equal(getLivePrimaryAction(PLANNER, session).label, 'Siguiente bloque');

  session = advanceLiveSession(PLANNER, session, T0 + 2 * MINUTE); // → descanso
  assert.equal(session.liveActiveBlockId, 'b2');
  assert.equal(getLivePrimaryAction(PLANNER, session).label, 'Terminar descanso');

  session = advanceLiveSession(PLANNER, session, T0 + 3 * MINUTE); // → b3/t3 (last)
  const last = getLivePrimaryAction(PLANNER, session);
  assert.equal(last.label, 'Terminar reunión');
  assert.equal(last.key, 'finish');
});

test('primary never skips pending temas: an un-checked earlier tema comes before the next bloque', () => {
  let session = createLiveSession(PLANNER, T0);
  session = advanceLiveSession(PLANNER, session, T0 + MINUTE); // t1 done, t2 active
  session = setPointStatus(session, 't1', POINT_STATUS.PENDING); // un-checked during the meeting
  assert.equal(getLivePrimaryAction(PLANNER, session).label, 'Siguiente tema');
  session = advanceLiveSession(PLANNER, session, T0 + 2 * MINUTE);
  assert.equal(session.liveActiveBlockId, 'b1');
  assert.equal(session.liveActivePointId, 't1');
  assert.equal(session.pointStatuses.t2, POINT_STATUS.DONE);
});

test('without an active bloque there is still a way forward and a way to end', () => {
  const lost = {...createLiveSession(PLANNER, T0), liveActiveBlockId: null, liveActivePointId: null};
  assert.equal(getLivePrimaryAction(PLANNER, lost).label, 'Ir al bloque pendiente');
  const allDone = {...lost, completedBlockIds: ['b1', 'b2', 'b3']};
  assert.equal(getLivePrimaryAction(PLANNER, allDone).key, 'finish');
  assert.equal(getLivePrimaryAction({blocks: []}, lost).key, 'finish');
});

// ── Decision 10: dock clock ────────────────────────────────────────────────

test('dock clock shows remaining time, overtime as warning, and freezes while paused', () => {
  const session = createLiveSession(PLANNER, T0);
  const remaining = getLiveBlockClock(PLANNER, session, T0 + 4 * MINUTE);
  assert.equal(remaining.mode, 'remaining');
  assert.equal(remaining.label, 'Quedan 06:00');

  const overtime = getLiveBlockClock(PLANNER, session, T0 + 12 * MINUTE + 30_000);
  assert.equal(overtime.mode, 'overtime');
  assert.equal(overtime.label, '+02:30');
  assert.equal(overtime.isWarning, true);

  const paused = pauseLiveSession(session, T0 + 3 * MINUTE);
  const a = getLiveBlockClock(PLANNER, paused, T0 + 5 * MINUTE);
  const b = getLiveBlockClock(PLANNER, paused, T0 + 50 * MINUTE);
  assert.equal(a.label, 'Quedan 07:00');
  assert.equal(b.label, a.label, 'frozen during pause');
  assert.equal(b.isPaused, true);

  const extended = extendActiveBlock(session, 'b1', 5);
  assert.equal(getLiveBlockClock(PLANNER, extended, T0 + 4 * MINUTE).label, 'Quedan 11:00');
  const unlimited = setUnlimitedActiveBlock(session, 'b1');
  assert.match(getLiveBlockClock(PLANNER, unlimited, T0 + 4 * MINUTE).label, /^Sin límite · 04:00$/);
});

// ── Decision 1: reopen ────────────────────────────────────────────────────

test('a completed meeting can be reopened without counting the time it was closed', () => {
  let session = createLiveSession(PLANNER, T0);
  session = advanceLiveSession(PLANNER, session, T0 + MINUTE);
  session = advanceLiveSession(PLANNER, session, T0 + 2 * MINUTE); // b1 completed, in descanso
  const closed = completeLiveSession(session, T0 + 3 * MINUTE);
  assert.equal(closed.status, SESSION_STATUS.COMPLETED);
  const elapsedAtClose = getElapsedSessionMs(closed, T0 + 3 * MINUTE);

  const reopened = reopenLiveSession(PLANNER, closed, T0 + 60 * MINUTE);
  assert.equal(reopened.status, SESSION_STATUS.RUNNING);
  assert.equal(reopened.liveActiveBlockId, 'b2', 'first bloque not completed');
  assert.equal(reopened.sessionEndedAt, null);
  assert.equal(getElapsedSessionMs(reopened, T0 + 60 * MINUTE), elapsedAtClose);

  const fullyDone = {...closed, completedBlockIds: ['b1', 'b2', 'b3']};
  assert.equal(reopenLiveSession(PLANNER, fullyDone, T0 + 61 * MINUTE).liveActiveBlockId, 'b3');
  assert.equal(reopenLiveSession(PLANNER, session, T0 + 61 * MINUTE), session, 'running meeting unchanged');
});

test('recap uses the meeting vocabulary', () => {
  const closed = completeLiveSession(createLiveSession(PLANNER, T0), T0 + MINUTE);
  const recap = computeSessionRecap(PLANNER, closed);
  assert.equal(recap.statusLabel, 'Terminada');
  assert.match(recap.recapTitle, /^Reunión terminada · /);
  assert.match(recap.pointsProgressSubtext, /temas tratados$/);
});

// ── Decision 2: recording prompt + continuation ───────────────────────────

test('the recording prompt is offered once per meeting until answered or recorded', () => {
  let session = createLiveSession(PLANNER, T0);
  assert.equal(getAssistantContextDetails(PLANNER, session, T0 + 1000).showInitialRecordingPrompt, true);
  const dismissed = dismissRecordingPrompt(session);
  session = advanceLiveSession(PLANNER, dismissed, T0 + MINUTE);
  assert.equal(getAssistantContextDetails(PLANNER, session, T0 + MINUTE).showInitialRecordingPrompt, false);
  const withRecording = {...createLiveSession(PLANNER, T0), recordings: [{id: 'r1'}]};
  assert.equal(getAssistantContextDetails(PLANNER, withRecording, T0).showInitialRecordingPrompt, false);
});

class FakeMediaRecorder {
  static instances = [];
  static isTypeSupported() { return true; }
  constructor(stream) {
    this.stream = stream;
    this.state = 'inactive';
    FakeMediaRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  emit(text) { this.ondataavailable?.({data: new Blob([text], {type: 'audio/webm'})}); }
  stop() {
    this.state = 'inactive';
    this.emit('-final');
    this.onstop?.();
  }
}

test('advancing while recording keeps recording into the next tema on the same microphone', async () => {
  const previousNavigator = globalThis.navigator;
  const previousMediaRecorder = globalThis.MediaRecorder;
  let getUserMediaCalls = 0;
  const stream = {getTracks: () => [{stop() {}, addEventListener() {}}]};
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {mediaDevices: {getUserMedia: async () => { getUserMediaCalls += 1; return stream; }}},
  });
  globalThis.MediaRecorder = FakeMediaRecorder;
  FakeMediaRecorder.instances = [];
  try {
    const begins = [];
    const controller = new RecordingController({chunkSink: {begin: (meta) => begins.push(meta), append: () => {}}});
    const firstId = await controller.startRecording('session-1', 'b1', 'Novedades', 't1', 'Uno');
    FakeMediaRecorder.instances[0].emit('uno');

    const finished = await controller.rolloverRecording({sessionId: 'session-1', blockId: 'b1', blockTitle: 'Novedades', pointId: 't2', pointTitle: 'Dos'});
    assert.equal(finished.id, firstId);
    assert.equal(finished.pointId, 't1');
    assert.equal(await finished.blob.text(), 'uno-final');

    assert.equal(controller.getStatus(), RECORDING_STATUS.RECORDING);
    assert.notEqual(controller.getCurrentRecordingId(), firstId);
    assert.equal(controller.getCurrentContext().pointTitle, 'Dos');
    assert.equal(getUserMediaCalls, 1, 'no new permission prompt');
    assert.equal(FakeMediaRecorder.instances[1].stream, stream);
    assert.deepEqual(begins.map((meta) => meta.pointId), ['t1', 't2']);

    FakeMediaRecorder.instances[1].emit('dos');
    const second = await controller.finalizeRecording();
    assert.equal(second.pointId, 't2');
    assert.equal(await second.blob.text(), 'dos-final');
    assert.equal(await controller.rolloverRecording({blockId: 'b2'}), null, 'nothing to continue when not recording');
  } finally {
    if (previousNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', {configurable: true, value: previousNavigator});
    if (previousMediaRecorder === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previousMediaRecorder;
  }
});

// ── Mic errors in plain Spanish ───────────────────────────────────────────

test('microphone errors explain how to allow the mic in Discord, never the raw browser text', () => {
  const denied = Object.assign(new Error('Permission denied'), {name: 'NotAllowedError'});
  const desktop = describeMicrophoneError(denied, {isMobile: false});
  assert.match(desktop, /permiso/i);
  assert.match(desktop, /Voz y video/);
  assert.doesNotMatch(desktop, /Permission denied|NotAllowedError/);
  assert.match(describeMicrophoneError(denied, {isMobile: true}), /Ajustes → Aplicaciones → Discord → Permisos/);
  assert.match(describeMicrophoneError(Object.assign(new Error('x'), {name: 'NotFoundError'})), /No encontramos un micrófono/);
  assert.match(describeMicrophoneError(Object.assign(new Error('x'), {name: 'NotReadableError'})), /ocupado/);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) discord/1.0'), false);
});
