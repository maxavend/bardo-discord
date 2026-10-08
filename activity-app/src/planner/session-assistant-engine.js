import {
  SESSION_STATUS,
  POINT_STATUS,
  getElapsedSessionMs,
  getElapsedActiveBlockMs,
  getRemainingActiveBlockMs,
  getBlockPlannedMs,
  recalculateEstimatedEndTime,
  getActiveBlock,
  getActivePoint,
  getPointCounts,
  getRecordingContextKey,
  getNextUnhandledPoint,
} from './session-runner.js';
import {getPlannedSchedule, isBreakBlock, wasMeetingLeftOpen} from './time-engine.js';

export const ASSISTANT_EVENT = {
  SESSION_UPCOMING: 'SESSION_UPCOMING',
  SESSION_STARTED: 'SESSION_STARTED',
  BLOCK_STARTED: 'BLOCK_STARTED',
  BLOCK_5_MIN_REMAINING: 'BLOCK_5_MIN_REMAINING',
  BLOCK_TIME_EXPIRED: 'BLOCK_TIME_EXPIRED',
  BLOCK_EXTENDED: 'BLOCK_EXTENDED',
  BLOCK_UNLIMITED: 'BLOCK_UNLIMITED',
  BLOCK_COMPLETED: 'BLOCK_COMPLETED',
  BLOCK_SKIPPED: 'BLOCK_SKIPPED',
  POINT_STARTED: 'POINT_STARTED',
  POINT_COMPLETED: 'POINT_COMPLETED',
  POINT_SKIPPED: 'POINT_SKIPPED',
  RECORDING_STARTED: 'RECORDING_STARTED',
  RECORDING_PAUSED: 'RECORDING_PAUSED',
  RECORDING_STOPPED: 'RECORDING_STOPPED',
  SESSION_PAUSED: 'SESSION_PAUSED',
  SESSION_INTERRUPTED: 'SESSION_INTERRUPTED',
  SESSION_RESUMED: 'SESSION_RESUMED',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
};

