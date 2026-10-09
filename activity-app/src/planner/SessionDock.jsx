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
import { IconButton } from '@/components/ui/icon-button.jsx';
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
      : 'bg-primary/15 text-foreground';

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
      {/* Phones: grid of 3 aligned rows — [estado … ⋮] / [Pausar | Grabar] / [acción principal].
          sm+: one row — estado … Grabar · Pausar · principal · ⋮. Same edges, same heights. */}
      <div className="w-full max-w-4xl mx-auto rounded-3xl sm:rounded-full bg-card/95 border border-border/80 shadow-xs backdrop-blur-md p-2.5 sm:p-1.5 sm:pl-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-center sm:gap-2 transition-all duration-150">
        {/* Tiempo del bloque + tema/bloque activo */}
        <div className="col-start-1 row-start-1 flex items-center gap-2.5 min-w-0 sm:flex-1 sm:order-1">
          <span
            className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-mono font-semibold tabular-nums shrink-0 ${clockClass}`}
            aria-label={leftOpen ? 'Reunión abierta hace días' : clock.mode === 'overtime' ? `Tiempo excedido ${clock.label}` : clock.label}
            title={isPaused ? 'Reunión en pausa: el tiempo está detenido' : clock.mode === 'overtime' ? 'Tiempo del bloque excedido' : 'Tiempo restante del bloque'}
          >
            {isPaused && <Pause className="size-2.5 fill-current" />}
            {leftOpen ? 'Abierta' : clock.label}
          </span>

          <span className="font-semibold text-sm text-foreground truncate">
            {isPaused ? 'En pausa · ' : ''}
            {activePoint?.title || activeBlock?.title || 'Reunión en curso'}
          </span>
        </div>

        {/* Grabación + pausa: dos mitades iguales en móvil, grupo compacto en escritorio */}
        <div className="col-span-2 row-start-2 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:order-2">
          {isRecording || isRecPaused ? (
            <div
              className="h-9 sm:h-8 flex items-center justify-between gap-1.5 pl-3 pr-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive min-w-0"
              title={recordingLabel ? `Grabando: ${recordingLabel}` : undefined}
            >
              <div className="flex items-center gap-1.5 min-w-0 select-none">
                <MaterialMorphShape size={11} color="danger" isPaused={isRecPaused} className="shrink-0" />
                <span className="sr-only">{isRecPaused ? 'Grabación en pausa' : 'Grabando'}</span>
                <span className="tabular-nums font-mono text-xs font-semibold">
                  {formatMsToClock(recordingElapsedMs)}
                </span>
              </div>
              <div className="flex items-center shrink-0">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={isRecording ? onPauseRecording : onResumeRecording}
                  disabled={isBusy}
                  aria-label={isRecording ? 'Pausar grabación' : 'Reanudar grabación'}
                  title={isRecording ? 'Pausar grabación' : 'Reanudar grabación'}
                  className="size-7 rounded-full hover:bg-destructive/20 text-destructive cursor-pointer"
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
                  className="size-7 rounded-full hover:bg-destructive/20 text-destructive cursor-pointer"
                >
                  <Square className="size-2.5 fill-current" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={onStartRecording}
              disabled={isBusy || !activeBlock}
              title="Grabar el audio de este tema"
              className="h-9 sm:h-8 rounded-full gap-1.5 px-3 text-xs font-medium"
            >
              <MicIcon className="size-3.5 text-destructive shrink-0" />
              <span>Grabar</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={isPaused ? onResumeSession : onPauseSession}
            disabled={isBusy}
            aria-label={isPaused ? 'Reanudar reunión' : 'Pausar reunión'}
            title={isPaused ? 'Reanudar reunión' : 'Pausar reunión'}
            className="h-9 sm:h-8 rounded-full gap-1.5 px-3 text-xs font-medium text-foreground"
          >
            {isPaused ? <Play className="size-3 fill-current ml-0.5" /> : <Pause className="size-3 fill-current" />}
            <span>{isPaused ? 'Reanudar' : 'Pausar'}</span>
          </Button>
        </div>

        {/* Acción principal adaptable: Siguiente tema / Siguiente bloque / Terminar reunión.
            Left open for days: the notice below carries "Terminar reunión". */}
        {!isPaused && !leftOpen && (
          <Button
            variant="default"
            size="sm"
            onClick={onPrimaryAction}
            disabled={isBusy}
            className="col-span-2 row-start-3 sm:order-3 h-10 sm:h-8 min-w-0 rounded-full gap-1.5 px-4 text-sm sm:text-xs font-semibold"
          >
            {primary.key === 'finish' ? <Flag className="size-3.5 shrink-0" /> : null}
            <span className="truncate">{primary.label}</span>
            {primary.key !== 'finish' ? <ChevronRight className="size-3.5 shrink-0" /> : null}
          </Button>
        )}

        {/* Más acciones: arriba a la derecha en móvil, al final en escritorio */}
        <div className="col-start-2 row-start-1 flex justify-end sm:order-4">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Más acciones de la reunión"
                  title="Más acciones de la reunión"
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="size-4" />
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
        // A hint, not a second "Grabar": the dock right above already has the button.
        <div role="note" className="w-full max-w-4xl mx-auto mt-2 flex items-start gap-2 rounded-2xl border border-border/70 bg-card/95 backdrop-blur-md pl-3 pr-1.5 py-1.5 text-xs shadow-2xs animate-in fade-in duration-200">
          <MicIcon className="size-3.5 text-destructive shrink-0 mt-1.5" />
          <p className="flex-1 min-w-0 py-1 text-muted-foreground leading-relaxed">
            Toca <strong className="font-semibold text-foreground">Grabar</strong> para registrar el audio. La grabación sigue sola al pasar al siguiente tema.
          </p>
          <IconButton label="Ahora no" size="icon-sm" onClick={onDismissRecordingPrompt} className="shrink-0">
            <X className="size-3.5" />
          </IconButton>
        </div>
      )}
    </aside>
  );
}
