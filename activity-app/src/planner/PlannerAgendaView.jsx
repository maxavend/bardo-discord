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
  ListCheck,
} from '@gravity-ui/icons';
import {
  clockToMinutes,
  minutesToClock,
} from './time-engine.js';

export function PlannerAgendaView({
  state,
  onOpenEditor,
  onToggleSubpointStatus,
  onOpenCapture,
  onDeleteDecision,
  onDeleteTask,
}) {
  const {
    description = '',
    startTime = '10:00',
    blocks = [],
    liveActiveBlockId = null,
  } = state;

  let cursorMinutes = clockToMinutes(startTime);

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto pb-12 pt-2">
      {/* Contexto opcional de la sesión */}
      {description && (
        <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-2xl whitespace-pre-line pb-1">
          {description}
        </p>
      )}

      {/* Timeline de la Agenda */}
      {blocks.length === 0 ? (
        <div className="p-8 border border-dashed border-border rounded-xl text-center bg-surface-secondary/20 flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Agenda sin bloques</p>
          <p className="text-xs text-muted max-w-sm">
            Aún no has agregado bloques a esta sesión. Abre el editor para configurar la estructura y temas a tratar.
          </p>
          <Button variant="primary" size="sm" onPress={onOpenEditor} className="mt-2">
            Configurar agenda
          </Button>
        </div>
      ) : (
        <div className="relative flex flex-col gap-3 before:hidden sm:before:block before:absolute before:top-3 before:bottom-3 before:left-[64px] before:w-px before:bg-border/50">
          {blocks.map((block, bIdx) => {
            const blockStart = minutesToClock(cursorMinutes);
            const blockDur = block.durationMinutes || 30;
            const blockEnd = minutesToClock(cursorMinutes + blockDur);
            cursorMinutes += blockDur;

            const isLive = block.id === liveActiveBlockId;
            const isBreak = block.title.toLowerCase().includes('break') || block.title.toLowerCase().includes('receso') || block.title.toLowerCase().includes('pausa');

            // Tratamiento ligero para bloques de tipo Break / Pausa
            if (isBreak && (block.subpoints || []).length === 0 && (block.decisions || []).length === 0 && (block.tasks || []).length === 0) {
              return (
                <div key={block.id || bIdx} className="grid grid-cols-1 sm:grid-cols-[58px_1fr] gap-2 sm:gap-3 items-center relative z-10">
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start select-none pr-1">
                    <span className="text-xs font-semibold text-muted">{blockStart}</span>
                    <span className="text-[11px] text-muted/60 hidden sm:inline">{blockEnd}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg bg-surface-secondary/30 border border-border/40 text-xs text-muted">
                    <div className="flex items-center gap-2">
                      <Cup width={13} height={13} className="text-muted/80" />
                      <span className="font-medium text-foreground">{block.title}</span>
                      {block.introDesc && <span className="text-muted/70 hidden sm:inline">· {block.introDesc}</span>}
                    </div>
                    <span className="text-muted/80 shrink-0">{blockDur} min</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={block.id || bIdx} className="grid grid-cols-1 sm:grid-cols-[58px_1fr] gap-2 sm:gap-3 items-start relative z-10">
                {/* Columna Horaria con conector sutil y gap optimizado */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start pt-1.5 select-none pr-1">
                  <span className="text-xs sm:text-sm font-bold text-foreground leading-tight">{blockStart}</span>
                  <span className="text-[11px] text-muted/70 leading-tight">{blockEnd}</span>
                  <span className="text-[11px] font-medium text-accent/90 bg-accent/10 px-1.5 py-0.5 rounded mt-1">
                    {blockDur}m
                  </span>
                </div>

                {/* Tarjeta del Bloque */}
                <Card
                  className={`p-4 sm:p-4.5 flex flex-col gap-2.5 ${
                    isLive ? 'border-accent ring-1 ring-accent/30' : ''
                  }`}
                >
                  {/* Cabecera del Bloque */}
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-foreground tracking-tight">
                        {block.title}
                      </h3>
                      {isLive && (
                        <Chip size="sm" variant="soft" color="accent">
                          En curso
                        </Chip>
                      )}
                      <span className="text-xs text-muted">
                        {block.durationMinutes} min
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => onOpenCapture('decision', block.id)}
                        aria-label={`Registrar decisión en ${block.title}`}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        <Plus width={13} height={13} /> Decisión
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => onOpenCapture('task', block.id)}
                        aria-label={`Registrar tarea en ${block.title}`}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        <Plus width={13} height={13} /> Tarea
                      </Button>
                    </div>
                  </div>

                  {/* Conductor y participantes (metadata secundaria/terciaria) */}
                  {(block.leader || block.participants) && (
                    <div className="text-xs text-muted -mt-1.5 flex items-center gap-2 flex-wrap">
                      {block.leader && (
                        <span>Conduce: <strong className="text-foreground font-medium">{block.leader}</strong></span>
                      )}
                      {block.leader && block.participants && <span className="text-muted/40">·</span>}
                      {block.participants && (
                        <span className="text-muted/80">Participan: {block.participants}</span>
                      )}
                    </div>
                  )}

                  {/* Puntos de Revisión — Filas limpias sin nesting excesivo */}
                  {(block.subpoints || []).length > 0 && (
                    <div className="flex flex-col divide-y divide-border/30 pt-1 border-t border-border/40">
                      {block.subpoints.map((p) => {
                        const isDone = p.status === 'done';
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 py-2 px-1 hover:bg-surface-secondary/30 rounded transition-colors"
                          >
                            <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none">
                              <Checkbox
                                isSelected={isDone}
                                onChange={(checked) => onToggleSubpointStatus(block.id, p.id, checked)}
                                size="sm"
                                aria-label={`Marcar ${p.title} como revisado`}
                              />
                              <span
                                className={`text-xs sm:text-sm font-medium ${
                                  isDone ? 'text-muted/80 font-normal' : 'text-foreground'
                                } truncate`}
                              >
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

                  {/* Resultados / Outcomes del Bloque (Decisiones y Tareas) */}
                  {((block.decisions || []).length > 0 || (block.tasks || []).length > 0) && (
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
                      {/* Decisiones */}
                      {(block.decisions || []).map((d) => (
                        <div
                          key={d.id}
                          className="px-3 py-2 rounded-lg bg-surface-secondary/40 text-xs text-foreground flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <CircleCheck width={14} height={14} className="text-success shrink-0" />
                            <span className="font-medium truncate">{d.content}</span>
                          </div>

                          <Dropdown>
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              aria-label="Opciones de decisión"
                              className="h-6 w-6"
                            >
                              <EllipsisVertical width={12} height={12} />
                            </Button>
                            <Dropdown.Popover>
                              <Dropdown.Menu
                                onAction={(key) => {
                                  if (key === 'delete') onDeleteDecision(block.id, d.id);
                                }}
                              >
                                <Dropdown.Item id="delete" variant="danger" textValue="Eliminar decisión">
                                  <TrashBin />
                                  <Label>Eliminar</Label>
                                  <Description>Quitar de los acuerdos</Description>
                                </Dropdown.Item>
                              </Dropdown.Menu>
                            </Dropdown.Popover>
                          </Dropdown>
                        </div>
                      ))}

                      {/* Tareas */}
                      {(block.tasks || []).map((t) => (
                        <div
                          key={t.id}
                          className="px-3 py-2 rounded-lg bg-surface-secondary/40 text-xs text-foreground flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ListCheck width={14} height={14} className="text-accent shrink-0" />
                            <span className="truncate">{t.title}</span>
                            {t.assignee && (
                              <span className="text-xs text-muted bg-surface-secondary/80 px-1.5 py-0.5 rounded">
                                {t.assignee}
                              </span>
                            )}
                          </div>

                          <Dropdown>
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              aria-label="Opciones de tarea"
                              className="h-6 w-6"
                            >
                              <EllipsisVertical width={12} height={12} />
                            </Button>
                            <Dropdown.Popover>
                              <Dropdown.Menu
                                onAction={(key) => {
                                  if (key === 'delete') onDeleteTask(block.id, t.id);
                                }}
                              >
                                <Dropdown.Item id="delete" variant="danger" textValue="Eliminar tarea">
                                  <TrashBin />
                                  <Label>Eliminar</Label>
                                  <Description>Quitar de las tareas</Description>
                                </Dropdown.Item>
                              </Dropdown.Menu>
                            </Dropdown.Popover>
                          </Dropdown>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