export function formatMsToClock(ms, showPositiveSign = false) {
  if (!Number.isFinite(ms)) return '00:00';
  const isNegative = ms < 0;
  const absSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;
  const prefix = isNegative ? '-' : (showPositiveSign ? '+' : '');
  if (hours > 0) {
    return `${prefix}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${prefix}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatMinutesToClock(minutes = 0) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isSessionUpcoming(plannerState, now = new Date()) {
  if (!plannerState?.date || !plannerState?.startTime) return false;
  try {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (plannerState.date !== today) return false;
    const [h, m] = plannerState.startTime.split(':').map(Number);
    const difference = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
    return difference >= -30 && difference <= 60;
  } catch {
    return false;
  }
}

function emptyEvaluation(event = null) {
  return {
    event,
    activeBlock: null,
    activePoint: null,
    elapsedBlockMs: 0,
    remainingBlockMs: 0,
    is5MinWarning: false,
    isExpired: false,
    isUnlimited: false,
    overtimeMs: 0,
    extensionMinutes: 0,
  };
}

/** Temporal evaluation remains Block-scoped. Point state never changes the timer. */
export function evaluateSessionAssistant(plannerState, sessionState, now = Date.now()) {
  if (!sessionState || sessionState.status === SESSION_STATUS.IDLE) {
    return emptyEvaluation(isSessionUpcoming(plannerState) ? ASSISTANT_EVENT.SESSION_UPCOMING : null);
  }
  if (sessionState.status === SESSION_STATUS.COMPLETED) return emptyEvaluation(ASSISTANT_EVENT.SESSION_COMPLETED);
  if (sessionState.status === SESSION_STATUS.INTERRUPTED) return emptyEvaluation(ASSISTANT_EVENT.SESSION_INTERRUPTED);

  const activeBlock = getActiveBlock(plannerState, sessionState);
  const activePoint = getActivePoint(plannerState, sessionState);
  if (!activeBlock) return emptyEvaluation(null);

  const elapsedBlockMs = getElapsedActiveBlockMs(sessionState, now);
  const remainingBlockMs = getRemainingActiveBlockMs(activeBlock, sessionState, now);
  const extension = sessionState.blockExtensions?.[activeBlock.id];
  const isUnlimited = Boolean(extension?.isUnlimited);
  const extensionMinutes = extension?.extensionMinutes || 0;
  const is5MinWarning = !isUnlimited && remainingBlockMs > 0 && remainingBlockMs <= 5 * 60 * 1000;
  const isExpired = !isUnlimited && remainingBlockMs <= 0;
  const overtimeMs = remainingBlockMs < 0 ? Math.abs(remainingBlockMs) : 0;

  if (sessionState.status === SESSION_STATUS.PAUSED) {
    return {
      event: ASSISTANT_EVENT.SESSION_PAUSED,
      activeBlock,
      activePoint,
      elapsedBlockMs,
      remainingBlockMs,
      is5MinWarning: false,
      isExpired,
      isUnlimited,
      overtimeMs,
      extensionMinutes,
    };
  }

  let event = activePoint ? ASSISTANT_EVENT.POINT_STARTED : ASSISTANT_EVENT.BLOCK_STARTED;
  if (isUnlimited) event = ASSISTANT_EVENT.BLOCK_UNLIMITED;
  else if (isExpired) event = ASSISTANT_EVENT.BLOCK_TIME_EXPIRED;
  else if (extensionMinutes > 0) event = ASSISTANT_EVENT.BLOCK_EXTENDED;
  else if (is5MinWarning) event = ASSISTANT_EVENT.BLOCK_5_MIN_REMAINING;

  return {
    event,
    activeBlock,
    activePoint,
    elapsedBlockMs,
    remainingBlockMs,
    is5MinWarning,
    isExpired,
    isUnlimited,
    overtimeMs,
    extensionMinutes,
  };
}

/**
 * The single primary live action, mirroring exactly what `advanceLiveSession`
 * will do:
 * - "Siguiente tema" while the active bloque still has pending temas,
 * - "Siguiente bloque" when the bloque is done (the active tema is marked as
 *   tratado, nothing pending is skipped silently),
 * - "Terminar reunión" on the last bloque (callers must confirm).
 * With no active bloque (corrupted/missing pointer) it offers to continue at
 * the first pending bloque, or to end the meeting: there is never a dead end.
 */
export function getLivePrimaryAction(plannerState, sessionState) {
  const blocks = plannerState?.blocks || [];
  const activeBlock = getActiveBlock(plannerState, sessionState);
  const activePoint = getActivePoint(plannerState, sessionState);

  if (!activeBlock) {
    const completed = new Set(sessionState?.completedBlockIds || []);
    const skipped = new Set(sessionState?.skippedBlockIds || []);
    const pendingBlock = blocks.find((block) => !completed.has(block.id) && !skipped.has(block.id));
    if (pendingBlock) return {key: 'next', label: 'Ir al bloque pendiente', target: 'block', nextBlock: pendingBlock};
    return {key: 'finish', label: 'Terminar reunión', target: 'session'};
  }

  const pointStatuses = {...(sessionState?.pointStatuses || {})};
  if (activePoint) pointStatuses[activePoint.id] = POINT_STATUS.DONE;
  const nextPoint = getNextUnhandledPoint(activeBlock, activePoint?.id || null, pointStatuses);
  if (nextPoint) return {key: 'next', label: 'Siguiente tema', target: 'point', nextPoint};

  const blockIndex = blocks.findIndex((block) => block.id === activeBlock.id);
  const nextBlock = blockIndex >= 0 ? blocks[blockIndex + 1] : null;
  if (nextBlock) {
    const label = isBreakBlock(activeBlock) ? 'Terminar descanso' : 'Siguiente bloque';
    return {key: 'next', label, target: 'block', nextBlock};
  }
  return {key: 'finish', label: 'Terminar reunión', target: 'session'};
}

function getNextAction(plannerState, sessionState) {
  return getLivePrimaryAction(plannerState, sessionState);
}

/**
 * Clock shown in the live dock for the active bloque. Frozen while paused
 * (elapsed values use `pausedAt`).
 * - remaining: "Quedan 4:12"
 * - overtime:  "+2:30" (isWarning)
 * - unlimited: "Sin límite · 12:30"
 * - elapsed:   no active bloque → meeting elapsed time
 */
export function getLiveBlockClock(plannerState, sessionState, now = Date.now()) {
  const activeBlock = getActiveBlock(plannerState, sessionState);
  const isPaused = sessionState?.status === SESSION_STATUS.PAUSED;
  if (!activeBlock) {
    const elapsed = getElapsedSessionMs(sessionState, now);
    return {mode: 'elapsed', ms: elapsed, label: formatMsToClock(elapsed), isWarning: false, isPaused};
  }
  const extension = sessionState?.blockExtensions?.[activeBlock.id];
  if (extension?.isUnlimited) {
    const elapsed = getElapsedActiveBlockMs(sessionState, now);
    return {mode: 'unlimited', ms: elapsed, label: `Sin límite · ${formatMsToClock(elapsed)}`, isWarning: false, isPaused};
  }
  const remaining = getRemainingActiveBlockMs(activeBlock, sessionState, now);
  if (remaining >= 0) {
    return {
      mode: 'remaining',
      ms: remaining,
      label: `Quedan ${formatMsToClock(remaining)}`,
      isWarning: remaining <= 60 * 1000,
      isPaused,
    };
  }
  return {mode: 'overtime', ms: -remaining, label: `+${formatMsToClock(-remaining)}`, isWarning: true, isPaused};
}

export function getAssistantContextDetails(plannerState, sessionState, now = Date.now()) {
  const evaluation = evaluateSessionAssistant(plannerState, sessionState, now);
  const blocks = plannerState?.blocks || [];
  const activeBlock = evaluation.activeBlock;
  const activePoint = evaluation.activePoint;
  const activeBlockIndex = activeBlock ? blocks.findIndex((block) => block.id === activeBlock.id) : -1;
  const points = activeBlock?.subpoints || [];
  const activePointIndex = activePoint ? points.findIndex((point) => point.id === activePoint.id) : -1;
  const nextAction = getNextAction(plannerState, sessionState);
  const pointCounts = getPointCounts(plannerState, sessionState);

  const blockProgressLabel = activeBlockIndex >= 0
    ? `Bloque ${activeBlockIndex + 1} de ${blocks.length}`
    : 'Reunión en curso';
  const pointProgressLabel = activePointIndex >= 0
    ? `Tema ${activePointIndex + 1} de ${points.length}`
    : null;

  const isPaused = sessionState?.status === SESSION_STATUS.PAUSED;
  const isUnlimited = evaluation.isUnlimited;
  const isExpired = evaluation.isExpired;
  const is5MinWarning = evaluation.is5MinWarning;
  const extensionMinutes = evaluation.extensionMinutes || 0;
  const isExtended = extensionMinutes > 0 && !isUnlimited && !isExpired;

  const estimatedEndTime = recalculateEstimatedEndTime(plannerState, sessionState);
  const totalExtensionsMinutes = Object.values(sessionState?.blockExtensions || {}).reduce(
    (total, extension) => total + (extension.extensionMinutes || 0),
    0
  );
  const estimatedEndDisplay = totalExtensionsMinutes > 0
    ? `Fin estimado ${estimatedEndTime} · +${totalExtensionsMinutes} min`
    : `Fin estimado ${estimatedEndTime}`;

  const sessionElapsedMs = getElapsedSessionMs(sessionState, now);
  const sessionPlannedMinutes = plannerState?.totalCalculatedDuration || 0;
  const sessionTotalPlannedMs = Math.max(sessionPlannedMinutes * 60 * 1000, 1);
  const sessionProgressPercent = Math.min(Math.round((sessionElapsedMs / sessionTotalPlannedMs) * 100), 100);
  const blockPlannedMs = Math.max(getBlockPlannedMs(activeBlock, sessionState), 1);
  const blockProgressPercent = Math.min(Math.round((evaluation.elapsedBlockMs / blockPlannedMs) * 100), 100);

  const recordingContextKey = getRecordingContextKey(sessionState);
  const hasRecording = (sessionState?.recordings || []).some((recording) => {
    if (activePoint) return recording.pointId === activePoint.id;
    return !recording.pointId && recording.blockId === activeBlock?.id;
  });
  const isPromptDismissed = Boolean(recordingContextKey && sessionState?.recordingPromptsDismissed?.[recordingContextKey]);
  // Asked once per meeting: only while nothing has been recorded yet and the
  // group has not answered "Ahora no" for any tema/bloque.
  const anyPromptDismissed = Object.keys(sessionState?.recordingPromptsDismissed || {}).length > 0;
  const anyRecording = (sessionState?.recordings || []).length > 0;
  const showInitialRecordingPrompt = Boolean(
    activeBlock && !isBreakBlock(activeBlock) && !anyRecording && !anyPromptDismissed && !isPromptDismissed && !isPaused
  );

  let stateVariant = 'running';
  let contextualHelperText = `${activeBlock?.durationMinutes || 0} min planificados para el bloque`;
  let primaryAction = {...nextAction, variant: 'primary'};
  let secondaryAction = {label: 'Pausar', key: 'pause', variant: 'ghost'};

  if (isPaused) {
    stateVariant = 'paused';
    contextualHelperText = 'La reunión está en pausa: el tiempo está detenido.';
    primaryAction = {label: 'Reanudar', key: 'resume', variant: 'primary'};
    secondaryAction = {...nextAction, variant: 'ghost'};
  } else if (isExpired) {
    stateVariant = 'expired';
    contextualHelperText = activePoint
      ? `Tiempo del bloque cumplido. El tema “${activePoint.title}” sigue activo.`
      : 'Tiempo del bloque cumplido. Puedes extenderlo o continuar.';
  } else if (is5MinWarning) {
    stateVariant = 'warning';
    contextualHelperText = 'Quedan menos de 5 minutos en este bloque.';
  } else if (isExtended) {
    stateVariant = 'extended';
    contextualHelperText = `Extensión del bloque: +${extensionMinutes} min`;
  } else if (isUnlimited) {
    stateVariant = 'unlimited';
    contextualHelperText = 'Este bloque continúa sin límite de tiempo.';
  }

  return {
    ...evaluation,
    activeBlockIndex,
    activePointIndex,
    totalBlocksCount: blocks.length,
    totalPointsInBlock: points.length,
    blockProgressLabel,
    pointProgressLabel,
    isLastBlock: activeBlockIndex >= 0 && activeBlockIndex === blocks.length - 1,
    isPaused,
    isExtended,
    stateVariant,
    stateTitle: activePoint?.title || activeBlock?.title || 'Reunión en curso',
    blockTitle: activeBlock?.title || '',
    activeBlockDescription: activeBlock?.introDesc || '',
    activePointDescription: activePoint?.description || activePoint?.desc || '',
    contextualHelperText,
    estimatedEndTime,
    estimatedEndDisplay,
    sessionElapsedMs,
    sessionPlannedMinutes,
    sessionProgressPercent,
    blockProgressPercent,
    totalPoints: pointCounts.total,
    completedPoints: pointCounts.done,
    skippedPoints: pointCounts.skipped,
    pointCounts,
    primaryAction,
    secondaryAction,
    nextAction,
    showInitialRecordingPrompt,
    hasRecording,
    canSkipPoint: Boolean(activePoint),
  };
}

export function computeSessionRecap(plannerState, sessionState) {
  const blocks = plannerState?.blocks || [];
  // Same planned duration the header shows (start + max(reserved, bloques)).
  const plannedDurationMinutes = getPlannedSchedule(plannerState || {}).plannedMinutes
    || plannerState?.totalCalculatedDuration || 0;
  const actualDurationMs = getElapsedSessionMs(sessionState, sessionState?.sessionEndedAt || Date.now());
  const actualDurationMinutes = Math.round(actualDurationMs / (60 * 1000));
  const leftOpen = wasMeetingLeftOpen(actualDurationMinutes, plannedDurationMinutes);
  const isInterrupted = sessionState?.status === SESSION_STATUS.INTERRUPTED;
  const isCompleted = sessionState?.status === SESSION_STATUS.COMPLETED;

  const completedCount = (sessionState?.completedBlockIds || []).length;
  const skippedCount = (sessionState?.skippedBlockIds || []).length;
  const totalBlocksCount = blocks.length;
  const pointCounts = getPointCounts(plannerState, sessionState);
  const extensionsCount = Object.values(sessionState?.blockExtensions || {}).filter(
    (extension) => (extension.extensionMinutes || 0) > 0 || extension.isUnlimited
  ).length;

  const recordings = sessionState?.recordings || [];
  const totalRecordedDurationMs = recordings.reduce((total, recording) => total + (recording.durationMs || 0), 0);
  const totalRecordedMinutes = Math.round(totalRecordedDurationMs / (60 * 1000));
  const decisions = sessionState?.decisions || [];
  const tasks = sessionState?.tasks || [];

  const statusLabel = isInterrupted ? 'Interrumpida' : 'Terminada';
  const statusBadgeColor = isInterrupted ? 'warning' : 'success';
  // The meeting's own name is the heading; the status lives in the badge.
  const recapTitle = plannerState?.title || 'Reunión';
  const recapDescription = isInterrupted
    ? 'El avance se conservó en el bloque y tema donde quedó.'
    : '';

  const groupedRecordings = blocks.map((block) => {
    const blockRecordings = recordings.filter((recording) => recording.blockId === block.id);
    const pointGroups = (block.subpoints || []).map((point) => ({
      point,
      recordings: blockRecordings.filter((recording) => recording.pointId === point.id),
    })).filter((group) => group.recordings.length > 0);
    const blockFallbackRecordings = blockRecordings.filter((recording) => !recording.pointId);
    return {block, pointGroups, blockFallbackRecordings};
  }).filter((group) => group.pointGroups.length > 0 || group.blockFallbackRecordings.length > 0);

  return {
    title: plannerState?.title || 'Reunión',
    date: plannerState?.date || '',
    host: plannerState?.host || '',
    status: sessionState?.status || SESSION_STATUS.COMPLETED,
    isInterrupted,
    isCompleted,
    statusLabel,
    statusBadgeColor,
    recapTitle,
    recapDescription,
    actualDurationMinutes,
    plannedDurationMinutes,
    leftOpen,
    sessionStartedAt: sessionState?.sessionStartedAt || null,
    timeEffectiveLabel: isInterrupted ? 'Tiempo transcurrido' : 'Tiempo efectivo',
    timeEffectiveSubtext: `de ${plannedDurationMinutes} min planificados`,
    completedCount,
    skippedCount,
    totalBlocksCount,
    blocksProgressSubtext: `${completedCount} de ${totalBlocksCount} bloques completados`,
    totalPointsCount: pointCounts.total,
    completedPointsCount: pointCounts.done,
    skippedPointsCount: pointCounts.skipped,
    pointsProgressSubtext: `${pointCounts.done} de ${pointCounts.total} temas tratados`,
    extensionsCount,
    recordings,
    groupedRecordings,
    totalRecordingsCount: recordings.length,
    totalRecordedMinutes,
    totalRecordedDurationMs,
    decisions,
    tasks,
  };
}
