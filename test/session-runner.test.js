import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_STATUS,
  createLiveSession,
  getElapsedSessionMs,
  getElapsedActiveBlockMs,
  getBlockPlannedMs,
  getRemainingActiveBlockMs,
  pauseLiveSession,
  resumeLiveSession,
  advanceToNextBlock,
  skipActiveBlock,
  extendActiveBlock,
  setUnlimitedActiveBlock,
  completeLiveSession,
  interruptLiveSession,
  resumeInterruptedSession,
  saveFinalizedRecording,
  renameRecordingInSession,
  deleteRecordingFromSession,
  addRecordingToSession,
  addDecisionToSession,
  recalculateEstimatedEndTime,
  dismissBlockRecordingPrompt,
} from '../activity-app/src/planner/session-runner.js';

import {
  evaluateSessionAssistant,
  getAssistantContextDetails,
  ASSISTANT_EVENT,
  formatMsToClock,
  computeSessionRecap,
} from '../activity-app/src/planner/session-assistant-engine.js';

const MOCK_PLANNER_STATE = {
  title: 'Weekly Diseño',
  startTime: '10:00',
  totalCalculatedDuration: 45,
  blocks: [
    {
      id: 'block-1',
      title: 'Apertura',
      durationMinutes: 15,
      subpoints: [{id: 'p1', title: 'Contexto', status: 'pending'}],
      decisions: [],
    },
    {
      id: 'block-2',
      title: 'Revisión ORION',
      durationMinutes: 30,
      subpoints: [{id: 'p2', title: 'Demo', status: 'pending'}],
      decisions: [],
    },
  ],
};

test('Session Runner: createLiveSession initializes with running status and first block', () => {
  const now = 1000000;
  const session = createLiveSession(MOCK_PLANNER_STATE, now);

  assert.equal(session.status, SESSION_STATUS.RUNNING);
  assert.equal(session.sessionStartedAt, now);
  assert.equal(session.liveActiveBlockId, 'block-1');
  assert.equal(session.activeBlockStartedAt, now);
  assert.equal(session.accumulatedPausedMs, 0);
  assert.deepEqual(session.completedBlockIds, []);
  assert.deepEqual(session.skippedBlockIds, []);
});

test('Session Runner: getElapsedActiveBlockMs and getRemainingActiveBlockMs calculate deterministically', () => {
  const start = 1000000;
  const session = createLiveSession(MOCK_PLANNER_STATE, start);
  const block = MOCK_PLANNER_STATE.blocks[0]; // 15 min = 900,000 ms

  const now5MinLater = start + 5 * 60 * 1000; // 300,000 ms later
  const elapsed = getElapsedActiveBlockMs(session, now5MinLater);
  const remaining = getRemainingActiveBlockMs(block, session, now5MinLater);

  assert.equal(elapsed, 300000);
  assert.equal(remaining, 600000); // 10 minutes remaining
});

test('Session Runner: pause and resume freeze and restore elapsed time properly', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  // Run for 3 minutes (180,000 ms)
  const pauseTime = start + 180000;
  session = pauseLiveSession(session, pauseTime);
  assert.equal(session.status, SESSION_STATUS.PAUSED);

  // While paused for 5 minutes (300,000 ms), elapsed time should stay at 180,000 ms
  const duringPause = pauseTime + 300000;
  assert.equal(getElapsedActiveBlockMs(session, duringPause), 180000);

  // Resume after 5 minutes pause
  session = resumeLiveSession(session, duringPause);
  assert.equal(session.status, SESSION_STATUS.RUNNING);
  assert.equal(session.accumulatedPausedMs, 300000);

  // Check 2 minutes after resume (total active run = 3m + 2m = 5m = 300,000 ms)
  const afterResume = duringPause + 120000;
  assert.equal(getElapsedActiveBlockMs(session, afterResume), 300000);
});

