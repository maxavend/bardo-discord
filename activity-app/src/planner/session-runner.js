/**
 * Session Runner — Core domain model for Bardo Live Session.
 *
 * Product hierarchy:
 * Session -> active Block -> active Point.
 *
 * Blocks remain the temporal unit. Points are the conversational/navigation unit.
 * `subpoints` is intentionally preserved as the persisted agenda field for backwards
 * compatibility; inside the live runner they are treated as Points.
 */

export const SESSION_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  INTERRUPTED: 'interrupted',
};

export const POINT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  DONE: 'done',
  SKIPPED: 'skipped',
};

export const DEFAULT_LIVE_SESSION = {
  sessionId: null,
  status: SESSION_STATUS.IDLE,
  scheduledStartAt: null,
  sessionStartedAt: null,
  sessionEndedAt: null,
  liveActiveBlockId: null,
  liveActivePointId: null,
  activeBlockStartedAt: null,
  pausedAt: null,
  accumulatedPausedMs: 0,
  activeBlockAccumulatedPausedMs: 0,
  completedBlockIds: [],
  skippedBlockIds: [],
  pointStatuses: {}, // { [pointId]: pending | done | skipped }; active is represented by liveActivePointId
  blockExtensions: {}, // { [blockId]: { extensionMinutes: number, isUnlimited: boolean } }
  recordingPromptsDismissed: {}, // keyed by point:<id> or block:<id>
  recordings: [],
  decisions: [],
  tasks: [],
};

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function getBlockPoints(block) {
  return Array.isArray(block?.subpoints) ? block.subpoints : [];
}

export function getPointStatus(sessionState, pointId) {
  if (!pointId) return null;
  if (sessionState?.liveActivePointId === pointId &&
      sessionState?.status !== SESSION_STATUS.COMPLETED) {
    return POINT_STATUS.ACTIVE;
  }
  const stored = sessionState?.pointStatuses?.[pointId];
  if (stored === POINT_STATUS.DONE || stored === POINT_STATUS.SKIPPED) return stored;
  return POINT_STATUS.PENDING;
}

export function seedPointStatuses(plannerState) {
  const statuses = {};
  for (const block of plannerState?.blocks || []) {
    for (const point of getBlockPoints(block)) {
      if (point.status === POINT_STATUS.DONE || point.status === POINT_STATUS.SKIPPED) {
        statuses[point.id] = point.status;
      } else {
        statuses[point.id] = POINT_STATUS.PENDING;
      }
    }
  }
  return statuses;
}

export function findFirstPendingPointId(block, pointStatuses = {}) {
  const point = getBlockPoints(block).find((candidate) => {
    const status = pointStatuses[candidate.id];
    return status !== POINT_STATUS.DONE && status !== POINT_STATUS.SKIPPED;
  });
  return point?.id || null;
}

export function getActiveBlock(plannerState, sessionState) {
  return (plannerState?.blocks || []).find((block) => block.id === sessionState?.liveActiveBlockId) || null;
}

export function getActivePoint(plannerState, sessionState) {
  const block = getActiveBlock(plannerState, sessionState);
  if (!block || !sessionState?.liveActivePointId) return null;
  return getBlockPoints(block).find((point) => point.id === sessionState.liveActivePointId) || null;
}

export function getPointCounts(plannerState, sessionState) {
  const points = (plannerState?.blocks || []).flatMap(getBlockPoints);
  let done = 0;
  let skipped = 0;
  for (const point of points) {
    const status = getPointStatus(sessionState, point.id);
    if (status === POINT_STATUS.DONE) done += 1;
    if (status === POINT_STATUS.SKIPPED) skipped += 1;
  }
  return {
    total: points.length,
    done,
    skipped,
    pending: Math.max(0, points.length - done - skipped - (sessionState?.liveActivePointId ? 1 : 0)),
  };
}

function normalizePersistedPointStatuses(plannerState, persistedStatuses = {}) {
  return {
    ...seedPointStatuses(plannerState),
    ...(persistedStatuses || {}),
  };
}

