import {
  Button,
  Dropdown,
  Label,
} from '@heroui/react';
import {
  Microphone,
  Pause,
  Play,
  ArrowRight,
  Plus,
  EllipsisVertical,
  ForwardStep,
  ArrowsRotateLeft,
  CircleCheck,
  CircleExclamation,
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
  onSkipPoint,
  onSkipBlock,
  onExtendBlock,
  onSetUnlimited,
  onStartRecording,
  onFinalizeRecording,
  onPauseRecording,
  onResumeRecording,
  onDismissRecordingPrompt: _onDismissRecordingPrompt,
  onOpenDecisionCapture,
  onInterruptSession,
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
  const isExtended = details.isExtended;
  const activeDescription = details.activePointDescription || details.activeBlockDescription || '';
  const advanceLabel = details.nextAction.label;

  const handleSecondarySkip = () => {
    if (activePoint) onSkipPoint?.();
    else onSkipBlock?.();
  };

  const renderAdvanceButton = (variant = 'primary') => (
    <Button
      variant={variant}
      size="sm"
      onPress={onAdvance}
      isDisabled={isBusy}
      className="font-medium text-xs h-8 px-3.5"
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
      <div className="w-full bg-surface/95 backdrop-blur-md border border-border/70 rounded-xl shadow-xs px-3.5 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-2.5">
        {/* 1. Title + Block Index (Check-in, contexto y novedades              1/5) */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
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

          {activeDescription && (
            <p className="text-xs text-muted leading-relaxed pl-4 line-clamp-2">
              {activeDescription}
            </p>
          )}
        </div>

        {/* 2. Block Timer (04:47 restantes) */}
        <div className="flex items-center gap-2 pl-4 text-xs">
          {isPaused ? (
            <span className="text-warning font-medium">{formatMsToClock(details.remainingBlockMs)} restantes · Pausada</span>
          ) : isExpired ? (
            <span className="text-danger font-medium">Tiempo cumplido (+{formatMsToClock(details.overtimeMs)})</span>
          ) : isUnlimited ? (
            <span className="text-accent font-medium">Sin límite (+{formatMsToClock(details.elapsedBlockMs)})</span>
          ) : (
            <span className={is5MinWarning ? 'text-warning font-medium' : 'text-foreground font-medium'}>
              {formatMsToClock(details.remainingBlockMs)} restantes
              {isExtended ? ` (+${details.extensionMinutes}m)` : ''}
            </span>
          )}
        </div>

        {/* 3. Segmented Timeline Progress Bar (━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━) */}
        <div className="pl-4">
          <div
            className="flex items-center gap-1.5 w-full h-1"
            role="progressbar"
            aria-label="Progreso temporal de la sesión por bloques"
            aria-valuenow={details.sessionProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {(plannerState.blocks || []).map((b, idx) => {
              const isCompleted = (sessionState?.completedBlockIds || []).includes(b.id);
              const isCurrent = b.id === sessionState?.liveActiveBlockId;
              const isSkipped = (sessionState?.skippedBlockIds || []).includes(b.id);
              const blockDuration = Math.max(Number(b.durationMinutes) || 10, 1);

              let fillWidthPercent = 0;
              let fillColor = 'bg-accent';

              if (isCompleted) {
                fillWidthPercent = 100;
                fillColor = 'bg-accent/80';
              } else if (isCurrent) {
                const extMin = sessionState?.blockExtensions?.[b.id]?.extensionMinutes || 0;
                const plannedMs = Math.max((blockDuration + extMin) * 60 * 1000, 1);
                fillWidthPercent = details.isUnlimited
                  ? 100
                  : Math.min(100, Math.max(0, (details.elapsedBlockMs / plannedMs) * 100));
                fillColor = isExpired ? 'bg-danger' : is5MinWarning ? 'bg-warning' : 'bg-accent';
              } else if (isSkipped) {
                fillWidthPercent = 0;
              }

              return (
                <div
                  key={b.id || idx}
                  className="relative h-1 bg-surface-secondary/70 rounded-full overflow-hidden transition-all"
                  style={{flex: blockDuration}}
                  title={`${b.title} (${blockDuration} min)`}
                >
                  <div
                    className={`h-full ${fillColor} rounded-full transition-all duration-300 ease-out`}
                    style={{width: `${fillWidthPercent}%`}}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Session Meta (0/11 puntos · Fin ~20:45) */}
        <div className="flex items-center justify-between text-xs text-muted pl-4">
          <span>
            {details.completedPoints} de {details.totalPoints} puntos
            {details.estimatedEndTime ? ` · Fin ~${details.estimatedEndTime}` : ''}
          </span>
        </div>

        {/* 5. Minimal Action Row (⏸ Pausar ◉ Grabar + Decisión ⋮ Siguiente →) */}
        {isExpired && !isUnlimited ? (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 flex-wrap pl-4">
            <span className="text-xs text-foreground font-medium">
              {activePoint ? `Punto actual: ${activePoint.title}` : '¿Seguimos con este bloque?'}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <Button variant="ghost" size="sm" isDisabled={isBusy} onPress={() => onExtendBlock(sessionState.liveActiveBlockId, 5)} className="h-8 text-xs px-2.5">
                +5 min
              </Button>
              <Button variant="ghost" size="sm" isDisabled={isBusy} onPress={() => onExtendBlock(sessionState.liveActiveBlockId, 10)} className="h-8 text-xs px-2.5">
                +10 min
              </Button>
              <Button variant="ghost" size="sm" isDisabled={isBusy} onPress={() => onSetUnlimited(sessionState.liveActiveBlockId)} className="h-8 text-xs px-2.5 hidden sm:inline-flex">
                Sin límite
              </Button>

              <Dropdown>
                <Dropdown.Trigger>
                  <Button variant="ghost" size="sm" isIconOnly isDisabled={isBusy} aria-label="Más opciones" className="h-8 w-8 text-muted hover:text-foreground">
                    <EllipsisVertical width={13} height={13} />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover>
                  <Dropdown.Menu onAction={(key) => {
                    if (key === 'unlimited') onSetUnlimited(sessionState.liveActiveBlockId);
                    if (key === 'decision') onOpenDecisionCapture();
                    if (key === 'skip') handleSecondarySkip();
                    if (key === 'interrupt') onInterruptSession?.();
                  }}>
                    <Dropdown.Item id="unlimited" textValue="Seguir sin límite">
                      <ArrowsRotateLeft />
                      <Label>Seguir sin límite</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="decision" textValue="Registrar decisión">
                      <CircleCheck />
                      <Label>Registrar decisión</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="skip" textValue={activePoint ? 'Saltar punto' : 'Saltar bloque'}>
                      <ForwardStep />
                      <Label>{activePoint ? 'Saltar punto' : 'Saltar bloque'}</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="interrupt" variant="danger" textValue="Interrumpir sesión">
                      <CircleExclamation />
                      <Label>Interrumpir sesión</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
              {renderAdvanceButton()}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 pl-4 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {/* Pausar / Reanudar */}
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

              {/* Grabar / Estado de Grabación */}
              {isRecording ? (
                <div className="flex items-center gap-1.5 bg-danger/10 text-danger border border-danger/20 rounded-lg px-2.5 py-1 text-xs">
                  <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
                  <span className="font-medium">Grabando</span>
                  <span className="tabular-nums font-mono">({formatMsToClock(recordingElapsedMs)})</span>
                  <button
                    type="button"
                    className="ml-1 text-danger hover:text-danger/80 underline font-medium cursor-pointer"
                    onClick={onPauseRecording}
                  >
                    Pausar
                  </button>
                  <button
                    type="button"
                    className="ml-1 text-danger hover:text-danger/80 underline font-medium cursor-pointer"
                    onClick={onFinalizeRecording}
                  >
                    Fin
                  </button>
                </div>
              ) : isRecPaused ? (
                <div className="flex items-center gap-1.5 bg-warning/10 text-warning border border-warning/20 rounded-lg px-2.5 py-1 text-xs">
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  <span className="font-medium">Pausada</span>
                  <span className="tabular-nums font-mono">({formatMsToClock(recordingElapsedMs)})</span>
                  <button
                    type="button"
                    className="ml-1 text-warning hover:text-warning/80 underline font-medium cursor-pointer"
                    onClick={onResumeRecording}
                  >
                    Reanudar
                  </button>
                  <button
                    type="button"
                    className="ml-1 text-warning hover:text-warning/80 underline font-medium cursor-pointer"
                    onClick={onFinalizeRecording}
                  >
                    Fin
                  </button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={onStartRecording}
                  isDisabled={isBusy}
                  className="h-8 px-2 text-xs text-muted hover:text-foreground font-normal"
                >
                  <Microphone width={13} height={13} className="text-danger" />
                  <span>Grabar</span>
                </Button>
              )}

              {/* Decisión */}
              <Button
                variant="ghost"
                size="sm"
                onPress={onOpenDecisionCapture}
                isDisabled={isBusy}
                className="h-8 px-2 text-xs text-muted hover:text-foreground font-normal"
              >
                <Plus width={13} height={13} />
                <span>Decisión</span>
              </Button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <Dropdown>
                <Dropdown.Trigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    isDisabled={isBusy}
                    aria-label="Más opciones"
                    className="h-8 w-8 text-muted hover:text-foreground"
                  >
                    <EllipsisVertical width={13} height={13} />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover>
                  <Dropdown.Menu onAction={(key) => {
                    if (key === 'unlimited') onSetUnlimited(sessionState.liveActiveBlockId);
                    if (key === 'skip') handleSecondarySkip();
                    if (key === 'interrupt') onInterruptSession?.();
                  }}>
                    <Dropdown.Item id="unlimited" textValue="Seguir sin límite">
                      <ArrowsRotateLeft />
                      <Label>Seguir sin límite</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="skip" textValue={activePoint ? 'Saltar punto' : 'Saltar bloque'}>
                      <ForwardStep />
                      <Label>{activePoint ? 'Saltar punto' : 'Saltar bloque'}</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="interrupt" variant="danger" textValue="Interrumpir sesión">
                      <CircleExclamation />
                      <Label>Interrumpir sesión</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>

              {renderAdvanceButton()}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