test('Session Runner: advanceToNextBlock marks current completed and activates next', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  const nextTime = start + 900000;
  session = advanceToNextBlock(MOCK_PLANNER_STATE, session, nextTime);

  assert.equal(session.liveActiveBlockId, 'block-2');
  assert.equal(session.activeBlockStartedAt, nextTime);
  assert.deepEqual(session.completedBlockIds, ['block-1']);
});

test('Session Runner: advancing after last block completes the session', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  // Advance to block 2
  session = advanceToNextBlock(MOCK_PLANNER_STATE, session, start + 900000);
  // Advance after block 2 (end of agenda)
  const endTime = start + 2700000;
  session = advanceToNextBlock(MOCK_PLANNER_STATE, session, endTime);

  assert.equal(session.status, SESSION_STATUS.COMPLETED);
  assert.equal(session.sessionEndedAt, endTime);
  assert.equal(session.liveActiveBlockId, null);
  assert.deepEqual(session.completedBlockIds, ['block-1', 'block-2']);
});

test('Session Runner: skipActiveBlock records block in skippedBlockIds without marking completed', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  session = skipActiveBlock(MOCK_PLANNER_STATE, session, start + 60000);
  assert.equal(session.liveActiveBlockId, 'block-2');
  assert.deepEqual(session.skippedBlockIds, ['block-1']);
  assert.deepEqual(session.completedBlockIds, []);
});

test('Session Runner: extendActiveBlock increases planned time and recalculates estimated end', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  const block1 = MOCK_PLANNER_STATE.blocks[0]; // base 15m
  assert.equal(getBlockPlannedMs(block1, session), 900000);

  session = extendActiveBlock(session, 'block-1', 10);
  assert.equal(getBlockPlannedMs(block1, session), 1500000); // 25m

  // Original estimated end with 45m from 10:00 -> 10:45
  // With +10m extension -> 10:55
  const estimatedEnd = recalculateEstimatedEndTime(MOCK_PLANNER_STATE, session);
  assert.equal(estimatedEnd, '10:55');
});

test('Session Runner: interruptLiveSession and resumeInterruptedSession manage lifecycle safely', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  // Run for 10 minutes (600,000 ms) and interrupt
  const interruptTime = start + 600000;
  session = interruptLiveSession(session, interruptTime);

  assert.equal(session.status, SESSION_STATUS.INTERRUPTED);
  assert.equal(session.sessionEndedAt, interruptTime);
  assert.equal(session.liveActiveBlockId, 'block-1'); // preserves block position

  // Interrupted for 15 minutes (900,000 ms), then resumed
  const resumeTime = interruptTime + 900000;
  session = resumeInterruptedSession(session, resumeTime);

  assert.equal(session.status, SESSION_STATUS.RUNNING);
  assert.equal(session.sessionEndedAt, null);
  assert.equal(session.accumulatedPausedMs, 900000);

  // Check elapsed time 2 minutes after resumption (10m + 2m = 12m = 720,000 ms)
  const afterResumeTime = resumeTime + 120000;
  assert.equal(getElapsedSessionMs(session, afterResumeTime), 720000);
});

test('Session Runner: saveFinalizedRecording, renameRecordingInSession and deleteRecordingFromSession manage entities', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  const recording1 = {
    id: 'rec-1',
    sessionId: session.sessionId,
    blockId: 'block-1',
    blockTitle: 'Apertura',
    pointId: 'p1',
    pointTitle: 'Contexto',
    name: 'Contexto de apertura',
    durationMs: 240000,
    sources: ['microphone'],
    sourcesLabel: 'Micrófono',
    status: 'saved',
  };

  session = saveFinalizedRecording(session, recording1);
  assert.equal(session.recordings.length, 1);
  assert.equal(session.recordings[0].name, 'Contexto de apertura');

  // Rename
  session = renameRecordingInSession(session, 'rec-1', 'Introducción ejecutiva');
  assert.equal(session.recordings[0].name, 'Introducción ejecutiva');

  // Delete
  session = deleteRecordingFromSession(session, 'rec-1');
  assert.equal(session.recordings.length, 0);
});

