import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Play,
  Pause,
  Square,
  MoreVertical,
  ChevronRight,
  SkipForward,
  FastForward,
  Timer,
  Infinity as InfinityIcon,
  Handshake,
  Flag,
  X,
} from 'lucide-react';
import { MicIcon } from '@/components/ui/animated-icons';
import { SESSION_STATUS, getElapsedSessionMs } from './session-runner.js';
import { getPlannedSchedule, wasMeetingLeftOpen } from './time-engine.js';
import { formatMsToClock, getAssistantContextDetails, getLiveBlockClock } from './session-assistant-engine.js';
import { RECORDING_STATUS } from './recording-controller.js';
import { MaterialMorphShape } from './MaterialMorphShape.jsx';

/**
 * Live meeting dock. Every live state (running, paused, with or without an
 * active bloque) always offers a way forward and a way to end the meeting.
 */
export function SessionDock({
  plannerState,
  sessionState,
  recordingStatus,
  recordingElapsedMs,
  recordingContext,
  isTransitioning = false,
  onPauseSession,
  onResumeSession,
  onPrimaryAction,
  onSkipPoint,
  onSkipBlock,
  onExtendBlock,
  onSetUnlimited,
  onStartRecording,
  onFinalizeRecording,
  onPauseRecording,
  onResumeRecording,
  onDismissRecordingPrompt,
  onOpenDecisionCapture,
  onRequestFinish,
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

  const details = getAssistantContextDetails(plannerState, sessionState, now);
  const clock = getLiveBlockClock(plannerState, sessionState, now);
  // A meeting nobody ended (e.g. before "Terminar reunión" existed) shows up
  // "En curso" for days: say so plainly and offer to end it.
  const leftOpen = wasMeetingLeftOpen(
    Math.round(getElapsedSessionMs(sessionState, now) / 60000),
    getPlannedSchedule(plannerState || {}).plannedMinutes,
  );
  const openSince = leftOpen && sessionState.sessionStartedAt
    ? new Intl.DateTimeFormat('es-CL', {day: 'numeric', month: 'short'}).format(new Date(sessionState.sessionStartedAt)).replace(/\./g, '')
    : null;
  const activeBlock = details.activeBlock;
  const activePoint = details.activePoint;
  const primary = details.nextAction;
  const isRecording = recordingStatus === RECORDING_STATUS.RECORDING;
  const isRecPaused = recordingStatus === RECORDING_STATUS.PAUSED;
  const isRecSaving = recordingStatus === RECORDING_STATUS.FINALIZING;
  const isBusy = isTransitioning || isRecSaving;
  const isPaused = details.isPaused;
  const isUnlimited = clock.mode === 'unlimited';
  const recordingLabel = recordingContext?.recordingName;

  const clockClass = leftOpen
    ? 'bg-muted text-muted-foreground'
    : clock.mode === 'overtime'
    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
    : clock.isWarning
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'bg-primary/15 text-primary';

  return (
    <aside
      role="region"
      aria-label="Controles de la reunión en curso"
      className="session-toolbar-sticky w-full mb-3 animate-in fade-in slide-in-from-top-2 duration-250"
      style={{
        position: 'sticky',
        top: 'calc(var(--bardo-visual-viewport-top, 0px) + var(--bardo-safe-top, 0px) + var(--bardo-topbar, 52px) + var(--bardo-toolbar-gap, 12px))',
        zIndex: 45,
      }}
    >
      <div className="w-full max-w-4xl mx-auto rounded-3xl sm:rounded-full bg-card/95 border border-border/80 shadow-xs backdrop-blur-md p-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 transition-all duration-150">
        {/* Tiempo del bloque + tema/bloque activo */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-1">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold tabular-nums shrink-0 ${clockClass}`}
            aria-label={leftOpen ? 'Reunión abierta hace días' : clock.mode === 'overtime' ? `Tiempo excedido ${clock.label}` : clock.label}
            title={isPaused ? 'Reunión en pausa: el tiempo está detenido' : clock.mode === 'overtime' ? 'Tiempo del bloque excedido' : 'Tiempo restante del bloque'}
          >
            {isPaused && <Pause className="size-2.5 fill-current" />}
            {leftOpen ? 'Abierta' : clock.label}
          </span>

          <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
            {isPaused ? 'En pausa · ' : ''}
            {activePoint?.title || activeBlock?.title || 'Reunión en curso'}
          </span>
        </div>

        {/* Phones (<640px): controls row (grabación · pausa · ⋮) and the primary
            action on its own full-width row, so "⋮" (Terminar reunión) is never
            pushed off-screen at 320–390px, recording or not. */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5 sm:gap-2 min-w-0 w-full sm:w-auto ml-auto">
          {/* Grabación */}
          {isRecording || isRecPaused ? (
            <div
              className="flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive shadow-2xs"
              title={recordingLabel ? `Grabando: ${recordingLabel}` : undefined}
            >
              <div className="flex items-center gap-1.5 select-none">
                <MaterialMorphShape size={11} color="danger" isPaused={isRecPaused} className="shrink-0" />
                <span className="text-xs font-semibold hidden min-[420px]:inline">{isRecPaused ? 'Grabación en pausa' : 'Grabando'}</span>
                <span className="sr-only min-[420px]:hidden">{isRecPaused ? 'Grabación en pausa' : 'Grabando'}</span>
              </div>
              <span className="tabular-nums font-mono text-[11px] font-medium text-destructive/80 px-1">
                {formatMsToClock(recordingElapsedMs)}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={isRecording ? onPauseRecording : onResumeRecording}
                disabled={isBusy}
                aria-label={isRecording ? 'Pausar grabación' : 'Reanudar grabación'}
                title={isRecording ? 'Pausar grabación' : 'Reanudar grabación'}
                className="size-6 rounded-full hover:bg-destructive/20 text-destructive cursor-pointer"
              >
                {isRecording ? <Pause className="size-3 fill-current" /> : <Play className="size-3 fill-current ml-0.5" />}
              </Button>
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
              disabled={isBusy || !activeBlock}
              aria-label="Grabar audio"
              title="Grabar el audio de este tema"
              className="h-7 rounded-full gap-1.5 px-3 text-xs font-medium cursor-pointer shadow-2xs transition-all"
            >
              <MicIcon className="size-3.5 text-destructive shrink-0" />
              <span className="hidden min-[380px]:inline">Grabar</span>
            </Button>
          )}

          {/* Pausar / Reanudar reunión */}
          <Button
            variant="secondary"
            size="xs"
            onClick={isPaused ? onResumeSession : onPauseSession}
            disabled={isBusy}
            aria-label={isPaused ? 'Reanudar reunión' : 'Pausar reunión'}
            title={isPaused ? 'Reanudar reunión' : 'Pausar reunión'}
            className="h-7 rounded-full gap-1.5 px-2.5 sm:px-3 text-xs font-medium cursor-pointer shadow-2xs transition-all text-foreground"
          >
            {isPaused ? <Play className="size-3 fill-current ml-0.5 text-primary" /> : <Pause className="size-3 fill-current text-primary" />}
            <span className={isPaused ? '' : 'hidden sm:inline'}>{isPaused ? 'Reanudar' : 'Pausar'}</span>
          </Button>

          {/* Acción principal adaptable: Siguiente tema / Siguiente bloque / Terminar reunión */}
          {/* Left open for days: the notice below carries "Terminar reunión". */}
          {!isPaused && !leftOpen && (
            <Button
              variant="default"
              size="xs"
              onClick={onPrimaryAction}
              disabled={isBusy}
              className="order-last sm:order-none w-full sm:w-auto h-8 sm:h-7 min-w-0 shrink rounded-full gap-1 px-3 text-xs font-semibold cursor-pointer shadow-2xs"
            >
              {primary.key === 'finish' ? <Flag className="size-3 shrink-0" /> : null}
              <span className="truncate">{primary.label}</span>
              {primary.key !== 'finish' ? <ChevronRight className="size-3" /> : null}
            </Button>
          )}

          {/* Más acciones */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Más acciones de la reunión"
                  title="Más acciones de la reunión"
                  className="size-7 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <MoreVertical className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={isBusy || !activePoint} onClick={() => onSkipPoint?.()}>
                  <SkipForward className="size-4 text-muted-foreground" />
                  <span>Saltar tema</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isBusy || !activeBlock} onClick={() => onSkipBlock?.()}>
                  <FastForward className="size-4 text-muted-foreground" />
                  <span>Saltar bloque</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!activeBlock} onClick={() => activeBlock && onExtendBlock?.(activeBlock.id, 5)}>
                  <Timer className="size-4 text-muted-foreground" />
                  <span>+5 min al bloque</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!activeBlock || isUnlimited} onClick={() => activeBlock && onSetUnlimited?.(activeBlock.id)}>
                  <InfinityIcon className="size-4 text-muted-foreground" />
                  <span>Sin límite de tiempo</span>
                </DropdownMenuItem>
                {onOpenDecisionCapture && (
                  <DropdownMenuItem onClick={() => onOpenDecisionCapture()}>
                    <Handshake className="size-4 text-muted-foreground" />
                    <span>Anotar acuerdo</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={isBusy} onClick={() => onRequestFinish?.()}>
                <Flag className="size-4" />
                <span>Terminar reunión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {leftOpen && (
        <div role="status" className="w-full max-w-4xl mx-auto mt-2 flex items-center justify-between gap-2 rounded-2xl border border-warning/30 bg-card/95 backdrop-blur-md px-3 py-2 text-xs shadow-2xs">
          <span className="text-foreground min-w-0">
            Esta reunión sigue abierta{openSince ? ` desde el ${openSince}` : ''}. Si ya terminó, ciérrala para guardar su resumen.
          </span>
          <Button variant="default" size="xs" onClick={() => onRequestFinish?.()} disabled={isBusy} className="h-7 rounded-full px-3 text-xs shrink-0">
            Terminar reunión
          </Button>
        </div>
      )}

      {!leftOpen && details.showInitialRecordingPrompt && !isRecording && !isRecPaused && (
        <div className="w-full max-w-4xl mx-auto mt-2 flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card/95 backdrop-blur-md px-3 py-2 text-xs shadow-2xs animate-in fade-in duration-200">
          <span className="text-muted-foreground min-w-0">
            ¿Quieres grabar el audio? Si grabas, la grabación sigue sola al pasar al siguiente tema.
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Invitation, not the main action: "Terminar/Siguiente" stays the only primary. */}
            <Button variant="secondary" size="xs" onClick={onStartRecording} disabled={isBusy} className="h-7 rounded-full px-3 text-xs gap-1.5">
              <MicIcon className="size-3.5" /> Grabar
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onDismissRecordingPrompt}
              aria-label="Ahora no"
              title="Ahora no"
              className="size-7 rounded-full text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
