import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Plus,
  Clock,
  Calendar,
  CheckCircle2,
  Mic,
  ChevronRight,
} from 'lucide-react';
import { SESSION_STATUS, recalculateEstimatedEndTime } from './session-runner.js';
import { getAllDiscordEntities, parseMentionsToArray, discordColorFor } from './PlannerMemberPicker.jsx';
import { pluralize, formatTopicsCountLabel, formatRecordingsCountLabel } from './copy-tokens.js';

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
  events = [],
  selectedEventId = null,
  onSelectEvent,
}) {
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

  const participantsList = parseMentionsToArray(mentions);
  const { members } = getAllDiscordEntities();

  const decisions = sessionState?.decisions || [];
  const recordings = sessionState?.recordings || [];
  const completedPoints = (blocks || []).flatMap((b) =>
    (b.subpoints || []).filter((p) => p.status === 'done')
  ).length;
  const totalPoints = (blocks || []).flatMap((b) => b.subpoints || []).length;

  // ─── Status badge ─────────────────────────────────────────────────────────
  const StatusBadge = () => {
    if (isRunning) return <Badge variant="default" className="text-xs font-semibold">En curso</Badge>;
    if (isPaused) return <Badge variant="secondary" className="text-xs font-semibold">Pausada</Badge>;
    if (isInterrupted) return <Badge variant="destructive" className="text-xs font-semibold">Interrumpida</Badge>;
    if (isCompleted) return <Badge variant="secondary" className="text-xs font-semibold">Finalizada</Badge>;
    return <Badge variant="outline" className="text-xs font-semibold text-muted-foreground">Pendiente</Badge>;
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-0 pt-2 pb-28 flex flex-col gap-5 animate-in fade-in duration-200">

      {/* ── Reunión actual / Empty state ─────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        {isEmpty && isIdle ? (
          /* Empty state */
          <Card className="p-5 flex flex-col items-center gap-3 rounded-2xl shadow-2xs border-border bg-card text-center">
            <div className="size-10 rounded-xl bg-muted border border-border flex items-center justify-center">
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
                <Plus className="size-3.5" /> Nueva reunión
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
            className={`p-4 sm:p-5 flex flex-col gap-3 rounded-2xl cursor-pointer shadow-2xs focus-visible:outline-2 focus-visible:outline-ring bg-card border transition-all duration-[var(--duration-quick,150ms)] ease-[var(--ease-smooth-out,cubic-bezier(0.22,1,0.36,1))] hover:border-primary hover:bg-[color-mix(in_oklch,var(--card),var(--primary)_2%)] ${
              isLive
                ? 'border-primary/60 ring-1 ring-primary/20'
                : 'border-border'
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

            {/* Título */}
            <div>
              <h2 className="text-base font-bold tracking-tight text-foreground leading-tight">
                {title}
              </h2>
              {description && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">{description}</p>
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
                    const color = matched?.avatarColor || discordColorFor(tag, i);
                    const name = matched?.globalName || tag.replace(/^@/, '');
                    return (
                      <Avatar
                        key={i}
                        size="sm"
                        className="size-5 text-xs font-bold border-2 border-card shadow-2xs shrink-0"
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
      {events.length > 0 && (
        <section className="library-section recent-section">
          <div className="flex items-center justify-between gap-3">
            <h3 className="section-title mb-0">Reuniones ({events.length})</h3>
            <span className="text-xs text-muted-foreground self-center">Próximas y recientes</span>
          </div>
          <div className="docs-list">
            {events.map((event) => {
              const eventMinutes = (event.blocks || []).reduce((sum, block) => sum + (block.durationMinutes || 0), 0);
              const eventDate = event.date
                ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${event.date}T12:00:00`))
                : 'Fecha por confirmar';
              const eventStatus = event.eventStatus === 'completed'
                ? 'Finalizada'
                : event.eventStatus === 'in_progress'
                  ? 'En curso'
                  : event.eventStatus === 'interrupted'
                    ? 'Interrumpida'
                    : 'Programada';
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
                    aria-label={`Abrir reunión ${event.title}`}
                  >
                    <strong>{event.title}</strong>
                    <span>{eventStatus} · {eventDate} · {event.startTime} · {event.blocks?.length || 0} bloques · {eventMinutes >= 60 && eventMinutes % 60 === 0 ? `${eventMinutes / 60} h` : `${eventMinutes} min`}</span>
                  </button>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </article>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