test('Session Assistant Engine: emits 5-min warning and expiration events correctly', () => {
  const start = 1000000;
  const session = createLiveSession(MOCK_PLANNER_STATE, start);
  const block1 = MOCK_PLANNER_STATE.blocks[0]; // 15m

  // At 11 minutes (4 min remaining -> should trigger 5 min warning)
  const at11Min = start + 11 * 60 * 1000;
  const evalWarning = evaluateSessionAssistant(MOCK_PLANNER_STATE, session, at11Min);
  assert.equal(evalWarning.event, ASSISTANT_EVENT.BLOCK_5_MIN_REMAINING);
  assert.equal(evalWarning.is5MinWarning, true);
  assert.equal(evalWarning.isExpired, false);

  // At 16 minutes (1 min overtime -> should trigger expired event)
  const at16Min = start + 16 * 60 * 1000;
  const evalExpired = evaluateSessionAssistant(MOCK_PLANNER_STATE, session, at16Min);
  assert.equal(evalExpired.event, ASSISTANT_EVENT.BLOCK_TIME_EXPIRED);
  assert.equal(evalExpired.isExpired, true);
  assert.equal(evalExpired.overtimeMs, 60000); // 1 min overtime

  // With unlimited set, event becomes BLOCK_UNLIMITED without expired alarm
  const sessionUnlimited = setUnlimitedActiveBlock(session, 'block-1');
  const evalUnlimited = evaluateSessionAssistant(MOCK_PLANNER_STATE, sessionUnlimited, at16Min);
  assert.equal(evalUnlimited.event, ASSISTANT_EVENT.BLOCK_UNLIMITED);
  assert.equal(evalUnlimited.isExpired, false);
});

test('Session Assistant Engine: getAssistantContextDetails generates dynamic hierarchy and CTAs', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  // 1. Running state
  const runningDetails = getAssistantContextDetails(MOCK_PLANNER_STATE, session, start + 60000);
  assert.equal(runningDetails.blockProgressLabel, 'Bloque 1 de 2');
  assert.equal(runningDetails.primaryAction.label, 'Siguiente →');
  assert.equal(runningDetails.secondaryAction.label, 'Pausar');
  assert.equal(runningDetails.showInitialRecordingPrompt, true);

  // Dismiss prompt
  session = dismissBlockRecordingPrompt(session, 'block-1');
  const afterDismiss = getAssistantContextDetails(MOCK_PLANNER_STATE, session, start + 60000);
  assert.equal(afterDismiss.showInitialRecordingPrompt, false);

  // 2. Paused state
  session = pauseLiveSession(session, start + 120000);
  const pausedDetails = getAssistantContextDetails(MOCK_PLANNER_STATE, session, start + 120000);
  assert.equal(pausedDetails.stateVariant, 'paused');
  assert.equal(pausedDetails.primaryAction.label, 'Reanudar sesión');
  assert.equal(pausedDetails.contextualHelperText, 'El tiempo y la grabación están pausados.');

  // 3. Expired state (after 16 minutes)
  session = resumeLiveSession(session, start + 120000);
  const expiredDetails = getAssistantContextDetails(MOCK_PLANNER_STATE, session, start + 16 * 60 * 1000);
  assert.equal(expiredDetails.stateVariant, 'expired');
  assert.equal(expiredDetails.isExpired, true);
  assert.match(expiredDetails.contextualHelperText, /¿Continuamos o pasamos al siguiente punto\?/);
});

test('Session Assistant Engine: formatMsToClock formats positive and overtime clocks', () => {
  assert.equal(formatMsToClock(300000), '05:00');
  assert.equal(formatMsToClock(75000), '01:15');
  assert.equal(formatMsToClock(45000, true), '+00:45');
  assert.equal(formatMsToClock(-125000), '-02:05');
});

