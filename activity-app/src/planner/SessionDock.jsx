import {
  Button,
} from '@heroui/react';
import {
  Microphone,
  Pause,
  Play,
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
  onAdvance: _onAdvance,
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

  return (
    <aside
      role="region"
      aria-label="Asistente de sesión en vivo"
      className="session-toolbar-sticky w-full mb-3 animate-in fade-in slide-in-from-top-2 duration-250"
      style={{
        position: 'sticky',
        top: 'calc(var(--bardo-visual-viewport-top, 0px) + var(--bardo-safe-top, 0px) + var(--bardo-topbar, 52px) + var(--bardo-toolbar-gap, 12px))',
        zIndex: 45,
      }}
    >
      <div className="w-full session-dock-glass rounded-full p-1.5 sm:p-2 flex items-center justify-between gap-3 transition-all duration-150 shadow-sm animate-in fade-in zoom-in-95 duration-150">
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
              ? `${isExpired ? `+${formatMsToClock(details.overtimeMs)}` : formatMsToClock(Math.max(0, details.remainingBlockMs))} · pausado`
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
            className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
              isPaused
                ? 'text-warning hover:text-warning-foreground hover:bg-warning/20'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {isPaused ? <Play width={13} height={13} fill="currentColor" /> : <Pause width={13} height={13} />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