function inferActiveBlock(plannerState, sessionState) {
  const blocks = plannerState?.blocks || [];
  if (blocks.some((block) => block.id === sessionState?.liveActiveBlockId)) {
    return sessionState.liveActiveBlockId;
  }
  const completed = new Set(sessionState?.completedBlockIds || []);
  const skipped = new Set(sessionState?.skippedBlockIds || []);
  return blocks.find((block) => !completed.has(block.id) && !skipped.has(block.id))?.id || null;
}

/**
 * Safe migration for persisted live-session v1 data.
 * Old sessions had no liveActivePointId/pointStatuses. We preserve every existing
 * field and infer the first pending Point inside the persisted active Block.
 */
export function migrateLiveSessionState(plannerState, persistedState) {
  if (!persistedState || typeof persistedState !== 'object') {
    return {...DEFAULT_LIVE_SESSION};
  }

  const merged = {
    ...DEFAULT_LIVE_SESSION,
    ...persistedState,
    completedBlockIds: unique(persistedState.completedBlockIds),
    skippedBlockIds: unique(persistedState.skippedBlockIds),
    recordings: Array.isArray(persistedState.recordings) ? persistedState.recordings : [],
    decisions: Array.isArray(persistedState.decisions) ? persistedState.decisions : [],
    tasks: Array.isArray(persistedState.tasks) ? persistedState.tasks : [],
    blockExtensions: persistedState.blockExtensions || {},
    recordingPromptsDismissed: persistedState.recordingPromptsDismissed || {},
    pointStatuses: normalizePersistedPointStatuses(plannerState, persistedState.pointStatuses),
  };

  if (merged.status === SESSION_STATUS.IDLE || merged.status === SESSION_STATUS.COMPLETED) {
    return {
      ...merged,
      liveActiveBlockId: merged.status === SESSION_STATUS.COMPLETED ? null : merged.liveActiveBlockId,
      liveActivePointId: null,
    };
  }

  const activeBlockId = inferActiveBlock(plannerState, merged);
  const activeBlock = (plannerState?.blocks || []).find((block) => block.id === activeBlockId) || null;
  const persistedPointStillValid = Boolean(
    activeBlock &&
    getBlockPoints(activeBlock).some((point) => point.id === persistedState.liveActivePointId) &&
    merged.pointStatuses[persistedState.liveActivePointId] !== POINT_STATUS.DONE &&
    merged.pointStatuses[persistedState.liveActivePointId] !== POINT_STATUS.SKIPPED
  );

  return {
    ...merged,
    liveActiveBlockId: activeBlockId,
    liveActivePointId: persistedPointStillValid
      ? persistedState.liveActivePointId
      : findFirstPendingPointId(activeBlock, merged.pointStatuses),
  };
}

/** Creates and initializes a new live session from a planner schedule state. */
export function createLiveSession(plannerState, now = Date.now()) {
  const firstBlock = (plannerState?.blocks || [])[0] || null;
  const pointStatuses = seedPointStatuses(plannerState);
  const sessionId = `session-${now}`;

  return {
    ...DEFAULT_LIVE_SESSION,
    sessionId,
    status: SESSION_STATUS.RUNNING,
    scheduledStartAt: plannerState?.startTime || null,
    sessionStartedAt: now,
    sessionEndedAt: null,
    liveActiveBlockId: firstBlock?.id || null,
    liveActivePointId: findFirstPendingPointId(firstBlock, pointStatuses),
    activeBlockStartedAt: firstBlock ? now : null,
    pointStatuses,
    decisions: (plannerState?.blocks || []).flatMap((block) =>
      (block.decisions || []).map((decision) => ({
        ...decision,
        sessionId,
        blockId: block.id,
        pointId: decision.pointId || null,
        timestamp: decision.timestamp || now,
      }))
    ),
  };
}

