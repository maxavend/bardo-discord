import { Button } from '@/components/ui/button';
import {
  Mic,
  Pause,
  Play,
} from 'lucide-react';
import { SESSION_STATUS } from './session-runner.js';
import { formatMsToClock, getAssistantContextDetails } from './session-assistant-engine.js';
import { RECORDING_STATUS } from './recording-controller.js';
import { MaterialMorphShape } from './MaterialMorphShape.jsx';

export function SessionDock({
  plannerState,
  sessionState,
  recordingStatus,
  recordingElapsedMs,
  recordingError = '',
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
      className="session-toolbar-sticky mb-3 w-full animate-in fade-in slide-in-from-top-2 duration-250"
    >
<div className="flex flex-col gap-2">
      <div className="w-full session-dock-glass rounded-full p-1.5 sm:p-2 flex items-center justify-between gap-3 transition-all duration-150 shadow-sm animate-in fade-in zoom-in-95">
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

          <span className="text-muted-foreground/40">·</span>

          {/* Timer de bloque */}
          <span
            title={isExpired ? `${formatMsToClock(details.overtimeMs)} sobre el tiempo previsto` : undefined}
            className={`text-xs font-medium shrink-0 ${
              isPaused ? 'text-amber-500 font-semibold' : isExpired ? 'text-destructive font-semibold' : is5MinWarning ? 'text-amber-500 font-semibold' : 'text-foreground'
            }`}
          >
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
          {/* 1. Grabar / Estado de Grabación */}
          {isRecording ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={onPauseRecording}
              disabled={isBusy}
              className="h-8 rounded-full px-3 text-xs font-medium shadow-xs"
              title="Pausar grabación"
              aria-label="Pausar grabación"
            >
              <span className="size-2 rounded-full bg-destructive-foreground animate-pulse" />
              <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
            </Button>
          ) : isRecPaused ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onResumeRecording}
              disabled={isBusy}
              className="h-8 rounded-full px-3 text-xs font-medium text-amber-700 dark:text-amber-300"
              title="Reanudar grabación"
              aria-label="Reanudar grabación"
            >
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="icon-sm"
              onClick={onStartRecording}
              disabled={isBusy}
              aria-label="Iniciar grabación"
              title="Iniciar grabación"
              className="rounded-full shadow-xs"
            >
              <Mic className="size-3.5" />
            </Button>
          )}

          {/* 2. Pausar / Reanudar reunión */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={isPaused ? onResumeSession : onPauseSession}
            disabled={isBusy}
            aria-label={isPaused ? 'Reanudar reunión' : 'Pausar reunión'}
            title={isPaused ? 'Reanudar reunión' : 'Pausar reunión'}
            className={`rounded-full flex items-center justify-center transition-colors ${
              isPaused
                ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span className="session-toggle-icon" aria-hidden="true">
              {isPaused ? <Play className="size-3.5 fill-current" /> : <Pause className="size-3.5 fill-current" />}
            </span>
          </Button>
        </div>
      </div>
      {recordingError && (
        <div role="alert" className="mx-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-xs text-foreground leading-relaxed">{recordingError}</p>
          <Button variant="outline" size="sm" onClick={onStartRecording} disabled={isBusy} className="shrink-0">
            Intentar de nuevo
          </Button>
        </div>
      )}
      </div>
    </aside>
  );
}
