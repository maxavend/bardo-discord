import {
  Button,
  Card,
  Checkbox,
  Chip,
  Separator,
  Dropdown,
  Label,
  Description,
} from '@heroui/react';
import {
  Pencil,
  Copy,
  FileText,
  Plus,
  EllipsisVertical,
  TrashBin,
} from '@gravity-ui/icons';
import {
  formatSmartDuration,
  clockToMinutes,
  minutesToClock,
} from './time-engine.js';

export function PlannerAgendaView({
  state,
  onOpenEditor,
  onOpenMinutes,
  onCopyAnnouncement,
  onToggleSubpointStatus,
  onOpenCapture,
  onDeleteDecision,
  onDeleteTask,
}) {
  const {
    title = 'Sesión sin título',
    description = '',
    startTime = '10:00',
    totalCalculatedDuration = 0,
    mentions = '',
    blocks = [],
    liveActiveBlockId = null,
  } = state;

  const totalPoints = blocks.reduce((acc, b) => acc + (b.subpoints || []).length, 0);
  const completedPoints = blocks.reduce(
    (acc, b) => acc + (b.subpoints || []).filter((p) => p.status === 'done').length,
    0
  );

  let cursorMinutes = clockToMinutes(startTime);

  return (
    <div className="flex flex-col gap-5 w-full max-w-4xl mx-auto pb-12">
      {/* 1. Header Card - Object-centric view */}
      <Card className="p-4 sm:p-5 bg-surface border border-border rounded-xl">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              {liveActiveBlockId && (
                <Chip size="sm" variant="soft" color="danger" className="font-semibold text-xs">
                  ● En Vivo
                </Chip>
              )}
            </div>

            {description && (
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-2xl whitespace-pre-line mb-3">
                {description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
              {state.date && (
                <Chip size="sm" variant="secondary">
                  📅 {state.date}
                </Chip>
              )}
              <Chip size="sm" variant="secondary">
                ⏰ {startTime} ({formatSmartDuration(totalCalculatedDuration)})
              </Chip>
              {state.host && (
                <Chip size="sm" variant="secondary">
                  👤 Conduce: <strong className="text-foreground ml-1">{state.host}</strong>
                </Chip>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onPress={onCopyAnnouncement}
            >
              <Copy width={14} height={14} /> Copiar Anuncio
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={onOpenMinutes}
            >
              <FileText width={14} height={14} /> Minuta
            </Button>
            <Button
              variant="primary"
              size="sm"
              onPress={onOpenEditor}
            >
              <Pencil width={14} height={14} /> Editar
            </Button>
          </div>
        </div>
      </Card>

      {/* 2. Convocados */}
      {mentions && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg bg-surface-secondary/40 border border-border text-xs">
          <span className="font-bold text-muted uppercase tracking-wider text-xs">Convocados:</span>
          {mentions.split(' ').filter(Boolean).map((tag, i) => (
            <Chip key={i} size="sm" variant="primary">
              {tag}
            </Chip>
          ))}
        </div>
      )}

      {/* 3. Summary Metrics Bar */}
      <div className="flex items-center gap-3 px-1 text-xs text-muted font-medium">
        <span>
          <b className="text-foreground font-semibold">{blocks.length}</b> {blocks.length === 1 ? 'bloque' : 'bloques'}
        </span>
        <Separator orientation="vertical" className="h-3" />
        <span>
          <b className="text-foreground font-semibold">{totalCalculatedDuration} min</b> totales ({formatSmartDuration(totalCalculatedDuration)})
        </span>
        <Separator orientation="vertical" className="h-3" />
        <span>
          <b className="text-foreground font-semibold">{completedPoints}/{totalPoints}</b> puntos revisados
        </span>
      </div>

      {/* 4. Timeline Rail & Agenda Blocks */}
      {blocks.length === 0 ? (
        <div className="p-8 border border-dashed border-border rounded-xl text-center bg-surface-secondary/20 flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Agenda sin bloques</p>
          <p className="text-xs text-muted max-w-sm">
            Aún no has agregado bloques a esta sesión. Abre el editor para configurar la estructura y puntos de revisión.
          </p>
          <Button variant="primary" size="sm" onPress={onOpenEditor} className="mt-2">
            <Pencil width={14} height={14} /> Configurar Agenda
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {blocks.map((block, bIdx) => {
            const blockStart = minutesToClock(cursorMinutes);
            const blockDur = block.durationMinutes || 30;
            const blockEnd = minutesToClock(cursorMinutes + blockDur);
            cursorMinutes += blockDur;

            const isLive = block.id === liveActiveBlockId;

            return (
              <div key={block.id || bIdx} className="grid grid-cols-1 md:grid-cols-[80px_1fr] gap-2.5 md:gap-3.5 items-start">
                {/* Schedule Clock Column */}
                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start pt-1 select-none">
                  <span className="text-xs sm:text-sm font-bold text-foreground font-mono">{blockStart}</span>
                  <span className="text-xs text-muted font-mono">{blockEnd}</span>
                  <span className="text-xs font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded mt-0.5 font-mono">
                    {blockDur}m
                  </span>
                </div>

                {/* Block Card */}
                <Card
                  className={`p-4 rounded-xl border ${
                    isLive ? 'border-accent bg-surface ring-1 ring-accent/30' : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-2.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                        {block.title}
                      </h3>
                      {isLive && (
                        <Chip size="sm" variant="soft" color="accent" className="font-bold text-xs">
                          ● En curso
                        </Chip>
                      )}
                      <span className="text-xs text-muted font-medium">
                        {block.durationMinutes} min
                        {block.isAutoCalculated && (
                          <span className="text-accent text-xs ml-1 font-normal">(auto)</span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => onOpenCapture('decision', block.id)}
                        aria-label={`Registrar decisión en ${block.title}`}
                      >
                        <Plus width={12} height={12} /> Decisión
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => onOpenCapture('task', block.id)}
                        aria-label={`Registrar tarea en ${block.title}`}
                      >
                        <Plus width={12} height={12} /> Tarea
                      </Button>
                    </div>
                  </div>

                  {block.leader && (
                    <p className="text-xs text-muted mb-2.5">
                      Conduce: <strong className="text-foreground font-medium">{block.leader}</strong>
                      {block.participants && (
                        <span className="text-muted/80 ml-2">· Participan: {block.participants}</span>
                      )}
                    </p>
                  )}

                  {/* Subpoints List with Live Interactive Checkboxes */}
                  {(block.subpoints || []).length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {block.subpoints.map((p) => {
                        const isDone = p.status === 'done';
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-surface-secondary/40 hover:bg-surface-secondary/70 border border-border/40"
                          >
                            <label className="flex items-center gap-2.5 flex-1 cursor-pointer select-none">
                              <Checkbox
                                isSelected={isDone}
                                onChange={(checked) => onToggleSubpointStatus(block.id, p.id, checked)}
                                size="sm"
                                aria-label={`Marcar ${p.title} como revisado`}
                              />
                              <span
                                className={`text-xs ${
                                  isDone ? 'line-through text-muted' : 'text-foreground font-medium'
                                }`}
                              >
                                {p.title || '(Sin título)'}
                              </span>
                            </label>

                            <div className="flex items-center gap-2 text-xs text-muted shrink-0">
                              {p.durationMinutes > 0 && (
                                <span className="bg-surface px-1.5 py-0.5 rounded border border-border text-xs font-mono">
                                  {p.durationMinutes}m
                                </span>
                              )}
                              {p.presenter && (
                                <span className="text-muted text-xs">
                                  · {p.presenter}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Realtime Live Captured Entries (Decisions & Tasks) */}
                  {((block.decisions || []).length > 0 || (block.tasks || []).length > 0) && (
                    <div className="flex flex-col gap-1.5 mt-2.5 pt-2.5 border-t border-border">
                      {(block.decisions || []).map((d, dIdx) => (
                        <div
                          key={d.id || dIdx}
                          className="px-2.5 py-1.5 rounded-md bg-success/10 border-l-2 border-success text-xs text-foreground flex items-center justify-between gap-2"
                        >
                          <div>
                            <strong className="text-success font-semibold">Decisión:</strong> {d.content}
                          </div>
                          {onDeleteDecision && (
                            <Dropdown>
                              <Dropdown.Trigger>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  isIconOnly
                                  aria-label="Opciones de decisión"
                                  className="h-6 w-6 p-0 min-w-0"
                                >
                                  <EllipsisVertical width={13} height={13} />
                                </Button>
                              </Dropdown.Trigger>
                              <Dropdown.Popover>
                                <Dropdown.Menu
                                  onAction={(key) => {
                                    if (key === 'delete') onDeleteDecision(block.id, d.id);
                                  }}
                                >
                                  <Dropdown.Item id="delete" variant="danger" textValue="Eliminar decisión">
                                    <TrashBin />
                                    <Label>Eliminar decisión</Label>
                                    <Description>Quitar de la minuta</Description>
                                  </Dropdown.Item>
                                </Dropdown.Menu>
                              </Dropdown.Popover>
                            </Dropdown>
                          )}
                        </div>
                      ))}
                      {(block.tasks || []).map((t, tIdx) => (
                        <div
                          key={t.id || tIdx}
                          className="px-2.5 py-1.5 rounded-md bg-accent/10 border-l-2 border-accent text-xs text-foreground flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>
                              <strong className="text-accent font-semibold">Tarea:</strong> {t.title}
                            </span>
                            {t.assignee && (
                              <Chip size="sm" variant="secondary" className="text-xs">
                                {t.assignee}
                              </Chip>
                            )}
                          </div>
                          {onDeleteTask && (
                            <Dropdown>
                              <Dropdown.Trigger>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  isIconOnly
                                  aria-label="Opciones de tarea"
                                  className="h-6 w-6 p-0 min-w-0"
                                >
                                  <EllipsisVertical width={13} height={13} />
                                </Button>
                              </Dropdown.Trigger>
                              <Dropdown.Popover>
                                <Dropdown.Menu
                                  onAction={(key) => {
                                    if (key === 'delete') onDeleteTask(block.id, t.id);
                                  }}
                                >
                                  <Dropdown.Item id="delete" variant="danger" textValue="Eliminar tarea">
                                    <TrashBin />
                                    <Label>Eliminar tarea</Label>
                                    <Description>Quitar de la minuta</Description>
                                  </Dropdown.Item>
                                </Dropdown.Menu>
                              </Dropdown.Popover>
                            </Dropdown>
                          )}
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