/** Calculates effective elapsed time for the entire session. */
export function getElapsedSessionMs(sessionState, now = Date.now()) {
  if (!sessionState?.sessionStartedAt) return 0;
  if ((sessionState.status === SESSION_STATUS.COMPLETED || sessionState.status === SESSION_STATUS.INTERRUPTED) && sessionState.sessionEndedAt) {
    return Math.max(0, sessionState.sessionEndedAt - sessionState.sessionStartedAt - (sessionState.accumulatedPausedMs || 0));
  }
  if (sessionState.status === SESSION_STATUS.PAUSED && sessionState.pausedAt) {
    return Math.max(0, sessionState.pausedAt - sessionState.sessionStartedAt - (sessionState.accumulatedPausedMs || 0));
  }
  return Math.max(0, now - sessionState.sessionStartedAt - (sessionState.accumulatedPausedMs || 0));
}

/** Calculates effective elapsed time for the active Block. */
export function getElapsedActiveBlockMs(sessionState, now = Date.now()) {
  if (!sessionState?.activeBlockStartedAt || !sessionState.liveActiveBlockId) return 0;
  if (sessionState.status === SESSION_STATUS.COMPLETED || sessionState.status === SESSION_STATUS.INTERRUPTED) return 0;
  if (sessionState.status === SESSION_STATUS.PAUSED && sessionState.pausedAt) {
    return Math.max(0, sessionState.pausedAt - sessionState.activeBlockStartedAt - (sessionState.activeBlockAccumulatedPausedMs || 0));
  }
  return Math.max(0, now - sessionState.activeBlockStartedAt - (sessionState.activeBlockAccumulatedPausedMs || 0));
}

/** Returns planned duration in milliseconds for a Block, including extensions. */
export function getBlockPlannedMs(block, sessionState) {
  if (!block) return 0;
  const baseMinutes = Number(block.durationMinutes) || 15;
  const extension = sessionState?.blockExtensions?.[block.id]?.extensionMinutes || 0;
  return (baseMinutes + extension) * 60 * 1000;
}

/** Calculates remaining time in milliseconds for the active Block. */
export function getRemainingActiveBlockMs(block, sessionState, now = Date.now()) {
  if (!block || !sessionState) return 0;
  return getBlockPlannedMs(block, sessionState) - getElapsedActiveBlockMs(sessionState, now);
}

export function pauseLiveSession(sessionState, now = Date.now()) {
  if (!sessionState || sessionState.status !== SESSION_STATUS.RUNNING) return sessionState;
  return {...sessionState, status: SESSION_STATUS.PAUSED, pausedAt: now};
}

export function resumeLiveSession(sessionState, now = Date.now()) {
  if (!sessionState || sessionState.status !== SESSION_STATUS.PAUSED || !sessionState.pausedAt) return sessionState;
  const pauseDuration = Math.max(0, now - sessionState.pausedAt);
  return {
    ...sessionState,
    status: SESSION_STATUS.RUNNING,
    pausedAt: null,
    accumulatedPausedMs: (sessionState.accumulatedPausedMs || 0) + pauseDuration,
    activeBlockAccumulatedPausedMs: (sessionState.activeBlockAccumulatedPausedMs || 0) + pauseDuration,
  };
}

export function extendActiveBlock(sessionState, blockId, extraMinutes = 5) {
  if (!sessionState || !blockId) return sessionState;
  const previous = sessionState.blockExtensions?.[blockId] || {extensionMinutes: 0, isUnlimited: false};
  return {
    ...sessionState,
    blockExtensions: {
      ...(sessionState.blockExtensions || {}),
      [blockId]: {
        extensionMinutes: previous.extensionMinutes + extraMinutes,
        isUnlimited: false,
      },
    },
  };
}

export function setUnlimitedActiveBlock(sessionState, blockId) {
  if (!sessionState || !blockId) return sessionState;
  const previous = sessionState.blockExtensions?.[blockId] || {extensionMinutes: 0, isUnlimited: false};
  return {
    ...sessionState,
    blockExtensions: {
      ...(sessionState.blockExtensions || {}),
      [blockId]: {...previous, isUnlimited: true},
    },
  };
}

