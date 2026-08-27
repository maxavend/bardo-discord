/**
 * Session Runner — Core domain model and timestamp-based state machine for Bardo Live Session.
 * All elapsed times are computed deterministically from real clock timestamps
 * (immune to browser throttling, tab switching, and background sleep).
 */

export const SESSION_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  INTERRUPTED: 'interrupted',
};

export const DEFAULT_LIVE_SESSION = {
  sessionId: null,
  status: SESSION_STATUS.IDLE,
  scheduledStartAt: null,
  sessionStartedAt: null,
  sessionEndedAt: null,
  liveActiveBlockId: null,
  activeBlockStartedAt: null,
  pausedAt: null,
  accumulatedPausedMs: 0,
  activeBlockAccumulatedPausedMs: 0,
  completedBlockIds: [],
  skippedBlockIds: [],
  blockExtensions: {}, // { [blockId]: { extensionMinutes: number, isUnlimited: boolean } }
  recordingPromptsDismissed: {}, // { [blockId]: boolean }
  recordings: [],
  decisions: [],
};

/**
 * Creates and initializes a new live session from a planner schedule state.
 */
export function createLiveSession(plannerState, now = Date.now()) {
  const firstBlock = (plannerState.blocks || [])[0];
  const sessionId = `session-${now}`;
  const firstBlockId = firstBlock ? firstBlock.id : null;

  return {
    ...DEFAULT_LIVE_SESSION,
    sessionId,
    status: SESSION_STATUS.RUNNING,
    scheduledStartAt: plannerState.startTime || null,
    sessionStartedAt: now,
    sessionEndedAt: null,
    liveActiveBlockId: firstBlockId,
    activeBlockStartedAt: now,
    pausedAt: null,
    accumulatedPausedMs: 0,
    activeBlockAccumulatedPausedMs: 0,
    completedBlockIds: [],
    skippedBlockIds: [],
    blockExtensions: {},
    recordingPromptsDismissed: {},
    recordings: [],
    decisions: (plannerState.blocks || []).flatMap(b => (b.decisions || []).map(d => ({
      ...d,
      blockId: b.id,
      timestamp: now,
    }))),
  };
}

/**
 * Calculates effective elapsed time for the entire session.
 */
export function getElapsedSessionMs(sessionState, now = Date.now()) {
  if (!sessionState || !sessionState.sessionStartedAt) return 0;
  if ((sessionState.status === SESSION_STATUS.COMPLETED || sessionState.status === SESSION_STATUS.INTERRUPTED) && sessionState.sessionEndedAt) {
    return Math.max(0, sessionState.sessionEndedAt - sessionState.sessionStartedAt - (sessionState.accumulatedPausedMs || 0));
  }
  if (sessionState.status === SESSION_STATUS.PAUSED && sessionState.pausedAt) {
    return Math.max(0, sessionState.pausedAt - sessionState.sessionStartedAt - (sessionState.accumulatedPausedMs || 0));
  }
  return Math.max(0, now - sessionState.sessionStartedAt - (sessionState.accumulatedPausedMs || 0));
}

/**
 * Calculates effective elapsed time for the active block.
 */
export function getElapsedActiveBlockMs(sessionState, now = Date.now()) {
  if (!sessionState || !sessionState.activeBlockStartedAt || !sessionState.liveActiveBlockId) return 0;
  if (sessionState.status === SESSION_STATUS.COMPLETED || sessionState.status === SESSION_STATUS.INTERRUPTED) return 0;
  if (sessionState.status === SESSION_STATUS.PAUSED && sessionState.pausedAt) {
    return Math.max(0, sessionState.pausedAt - sessionState.activeBlockStartedAt - (sessionState.activeBlockAccumulatedPausedMs || 0));
  }
  return Math.max(0, now - sessionState.activeBlockStartedAt - (sessionState.activeBlockAccumulatedPausedMs || 0));
}

/**
 * Returns planned duration in milliseconds for a block (including extensions).
 */
export function getBlockPlannedMs(block, sessionState) {
  if (!block) return 0;
  const baseMinutes = Number(block.durationMinutes) || 15;
  const extension = sessionState?.blockExtensions?.[block.id]?.extensionMinutes || 0;
  return (baseMinutes + extension) * 60 * 1000;
}

/**
 * Calculates remaining time in milliseconds for the active block.
 */
export function getRemainingActiveBlockMs(block, sessionState, now = Date.now()) {
  if (!block || !sessionState) return 0;
  const plannedMs = getBlockPlannedMs(block, sessionState);
  const elapsedMs = getElapsedActiveBlockMs(sessionState, now);
  return plannedMs - elapsedMs;
}

