import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  Label,
  Description,
} from '@heroui/react';
import {
  Plus,
  EllipsisVertical,
  TrashBin,
  Cup,
  CircleCheck,
  Microphone,
} from '@gravity-ui/icons';
import {clockToMinutes, minutesToClock} from './time-engine.js';
import {
  POINT_STATUS,
  getElapsedActiveBlockMs,
  getBlockPlannedMs,
} from './session-runner.js';
import {PlannerAudioPlayer} from './PlannerAudioPlayer.jsx';
import {MaterialWavyProgress} from './MaterialWavyProgress.jsx';

export function PlannerAgendaView({
  state,
  sessionState,
  dockSlot = null,
  onOpenEditor,
  onToggleSubpointStatus,
  onOpenCapture,
  onDeleteDecision,
}) {
  const {
    startTime = '10:00',
    blocks = [],
  } = state;

  const liveActiveBlockId = sessionState?.liveActiveBlockId || state.liveActiveBlockId || null;
  const liveActivePointId = sessionState?.liveActivePointId || null;
  const isPaused = sessionState?.isPaused || false;
  let cursorMinutes = clockToMinutes(startTime);

  return (
    <div className="planner-agenda-container w-full max-w-4xl mx-auto pb-24 pt-2 flex flex-col gap-3">
      {dockSlot && (
        <div
          className="session-toolbar-sticky w-full"
          style={{
            position: 'sticky',
            top: 'calc(var(--bardo-visual-viewport-top, 0px) + var(--bardo-safe-top, 0px) + var(--bardo-topbar, 52px) + var(--bardo-toolbar-gap, 12px))',
            zIndex: 40,
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
            <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />
            <div className="min-w-0 w-full">
              {dockSlot}
            </div>
          </div>
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
          <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />
          <div className="p-8 border border-dashed border-border rounded-xl text-center bg-surface-secondary/20 flex flex-col items-center gap-2 min-w-0 w-full">
            <p className="text-sm font-semibold text-foreground">Agenda sin bloques</p>
            <p className="text-xs text-muted max-w-sm">
              Aún no has agregado bloques a esta sesión. Abre el editor para configurar la estructura y temas a tratar.
            </p>
            <Button variant="primary" size="sm" onPress={onOpenEditor} className="mt-2">
              Configurar agenda
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col gap-3">
          {blocks.map((block, blockIndex) => {
            const blockStart = minutesToClock(cursorMinutes);
            const blockDuration = block.durationMinutes || 30;
            const blockEnd = minutesToClock(cursorMinutes + blockDuration);
            cursorMinutes += blockDuration;

            const isLive = block.id === liveActiveBlockId;
            const isCompleted = (sessionState?.completedBlockIds || []).includes(block.id);
            const isSkipped = (sessionState?.skippedBlockIds || []).includes(block.id);
            const lowerTitle = block.title.toLowerCase();
            const isBreak = lowerTitle.includes('break') || lowerTitle.includes('receso') || lowerTitle.includes('pausa');
            const blockRecordings = (sessionState?.recordings || []).filter((recording) => recording.blockId === block.id);
            const isLast = blockIndex === blocks.length - 1;

            let progressPercent = 0;
            if (isLive && sessionState) {
              const plannedMs = getBlockPlannedMs(block, sessionState);
              const elapsedMs = getElapsedActiveBlockMs(sessionState);
              const ratio = plannedMs > 0 ? Math.min(1, Math.max(0.06, elapsedMs / plannedMs)) : 0.5;
              progressPercent = Math.round(ratio * 100);
            }

            if (isBreak && !isLive && (block.subpoints || []).length === 0 && (block.decisions || []).length === 0) {
              return (
                <div key={block.id || blockIndex} className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-center relative z-10">
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start select-none pr-3 shrink-0 relative h-full">
                    <span className="text-xs font-semibold text-muted">{blockStart}</span>
                    <span className="text-[11px] text-muted/60 hidden sm:inline">{blockEnd}</span>

                    {/* Material Design 3 Vertical Progress Timeline Rail (4px) */}
                    <div className="hidden sm:flex flex-col items-center absolute right-[-8px] top-0 bottom-[-12px] w-4 select-none pointer-events-none z-0">
                      <div className="relative mt-2 z-10">
                        {isCompleted ? (
                          <span className="h-2 w-2 rounded-full bg-accent ring-2 ring-surface block" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-border/80 ring-2 ring-surface block" />
                        )}
                      </div>

                      {!isLast && (
                        <div className="flex-1 w-full relative flex justify-center items-stretch min-h-[24px]">
                          {isCompleted ? (
                            <div className="w-[4px] h-full bg-accent rounded-full my-1" />
                          ) : (
                            <div className="w-[4px] h-full bg-border/40 rounded-full my-1" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 w-full">
                    <div className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-xs ${
                      isCompleted ? 'bg-surface-secondary/20 border-border/30 text-muted opacity-70' : 'bg-surface-secondary/30 border-border/40 text-muted'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Cup width={13} height={13} className="text-muted/80 shrink-0" />
                        <span className="font-medium text-foreground truncate">{block.title}</span>
                        {block.introDesc && <span className="text-muted/70 hidden sm:inline truncate">· {block.introDesc}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isCompleted && <span className="text-success text-[11px]">Listo</span>}
                        <span className="text-muted/80">{blockDuration} min</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={block.id || blockIndex} className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start relative z-10">
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start pt-1.5 select-none pr-3 shrink-0 relative h-full">
                  <span className={`text-xs sm:text-sm font-bold leading-tight ${isLive ? 'text-accent' : 'text-foreground'}`}>{blockStart}</span>
                  <span className="text-[11px] text-muted/70 leading-tight">{blockEnd}</span>
                  <span className="text-[11px] text-muted mt-1">{blockDuration}m</span>

                  {/* Material Design 3 Vertical Progress Timeline Rail (4px) */}
                  <div className="hidden sm:flex flex-col items-center absolute right-[-8px] top-0 bottom-[-12px] w-4 select-none pointer-events-none z-0">
                    <div className="relative mt-2.5 z-10">
                      {isLive ? (
                        <div className="relative flex items-center justify-center">
                          <span className="absolute h-4 w-4 rounded-full bg-accent/30 animate-ping" />
                          <span className="relative h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface shadow-xs block" />
                        </div>
                      ) : isCompleted ? (
                        <span className="h-2 w-2 rounded-full bg-accent ring-2 ring-surface block" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-border/80 ring-2 ring-surface block" />
                      )}
                    </div>

                    {!isLast && (
                      <div className="flex-1 w-full relative flex justify-center items-stretch min-h-[24px]">
                        {isLive ? (
                          <MaterialWavyProgress
                            value={progressPercent}
                            color={sessionState?.isExpired ? 'danger' : 'accent'}
                            isPaused={isPaused}
                            orientation="vertical"
                            strokeWidth={4}
                            wavelength={52}
                            amplitude={3.5}
                          />
                        ) : isCompleted ? (
                          <div className="w-[4px] h-full bg-accent rounded-full my-1" />
                        ) : (
                          <div className="w-[4px] h-full bg-border/40 rounded-full my-1" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 w-full">
                  <Card
                    className={`p-4 sm:p-4.5 flex flex-col gap-2.5 rounded-xl transition-all ${
                      isLive
                        ? 'border-accent/60 ring-1 ring-accent/20 shadow-sm bg-surface'
                        : isCompleted
                          ? 'opacity-85 bg-surface border-border/40'
                          : isSkipped
                            ? 'opacity-60 bg-surface-secondary/30 border-border/30'
                            : 'bg-surface border-border/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                        <h3 className="text-base font-bold tracking-tight text-foreground">{block.title}</h3>
                        {isLive && <span className="text-[11px] font-semibold text-accent">En curso</span>}
                        {isCompleted && <span className="text-[11px] font-medium text-success">Completado</span>}
                        {isSkipped && <span className="text-[11px] font-medium text-muted">Saltado</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                        {block.leader && <span>Líder: <strong className="font-medium text-foreground">{block.leader}</strong></span>}
                        {block.participants && <span className="hidden sm:inline">· {block.participants}</span>}
                      </div>
                    </div>

                    {block.introDesc && (
                      <p className="text-xs text-muted leading-relaxed">{block.introDesc}</p>
                    )}

                    {(block.subpoints || []).length > 0 && (
                      <div className="flex flex-col gap-1 pt-1">
                        {block.subpoints.map((point, pointIndex) => {
                          const storedStatus = sessionState?.pointStatuses?.[point.id] || point.status || POINT_STATUS.PENDING;
                          const isPointActive = isLive && point.id === liveActivePointId;
                          const isDone = storedStatus === POINT_STATUS.DONE;
                          const isPointSkipped = storedStatus === POINT_STATUS.SKIPPED;
                          return (
                            <div
                              key={point.id}
                              className={`flex items-start justify-between gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
                                isPointActive
                                  ? 'bg-accent/8 ring-1 ring-inset ring-accent/25'
                                  : isDone || isPointSkipped
                                    ? 'bg-surface-secondary/20'
                                    : 'hover:bg-surface-secondary/45'
                              }`}
                            >
                              <label className="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer select-none">
                                <Checkbox
                                  size="sm"
                                  isSelected={isDone}
                                  onChange={(event) => onToggleSubpointStatus(block.id, point.id, event.target.checked)}
                                  className="mt-0.5 shrink-0"
                                />
                                <span className="flex flex-col min-w-0">
                                  <span className={`text-xs leading-snug ${
                                    isDone ? 'line-through text-muted' : isPointSkipped ? 'text-muted' : isPointActive ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                                  }`}>
                                    {point.title || '(Punto sin título)'}
                                  </span>
                                  {isPointActive && point.description && (
                                    <span className="text-[11px] text-muted mt-0.5 line-clamp-2">{point.description}</span>
                                  )}
                                </span>
                              </label>

                              <div className="flex items-center gap-2 text-[11px] text-muted shrink-0">
                                {isPointActive && <span className="text-accent font-semibold">Punto {pointIndex + 1} · En curso</span>}
                                {!isPointActive && isDone && <span className="text-success font-medium">Revisado</span>}
                                {!isPointActive && isPointSkipped && <span className="font-medium">Saltado</span>}
                                {point.presenter && <span className="text-muted/80">· {point.presenter}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {blockRecordings.length > 0 && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
                        <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                          <Microphone width={12} height={12} className="text-accent" />
                          Grabaciones ({blockRecordings.length})
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {blockRecordings.map((recording) => (
                            <PlannerAudioPlayer key={recording.id} recording={recording} />
                          ))}
                        </div>
                      </div>
                    )}

                    {(block.decisions || []).length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
                        {block.decisions.map((decision) => {
                          const point = (block.subpoints || []).find((candidate) => candidate.id === decision.pointId);
                          return (
                            <div
                              key={decision.id}
                              className="px-3 py-2 rounded-lg bg-surface-secondary/40 text-xs text-foreground flex items-center justify-between gap-2"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <CircleCheck width={14} height={14} className="text-success shrink-0 mt-0.5" />
                                <span className="min-w-0">
                                  <span className="font-medium break-words">{decision.content}</span>
                                  {point && <span className="block text-[11px] text-muted mt-0.5">{point.title}</span>}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                aria-label="Eliminar acuerdo"
                                className="h-6 w-6 text-muted hover:text-danger shrink-0"
                                onPress={() => onDeleteDecision(block.id, decision.id)}
                              >
                                <TrashBin width={12} height={12} />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-border/30 text-xs text-muted">
                      <div className="flex items-center gap-2">
                        {block.phases && (
                          <span className="text-[11px]">
                            {block.phases.context}m ctx · {block.phases.review}m rev · {block.phases.closing}m cierre
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => onOpenCapture('decision', block.id)}
                          className="h-7 text-xs text-muted hover:text-foreground"
                        >
                          <Plus width={12} height={12} /> Acuerdo
                        </Button>
                        <Dropdown>
                          <Dropdown.Trigger>
                            <Button variant="ghost" size="sm" isIconOnly aria-label="Opciones del bloque" className="h-7 w-7 text-muted hover:text-foreground">
                              <EllipsisVertical width={13} height={13} />
                            </Button>
                          </Dropdown.Trigger>
                          <Dropdown.Popover>
                            <Dropdown.Menu onAction={(key) => key === 'edit' && onOpenEditor()}>
                              <Dropdown.Item id="edit" textValue="Editar bloque en la agenda">
                                <Label>Editar bloque</Label>
                                <Description>Modificar tiempos o puntos</Description>
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
