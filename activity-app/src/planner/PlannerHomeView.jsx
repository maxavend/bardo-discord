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
import { SESSION_STATUS, getPointCounts } from './session-runner.js';
import { getPlannedSchedule } from './time-engine.js';
import { getHomeTopSection } from './planner-store.js';
import { getAllDiscordEntities } from './PlannerMemberPicker.jsx';
import {
  eventStatusLabel,
  formatAgreementsCountLabel,
  formatMeetingDuration,
  formatRecordingsCountLabel,
  formatTopicsCountLabel,
  liveStatusLabel,
} from './copy-tokens.js';

const DISCORD_PALETTES = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#00A8FC', '#ED4245', '#9B59B6', '#E67E22'];

function parseMentions(mentionsStr = '') {
  if (!mentionsStr) return [];
  const matches = mentionsStr.match(/@[^@\n\r\t,]+/g);
  if (matches && matches.length > 0) return matches.map((m) => m.trim()).filter(Boolean);
  return mentionsStr.split(/\s+/).map((m) => m.trim()).filter(Boolean);
}

function formatShortDate(isoDate) {
  const [year, month, day] = String(isoDate || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  try {
    const value = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
      .format(new Date(year, month - 1, day));
    return value.charAt(0).toUpperCase() + value.slice(1);
  } catch {
    return isoDate;
  }
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
    targetDuration = 0,
    host = '',
    mentions = '',
  } = plannerState || {};

  const status = sessionState?.status || SESSION_STATUS.IDLE;
  const isRunning = status === SESSION_STATUS.RUNNING;
  const isPaused = status === SESSION_STATUS.PAUSED;
  const isInterrupted = status === SESSION_STATUS.INTERRUPTED;
  const isCompleted = status === SESSION_STATUS.COMPLETED;
  const isLive = isRunning || isPaused;

  const topSection = getHomeTopSection({plannerState, sessionStatus: status, events});

  const schedule = getPlannedSchedule({startTime, targetDuration, blocks}, sessionState);
  const totalMinutes = schedule.plannedMinutes;
  const estimatedEnd = isLive ? schedule.estimatedEnd : schedule.plannedEnd;
  const formattedDate = formatShortDate(date);

  const participantsList = parseMentions(mentions);
  const { members } = getAllDiscordEntities();

  const agreements = sessionState?.decisions || [];
  const recordings = sessionState?.recordings || [];
  // Temas tratados come from the meeting run (live state), not from the agenda.
  const pointCounts = getPointCounts(plannerState, sessionState);

  const statusBadgeVariant = isRunning ? 'default' : isInterrupted ? 'destructive' : (isPaused || isCompleted) ? 'secondary' : 'outline';

  return (
    <div className="w-full max-w-2xl mx-auto pt-2 pb-28 flex flex-col gap-5 animate-in fade-in duration-200">

      {/* ── Reunión actual / Empty state ─────────────────────────────────────── */}
      {topSection === 'empty' && (
        <section className="flex flex-col gap-2">
          <Card className="p-5 flex flex-col items-center gap-3 rounded-2xl shadow-[0_1px_3px_0_oklch(0_0_0/0.04)] border-border/60 bg-card text-center">
            <div className="size-10 rounded-xl bg-muted border border-border/60 flex items-center justify-center">
              <Calendar className="size-4.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Todavía no hay reuniones</p>
              <p className="text-xs text-muted-foreground mt-0.5">Arma la agenda, guía la reunión y anota los acuerdos.</p>
            </div>
            <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
              {/* The header's "Nueva reunión" is this view's single primary action. */}
              <Button
                variant="secondary"
                size="sm"
                onClick={onNewCleanSession}
                className="text-xs font-semibold h-8 px-4 flex items-center justify-center gap-1.5"
              >
                <PlusIcon className="size-3.5" /> Nueva reunión
              </Button>
            </div>
          </Card>
        </section>
      )}

      {topSection === 'current' && (
        <section className="flex flex-col gap-2">
          <Card
            className={`relative p-4 sm:p-5 flex flex-col gap-3 rounded-2xl shadow-[0_1px_3px_0_oklch(0_0_0/0.04)] bg-card border transition-all duration-[var(--duration-quick,150ms)] ease-[var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))] hover:border-primary hover:bg-[color-mix(in_oklch,var(--card),var(--primary)_2%)] has-[.home-card-open:focus-visible]:outline-2 has-[.home-card-open:focus-visible]:outline-ring ${
              isLive
                ? 'border-primary/60 ring-1 ring-primary/20'
                : 'border-border/60'
            }`}
          >
            {/* Whole-card hit area: a real button, so the ⋮ menu is not nested inside another button. */}
            <button
              type="button"
              onClick={onViewAgenda}
              aria-label={`Abrir la reunión ${title}`}
              className="home-card-open absolute inset-0 rounded-2xl cursor-pointer focus-visible:outline-none"
            />

            {/* Status + fecha + horario */}
            <div className="pointer-events-none flex items-center justify-between gap-2 flex-wrap">
              {formattedDate && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3 shrink-0" />
                  {formattedDate}
                </span>
              )}
              {startTime && totalMinutes > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3 shrink-0" />
                  {startTime}–{estimatedEnd} · {formatMeetingDuration(totalMinutes)}
                </span>
              )}
              <span className="ml-auto">
                <Badge variant={statusBadgeVariant} className={`text-[10.5px] font-semibold ${statusBadgeVariant === 'outline' ? 'text-muted-foreground' : ''}`}>
                  {liveStatusLabel(status)}
                </Badge>
              </span>
            </div>

            {/* Título y acciones */}
            <div className="flex items-start justify-between gap-2">
              <div className="pointer-events-none flex-1 min-w-0">
                <h2 className="text-base font-bold tracking-tight text-foreground leading-tight">
                  {title}
                </h2>
                {description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">{description}</p>
                )}
              </div>
              {onDeleteSession && (
                <div className="relative z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Opciones de la reunión ${title}`}
                          className="text-muted-foreground hover:text-foreground shrink-0 -mr-1 -mt-1 rounded-full cursor-pointer"
                        >
                          <MoreVertical className="size-3.5" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => onDeleteSession(plannerState, 'archive')}
                          className="cursor-pointer"
                        >
                          <Archive className="size-4 text-muted-foreground" />
                          <span>Archivar reunión</span>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {/* Participantes */}
            {(participantsList.length > 0 || host) && (
              <div className="pointer-events-none flex items-center gap-1.5 flex-wrap">
                {participantsList.length > 0 && (
                  <div className="flex items-center -space-x-1.5">
                    {participantsList.slice(0, 6).map((tag, i) => {
                      const matched = members.find(
                        (m) => m.globalName.toLowerCase() === tag.toLowerCase().replace(/^@/, '') ||
                          m.tag.toLowerCase() === tag.toLowerCase() ||
                          `@${m.globalName.toLowerCase()}` === tag.toLowerCase()
                      );
                      const color = matched?.avatarColor || DISCORD_PALETTES[i % DISCORD_PALETTES.length];
                      const name = matched?.globalName || tag.replace(/^@/, '');
                      return (
                        <Avatar
                          key={tag}
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
                )}
                {participantsList.length > 6 && (
                  <span className="text-xs text-muted-foreground font-medium">+{participantsList.length - 6}</span>
                )}
                {host && <span className="text-xs text-muted-foreground">Facilita: {host}</span>}
              </div>
            )}

            {/* Métricas en vivo / al terminar */}
            {(isLive || isCompleted || isInterrupted) && (pointCounts.total > 0 || agreements.length > 0 || recordings.length > 0) && (
              <div className="pointer-events-none flex items-center gap-3 flex-wrap pt-1 border-t border-border/40">
                {pointCounts.total > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                    <strong className="text-foreground">{pointCounts.done}</strong> de {formatTopicsCountLabel(pointCounts.total)} tratados
                  </span>
                )}
                {agreements.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="size-3.5 text-primary shrink-0" />
                    <strong className="text-foreground">{formatAgreementsCountLabel(agreements.length)}</strong>
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
        </section>
      )}

      {/* ── Lista de reuniones del canal ─────────────────────────────────── */}
      {(events.length > 0 || archivedEvents.length > 0) && (
        <section className="library-section recent-section">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-muted/60 border border-border/40 text-xs">
              <button
                type="button"
                onClick={() => setEventsTab('active')}
                aria-pressed={eventsTab === 'active'}
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
                aria-pressed={eventsTab === 'archived'}
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
              {eventsTab === 'active' ? 'Toca una reunión para abrirla' : 'Puedes restaurarlas o eliminarlas'}
            </span>
          </div>

          {eventsTab === 'active' ? (
            events.length > 0 ? (
              <div className="docs-list">
                {events.map((event) => {
                  const eventMinutes = getPlannedSchedule(event).plannedMinutes;
                  const eventDate = formatShortDate(event.date) || 'Fecha por confirmar';
                  const eventStatus = eventStatusLabel(event.eventStatus);
                  const blocksCount = event.blocks?.length || 0;
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
                        aria-label={`Abrir la reunión ${event.title}`}
                      >
                        <strong>{event.title}</strong>
                        <span>{eventStatus} · {eventDate} · {event.startTime} · {blocksCount} {blocksCount === 1 ? 'bloque' : 'bloques'} · {formatMeetingDuration(eventMinutes)}</span>
                      </button>
                      {onDeleteSession && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Opciones de la reunión ${event.title}`}
                                className="text-muted-foreground hover:text-foreground shrink-0 rounded-full cursor-pointer"
                              >
                                <MoreVertical className="size-3.5" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() => onDeleteSession(event, 'archive')}
                                className="cursor-pointer"
                              >
                                <Archive className="size-4 text-muted-foreground" />
                                <span>Archivar reunión</span>
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border/60">
                No hay reuniones programadas en este canal.
              </div>
            )
          ) : (
            archivedEvents.length > 0 ? (
              <div className="docs-list">
                {archivedEvents.map((event) => {
                  const eventMinutes = getPlannedSchedule(event).plannedMinutes;
                  const eventDate = formatShortDate(event.date) || 'Fecha por confirmar';
                  const blocksCount = event.blocks?.length || 0;
                  return (
                    <article className="doc-row opacity-85" key={event.eventId || event.id}>
                      <span className="doc-symbol">
                        <Archive className="size-4.5 text-muted-foreground" />
                      </span>
                      <button
                        className="doc-row-main"
                        type="button"
                        onClick={() => onSelectEvent?.(event)}
                        aria-label={`Abrir la reunión archivada ${event.title}`}
                      >
                        <strong>{event.title}</strong>
                        <span>Archivada · {eventDate} · {blocksCount} {blocksCount === 1 ? 'bloque' : 'bloques'} · {formatMeetingDuration(eventMinutes)}</span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Opciones de la reunión archivada ${event.title}`}
                              className="text-muted-foreground hover:text-foreground shrink-0 rounded-full cursor-pointer"
                            >
                              <MoreVertical className="size-3.5" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() => onRestoreSession?.(event)}
                              className="cursor-pointer"
                            >
                              <RotateCcw className="size-4 text-muted-foreground" />
                              <span>Restaurar reunión</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onPermanentDeleteSession?.(event)}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                            >
                              <TrashIcon className="size-4" />
                              <span>Eliminar definitivamente</span>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
