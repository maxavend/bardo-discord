import {
  SESSION_STATUS,
  getElapsedSessionMs,
  getElapsedActiveBlockMs,
  getRemainingActiveBlockMs,
  recalculateEstimatedEndTime,
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
  SESSION_PAUSED: 'SESSION_PAUSED',
  SESSION_RESUMED: 'SESSION_RESUMED',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  SESSION_INTERRUPTED: 'SESSION_INTERRUPTED',
};

/**
 * Formats a duration in milliseconds to clean MM:SS or HH:MM:SS.
 */
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

/**
 * Formats minutes into human clock duration (e.g. 180 -> 03:00 or 45 -> 00:45).
 */
export function formatMinutesToClock(minutes = 0) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Checks whether a scheduled session is upcoming / starting right now.
 */
export function isSessionUpcoming(plannerState, now = new Date()) {
  if (!plannerState || !plannerState.date || !plannerState.startTime) return false;
  try {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (plannerState.date !== todayStr) return false;

    const [h, m] = plannerState.startTime.split(':').map(Number);
    const scheduledMinutes = h * 60 + m;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Upcoming if within 30 minutes before or up to 60 minutes after scheduled start
    const diff = currentMinutes - scheduledMinutes;
    return diff >= -30 && diff <= 60;
  } catch {
    return false;
  }
}

/**
 * Evaluates the live session state and returns the current assistant evaluation.
 */