test('Session Assistant Engine: computeSessionRecap produces deterministic recap for Completed & Interrupted', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  session = saveFinalizedRecording(session, {
    id: 'rec-1',
    blockId: 'block-1',
    blockTitle: 'Apertura',
    pointId: 'p1',
    pointTitle: 'Contexto',
    name: 'Contexto de apertura',
    durationMs: 180000, // 3 min
    sourcesLabel: 'Micrófono',
  });

  session = addDecisionToSession(session, {
    id: 'd-1',
    blockId: 'block-1',
    content: 'Se aprueba el roadmap',
  });

  // 1. Interrupted Session Recap
  session = interruptLiveSession(session, start + 780000); // 13 min elapsed
  const interruptedRecap = computeSessionRecap(MOCK_PLANNER_STATE, session);
  assert.equal(interruptedRecap.isInterrupted, true);
  assert.equal(interruptedRecap.statusLabel, 'Interrumpida');
  assert.equal(interruptedRecap.actualDurationMinutes, 13);
  assert.equal(interruptedRecap.totalRecordingsCount, 1);
  assert.equal(interruptedRecap.totalRecordedMinutes, 3);
  assert.equal(interruptedRecap.decisions.length, 1);
  assert.match(interruptedRecap.recapDescription, /Se conservaron 13 min/);

  // 2. Completed Session Recap
  session = completeLiveSession(session, start + 1800000); // 30 min elapsed
  const completedRecap = computeSessionRecap(MOCK_PLANNER_STATE, session);
  assert.equal(completedRecap.isCompleted, true);
  assert.equal(completedRecap.statusLabel, 'Completada');
  assert.equal(completedRecap.actualDurationMinutes, 30);
  assert.equal(completedRecap.plannedDurationMinutes, 45);
});

test('Session Lifecycle: active recording auto-persists to previous point when advancing with zero pending modal', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);
  assert.equal(session.liveActiveBlockId, 'block-1');

  // Simulate active recording on block-1 / point p1
  const activeRecording = {
    id: 'rec-active-1',
    sessionId: session.sessionId,
    blockId: 'block-1',
    blockTitle: 'Apertura',
    pointId: 'p1',
    pointTitle: 'Contexto',
    name: 'Contexto',
    durationMs: 320000,
    sources: ['microphone'],
    sourcesLabel: 'Micrófono',
    status: 'saved',
  };

  // User hits "Siguiente ->": auto-persists recording & advances without pending modal
  session = saveFinalizedRecording(session, activeRecording);
  session = advanceToNextBlock(MOCK_PLANNER_STATE, session, start + 320000);

  // Verify previous point has its recording saved correctly
  assert.equal(session.recordings.length, 1);
  assert.equal(session.recordings[0].blockId, 'block-1');
  assert.equal(session.recordings[0].pointId, 'p1');
  assert.equal(session.recordings[0].name, 'Contexto');

  // Verify next block is live and previous is marked completed
  assert.equal(session.liveActiveBlockId, 'block-2');
  assert.deepEqual(session.completedBlockIds, ['block-1']);
});

test('Session Lifecycle: active recording auto-persists and conserves artifacts when interrupting session', () => {
  const start = 1000000;
  let session = createLiveSession(MOCK_PLANNER_STATE, start);

  const activeRecording = {
    id: 'rec-interrupt',
    sessionId: session.sessionId,
    blockId: 'block-1',
    blockTitle: 'Apertura',
    pointId: 'p1',
    pointTitle: 'Contexto',
    name: 'Contexto',
    durationMs: 400000,
    sources: ['microphone'],
    sourcesLabel: 'Micrófono',
    status: 'saved',
  };

  // User confirms "Interrumpir y conservar": auto-persists recording & interrupts session
  session = saveFinalizedRecording(session, activeRecording);
  session = interruptLiveSession(session, start + 400000);

  assert.equal(session.status, SESSION_STATUS.INTERRUPTED);
  assert.equal(session.recordings.length, 1);
  assert.equal(session.recordings[0].id, 'rec-interrupt');
  assert.equal(session.liveActiveBlockId, 'block-1');
});
