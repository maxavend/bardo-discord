import {
  Button,
  Chip,
  Card,
  Checkbox,
  Separator,
} from '@heroui/react';
import {
  Pencil,
  Copy,
  FileText,
  Plus,
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
}) {
  const {
    title,
    description,
    startTime = '17:45',
    totalCalculatedDuration = 180,
    mentions = '',
    blocks = [],
    liveActiveBlockId,
  } = state;

  const totalPoints = blocks.reduce((acc, b) => acc + (b.subpoints || []).length, 0);
  const completedPoints = blocks.reduce(
    (acc, b) => acc + (b.subpoints || []).filter((p) => p.status === 'done').length,
    0
  );

  let cursorMinutes = clockToMinutes(startTime);

  return (
    <div className="flex flex-col gap-5 w-full max-w-4xl mx-auto pb-12">
      {/* 1. Hero Card - Compact SaaS density */}
      <Card className="p-4 sm:p-5 bg-surface border border-border rounded-xl shadow-none">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{title}</h1>
              <Chip size="sm" variant="soft" color="danger" className="font-semibold text-[11px] animate-pulse">
                ● En Vivo
              </Chip>
            </div>
            <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-2xl whitespace-pre-line mb-3">
              {description}
            </p>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
              <Chip size="sm" variant="secondary" className="font-medium">
                📅 {state.date || 'Miércoles 19 Ago 2026'}
              </Chip>
              <Chip size="sm" variant="secondary" className="font-mono">
                ⏰ {startTime} ({formatSmartDuration(totalCalculatedDuration)})
              </Chip>
              <Chip size="sm" variant="secondary" className="font-medium">
                👤 Conduce: <strong className="text-foreground ml-1">{state.host || 'Paula Molina'}</strong>
              </Chip>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onPress={onCopyAnnouncement}
              className="font-medium text-xs h-8"
            >
              <Copy width={13} height={13} /> Copiar Anuncio
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={onOpenMinutes}
              className="font-medium text-xs h-8"
            >
              <FileText width={13} height={13} /> Minuta
            </Button>
            <Button
              variant="primary"
              size="sm"
              onPress={onOpenEditor}
              className="font-medium text-xs h-8"
            >
              <Pencil width={13} height={13} /> Editar
            </Button>
          </div>
        </div>
      </Card>

      {/* 2. Convocados Strip */}
      {mentions && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg bg-surface-secondary/40 border border-border/60 text-xs">
          <span className="font-bold text-muted uppercase tracking-wider text-[10px]">Convocados:</span>
          {mentions.split(' ').filter(Boolean).map((tag, i) => (
            <Chip key={i} size="sm" variant="primary" className="text-xs">
              {tag}
            </Chip>
          ))}
        </div>
      )}

      {/* 3. Summary Metrics Bar */}
      <div className="flex items-center gap-3 px-1 text-xs text-muted font-medium">
        <span>
          <b className="text-foreground font-semibold">{blocks.length}</b> bloques
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

      {/* 4. Calendly Timeline Rail & Agenda Blocks */}
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

            const isActiveLive = block.id === liveActiveBlockId || (liveActiveBlockId === undefined && bIdx === 1);

            return (
              <div key={block.id || bIdx} className="grid grid-cols-1 md:grid-cols-[80px_1fr] gap-2.5 md:gap-3.5 items-start">
                {/* Schedule Clock Column */}
                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start pt-1 font-mono select-none">
                  <span className="text-xs sm:text-sm font-bold text-foreground">{blockStart}</span>
                  <span className="text-[11px] text-muted">{blockEnd}</span>
                  <span className="text-[10px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded mt-0.5">
                    {blockDur}m
                  </span>
                </div>

                {/* Block Card */}
                <Card
                  className={`p-4 rounded-xl border transition-all shadow-none ${
                    isActiveLive
                      ? 'border-accent bg-surface ring-1 ring-accent/30'
                      : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-2.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                        {block.title}
                      </h3>
                      {isActiveLive && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/15 px-2 py-0.5 rounded-full animate-pulse">
                          ● En curso
                        </span>
                      )}
                      <span className="text-xs text-muted font-medium">
                        {block.durationMinutes} min
                        {block.isAutoCalculated && (
                          <span className="text-accent text-[11px] ml-1 font-normal">(auto)</span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => onOpenCapture('decision', block.id)}
                        className="text-xs h-7 px-2.5"
                        aria-label={`Registrar decisión en ${block.title}`}
                      >
                        <Plus width={12} height={12} /> Decisión
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onPress={() => onOpenCapture('task', block.id)}
                        className="text-xs h-7 px-2.5"
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
                            className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg bg-surface-secondary/40 hover:bg-surface-secondary/70 border border-border/40 transition-colors"
                          >
                            <label className="flex items-center gap-2.5 flex-1 cursor-pointer select-none">
                              <Checkbox
                                isSelected={isDone}
                                onChange={(checked) => onToggleSubpointStatus(block.id, p.id, checked)}
                                size="sm"
                                aria-label={`Marcar ${p.title} como revisado`}
                                className="accent-accent"
                              />
                              <span
                                className={`text-xs transition-all ${
                                  isDone ? 'line-through text-muted' : 'text-foreground font-medium'
                                }`}
                              >
                                {p.title || '(Sin título)'}
                              </span>
                            </label>

                            <div className="flex items-center gap-2 text-xs text-muted shrink-0 font-mono">
                              {p.durationMinutes > 0 && (
                                <span className="bg-surface px-1.5 py-0.5 rounded border border-border/60 text-[10px]">
                                  {p.durationMinutes}m
                                </span>
                              )}
                              {p.presenter && (
                                <span className="text-muted text-[11px]">
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
                    <div className="flex flex-col gap-1.5 mt-2.5 pt-2.5 border-t border-border/40">
                      {(block.decisions || []).map((d, dIdx) => (
                        <div
                          key={d.id || dIdx}
                          className="px-2.5 py-1.5 rounded-md bg-success/10 border-l-2 border-success text-xs text-foreground"
                        >
                          <strong className="text-success font-semibold">Decisión:</strong> {d.content}
                        </div>
                      ))}
                      {(block.tasks || []).map((t, tIdx) => (
                        <div
                          key={t.id || tIdx}
                          className="px-2.5 py-1.5 rounded-md bg-accent/10 border-l-2 border-accent text-xs text-foreground flex items-center justify-between gap-2"
                        >
                          <span>
                            <strong className="text-accent font-semibold">Tarea:</strong> {t.title}
                          </span>
                          {t.assignee && (
                            <span className="text-muted font-medium bg-surface/60 px-1.5 py-0.5 rounded text-[10px]">
                              {t.assignee}
                            </span>
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

