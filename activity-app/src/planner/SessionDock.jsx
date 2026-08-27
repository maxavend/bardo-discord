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
import {
  SESSION_STATUS,
} from './session-runner.js';
import {
  formatMsToClock,
  getAssistantContextDetails,
} from './session-assistant-engine.js';
import {RECORDING_STATUS} from './recording-controller.js';

export function SessionDock({
  plannerState,
  sessionState,
  recordingStatus,
  recordingElapsedMs,
  recordingContext,
  onPauseSession,
  onResumeSession,
  onNextBlock,
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
  onFinishSession,
}) {
  if (!sessionState || sessionState.status === SESSION_STATUS.IDLE || sessionState.status === SESSION_STATUS.COMPLETED || sessionState.status === SESSION_STATUS.INTERRUPTED) {
    return null;
  }

  const details = getAssistantContextDetails(plannerState, sessionState);
  const activeBlock = details.activeBlock;
  const subpoints = activeBlock?.subpoints || [];

  const isRecording = recordingStatus === RECORDING_STATUS.RECORDING;
  const isRecPaused = recordingStatus === RECORDING_STATUS.PAUSED;
  const isRecSaving = recordingStatus === RECORDING_STATUS.FINALIZING;

  const isPaused = details.isPaused;
  const isExpired = details.isExpired;
  const isUnlimited = details.isUnlimited;
  const is5MinWarning = details.is5MinWarning;
  const isExtended = details.isExtended;
  const isLastBlock = details.isLastBlock;

  const showInitialPrompt = details.showInitialRecordingPrompt && !isRecording && !isRecPaused && !isRecSaving;
  const activeRecordingName = recordingContext?.recordingName || activeBlock?.title || 'este punto';
  const activeDescription = details.activeBlockDescription || activeBlock?.introDesc || '';

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
      <div className="w-full bg-surface/95 backdrop-blur-md border border-border/70 rounded-xl shadow-xs px-3.5 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-2.5 transition-all duration-150">
        {/* 1. CONTEXT: Title + Description */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            {isPaused ? (
              <span className="h-2 w-2 rounded-full bg-warning shrink-0 translate-y-[-1px]" />
            ) : isExpired ? (
              <span className="h-2 w-2 rounded-full bg-danger animate-pulse shrink-0 translate-y-[-1px]" />
            ) : is5MinWarning ? (
              <span className="h-2 w-2 rounded-full bg-warning animate-pulse shrink-0 translate-y-[-1px]" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0 translate-y-[-1px]" />
            )}

            <h2 className="text-sm sm:text-base font-semibold text-foreground leading-snug break-words">
              {details.stateTitle}
            </h2>
          </div>

          {activeDescription && (
            <p className="text-xs text-muted leading-relaxed pl-4 break-words">
              {activeDescription}
            </p>
          )}
        </div>

        {/* 2. TEMPORAL METRICS & PROGRESS BAR */}
        <div className="flex flex-col gap-1.5 pl-4">
          <div className="flex items-center justify-between text-xs text-muted font-normal flex-wrap gap-x-2 gap-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground">{details.blockProgressLabel}</span>
              <span>·</span>
              {isPaused ? (
                <span className="text-warning font-medium">
                  {formatMsToClock(details.remainingBlockMs)} restantes · Pausada
                </span>
              ) : isExpired ? (
                <span className="text-danger font-medium">
                  Tiempo cumplido (+{formatMsToClock(details.overtimeMs)})
                </span>
              ) : isUnlimited ? (
                <span className="text-accent font-medium">
                  +{formatMsToClock(details.elapsedBlockMs)} (Sin límite)
                </span>
              ) : isExtended ? (
                <span>
                  {formatMsToClock(details.remainingBlockMs)} restantes (+{details.extensionMinutes}m)
                </span>
              ) : is5MinWarning ? (
                <span className="text-warning font-medium">
                  {formatMsToClock(details.remainingBlockMs)} restantes
                </span>
              ) : (
                <span>
                  {formatMsToClock(details.remainingBlockMs)} restantes
                </span>
              )}
              {details.totalPoints > 0 && (
                <>
                  <span>·</span>
                  <span>{details.completedPoints}/{details.totalPoints} puntos</span>
                </>
              )}
            </div>

            <div className="text-muted/80 text-xs font-normal shrink-0 ml-auto sm:ml-0">
              <span>{details.estimatedEndDisplay}</span>
            </div>
          </div>

          {/* Minimal, Integrated Session Time Progress Bar */}
          <ProgressBar
            aria-label="Progreso temporal de la sesión"
            value={details.sessionProgressPercent}
            color={isExpired ? 'danger' : is5MinWarning ? 'warning' : 'accent'}
            size="xs"
            className="w-full"
          >
            <ProgressBar.Track className="h-1 bg-surface-secondary/70 rounded-full overflow-hidden">
              <ProgressBar.Fill className="h-1 rounded-full" />
            </ProgressBar.Track>
          </ProgressBar>
        </div>

        {/* 3. RECORDING & INTERVENTION STATES (Calm, Typography-first) */}
        {showInitialPrompt && (
          <div className="flex items-center justify-between gap-2 pl-4 text-xs">
            <div className="flex items-center gap-1.5 text-foreground/80 font-normal min-w-0">
              <Microphone width={13} height={13} className="text-muted shrink-0" />
              <span className="truncate">¿Quieres grabar este punto?</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                className="text-xs font-medium text-foreground hover:text-accent cursor-pointer transition-colors"
                onClick={() => {
                  onDismissRecordingPrompt?.(activeBlock?.id);
                  const firstPoint = subpoints[0];
                  onStartRecording(
                    sessionState.liveActiveBlockId,
                    activeBlock?.title,
                    firstPoint?.id || null,
                    firstPoint?.title || activeBlock?.title
                  );
                }}
              >
                Grabar
              </button>
              <button
                type="button"
                className="text-xs text-muted hover:text-foreground cursor-pointer transition-colors"
                onClick={() => onDismissRecordingPrompt?.(activeBlock?.id)}
              >
                Ahora no
              </button>
            </div>
          </div>
        )}

        {/* RECORDING ACTIVE (Calm inline treatment) */}
        {isRecording && (
          <div className="flex items-center justify-between gap-2 pl-4 text-xs flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 text-foreground min-w-0">
              <span className="h-2 w-2 rounded-full bg-danger shrink-0" />
              <span className="font-medium text-foreground">Grabando</span>
              <span className="text-muted truncate max-w-[180px] sm:max-w-[260px]">
                · {activeRecordingName}
              </span>
              <span className="text-muted tabular-nums shrink-0">
                · {formatMsToClock(recordingElapsedMs)}
              </span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 ml-auto text-xs">
              <button
                type="button"
                className="text-muted hover:text-foreground cursor-pointer transition-colors font-normal"
                onClick={onPauseRecording}
              >
                Pausar grabación
              </button>
              <span className="text-muted/40">·</span>
              <button
                type="button"
                className="text-muted hover:text-foreground cursor-pointer transition-colors font-normal"
                onClick={onFinalizeRecording}
              >
                Finalizar
              </button>
            </div>
          </div>
        )}

        {/* RECORDING PAUSED (Calm inline treatment) */}
        {isRecPaused && (
          <div className="flex items-center justify-between gap-2 pl-4 text-xs flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-1.5 text-foreground min-w-0">
              <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
              <span className="font-medium text-foreground">Grabación pausada</span>
              <span className="text-muted truncate max-w-[180px] sm:max-w-[260px]">
                · {activeRecordingName}
              </span>
              <span className="text-muted tabular-nums shrink-0">
                · {formatMsToClock(recordingElapsedMs)}
              </span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 ml-auto text-xs">
              <button
                type="button"
                className="text-muted hover:text-foreground cursor-pointer transition-colors font-normal"
                onClick={onResumeRecording}
              >
                Continuar
              </button>
              <span className="text-muted/40">·</span>
              <button
                type="button"
                className="text-muted hover:text-foreground cursor-pointer transition-colors font-normal"
                onClick={onFinalizeRecording}
              >
                Finalizar
              </button>
            </div>
          </div>
        )}

        {/* 4. ACTIONS BAR */}
        {isExpired && !isUnlimited ? (
          /* STATE A: TIME EXPIRED */
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs flex-wrap pl-4">
            <span className="text-xs text-foreground font-medium">
              ¿Seguimos con este punto?
            </span>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2.5 font-normal text-muted hover:text-foreground"
                onPress={() => onExtendBlock(sessionState.liveActiveBlockId, 5)}
              >
                +5 min
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2.5 font-normal text-muted hover:text-foreground"
                onPress={() => onExtendBlock(sessionState.liveActiveBlockId, 10)}
              >
                +10 min
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 text-muted hover:text-foreground font-normal hidden sm:inline-flex"
                onPress={() => onSetUnlimited(sessionState.liveActiveBlockId)}
              >
                Sin límite
              </Button>

              <Dropdown>
                <Dropdown.Trigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label="Más opciones"
                    className="h-7 w-7 text-muted hover:text-foreground"
                  >
                    <EllipsisVertical width={13} height={13} />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover>
                  <Dropdown.Menu onAction={(key) => {
                    if (key === 'unlimited') onSetUnlimited(sessionState.liveActiveBlockId);
                    if (key === 'decision') onOpenDecisionCapture();
                    if (key === 'skip') onSkipBlock();
                    if (key === 'interrupt' && onInterruptSession) onInterruptSession();
                  }}>
                    <Dropdown.Item id="unlimited" textValue="Seguir sin límite de tiempo">
                      <ArrowsRotateLeft />
                      <Label>Seguir sin límite</Label>
                      <Description>Desactivar alertas</Description>
                    </Dropdown.Item>
                    <Dropdown.Item id="decision" textValue="Registrar acuerdo">
                      <CircleCheck />
                      <Label>Registrar acuerdo</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="skip" textValue="Saltar bloque">
                      <ForwardStep />
                      <Label>Saltar bloque</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="interrupt" variant="danger" textValue="Interrumpir sesión">
                      <CircleExclamation />
                      <Label>Interrumpir sesión</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>

              <Button
                variant="primary"
                size="sm"
                onPress={isLastBlock ? onFinishSession : onNextBlock}
                className="font-medium text-xs h-7 px-3.5 ml-1"
              >
                <span>{isLastBlock ? 'Finalizar sesión' : 'Siguiente'}</span>
                {!isLastBlock && <ArrowRight width={12} height={12} />}
              </Button>
            </div>
          </div>
        ) : isPaused ? (
          /* STATE B: PAUSED */
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs flex-wrap pl-4">
            <span className="text-xs text-muted font-normal">
              Tiempo y grabación pausados
            </span>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <Button
                variant="primary"
                size="sm"
                onPress={onResumeSession}
                className="font-medium text-xs h-7 px-3.5"
              >
                <Play width={12} height={12} />
                <span>Reanudar sesión</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onPress={isLastBlock ? onFinishSession : onNextBlock}
                className="text-xs text-muted hover:text-foreground h-7 px-2 font-normal"
              >
                <span>{isLastBlock ? 'Finalizar' : 'Siguiente'}</span>
              </Button>
            </div>
          </div>
        ) : (
          /* STATE C: RUNNING NORMAL */
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30 text-xs pl-4">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onPress={onOpenDecisionCapture}
                className="text-xs text-muted hover:text-foreground h-7 px-2 font-normal"
              >
                <Plus width={12} height={12} />
                <span>Decisión</span>
              </Button>

              {!isRecording && !isRecPaused && !showInitialPrompt && (
                subpoints.length > 1 ? (
                  <Dropdown>
                    <Dropdown.Trigger>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted hover:text-foreground h-7 px-2 font-normal"
                      >
                        <Microphone width={12} height={12} className="text-muted" />
                        <span>Grabar ▾</span>
                      </Button>
                    </Dropdown.Trigger>
                    <Dropdown.Popover>
                      <Dropdown.Menu onAction={(pointId) => {
                        const targetPoint = subpoints.find(p => p.id === pointId);
                        onStartRecording(
                          sessionState.liveActiveBlockId,
                          activeBlock?.title,
                          targetPoint?.id || null,
                          targetPoint?.title || activeBlock?.title
                        );
                      }}>
                        {subpoints.map((p) => (
                          <Dropdown.Item key={p.id} id={p.id} textValue={p.title}>
                            <Microphone />
                            <Label>{p.title}</Label>
                            {p.presenter && <Description>{p.presenter}</Description>}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      const firstPoint = subpoints[0];
                      onStartRecording(
                        sessionState.liveActiveBlockId,
                        activeBlock?.title,
                        firstPoint?.id || null,
                        firstPoint?.title || activeBlock?.title
                      );
                    }}
                    className="text-xs text-muted hover:text-foreground h-7 px-2 font-normal"
                  >
                    <Microphone width={12} height={12} className="text-muted" />
                    <span>Grabar</span>
                  </Button>
                )
              )}

              <Button
                variant="ghost"
                size="sm"
                onPress={onPauseSession}
                className="text-xs text-muted hover:text-foreground h-7 px-2 font-normal"
              >
                <Pause width={12} height={12} />
                <span>Pausar</span>
              </Button>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-auto">
              <Dropdown>
                <Dropdown.Trigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label="Más opciones"
                    className="h-7 w-7 text-muted hover:text-foreground"
                  >
                    <EllipsisVertical width={13} height={13} />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover>
                  <Dropdown.Menu onAction={(key) => {
                    if (key === 'skip') onSkipBlock();
                    if (key === 'unlimited') onSetUnlimited(sessionState.liveActiveBlockId);
                    if (key === 'interrupt' && onInterruptSession) onInterruptSession();
                  }}>
                    <Dropdown.Item id="unlimited" textValue="Seguir sin límite">
                      <ArrowsRotateLeft />
                      <Label>Seguir sin límite</Label>
                      <Description>Desactivar alertas</Description>
                    </Dropdown.Item>
                    <Dropdown.Item id="skip" textValue="Saltar bloque">
                      <ForwardStep />
                      <Label>Saltar bloque</Label>
                      <Description>Avanzar al siguiente</Description>
                    </Dropdown.Item>
                    <Dropdown.Item id="interrupt" variant="danger" textValue="Interrumpir sesión">
                      <CircleExclamation />
                      <Label>Interrumpir sesión</Label>
                      <Description>Pausar y conservar grabaciones</Description>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>

              <Button
                variant="primary"
                size="sm"
                onPress={isLastBlock ? onFinishSession : onNextBlock}
                className="font-medium text-xs h-7 px-3.5 ml-1"
              >
                <span>{isLastBlock ? 'Finalizar sesión' : 'Siguiente'}</span>
                {!isLastBlock && <ArrowRight width={12} height={12} />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