export function setPointStatus(sessionState, pointId, status) {
  if (!sessionState || !pointId || !Object.values(POINT_STATUS).includes(status)) return sessionState;
  const storedStatus = status === POINT_STATUS.ACTIVE ? POINT_STATUS.PENDING : status;
  return {
    ...sessionState,
    pointStatuses: {
      ...(sessionState.pointStatuses || {}),
      [pointId]: storedStatus,
    },
  };
}

function getNextUnhandledPoint(block, currentPointId, pointStatuses) {
  const points = getBlockPoints(block);
  const currentIndex = points.findIndex((point) => point.id === currentPointId);
  const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
  return points.slice(startIndex).find((point) => {
    const status = pointStatuses?.[point.id];
    return status !== POINT_STATUS.DONE && status !== POINT_STATUS.SKIPPED;
  }) || null;
}

function moveToBlock(sessionState, block, now, pointStatuses) {
  if (!block) return sessionState;
  const movingWhilePaused = sessionState.status === SESSION_STATUS.PAUSED;
  return {
    ...sessionState,
    liveActiveBlockId: block.id,
    liveActivePointId: findFirstPendingPointId(block, pointStatuses),
    activeBlockStartedAt: now,
    activeBlockAccumulatedPausedMs: 0,
    pausedAt: movingWhilePaused ? now : sessionState.pausedAt,
    pointStatuses,
  };
}

function allBlockPointsHandled(block, pointStatuses) {
  const points = getBlockPoints(block);
  if (points.length === 0) return true;
  return points.every((point) => {
    const status = pointStatuses?.[point.id];
    return status === POINT_STATUS.DONE || status === POINT_STATUS.SKIPPED;
  });
}

/**
 * Primary live navigation action.
 * - Another Point in the same Block -> advance Point without touching the Block timer.
 * - Last Point -> complete Block and start the next Block timer.
 * - Block without Points -> complete Block and advance Block.
 * - Last Point of last Block -> complete Session.
 */
export function advanceLiveSession(plannerState, sessionState, now = Date.now()) {
  if (!sessionState || !plannerState || sessionState.status === SESSION_STATUS.COMPLETED || sessionState.status === SESSION_STATUS.INTERRUPTED) {
    return sessionState;
  }

  const blocks = plannerState.blocks || [];
  const currentBlockIndex = blocks.findIndex((block) => block.id === sessionState.liveActiveBlockId);
  if (currentBlockIndex < 0) return completeLiveSession(sessionState, now);

  const currentBlock = blocks[currentBlockIndex];
  let pointStatuses = {...(sessionState.pointStatuses || {})};
  const currentPointId = sessionState.liveActivePointId;

  if (currentPointId) {
    pointStatuses[currentPointId] = POINT_STATUS.DONE;
    const nextPoint = getNextUnhandledPoint(currentBlock, currentPointId, pointStatuses);
    if (nextPoint) {
      return {
        ...sessionState,
        liveActivePointId: nextPoint.id,
        pointStatuses,
      };
    }
  } else {
    const firstUnhandled = findFirstPendingPointId(currentBlock, pointStatuses);
    if (firstUnhandled) {
      return {...sessionState, liveActivePointId: firstUnhandled, pointStatuses};
    }
  }

  const completedBlockIds = allBlockPointsHandled(currentBlock, pointStatuses)
    ? unique([...(sessionState.completedBlockIds || []), currentBlock.id])
    : sessionState.completedBlockIds || [];

  const base = {...sessionState, completedBlockIds, pointStatuses, liveActivePointId: null};
  const nextBlock = blocks[currentBlockIndex + 1] || null;
  if (!nextBlock) return completeLiveSession(base, now);

  return moveToBlock(base, nextBlock, now, pointStatuses);
}

