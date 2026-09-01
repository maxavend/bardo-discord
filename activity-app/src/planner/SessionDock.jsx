import { Button } from '@/components/ui/button';
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
      aria-label="Asistente de reunión en vivo"
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
            {activePoint?.title || activeBlock?.title || 'Reunión en vivo'}
          </span>

          <span className="text-muted/40">·</span>

          {/* Timer de bloque */}
          <span
            title={isExpired ? `${formatMsToClock(details.overtimeMs)} sobre el tiempo previsto` : undefined}
            className={`text-xs font-medium shrink-0 ${
            isPaused ? 'text-warning' : isExpired ? 'text-danger font-semibold' : is5MinWarning ? 'text-warning font-semibold' : 'text-foreground'
          }`}>
            {isPaused
              ? `${isExpired ? `+${formatMsToClock(details.overtimeMs)}` : formatMsToClock(Math.max(0, details.remainingBlockMs))}`
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
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-danger text-white text-[11.5px] font-medium cursor-pointer shadow-xs active:scale-95 transition-transform"
              title="Pausar grabación"
              aria-label="Pausar grabación"
            >
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
            </button>
          ) : isRecPaused ? (
            <button
              type="button"
              onClick={onResumeRecording}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning text-white text-[11.5px] font-medium cursor-pointer shadow-xs active:scale-95 transition-transform"
              title="Reanudar grabación"
              aria-label="Reanudar grabación"
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
            </button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              isIconOnly
              onPress={onStartRecording}
              isDisabled={isBusy}
              aria-label="Iniciar grabación"
              title="Iniciar grabación"
              className="h-8 w-8 rounded-full bg-danger text-white hover:bg-danger/90 shadow-xs"
            >
              <Microphone width={14} height={14} className="text-white" />
            </Button>
          )}

          {/* 2. Pausar / Reanudar reunión */}
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={isPaused ? onResumeSession : onPauseSession}
            isDisabled={isBusy}
            aria-label={isPaused ? 'Reanudar reunión' : 'Pausar reunión'}
            title={isPaused ? 'Reanudar reunión' : 'Pausar reunión'}
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
              isPaused
                ? 'text-warning hover:text-warning-foreground hover:bg-warning/20'
                : 'text-muted hover:text-foreground hover:bg-surface-secondary'
            }`}
          >
            <span className="session-toggle-icon" aria-hidden="true">
              {isPaused ? <Play width={14} height={14} fill="currentColor" /> : <Pause width={14} height={14} fill="currentColor" />}
            </span>
          </Button>
        </div>
      </div>
    </aside>
  );
}
