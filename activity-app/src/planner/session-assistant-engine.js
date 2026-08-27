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
  getPointStatus,
  getRecordingContextKey,
} from './session-runner.js';

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

function getNextAction(plannerState, sessionState, activeBlock, activePoint) {
  const blocks = plannerState?.blocks || [];
  const blockIndex = activeBlock ? blocks.findIndex((block) => block.id === activeBlock.id) : -1;
  const points = activeBlock?.subpoints || [];
  const pointIndex = activePoint ? points.findIndex((point) => point.id === activePoint.id) : -1;

  if (activePoint) {
    const nextPoint = points.slice(pointIndex + 1).find((point) => {
      const status = getPointStatus(sessionState, point.id);
      return status !== POINT_STATUS.DONE && status !== POINT_STATUS.SKIPPED;
    });
    if (nextPoint) return {key: 'next', label: 'Siguiente punto', target: 'point', nextPoint};
  }

  const nextBlock = blockIndex >= 0 ? blocks[blockIndex + 1] : null;
  if (nextBlock) return {key: 'next', label: 'Siguiente bloque', target: 'block', nextBlock};
  return {key: 'finish', label: 'Finalizar sesión', target: 'session'};
}

export function getAssistantContextDetails(plannerState, sessionState, now = Date.now()) {
  const evaluation = evaluateSessionAssistant(plannerState, sessionState, now);
  const blocks = plannerState?.blocks || [];
  const activeBlock = evaluation.activeBlock;
  const activePoint = evaluation.activePoint;
  const activeBlockIndex = activeBlock ? blocks.findIndex((block) => block.id === activeBlock.id) : -1;
  const points = activeBlock?.subpoints || [];
  const activePointIndex = activePoint ? points.findIndex((point) => point.id === activePoint.id) : -1;
  const nextAction = getNextAction(plannerState, sessionState, activeBlock, activePoint);
  const pointCounts = getPointCounts(plannerState, sessionState);

  const blockProgressLabel = activeBlockIndex >= 0
    ? `Bloque ${activeBlockIndex + 1} de ${blocks.length}`
    : 'Sesión en vivo';
  const pointProgressLabel = activePointIndex >= 0
    ? `Punto ${activePointIndex + 1} de ${points.length}`
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
  const showInitialRecordingPrompt = Boolean(activeBlock && !hasRecording && !isPromptDismissed && !isPaused);

  let stateVariant = 'running';
  let contextualHelperText = `${activeBlock?.durationMinutes || 0} min planificados para el bloque`;
  let primaryAction = {...nextAction, variant: 'primary'};
  let secondaryAction = {label: 'Pausar', key: 'pause', variant: 'ghost'};

  if (isPaused) {
    stateVariant = 'paused';
    contextualHelperText = 'El tiempo está pausado. La grabación no se reanudará automáticamente.';
    primaryAction = {label: 'Reanudar sesión', key: 'resume', variant: 'primary'};
    secondaryAction = {...nextAction, variant: 'ghost'};
  } else if (isExpired) {
    stateVariant = 'expired';
    contextualHelperText = activePoint
      ? `Tiempo del bloque cumplido. El punto “${activePoint.title}” sigue activo.`
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
    stateTitle: activePoint?.title || activeBlock?.title || 'Sesión en vivo',
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
  const plannedDurationMinutes = plannerState?.totalCalculatedDuration || 0;
  const actualDurationMs = getElapsedSessionMs(sessionState, sessionState?.sessionEndedAt || Date.now());
  const actualDurationMinutes = Math.round(actualDurationMs / (60 * 1000));
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

  const statusLabel = isInterrupted ? 'Interrumpida' : 'Completada';
  const statusBadgeColor = isInterrupted ? 'warning' : 'success';
  const recapTitle = isInterrupted
    ? `Sesión interrumpida · ${plannerState?.title || 'Sesión'}`
    : `Sesión finalizada · ${plannerState?.title || 'Sesión'}`;
  const recapDescription = isInterrupted
    ? 'El progreso se conservó exactamente en el bloque y punto donde se interrumpió.'
    : 'Resumen de tiempo, bloques, puntos tratados y artefactos de la sesión.';

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
    title: plannerState?.title || 'Sesión',
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
    timeEffectiveLabel: isInterrupted ? 'Tiempo transcurrido' : 'Tiempo efectivo',
    timeEffectiveSubtext: `de ${plannedDurationMinutes} min planificados`,
    completedCount,
    skippedCount,
    totalBlocksCount,
    blocksProgressSubtext: `${completedCount} de ${totalBlocksCount} bloques completados`,
    totalPointsCount: pointCounts.total,
    completedPointsCount: pointCounts.done,
    skippedPointsCount: pointCounts.skipped,
    pointsProgressSubtext: `${pointCounts.done} de ${pointCounts.total} puntos tratados`,
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
