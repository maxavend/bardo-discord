import {
  Button,
  ProgressBar,
  Dropdown,
  Label,
  Description,
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
  recordingContext,
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
  onDismissRecordingPrompt,
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
  const showInitialPrompt = details.showInitialRecordingPrompt && !isRecording && !isRecPaused && !isBusy;
  const activeRecordingName = recordingContext?.recordingName || activePoint?.title || activeBlock?.title || 'Grabación';
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
      <div className="w-full bg-surface/95 backdrop-blur-md border border-border/70 rounded-xl shadow-xs px-3.5 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-muted min-w-0">
            <span className={`h-2 w-2 rounded-full shrink-0 ${
              isPaused ? 'bg-warning' : isExpired ? 'bg-danger' : is5MinWarning ? 'bg-warning' : 'bg-accent'
            }`} />
            <span className="font-medium text-foreground truncate">{activeBlock?.title || 'Sesión en vivo'}</span>
            <span className="text-muted/50">·</span>
            <span className="shrink-0">{details.blockProgressLabel}</span>
          </div>

          <div className="pl-4 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-semibold text-foreground leading-snug break-words">
                {activePoint?.title || activeBlock?.title || 'Sesión en vivo'}
              </h2>
              {details.pointProgressLabel && (
                <span className="text-xs text-muted shrink-0">{details.pointProgressLabel}</span>
              )}
            </div>
            {activeDescription && (
              <p className="text-xs text-muted leading-relaxed mt-0.5 line-clamp-2">
                {activeDescription}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 pl-4">
          <div className="flex items-center justify-between gap-x-3 gap-y-1 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 text-muted">
              {isPaused ? (
                <span className="text-warning font-medium">{formatMsToClock(details.remainingBlockMs)} restantes · Pausada</span>
              ) : isExpired ? (
                <span className="text-danger font-medium">Tiempo cumplido · +{formatMsToClock(details.overtimeMs)}</span>
              ) : isUnlimited ? (
                <span className="text-accent font-medium">Sin límite · {formatMsToClock(details.elapsedBlockMs)} transcurridos</span>
              ) : (
                <span className={is5MinWarning ? 'text-warning font-medium' : 'text-foreground'}>
                  {formatMsToClock(details.remainingBlockMs)} restantes del bloque
                  {isExtended ? ` · +${details.extensionMinutes} min` : ''}
                </span>
              )}
              {details.totalPoints > 0 && (
                <>
                  <span className="text-muted/40">·</span>
                  <span>{details.completedPoints} de {details.totalPoints} tratados</span>
                </>
              )}
            </div>
            <span className="text-muted shrink-0">{details.estimatedEndDisplay}</span>
          </div>

          <ProgressBar
            aria-label="Tiempo consumido del bloque activo"
            value={details.blockProgressPercent}
            color={isExpired ? 'danger' : is5MinWarning ? 'warning' : 'accent'}
            size="xs"
            className="w-full"
          >
            <ProgressBar.Track className="h-1 bg-surface-secondary/70 rounded-full overflow-hidden">
              <ProgressBar.Fill className="h-1 rounded-full" />
            </ProgressBar.Track>
          </ProgressBar>
        </div>

        {showInitialPrompt && (
          <div className="flex items-center justify-between gap-2 pl-4 text-xs">
            <div className="flex items-center gap-1.5 text-foreground/80 min-w-0">
              <Microphone width={13} height={13} className="text-muted shrink-0" />
              <span className="truncate">{activePoint ? '¿Grabar este punto?' : '¿Grabar este bloque?'}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onPress={onStartRecording} className="h-7 px-2 text-xs">
                Grabar
              </Button>
              <Button variant="ghost" size="sm" onPress={onDismissRecordingPrompt} className="h-7 px-2 text-xs text-muted">
                Ahora no
              </Button>
            </div>
          </div>
        )}

        {(isRecording || isRecPaused) && (
          <div className="flex items-center justify-between gap-2 pl-4 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`h-2 w-2 rounded-full shrink-0 ${isRecording ? 'bg-danger' : 'bg-warning'}`} />
              <span className="font-medium text-foreground">{isRecording ? 'Grabando' : 'Grabación pausada'}</span>
              <span className="text-muted truncate max-w-[180px] sm:max-w-[280px]">· {activeRecordingName}</span>
              <span className="text-muted tabular-nums shrink-0">· {formatMsToClock(recordingElapsedMs)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onPress={isRecording ? onPauseRecording : onResumeRecording}
                isDisabled={isBusy}
                className="h-7 px-2 text-xs text-muted"
              >
                {isRecording ? 'Pausar grabación' : 'Continuar grabación'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onPress={onFinalizeRecording}
                isDisabled={isBusy}
                className="h-7 px-2 text-xs text-muted"
              >
                Finalizar
              </Button>
            </div>
          </div>
        )}

        {isExpired && !isUnlimited ? (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 flex-wrap pl-4">
            <span className="text-xs text-foreground font-medium">
              {activePoint ? `Punto actual: ${activePoint.title}` : 'El bloque agotó su tiempo'}
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
                  <Button variant="ghost" size="sm" isIconOnly isDisabled={isBusy} aria-label="Más opciones" className="h-8 w-8 text-muted">
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
        ) : isPaused ? (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 flex-wrap pl-4">
            <span className="text-xs text-muted">Tiempo del bloque pausado</span>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <Button variant="primary" size="sm" onPress={onResumeSession} isDisabled={isBusy} className="h-8 px-3.5 text-xs font-medium">
                <Play width={12} height={12} /> Reanudar sesión
              </Button>
              {renderAdvanceButton('ghost')}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 pl-4">
            <div className="flex items-center gap-1 min-w-0">
              <Button variant="ghost" size="sm" onPress={onOpenDecisionCapture} isDisabled={isBusy} className="h-8 px-2 text-xs text-muted">
                <Plus width={12} height={12} /> Decisión
              </Button>
              {!isRecording && !isRecPaused && !showInitialPrompt && (
                <Button variant="ghost" size="sm" onPress={onStartRecording} isDisabled={isBusy} className="h-8 px-2 text-xs text-muted">
                  <Microphone width={12} height={12} /> Grabar
                </Button>
              )}
              <Button variant="ghost" size="sm" onPress={onPauseSession} isDisabled={isBusy} className="h-8 px-2 text-xs text-muted">
                <Pause width={12} height={12} /> Pausar
              </Button>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-auto">
              <Dropdown>
                <Dropdown.Trigger>
                  <Button variant="ghost" size="sm" isIconOnly isDisabled={isBusy} aria-label="Más opciones" className="h-8 w-8 text-muted">
                    <EllipsisVertical width={13} height={13} />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover>
                  <Dropdown.Menu onAction={(key) => {
                    if (key === 'skip') handleSecondarySkip();
                    if (key === 'unlimited') onSetUnlimited(sessionState.liveActiveBlockId);
                    if (key === 'interrupt') onInterruptSession?.();
                  }}>
                    <Dropdown.Item id="unlimited" textValue="Seguir sin límite">
                      <ArrowsRotateLeft />
                      <Label>Seguir sin límite</Label>
                      <Description>Desactivar alertas de tiempo del bloque</Description>
                    </Dropdown.Item>
                    <Dropdown.Item id="skip" textValue={activePoint ? 'Saltar punto' : 'Saltar bloque'}>
                      <ForwardStep />
                      <Label>{activePoint ? 'Saltar punto' : 'Saltar bloque'}</Label>
                      <Description>{activePoint ? 'Continuar sin marcarlo tratado' : 'Continuar con el siguiente bloque'}</Description>
                    </Dropdown.Item>
                    <Dropdown.Item id="interrupt" variant="danger" textValue="Interrumpir sesión">
                      <CircleExclamation />
                      <Label>Interrumpir sesión</Label>
                      <Description>Conservar progreso y artefactos</Description>
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
