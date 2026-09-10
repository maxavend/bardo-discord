import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Clock,
  Calendar,
  CheckCircle2,
  Mic,
  ChevronRight,
  Archive,
  MoreVertical,
  RotateCcw,
} from 'lucide-react';
import { PlusIcon, DeleteIcon as TrashIcon } from '@/components/ui/animated-icons';
import { SESSION_STATUS, recalculateEstimatedEndTime } from './session-runner.js';
import { getAllDiscordEntities } from './PlannerMemberPicker.jsx';
import { pluralize, formatTopicsCountLabel, formatRecordingsCountLabel } from './copy-tokens.js';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function parseMentions(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) return matches.map((m) => m.trim()).filter(Boolean);
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

function isDefaultEmptySession(plannerState) {
  if (!plannerState) return true;
  const { title, blocks = [] } = plannerState;
  const hasDefaultTitle = title === 'Nueva sesión de trabajo' || title === 'Nueva reunión' || !title;
  const hasOnlyDefaultBlock = blocks.length === 1 && blocks[0]?.id === 'b-default-1';
  return hasDefaultTitle && hasOnlyDefaultBlock;
}

export function PlannerHomeView({
  plannerState,
  sessionState,
  onViewAgenda,
  onNewCleanSession,
  onDeleteSession,
  events = [],
  archivedEvents = [],
  selectedEventId = null,
  onSelectEvent,
  onRestoreSession,
  onPermanentDeleteSession,
}) {
  const [eventsTab, setEventsTab] = useState('active');
  const {
    title = 'Reunión sin título',
    description = '',
    date = '',
    startTime = '10:00',
    blocks = [],
    host = '',
    mentions = '',
  } = plannerState || {};

  const status = sessionState?.status || SESSION_STATUS.IDLE;
  const isIdle = status === SESSION_STATUS.IDLE;
  const isRunning = status === SESSION_STATUS.RUNNING;
  const isPaused = status === SESSION_STATUS.PAUSED;
  const isInterrupted = status === SESSION_STATUS.INTERRUPTED;
  const isCompleted = status === SESSION_STATUS.COMPLETED;
  const isLive = isRunning || isPaused;

  const isEmpty = isDefaultEmptySession(plannerState);

  const totalMinutes = (blocks || []).reduce((acc, b) => acc + (b.durationMinutes || 0), 0);
  const estimatedEnd = recalculateEstimatedEndTime(startTime, totalMinutes);

  let formattedDate = date;
  try {
    const [year, month, day] = (date || '').split('-').map(Number);
    if (year && month && day) {
      const d = new Date(year, month - 1, day);
      const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(d);
      const monthName = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(d);
      formattedDate = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day} ${monthName}`;
    }
  } catch {
    formattedDate = date;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const formattedDuration = hours > 0 ? (mins > 0 ? `${hours} h ${mins} min` : `${hours} h`) : `${mins} min`;

  const participantsList = parseMentions(mentions);
  const { members } = getAllDiscordEntities();

  const decisions = sessionState?.decisions || [];
  const recordings = sessionState?.recordings || [];
  const completedPoints = (blocks || []).flatMap((b) =>
    (b.subpoints || []).filter((p) => p.status === 'done')
  ).length;
  const totalPoints = (blocks || []).flatMap((b) => b.subpoints || []).length;

  // ─── Status badge ─────────────────────────────────────────────────────────
  const StatusBadge = () => {
    if (isRunning) return <Badge variant="default" className="text-[10.5px] font-semibold">En curso</Badge>;
    if (isPaused) return <Badge variant="secondary" className="text-[10.5px] font-semibold">Pausada</Badge>;
    if (isInterrupted) return <Badge variant="destructive" className="text-[10.5px] font-semibold">Interrumpida</Badge>;
    if (isCompleted) return <Badge variant="secondary" className="text-[10.5px] font-semibold">Finalizada</Badge>;
    return <Badge variant="outline" className="text-[10.5px] font-semibold text-muted-foreground">Pendiente</Badge>;
  };

  return (
    <div className="w-full max-w-2xl mx-auto pt-2 pb-28 flex flex-col gap-5 animate-in fade-in duration-200">

      {/* ── Reunión actual / Empty state ─────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        {isEmpty && isIdle ? (
          /* Empty state */
          <Card className="p-5 flex flex-col items-center gap-3 rounded-2xl shadow-[0_1px_3px_0_oklch(0_0_0/0.04)] border-border/60 bg-card text-center">
            <div className="size-10 rounded-xl bg-muted border border-border/60 flex items-center justify-center">
              <Calendar className="size-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Todavía no hay reuniones</p>
              <p className="text-xs text-muted-foreground mt-0.5">Organiza agendas, conduce reuniones y registra acuerdos.</p>
            </div>
            <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
              <Button
                variant="default"
                size="sm"
                onClick={onNewCleanSession}
                className="text-xs font-semibold h-8 px-4 flex items-center justify-center gap-1.5"
              >
                <PlusIcon className="size-3.5" /> Nueva reunión
              </Button>
            </div>
          </Card>
        ) : (
          /* Session card */
          <Card
            role="button"
            tabIndex={0}
            onClick={onViewAgenda}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onViewAgenda?.();
              }
            }}
            className={`p-4 sm:p-5 flex flex-col gap-3 rounded-2xl cursor-pointer shadow-[0_1px_3px_0_oklch(0_0_0/0.04)] focus-visible:outline-2 focus-visible:outline-ring bg-card border transition-all duration-[var(--duration-quick,150ms)] ease-[var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))] hover:border-primary hover:bg-[color-mix(in_oklch,var(--card),var(--primary)_2%)] ${
              isLive
                ? 'border-primary/60 ring-1 ring-primary/20'
                : 'border-border/60'
            }`}
          >
            {/* Status + fecha + horario */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {formattedDate && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3 shrink-0" />
                  {formattedDate}
                </span>
              )}
              {startTime && totalMinutes > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3 shrink-0" />
                  {startTime}–{estimatedEnd} · {formattedDuration}
                </span>
              )}
              <span className="ml-auto"><StatusBadge /></span>
            </div>

            {/* Título y acciones */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold tracking-tight text-foreground leading-tight">
                  {title}
                </h2>
                {description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">{description}</p>
                )}
              </div>
              {onDeleteSession && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Opciones de la reunión ${title}`}
                          className="text-muted-foreground hover:text-foreground shrink-0 -mr-1 -mt-1 rounded-full cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="size-3.5" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(plannerState, 'archive');
                          }}
                          className="cursor-pointer"
                        >
                          <Archive className="size-4 text-muted-foreground" />
                          <span>Archivar reunión</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(plannerState, 'delete');
                          }}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                        >
                          <TrashIcon className="size-4" />
                          <span>Eliminar reunión</span>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {/* Participantes */}
            {participantsList.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center -space-x-1.5">
                  {(host ? [host, ...participantsList] : participantsList).slice(0, 6).map((tag, i) => {
                    const matched = members.find(
                      (m) => m.globalName.toLowerCase() === tag.toLowerCase().replace(/^@/, '') ||
                        m.tag.toLowerCase() === tag.toLowerCase() ||
                        `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                    );
                    const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                    const name = matched?.globalName || tag.replace(/^@/, '');
                    return (
                      <Avatar
                        key={i}
                        size="sm"
                        className="size-5 text-[8.5px] font-bold border-2 border-card shadow-2xs shrink-0"
                        style={{ backgroundColor: `${color}30`, color }}
                      >
                        <AvatarFallback style={{ backgroundColor: `${color}30`, color }}>
                          {name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    );
                  })}
                </div>
                {participantsList.length > 5 && (
                  <span className="text-xs text-muted-foreground font-medium">+{participantsList.length - 5}</span>
                )}
                {host && <span className="text-xs text-muted-foreground">Organiza {host}</span>}
              </div>
            )}

            {/* Métricas en vivo / post-sesión */}
            {(isLive || isCompleted || isInterrupted) && (totalPoints > 0 || decisions.length > 0 || recordings.length > 0) && (
              <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-border/40">
                {totalPoints > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                    <strong className="text-foreground">{completedPoints}</strong> de {formatTopicsCountLabel(totalPoints)}
                  </span>
                )}
                {decisions.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="size-3.5 text-primary shrink-0" />
                    <strong className="text-foreground">{pluralize(decisions.length, 'decisión', 'decisiones')}</strong>
                  </span>
                )}
                {recordings.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mic className="size-3.5 text-primary shrink-0" />
                    <strong className="text-foreground">{formatRecordingsCountLabel(recordings.length)}</strong>
                  </span>
                )}
              </div>
            )}

          </Card>
        )}
      </section>

      {/* ── Event index / stress fixture ─────────────────────────────────── */}
      {(events.length > 0 || archivedEvents.length > 0) && (
        <section className="library-section recent-section">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-muted/60 border border-border/40 text-xs">
              <button
                type="button"
                onClick={() => setEventsTab('active')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  eventsTab === 'active'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Reuniones ({events.length})
              </button>
              <button
                type="button"
                onClick={() => setEventsTab('archived')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  eventsTab === 'archived'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Archivadas ({archivedEvents.length})
              </button>
            </div>
            <span className="text-[11px] text-muted-foreground self-center">
              {eventsTab === 'active' ? 'Explora tus agendas' : 'Reuniones archivadas'}
            </span>
          </div>

          {eventsTab === 'active' ? (
            events.length > 0 ? (
              <div className="docs-list">
                {events.map((event) => {
                  const eventMinutes = (event.blocks || []).reduce((sum, block) => sum + (block.durationMinutes || 0), 0);
                  const eventDate = event.date
                    ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${event.date}T12:00:00`))
                    : 'Fecha por confirmar';
                  const eventStatus = event.eventStatus === 'completed'
                    ? 'Completado'
                    : event.eventStatus === 'in_progress'
                      ? 'En curso'
                      : 'Programado';
                  const isSelected = selectedEventId === event.eventId;
                  return (
                    <article className={`doc-row ${isSelected ? 'event-row-selected' : ''}`} key={event.eventId}>
                      <span className="doc-symbol">
                        {event.eventStatus === 'completed' ? <CheckCircle2 className="size-4.5 text-primary" /> : <Calendar className="size-4.5" />}
                      </span>
                      <button
                        className="doc-row-main"
                        type="button"
                        onClick={() => onSelectEvent?.(event)}
                        aria-label={`Abrir evento ${event.title}`}
                      >
                        <strong>{event.title}</strong>
                        <span>{eventStatus} · {eventDate} · {event.startTime} · {event.blocks?.length || 0} bloques · {eventMinutes >= 60 && eventMinutes % 60 === 0 ? `${eventMinutes / 60} h` : `${eventMinutes} min`}</span>
                      </button>
                      {onDeleteSession && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Opciones del evento ${event.title}`}
                                  className="text-muted-foreground hover:text-foreground shrink-0 rounded-full cursor-pointer"
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="size-3.5" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuGroup>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSession(event, 'archive');
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Archive className="size-4 text-muted-foreground" />
                                  <span>Archivar reunión</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSession(event, 'delete');
                                  }}
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                                >
                                  <TrashIcon className="size-4" />
                                  <span>Eliminar reunión</span>
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border/60">
                No hay reuniones activas programadas.
              </div>
            )
          ) : (
            archivedEvents.length > 0 ? (
              <div className="docs-list">
                {archivedEvents.map((event) => {
                  const eventMinutes = (event.blocks || []).reduce((sum, block) => sum + (block.durationMinutes || 0), 0);
                  const eventDate = event.date
                    ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${event.date}T12:00:00`))
                    : 'Fecha por confirmar';
                  return (
                    <article className="doc-row opacity-85" key={event.eventId || event.id}>
                      <span className="doc-symbol">
                        <Archive className="size-4.5 text-muted-foreground" />
                      </span>
                      <button
                        className="doc-row-main"
                        type="button"
                        onClick={() => onSelectEvent?.(event)}
                        aria-label={`Abrir reunión archivada ${event.title}`}
                      >
                        <strong>{event.title}</strong>
                        <span>Archivada · {eventDate} · {event.blocks?.length || 0} bloques · {eventMinutes >= 60 && eventMinutes % 60 === 0 ? `${eventMinutes / 60} h` : `${eventMinutes} min`}</span>
                      </button>
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Opciones de reunión archivada ${event.title}`}
                                className="text-muted-foreground hover:text-foreground shrink-0 rounded-full cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="size-3.5" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRestoreSession?.(event);
                                }}
                                className="cursor-pointer"
                              >
                                <RotateCcw className="size-4 text-muted-foreground" />
                                <span>Restaurar reunión</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPermanentDeleteSession?.(event);
                                }}
                                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                              >
                                <TrashIcon className="size-4" />
                                <span>Eliminar definitivamente</span>
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border/60">
                No hay reuniones archivadas.
              </div>
            )
          )}
        </section>
      )}

    </div>
  );
}
