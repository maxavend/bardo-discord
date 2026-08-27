import {
  Button,
  Card,
  Checkbox,
  Chip,
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
import {
  clockToMinutes,
  minutesToClock,
} from './time-engine.js';
import {PlannerAudioPlayer} from './PlannerAudioPlayer.jsx';

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
    description = '',
    startTime = '10:00',
    blocks = [],
  } = state;

  const liveActiveBlockId = sessionState?.liveActiveBlockId || state.liveActiveBlockId || null;
  let cursorMinutes = clockToMinutes(startTime);

  return (
    <div className="planner-agenda-container w-full max-w-4xl mx-auto pb-24 pt-2 flex flex-col gap-3">
      {/* Top Content Row: SessionDock in live mode OR Session Description in idle mode */}
      {(dockSlot || description) && (
        <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start mb-1">
          {/* Timeline Column Spacer */}
          <div className="hidden sm:block sm:w-16 shrink-0" aria-hidden="true" />

          {/* Content Column: SessionDock (Live) or Description (Idle) */}
          <div className="flex flex-col gap-2 min-w-0 w-full">
            {dockSlot}
            {!dockSlot && description && (
              <p className="text-xs sm:text-sm text-muted leading-relaxed whitespace-pre-line py-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Timeline de la Agenda */}
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
        <div className="relative flex flex-col gap-3 before:hidden sm:before:block before:absolute before:top-3 before:bottom-3 before:left-[31px] before:w-px before:bg-border/50">
          {blocks.map((block, bIdx) => {
            const blockStart = minutesToClock(cursorMinutes);
            const blockDur = block.durationMinutes || 30;
            const blockEnd = minutesToClock(cursorMinutes + blockDur);
            cursorMinutes += blockDur;

            const isLive = block.id === liveActiveBlockId;
            const isCompleted = (sessionState?.completedBlockIds || []).includes(block.id);
            const isSkipped = (sessionState?.skippedBlockIds || []).includes(block.id);
            const isBreak = block.title.toLowerCase().includes('break') || block.title.toLowerCase().includes('receso') || block.title.toLowerCase().includes('pausa');

            const blockRecordings = (sessionState?.recordings || []).filter(r => r.blockId === block.id);

            // Tratamiento ligero para bloques de tipo Break / Pausa (salvo que sea el bloque activo en vivo)
            if (isBreak && !isLive && (block.subpoints || []).length === 0 && (block.decisions || []).length === 0) {
              return (
                <div key={block.id || bIdx} className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-center relative z-10">
                  {/* Timeline Column */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start select-none pr-2 shrink-0">
                    <span className="text-xs font-semibold text-muted">{blockStart}</span>
                    <span className="text-[11px] text-muted/60 hidden sm:inline">{blockEnd}</span>
                  </div>

                  {/* Content Column */}
                  <div className="min-w-0 w-full">
                    <div className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-xs ${
                      isCompleted ? 'bg-surface-secondary/20 border-border/30 text-muted line-through opacity-70' : 'bg-surface-secondary/30 border-border/40 text-muted'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Cup width={13} height={13} className="text-muted/80 shrink-0" />
                        <span className="font-medium text-foreground truncate">{block.title}</span>
                        {block.introDesc && <span className="text-muted/70 hidden sm:inline truncate">· {block.introDesc}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isCompleted && <span className="text-success text-[11px]">✓ Listo</span>}
                        <span className="text-muted/80">{blockDur} min</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={block.id || bIdx} className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 sm:gap-4 items-start relative z-10">
                {/* Timeline Column */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start pt-1.5 select-none pr-2 shrink-0">
                  <span className={`text-xs sm:text-sm font-bold leading-tight ${isLive ? 'text-accent' : 'text-foreground'}`}>{blockStart}</span>
                  <span className="text-[11px] text-muted/70 leading-tight">{blockEnd}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full mt-1 ${
                    isLive ? 'text-accent bg-accent/20 font-bold' : isCompleted ? 'text-success bg-success/10' : 'text-muted bg-surface-secondary'
                  }`}>
                    {blockDur}m
                  </span>
                </div>

                {/* Content Column: Tarjeta del Bloque */}
                <div className="min-w-0 w-full">
                  <Card
                    className={`p-4 sm:p-4.5 flex flex-col gap-2.5 rounded-xl transition-all ${
                      isLive
                        ? 'border-accent/60 ring-1 ring-accent/25 shadow-md bg-surface'
                        : isCompleted
                        ? 'opacity-85 bg-surface border-border/40'
                        : isSkipped
                        ? 'opacity-60 bg-surface-secondary/30 border-border/30'
                        : 'bg-surface border-border/60'
                    }`}
                  >
                    {/* Cabecera del Bloque */}
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className={`text-base font-bold tracking-tight ${isLive ? 'text-foreground font-extrabold' : 'text-foreground'}`}>
                          {block.title}
                        </h3>
                        {isLive && (
                          <Chip size="sm" variant="soft" color="accent" className="font-bold text-[11px]">
                            ● EN CURSO
                          </Chip>
                        )}
                        {isCompleted && (
                          <Chip size="sm" variant="secondary" className="text-success text-[11px] font-medium">
                            ✓ Completado
                          </Chip>
                        )}
                        {isSkipped && (
                          <Chip size="sm" variant="secondary" className="text-muted text-[11px] font-medium">
                            Saltado
                          </Chip>
                        )}
                      </div>

                      {/* Metadatos Rápidos */}
                      <div className="flex items-center gap-2 text-xs text-muted font-normal flex-wrap">
                        {block.leader && <span>Líder: <strong className="font-medium text-foreground">{block.leader}</strong></span>}
                        {block.participants && (
                          <span className="hidden sm:inline">· {block.participants}</span>
                        )}
                      </div>
                    </div>

                    {/* Descripción de Introducción / Contexto */}
                    {block.introDesc && (
                      <p className="text-xs text-muted leading-relaxed">
                        {block.introDesc}
                      </p>
                    )}

                    {/* Lista de Puntos / Subpuntos de la Agenda */}
                    {(block.subpoints || []).length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        {block.subpoints.map((p) => {
                          const isDone = p.status === 'done';
                          return (
                            <div
                              key={p.id}
                              className={`flex items-start justify-between gap-2.5 p-2 rounded-lg transition-colors ${
                                isDone ? 'bg-surface-secondary/20 opacity-80' : 'bg-surface-secondary/40 hover:bg-surface-secondary/60'
                              }`}
                            >
                              <label className="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer select-none">
                                <Checkbox
                                  size="sm"
                                  isSelected={isDone}
                                  onChange={(e) => onToggleSubpointStatus(block.id, p.id, e.target.checked)}
                                  className="mt-0.5 shrink-0"
                                />
                                <span className={`text-xs text-foreground leading-snug ${isDone ? 'line-through text-muted' : 'font-medium'}`}>
                                  {p.title || '(Punto sin título)'}
                                </span>
                              </label>

                              <div className="flex items-center gap-2 text-xs text-muted shrink-0">
                                {isDone && (
                                  <span className="text-success text-xs font-medium mr-1">
                                    Revisado
                                  </span>
                                )}
                                {p.presenter && (
                                  <span className="text-muted/80 text-xs font-medium">
                                    · {p.presenter}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Grabaciones de Audio Asociadas al Bloque */}
                    {blockRecordings.length > 0 && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
                        <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                          <Microphone width={12} height={12} className="text-accent" />
                          <span>Grabaciones ({blockRecordings.length})</span>
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {blockRecordings.map((rec) => (
                            <PlannerAudioPlayer key={rec.id} recording={rec} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Acuerdos y Decisiones del Bloque */}
                    {(block.decisions || []).length > 0 && (
                      <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
                        {block.decisions.map((d) => (
                          <div
                            key={d.id}
                            className="px-3 py-2 rounded-lg bg-surface-secondary/40 text-xs text-foreground flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <CircleCheck width={14} height={14} className="text-success shrink-0" />
                              <span className="font-medium truncate">{d.content}</span>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              aria-label="Eliminar acuerdo"
                              className="h-6 w-6 text-muted hover:text-danger shrink-0"
                              onPress={() => onDeleteDecision(block.id, d.id)}
                            >
                              <TrashBin width={12} height={12} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Acciones del Bloque */}
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
                          <Plus width={12} height={12} />
                          <span>Acuerdo</span>
                        </Button>

                        <Dropdown>
                          <Dropdown.Trigger>
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              aria-label="Opciones del bloque"
                              className="h-7 w-7 text-muted hover:text-foreground"
                            >
                              <EllipsisVertical width={13} height={13} />
                            </Button>
                          </Dropdown.Trigger>
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              onAction={(key) => {
                                if (key === 'edit') onOpenEditor();
                              }}
                            >
                              <Dropdown.Item id="edit" textValue="Editar bloque en la agenda">
                                <Label>Editar bloque</Label>
                                <Description>Modificar tiempos o subpuntos</Description>
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