/** Secondary action: skip the active Point without marking it done. */
export function skipActivePoint(plannerState, sessionState, now = Date.now()) {
  if (!sessionState || !plannerState) return sessionState;
  if (!sessionState.liveActivePointId) return skipActiveBlock(plannerState, sessionState, now);

  const blocks = plannerState.blocks || [];
  const currentBlockIndex = blocks.findIndex((block) => block.id === sessionState.liveActiveBlockId);
  if (currentBlockIndex < 0) return sessionState;

  const currentBlock = blocks[currentBlockIndex];
  const pointStatuses = {
    ...(sessionState.pointStatuses || {}),
    [sessionState.liveActivePointId]: POINT_STATUS.SKIPPED,
  };
  const nextPoint = getNextUnhandledPoint(currentBlock, sessionState.liveActivePointId, pointStatuses);

  if (nextPoint) {
    return {...sessionState, liveActivePointId: nextPoint.id, pointStatuses};
  }

  const completedBlockIds = allBlockPointsHandled(currentBlock, pointStatuses)
    ? unique([...(sessionState.completedBlockIds || []), currentBlock.id])
    : sessionState.completedBlockIds || [];
  const base = {...sessionState, pointStatuses, completedBlockIds, liveActivePointId: null};
  const nextBlock = blocks[currentBlockIndex + 1] || null;
  if (!nextBlock) return completeLiveSession(base, now);
  return moveToBlock(base, nextBlock, now, pointStatuses);
}

/**
 * Backwards-compatible explicit Block advance. New live UI should use advanceLiveSession.
 * It never marks unvisited Points done.
 */
export function advanceToNextBlock(plannerState, sessionState, now = Date.now()) {
  if (!sessionState || !plannerState) return sessionState;
  const blocks = plannerState.blocks || [];
  const currentIndex = blocks.findIndex((block) => block.id === sessionState.liveActiveBlockId);
  const currentBlock = blocks[currentIndex] || null;
  const completedBlockIds = currentBlock
    ? unique([...(sessionState.completedBlockIds || []), currentBlock.id])
    : sessionState.completedBlockIds || [];
  const base = {...sessionState, completedBlockIds, liveActivePointId: null};
  const nextBlock = currentIndex >= 0 ? blocks[currentIndex + 1] : null;
  if (!nextBlock) return completeLiveSession(base, now);
  return moveToBlock(base, nextBlock, now, base.pointStatuses || {});
}

/** Skips the active Block without marking its Points completed. */
export function skipActiveBlock(plannerState, sessionState, now = Date.now()) {
  if (!sessionState || !plannerState) return sessionState;
  const blocks = plannerState.blocks || [];
  const currentIndex = blocks.findIndex((block) => block.id === sessionState.liveActiveBlockId);
  const currentId = sessionState.liveActiveBlockId;
  const skippedBlockIds = currentId
    ? unique([...(sessionState.skippedBlockIds || []), currentId])
    : sessionState.skippedBlockIds || [];
  const base = {...sessionState, skippedBlockIds, liveActivePointId: null};
  const nextBlock = currentIndex >= 0 ? blocks[currentIndex + 1] : null;
  if (!nextBlock) return completeLiveSession(base, now);
  return moveToBlock(base, nextBlock, now, base.pointStatuses || {});
}

/** Completes and seals the live Session. Pending future Points are never marked done. */
export function completeLiveSession(sessionState, now = Date.now()) {
  if (!sessionState) return sessionState;
  return {
    ...sessionState,
    status: SESSION_STATUS.COMPLETED,
    sessionEndedAt: now,
    liveActiveBlockId: null,
    liveActivePointId: null,
    activeBlockStartedAt: null,
    pausedAt: null,
  };
}

/** Interrupts the Session while preserving current Block + Point and all artifacts. */
export function interruptLiveSession(sessionState, now = Date.now()) {
  if (!sessionState) return sessionState;
  return {...sessionState, status: SESSION_STATUS.INTERRUPTED, sessionEndedAt: now};
}

