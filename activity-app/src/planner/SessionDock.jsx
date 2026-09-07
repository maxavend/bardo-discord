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
            <button
              type="button"
              onClick={onPauseRecording}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive text-destructive-foreground text-[11.5px] font-medium cursor-pointer shadow-xs active:scale-95 transition-transform"
              title="Pausar grabación"
              aria-label="Pausar grabación"
            >
              <span className="size-2 rounded-full bg-destructive-foreground animate-pulse" />
              <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
            </button>
          ) : isRecPaused ? (
            <button
              type="button"
              onClick={onResumeRecording}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-white text-[11.5px] font-medium cursor-pointer shadow-xs active:scale-95 transition-transform"
              title="Reanudar grabación"
              aria-label="Reanudar grabación"
            >
              <span className="size-2 rounded-full bg-white" />
              <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
            </button>
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
    </aside>
  );
}
