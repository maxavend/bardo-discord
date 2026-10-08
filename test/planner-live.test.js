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
  // El nombre de la reunión es el título; el estado va en la etiqueta.
  assert.equal(recap.statusLabel, 'Terminada');
  assert.doesNotMatch(recap.recapTitle, /Reunión terminada/);
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

// ── Review fixes ───────────────────────────────────────────────────────────

import {finishLiveSessionWith, skipActivePoint, skipActiveBlock, saveFinalizedRecording} from '../activity-app/src/planner/session-runner.js';
import {resolveTimeCommit, parseTime24, formatTime24} from '../activity-app/src/components/ui/time-picker-utils.js';

function sessionAtLastTema() {
  let session = createLiveSession(PLANNER, T0);
  session = advanceLiveSession(PLANNER, session, T0 + MINUTE);
  session = advanceLiveSession(PLANNER, session, T0 + 2 * MINUTE);
  session = advanceLiveSession(PLANNER, session, T0 + 3 * MINUTE); // b3/t3, the last tema
  return session;
}

test('skipping the last tema/bloque would end the meeting, so it must be confirmed first', () => {
  const last = sessionAtLastTema();
  assert.equal(skipActivePoint(PLANNER, last, T0 + 4 * MINUTE).status, SESSION_STATUS.COMPLETED);
  assert.equal(skipActiveBlock(PLANNER, last, T0 + 4 * MINUTE).status, SESSION_STATUS.COMPLETED);
  // Not the last: skipping just moves on (no confirmation needed).
  assert.equal(skipActivePoint(PLANNER, createLiveSession(PLANNER, T0), T0 + MINUTE).status, SESSION_STATUS.RUNNING);
});

test('finishLiveSessionWith applies the confirmed action and always ends the meeting', () => {
  const last = sessionAtLastTema();
  const advanced = finishLiveSessionWith('advance', PLANNER, last, T0 + 5 * MINUTE);
  assert.equal(advanced.status, SESSION_STATUS.COMPLETED);
  assert.equal(advanced.pointStatuses.t3, POINT_STATUS.DONE);

  const skipped = finishLiveSessionWith('skip-point', PLANNER, last, T0 + 5 * MINUTE);
  assert.equal(skipped.status, SESSION_STATUS.COMPLETED);
  assert.equal(skipped.pointStatuses.t3, POINT_STATUS.SKIPPED);

  const fromMenu = finishLiveSessionWith('finish', PLANNER, createLiveSession(PLANNER, T0), T0 + MINUTE);
  assert.equal(fromMenu.status, SESSION_STATUS.COMPLETED);
  assert.notEqual(fromMenu.pointStatuses.t1, POINT_STATUS.DONE, 'ending from the menu marks nothing');
});

test('the finished recording is merged into the CURRENT state, keeping changes made while it was saved', () => {
  const committed = advanceLiveSession(PLANNER, createLiveSession(PLANNER, T0), T0 + MINUTE);
  // While the previous audio part is being saved, the group adds +5 min and ticks a tema.
  const current = setPointStatus(extendActiveBlock(committed, 'b1', 5), 't1', POINT_STATUS.PENDING);
  const merged = saveFinalizedRecording(current, {id: 'rec-1', pointId: 't1'});
  assert.equal(merged.blockExtensions.b1.extensionMinutes, 5);
  assert.equal(merged.pointStatuses.t1, POINT_STATUS.PENDING);
  assert.deepEqual(merged.recordings.map((recording) => recording.id), ['rec-1']);
});

test('rollover while the meeting is paused starts the new part paused, and track listeners never pile up', async () => {
  const previousNavigator = globalThis.navigator;
  const previousMediaRecorder = globalThis.MediaRecorder;
  const listeners = new Set();
  const track = {
    stop() {},
    addEventListener(type, fn) { if (type === 'ended') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'ended') listeners.delete(fn); },
  };
  const stream = {getTracks: () => [track]};
  class SlowStopRecorder extends FakeMediaRecorder {
    stop() { this.state = 'inactive'; } // onstop delivered later
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {mediaDevices: {getUserMedia: async () => stream}},
  });
  globalThis.MediaRecorder = SlowStopRecorder;
  FakeMediaRecorder.instances = [];
  try {
    const controller = new RecordingController();
    await controller.startRecording('s1', 'b1', 'Novedades', 't1', 'Uno');
    controller.pauseRecording();
    assert.equal(listeners.size, 1);

    const pending = controller.rolloverRecording({blockId: 'b1', pointId: 't2', pointTitle: 'Dos', startPaused: true});
    // Synchronously paused: nothing is captured while the old part is still stopping.
    assert.equal(controller.getStatus(), RECORDING_STATUS.PAUSED);
    assert.equal(FakeMediaRecorder.instances.at(-1).state, 'paused');
    assert.equal(controller.getElapsedRecordingMs(Date.now() + 60_000), 0);
    assert.equal(listeners.size, 1, 'the previous recorder listener was removed');

    FakeMediaRecorder.instances[0].onstop?.();
    const previous = await pending;
    assert.equal(previous.pointId, 't1');

    controller.resumeRecording();
    assert.equal(controller.getStatus(), RECORDING_STATUS.RECORDING);
    controller.cleanup({clearContext: true});
    assert.equal(listeners.size, 0);
  } finally {
    if (previousNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', {configurable: true, value: previousNavigator});
    if (previousMediaRecorder === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previousMediaRecorder;
  }
});

test('time picker only writes on close when the user actually changed the time', () => {
  const loaded = parseTime24('15:30');
  assert.deepEqual(loaded, {hour12: 3, minute: 30, period: 'PM'});
  // Opened and closed without touching anything: never overwrite (a colleague may have changed it).
  assert.equal(resolveTimeCommit({dirty: false, hour: '03', minute: '30', period: 'PM', value: '16:00'}), null);
  // Touched but ended on the same value: nothing to write.
  assert.equal(resolveTimeCommit({dirty: true, hour: '03', minute: '30', period: 'PM', value: '15:30'}), null);
  assert.equal(resolveTimeCommit({dirty: true, hour: '04', minute: '30', period: 'PM', value: '15:30'}), '16:30');
  assert.equal(resolveTimeCommit({dirty: true, hour: '13', minute: '75', period: 'AM', value: '15:30'}), '00:59');
  assert.equal(formatTime24(12, 0, 'AM'), '00:00');
});
