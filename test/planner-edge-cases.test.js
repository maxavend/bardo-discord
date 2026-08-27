import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_STATUS,
  POINT_STATUS,
  createLiveSession,
  pauseLiveSession,
  advanceLiveSession,
  interruptLiveSession,
  resumeInterruptedSession,
  getElapsedSessionMs,
  getElapsedActiveBlockMs,
} from '../activity-app/src/planner/session-runner.js';
import {RecordingController, RECORDING_STATUS} from '../activity-app/src/planner/recording-controller.js';

const MINUTE = 60_000;
const START = 2_000_000;

const PLANNER = {
  startTime: '10:00',
  totalCalculatedDuration: 20,
  blocks: [
    {id: 'b1', title: 'Uno', durationMinutes: 10, subpoints: [{id: 'p1', title: 'Uno', status: 'pending'}]},
    {id: 'b2', title: 'Dos', durationMinutes: 10, subpoints: [{id: 'p2', title: 'Dos', status: 'pending'}]},
  ],
};

test('paused last Point -> next Block seals elapsed pause and starts new Block paused at zero', () => {
  let session = createLiveSession(PLANNER, START);
  session = pauseLiveSession(session, START + 3 * MINUTE);

  session = advanceLiveSession(PLANNER, session, START + 8 * MINUTE);

  assert.equal(session.status, SESSION_STATUS.PAUSED);
  assert.equal(session.liveActiveBlockId, 'b2');
  assert.equal(session.liveActivePointId, 'p2');
  assert.equal(session.pointStatuses.p1, POINT_STATUS.DONE);
  assert.equal(session.accumulatedPausedMs, 5 * MINUTE);
  assert.equal(getElapsedSessionMs(session, START + 12 * MINUTE), 3 * MINUTE);
  assert.equal(getElapsedActiveBlockMs(session, START + 12 * MINUTE), 0);
});

test('interrupting from paused Session preserves effective time and same context on resume', () => {
  let session = createLiveSession(PLANNER, START);
  session = pauseLiveSession(session, START + 4 * MINUTE);
  session = interruptLiveSession(session, START + 9 * MINUTE);

  assert.equal(session.status, SESSION_STATUS.INTERRUPTED);
  assert.equal(session.liveActiveBlockId, 'b1');
  assert.equal(session.liveActivePointId, 'p1');
  assert.equal(session.accumulatedPausedMs, 5 * MINUTE);
  assert.equal(getElapsedSessionMs(session), 4 * MINUTE);

  session = resumeInterruptedSession(session, START + 14 * MINUTE);
  assert.equal(session.status, SESSION_STATUS.RUNNING);
  assert.equal(session.liveActiveBlockId, 'b1');
  assert.equal(session.liveActivePointId, 'p1');
  assert.equal(session.accumulatedPausedMs, 10 * MINUTE);
  assert.equal(getElapsedSessionMs(session, START + 16 * MINUTE), 6 * MINUTE);
  assert.equal(getElapsedActiveBlockMs(session, START + 16 * MINUTE), 6 * MINUTE);
});

test('microphone permission denied moves RecordingController to error without fake recording', async () => {
  const previousNavigator = globalThis.navigator;
  const previousMediaRecorder = globalThis.MediaRecorder;
  const permissionError = new Error('Permission denied');

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => { throw permissionError; },
      },
    },
  });
  globalThis.MediaRecorder = class {
    static isTypeSupported() { return true; }
  };

  let reportedError = null;
  try {
    const controller = new RecordingController({onError: (error) => { reportedError = error; }});
    await assert.rejects(
      controller.startRecording('s1', 'b1', 'Uno', 'p1', 'Uno'),
      /Permission denied/
    );
    assert.equal(controller.getStatus(), RECORDING_STATUS.ERROR);
    assert.equal(controller.isActive(), false);
    assert.equal(controller.getCurrentRecordingId(), null);
    assert.equal(reportedError, permissionError);
  } finally {
    if (previousNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', {configurable: true, value: previousNavigator});
    if (previousMediaRecorder === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = previousMediaRecorder;
  }
});