/**
 * Pauses the live session runner.
 */
export function pauseLiveSession(sessionState, now = Date.now()) {
  if (!sessionState || sessionState.status !== SESSION_STATUS.RUNNING) return sessionState;
  return {
    ...sessionState,
    status: SESSION_STATUS.PAUSED,
    pausedAt: now,
  };
}

/**
 * Resumes the live session runner.
 */
export function resumeLiveSession(sessionState, now = Date.now()) {
  if (!sessionState || sessionState.status !== SESSION_STATUS.PAUSED || !sessionState.pausedAt) {
    return sessionState;
  }
  const pauseDuration = Math.max(0, now - sessionState.pausedAt);
  return {
    ...sessionState,
    status: SESSION_STATUS.RUNNING,
    pausedAt: null,
    accumulatedPausedMs: (sessionState.accumulatedPausedMs || 0) + pauseDuration,
    activeBlockAccumulatedPausedMs: (sessionState.activeBlockAccumulatedPausedMs || 0) + pauseDuration,
  };
}

/**
 * Extends the active block by adding extra minutes.
 */
export function extendActiveBlock(sessionState, blockId, extraMinutes = 5) {
  if (!sessionState || !blockId) return sessionState;
  const prevExtension = sessionState.blockExtensions[blockId] || {extensionMinutes: 0, isUnlimited: false};
  return {
    ...sessionState,
    blockExtensions: {
      ...sessionState.blockExtensions,
      [blockId]: {
        extensionMinutes: prevExtension.extensionMinutes + extraMinutes,
        isUnlimited: false,
      },
    },
  };
}

/**
 * Marks the active block as unlimited overtime (stops annoying expiration alarms).
 */
export function setUnlimitedActiveBlock(sessionState, blockId) {
  if (!sessionState || !blockId) return sessionState;
  const prevExtension = sessionState.blockExtensions[blockId] || {extensionMinutes: 0, isUnlimited: false};
  return {
    ...sessionState,
    blockExtensions: {
      ...sessionState.blockExtensions,
      [blockId]: {
        ...prevExtension,
        isUnlimited: true,
      },
    },
  };
}

/**
 * Transitions to the next block in the agenda, completing the current one.
 */
export function advanceToNextBlock(plannerState, sessionState, now = Date.now()) {
  if (!sessionState || !plannerState) return sessionState;
  const blocks = plannerState.blocks || [];
  const currentId = sessionState.liveActiveBlockId;
  const currentIndex = blocks.findIndex(b => b.id === currentId);

  const completedBlockIds = currentId && !sessionState.completedBlockIds.includes(currentId)
    ? [...sessionState.completedBlockIds, currentId]
    : sessionState.completedBlockIds;

  const nextBlock = currentIndex >= 0 && currentIndex < blocks.length - 1
    ? blocks[currentIndex + 1]
    : null;

  if (!nextBlock) {
    // Reached the end of the agenda -> finish session
    return completeLiveSession(sessionState, now);
  }

  return {
    ...sessionState,
    liveActiveBlockId: nextBlock.id,
    activeBlockStartedAt: now,
    activeBlockAccumulatedPausedMs: 0,
    completedBlockIds,
  };
}

/**
 * Skips the active block without marking it as completed.
 */
export function skipActiveBlock(plannerState, sessionState, now = Date.now()) {
  if (!sessionState || !plannerState) return sessionState;
  const blocks = plannerState.blocks || [];
  const currentId = sessionState.liveActiveBlockId;
  const currentIndex = blocks.findIndex(b => b.id === currentId);

  const skippedBlockIds = currentId && !sessionState.skippedBlockIds.includes(currentId)
    ? [...sessionState.skippedBlockIds, currentId]
    : sessionState.skippedBlockIds;

  const nextBlock = currentIndex >= 0 && currentIndex < blocks.length - 1
    ? blocks[currentIndex + 1]
    : null;

  if (!nextBlock) {
    return completeLiveSession({...sessionState, skippedBlockIds}, now);
  }

  return {
    ...sessionState,
    liveActiveBlockId: nextBlock.id,
    activeBlockStartedAt: now,
    activeBlockAccumulatedPausedMs: 0,
    skippedBlockIds,
  };
}

/**
 * Completes and closes the live session.
 */
