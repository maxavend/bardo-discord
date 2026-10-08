import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square } from 'lucide-react';
import { MicIcon } from '@/components/ui/animated-icons';
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
  onFinalizeRecording,
  onPauseRecording,
  onResumeRecording,
  onDismissRecordingPrompt: _onDismissRecordingPrompt,
  onOpenDecisionCapture: _onOpenDecisionCapture,
  onInterruptSession: _onInterruptSession,
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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

  // El timer corre de manera continua desde que inicia la sesión (o punto activo),
  // incluso si la reunión está en pausa.
  const sessionStartTime = sessionState.sessionStartedAt || sessionState.activeBlockStartedAt || now;
  const elapsedContinuousMs = Math.max(0, now - sessionStartTime);

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
      <div className="w-full max-w-4xl mx-auto rounded-full bg-card/95 border border-border/80 shadow-xs backdrop-blur-md p-2 flex items-center justify-between gap-3 transition-all duration-150">
        {/* Resumen operacional: Timer primero + Tema activo */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-primary/15 text-primary tabular-nums shrink-0">
            {formatMsToClock(elapsedContinuousMs)}
          </span>

          <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
            {activePoint?.title || activeBlock?.title || 'Reunión en vivo'}
          </span>
        </div>

        {/* Microacciones: Grabación y Control de Evento */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 1. Control de Grabación */}
          {isRecording || isRecPaused ? (
            <div className="flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive shadow-2xs">
              {/* Indicador morph + etiqueta */}
              <div className="flex items-center gap-1.5 select-none">
                <MaterialMorphShape
                  size={11}
                  color="danger"
                  isPaused={isRecPaused}
                  className="shrink-0"
                />
                <span className="text-xs font-semibold">
                  {isRecPaused ? 'Pausado' : 'Grabando'}
                </span>
              </div>

              {/* Tiempo de grabación afuera de los botones */}
              <span className="tabular-nums font-mono text-[11px] font-medium text-destructive/80 px-1">
                {formatMsToClock(recordingElapsedMs)}
              </span>

              {/* Botón icono Pausar / Reanudar grabación */}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={isRecording ? onPauseRecording : onResumeRecording}
                disabled={isBusy}
                aria-label={isRecording ? 'Pausar grabación' : 'Reanudar grabación'}
                title={isRecording ? 'Pausar grabación' : 'Reanudar grabación'}
                className="size-6 rounded-full hover:bg-destructive/20 text-destructive cursor-pointer"
              >
                {isRecording ? (
                  <Pause className="size-3 fill-current" />
                ) : (
                  <Play className="size-3 fill-current ml-0.5" />
                )}
              </Button>

              {/* Botón icono Detener / Guardar grabación */}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onFinalizeRecording}
                disabled={isBusy}
                aria-label="Detener y guardar grabación"
                title="Detener y guardar grabación"
                className="size-6 rounded-full hover:bg-destructive/20 text-destructive cursor-pointer"
              >
                <Square className="size-2.5 fill-current" />
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="xs"
              onClick={onStartRecording}
              disabled={isBusy}
              aria-label="Grabar audio"
              title="Iniciar grabación de audio"
              className="h-7 rounded-full gap-1.5 px-3 text-xs font-medium cursor-pointer shadow-2xs transition-all"
            >
              <MicIcon className="size-3.5 text-destructive shrink-0" />
              <span>Grabar</span>
            </Button>
          )}

          {/* Separador sutil */}
          <div className="h-4 w-px bg-border/80" />

          {/* 2. Control de Evento (Pausar evento / Continuar evento) en variant="secondary" */}
          <Button
            variant="secondary"
            size="xs"
            onClick={isPaused ? onResumeSession : onPauseSession}
            disabled={isBusy}
            aria-label={isPaused ? 'Continuar evento' : 'Pausar evento'}
            title={isPaused ? 'Continuar evento' : 'Pausar evento'}
            className="h-7 rounded-full gap-1.5 px-3 text-xs font-medium cursor-pointer shadow-2xs transition-all text-foreground"
          >
            {isPaused ? (
              <>
                <Play className="size-3 fill-current ml-0.5 text-primary" />
                <span>Continuar evento</span>
              </>
            ) : (
              <>
                <Pause className="size-3 fill-current text-primary" />
                <span>Pausar evento</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
