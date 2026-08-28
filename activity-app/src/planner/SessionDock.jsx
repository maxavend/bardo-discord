import {useState, useEffect} from 'react';
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
  onFinalizeRecording,
  onPauseRecording,
  onResumeRecording,
  onDismissRecordingPrompt: _onDismissRecordingPrompt,
  onOpenDecisionCapture: _onOpenDecisionCapture,
  onInterruptSession: _onInterruptSession,
}) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 90);
    };
    window.addEventListener('scroll', handleScroll, {passive: true});
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
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
  const isExpired = details.isExpired;
  const isUnlimited = details.isUnlimited;
  const is5MinWarning = details.is5MinWarning;
  const isExtended = details.isExtended;
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
      {/* ── Modo Sticky Compacto (Al hacer scroll: border-radius 9999px) ──── */}
      {isScrolled ? (
        <div className="w-full session-dock-glass rounded-full px-4 py-1.5 flex items-center justify-between gap-3 transition-all duration-200 shadow-sm animate-in fade-in zoom-in-95 duration-100">
          {/* Resumen operacional: Tema · #/# · Tiempo · Progreso */}
          <div className="flex items-center gap-2 min-w-0 flex-1 pl-1">
            <span className={`h-2 w-2 rounded-full shrink-0 ${
              isPaused ? 'bg-warning' : isExpired ? 'bg-danger animate-pulse' : is5MinWarning ? 'bg-warning animate-pulse' : 'bg-accent'
            }`} />

            <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
              {activePoint?.title || activeBlock?.title || 'Sesión en vivo'}
            </span>

            <span className="text-xs font-mono text-muted shrink-0 tabular-nums">
              {details.activeBlockIndex >= 0 ? `${details.activeBlockIndex + 1}/${details.totalBlocksCount}` : ''}
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

            {details.totalPoints > 0 && (
              <>
                <span className="text-muted/40 hidden sm:inline">·</span>
                <span className="text-xs text-muted shrink-0 hidden sm:inline">
                  {details.completedPoints}/{details.totalPoints} puntos
                </span>
              </>
            )}
          </div>

          {/* Microacciones rápidas + Siguiente */}
          <div className="flex items-center gap-1.5 shrink-0 pr-0.5">
            {/* 1. Grabar / Estado de Grabación (Primero) */}
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
      ) : (
        /* ── Modo Expandido (Al tope del documento) ────────────────────────── */
        <div className="w-full session-dock-glass rounded-2xl px-4 py-3.5 flex flex-col gap-2.5 transition-all duration-200">
          {/* 1. Título + Contador (Break                    3/5) */}
          <div className="flex items-baseline justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`h-2 w-2 rounded-full shrink-0 ${
                isPaused ? 'bg-warning' : isExpired ? 'bg-danger animate-pulse' : is5MinWarning ? 'bg-warning animate-pulse' : 'bg-accent'
              }`} />
              <h2 className="text-sm sm:text-base font-semibold text-foreground leading-snug break-words">
                {activePoint?.title || activeBlock?.title || 'Sesión en vivo'}
              </h2>
            </div>

            <span className="text-xs font-mono text-muted shrink-0 tabular-nums">
              {details.activeBlockIndex >= 0 ? `${details.activeBlockIndex + 1}/${details.totalBlocksCount}` : ''}
            </span>
          </div>

          {/* 2. Métricas de tiempo y estado en una línea limpia */}
          <div className="flex items-center justify-between text-xs pl-4 flex-wrap gap-x-2">
            <div className="flex items-center gap-1.5 font-medium">
              {isPaused ? (
                <span className="text-warning">{formatMsToClock(details.remainingBlockMs)} · pausado</span>
              ) : isExpired ? (
                <span className="text-danger">+{formatMsToClock(details.overtimeMs)} sobre el tiempo</span>
              ) : isUnlimited ? (
                <span className="text-accent">+{formatMsToClock(details.elapsedBlockMs)} (sin límite)</span>
              ) : (
                <span className={is5MinWarning ? 'text-warning font-semibold' : 'text-foreground'}>
                  {formatMsToClock(details.remainingBlockMs)} restantes
                  {isExtended ? ` (+${details.extensionMinutes}m)` : ''}
                </span>
              )}
              {details.totalPoints > 0 && (
                <>
                  <span className="text-muted/40">·</span>
                  <span className="text-muted font-normal">
                    {details.completedPoints} de {details.totalPoints} puntos
                  </span>
                </>
              )}
            </div>
            <span className="text-muted font-normal text-xs">Fin ~{details.estimatedEndTime}</span>
          </div>

          {/* 3. Barra de acciones principal */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 pl-4 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 1. Grabar / Estado de Grabación (Primero, rojo con texto blanco) */}
              {isRecording ? (
                <div className="flex items-center gap-1.5 bg-danger text-white rounded-lg px-2.5 py-1 text-xs shadow-xs font-medium">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  <span>Grabando</span>
                  <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
                  <button
                    type="button"
                    className="ml-1 text-white/90 hover:text-white underline font-medium cursor-pointer"
                    onClick={onPauseRecording}
                  >
                    Pausar
                  </button>
                  <button
                    type="button"
                    className="ml-1 text-white/90 hover:text-white underline font-medium cursor-pointer"
                    onClick={onFinalizeRecording}
                  >
                    Fin
                  </button>
                </div>
              ) : isRecPaused ? (
                <div className="flex items-center gap-1.5 bg-warning text-white rounded-lg px-2.5 py-1 text-xs shadow-xs font-medium">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  <span>Pausada</span>
                  <span className="tabular-nums font-mono">{formatMsToClock(recordingElapsedMs)}</span>
                  <button
                    type="button"
                    className="ml-1 text-white/90 hover:text-white underline font-medium cursor-pointer"
                    onClick={onResumeRecording}
                  >
                    Reanudar
                  </button>
                  <button
                    type="button"
                    className="ml-1 text-white/90 hover:text-white underline font-medium cursor-pointer"
                    onClick={onFinalizeRecording}
                  >
                    Fin
                  </button>
                </div>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onPress={onStartRecording}
                  isDisabled={isBusy}
                  className="h-8 px-3 text-xs bg-danger text-white hover:bg-danger/90 font-medium shadow-xs"
                >
                  <Microphone width={13} height={13} className="text-white" />
                  <span>Grabar</span>
                </Button>
              )}

              {/* 2. Pausar / Reanudar sesión */}
              <Button
                variant="ghost"
                size="sm"
                onPress={isPaused ? onResumeSession : onPauseSession}
                isDisabled={isBusy}
                className="h-8 px-2 text-xs text-muted hover:text-foreground font-normal"
              >
                {isPaused ? <Play width={13} height={13} /> : <Pause width={13} height={13} />}
                <span>{isPaused ? 'Reanudar' : 'Pausar'}</span>
              </Button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {renderAdvanceButton('primary', 'sm')}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