export function evaluateSessionAssistant(plannerState, sessionState, now = Date.now()) {
  if (!sessionState || sessionState.status === SESSION_STATUS.IDLE) {
    const upcoming = isSessionUpcoming(plannerState);
    return {
      event: upcoming ? ASSISTANT_EVENT.SESSION_UPCOMING : null,
      activeBlock: null,
      elapsedBlockMs: 0,
      remainingBlockMs: 0,
      is5MinWarning: false,
      isExpired: false,
      isUnlimited: false,
      overtimeMs: 0,
      extensionMinutes: 0,
    };
  }

  if (sessionState.status === SESSION_STATUS.COMPLETED) {
    return {
      event: ASSISTANT_EVENT.SESSION_COMPLETED,
      activeBlock: null,
      elapsedBlockMs: 0,
      remainingBlockMs: 0,
      is5MinWarning: false,
      isExpired: false,
      isUnlimited: false,
      overtimeMs: 0,
      extensionMinutes: 0,
    };
  }

  if (sessionState.status === SESSION_STATUS.INTERRUPTED) {
    return {
      event: ASSISTANT_EVENT.SESSION_INTERRUPTED,
      activeBlock: null,
      elapsedBlockMs: 0,
      remainingBlockMs: 0,
      is5MinWarning: false,
      isExpired: false,
      isUnlimited: false,
      overtimeMs: 0,
      extensionMinutes: 0,
    };
  }

  if (sessionState.status === SESSION_STATUS.PAUSED) {
    const activeBlock = (plannerState?.blocks || []).find(b => b.id === sessionState.liveActiveBlockId) || null;
    const elapsedBlockMs = getElapsedActiveBlockMs(sessionState, now);
    const remainingBlockMs = activeBlock ? getRemainingActiveBlockMs(activeBlock, sessionState, now) : 0;
    const extension = activeBlock ? sessionState.blockExtensions?.[activeBlock.id] : null;

    return {
      event: ASSISTANT_EVENT.SESSION_PAUSED,
      activeBlock,
      elapsedBlockMs,
      remainingBlockMs,
      is5MinWarning: false,
      isExpired: !extension?.isUnlimited && remainingBlockMs <= 0,
      isUnlimited: Boolean(extension?.isUnlimited),
      overtimeMs: remainingBlockMs < 0 ? Math.abs(remainingBlockMs) : 0,
      extensionMinutes: extension?.extensionMinutes || 0,
    };
  }

  const activeBlock = (plannerState?.blocks || []).find(b => b.id === sessionState.liveActiveBlockId) || null;
  if (!activeBlock) {
    return {
      event: null,
      activeBlock: null,
      elapsedBlockMs: 0,
      remainingBlockMs: 0,
      is5MinWarning: false,
      isExpired: false,
      isUnlimited: false,
      overtimeMs: 0,
      extensionMinutes: 0,
    };
  }

  const elapsedBlockMs = getElapsedActiveBlockMs(sessionState, now);
  const remainingBlockMs = getRemainingActiveBlockMs(activeBlock, sessionState, now);
  const extension = sessionState.blockExtensions?.[activeBlock.id];
  const isUnlimited = Boolean(extension?.isUnlimited);
  const extensionMinutes = extension?.extensionMinutes || 0;

  // Five minute warning: remaining between 0 and 5 minutes (300,000 ms) and not unlimited
  const is5MinWarning = !isUnlimited && remainingBlockMs > 0 && remainingBlockMs <= 5 * 60 * 1000;

  // Time expired: remaining <= 0 and not unlimited
  const isExpired = !isUnlimited && remainingBlockMs <= 0;

  const overtimeMs = remainingBlockMs < 0 ? Math.abs(remainingBlockMs) : 0;

  let event = ASSISTANT_EVENT.BLOCK_STARTED;
  if (isUnlimited) {
    event = ASSISTANT_EVENT.BLOCK_UNLIMITED;
  } else if (isExpired) {
    event = ASSISTANT_EVENT.BLOCK_TIME_EXPIRED;
  } else if (extensionMinutes > 0) {
    event = ASSISTANT_EVENT.BLOCK_EXTENDED;
  } else if (is5MinWarning) {
    event = ASSISTANT_EVENT.BLOCK_5_MIN_REMAINING;
  }

  return {
    event,
    activeBlock,
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
 * Returns comprehensive context details, recommendations and actions for the Session Assistant.
 */
export function getAssistantContextDetails(plannerState, sessionState, now = Date.now()) {
  const evalResult = evaluateSessionAssistant(plannerState, sessionState, now);
  const blocks = plannerState?.blocks || [];
  const activeBlock = evalResult.activeBlock;
  const activeBlockIndex = activeBlock ? blocks.findIndex(b => b.id === activeBlock.id) : -1;
  const isLastBlock = activeBlockIndex >= 0 && activeBlockIndex === blocks.length - 1;
  const totalBlocksCount = blocks.length;

  const blockProgressLabel = activeBlockIndex >= 0
    ? `Bloque ${activeBlockIndex + 1} de ${totalBlocksCount}`
    : 'Sesión en vivo';

  const isPaused = sessionState?.status === SESSION_STATUS.PAUSED;
  const isUnlimited = evalResult.isUnlimited;
  const isExpired = evalResult.isExpired;
  const is5MinWarning = evalResult.is5MinWarning;
  const extensionMinutes = evalResult.extensionMinutes || 0;
  const isExtended = extensionMinutes > 0 && !isUnlimited && !isExpired;

  const estimatedEndTime = recalculateEstimatedEndTime(plannerState, sessionState);
  const totalExtensionsMinutes = Object.values(sessionState?.blockExtensions || {}).reduce(
    (acc, ext) => acc + (ext.extensionMinutes || 0),
    0
  );

  const estimatedEndDisplay = totalExtensionsMinutes > 0
    ? `Fin estimado ${estimatedEndTime} · +${totalExtensionsMinutes} min`
    : `Fin estimado ${estimatedEndTime}`;

  // Session-level temporal metrics
  const sessionElapsedMs = getElapsedSessionMs(sessionState, now);
  const sessionPlannedMinutes = plannerState?.totalCalculatedDuration || 0;
  const sessionTotalPlannedMs = Math.max(sessionPlannedMinutes * 60 * 1000, 1);
  const sessionProgressPercent = Math.min(Math.round((sessionElapsedMs / sessionTotalPlannedMs) * 100), 100);

  // Subpoints tracking
  const totalPoints = blocks.reduce((acc, b) => acc + (b.subpoints || []).length, 0);
  const completedPoints = blocks.reduce(
    (acc, b) => acc + (b.subpoints || []).filter((p) => p.status === 'done').length,
    0
  );

  // Check if initial recording prompt should be presented
  const hasRecording = (sessionState?.recordings || []).some(r => r.blockId === activeBlock?.id);
  const isPromptDismissed = Boolean(activeBlock && sessionState?.recordingPromptsDismissed?.[activeBlock.id]);
  const showInitialRecordingPrompt = Boolean(activeBlock && !hasRecording && !isPromptDismissed && !isPaused);

  let stateVariant = 'running';
  let stateTitle = activeBlock?.title || 'Sesión en vivo';
  let contextualHelperText = `${activeBlock?.durationMinutes || 10} min planificados`;
  let primaryAction = isLastBlock
    ? {label: 'Finalizar sesión', key: 'finish', variant: 'primary'}
    : {label: 'Siguiente →', key: 'next', variant: 'primary'};
  let secondaryAction = {label: 'Pausar', key: 'pause', variant: 'ghost'};

  if (isPaused) {
    stateVariant = 'paused';
    stateTitle = `${activeBlock?.title || 'Bloque'} · Sesión pausada`;
    contextualHelperText = 'El tiempo y la grabación están pausados.';
    primaryAction = {label: 'Reanudar sesión', key: 'resume', variant: 'primary'};
    secondaryAction = isLastBlock
      ? {label: 'Finalizar', key: 'finish', variant: 'ghost'}
      : {label: 'Siguiente', key: 'next', variant: 'ghost'};
  } else if (isExpired) {
    stateVariant = 'expired';
    stateTitle = `${activeBlock?.title || 'Bloque'} · Tiempo cumplido`;
    contextualHelperText = `${activeBlock?.durationMinutes || 10} min planificados · ¿Continuamos o pasamos al siguiente punto?`;
    primaryAction = isLastBlock
      ? {label: 'Finalizar sesión', key: 'finish', variant: 'primary'}
      : {label: 'Siguiente →', key: 'next', variant: 'primary'};
    secondaryAction = {label: 'Pausar', key: 'pause', variant: 'ghost'};
  } else if (is5MinWarning) {
    stateVariant = 'warning';
    stateTitle = activeBlock?.title || 'Bloque';
    contextualHelperText = 'Quedan 5 minutos para este punto.';
  } else if (isExtended) {
    stateVariant = 'extended';
    stateTitle = activeBlock?.title || 'Bloque';
    contextualHelperText = `Planificado ${activeBlock?.durationMinutes || 10} min · Extensión +${extensionMinutes} min`;
  } else if (isUnlimited) {
    stateVariant = 'unlimited';
    stateTitle = activeBlock?.title || 'Bloque';
    contextualHelperText = 'Tiempo extendido sin límite';
  }

  return {
    ...evalResult,
    activeBlockIndex,
    totalBlocksCount,
    blockProgressLabel,
    isLastBlock,
    isPaused,
    isExtended,
    stateVariant,
    stateTitle,
    activeBlockDescription: activeBlock?.introDesc || '',
    contextualHelperText,
    estimatedEndTime,
    estimatedEndDisplay,
    sessionElapsedMs,
    sessionPlannedMinutes,
    sessionProgressPercent,
    totalPoints,
    completedPoints,
    primaryAction,
    secondaryAction,
    showInitialRecordingPrompt,
    hasRecording,
  };
}

/**
 * Computes deterministic recap metrics for Session Recap.
 * Correctly distinguishes between COMPLETED and INTERRUPTED sessions.
 */
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

  const extensionsCount = Object.values(sessionState?.blockExtensions || {}).filter(
    ext => (ext.extensionMinutes || 0) > 0 || ext.isUnlimited
  ).length;

  const totalRecordings = sessionState?.recordings || [];
  const totalRecordedDurationMs = totalRecordings.reduce((acc, r) => acc + (r.durationMs || 0), 0);
  const totalRecordedMinutes = Math.round(totalRecordedDurationMs / (60 * 1000));

  const decisions = sessionState?.decisions || [];

  const statusLabel = isInterrupted ? 'Interrumpida' : 'Completada';
  const statusBadgeColor = isInterrupted ? 'warning' : 'success';
  const recapTitle = isInterrupted ? `Sesión interrumpida · ${plannerState?.title || 'Sesión'}` : `Sesión finalizada · ${plannerState?.title || 'Sesión'}`;
  const recapDescription = isInterrupted
    ? `Se conservaron ${actualDurationMinutes} min de actividad, ${totalRecordings.length} grabaciones y ${decisions.length} decisiones.`
    : 'Aquí tienes el resumen objetivo de tiempo, temas abordados y grabaciones generadas.';

  const timeEffectiveLabel = isInterrupted ? 'Tiempo transcurrido' : 'Tiempo efectivo';
  const timeEffectiveSubtext = isInterrupted
    ? `de ${plannedDurationMinutes} min planificados`
    : `Planificado: ${plannedDurationMinutes} min`;

  const blocksProgressSubtext = isInterrupted
    ? `${completedCount} de ${totalBlocksCount} puntos tratados`
    : (skippedCount > 0 ? `${skippedCount} saltados` : 'Todos los bloques revisados');

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
    timeEffectiveLabel,
    timeEffectiveSubtext,
    blocksProgressSubtext,
    plannedDurationMinutes,
    actualDurationMinutes,
    completedCount,
    skippedCount,
    totalBlocksCount,
    extensionsCount,
    totalRecordingsCount: totalRecordings.length,
    totalRecordedMinutes,
    totalRecordedDurationMs,
    recordings: totalRecordings,
    decisions,
  };
}
