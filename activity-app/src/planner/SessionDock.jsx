import {
  Button,
} from '@heroui/react';
import {
  Microphone,
  Pause,
  Play,
  ArrowRight,
} from '@gravity-ui/icons';
import {SESSION_STATUS} from './session-runner.js';
import {formatMsToClock, getAssistantContextDetails} from './session-assistant-engine.js';
import {RECORDING_STATUS} from './recording-controller.js';
import {MaterialMorphShape} from './MaterialMorphShape.jsx';

export function SessionDock({
  plannerState,
  sessionState,
  recordingStatus,
  recordingElapsedMs,
  recordingContext: _recordingContext,
  isTransitioning = false,
  onPauseSession,
  onResumeSession,
  onAdvance,
  onSkipPoint: _onSkipPoint,
  onSkipBlock: _onSkipBlock,
  onExtendBlock: _onExtendBlock,
  onSetUnlimited: _onSetUnlimited,
  onStartRecording,
  onFinalizeRecording: _onFinalizeRecording,
  onPauseRecording,
  onResumeRecording,
  onDismissRecordingPrompt: _onDismissRecordingPrompt,
  onOpenDecisionCapture: _onOpenDecisionCapture,
  onInterruptSession: _onInterruptSession,
}) {
  if (
    !sessionState ||
    sessionState.status === SESSION_STATUS.IDLE ||
    sessionState.status === SESSION_STATUS.COMPLETED ||
    sessionState.status === SESSION_STATUS.INTERRUPTED
  ) {
    return null;
  }

  const details = getAssistantContextDetails(plannerState, sessionState);
  const activeBlock = details.activeBlock;
  const activePoint = details.activePoint;
  const isRecording = recordingStatus === RECORDING_STATUS.RECORDING;
  const isRecPaused = recordingStatus === RECORDING_STATUS.PAUSED;
  const isRecSaving = recordingStatus === RECORDING_STATUS.FINALIZING;
  const isBusy = isTransitioning || isRecSaving;
  const isPaused = details.isPaused;
  const isExpired = details.isExpired;
  const isUnlimited = details.isUnlimited;
  const is5MinWarning = details.is5MinWarning;
  const advanceLabel = details.nextAction.label;

  const renderAdvanceButton = (variant = 'primary', size = 'sm') => (
    <Button
      variant={variant}
      size={size}
      onPress={onAdvance}
      isDisabled={isBusy}
      className={`font-medium text-xs rounded-full ${size === 'sm' ? 'h-8 px-3.5' : 'h-7 px-3'}`}
    >
      <span>{isBusy ? 'Guardando…' : advanceLabel}</span>
      {!isBusy && details.nextAction.target !== 'session' && <ArrowRight width={12} height={12} />}
    </Button>
  );

  return (
    <aside
      role="region"
      aria-label="Asistente de sesión en vivo"
      className="session-toolbar-sticky w-full mb-3 animate-in fade-in slide-in-from-top-1 duration-150"
      style={{
        position: 'sticky',
        top: 'calc(var(--bardo-visual-viewport-top, 0px) + var(--bardo-safe-top, 0px) + var(--bardo-topbar, 52px) + var(--bardo-toolbar-gap, 12px))',
        zIndex: 45,
      }}
    >
      <div className="w-full session-dock-glass rounded-full p-1.5 sm:p-2 flex items-center justify-between gap-3 transition-all duration-200 shadow-sm animate-in fade-in zoom-in-95 duration-100">
        {/* Resumen operacional: MorphDot + Tema · Tiempo */}
        <div className="flex items-center gap-2 min-w-0 flex-1 pl-1.5 sm:pl-2">
          <MaterialMorphShape
            size={13}
            color={isPaused ? 'warning' : isExpired ? 'danger' : is5MinWarning ? 'warning' : 'accent'}
            isPaused={isPaused}
            className="shrink-0"
          />

          <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
            {activePoint?.title || activeBlock?.title || 'Sesión en vivo'}
          </span>

          <span className="text-muted/40">·</span>

          {/* Timer de bloque */}
          <span className={`text-xs font-medium shrink-0 ${
            isPaused ? 'text-warning' : isExpired ? 'text-danger font-semibold' : is5MinWarning ? 'text-warning font-semibold' : 'text-foreground'
          }`}>
            {isPaused
              ? `${formatMsToClock(details.remainingBlockMs)} · pausado`
              : isExpired
              ? `+${formatMsToClock(details.overtimeMs)}`
              : isUnlimited
              ? `+${formatMsToClock(details.elapsedBlockMs)}`
              : `${formatMsToClock(details.remainingBlockMs)}`}
          </span>
        </div>

        {/* Microacciones rápidas + Siguiente */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 1. Grabar / Estado de Grabación (Primero y Rojo) */}
          {isRecording ? (
            <button
              type="button"
              onClick={onPauseRecording}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-danger text-white text-[11px] font-medium cursor-pointer shadow-xs"
              title="Pausar grabación"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
            </button>
          ) : isRecPaused ? (
            <button
              type="button"
              onClick={onResumeRecording}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-warning text-white text-[11px] font-medium cursor-pointer shadow-xs"
              title="Reanudar grabación"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
            </button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              isIconOnly
              onPress={onStartRecording}
              isDisabled={isBusy}
              aria-label="Grabar"
              className="h-7 w-7 rounded-full bg-danger text-white hover:bg-danger/90 shadow-xs"
            >
              <Microphone width={13} height={13} className="text-white" />
            </Button>
          )}

          {/* 2. Pausar / Reanudar sesión */}
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={isPaused ? onResumeSession : onPauseSession}
            isDisabled={isBusy}
            aria-label={isPaused ? 'Reanudar' : 'Pausar'}
            className="h-7 w-7 rounded-full text-muted hover:text-foreground"
          >
            {isPaused ? <Play width={13} height={13} /> : <Pause width={13} height={13} />}
          </Button>

          {/* 3. Siguiente → */}
          {renderAdvanceButton('primary', 'sm')}
        </div>
      </div>
    </aside>
  );
}