export function completeLiveSession(sessionState, now = Date.now()) {
  if (!sessionState) return sessionState;
  const completedBlockIds = sessionState.liveActiveBlockId &&
    !sessionState.completedBlockIds.includes(sessionState.liveActiveBlockId) &&
    !sessionState.skippedBlockIds.includes(sessionState.liveActiveBlockId)
    ? [...sessionState.completedBlockIds, sessionState.liveActiveBlockId]
    : sessionState.completedBlockIds;

  return {
    ...sessionState,
    status: SESSION_STATUS.COMPLETED,
    sessionEndedAt: now,
    liveActiveBlockId: null,
    activeBlockStartedAt: null,
    completedBlockIds,
  };
}

/**
 * Interrupts / cancels the live session without losing recorded artifacts or decisions.
 */
export function interruptLiveSession(sessionState, now = Date.now()) {
  if (!sessionState) return sessionState;
  return {
    ...sessionState,
    status: SESSION_STATUS.INTERRUPTED,
    sessionEndedAt: now,
  };
}

/**
 * Resumes an interrupted session, allowing participants to continue smoothly.
 */
export function resumeInterruptedSession(sessionState, now = Date.now()) {
  if (!sessionState || sessionState.status !== SESSION_STATUS.INTERRUPTED) {
    return sessionState;
  }
  const interruptedDuration = sessionState.sessionEndedAt ? Math.max(0, now - sessionState.sessionEndedAt) : 0;
  return {
    ...sessionState,
    status: SESSION_STATUS.RUNNING,
    sessionEndedAt: null,
    accumulatedPausedMs: (sessionState.accumulatedPausedMs || 0) + interruptedDuration,
    activeBlockAccumulatedPausedMs: (sessionState.activeBlockAccumulatedPausedMs || 0) + interruptedDuration,
  };
}

/**
 * Adds a new recording to the session.
 */
export function addRecordingToSession(sessionState, recordingMetadata) {
  if (!sessionState || !recordingMetadata) return sessionState;
  return {
    ...sessionState,
    recordings: [...(sessionState.recordings || []), recordingMetadata],
  };
}

/**
 * Saves or updates a finalized recording entity in the session.
 */
export function saveFinalizedRecording(sessionState, recordingEntity) {
  if (!sessionState || !recordingEntity) return sessionState;
  const existing = sessionState.recordings || [];
  const index = existing.findIndex(r => r.id === recordingEntity.id);
  if (index >= 0) {
    const next = [...existing];
    next[index] = recordingEntity;
    return {...sessionState, recordings: next};
  }
  return {
    ...sessionState,
    recordings: [...existing, recordingEntity],
  };
}

/**
 * Renames an existing recording in the session.
 */
export function renameRecordingInSession(sessionState, recordingId, newName) {
  if (!sessionState || !recordingId || !newName) return sessionState;
  const recordings = (sessionState.recordings || []).map(r => {
    if (r.id !== recordingId) return r;
    return {...r, name: newName};
  });
  return {...sessionState, recordings};
}

/**
 * Deletes a recording from the session.
 */
export function deleteRecordingFromSession(sessionState, recordingId) {
  if (!sessionState || !recordingId) return sessionState;
  const recordings = (sessionState.recordings || []).filter(r => r.id !== recordingId);
  return {...sessionState, recordings};
}

/**
 * Adds a decision / agreement to the session.
 */
export function addDecisionToSession(sessionState, decision) {
  if (!sessionState || !decision) return sessionState;
  return {
    ...sessionState,
    decisions: [...(sessionState.decisions || []), decision],
  };
}

/**
 * Recalculates estimated end time based on original start time + extensions.
 */
export function recalculateEstimatedEndTime(plannerState, sessionState) {
  const startTime = plannerState?.startTime || '10:00';
  const [h, m] = startTime.split(':').map(Number);
  const baseMinutes = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  const totalPlannedMinutes = plannerState?.totalCalculatedDuration || 0;

  const totalExtensionsMinutes = Object.values(sessionState?.blockExtensions || {}).reduce(
    (acc, ext) => acc + (ext.extensionMinutes || 0),
    0
  );

  const finalMinutes = baseMinutes + totalPlannedMinutes + totalExtensionsMinutes;
  const norm = ((Math.round(finalMinutes) % 1440) + 1440) % 1440;
  const endH = Math.floor(norm / 60);
  const endM = norm % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

/**
 * Dismisses the initial recording prompt for a specific block.
 */
export function dismissBlockRecordingPrompt(sessionState, blockId) {
  if (!sessionState || !blockId) return sessionState;
  return {
    ...sessionState,
    recordingPromptsDismissed: {
      ...(sessionState.recordingPromptsDismissed || {}),
      [blockId]: true,
    },
  };
}