/** Resumes an interrupted Session without resetting Block or Point progress. */
export function resumeInterruptedSession(sessionState, now = Date.now()) {
  if (!sessionState || sessionState.status !== SESSION_STATUS.INTERRUPTED) return sessionState;
  const interruptedDuration = sessionState.sessionEndedAt
    ? Math.max(0, now - sessionState.sessionEndedAt)
    : 0;
  return {
    ...sessionState,
    status: SESSION_STATUS.RUNNING,
    sessionEndedAt: null,
    accumulatedPausedMs: (sessionState.accumulatedPausedMs || 0) + interruptedDuration,
    activeBlockAccumulatedPausedMs: (sessionState.activeBlockAccumulatedPausedMs || 0) + interruptedDuration,
  };
}

export function addRecordingToSession(sessionState, recordingMetadata) {
  if (!sessionState || !recordingMetadata) return sessionState;
  return {...sessionState, recordings: [...(sessionState.recordings || []), recordingMetadata]};
}

export function saveFinalizedRecording(sessionState, recordingEntity) {
  if (!sessionState || !recordingEntity) return sessionState;
  const existing = sessionState.recordings || [];
  const index = existing.findIndex((recording) => recording.id === recordingEntity.id);
  if (index >= 0) {
    const recordings = [...existing];
    recordings[index] = recordingEntity;
    return {...sessionState, recordings};
  }
  return {...sessionState, recordings: [...existing, recordingEntity]};
}

export function renameRecordingInSession(sessionState, recordingId, newName) {
  if (!sessionState || !recordingId || !newName) return sessionState;
  return {
    ...sessionState,
    recordings: (sessionState.recordings || []).map((recording) =>
      recording.id === recordingId ? {...recording, name: newName} : recording
    ),
  };
}

export function deleteRecordingFromSession(sessionState, recordingId) {
  if (!sessionState || !recordingId) return sessionState;
  return {
    ...sessionState,
    recordings: (sessionState.recordings || []).filter((recording) => recording.id !== recordingId),
  };
}

export function addDecisionToSession(sessionState, decision) {
  if (!sessionState || !decision) return sessionState;
  return {...sessionState, decisions: [...(sessionState.decisions || []), decision]};
}

export function addTaskToSession(sessionState, task) {
  if (!sessionState || !task) return sessionState;
  return {...sessionState, tasks: [...(sessionState.tasks || []), task]};
}

/** Recalculates estimated end time from planned Session duration + Block extensions. */
export function recalculateEstimatedEndTime(plannerState, sessionState) {
  const startTime = plannerState?.startTime || '10:00';
  const [h, m] = startTime.split(':').map(Number);
  const baseMinutes = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  const totalPlannedMinutes = plannerState?.totalCalculatedDuration || 0;
  const totalExtensionsMinutes = Object.values(sessionState?.blockExtensions || {}).reduce(
    (acc, extension) => acc + (extension.extensionMinutes || 0),
    0
  );
  const finalMinutes = baseMinutes + totalPlannedMinutes + totalExtensionsMinutes;
  const normalized = ((Math.round(finalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function getRecordingContextKey(sessionState) {
  if (sessionState?.liveActivePointId) return `point:${sessionState.liveActivePointId}`;
  if (sessionState?.liveActiveBlockId) return `block:${sessionState.liveActiveBlockId}`;
  return null;
}

export function dismissRecordingPrompt(sessionState) {
  const key = getRecordingContextKey(sessionState);
  if (!sessionState || !key) return sessionState;
  return {
    ...sessionState,
    recordingPromptsDismissed: {
      ...(sessionState.recordingPromptsDismissed || {}),
      [key]: true,
    },
  };
}

/** Backwards-compatible block-based prompt dismissal. */
export function dismissBlockRecordingPrompt(sessionState, blockId) {
  if (!sessionState || !blockId) return sessionState;
  const key = sessionState.liveActivePointId
    ? `point:${sessionState.liveActivePointId}`
    : `block:${blockId}`;
  return {
    ...sessionState,
    recordingPromptsDismissed: {
      ...(sessionState.recordingPromptsDismissed || {}),
      [key]: true,
    },
  };
}
